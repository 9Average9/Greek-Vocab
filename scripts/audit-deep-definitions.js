#!/usr/bin/env node
// scripts/audit-deep-definitions.js — Stage 3 of the Rhēma deep lexicon.
//
// Audits every entry's existing AI-generated prose definition against four
// criteria no rule-based script can check:
//   1. Grammatical accuracy  — does the def cover the word's full morphological range?
//   2. Contextual fit        — does it hold across all NT books and authors?
//   3. Author intent         — are author-specific usage patterns flagged where they differ?
//   4. Receipts              — 2–3 concrete verse citations that prove (or challenge) the definition
//
// This is a ONE-TIME, OFFLINE audit step. Nothing here runs in the app.
// Output:
//   data/quality/definition-audit/results.jsonl    per-entry verdicts (resumable)
//   data/quality/definition-audit/state.json       batch state
//   data/quality/definition-audit/report.md        human-readable summary
//   data/quality/definition-audit/report.json      machine-readable full report
//
// Audit results are merged into shards as entry.audit = { verdict, score, issues, receipts, ... }
// Use --apply-fixes to also overwrite prose.def / prose.senseLabels for revised entries.
//
// Cost (Batches API, 50 % off; ~1 500 input + ~300 output tokens per entry):
//   claude-sonnet-4-6    ≈ $25   (default — best value for auditing)
//   claude-opus-4-8      ≈ $62   (highest quality; add --min-count 2 to stay under $50)
//   claude-haiku-4-5     ≈ $7    (fast, less nuanced)
//
// Usage:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   cd scripts && npm install && cd ..
//   node scripts/audit-deep-definitions.js --sample 3056,4487,26    # test a few words
//   node scripts/audit-deep-definitions.js --dry-run                 # preview prompt, no API call
//   node scripts/audit-deep-definitions.js                           # full audit (submits batch, polls, merges)
//   node scripts/audit-deep-definitions.js --merge-only              # re-merge results into shards
//   node scripts/audit-deep-definitions.js --merge-only --apply-fixes # also overwrite prose fields
//
// Flags:
//   --model <id>       model to use (default claude-sonnet-4-6)
//   --min-count <n>    skip entries with fewer than n NT occurrences (default: 0)
//   --sample <list>    comma-separated Strong's numbers; direct API, no batch
//   --limit <n>        cap entry count (for testing)
//   --dry-run          print digest + system prompt for the first entry and exit (free)
//   --mock             run the full pipeline without any API calls (plumbing test)
//   --merge-only       skip generation; re-apply results.jsonl to shards
//   --apply-fixes      when merging, overwrite prose.def/senseLabels for revised entries
//
// The script is resumable: results are appended to results.jsonl one line at a time,
// already-done entries are skipped on re-run, and an interrupted batch is picked up
// from state.json by batch ID.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..');
const DEEP_DIR  = path.join(ROOT, 'data', 'deep-lexicon');
const AUDIT_DIR = path.join(ROOT, 'data', 'quality', 'definition-audit');

const RESULTS_FILE = path.join(AUDIT_DIR, 'results.jsonl');
const STATE_FILE   = path.join(AUDIT_DIR, 'state.json');
const REPORT_JSON  = path.join(AUDIT_DIR, 'report.json');
const REPORT_MD    = path.join(AUDIT_DIR, 'report.md');

const AUDIT_VERSION = 1;

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null;
};

const MODEL       = typeof flag('model')     === 'string' ? flag('model')                       : 'claude-sonnet-4-6';
const MIN_COUNT   = parseInt(flag('min-count'), 10) || 0;
const SAMPLE      = typeof flag('sample')    === 'string' ? flag('sample').split(',').map(Number).filter(Boolean) : null;
const LIMIT       = parseInt(flag('limit'),   10) || 0;
const DRY_RUN     = Boolean(flag('dry-run'));
const MOCK        = Boolean(flag('mock'));
const MERGE_ONLY  = Boolean(flag('merge-only'));
const APPLY_FIXES = Boolean(flag('apply-fixes'));

// ── Constants ─────────────────────────────────────────────────────────────────

const BOOK_NAMES = {
  MAT: 'Matthew', MAR: 'Mark',  LUK: 'Luke',    JOH: 'John',    ACT: 'Acts',
  ROM: 'Romans',  '1CO': '1 Corinthians', '2CO': '2 Corinthians',
  GAL: 'Galatians', EPH: 'Ephesians', PHP: 'Philippians', COL: 'Colossians',
  '1TH': '1 Thessalonians', '2TH': '2 Thessalonians',
  '1TI': '1 Timothy',  '2TI': '2 Timothy', TIT: 'Titus', PHM: 'Philemon',
  HEB: 'Hebrews', JAS: 'James', '1PE': '1 Peter', '2PE': '2 Peter',
  '1JN': '1 John', '2JN': '2 John', '3JN': '3 John', JUD: 'Jude', REV: 'Revelation',
};

