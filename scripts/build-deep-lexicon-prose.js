#!/usr/bin/env node
// scripts/build-deep-lexicon-prose.js — Stage 2 of the Rhēma deep lexicon.
//
// Takes the deterministic evidence built by build-deep-lexicon.js and uses
// Claude to synthesize, for each Greek word, the part no algorithm can write:
//   - def         one plain-modern-English definition (a sentence, not a gloss list)
//   - senseLabels a short human label for each measured sense, in order
//   - article     2–4 sentences explaining the word's meaning and range,
//                 grounded ONLY in the evidence supplied (no outside claims)
//   - caution     an honest caveat when the evidence is thin or disputed
//
// This is a ONE-TIME, OFFLINE build step. Nothing here runs in the app — the
// output is merged into the static shards in data/deep-lexicon/, so runtime
// cost stays zero regardless of user count.
//
// Cost: uses the Message Batches API (50% of standard prices). Rough totals
// for all ~5,400 entries (≈1.2K input + ≈250 output tokens each, batched):
//     claude-opus-4-8    ≈ $33   (default — highest quality)
//     claude-sonnet-4-6  ≈ $20   (--model claude-sonnet-4-6)
//     claude-haiku-4-5   ≈ $7    (--model claude-haiku-4-5)
// Add --min-count 2 to skip words with a single NT occurrence (the classical
// lexica carry those anyway) and cut the bill by roughly a quarter.
//
// Usage:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   cd scripts && npm install && cd ..
//   node scripts/build-deep-lexicon-prose.js --sample 3056,4487,26   # test a few words
//   node scripts/build-deep-lexicon-prose.js                         # full run (submits batch, polls, merges)
//   node scripts/build-deep-lexicon-prose.js --merge-only            # re-merge saved results into shards
//
// Flags:
//   --model <id>       model to use (default claude-opus-4-8)
//   --min-count <n>    only synthesize entries with >= n NT occurrences
//   --sample <list>    comma-separated Strong's numbers (small direct-API test run, no batch)
//   --limit <n>        cap the number of entries (testing)
//   --dry-run          print the prompt for the first entry and exit (free)
//   --mock             generate placeholder prose without the API (plumbing test)
//   --merge-only       skip generation; merge data/deep-lexicon/prose/results.jsonl into shards
//
// The script is resumable: results are appended to
// data/deep-lexicon/prose/results.jsonl as they arrive, already-done entries
// are skipped on re-run, and an interrupted batch is picked up by batch id
// from data/deep-lexicon/prose/state.json.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEEP_DIR = path.join(ROOT, 'data', 'deep-lexicon');
const PROSE_DIR = path.join(DEEP_DIR, 'prose');
const RESULTS_FILE = path.join(PROSE_DIR, 'results.jsonl');
const STATE_FILE = path.join(PROSE_DIR, 'state.json');
const PROSE_VERSION = 1;

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null;
};
const MODEL = typeof flag('model') === 'string' ? flag('model') : 'claude-opus-4-8';
const MIN_COUNT = parseInt(flag('min-count'), 10) || 0;
const SAMPLE = typeof flag('sample') === 'string' ? flag('sample').split(',').map(Number).filter(Boolean) : null;
const LIMIT = parseInt(flag('limit'), 10) || 0;
const DRY_RUN = Boolean(flag('dry-run'));
const MOCK = Boolean(flag('mock'));
const MERGE_ONLY = Boolean(flag('merge-only'));

// ── Load shards + classical lexica ───────────────────────────────────────────

function loadShards() {
  const index = JSON.parse(fs.readFileSync(path.join(DEEP_DIR, 'index.json'), 'utf8'));
  const entries = new Map();
  for (const shard of index.shards) {
    const data = JSON.parse(fs.readFileSync(path.join(DEEP_DIR, shard.file), 'utf8'));
    for (const [s, entry] of Object.entries(data)) entries.set(Number(s), entry);
  }
  return { index, entries };
}

