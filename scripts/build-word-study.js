#!/usr/bin/env node
// scripts/build-word-study.js — Stage 4 of the Rhēma lexicon: the scholarly
// word study, with every receipt machine-verified.
//
// Stages 1–3 measure HOW the Bible's English renders each Greek word. That
// can't see a sense the English hides (σάρξ "sinful human nature" in Paul is
// still "flesh" in most versions). This stage asks Claude to write the entry a
// lexicographer would — real semantic senses, author-by-author usage, why
// translations differ, and the word's history — from an evidence pack that
// includes the actual Greek verses. Then, deterministically:
//
//   • every verse a sense or author note cites is checked against the Greek
//     text (Byzantine RP2018, SBLGNT, or the Septuagint): the word must
//     actually occur there, or the citation is dropped;
//   • a sense left with no verified verse is dropped;
//   • every historical citation must be found verbatim in the LSJ, Moulton–
//     Milligan or Abbott-Smith text we supplied, or it is dropped;
//   • an author note survives only for an author who really uses the word.
//
// Nothing here runs in the app: results merge into data/deep-lexicon shards as
// `entry.study`, which rhema-word-study.js shows when present.
//
// Cost (Message Batches API = 50% off; claude-opus-5-5 at $4 / $20 per MTok):
// roughly 6K input + 3K output (incl. thinking) tokens per word, so about
//   effort high   ≈ $0.04 per word  → ≈ $220 for all 5,523 words
//   effort medium ≈ $0.025 per word → ≈ $140
//   --min-count 2 skips single-occurrence words (≈ a quarter of the bill).
// Always run --sample first and read the results.
//
// Usage:
//   export ANTHROPIC_API_KEY=sk-ant-...      (or `ant auth login`)
//   cd scripts && npm install && cd ..
//   node scripts/build-word-study.js --dry-run --sample 4561      # print the evidence pack (free)
//   node scripts/build-word-study.js --sample 4561,26,3056,4151    # direct API, a few words
//   node scripts/build-word-study.js --min-count 2                # full run via Batches (resumable)
//   node scripts/build-word-study.js --merge-only                 # re-verify + merge saved results
//
// Flags: --model <id> (default claude-opus-5-5) · --effort low|medium|high|xhigh|max (default high)
//        --min-count <n> · --sample <list> · --limit <n> · --dry-run · --merge-only
//
// Writing entries in a Claude Code session instead of through the API
// (no API key; the same verifier applies):
//   --export --top 300 --batch 20     writes evidence packs for the most-used
//                                     content words to data/deep-lexicon/study/work/
//   --check <file.json>               verifies a written batch ([{s, study}]) and
//                                     reports every citation that would be dropped
//   --import <file.json> --as <label> appends a checked batch to results.jsonl
//   then --merge-only                 verifies again and merges into the shards
//
// After merging, bump DEEP_LEXICON_VERSION in app.js so devices fetch the new
// shards (the service worker keeps the old ones until the version changes).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DEEP_DIR = path.join(ROOT, 'data', 'deep-lexicon');
const OUT_DIR = path.join(DEEP_DIR, 'study');
const RESULTS_FILE = path.join(OUT_DIR, 'results.jsonl');
const STATE_FILE = path.join(OUT_DIR, 'state.json');
const STUDY_VERSION = 1;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null;
};
const MODEL = typeof flag('model') === 'string' ? flag('model') : 'claude-opus-5-5';
const EFFORT = typeof flag('effort') === 'string' ? flag('effort') : 'high';
const MIN_COUNT = parseInt(flag('min-count'), 10) || 0;
const SAMPLE = typeof flag('sample') === 'string' ? flag('sample').split(',').map(Number).filter(Boolean) : null;
const LIMIT = parseInt(flag('limit'), 10) || 0;
const DRY_RUN = Boolean(flag('dry-run'));
const MERGE_ONLY = Boolean(flag('merge-only'));
const EXPORT = Boolean(flag('export'));
const TOP = parseInt(flag('top'), 10) || 300;
const OFFSET = parseInt(flag('offset'), 10) || 0;
const BATCH = parseInt(flag('batch'), 10) || 20;
const CHECK_FILE = typeof flag('check') === 'string' ? flag('check') : null;
const IMPORT_FILE = typeof flag('import') === 'string' ? flag('import') : null;
const IMPORT_AS = typeof flag('as') === 'string' ? flag('as') : 'claude-code-session';
const WORK_DIR = path.join(OUT_DIR, 'work');
// Tiers for the long tail: full studies for frequent words, compact ones
// (smaller packs, every occurrence listed) for words used 2-9 times.
const TIER = flag('tier') === 'compact' ? 'compact' : 'full';
const MAX_COUNT = parseInt(flag('max-count'), 10) || Infinity;
const ALL_POS = Boolean(flag('all-pos'));
const PREFIX = typeof flag('prefix') === 'string' ? flag('prefix') : 'batch';