const SYNTAX_ROLES = {
  s: 'subject', p: 'predicate', o: 'direct object', io: 'indirect object',
  v: 'vocative', adv: 'adverbial', subst: 'substantive', appos: 'appositive',
};

// ── Load shards ───────────────────────────────────────────────────────────────

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

// ── Audit digest ──────────────────────────────────────────────────────────────

function plainText(html, max = 700) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function buildAuditDigest(entry, lex, mmText) {
  const lines = [];
  const prose = entry.prose || {};

  // ── Section 1: the definition being audited ──
  lines.push('=== CURRENT DEFINITION (the text you are auditing) ===');
  lines.push(`DEFINITION: ${prose.def || '(none)'}`);
  if (prose.senseLabels?.length) {
    lines.push(`SENSE LABELS: ${prose.senseLabels.map((l, i) => `${i + 1}. "${l}"`).join('; ')}`);
  }
  if (prose.article) lines.push(`SUPPORTING ARTICLE: ${prose.article}`);
  if (prose.caution)  lines.push(`EXISTING CAUTION: ${prose.caution}`);
  lines.push('');

  // ── Section 2: corpus evidence ──
  lines.push('=== CORPUS EVIDENCE ===');
  lines.push(`LEMMA: ${entry.lemma || '(unknown)'} (G${entry.s}${entry.translit ? `, ${entry.translit}` : ''})`);
  lines.push(
    `BYZANTINE NT OCCURRENCES: ${entry.count} across ` +
    `${Object.keys(entry.byBook || {}).length} book(s); ` +
    `critical text (SBLGNT): ${entry.critical?.count ?? 'n/a'}`
  );

  if (entry.byBook && Object.keys(entry.byBook).length > 1) {
    const dist = Object.entries(entry.byBook)
      .sort(([, a], [, b]) => b - a)
      .map(([book, count]) => `${BOOK_NAMES[book] || book} (${count}×)`)
      .join(', ');
    lines.push(`BY AUTHOR / BOOK: ${dist}`);
  }

  if (entry.senses?.length) {
    lines.push('MEASURED SENSES (every NT occurrence counted, ranked by frequency):');
    entry.senses.forEach((s, i) => {
      const bits = [`${s.count}× (${Math.round(s.share * 100)}%)`];
      if (s.bsbAgree != null) bits.push(`BSB independently agrees ${Math.round(s.bsbAgree * 100)}%`);
      if (s.corroborated?.length) bits.push(`corroborated by ${s.corroborated.join('/')}`);
      lines.push(`  ${i + 1}. "${s.display}" — ${bits.join('; ')}; e.g. ${(s.refs || []).slice(0, 3).join(', ')}`);
    });
  }
  if (entry.rare?.length) {
    lines.push(`RARE RENDERINGS: ${entry.rare.map(r => `"${r.display}"`).join(', ')}`);
  }
  if (entry.untranslated) {
    lines.push(`ABSORBED INTO PHRASING (no own English word): ${entry.untranslated}× of ${entry.count}`);
  }

  if (entry.syntax) {
    const roles = Object.entries(entry.syntax)
      .sort(([, a], [, b]) => b - a)
      .map(([role, count]) => `${SYNTAX_ROLES[role] || role} (${count}×)`)
      .join(', ');
    lines.push(`SYNTACTIC ROLES (Macula data): ${roles}`);
  }

  if (entry.lxx) {
    let s = `SEPTUAGINT: ${entry.lxx.count}× in ${entry.lxx.books} book(s)`;
    if (entry.lxx.hebrew?.length) {
      s += `; translates Hebrew ${entry.lxx.hebrew.map(h => `${h.lemma || 'H' + h.h} (${h.count}×)`).join(', ')}`;
    }
    lines.push(s);
  }
  if (entry.mm) lines.push('PAPYRI: attested in Moulton-Milligan documentary evidence (papyri / inscriptions).');

  // ── Section 3: classical lexica ──
  if (lex) {
    if (lex.strongs_def) lines.push(`STRONG'S: ${plainText(lex.strongs_def, 300)}`);
    if (lex.kjv_def)     lines.push(`KJV GLOSSES: ${plainText(lex.kjv_def, 200)}`);
    if (lex.brief || lex.extended) lines.push(`DODSON: ${plainText(lex.extended || lex.brief, 300)}`);
    if (lex.abbott_smith) lines.push(`ABBOTT-SMITH: ${plainText(lex.abbott_smith, 500)}`);
  }
  if (mmText) lines.push(`MOULTON-MILLIGAN (excerpt): ${plainText(mmText, 400)}`);

  lines.push(`CONFIDENCE TIER: ${entry.confidence}`);

  return lines.join('\n');
}

