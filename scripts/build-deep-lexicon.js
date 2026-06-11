#!/usr/bin/env node
// scripts/build-deep-lexicon.js — Stage 1 of the Rhēma deep lexicon.
//
// Builds an evidence-backed, fully auditable range of meaning for every Greek
// Strong's number from data already in this repo — no network, no AI:
//
//   1. Trains a statistical word-alignment model (IBM Model 1 with a NULL
//      token) between the Byzantine NT (rhema-nt.js, RP2018) and the Majority
//      Standard Bible (rhema-msb.js), which is translated from that same
//      Greek text. Every occurrence of every word gets an attested English
//      rendering with a verse citation.
//   2. Trains the same model against the Berean Standard Bible (rhema-bsb.js)
//      as an independent cross-check, and records per-sense agreement.
//   3. Groups occurrences into senses (normalized renderings), ranked by
//      frequency, each with counts, share, citations, and corroboration flags
//      against the shipped lexica (Dodson / Strong's / KJV glosses).
//   4. Adds LXX usage statistics and the Hebrew words each Greek word
//      translates in the LXX (a second alignment model over
//      rhema-lxx.js ↔ rhema-ot-hebrew.js).
//   5. Adds Byzantine-vs-critical-text occurrence deltas (rhema-critical.js),
//      syntax-role distribution (rhema-syntax.js), and Moulton-Milligan
//      documentary-evidence flags (rhema-mm.js).
//   6. Assigns a confidence tier and generates a deterministic
//      "why this definition" explanation from the numbers.
//
// Output (not yet wired into the app — that is Stage 3):
//   data/deep-lexicon/spine.json            tiny: strongs → [lemma, top gloss, count, confidence]
//   data/deep-lexicon/index.json            shard manifest + build metadata
//   data/deep-lexicon/shard-NNNN.json       full entries, 100 Strong's numbers per shard
//   data/deep-lexicon/report-sample.md      human-readable entries for spot-checking
//
// Run: node scripts/build-deep-lexicon.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'deep-lexicon');

// ── Load the app data files (window.X = {...} format) ───────────────────────

function loadWindowGlobals(...files) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(src, sandbox, { filename: file });
  }
  return sandbox.window;
}

// ── English tokenizing / stemming ────────────────────────────────────────────

// Irregular form → base. Mirrors the app's list (app.js) so highlighting and
// sense grouping agree on what counts as "the same word".
const IRREGULAR_BASE = {};
{
  const irregular = {
    arise: ['arose', 'arisen'], bear: ['bore', 'borne', 'born'], begin: ['began', 'begun'],
    bind: ['bound'], blow: ['blew', 'blown'], break: ['broke', 'broken'], bring: ['brought'],
    build: ['built'], buy: ['bought'], catch: ['caught'], child: ['children'],
    choose: ['chose', 'chosen'], come: ['came'], die: ['died', 'dying'],
    draw: ['drew', 'drawn'], drink: ['drank', 'drunk'], drive: ['drove', 'driven'],
    dwell: ['dwelt', 'dwelled'], eat: ['ate', 'eaten'], fall: ['fell', 'fallen'],
    feed: ['fed'], feel: ['felt'], fight: ['fought'], find: ['found'], flee: ['fled'],
    fly: ['flew', 'flown'], foot: ['feet'], forgive: ['forgave', 'forgiven'],
    forsake: ['forsook', 'forsaken'], get: ['got', 'gotten'], give: ['gave', 'given'],
    go: ['went', 'gone', 'goes', 'going'], grow: ['grew', 'grown'],
    have: ['had', 'has', 'having'], hear: ['heard'], hide: ['hid', 'hidden'], hold: ['held'],
    keep: ['kept'], know: ['knew', 'known'], lay: ['laid'], lead: ['led'], leave: ['left'],
    lie: ['lain', 'lying'], light: ['lit'], make: ['made'], man: ['men'],
    mean: ['meant'], meet: ['met'], pay: ['paid'], rise: ['rose', 'risen'],
    run: ['ran', 'running'], say: ['said'], see: ['saw', 'seen'], seek: ['sought'],
    sell: ['sold'], send: ['sent'], shake: ['shook', 'shaken'],
    shine: ['shone'], show: ['showed', 'shown'], sing: ['sang', 'sung'],
    sit: ['sat', 'sitting'], slay: ['slew', 'slain'], sleep: ['slept'],
    speak: ['spoke', 'spoken'], spring: ['sprang', 'sprung'], stand: ['stood'],
    steal: ['stole', 'stolen'], strike: ['struck'], swear: ['swore', 'sworn'],
    take: ['took', 'taken'], teach: ['taught'], tear: ['tore', 'torn'], tell: ['told'],
    think: ['thought'], throw: ['threw', 'thrown'], understand: ['understood'],
    wear: ['wore', 'worn'], weep: ['wept'], win: ['won'], woman: ['women'],
    write: ['wrote', 'written'],
  };
  for (const [base, forms] of Object.entries(irregular)) {
    for (const f of forms) IRREGULAR_BASE[f] = base;
  }
}

function stem(word) {
  let w = word.toLowerCase();
  if (IRREGULAR_BASE[w]) return IRREGULAR_BASE[w];
  if (w.length <= 3) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  if (/ied$/.test(w)) return w.slice(0, -3) + 'y';
  if (/ying$/.test(w) && w.length > 5) return w.slice(0, -4) + 'ie';
  if (/ing$/.test(w) && w.length > 5) {
    let s = w.slice(0, -3);
    if (/([^aeiou])\1$/.test(s)) s = s.slice(0, -1);          // running → run
    else if (/[^aeiou][aeiou][^aeiouwxy]$/.test(s)) s += 'e'; // making → make
    return s;
  }
  if (/ed$/.test(w) && w.length > 4) {
    let s = w.slice(0, -2);
    if (/([^aeiou])\1$/.test(s)) s = s.slice(0, -1);          // stopped → stop
    else if (/[^aeiou][aeiou][^aeiouwxy]$/.test(s)) s += 'e'; // loved → love
    else if (/[^aeiou]$/.test(s) && /e$/.test(w.slice(0, -1))) s = w.slice(0, -1);
    return s;
  }
  return w;
}

