#!/usr/bin/env node
// scripts/build-hebrew-lexicon-prose.js — Stage 2 of the Rhēma Hebrew deep lexicon.
//
// Takes the corpus evidence built by build-deep-hebrew-lexicon.js and uses
// Claude to synthesize, for each Hebrew/Aramaic word, the part no algorithm
// can write:
//   - def         one plain-modern-English definition (a sentence, not a gloss list)
//   - senseLabels 1–4 short labels for the word's main semantic domains
//   - article     2–4 sentences on meaning, range, and the most interesting evidence
//   - caution     an honest caveat when evidence is thin or disputed, else null
//
// This is a ONE-TIME, OFFLINE build step. Nothing here runs in the app.
//
// Cost (Batches API, 50 % off; ~900 input + ~250 output tokens per entry):
//   claude-sonnet-4-6    ≈ $28   (default)
//   claude-opus-4-8      ≈ $70   (highest quality; use --min-count 2 to cut cost)
//   claude-haiku-4-5     ≈ $8    (fast, less nuanced)
//
// Usage:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   node scripts/build-deep-hebrew-lexicon.js          # run Stage 1 first (free)
//   node scripts/build-hebrew-lexicon-prose.js --sample 1697,157,430   # test
//   node scripts/build-hebrew-lexicon-prose.js --dry-run               # preview prompt
//   node scripts/build-hebrew-lexicon-prose.js                         # full run
//   node scripts/build-hebrew-lexicon-prose.js --merge-only            # re-merge results
//
// Flags:
//   --model <id>       model to use (default claude-sonnet-4-6)
//   --min-count <n>    skip entries with fewer than n OT occurrences (default: 0)
//   --sample <list>    comma-separated Strong's numbers; direct API, no batch
//   --limit <n>        cap entry count (testing)
//   --dry-run          print system prompt + digest for first entry and exit (free)
//   --mock             run pipeline without API calls (plumbing test)
//   --merge-only       re-apply results.jsonl into shards without re-running API
//
// Resumable: results appended to data/deep-hebrew-lexicon/prose/results.jsonl;
// interrupted batches picked up from data/deep-hebrew-lexicon/prose/state.json.

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT      = path.join(__dirname, '..');
const DEEP_DIR  = path.join(ROOT, 'data', 'deep-hebrew-lexicon');
const PROSE_DIR = path.join(DEEP_DIR, 'prose');

const RESULTS_FILE = path.join(PROSE_DIR, 'results.jsonl');
const STATE_FILE   = path.join(PROSE_DIR, 'state.json');
const PROSE_VERSION = 1;

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null;
};

const MODEL      = typeof flag('model')     === 'string' ? flag('model')                      : 'claude-sonnet-4-6';
const MIN_COUNT  = parseInt(flag('min-count'), 10) || 0;
const SAMPLE     = typeof flag('sample')    === 'string' ? flag('sample').split(',').map(Number).filter(Boolean) : null;
const LIMIT      = parseInt(flag('limit'),   10) || 0;
const DRY_RUN    = Boolean(flag('dry-run'));
const MOCK       = Boolean(flag('mock'));
const MERGE_ONLY = Boolean(flag('merge-only'));

// ── Constants ─────────────────────────────────────────────────────────────────

const BOOK_NAMES = {
  GEN:'Genesis',EXO:'Exodus',LEV:'Leviticus',NUM:'Numbers',DEU:'Deuteronomy',
  JOS:'Joshua',JDG:'Judges',RUT:'Ruth','1SA':'1 Samuel','2SA':'2 Samuel',
  '1KI':'1 Kings','2KI':'2 Kings','1CH':'1 Chronicles','2CH':'2 Chronicles',
  EZR:'Ezra',NEH:'Nehemiah',EST:'Esther',JOB:'Job',PSA:'Psalms',PRO:'Proverbs',
  ECC:'Ecclesiastes',SNG:'Song of Solomon',ISA:'Isaiah',JER:'Jeremiah',
  LAM:'Lamentations',EZK:'Ezekiel',DAN:'Daniel',HOS:'Hosea',JOL:'Joel',
  AMO:'Amos',OBA:'Obadiah',JON:'Jonah',MIC:'Micah',NAM:'Nahum',HAB:'Habakkuk',
  ZEP:'Zephaniah',HAG:'Haggai',ZEC:'Zechariah',MAL:'Malachi',
};

const POS_NAMES = {
  V:'verb',N:'noun',A:'adjective',P:'personal pronoun',D:'demonstrative pronoun',
  R:'relative pronoun',T:'definite article',C:'conjunction',M:'particle',S:'suffix',
};