// ── Data ────────────────────────────────────────────────────────────────────
function loadWindowFiles(files) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  return sandbox.window;
}
function loadShards() {
  const index = JSON.parse(fs.readFileSync(path.join(DEEP_DIR, 'index.json'), 'utf8'));
  const entries = new Map();
  for (const shard of index.shards) {
    const data = JSON.parse(fs.readFileSync(path.join(DEEP_DIR, shard.file), 'utf8'));
    for (const [s, e] of Object.entries(data)) entries.set(Number(s), e);
  }
  return { index, entries };
}

const AUTHORS = {
  Matthew: ['MAT'], Mark: ['MAR'], 'Luke–Acts': ['LUK', 'ACT'], John: ['JOH', '1JO', '2JO', '3JO', 'REV'],
  Paul: ['ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM'],
  Hebrews: ['HEB'], James: ['JAM'], Peter: ['1PE', '2PE'], Jude: ['JUD'],
};

const plain = (html, max) => {
  const t = String(html || '').replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max) + '…' : t;
};

// ── Verification ────────────────────────────────────────────────────────────
// Imported from the app's own alignment module so "the same word" means the
// same thing in both places (e.g. εἶπον G2036 counts as λέγω G3004).
const Align = require(path.join(ROOT, 'rhema-align.js'));

const SUPPLETIVE = [[3004, 2036, 2046, 4483], [2068, 5315], [757, 756], [681, 680]];
const SUPPLETIVE_KEY = new Map();
for (const g of SUPPLETIVE) for (const x of g) SUPPLETIVE_KEY.set(String(x), String(g[0]));
const sameLexeme = (s) => SUPPLETIVE_KEY.get(String(s)) || String(s);

// Common alternative book codes (USFM/SBL) → the app's codes.
const BOOK_ALIASES = {
  MRK: 'MAR', MK: 'MAR', JHN: 'JOH', JN: 'JOH', JAS: 'JAM', JMS: 'JAM', JDE: 'JUD', PHL: 'PHP', PHI: 'PHP',
  '1JN': '1JO', '2JN': '2JO', '3JN': '3JO', MT: 'MAT', LK: 'LUK', RO: 'ROM', RV: 'REV', PHLM: 'PHM',
};
function canonRef(ref) {
  const m = String(ref || '').trim().match(/^([1-3]?[A-Z]{2,4}) (\d+):(\d+)$/);
  if (!m) return String(ref || '').trim();
  return `${BOOK_ALIASES[m[1]] || m[1]} ${m[2]}:${m[3]}`;
}

function makeVerifier(W) {
  const texts = [W.RhemaNT?.text || {}, W.RhemaCriticalNT?.text || {}, W.RhemaLXX?.text || {}];
  const lemmaIdx = Align.buildLemmaIndex(W.RhemaLexicon || {});
  function verseHas(ref, strongs) {
    const m = canonRef(ref).match(/^([1-3]?[A-Z]{2,3}) (\d+):(\d+)$/);
    if (!m) return false;
    // Strict: the cited verse must contain this exact word. Only suppletive
    // verbs (one verb, several stems/numbers) count as the same word — not the
    // looser groups the interlinear uses (μόνος/μόνον, μακρός/μακράν, ...).
    const target = sameLexeme(strongs);
    // …or the word spelled exactly as its dictionary form (indeclinables like
    // μόνον, μακράν, which the texts sometimes file under μόνος, μακρός).
    const lemma = Align.lemmaKey((W.RhemaLexicon || {})[strongs]?.lemma || '');
    for (const T of texts) {
      const words = ((T[m[1]] || {})[m[2]] || {})[m[3]];
      if (!words) continue;
      for (const w of words) {
        const s = w[1] || (w[3] ? Align.strongsForLemma(lemmaIdx, w[3]) : '');
        if (s && sameLexeme(s) === target) return true;
        if (lemma.length > 2 && Align.lemmaKey(w[0]) === lemma) return true;
      }
    }
    return false;
  }
  return { verseHas };
}