function tokenizeEnglish(text) {
  // Case is preserved for display; stems lowercase internally.
  return String(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”—–…]/g, ' ')
    .split(/[^a-zA-Z']+/)
    .map(t => t.replace(/^'+|'+$/g, ''))
    .filter(t => t.length > 0);
}

// Function words trimmed off the edges of a rendering when forming a sense key
// for a Greek *content* word ("the word" → "word", "was teaching" → "teach").
const EDGE_FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'as', 'so',
  'be', 'is', 'are', 'was', 'were', 'been', 'being', 'am',
  'do', 'does', 'did', 'have', 'has', 'had', 'having',
  'will', 'shall', 'would', 'should', 'may', 'might', 'must', 'can', 'could',
  'he', 'she', 'it', 'they', 'them', 'him', 'her', 'his', 'its', 'their',
  'i', 'we', 'you', 'me', 'us', 'my', 'our', 'your',
  'who', 'whom', 'that', 'which', 'this', 'these', 'those', 'there',
  'not', 'no', 'for', 'with', 'from', 'into', 'unto', 'upon',
  'because', 'about', 'but', 'if', 'then', 'when', 'also', 'too', 'very',
]);

// Words that cannot, on their own, be the gloss of a Greek content word
// (noun/verb/adjective/adverb). If a content word's whole rendering is made of
// these, the alignment latched onto English connective tissue and the
// occurrence is treated as "absorbed" rather than as a sense. Deliberately
// smaller than EDGE_FUNCTION_WORDS: words like "again", "all", "now", "out"
// are legitimate single-word glosses (πάλιν, πᾶς, νῦν, ἔξω) and stay out.
const NOISE_GLOSS_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'have', 'has', 'had',
  'will', 'shall', 'would', 'should', 'may', 'might', 'must', 'can', 'could',
  'he', 'she', 'it', 'they', 'them', 'him', 'her', 'his', 'its', 'their',
  'i', 'we', 'you', 'me', 'us', 'my', 'our', 'your',
  'that', 'which', 'this', 'who', 'whom', 'there',
  'for', 'with', 'from', 'but', 'if', 'because', 'so', 'then',
]);

// Greek POS prefixes that mark content words (vs articles/pronouns/particles).
// Pronouns (P/D/R/S…) are excluded: their correct glosses ARE function words.
function isContentMorph(morph = '') {
  const pos = String(morph).split('-')[0];
  return pos === 'N' || pos === 'V' || pos === 'A' || pos === 'ADV';
}

// ── String interning (numeric IDs make the EM tables small and fast) ─────────

class Interner {
  constructor() { this.map = new Map(); this.list = []; }
  id(str) {
    let v = this.map.get(str);
    if (v === undefined) { v = this.list.length; this.map.set(str, v); this.list.push(str); }
    return v;
  }
  str(id) { return this.list[id]; }
  get size() { return this.list.length; }
}

// ── IBM Model 1 (with NULL source token) ─────────────────────────────────────
//
// corpus: array of { src: Int32Array of source-token ids (deduped, includes 0
// = NULL), tgt: Int32Array of target-token ids }. Trains t(tgt | src), keyed
// numerically as src * keyBase + tgt.

function trainModel1(corpus, keyBase, iterations, label) {
  let t = new Map();
  // Init: uniform over co-occurring pairs.
  for (const { src, tgt } of corpus) {
    for (const s of src) for (const e of tgt) t.set(s * keyBase + e, 1);
  }
  console.log(`  [${label}] ${corpus.length} verse pairs, ${t.size} co-occurring pairs`);

  for (let iter = 0; iter < iterations; iter++) {
    const counts = new Map();
    const totals = new Map();
    for (const { src, tgt } of corpus) {
      for (const e of tgt) {
        let z = 0;
        for (const s of src) z += t.get(s * keyBase + e) || 0;
        if (!z) continue;
        for (const s of src) {
          const key = s * keyBase + e;
          const p = (t.get(key) || 0) / z;
          if (!p) continue;
          counts.set(key, (counts.get(key) || 0) + p);
          totals.set(s, (totals.get(s) || 0) + p);
        }
      }
    }
    const next = new Map();
    for (const [key, c] of counts) {
      const s = Math.floor(key / keyBase);
      const p = c / totals.get(s);
      if (p > 1e-6) next.set(key, p); // prune dust to keep the table lean
    }
    t = next;
    process.stdout.write(`  [${label}] EM iteration ${iter + 1}/${iterations} (${t.size} live pairs)\n`);
  }
  return t;
}

// ── Corpus assembly: Byzantine NT ↔ English translation ─────────────────────

function* ntVerses(ntText) {
  for (const [book, chapters] of Object.entries(ntText)) {
    for (const [ch, verses] of Object.entries(chapters)) {
      for (const [v, words] of Object.entries(verses)) {
        yield { book, ch, v, words };
      }
    }
  }
}