const VERB_STEM_NAMES = {
  q:'Qal',N:'Niphal',p:'Piel',P:'Pual',h:'Hiphil',H:'Hophal',t:'Hithpael',
  o:'Polel',r:'Hithpolel',m:'Poel',D:'Nithpael',
};

// ── Load shards + Hebrew lexicon ──────────────────────────────────────────────

function loadShards() {
  const index   = JSON.parse(fs.readFileSync(path.join(DEEP_DIR, 'index.json'), 'utf8'));
  const entries = new Map();
  for (const shard of index.shards) {
    const data = JSON.parse(fs.readFileSync(path.join(DEEP_DIR, shard.file), 'utf8'));
    for (const [s, entry] of Object.entries(data)) entries.set(Number(s), entry);
  }
  return { index, entries };
}

function loadHebrewLexicon() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'rhema-hebrew-lexicon.js'), 'utf8'), sandbox);
  return sandbox.window.RhemaHebrewLexicon || {};
}

// ── Evidence digest ───────────────────────────────────────────────────────────

function plainText(html, max = 700) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function buildDigest(entry, lex) {
  const lines = [];
  const isAramaic = String(lex?.strongs_def || '').toLowerCase().includes('aramaic');

  lines.push(
    `LEMMA: ${entry.lemma || '(unknown)'} (H${entry.s}` +
    `${entry.translit ? `, ${entry.translit}` : ''}` +
    `${entry.pronounce ? `, pronounced "${entry.pronounce}"` : ''}` +
    `${isAramaic ? ', Aramaic' : ''})`,
  );
  lines.push(`OT OCCURRENCES: ${entry.count} across ${Object.keys(entry.byBook || {}).length} book(s)`);

  if (entry.count === 0) {
    lines.push('NOTE: No occurrences found in the OSHB text — this may be a proper name, a variant lemma tagging, or an Aramaic entry with minimal attestation.');
  }

  if (entry.byBook && Object.keys(entry.byBook).length > 1) {
    const dist = Object.entries(entry.byBook)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([book, count]) => `${BOOK_NAMES[book] || book} (${count}×)`)
      .join(', ');
    lines.push(`DISTRIBUTION: ${dist}${Object.keys(entry.byBook).length > 8 ? ' + more' : ''}`);
  }

  if (entry.refs?.length) {
    lines.push(`SAMPLE VERSES: ${entry.refs.slice(0, 5).join(', ')}`);
  }

  if (entry.morph) {
    const roles = Object.entries(entry.morph)
      .sort(([, a], [, b]) => b - a)
      .map(([p, c]) => `${POS_NAMES[p] || p} (${c}×)`)
      .join(', ');
    lines.push(`GRAMMATICAL ROLES: ${roles}`);
  }

  if (entry.verbStems && Object.keys(entry.verbStems).length) {
    const stems = Object.entries(entry.verbStems)
      .sort(([, a], [, b]) => b - a)
      .map(([st, c]) => `${VERB_STEM_NAMES[st] || st} stem (${c}×)`)
      .join(', ');
    lines.push(`VERB STEMS ATTESTED: ${stems}`);
  }

  if (entry.lxxGreek?.length) {
    const lxxList = entry.lxxGreek.slice(0, 5).map(g => `${g.lemma || 'G' + g.g} (${g.count}×)`).join(', ');
    lines.push(`LXX TRANSLATION (Septuagint): ancient translators rendered this word as ${lxxList}`);
  }

  if (lex) {
    if (lex.strongs_def) lines.push(`STRONG'S DEFINITION: ${plainText(lex.strongs_def, 400)}`);
    if (lex.kjv_def)     lines.push(`KJV GLOSSES (full range of translation choices): ${plainText(lex.kjv_def, 400)}`);
    if (lex.extended && lex.extended !== lex.strongs_def) lines.push(`EXTENDED: ${plainText(lex.extended, 300)}`);
    if (lex.deriv)       lines.push(`ROOT / DERIVATION: ${plainText(lex.deriv, 200)}`);
  }

  lines.push(`CONFIDENCE TIER: ${entry.confidence}`);
  return lines.join('\n');
}

// ── System prompt + output schema ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a careful Biblical Hebrew lexicographer writing entries for a Bible-study app used by ordinary readers, not scholars. For each word you receive an evidence digest: occurrence counts and book distribution from the OSHB Hebrew Old Testament (39 books), LXX translation evidence (which Greek words the Septuagint uses), and classical lexicon excerpts (Strong's definition, full KJV gloss range).