const norm = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/[\s.,;:·()[\]'’"]+/g, ' ').trim();

function verifyStudy(raw, entry, sources, verifier) {
  const stats = { refsChecked: 0, refsDropped: 0, sensesDropped: 0, notesDropped: 0, backgroundDropped: 0 };
  const keepRefs = (refs) => (refs || []).map(canonRef).filter((r) => {
    stats.refsChecked++;
    const ok = verifier.verseHas(r, entry.s);
    if (!ok) stats.refsDropped++;
    return ok;
  });
  const senses = [];
  for (const s of raw.senses || []) {
    const refs = keepRefs(s.refs);
    if (!refs.length && entry.count > 0) { stats.sensesDropped++; continue; }
    senses.push({ label: s.label, definition: s.definition, refs, note: s.note || null });
  }
  const authorNotes = [];
  for (const a of raw.authorNotes || []) {
    const books = AUTHORS[a.author] || [];
    const uses = books.reduce((n, b) => n + ((entry.byBook || {})[b] || 0), 0);
    if (!uses) { stats.notesDropped++; continue; }
    authorNotes.push({ author: a.author, note: a.note, refs: keepRefs(a.refs) });
  }
  const haystack = norm(sources);
  const background = [];
  for (const b of raw.background || []) {
    const cite = norm(b.citation);
    // "ib. 938" / "Id. Grg." only make sense next to the reference they
    // abbreviate, so on their own they are not a usable receipt.
    if (cite.length < 4 || !haystack.includes(cite) || /^(ib|ibid|id)\b/i.test(String(b.citation || '').trim()) || /^[IVXLC]+\.\s*\d/.test(String(b.citation || '').trim())) { stats.backgroundDropped++; continue; }
    background.push({ period: b.period, note: b.note, citation: b.citation });
  }
  return {
    summary: raw.summary,
    senses,
    authorNotes,
    translationNote: raw.translationNote || null,
    background,
    exegesisTip: raw.exegesisTip || null,
    caution: raw.caution || null,
    verified: stats,
  };
}

// ── Evidence pack ───────────────────────────────────────────────────────────
function verseWindow(words, strongs, size = 7) {
  const target = Align.canon(strongs);
  const i = words.findIndex((w) => w[1] && Align.canon(w[1]) === target);
  if (i < 0) return words.slice(0, size * 2).map((w) => w[0]).join(' ');
  const a = Math.max(0, i - size), b = Math.min(words.length, i + size + 1);
  return (a > 0 ? '… ' : '') + words.slice(a, b).map((w, k) => (a + k === i ? `[${w[0]}]` : w[0])).join(' ') + (b < words.length ? ' …' : '');
}
function sampleRefs(entry, max = 24) {
  // Spread across authors and measured senses, most informative first.
  const bySense = new Map();
  for (const [ref, i] of Object.entries(entry.verseSense || {})) {
    if (!bySense.has(i)) bySense.set(i, []);
    bySense.get(i).push(ref);
  }
  const picked = new Set();
  const seenBooks = new Set();
  for (let round = 0; picked.size < max && round < 40; round++) {
    let added = false;
    for (const [, refs] of bySense) {
      const next = refs.find((r) => !picked.has(r) && (round > 6 || !seenBooks.has(r.split(' ')[0])));
      if (next) { picked.add(next); seenBooks.add(next.split(' ')[0]); added = true; }
      if (picked.size >= max) break;
    }
    if (!added) break;
  }
  for (const r of entry.refs || []) { if (picked.size >= max) break; picked.add(r); }
  return [...picked];
}

// Every NT occurrence of the word (for compact packs, where there are few).
function allOccurrences(W, strongs, max = 12) {
  const target = Align.canon(strongs);
  const T = W.RhemaNT?.text || {};
  const out = [];
  for (const b in T) for (const c in T[b]) for (const v in T[b][c]) {
    if (T[b][c][v].some((w) => w[1] && Align.canon(w[1]) === target)) { out.push(`${b} ${c}:${v}`); if (out.length >= max) return out; }
  }
  return out;
}

function buildPack(entry, lex, mm, W, opts = {}) {
  const compact = !!opts.compact;
  // Compact packs carry shorter lexicon excerpts (a prefix of the full ones,
  // so anything cited from them still verifies against the full text).
  const cap = compact ? { as: 1400, lsj: 900, mm: 1000 } : { as: 3500, lsj: 2500, mm: 3000 };
  const L = [];
  L.push(`WORD: ${entry.lemma} (G${entry.s}${entry.translit ? `, ${entry.translit}` : ''})`);
  L.push(`NT OCCURRENCES: ${entry.count} in the Byzantine text; ${entry.critical?.count ?? 'n/a'} in SBLGNT`);
  const byAuthor = Object.entries(AUTHORS).map(([name, books]) => [name, books.reduce((n, b) => n + ((entry.byBook || {})[b] || 0), 0)])
    .filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  if (byAuthor.length) L.push(`BY AUTHOR: ${byAuthor.map(([a, n]) => `${a} ${n}`).join(', ')}`);
  if (entry.senses?.length) {
    L.push('MEASURED ENGLISH RENDERINGS (Majority Standard Bible, every occurrence):');
    entry.senses.forEach((s, i) => L.push(`  ${i + 1}. "${s.display}" ${s.count}× (${Math.round(s.share * 100)}%), e.g. ${(s.refs || []).slice(0, 4).join(', ')}`));
  }
  if (entry.lxx) {
    L.push(`SEPTUAGINT: ${entry.lxx.count}× in ${entry.lxx.books} books; translates Hebrew ${(entry.lxx.hebrew || []).map((h) => `${h.lemma} H${h.h} (${h.count}×)`).join(', ')}; e.g. ${(entry.lxx.refs || []).join(', ')}`);
  }
  if (entry.classical?.af) L.push(`APOSTOLIC FATHERS: ≈${entry.classical.af} occurrences`);
  const msb = W.RhemaMSB || {};
  const nt = W.RhemaNT?.text || {};
  const refs = compact ? allOccurrences(W, entry.s) : sampleRefs(entry);
  if (refs.length) {
    L.push('SAMPLE OCCURRENCES (Greek with the word in [brackets] · MSB English):');
    for (const r of refs) {
      const m = r.match(/^(\S+) (\d+):(\d+)$/);
      if (!m) continue;
      const words = ((nt[m[1]] || {})[m[2]] || {})[m[3]] || [];
      const eng = ((msb[m[1]] || {})[m[2]] || {})[m[3]] || '';
      L.push(`  ${r}: ${verseWindow(words, entry.s)} · "${eng}"`);
    }
  }
  const sources = [];
  if (lex?.abbott_smith) { const t = plain(lex.abbott_smith, cap.as); L.push(`ABBOTT-SMITH: ${t}`); sources.push(t); }
  if (lex?.extended || lex?.brief) L.push(`DODSON: ${plain(lex.extended || lex.brief, 400)}`);
  if (lex?.strongs_def) L.push(`STRONG'S: ${plain(lex.strongs_def, 300)}; KJV renders: ${plain(lex.kjv_def, 200)}`);
  // Skip an LSJ entry for a homograph (φώς "man" filed under φῶς "light").
  if (entry.classical?.lsj && Align.lsjHeadwordMatches(entry.classical.lsj, entry.lemma)) { const t = plain(entry.classical.lsj, cap.lsj); L.push(`LSJ (classical): ${t}`); sources.push(t); }
  // Skip an MM article filed under this number that is really another word's.
  if (mm && Align.mmHeadwordMatches(mm, entry.lemma)) { const t = plain(mm, cap.mm); L.push(`MOULTON–MILLIGAN (papyri/inscriptions): ${t}`); sources.push(t); }
  if (entry.lxx?.refs?.length) sources.push(entry.lxx.refs.join(' '));
  return { pack: L.join('\n'), sources: sources.join('\n') };
}

// ── Prompt + schema ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a Koine Greek lexicographer writing the definitive Bible-study entry for one Greek word. Your readers are serious Bible students, not specialists: they want to know what the biblical author meant.

You receive an evidence pack: occurrence counts, how the word is distributed across NT authors, how one translation renders every occurrence, Septuagint usage with the Hebrew it translates, sample verses in Greek, and excerpts from Abbott-Smith, LSJ, Moulton–Milligan, Dodson and Strong's.

Write like a careful lexicographer:
- Distinguish SENSES by meaning, not by English wording. A sense the English hides (e.g. one word rendered "flesh" meaning both the body and fallen human nature) is exactly what readers need. Give each sense a short label and a one- or two-sentence definition.
- Every sense and author note must cite verses (book code, chapter:verse, exactly as in the pack, e.g. "ROM 8:3") where the word itself occurs with that meaning. Prefer verses from the sample occurrences or the lexicon excerpts. Citations are checked mechanically against the Greek text; a wrong one is deleted, and a sense with no valid citation is deleted.
- authorNotes: only where an author's usage is distinctive. Use the author names exactly as listed in BY AUTHOR.
- translationNote: when English versions are known to differ on this word, explain why in plain words; otherwise null.
- background: notable usage outside the NT. "citation" must be copied verbatim (a few words, e.g. "P Oxy VI. 933" or "Il. 8.380") from the LSJ, Moulton–Milligan or Abbott-Smith text in the pack; anything not found there is deleted.
- Stay inside the evidence. No sense, author claim or historical claim the pack and standard lexical knowledge cannot support. Where scholars genuinely disagree, say so in "caution".`;

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    senses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          definition: { type: 'string' },
          refs: { type: 'array', items: { type: 'string' } },
          note: { type: ['string', 'null'] },
        },
        required: ['label', 'definition', 'refs', 'note'],
        additionalProperties: false,
      },
    },
    authorNotes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          author: { type: 'string', enum: Object.keys(AUTHORS) },
          note: { type: 'string' },
          refs: { type: 'array', items: { type: 'string' } },
        },
        required: ['author', 'note', 'refs'],
        additionalProperties: false,
      },
    },
    translationNote: { type: ['string', 'null'] },
    background: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['classical', 'septuagint', 'papyri', 'apostolic'] },
          note: { type: 'string' },
          citation: { type: 'string' },
        },
        required: ['period', 'note', 'citation'],
        additionalProperties: false,
      },
    },
    exegesisTip: { type: ['string', 'null'] },
    caution: { type: ['string', 'null'] },
  },
  required: ['summary', 'senses', 'authorNotes', 'translationNote', 'background', 'exegesisTip', 'caution'],
  additionalProperties: false,
};

function requestParams(pack) {
  return {
    model: MODEL,
    max_tokens: 16000, // thinking is always on for claude-opus-5-5 and counts toward this
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Evidence pack:\n\n${pack}\n\nWrite the entry.` }],
  };
}