function buildNtCorpus(ntText, english, stems) {
  const corpus = [];
  for (const { book, ch, v, words } of ntVerses(ntText)) {
    const engText = english[book]?.[ch]?.[v];
    if (!engText) continue;
    const tgt = tokenizeEnglish(engText).map(w => stems.id(stem(w)));
    if (!tgt.length) continue;
    const srcSet = new Set([0]); // 0 = NULL
    for (const w of words) srcSet.add(w[1]);
    corpus.push({
      book, ch, v, words,
      engWords: tokenizeEnglish(engText),
      src: Int32Array.from(srcSet),
      tgt: Int32Array.from(tgt),
    });
  }
  return corpus;
}

// ── Per-occurrence alignment ─────────────────────────────────────────────────
//
// Each English word picks its most probable Greek source (or NULL); ties among
// repeated occurrences of the same Strong's number break by relative position.
// A Greek occurrence's rendering = its aligned English words in verse order.

function alignVerse(verse, t, keyBase, stems) {
  const { words, engWords } = verse;
  const aligned = words.map(() => []); // english indices per greek occurrence
  const nEng = engWords.length;

  const nullIdxs = [];
  for (let j = 0; j < nEng; j++) {
    const e = stems.id(stem(engWords[j]));
    let bestS = 0, bestP = t.get(e) /* NULL key: 0*keyBase+e */ || 1e-9;
    for (const w of words) {
      const p = t.get(w[1] * keyBase + e) || 0;
      if (p > bestP) { bestP = p; bestS = w[1]; }
    }
    if (bestS === 0) { nullIdxs.push(j); continue; }
    // position tiebreak among occurrences of bestS
    let bestIdx = -1, bestDist = Infinity;
    const relE = j / nEng;
    for (let i = 0; i < words.length; i++) {
      if (words[i][1] !== bestS) continue;
      const d = Math.abs(i / words.length - relE);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0) aligned[bestIdx].push(j);
  }

  // Repair pass: a Greek content word left with no rendering may reclaim an
  // English content word from NULL or from an occurrence that claimed two or
  // more words, when the model still gives the pair real probability. This
  // recovers secondary senses ("settle accounts", "one question" for λόγος)
  // that a stronger competitor in the same verse would otherwise swallow.
  const stealable = j => {
    const lw = engWords[j].toLowerCase();
    return !NOISE_GLOSS_WORDS.has(lw) && !EDGE_FUNCTION_WORDS.has(lw);
  };
  for (let i = 0; i < words.length; i++) {
    if (aligned[i].length || !isContentMorph(words[i][2])) continue;
    let bestJ = -1, bestP = 0.01, bestFrom = -1;
    for (const j of nullIdxs) {
      if (!stealable(j)) continue;
      const p = t.get(words[i][1] * keyBase + stems.id(stem(engWords[j]))) || 0;
      if (p > bestP) { bestP = p; bestJ = j; bestFrom = -1; }
    }
    for (let k = 0; k < words.length; k++) {
      if (aligned[k].length < 2) continue;
      for (const j of aligned[k]) {
        if (!stealable(j)) continue;
        const p = t.get(words[i][1] * keyBase + stems.id(stem(engWords[j]))) || 0;
        if (p > bestP) { bestP = p; bestJ = j; bestFrom = k; }
      }
    }
    if (bestJ >= 0) {
      if (bestFrom >= 0) aligned[bestFrom] = aligned[bestFrom].filter(j => j !== bestJ);
      else nullIdxs.splice(nullIdxs.indexOf(bestJ), 1);
      aligned[i].push(bestJ);
      alignVerse.repaired = (alignVerse.repaired || 0) + 1;
    }
  }

  return aligned.map((engIdxs, i) => {
    if (!engIdxs.length) return { rendering: '', words: [] };
    let idxs = engIdxs.slice().sort((a, b) => a - b);
    // Two English tokens with the same stem on one Greek occurrence ("word …
    // word") is double-counting from repeated phrasing — keep the first.
    const seenStems = new Set();
    idxs = idxs.filter(j => {
      const st = stem(engWords[j]);
      if (seenStems.has(st)) return false;
      seenStems.add(st);
      return true;
    });
    if (idxs.length > 4) {
      // Implausibly long span — keep only the single most probable word.
      const eId = w => stems.id(stem(engWords[w]));
      idxs = [idxs.reduce((a, b) =>
        (t.get(words[i][1] * keyBase + eId(b)) || 0) > (t.get(words[i][1] * keyBase + eId(a)) || 0) ? b : a)];
    }
    return { rendering: idxs.map(j => engWords[j]).join(' '), words: idxs.map(j => engWords[j]) };
  });
}

// Trim edge function words off a rendering for content words
// ("the word" → "word", "was teaching" → "teach").
function cleanRenderingWords(renderingWords, contentWord) {
  let ws = renderingWords.slice();
  if (contentWord) {
    while (ws.length > 1 && EDGE_FUNCTION_WORDS.has(ws[0].toLowerCase())) ws.shift();
    while (ws.length > 1 && EDGE_FUNCTION_WORDS.has(ws[ws.length - 1].toLowerCase())) ws.pop();
  }
  return ws.slice(0, 3);
}

// Normalize a rendering into a sense key (stemmed, lowercase). Returns '' when
// a content word's rendering is nothing but connective tissue — those
// occurrences count as "absorbed", not as a sense.
function senseKey(renderingWords, contentWord) {
  const ws = cleanRenderingWords(renderingWords, contentWord);
  if (contentWord && ws.every(w => NOISE_GLOSS_WORDS.has(w.toLowerCase()))) return '';
  return ws.map(w => stem(w)).join(' ');
}

// ── Lexicon gloss corroboration ──────────────────────────────────────────────