// ── System prompt + output schema ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Koine Greek lexicographer auditing definitions written for a Bible-study app used by ordinary readers. For each entry you receive:
  - The CURRENT DEFINITION and supporting article (what is already written — your subject)
  - Corpus-measured translation data: every NT occurrence, how it is rendered, ranked by frequency
  - Distribution across NT books and authors
  - Syntactic role data (subject, object, predicate, etc.)
  - Classical lexicon excerpts (Strong's, Dodson, Abbott-Smith)

Audit the current definition on four criteria:

1. GRAMMATICAL ACCURACY — Does the definition cover the word's full morphological range?
   A verb definition that only works in active voice fails when the word appears middle or passive.
   A noun defined as singular with "the" may mislead when it appears plural or anarthrous.
   Check that the definition form (infinitive for verbs, noun phrase for nouns) is consistent
   with how the word actually functions in the listed syntactic roles.

2. CONTEXTUAL FIT — Does the definition hold across every measured sense listed?
   A sense accounting for ≥15 % of occurrences that the definition ignores is a gap.
   A sense that contradicts the definition is a conflict. Note both.

3. AUTHOR INTENT — If the word spans multiple NT authors and any author uses it distinctly,
   flag that in author_note. Paul's theological density, John's dualistic framing, Luke's
   historical precision, and Hebrews' cultic context are all real tendencies. A definition
   that works perfectly for Paul but misleads a reader of John should say so.

4. RECEIPTS — Name exactly 2–3 specific NT verses (using the abbreviations in the evidence,
   e.g. "ROM 3:28", "JOH 1:1", "HEB 4:12") that clearly demonstrate the definition is right.
   For needs_revision or misleading verdicts, at least one receipt should show where it fails
   or needs qualification.

Scoring guide:
  90–100  accurate:        definition is grammatically precise, covers the full range, receipts clear
  70–89   needs_revision:  broadly correct but missing a nuance, a sense, or author variation
  0–69    misleading:      definition fails for a significant portion of occurrences, or is
                           grammatically wrong, or omits a theologically important sense

Output rules:
- issues: an array of short, specific strings. Empty array if verdict is "accurate".
- receipts: exactly 2–3 objects with a "ref" (book abbreviation + chapter:verse) and a one-sentence "how" explaining what the verse demonstrates.
- revised_def: a corrected one-sentence definition (≤25 words, plain modern English) if verdict is needs_revision or misleading; null otherwise.
- revised_sense_labels: corrected labels in the same order as the MEASURED SENSES if the existing labels are wrong or missing; null if no change needed.
- author_note: a one-sentence note if two or more NT authors use the word in detectably different ways; null if usage is uniform.
- Ground every claim only in the supplied evidence — no outside claims.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['accurate', 'needs_revision', 'misleading'] },
    score: { type: 'integer' },
    issues: { type: 'array', items: { type: 'string' } },
    receipts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          how: { type: 'string' },
        },
        required: ['ref', 'how'],
        additionalProperties: false,
      },
    },
    author_note:           { type: ['string', 'null'] },
    revised_def:           { type: ['string', 'null'] },
    revised_sense_labels:  { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
  },
  required: ['verdict', 'score', 'issues', 'receipts', 'author_note', 'revised_def', 'revised_sense_labels'],
  additionalProperties: false,
};

function requestParams(digest) {
  return {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content: `Audit this entry:\n\n${digest}` }],
  };
}

// ── Validation + persistence ───────────────────────────────────────────────────