// English book names/abbreviations → app book codes, for checking prose.
const EN_BOOKS = {
  matt: 'MAT', mt: 'MAT', matthew: 'MAT', mark: 'MAR', mk: 'MAR', mrk: 'MAR', luke: 'LUK', lk: 'LUK',
  john: 'JOH', jn: 'JOH', jhn: 'JOH', acts: 'ACT', act: 'ACT', rom: 'ROM', romans: 'ROM', cor: 'CO', gal: 'GAL',
  eph: 'EPH', phil: 'PHP', php: 'PHP', col: 'COL', thess: 'TH', th: 'TH', tim: 'TI', ti: 'TI', titus: 'TIT', tit: 'TIT',
  phlm: 'PHM', philem: 'PHM', heb: 'HEB', jas: 'JAM', james: 'JAM', pet: 'PE', pe: 'PE', jude: 'JUD', rev: 'REV',
};
function englishRefs(text) {
  const out = [];
  const re = /\b([1-3])?\s?([A-Z][a-z]{1,6})\.? (\d+):(\d+)(?:[-–](\d+))?/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const [, num, name, ch, v, v2] = m;
    let code = EN_BOOKS[name.toLowerCase()];
    if (!code) continue;
    if (['CO', 'TH', 'TI', 'PE'].includes(code)) { if (!num) continue; code = num + code; }
    else if (code === 'JOH' && num) code = num + 'JO';
    else if (num) continue;
    out.push(`${code} ${ch}:${v}${v2 ? '-' + v2 : ''}`);
  }
  return out;
}