function lexiconGlossStems(lex) {
  const out = { dodson: new Set(), strongs: new Set(), kjv: new Set() };
  const harvest = (text, set) => {
    if (!text) return;
    String(text)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/^--\s*/, '')
      .split(/[,;:]|\bor\b|\band\b|\bi\.e\.\b|\be\.g\.\b/i)
      .forEach(part => {
        tokenizeEnglish(part).forEach(w => {
          const lw = w.toLowerCase();
          if (lw.length > 2 && !EDGE_FUNCTION_WORDS.has(lw)) set.add(stem(lw));
        });
      });
  };
  harvest(lex?.brief, out.dodson);
  harvest(lex?.extended, out.dodson);
  harvest(lex?.strongs_def, out.strongs);
  harvest(lex?.kjv_def, out.kjv);
  return out;
}

// ── Reference formatting ─────────────────────────────────────────────────────

function ref(book, ch, v) { return `${book} ${ch}:${v}`; }

function spreadRefs(occList, limit) {
  // Prefer citations spread across different books.
  const byBook = new Map();
  for (const o of occList) {
    if (!byBook.has(o.book)) byBook.set(o.book, []);
    byBook.get(o.book).push(o);
  }
  const out = [];
  const buckets = [...byBook.values()];
  let i = 0;
  while (out.length < limit) {
    let added = false;
    for (const bucket of buckets) {
      if (i < bucket.length) { out.push(bucket[i]); added = true; if (out.length >= limit) break; }
    }
    if (!added) break;
    i++;
  }
  return out.map(o => ref(o.book, o.ch, o.v));
}

// ── Greek-context clustering ─────────────────────────────────────────────────
//
// Groups a word's occurrences by their *Greek* surroundings (which content
// words share the verse), with no English in the loop. Where one English
// rendering spans several distinct context patterns, the word has range the
// translation flattens — the σάρξ problem. Plain k-means over binary
// co-occurrence vectors with cosine similarity; deterministic seeding.

function clusterContexts(occList, verseContent, selfStrongs, lexicon) {
  const n = occList.length;
  if (n < 20) return null;

  // Per-occurrence context set (co-occurring content strongs, self excluded)
  const contexts = occList.map(o => {
    const set = verseContent.get(`${o.book} ${o.ch}:${o.v}`) || [];
    return set.filter(s => s !== selfStrongs);
  });

  // Global feature frequency within this word's occurrences
  const globalFreq = new Map();
  for (const ctx of contexts) for (const f of new Set(ctx)) globalFreq.set(f, (globalFreq.get(f) || 0) + 1);

  const k = Math.min(4, Math.max(2, Math.floor(n / 25)));
  // Deterministic seeds spread across the occurrence list
  let assign = contexts.map((_, i) => i % k);

  for (let iter = 0; iter < 8; iter++) {
    // Centroids: feature → weight (normalized by cluster size)
    const centroids = Array.from({ length: k }, () => new Map());
    const sizes = new Array(k).fill(0);
    contexts.forEach((ctx, i) => {
      const c = assign[i];
      sizes[c]++;
      for (const f of new Set(ctx)) centroids[c].set(f, (centroids[c].get(f) || 0) + 1);
    });
    const norms = centroids.map(cen => Math.sqrt([...cen.values()].reduce((a, v) => a + v * v, 0)) || 1);
    // Reassign by cosine
    let changed = 0;
    contexts.forEach((ctx, i) => {
      let best = assign[i], bestSim = -1;
      const feats = new Set(ctx);
      for (let c = 0; c < k; c++) {
        if (!sizes[c]) continue;
        let dot = 0;
        for (const f of feats) dot += centroids[c].get(f) || 0;
        const sim = dot / (norms[c] * Math.sqrt(feats.size || 1));
        if (sim > bestSim) { bestSim = sim; best = c; }
      }
      if (best !== assign[i]) { assign[i] = best; changed++; }
    });
    if (!changed) break;
  }

  // Collect clusters, drop tiny ones
  const clusters = new Map();
  assign.forEach((c, i) => {
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c).push(i);
  });
  const kept = [...clusters.values()].filter(idxs => idxs.length >= 5).sort((a, b) => b.length - a.length);
  if (kept.length < 2) return null;

  const out = [];
  for (const idxs of kept.slice(0, 4)) {
    const size = idxs.length;
    // Distinctive companions by lift vs the word's own baseline
    const freq = new Map();
    for (const i of idxs) for (const f of new Set(contexts[i])) freq.set(f, (freq.get(f) || 0) + 1);
    const companions = [...freq.entries()]
      .map(([f, c]) => ({ f, c, lift: (c / size) / ((globalFreq.get(f) || 0) / n) }))
      .filter(x => x.c >= Math.max(3, size * 0.15) && x.lift >= 1.8 && lexicon[x.f]?.lemma)
      .sort((a, b) => b.lift * b.c - a.lift * a.c)
      .slice(0, 4)
      .map(x => lexicon[x.f].lemma);
    if (!companions.length) continue;
    // How this pattern is rendered in English
    const rend = new Map();
    for (const i of idxs) {
      const key = occList[i].key || '(absorbed)';
      rend.set(key, (rend.get(key) || 0) + 1);
    }
    const renderings = [...rend.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([kk, c]) => ({ r: kk === '(absorbed)' ? kk : (occList[idxs.find(i => occList[i].key === kk)]?.rendering || kk), pct: Math.round(c / size * 100) }));
    out.push({
      n: size,
      share: Math.round(size / n * 100),
      companions,
      renderings,
      refs: spreadRefs(idxs.map(i => occList[i]), 3),
    });
  }
  return out.length >= 2 ? out : null;
}

// ── Sidecar merge ────────────────────────────────────────────────────────────
// Rebuilds are idempotent: previously generated prose (Stage 2) and classical
// data (LSJ / Apostolic Fathers) re-attach automatically when present.

