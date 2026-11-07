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

function makeVerifier(W) {
  const texts = [W.RhemaNT?.text || {}, W.RhemaCriticalNT?.text || {}, W.RhemaLXX?.text || {}];
  const lemmaIdx = Align.buildLemmaIndex(W.RhemaLexicon || {});
  function verseHas(ref, strongs) {
    const m = String(ref || '').trim().match(/^([1-3]?[A-Z]{2,3}) (\d+):(\d+)$/);
    if (!m) return false;
    const target = Align.canon(strongs);
    for (const T of texts) {
      const words = ((T[m[1]] || {})[m[2]] || {})[m[3]];
      if (!words) continue;
      for (const w of words) {
        const s = w[1] || (w[3] ? Align.strongsForLemma(lemmaIdx, w[3]) : '');
        if (s && Align.canon(s) === target) return true;
      }
    }
    return false;
  }
  return { verseHas };
}

const norm = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/[\s.,;:·()[\]'’"]+/g, ' ').trim();

function verifyStudy(raw, entry, sources, verifier) {
  const stats = { refsChecked: 0, refsDropped: 0, sensesDropped: 0, notesDropped: 0, backgroundDropped: 0 };
  const keepRefs = (refs) => (refs || []).filter((r) => {
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
    if (cite.length < 4 || !haystack.includes(cite)) { stats.backgroundDropped++; continue; }
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

function buildPack(entry, lex, mm, W) {
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
  const refs = sampleRefs(entry);
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
  if (lex?.abbott_smith) { const t = plain(lex.abbott_smith, 3500); L.push(`ABBOTT-SMITH: ${t}`); sources.push(t); }
  if (lex?.extended || lex?.brief) L.push(`DODSON: ${plain(lex.extended || lex.brief, 400)}`);
  if (lex?.strongs_def) L.push(`STRONG'S: ${plain(lex.strongs_def, 300)}; KJV renders: ${plain(lex.kjv_def, 200)}`);
  if (entry.classical?.lsj) { const t = plain(entry.classical.lsj, 2500); L.push(`LSJ (classical): ${t}`); sources.push(t); }
  if (mm) { const t = plain(mm, 3000); L.push(`MOULTON–MILLIGAN (papyri/inscriptions): ${t}`); sources.push(t); }
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
  console.log('Loading texts and lexica…');
  const W = loadWindowFiles(['rhema-nt.js', 'rhema-critical.js', 'rhema-lxx.js', 'rhema-msb.js', 'rhema-lexicon.js', 'rhema-mm.js']);
  const lexicon = W.RhemaLexicon || {};
  const mm = W.RhemaMoultonMilligan || {};
  const { entries } = loadShards();

  if (MERGE_ONLY) { mergeIntoShards(W, entries, lexicon, mm); return; }

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
