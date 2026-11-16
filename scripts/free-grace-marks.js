#!/usr/bin/env node
// Which parts of a word study were written in the Free Grace review.
//
// 270 word studies were revised so that, where they take a theological
// direction, they follow the Free Grace reading (data/deep-lexicon/study/work/
// FREE-GRACE.md). The app keeps that content but labels it, so a reader can
// always tell a lexical fact from a theological reading. This compares each
// revised study with the version before the review (both rows are kept in
// results.jsonl) and records every note whose wording is new or changed (even
// a small edit can carry the reading: "…the mark of knowing God in close
// fellowship") as `study.fg`, a list of paths:
//   'summary', 'translationNote', 'exegesisTip', 'caution',
//   'senses.N' (its label, definition or note), 'authorNotes.N'.
//
//   node scripts/free-grace-marks.js          # mark the shards in place
//
// build-word-study.js --merge-only calls freeGraceMarks() too, so a re-merge
// keeps the marks.

const fs = require('fs');
const path = require('path');

const FG_MODEL = /free-grace/;
// British and American spellings count as the same word (the studies were
// later changed to American spelling: scripts/americanize-spelling.py).
const US = (t) => t.replace(/^practis/, 'practic').replace(/^jewellery$/, 'jewelry').replace(/^catalogue(s|d)?$/, 'catalog$1')
  .replace(/^acknowledgement/, 'acknowledgment').replace(/^programme(s)?$/, 'program$1').replace(/^(whilst)$/, 'while').replace(/^learnt$/, 'learned')
  .replace(/our(s|ed|ing|able|ably|ite|ites|ful|hood|er|ers|al)?$/, 'or$1')
  .replace(/is(e|ed|es|ing|ation|ations)$/, 'iz$1').replace(/yse(d)?$/, 'yze$1')
  .replace(/([aeiou][^aeiou])l(ed|ing|er|ers)$/, '$1$2').replace(/pp(ed|ing|er|ers)$/, 'p$1')
  .replace(/^fulfil(s|ment)?$/, 'fulfill$1').replace(/(c|f|t|m|b)re(s|d)?$/, '$1er$2').replace(/ence(s)?$/, 'ense$1')
  .replace(/^grey/, 'gray').replace(/^judgement/, 'judgment').replace(/^mould/, 'mold').replace(/^plough/, 'plow');
const words = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).map(US);

// Word-level similarity, 0..1 (2·LCS / total words), like difflib's ratio.
function similarity(a, b) {
  const x = words(a), y = words(b);
  if (!x.length && !y.length) return 1;
  const prev = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diag = 0;
    for (let j = 1; j <= y.length; j++) {
      const up = prev[j];
      prev[j] = x[i - 1] === y[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = up;
    }
  }
  return (2 * prev[y.length]) / (x.length + y.length);
}

function texts(study) {
  const out = [];
  const add = (p, t) => { if (typeof t === 'string' && t.trim()) out.push([p, t]); };
  add('summary', study?.summary);
  (study?.senses || []).forEach((s, i) => { add(`senses.${i}`, s?.label); add(`senses.${i}`, s?.definition); add(`senses.${i}`, s?.note); });
  (study?.authorNotes || []).forEach((a, i) => add(`authorNotes.${i}`, a?.note));
  for (const k of ['translationNote', 'exegesisTip', 'caution']) add(k, study?.[k]);
  return out;
}

// prev: the study before the review (raw or verified; verifying only drops
// items, it never rewrites text). study: the reviewed study as shown.
function freeGraceMarks(prev, study) {
  const before = texts(prev).map(([, t]) => t);
  const exact = new Set(before);
  const marks = new Set();
  for (const [p, t] of texts(study)) {
    if (exact.has(t) || marks.has(p)) continue;
    const best = before.reduce((m, o) => Math.max(m, similarity(t, o)), 0);
    if (best < 1) marks.add(p); // any change of wording
  }
  return [...marks];
}

// results.jsonl → { s: { prev, fg } } for studies whose latest row is the review.
function reviewPairs(resultsFile) {
  const rows = new Map();
  for (const line of fs.readFileSync(resultsFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.error) continue; if (!rows.has(r.s)) rows.set(r.s, []); rows.get(r.s).push(r); } catch {}
  }
  const pairs = new Map();
  for (const [s, list] of rows) {
    const last = list[list.length - 1];
    if (!FG_MODEL.test(last.model || '')) continue;
    const prev = [...list].reverse().find((r) => !FG_MODEL.test(r.model || ''));
    pairs.set(Number(s), { prev: prev?.study || null, fg: last.study });
  }
  return pairs;
}

module.exports = { freeGraceMarks, reviewPairs, FG_MODEL };

if (require.main === module) {
  const DEEP = path.join(__dirname, '..', 'data', 'deep-lexicon');
  const pairs = reviewPairs(path.join(DEEP, 'study', 'results.jsonl'));
  const index = JSON.parse(fs.readFileSync(path.join(DEEP, 'index.json'), 'utf8'));
  let studies = 0, marked = 0;
  for (const shard of index.shards) {
    const file = path.join(DEEP, shard.file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = false;
    for (const [s, entry] of Object.entries(data)) {
      const st = entry.study;
      if (!st || !FG_MODEL.test(st.model || '')) continue;
      const pair = pairs.get(Number(s));
      const fg = pair?.prev ? freeGraceMarks(pair.prev, st) : ['summary'];
      if (JSON.stringify(st.fg) !== JSON.stringify(fg)) { st.fg = fg; changed = true; }
      studies++; marked += fg.length;
    }
    if (changed) fs.writeFileSync(file, JSON.stringify(data));
  }
  console.log(`Free Grace marks: ${studies} studies, ${marked} notes marked.`);
}