function loadSidecars() {
  const prose = new Map();
  const proseFile = path.join(OUT_DIR, 'prose', 'results.jsonl');
  if (fs.existsSync(proseFile)) {
    for (const line of fs.readFileSync(proseFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (!r.error) prose.set(r.s, { def: r.definition, senseLabels: r.senseLabels, article: r.article, caution: r.caution, model: r.model, v: 1 });
      } catch { /* skip */ }
    }
  }
  let classical = {};
  const classicalFile = path.join(OUT_DIR, 'classical', 'classical.json');
  if (fs.existsSync(classicalFile)) {
    classical = JSON.parse(fs.readFileSync(classicalFile, 'utf8')).entries || {};
  }
  return { prose, classical };
}

// ── Confidence + deterministic explanation ───────────────────────────────────

function confidenceTier(entry) {
  const top = entry.senses[0];
  if (!entry.count) return 'none';
  if (entry.count === 1) return 'low';
  const corroborated = top && top.corroborated.length > 0;
  const agree = top && top.bsbAgree != null ? top.bsbAgree : 0;
  if (entry.count >= 30 && top && top.share >= 0.55 && agree >= 0.55 && corroborated) return 'high';
  if (entry.count >= 10 && top && (top.share >= 0.5 || corroborated)) return 'good';
  if (entry.count >= 4) return 'moderate';
  return 'low';
}