Write in plain modern English. Ground every claim in the supplied evidence only — never add senses, etymologies, or theological interpretations the digest does not support. Numbers in your prose must come from the digest.

Rules:
- "definition": one sentence, at most 25 words, that a modern reader instantly understands. Capture the core semantic range honestly — not just one gloss. Not a gloss list — a real definition.
- "senseLabels": 1–4 short labels (each at most 6 words) naming the word's main semantic domains. These are not exhaustive lists of every KJV gloss variant — they are the distinct conceptual clusters a reader needs to know. If the word is a proper name, particle, or has only one clear meaning, return a single label.
- "article": 2 to 4 sentences. What the word means, how broad or narrow its range is, and the single most interesting piece of evidence (LXX translation choice, notable distribution across books, or distinctive verbal stem usage). Conversational but precise.
- "caution": one sentence flagging genuine uncertainty — hapax legomenon, heavily disputed meaning, Aramaic entry with sparse OT attestation, reconstructed root, or significant scholarly disagreement — or null if confidence is clear.

Hebrew-specific guidance:
- Hebrew verb stems (binyanim) often change meaning significantly: Qal is the basic active form; Niphal is passive or reflexive; Piel intensifies or puts the action in causative motion; Hiphil is causative active; Hithpael is reflexive/iterative. When a word has a distribution across multiple stems, note the most important shift if relevant.
- Hebrew semantic range is typically broader than Greek. A single root often covers what English would need multiple words to express. Embrace that breadth in the definition rather than artificially narrowing it.
- The LXX translation choice is strong evidence for how ancient readers — including the NT authors — understood the word. Weight it accordingly.
- A word found mainly in poetry (Psalms, Proverbs, Job, Song of Solomon, Lamentations) may carry a more elevated or metaphorical register than the same root in prose narrative.
- Do not mention a word's Aramaic cognate unless the digest explicitly provides that information.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    definition:  { type: 'string' },
    senseLabels: { type: 'array', items: { type: 'string' } },
    article:     { type: 'string' },
    caution:     { type: ['string', 'null'] },
  },
  required: ['definition', 'senseLabels', 'article', 'caution'],
  additionalProperties: false,
};

function requestParams(digest) {
  return {
    model:     MODEL,
    max_tokens: 1024,
    system:    SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages:  [{ role: 'user', content: `Evidence digest:\n\n${digest}\n\nWrite the entry.` }],
  };
}

// ── Validation + persistence ───────────────────────────────────────────────────

function validateProse(parsed) {
  if (!parsed || typeof parsed.definition !== 'string' || !parsed.definition.trim()) return 'missing definition';
  if (!Array.isArray(parsed.senseLabels)) return 'missing senseLabels';
  if (typeof parsed.article !== 'string' || !parsed.article.trim()) return 'missing article';
  return null;
}

function loadDoneSet() {
  const done = new Map();
  if (fs.existsSync(RESULTS_FILE)) {
    for (const line of fs.readFileSync(RESULTS_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); done.set(r.s, r); } catch { /* skip */ }
    }
  }
  return done;
}

function appendResult(result) {
  fs.appendFileSync(RESULTS_FILE, JSON.stringify(result) + '\n');
}

// ── Merge into shards ─────────────────────────────────────────────────────────