function loadClassicalLexicon() {
  const vm = require('vm');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of ['rhema-lexicon.js', 'rhema-mm.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }
  return { lexicon: sandbox.window.RhemaLexicon || {}, mm: sandbox.window.RhemaMoultonMilligan || {} };
}

// ── Evidence digest (what the model is allowed to know) ─────────────────────

function plainText(html, max = 700) {
  const text = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function buildDigest(entry, lex, mmText) {
  const lines = [];
  lines.push(`LEMMA: ${entry.lemma || '(unknown)'} (G${entry.s}${entry.translit ? `, ${entry.translit}` : ''})`);
  lines.push(`BYZANTINE NT OCCURRENCES: ${entry.count} across ${Object.keys(entry.byBook || {}).length} books; critical text (SBLGNT): ${entry.critical?.count ?? 'n/a'}`);

  if (entry.senses?.length) {
    lines.push('MEASURED SENSES (how the Majority Standard Bible renders it, every occurrence counted):');
    entry.senses.forEach((s, i) => {
      const bits = [`${s.count}× (${Math.round(s.share * 100)}%)`];
      if (s.bsbAgree != null) bits.push(`BSB independently agrees ${Math.round(s.bsbAgree * 100)}%`);
      if (s.corroborated?.length) bits.push(`also listed by ${s.corroborated.join('/')}`);
      lines.push(`  ${i + 1}. "${s.display}" — ${bits.join('; ')}; e.g. ${(s.refs || []).slice(0, 3).join(', ')}`);
    });
  }
  if (entry.rare?.length) lines.push(`RARE RENDERINGS: ${entry.rare.map(r => `"${r.display}"`).join(', ')}`);
  if (entry.untranslated) lines.push(`ABSORBED INTO PHRASING (no English word of its own): ${entry.untranslated}× of ${entry.count}`);

  if (entry.lxx) {
    let s = `SEPTUAGINT: ${entry.lxx.count}× in ${entry.lxx.books} books`;
    if (entry.lxx.hebrew?.length) s += `; translates Hebrew ${entry.lxx.hebrew.map(h => `${h.lemma || 'H' + h.h} (${h.count}×)`).join(', ')}`;
    lines.push(s);
  }
  if (entry.mm) lines.push('PAPYRI: Moulton-Milligan documents this word in everyday Koine papyri/inscriptions.');

  if (lex) {
    if (lex.strongs_def) lines.push(`STRONG'S: ${plainText(lex.strongs_def, 300)}`);
    if (lex.kjv_def) lines.push(`KJV GLOSSES: ${plainText(lex.kjv_def, 200)}`);
    if (lex.brief || lex.extended) lines.push(`DODSON: ${plainText(lex.extended || lex.brief, 300)}`);
    if (lex.abbott_smith) lines.push(`ABBOTT-SMITH: ${plainText(lex.abbott_smith, 700)}`);
    if (lex.deriv) lines.push(`DERIVATION: ${plainText(lex.deriv, 200)}`);
  }
  if (mmText) lines.push(`MOULTON-MILLIGAN (excerpt): ${plainText(mmText, 500)}`);

  lines.push(`CONFIDENCE TIER (computed): ${entry.confidence}`);
  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are a careful Koine Greek lexicographer writing entries for a Bible-study app used by ordinary readers, not scholars. For each word you receive an evidence digest: corpus-measured translation data from the Byzantine New Testament, Septuagint usage, Hebrew counterparts, papyri attestation, and classical lexicon excerpts.

Write in plain modern English. Ground every claim in the supplied evidence only — never add senses, etymologies, or theological interpretations the digest does not support. If the measured senses and the classical lexica disagree, say so plainly. Numbers in your prose must come from the digest.

Rules:
- "definition": one sentence, at most 25 words, that a modern reader instantly understands. Not a gloss list — a real definition.
- "senseLabels": one entry per MEASURED SENSE, in the same order, each a label of at most 6 words (e.g. "a spoken word or message"). If there are no measured senses, return an empty array.
- "article": 2 to 4 sentences. What the word means, how broad its range is, and the single most interesting piece of evidence (Hebrew counterpart, papyri usage, or a notable secondary sense). Conversational but precise.
- "caution": one sentence flagging genuine uncertainty (hapax, thin evidence, disputed range, sources disagreeing), or null if confidence is high and sources agree.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    definition: { type: 'string' },
    senseLabels: { type: 'array', items: { type: 'string' } },
    article: { type: 'string' },
    caution: { type: ['string', 'null'] },
  },
  required: ['definition', 'senseLabels', 'article', 'caution'],
  additionalProperties: false,
};

function requestParams(digest) {
  return {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content: `Evidence digest:\n\n${digest}\n\nWrite the entry.` }],
  };
}

// ── Result validation + persistence ──────────────────────────────────────────

function validateProse(parsed, entry) {
  if (!parsed || typeof parsed.definition !== 'string' || !parsed.definition.trim()) return 'missing definition';
  if (!Array.isArray(parsed.senseLabels)) return 'missing senseLabels';
  if (parsed.senseLabels.length > (entry.senses?.length || 0)) {
    parsed.senseLabels = parsed.senseLabels.slice(0, entry.senses?.length || 0);
  }
  if (typeof parsed.article !== 'string' || !parsed.article.trim()) return 'missing article';
  return null;
}

function loadDoneSet() {
  const done = new Map();
  if (fs.existsSync(RESULTS_FILE)) {
    for (const line of fs.readFileSync(RESULTS_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); done.set(r.s, r); } catch { /* skip corrupt line */ }
    }
  }
  return done;
}

function appendResult(result) {
  fs.appendFileSync(RESULTS_FILE, JSON.stringify(result) + '\n');
}