function buildWhy(entry, bookNames, hebLexicon) {
  const why = [];
  const lemma = entry.lemma || `G${entry.s}`;
  const bn = code => bookNames[code] || code;

  if (!entry.count) {
    why.push(`${lemma} does not occur in the Byzantine (Majority) New Testament text.`);
  } else if (entry.count === 1) {
    const r = entry.refs[0] ? entry.refs[0].replace(/^(\w+)/, m => bn(m)) : '';
    why.push(`${lemma} occurs only once in the Byzantine New Testament${r ? ` (${r})` : ''}, so its range of meaning cannot be established from New Testament usage alone — treat any single gloss cautiously.`);
  } else {
    const nBooks = Object.keys(entry.byBook).length;
    why.push(`${lemma} occurs ${entry.count} times in the Byzantine (Majority) New Testament, across ${nBooks} book${nBooks === 1 ? '' : 's'}.`);
  }

  const top = entry.senses[0];
  if (top && entry.count === 1) {
    why.push(`There the Majority Standard Bible renders it “${top.display}”.`);
  }
  if (top && entry.count > 1) {
    const pct = Math.round(top.share * 100);
    const eg = top.refs.slice(0, 2).map(r => r.replace(/^(\w+)/, m => bn(m))).join('; ');
    why.push(`The Majority Standard Bible — translated from this same Greek text — renders it “${top.display}” in ${top.count} of those places (${pct}%)${eg ? `, e.g. ${eg}` : ''}. This is observed translation data, not an editorial opinion.`);
    if (top.bsbAgree != null) {
      why.push(`The Berean Standard Bible, an independent translation, agrees with that rendering in ${Math.round(top.bsbAgree * 100)}% of the same verses.`);
    }
    if (top.corroborated.length) {
      const names = { dodson: 'Dodson', strongs: "Strong's", kjv: 'the KJV glosses' };
      why.push(`The sense “${top.display}” is independently listed by ${top.corroborated.map(c => names[c]).join(', ')}, corroborating the corpus evidence.`);
    }
    const others = entry.senses.slice(1, 4).filter(s => s.count >= 2);
    if (others.length) {
      why.push(`Attested secondary renderings: ${others.map(s => `“${s.display}” (${s.count}×)`).join(', ')} — these mark the edges of its range, each verifiable at the citations given.`);
    }
  }

  if (entry.untranslated >= Math.max(3, entry.count * 0.2)) {
    why.push(`In ${entry.untranslated} occurrences no single English word corresponds to it — it is absorbed into the phrasing, which is itself lexical information (common for particles and idioms).`);
  }

  if (entry.lxx) {
    let s = `In the Septuagint it appears ${entry.lxx.count} time${entry.lxx.count === 1 ? '' : 's'}`;
    const heb = (entry.lxx.hebrew || [])[0];
    if (heb) {
      const hLemma = hebLexicon?.[heb.h]?.lemma;
      s += `, most often translating the Hebrew ${hLemma ? `${hLemma} (H${heb.h})` : `H${heb.h}`} (${heb.count}×)`;
    }
    why.push(s + '.');
  }

  if (entry.critical && entry.count) {
    const d = entry.critical.count - entry.count;
    if (Math.abs(d) >= Math.max(2, entry.count * 0.1)) {
      why.push(`Text-critical note: it occurs ${entry.critical.count} times in the critical text (SBLGNT) vs ${entry.count} in the Byzantine text — some occurrences sit in disputed passages.`);
    }
  }

  if (entry.mm) {
    why.push(`Moulton–Milligan documents this word in everyday papyri and inscriptions, anchoring the meaning in ordinary Koine usage outside the New Testament.`);
  }

  const tierText = {
    high: 'High confidence: large sample, a dominant sense, independent translation agreement, and lexicon corroboration all converge.',
    good: 'Good confidence: solid sample with corroborated or dominant primary sense.',
    moderate: 'Moderate confidence: limited occurrences — the range shown is attested but may be incomplete.',
    low: 'Low confidence: very few occurrences; lexicon definitions carry more weight than corpus statistics here.',
    none: 'No Byzantine NT occurrences; evidence comes from other corpora and lexica only.',
  };
  why.push(tierText[entry.confidence]);
  return why;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('Building Rhēma deep lexicon (Stage 1 — deterministic evidence)…\n');
  console.log('Loading data files…');
  const w = loadWindowGlobals(
    'rhema-nt.js', 'rhema-msb.js', 'rhema-bsb.js', 'rhema-lexicon.js',
    'rhema-mm.js', 'rhema-lxx.js', 'rhema-ot-hebrew.js', 'rhema-hebrew-lexicon.js',
    'rhema-critical.js', 'rhema-syntax.js'
  );
  const ntText = w.RhemaNT.text;
  const bookNames = { ...w.RhemaLXX.names, ...w.RhemaNT.names };
  const lexicon = w.RhemaLexicon || {};
  const mm = w.RhemaMoultonMilligan || {};
  const hebLexicon = w.RhemaHebrewLexicon || {};

  // ── 1. Align Byzantine NT ↔ MSB and ↔ BSB ─────────────────────────────────
  const stems = new Interner();
  stems.id(''); // reserve 0 so stem ids are ≥ 1 and NULL keys (src=0) stay distinct
  console.log('\nTraining alignment: Byzantine NT ↔ MSB…');
  const msbCorpus = buildNtCorpus(ntText, w.RhemaMSB, stems);
  const KEY_BASE = 1 << 18; // > max stem id; src * KEY_BASE + tgt stays a safe integer
  const tMsb = trainModel1(msbCorpus, KEY_BASE, 8, 'MSB');

  console.log('\nTraining alignment: Byzantine NT ↔ BSB…');
  const bsbCorpus = buildNtCorpus(ntText, w.RhemaBSB, stems);
  const tBsb = trainModel1(bsbCorpus, KEY_BASE, 8, 'BSB');
  if (stems.size >= KEY_BASE) throw new Error('Stem vocabulary exceeded key base');

  // ── 2. Per-occurrence renderings ──────────────────────────────────────────
  console.log('\nAssigning per-occurrence renderings…');
  // occurrences[strongs] = [{book,ch,v,morph,key,rendering,bsbKey}]
  const occurrences = new Map();
  const bsbByRef = new Map();
  for (const verse of bsbCorpus) {
    const aligned = alignVerse(verse, tBsb, KEY_BASE, stems);
    bsbByRef.set(ref(verse.book, verse.ch, verse.v), { verse, aligned });
  }
  for (const verse of msbCorpus) {
    const aligned = alignVerse(verse, tMsb, KEY_BASE, stems);
    const bsb = bsbByRef.get(ref(verse.book, verse.ch, verse.v));
    verse.words.forEach((wd, i) => {
      const [, strongs, morph] = wd;
      const content = isContentMorph(morph);
      const a = aligned[i];
      const key = a.words.length ? senseKey(a.words, content) : '';
      let bsbKey = null;
      if (bsb) {
        // match the same occurrence by strongs + ordinal
        let ordinal = 0;
        for (let k = 0; k < i; k++) if (verse.words[k][1] === strongs) ordinal++;
        let seen = 0, bi = -1;
        for (let k = 0; k < bsb.verse.words.length; k++) {
          if (bsb.verse.words[k][1] === strongs) { if (seen === ordinal) { bi = k; break; } seen++; }
        }
        if (bi >= 0) {
          const ba = bsb.aligned[bi];
          bsbKey = ba.words.length ? senseKey(ba.words, content) : '';
        }
      }
      if (!occurrences.has(strongs)) occurrences.set(strongs, []);
      const rendering = a.words.length ? cleanRenderingWords(a.words, content).join(' ') : '';
      occurrences.get(strongs).push({ book: verse.book, ch: verse.ch, v: verse.v, morph, key, rendering, bsbKey });
    });
  }
  console.log(`  ${occurrences.size} Strong's numbers with attested occurrences (${alignVerse.repaired || 0} renderings recovered by repair pass)`);

  // Verse → content-word strongs, for Greek-context clustering
  const verseContent = new Map();
  for (const verse of msbCorpus) {
    verseContent.set(ref(verse.book, verse.ch, verse.v),
      [...new Set(verse.words.filter(w => isContentMorph(w[2])).map(w => w[1]))]);
  }

  // ── 3. LXX usage + Hebrew counterparts ────────────────────────────────────
  console.log('\nTraining alignment: LXX Greek ↔ Hebrew OT…');
  const lxxText = w.RhemaLXX.text;
  const hebText = w.RhemaHebrewOT.text;
  const HEB_KEY_BASE = 1 << 14; // Greek strongs ≤ 5624 < 2^14? no — greek is src; tgt is greek
  // Model direction: source = Hebrew strongs (+NULL), target = Greek strongs.
  // t(greek | hebrew): per Greek occurrence we ask which Hebrew word produced it.
  const lxxCorpus = [];
  for (const { book, ch, v, words } of ntVerses(lxxText)) {
    const hebWords = hebText[book]?.[ch]?.[v];
    if (!hebWords || !hebWords.length) continue;
    const srcSet = new Set([0]);
    for (const hw of hebWords) srcSet.add(hw[1]);
    lxxCorpus.push({
      book, ch, v, words,
      src: Int32Array.from(srcSet),
      tgt: Int32Array.from(words.map(x => x[1])),
    });
  }
  const HEB_GREEK_BASE = 1 << 13; // greek strongs ≤ 5624 < 8192
  const tHeb = trainModel1(lxxCorpus, HEB_GREEK_BASE, 6, 'LXX↔Heb');

  console.log('Collecting LXX usage…');
  const lxxUsage = new Map(); // greek strongs → {count, byBook, refs[], hebrew Map}
  for (const { book, ch, v, words } of ntVerses(lxxText)) {
    const hebWords = hebText[book]?.[ch]?.[v] || null;
    const hebSet = hebWords ? [...new Set(hebWords.map(x => x[1]))] : null;
    for (const [, g] of words) {
      if (!lxxUsage.has(g)) lxxUsage.set(g, { count: 0, byBook: {}, occ: [], hebrew: new Map() });
      const u = lxxUsage.get(g);
      u.count++;
      u.byBook[book] = (u.byBook[book] || 0) + 1;
      if (u.occ.length < 400) u.occ.push({ book, ch, v });
      if (hebSet) {
        let bestH = 0, bestP = tHeb.get(g) || 1e-9; // NULL
        for (const h of hebSet) {
          const p = tHeb.get(h * HEB_GREEK_BASE + g) || 0;
          if (p > bestP) { bestP = p; bestH = h; }
        }
        if (bestH) u.hebrew.set(bestH, (u.hebrew.get(bestH) || 0) + 1);
      }
    }
  }

  // ── 4. Critical-text occurrence counts ────────────────────────────────────
  const criticalCounts = new Map();
  for (const { words } of ntVerses(w.RhemaCriticalNT.text)) {
    for (const wd of words) criticalCounts.set(wd[1], (criticalCounts.get(wd[1]) || 0) + 1);
  }

  // ── 5. Syntax role distribution ───────────────────────────────────────────
  const syntaxRoles = new Map();
  for (const chapters of Object.values(w.RhemaSyntax || {})) {
    for (const verses of Object.values(chapters)) {
      for (const entries of Object.values(verses)) {
        for (const [, strongs, role] of entries) {
          if (!syntaxRoles.has(strongs)) syntaxRoles.set(strongs, {});
          const r = syntaxRoles.get(strongs);
          r[role] = (r[role] || 0) + 1;
        }
      }
    }
  }

  // ── 6. Build entries ──────────────────────────────────────────────────────
  console.log('\nAssembling entries…');
  const { prose: proseSidecar, classical: classicalSidecar } = loadSidecars();
  if (proseSidecar.size) console.log(`  sidecar: ${proseSidecar.size} prose entries will re-attach`);
  if (Object.keys(classicalSidecar).length) console.log(`  sidecar: ${Object.keys(classicalSidecar).length} classical entries will re-attach`);
  let clustered = 0;
  const allStrongs = new Set([
    ...Object.keys(lexicon).map(Number),
    ...occurrences.keys(),
  ]);
  const entries = new Map();

  for (const s of [...allStrongs].sort((a, b) => a - b)) {
    if (!s || s <= 0) continue;
    const lex = lexicon[s] || {};
    const occ = occurrences.get(s) || [];
    const glossStems = lexiconGlossStems(lex);

    // Group occurrences into senses by normalized rendering key.
    if (process.env.DEBUG_STRONGS && Number(process.env.DEBUG_STRONGS) === s) {
      for (const o of occ) {
        if (!o.key) console.log(`  [debug G${s}] ${ref(o.book, o.ch, o.v)} → ${o.rendering ? `noise "${o.rendering}"` : '(no aligned words)'}`);
      }
    }
    const groups = new Map();
    let untranslated = 0;
    for (const o of occ) {
      if (!o.key) { untranslated++; continue; }
      if (!groups.has(o.key)) groups.set(o.key, []);
      groups.get(o.key).push(o);
    }
    const translated = occ.length - untranslated;

    let senses = [...groups.entries()].map(([key, list]) => {
      // Display form: most common raw rendering in the group, cleaned of edge
      // function words the same way the key was.
      const variants = {};
      for (const o of list) variants[o.rendering] = (variants[o.rendering] || 0) + 1;
      const display = Object.entries(variants).sort((a, b) => b[1] - a[1])[0][0];
      const bsbChecked = list.filter(o => o.bsbKey !== null);
      const bsbSame = bsbChecked.filter(o => o.bsbKey === key).length;
      const keyStems = key.split(' ');
      const corroborated = [];
      for (const [src, set] of Object.entries(glossStems)) {
        if (keyStems.some(k => set.has(k))) corroborated.push(src);
      }
      return {
        key, display,
        count: list.length,
        share: translated ? list.length / translated : 0,
        refs: spreadRefs(list, 6),
        bsbAgree: bsbChecked.length ? bsbSame / bsbChecked.length : null,
        corroborated,
        variants: Object.fromEntries(Object.entries(variants).sort((a, b) => b[1] - a[1]).slice(0, 5)),
      };
    }).sort((a, b) => b.count - a.count);

    // Singleton renderings of well-attested words go to a "rare" bucket; for
    // sparse words every attestation matters, so keep them as senses.
    let rare = [];
    if (occ.length >= 8) {
      rare = senses.filter(x => x.count === 1).slice(0, 10).map(x => ({ display: x.display, refs: x.refs }));
      senses = senses.filter(x => x.count >= 2);
    }
    senses = senses.slice(0, 12);

    const byBook = {};
    for (const o of occ) byBook[o.book] = (byBook[o.book] || 0) + 1;

    // Per-verse sense map: "MAT 7:24" → index into senses[]. Powers the
    // "in this verse" answer in the app. Occurrences that were absorbed into
    // the phrasing (or fell into rare/singleton renderings) are absent — the
    // app reads absence as "no single English word carries it here".
    const verseSense = {};
    senses.forEach((sense, idx) => {
      for (const o of groups.get(sense.key) || []) {
        const r = ref(o.book, o.ch, o.v);
        if (!(r in verseSense)) verseSense[r] = idx;
      }
    });

    const lxxU = lxxUsage.get(s);
    const lxx = lxxU ? {
      count: lxxU.count,
      books: Object.keys(lxxU.byBook).length,
      refs: spreadRefs(lxxU.occ, 4),
      hebrew: [...lxxU.hebrew.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([h, count]) => ({ h, lemma: hebLexicon[h]?.lemma || '', count }))
        .filter(x => x.lemma && x.lemma !== 'NONE'),
    } : null;

    const critical = criticalCounts.has(s) ? { count: criticalCounts.get(s) } : (occ.length ? { count: 0 } : null);

    // Greek-context usage patterns (content words with enough occurrences)
    let contexts = null;
    if (occ.length >= 20 && occ[0] && isContentMorph(occ[0].morph)) {
      contexts = clusterContexts(occ, verseContent, s, lexicon);
      if (contexts) clustered++;
    }

    const entry = {
      s,
      lemma: lex.lemma || '',
      translit: lex.translit || '',
      count: occ.length,
      refs: spreadRefs(occ, 4),
      byBook,
      senses,
      verseSense,
      contexts,
      rare,
      untranslated,
      lxx,
      critical,
      syntax: syntaxRoles.get(s) || null,
      mm: Boolean(mm[s] || lex.moulton_milligan),
    };
    entry.confidence = confidenceTier(entry);
    entry.why = buildWhy(entry, bookNames, hebLexicon);
    if (proseSidecar.has(s)) entry.prose = proseSidecar.get(s);
    if (classicalSidecar[s]) entry.classical = classicalSidecar[s];
    entries.set(s, entry);
  }
  console.log(`  ${entries.size} entries (${clustered} with Greek-context patterns)`);

  // ── 7. Write output ───────────────────────────────────────────────────────
  console.log('\nWriting output…');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const SHARD_SIZE = 100;
  const shards = new Map();
  for (const [s, entry] of entries) {
    const shardId = Math.floor((s - 1) / SHARD_SIZE);
    if (!shards.has(shardId)) shards.set(shardId, {});
    shards.get(shardId)[s] = entry;
  }
  let totalBytes = 0;
  const manifest = [];
  for (const [shardId, data] of [...shards.entries()].sort((a, b) => a[0] - b[0])) {
    const lo = shardId * SHARD_SIZE + 1, hi = (shardId + 1) * SHARD_SIZE;
    const name = `shard-${String(lo).padStart(4, '0')}.json`;
    const json = JSON.stringify(data);
    fs.writeFileSync(path.join(OUT_DIR, name), json);
    totalBytes += json.length;
    manifest.push({ file: name, lo, hi, entries: Object.keys(data).length });
  }

  const spine = {};
  for (const [s, e] of entries) {
    spine[s] = [e.lemma, e.senses[0]?.display || '', e.count, e.confidence];
  }
  const spineJson = JSON.stringify(spine);
  fs.writeFileSync(path.join(OUT_DIR, 'spine.json'), spineJson);

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify({
    version: 1,
    built: new Date().toISOString().slice(0, 10),
    method: 'IBM Model 1 alignment, Byzantine RP2018 ↔ MSB (primary) / BSB (cross-check); LXX ↔ Hebrew OT for counterparts',
    shardSize: SHARD_SIZE,
    entries: entries.size,
    shards: manifest,
  }, null, 2));

  console.log(`  ${manifest.length} shards, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total (uncompressed)`);
  console.log(`  spine.json ${(spineJson.length / 1024).toFixed(0)} KB`);

  // ── 8. Sample report for spot-checking ────────────────────────────────────
  const SAMPLES = [3056, 4487, 4561, 2889, 4102, 26, 5485, 3875, 1411, 2316, 1680, 3340];
  const lines = ['# Deep Lexicon — Stage 1 sample report', '',
    `Built ${new Date().toISOString().slice(0, 10)} from RP2018 Byzantine text, MSB, BSB, LXX, Hebrew OT, SBLGNT, Macula syntax.`, ''];
  for (const s of SAMPLES) {
    const e = entries.get(s);
    if (!e) continue;
    lines.push(`## G${s} — ${e.lemma} (${e.translit})`, '');
    lines.push(`Byzantine NT occurrences: **${e.count}** in ${Object.keys(e.byBook).length} books · critical text: ${e.critical?.count ?? '—'} · confidence: **${e.confidence}**`, '');
    lines.push('| Rendering (MSB) | Count | Share | BSB agreement | Corroborated by | Examples |');
    lines.push('|---|---|---|---|---|---|');
    for (const sense of e.senses.slice(0, 8)) {
      lines.push(`| ${sense.display} | ${sense.count} | ${Math.round(sense.share * 100)}% | ${sense.bsbAgree == null ? '—' : Math.round(sense.bsbAgree * 100) + '%'} | ${sense.corroborated.join(', ') || '—'} | ${sense.refs.slice(0, 3).join('; ')} |`);
    }
    if (e.untranslated) lines.push('', `Untranslated / absorbed: ${e.untranslated}×`);
    if (e.rare.length) lines.push('', `Rare renderings: ${e.rare.map(r => `${r.display} (${r.refs[0]})`).join(', ')}`);
    if (e.lxx) lines.push('', `LXX: ${e.lxx.count}× in ${e.lxx.books} books${e.lxx.hebrew.length ? `; Hebrew counterparts: ${e.lxx.hebrew.map(h => `${h.lemma} (H${h.h}, ${h.count}×)`).join(', ')}` : ''}`);
    lines.push('', '**Why this definition:**', '');
    for (const sentence of e.why) lines.push(`- ${sentence}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(OUT_DIR, 'report-sample.md'), lines.join('\n'));
  console.log('  report-sample.md written');
  console.log('\nDone.');
}

main();