// Structural check of one written entry against SCHEMA (the API enforces this
// itself; hand-written batches need it explicitly).
function schemaProblems(st) {
  const p = [];
  const str = (x) => typeof x === 'string' && x.trim().length > 0;
  const strOrNull = (x) => x === null || typeof x === 'string';
  if (!st || typeof st !== 'object') return ['not an object'];
  for (const k of SCHEMA.required) if (!(k in st)) p.push(`missing ${k}`);
  if (!str(st.summary)) p.push('summary must be text');
  if (!Array.isArray(st.senses) || !st.senses.length) p.push('senses must be a non-empty array');
  (st.senses || []).forEach((x, i) => {
    if (!str(x.label) || !str(x.definition) || !Array.isArray(x.refs) || !strOrNull(x.note ?? null)) p.push(`sense ${i + 1} malformed`);
  });
  (st.authorNotes || []).forEach((x, i) => {
    if (!AUTHORS[x.author] || !str(x.note) || !Array.isArray(x.refs)) p.push(`authorNote ${i + 1} malformed (author must be one of ${Object.keys(AUTHORS).join(', ')})`);
  });
  (st.background || []).forEach((x, i) => {
    if (!['classical', 'septuagint', 'papyri', 'apostolic'].includes(x.period) || !str(x.note) || !str(x.citation)) p.push(`background ${i + 1} malformed`);
  });
  for (const k of ['translationNote', 'exegesisTip', 'caution']) if (!strOrNull(st[k] ?? null)) p.push(`${k} must be text or null`);
  return p;
}