// ── Merge results into shards ────────────────────────────────────────────────

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
      entry.prose = { def: r.definition, senseLabels: r.senseLabels, article: r.article, caution: r.caution, model: r.model, v: PROSE_VERSION };
      changed = true;
      merged++;
    }
    if (changed) fs.writeFileSync(file, JSON.stringify(data));
  }
  console.log(`Merged prose into ${merged} entries across shards.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(PROSE_DIR, { recursive: true });

  if (MERGE_ONLY) { mergeIntoShards(); return; }

  console.log(`Deep lexicon prose synthesis — model: ${MODEL}${MOCK ? ' (MOCK)' : ''}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  const { entries } = loadShards();
  const { lexicon, mm } = loadClassicalLexicon();
  const done = loadDoneSet();

  let targets = [...entries.values()]
    .filter(e => e.lemma) // need at least a lemma to write about
    .filter(e => !SAMPLE || SAMPLE.includes(e.s))
    .filter(e => e.count >= MIN_COUNT)
    .filter(e => !done.has(e.s))
    .sort((a, b) => b.count - a.count); // most-used words first
  if (LIMIT) targets = targets.slice(0, LIMIT);

  console.log(`${targets.length} entries to synthesize (${done.size} already done, skipped)`);
  if (!targets.length) { mergeIntoShards(); return; }

  const digests = new Map(targets.map(e => [e.s, buildDigest(e, lexicon[e.s], mm[e.s])]));

  if (DRY_RUN) {
    const first = targets[0];
    console.log('\n── SYSTEM PROMPT ──\n' + SYSTEM_PROMPT);
    console.log(`\n── DIGEST for G${first.s} ${first.lemma} ──\n` + digests.get(first.s));
    console.log('\n(dry run — nothing sent)');
    return;
  }

  if (MOCK) {
    for (const e of targets) {
      appendResult({
        s: e.s, model: 'mock',
        definition: `[MOCK] ${e.lemma}: ${e.senses?.[0]?.display || 'no measured sense'} — placeholder definition for plumbing tests.`,
        senseLabels: (e.senses || []).map(x => `[mock] ${x.display}`),
        article: `[MOCK] This placeholder article exists to test the merge pipeline and app display for ${e.lemma}. It is not real lexicography.`,
        caution: 'Mock data — do not ship.',
      });
    }
    console.log(`Wrote ${targets.length} mock results.`);
    mergeIntoShards();
    return;
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();

  // Small sample runs go straight to the Messages API (instant feedback);
  // everything else goes through the Batches API at 50% price.
  if (SAMPLE || targets.length <= 20) {
    for (const e of targets) {
      process.stdout.write(`  G${e.s} ${e.lemma}… `);
      try {
        const response = await client.messages.create(requestParams(digests.get(e.s)));
        const text = response.content.find(b => b.type === 'text')?.text || '';
        const parsed = JSON.parse(text);
        const problem = validateProse(parsed, e);
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

  // ── Batch path ──
  let state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
  if (!state.batchId) {
    console.log('Submitting batch…');
    const batch = await client.messages.batches.create({
      requests: targets.map(e => ({ custom_id: `g${e.s}`, params: requestParams(digests.get(e.s)) })),
    });
    state = { batchId: batch.id, submitted: targets.length, at: new Date().toISOString() };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`Batch ${batch.id} submitted (${targets.length} requests). Safe to interrupt — re-run to resume polling.`);
  } else {
    console.log(`Resuming batch ${state.batchId}…`);
  }

  // Poll until ended
  let batch;
  for (;;) {
    batch = await client.messages.batches.retrieve(state.batchId);
    if (batch.processing_status === 'ended') break;
    const c = batch.request_counts;
    console.log(`  ${batch.processing_status} — processing ${c.processing}, done ${c.succeeded + c.errored}`);
    await new Promise(r => setTimeout(r, 60_000));
  }
  console.log(`Batch ended: ${batch.request_counts.succeeded} succeeded, ${batch.request_counts.errored} errored.`);

  // Collect results
  const entryByStrongs = new Map(targets.map(e => [e.s, e]));
  for await (const result of await client.messages.batches.results(state.batchId)) {
    const s = Number(String(result.custom_id).replace(/^g/, ''));
    const entry = entryByStrongs.get(s) || entries.get(s);
    if (result.result.type !== 'succeeded') {
      appendResult({ s, error: result.result.type });
      continue;
    }
    const msg = result.result.message;
    const text = msg.content.find(b => b.type === 'text')?.text || '';
    try {
      const parsed = JSON.parse(text);
      const problem = validateProse(parsed, entry || {});
      if (problem) { appendResult({ s, error: problem }); continue; }
      appendResult({ s, model: MODEL, ...parsed });
    } catch {
      appendResult({ s, error: 'unparseable output' });
    }
  }
  fs.unlinkSync(STATE_FILE); // batch consumed
  mergeIntoShards();
  console.log('\nDone. Re-run with --merge-only any time to re-apply results to freshly rebuilt shards.');
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