function mergeIntoShards() {
  const done = loadDoneSet();
  if (!done.size) { console.log('No results to merge.'); return; }

  const index = JSON.parse(fs.readFileSync(path.join(DEEP_DIR, 'index.json'), 'utf8'));
  let merged = 0;

  for (const shard of index.shards) {
    const file = path.join(DEEP_DIR, shard.file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = false;

    for (const [s, entry] of Object.entries(data)) {
      const r = done.get(Number(s));
      if (!r || r.error) continue;
      entry.prose = {
        def:         r.definition,
        senseLabels: r.senseLabels,
        article:     r.article,
        caution:     r.caution,
        model:       r.model,
        v:           PROSE_VERSION,
      };
      changed = true;
      merged++;
    }

    if (changed) fs.writeFileSync(file, JSON.stringify(data));
  }

  console.log(`Merged prose into ${merged} Hebrew entries.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(PROSE_DIR, { recursive: true });

  if (MERGE_ONLY) { mergeIntoShards(); return; }

  if (!fs.existsSync(path.join(DEEP_DIR, 'index.json'))) {
    console.error('No Hebrew deep lexicon found. Run build-deep-hebrew-lexicon.js first.');
    process.exit(1);
  }

  console.log(`Hebrew lexicon prose synthesis — model: ${MODEL}${MOCK ? ' (MOCK)' : ''}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const { entries } = loadShards();
  const lexicon     = loadHebrewLexicon();
  const done        = loadDoneSet();

  let targets = [...entries.values()]
    .filter(e => e.lemma)
    .filter(e => !SAMPLE || SAMPLE.includes(e.s))
    .filter(e => e.count >= MIN_COUNT)
    .filter(e => !done.has(e.s))
    .sort((a, b) => b.count - a.count);
  if (LIMIT) targets = targets.slice(0, LIMIT);

  console.log(`${targets.length} entries to synthesize (${done.size} already done, skipped)`);
  if (!targets.length) { mergeIntoShards(); return; }

  const digests = new Map(targets.map(e => [e.s, buildDigest(e, lexicon[e.s])]));

  if (DRY_RUN) {
    const first = targets[0];
    console.log('\n── SYSTEM PROMPT ──\n' + SYSTEM_PROMPT);
    console.log(`\n── DIGEST for H${first.s} ${first.lemma} ──\n` + digests.get(first.s));
    console.log('\n(dry run — nothing sent)');
    return;
  }

  if (MOCK) {
    for (const e of targets) {
      appendResult({
        s: e.s, model: 'mock',
        definition:  `[MOCK] ${e.lemma}: ${e.why?.[0] || 'placeholder definition.'}`,
        senseLabels: ['[mock] primary sense'],
        article:     `[MOCK] Placeholder article for ${e.lemma}. Not real lexicography.`,
        caution:     'Mock data — do not ship.',
      });
    }
    console.log(`Wrote ${targets.length} mock results.`);
    mergeIntoShards();
    return;
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client    = new Anthropic();

  // Small runs → direct Messages API; large runs → Batches API at 50 % price.
  if (SAMPLE || targets.length <= 20) {
    for (const e of targets) {
      process.stdout.write(`  H${e.s} ${e.lemma}… `);
      try {
        const response = await client.messages.create(requestParams(digests.get(e.s)));
        const text     = response.content.find(b => b.type === 'text')?.text || '';
        const parsed   = JSON.parse(text);
        const problem  = validateProse(parsed);
        if (problem) { console.log(`✗ ${problem}`); appendResult({ s: e.s, error: problem }); continue; }
        appendResult({ s: e.s, model: MODEL, ...parsed });
        console.log(`✓ "${parsed.definition.slice(0, 60)}"`);
      } catch (err) {
        console.log(`✗ ${err.message}`);
        appendResult({ s: e.s, error: String(err.message) });
      }
    }
    mergeIntoShards();
    return;
  }

  // ── Batch path ────────────────────────────────────────────────────────────

  let state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};

  if (!state.batchId) {
    console.log('Submitting batch…');
    const batch = await client.messages.batches.create({
      requests: targets.map(e => ({ custom_id: `h${e.s}`, params: requestParams(digests.get(e.s)) })),
    });
    state = { batchId: batch.id, submitted: targets.length, at: new Date().toISOString() };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`Batch ${batch.id} submitted (${targets.length} requests). Safe to interrupt — re-run to resume.`);
  } else {
    console.log(`Resuming batch ${state.batchId}…`);
  }

  let batch;
  for (;;) {
    batch = await client.messages.batches.retrieve(state.batchId);
    if (batch.processing_status === 'ended') break;
    const c = batch.request_counts;
    console.log(`  ${batch.processing_status} — processing ${c.processing}, finished ${c.succeeded + c.errored}`);
    await new Promise(r => setTimeout(r, 60_000));
  }
  console.log(`Batch ended: ${batch.request_counts.succeeded} succeeded, ${batch.request_counts.errored} errored.`);

  const entryByStrongs = new Map(targets.map(e => [e.s, e]));
  for await (const result of await client.messages.batches.results(state.batchId)) {
    const s = Number(String(result.custom_id).replace(/^h/, ''));
    if (result.result.type !== 'succeeded') {
      appendResult({ s, error: result.result.type });
      continue;
    }
    const text = result.result.message.content.find(b => b.type === 'text')?.text || '';
    try {
      const parsed  = JSON.parse(text);
      const problem = validateProse(parsed);
      if (problem) { appendResult({ s, error: problem }); continue; }
      appendResult({ s, model: MODEL, ...parsed });
    } catch {
      appendResult({ s, error: 'unparseable JSON output' });
    }
  }

  fs.unlinkSync(STATE_FILE);
  mergeIntoShards();
  console.log('\nDone. Re-run with --merge-only to re-apply results to freshly rebuilt shards.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