// The most-used content words (nouns, verbs, adjectives; no proper names),
// where a deeper entry helps the most readers.
// Proper names start with a capital. (A character range like [Ἀ-Ὧ] would also
// catch lowercase ἐ-, ἀ-, ὁ- words, which interleave with capitals in Unicode.)
const isProperName = (lemma) => { const c = String(lemma || '').normalize('NFC')[0] || ''; return c !== c.toLowerCase(); };
function priorityList(W, entries) {
  const T = W.RhemaNT?.text || {};
  const pos = {};
  for (const b in T) for (const c in T[b]) for (const v in T[b][c]) for (const w of T[b][c][v]) {
    const p = String(w[2] || '').split('-')[0];
    (pos[w[1]] = pos[w[1]] || {})[p] = ((pos[w[1]] || {})[p] || 0) + 1;
  }
  const dominant = (s) => Object.entries(pos[s] || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  return [...entries.values()]
    .filter((e) => e.lemma && e.count > 0 && (ALL_POS || ['N', 'V', 'A'].includes(dominant(e.s))) && !isProperName(e.lemma))
    .filter((e) => e.count >= (MIN_COUNT || 1) && e.count <= MAX_COUNT)
    .sort((a, b) => b.count - a.count);
}

function parseMessage(msg) {
  if (msg.stop_reason === 'refusal') return { error: `refusal${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ''}` };
  if (msg.stop_reason === 'max_tokens') return { error: 'max_tokens' };
  const text = (msg.content || []).find((b) => b.type === 'text')?.text || '';
  try { return { parsed: JSON.parse(text) }; } catch { return { error: 'unparseable output' }; }
}

// ── Persistence ─────────────────────────────────────────────────────────────
function loadDone() {
  const done = new Map();
  if (fs.existsSync(RESULTS_FILE)) {
    for (const line of fs.readFileSync(RESULTS_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); if (!r.error) done.set(r.s, r); } catch {}
    }
  }
  return done;
}
const append = (r) => fs.appendFileSync(RESULTS_FILE, JSON.stringify(r) + '\n');