function validateAudit(parsed) {
  if (!parsed) return 'null response';
  if (!['accurate', 'needs_revision', 'misleading'].includes(parsed.verdict)) return 'invalid verdict';
  if (typeof parsed.score !== 'number' || parsed.score < 0 || parsed.score > 100) return 'missing or out-of-range score';
  if (!Array.isArray(parsed.issues)) return 'missing issues array';
  if (!Array.isArray(parsed.receipts) || parsed.receipts.length < 2) return 'fewer than 2 receipts';
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

// ── Merge into shards ─────────────────────────────────────────────────────────

function mergeIntoShards(applyFixes = false) {
  const done = loadDoneSet();
  if (!done.size) { console.log('No results to merge.'); return; }

  const index = JSON.parse(fs.readFileSync(path.join(DEEP_DIR, 'index.json'), 'utf8'));
  let merged = 0, fixed = 0;

  for (const shard of index.shards) {
    const file = path.join(DEEP_DIR, shard.file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = false;

    for (const [s, entry] of Object.entries(data)) {
      const r = done.get(Number(s));
      if (!r || r.error) continue;

      entry.audit = {
        verdict:     r.verdict,
        score:       r.score,
        issues:      r.issues,
        receipts:    r.receipts,
        author_note: r.author_note,
        v:           AUDIT_VERSION,
      };

      if (applyFixes && r.verdict !== 'accurate' && r.revised_def) {
        if (!entry.prose) entry.prose = {};
        entry.prose.def = r.revised_def;
        if (r.revised_sense_labels) entry.prose.senseLabels = r.revised_sense_labels;
        fixed++;
      }

      changed = true;
      merged++;
    }

    if (changed) fs.writeFileSync(file, JSON.stringify(data));
  }

  console.log(`Merged audit results into ${merged} entries.${applyFixes ? ` Applied prose fixes to ${fixed} entries.` : ''}`);
  writeReport(done);
}

// ── Report ────────────────────────────────────────────────────────────────────

function writeReport(done) {
  const all = [...done.values()].filter(r => !r.error);
  const byVerdict = { accurate: 0, needs_revision: 0, misleading: 0 };
  let totalScore = 0;
  const needsAttention = [];

  for (const r of all) {
    byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
    totalScore += r.score || 0;
    if (r.verdict !== 'accurate') needsAttention.push(r);
  }

  needsAttention.sort((a, b) => (a.score ?? 100) - (b.score ?? 100));

  const report = {
    generatedAt: new Date().toISOString(),
    total:       all.length,
    byVerdict,
    avgScore:    all.length ? Math.round(totalScore / all.length) : 0,
    needsAttention: needsAttention.slice(0, 300),
  };

  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));

  const lines = [];
  lines.push('# Rhema Definition Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Total audited: **${report.total}**  |  Average score: **${report.avgScore}/100**`);
  lines.push('');
  lines.push('## Verdicts');
  lines.push(`- accurate: ${byVerdict.accurate}`);
  lines.push(`- needs_revision: ${byVerdict.needs_revision}`);
  lines.push(`- misleading: ${byVerdict.misleading}`);
  lines.push('');

  if (needsAttention.length) {
    const cap = Math.min(needsAttention.length, 100);
    lines.push(`## Entries Needing Attention (lowest scores first; showing ${cap} of ${needsAttention.length})`);
    lines.push('');

    for (const r of needsAttention.slice(0, cap)) {
      lines.push(`### G${r.s} ${r.lemma || ''} — ${r.verdict} (score: ${r.score})`);
      if (r.issues?.length)  lines.push(`**Issues:** ${r.issues.join('; ')}`);
      if (r.author_note)     lines.push(`**Author note:** ${r.author_note}`);
      if (r.receipts?.length) {
        lines.push('**Receipts:**');
        for (const rec of r.receipts) lines.push(`- ${rec.ref}: ${rec.how}`);
      }
      if (r.revised_def)           lines.push(`**Suggested definition:** ${r.revised_def}`);
      if (r.revised_sense_labels)  lines.push(`**Suggested sense labels:** ${r.revised_sense_labels.join('; ')}`);
      lines.push('');
    }
  }

  fs.writeFileSync(REPORT_MD, lines.join('\n') + '\n');
  console.log(`Report written → ${REPORT_MD}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });

  if (MERGE_ONLY) {
    mergeIntoShards(APPLY_FIXES);
    return;
  }

  console.log(`Rhema definition audit — model: ${MODEL}${MOCK ? ' (MOCK)' : ''}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const { entries } = loadShards();
  const { lexicon, mm } = loadClassicalLexicon();
  const done = loadDoneSet();

  let targets = [...entries.values()]
    .filter(e => e.lemma)
    .filter(e => !SAMPLE || SAMPLE.includes(e.s))
    .filter(e => e.count >= MIN_COUNT)
    .filter(e => !done.has(e.s))
    .sort((a, b) => b.count - a.count); // most-used words first
  if (LIMIT) targets = targets.slice(0, LIMIT);

  console.log(`${targets.length} entries to audit (${done.size} already done, skipped)`);
  if (!targets.length) { mergeIntoShards(APPLY_FIXES); return; }

  const digests = new Map(targets.map(e => [e.s, buildAuditDigest(e, lexicon[e.s], mm[e.s])]));

  if (DRY_RUN) {
    const first = targets[0];
    console.log('\n── SYSTEM PROMPT ──\n' + SYSTEM_PROMPT);
    console.log(`\n── DIGEST for G${first.s} ${first.lemma} ──\n` + digests.get(first.s));
    console.log('\n(dry run — nothing sent to the API)');
    return;
  }

  if (MOCK) {
    for (const e of targets) {
      const firstRef = e.senses?.[0]?.refs?.[0] || 'ROM 1:1';
      appendResult({
        s: e.s, lemma: e.lemma, model: 'mock',
        verdict: 'accurate', score: 95,
        issues: [],
        receipts: [
          { ref: firstRef, how: '[MOCK] Placeholder receipt for plumbing test.' },
          { ref: firstRef, how: '[MOCK] Second placeholder receipt.' },
        ],
        author_note: null,
        revised_def: null,
        revised_sense_labels: null,
      });
    }
    console.log(`Wrote ${targets.length} mock results.`);
    mergeIntoShards(APPLY_FIXES);
    return;
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();

  // Small runs (sample flag or ≤20 entries) → direct Messages API for instant feedback.
  // Larger runs → Batches API at 50 % price.
  if (SAMPLE || targets.length <= 20) {
    for (const e of targets) {
      process.stdout.write(`  G${e.s} ${e.lemma}… `);
      try {
        const response = await client.messages.create(requestParams(digests.get(e.s)));
        const text    = response.content.find(b => b.type === 'text')?.text || '';
        const parsed  = JSON.parse(text);
        const problem = validateAudit(parsed);
        if (problem) {
          console.log(`✗ ${problem}`);
          appendResult({ s: e.s, lemma: e.lemma, error: problem });
          continue;
        }
        appendResult({ s: e.s, lemma: e.lemma, model: MODEL, ...parsed });
        console.log(`✓ ${parsed.verdict} (${parsed.score}) — ${parsed.issues[0] || 'no issues'}`);
      } catch (err) {
        console.log(`✗ ${err.message}`);
        appendResult({ s: e.s, lemma: e.lemma, error: String(err.message) });
      }
    }
    mergeIntoShards(APPLY_FIXES);
    return;
  }

  // ── Batch path ────────────────────────────────────────────────────────────

  let state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};

  if (!state.batchId) {
    console.log('Submitting batch…');
    const batch = await client.messages.batches.create({
      requests: targets.map(e => ({ custom_id: `g${e.s}`, params: requestParams(digests.get(e.s)) })),
    });
    state = { batchId: batch.id, submitted: targets.length, at: new Date().toISOString() };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`Batch ${batch.id} submitted (${targets.length} requests).`);
    console.log('Safe to interrupt — re-run the same command to resume polling.');
  } else {
    console.log(`Resuming batch ${state.batchId}…`);
  }

  // Poll until the batch finishes
  let batch;
  for (;;) {
    batch = await client.messages.batches.retrieve(state.batchId);
    if (batch.processing_status === 'ended') break;
    const c = batch.request_counts;
    console.log(`  ${batch.processing_status} — processing ${c.processing}, finished ${c.succeeded + c.errored}`);
    await new Promise(r => setTimeout(r, 60_000));
  }
  console.log(`Batch ended: ${batch.request_counts.succeeded} succeeded, ${batch.request_counts.errored} errored.`);

  // Collect results from the batch stream
  const entryByStrongs = new Map(targets.map(e => [e.s, e]));
  for await (const result of await client.messages.batches.results(state.batchId)) {
    const s     = Number(String(result.custom_id).replace(/^g/, ''));
    const entry = entryByStrongs.get(s);
    if (result.result.type !== 'succeeded') {
      appendResult({ s, lemma: entry?.lemma, error: result.result.type });
      continue;
    }
    const text = result.result.message.content.find(b => b.type === 'text')?.text || '';
    try {
      const parsed  = JSON.parse(text);
      const problem = validateAudit(parsed);
      if (problem) {
        appendResult({ s, lemma: entry?.lemma, error: problem });
        continue;
      }
      appendResult({ s, lemma: entry?.lemma, model: MODEL, ...parsed });
    } catch {
      appendResult({ s, lemma: entry?.lemma, error: 'unparseable JSON output' });
    }
  }

  fs.unlinkSync(STATE_FILE); // batch consumed; clean up
  mergeIntoShards(APPLY_FIXES);
  console.log('\nDone. Re-run with --merge-only any time to re-apply results to freshly rebuilt shards.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