function mergeIntoShards(W, entries, lexicon, mm) {
  const done = loadDone();
  if (!done.size) { console.log('No results to merge.'); return; }
  const verifier = makeVerifier(W);
  const index = JSON.parse(fs.readFileSync(path.join(DEEP_DIR, 'index.json'), 'utf8'));
  const totals = { merged: 0, refsChecked: 0, refsDropped: 0, sensesDropped: 0, backgroundDropped: 0 };
  for (const shard of index.shards) {
    const file = path.join(DEEP_DIR, shard.file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = false;
    for (const [s, entry] of Object.entries(data)) {
      const r = done.get(Number(s));
      if (!r) continue;
      const { sources } = buildPack(entry, lexicon[s], mm[s], W);
      const study = verifyStudy(r.study, entry, sources, verifier);
      entry.study = { ...study, model: r.model, v: STUDY_VERSION };
      for (const k of ['refsChecked', 'refsDropped', 'sensesDropped', 'backgroundDropped']) totals[k] += study.verified[k];
      totals.merged++;
      changed = true;
    }
    if (changed) fs.writeFileSync(file, JSON.stringify(data));
  }
  console.log(`Merged ${totals.merged} studies. Receipts: ${totals.refsChecked - totals.refsDropped}/${totals.refsChecked} verses verified (${totals.refsDropped} dropped), ${totals.sensesDropped} unsupported senses and ${totals.backgroundDropped} unverifiable history notes removed.`);
  console.log('Now bump DEEP_LEXICON_VERSION in app.js so devices fetch the new shards.');
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!CHECK_FILE && !IMPORT_FILE) console.log('Loading texts and lexica…');
  const W = loadWindowFiles(['rhema-nt.js', 'rhema-critical.js', 'rhema-lxx.js', 'rhema-msb.js', 'rhema-lexicon.js', 'rhema-mm.js']);
  const lexicon = W.RhemaLexicon || {};
  const mm = W.RhemaMoultonMilligan || {};
  const { entries } = loadShards();

  if (MERGE_ONLY) { mergeIntoShards(W, entries, lexicon, mm); return; }

  if (EXPORT) {
    const done = loadDone();
    const list = priorityList(W, entries).slice(OFFSET, OFFSET + TOP).filter((e) => !done.has(e.s));
    fs.mkdirSync(WORK_DIR, { recursive: true });
    let n = 0;
    for (let i = 0; i < list.length; i += BATCH) {
      const batch = list.slice(i, i + BATCH);
      const name = `${PREFIX}-${String(++n).padStart(2, '0')}`;
      const body = [`# ${name}: ${batch.length} words (${batch.map((e) => `G${e.s} ${e.lemma}`).join(', ')})`, ''];
      for (const e of batch) body.push(`════ G${e.s} ${e.lemma} ════`, buildPack(e, lexicon[e.s], mm[e.s], W, { compact: TIER === 'compact' }).pack, '');
      fs.writeFileSync(path.join(WORK_DIR, `${name}.md`), body.join('\n'));
    }
    fs.writeFileSync(path.join(WORK_DIR, 'INSTRUCTIONS-COMPACT.md'), `${SYSTEM_PROMPT}

COMPACT ENTRIES (words used only 2-9 times). Keep each entry short and exact:
- summary: one sentence.
- senses: 1-3, and together they should cover the word's occurrences; cite the
  actual verses (the pack lists every NT occurrence).
- authorNotes: usually []. translationNote: null unless versions clearly
  differ. background: 0-2 notes. exegesisTip and caution: null unless genuinely
  useful.

Output: a JSON array, one object per word: {"s": <Strong's number>, "study": <entry>}, where <entry> matches this JSON schema:
${JSON.stringify(SCHEMA)}
`);
    fs.writeFileSync(path.join(WORK_DIR, 'INSTRUCTIONS.md'), `${SYSTEM_PROMPT}\n\nOutput: a JSON array, one object per word: {"s": <Strong's number>, "study": <entry>}, where <entry> matches this JSON schema:\n${JSON.stringify(SCHEMA, null, 2)}\n`);
    console.log(`Exported ${list.length} words in ${n} batches to ${path.relative(ROOT, WORK_DIR)}/ (${done.size} already done, skipped).`);
    return;
  }

  if (CHECK_FILE || IMPORT_FILE) {
    const file = path.resolve(CHECK_FILE || IMPORT_FILE);
    let rows;
    try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`Can't read ${file}: ${e.message}`); process.exit(1); }
    if (!Array.isArray(rows)) { console.error('Expected a JSON array of {s, study}.'); process.exit(1); }
    const verifier = makeVerifier(W);
    let bad = 0;
    const good = [];
    for (const row of rows) {
      const e = entries.get(Number(row.s));
      if (!e) { console.log(`✗ G${row.s}: unknown Strong's number`); bad++; continue; }
      const problems = schemaProblems(row.study);
      if (problems.length) { console.log(`✗ G${e.s} ${e.lemma}: ${problems.join('; ')}`); bad++; continue; }
      const { sources } = buildPack(e, lexicon[e.s], mm[e.s], W);
      const v = verifyStudy(row.study, e, sources, verifier);
      const droppedRefs = [];
      for (const x of [...(row.study.senses || []), ...(row.study.authorNotes || [])]) {
        for (const r of x.refs || []) if (!verifier.verseHas(r, e.s)) droppedRefs.push(r);
      }
      const droppedBg = (row.study.background || []).filter((b) => !v.background.some((k) => k.citation === b.citation)).map((b) => b.citation);
      // Verse references written inside the prose (e.g. "MAR 3:17" in a note)
      // aren't tappable receipts, but they must still be right.
      const prose = [row.study.summary, row.study.translationNote, row.study.exegesisTip, row.study.caution,
        ...(row.study.senses || []).flatMap((x) => [x.definition, x.note]), ...(row.study.authorNotes || []).map((x) => x.note)]
        .filter(Boolean).join(' ');
      // A range ("PHP 2:10-11") passes if any verse in it has the word. Prose
      // may also cite a verse as a contrast, so these are warnings only.
      // Also read English-style references ("Rom 8:3", "1 Cor 5:5", "Matt 25:21").
      const proseRefs = [...(prose.match(/\b[1-3]?[A-Z]{2,3} \d+:\d+(?:[-–]\d+)?/g) || []), ...englishRefs(prose)];
      const proseBad = [...new Set(proseRefs)].filter((r) => {
        const m = r.match(/^(\S+ \d+):(\d+)(?:[-–](\d+))?$/);
        for (let v = +m[2]; v <= +(m[3] || m[2]); v++) if (verifier.verseHas(`${m[1]}:${v}`, e.s)) return false;
        return true;
      });
      if (proseBad.length) droppedRefs.push(...proseBad.map((r) => `${r} (mentioned in text — check it's a deliberate contrast or a different versification)`));
      const flag = droppedRefs.length || droppedBg.length || v.verified.sensesDropped ? '!' : '✓';
      console.log(`${flag} G${e.s} ${e.lemma}: ${v.senses.length} senses, ${v.authorNotes.length} author notes, ${v.background.length} history notes` +
        (droppedRefs.length ? ` · refs that don't contain the word: ${droppedRefs.join(', ')}` : '') +
        (droppedBg.length ? ` · citations not found in the supplied lexicon text: ${droppedBg.join(' | ')}` : '') +
        (v.verified.sensesDropped ? ` · ${v.verified.sensesDropped} sense(s) would be dropped (no verified verse)` : ''));
      good.push(row);
    }
    if (IMPORT_FILE) {
      for (const row of good) append({ s: Number(row.s), model: IMPORT_AS, study: row.study });
      console.log(`Imported ${good.length} entries (${bad} rejected) into ${path.relative(ROOT, RESULTS_FILE)}.`);
    } else {
      console.log(`${good.length} well-formed, ${bad} rejected.`);
    }
    process.exit(bad && CHECK_FILE ? 2 : 0);
  }

  const done = loadDone();
  let targets = [...entries.values()]
    .filter((e) => e.lemma)
    .filter((e) => !SAMPLE || SAMPLE.includes(e.s))
    .filter((e) => e.count >= MIN_COUNT)
    .filter((e) => !done.has(e.s))
    .sort((a, b) => b.count - a.count);
  if (LIMIT) targets = targets.slice(0, LIMIT);
  console.log(`Word study — model ${MODEL}, effort ${EFFORT}: ${targets.length} to write (${done.size} already done).`);
  if (!targets.length) { mergeIntoShards(W, entries, lexicon, mm); return; }

  const packs = new Map(targets.map((e) => [e.s, buildPack(e, lexicon[e.s], mm[e.s], W).pack]));
  if (DRY_RUN) {
    const e = targets[0];
    console.log('\n── SYSTEM ──\n' + SYSTEM_PROMPT + `\n\n── EVIDENCE PACK G${e.s} ${e.lemma} (${packs.get(e.s).length} chars) ──\n` + packs.get(e.s));
    console.log('\n(dry run — nothing sent)');
    return;
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();

  if (SAMPLE || targets.length <= 20) {
    // Direct calls for quick review. Server-side refusal fallback is on here
    // (it isn't available on the Batches API).
    for (const e of targets) {
      process.stdout.write(`  G${e.s} ${e.lemma}… `);
      try {
        const msg = await client.beta.messages.create({
          ...requestParams(packs.get(e.s)),
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });
        const { parsed, error } = parseMessage(msg);
        if (error) { console.log(`✗ ${error}`); continue; }
        append({ s: e.s, model: msg.model || MODEL, study: parsed });
        console.log(`✓ ${parsed.senses.length} senses — ${parsed.summary.slice(0, 70)}`);
      } catch (err) {
        console.log(`✗ ${err.message}`);
      }
    }
    mergeIntoShards(W, entries, lexicon, mm);
    return;
  }

  let state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
  if (!state.batchId) {
    const batch = await client.messages.batches.create({
      requests: targets.map((e) => ({ custom_id: `g${e.s}`, params: requestParams(packs.get(e.s)) })),
    });
    state = { batchId: batch.id, submitted: targets.length, at: new Date().toISOString() };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`Batch ${batch.id} submitted (${targets.length}). Safe to interrupt — re-run to resume.`);
  } else {
    console.log(`Resuming batch ${state.batchId}…`);
  }
  let batch;
  for (;;) {
    batch = await client.messages.batches.retrieve(state.batchId);
    if (batch.processing_status === 'ended') break;
    const c = batch.request_counts;
    console.log(`  ${batch.processing_status} — processing ${c.processing}, done ${c.succeeded + c.errored}`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  let ok = 0, bad = 0;
  for await (const result of await client.messages.batches.results(state.batchId)) {
    const s = Number(String(result.custom_id).replace(/^g/, ''));
    if (result.result.type !== 'succeeded') { bad++; continue; }
    const { parsed, error } = parseMessage(result.result.message);
    if (error) { bad++; continue; }
    append({ s, model: result.result.message.model || MODEL, study: parsed });
    ok++;
  }
  console.log(`Batch ended: ${ok} written, ${bad} failed (re-run to retry the failures).`);
  fs.unlinkSync(STATE_FILE);
  mergeIntoShards(W, entries, lexicon, mm);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
module.exports = { verifyStudy, makeVerifier, buildPack, loadWindowFiles, SCHEMA };
