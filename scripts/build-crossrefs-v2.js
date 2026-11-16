#!/usr/bin/env node
// Cross references, v2: ranked links, each with the reason it's there.
//
//   node scripts/build-crossrefs-v2.js path/to/cross_references.txt path/to/versemap.json
//
// Inputs
//   cross_references.txt  OpenBible.info cross references (CC BY,
//                         https://www.openbible.info/labs/cross-references/):
//                         ~345,000 links, each with a vote count from readers
//                         who confirmed it, which ranks them.
//   versemap.json         Septuagint and Hebrew → English verse numbers for
//                         every OT book, exported from the app's own
//                         versification (scripts/export-ot-versemap.js).
// Texts (from this repo): Byzantine Greek NT, Rahlfs Septuagint, Hebrew OT,
// all Strong's-tagged.
//
// What each link gets, found from the texts themselves (descriptive, never
// guessed from book names):
//   q / Q  quotes / quoted in: the NT verse repeats the Septuagint's words in
//          order (weighted so a short quote of rare words counts: 1 Pet 2:24
//          "by his wounds you were healed" ← Isa 53:5).
//          Only where the NT signals a citation ("it is written", "the
//          Scripture says", "what was spoken") in that verse or just before.
//   f / F  fulfills / fulfilled in: as q/Q, and the NT itself says "that it
//          might be fulfilled" / "the Scripture was fulfilled" there.
//   e / E  echoes the wording: the same words in order, without a citation
//          signal (an allusion, or a retelling of the event).
//   p      parallel account: the same event told in another Gospel, or in
//          Samuel–Kings and Chronicles (and the other known doublets), by
//          shared wording in the original language.
//   s      similar wording: 2 Peter–Jude, Ephesians–Colossians.
//   ''     related: readers linked them (ranked by votes).
// Links below 2 votes are dropped unless the texts show a quote or parallel.
// Writes data/xrefs/<BOOK>.json: { v: { "c:v": [[ref, votes, kind, info]…] } }.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = path.join(__dirname, '..');
const [SRC, VMAP] = process.argv.slice(2);
if (!SRC || !VMAP) { console.error('usage: build-crossrefs-v2.js cross_references.txt versemap.json'); process.exit(1); }

const load = (file) => { const c = { window: {} }; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(R, file), 'utf8'), c); return c.window; };
const NT = load('rhema-nt.js').RhemaNT.text;
const LXX = load('rhema-lxx.js').RhemaLXX.text;
const HEB = load('rhema-ot-hebrew.js').RhemaHebrewOT.text;
const MSB = load('rhema-msb.js').RhemaMSB;
const VM = JSON.parse(fs.readFileSync(VMAP, 'utf8'));

const OT = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL'];
const NTB = ['MAT','MAR','LUK','JOH','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAM','1PE','2PE','1JO','2JO','3JO','JUD','REV'];
const isOT = new Set(OT);
const OSIS = { Gen:'GEN',Exod:'EXO',Lev:'LEV',Num:'NUM',Deut:'DEU',Josh:'JOS',Judg:'JDG',Ruth:'RUT','1Sam':'1SA','2Sam':'2SA','1Kgs':'1KI','2Kgs':'2KI','1Chr':'1CH','2Chr':'2CH',Ezra:'EZR',Neh:'NEH',Esth:'EST',Job:'JOB',Ps:'PSA',Prov:'PRO',Eccl:'ECC',Song:'SNG',Isa:'ISA',Jer:'JER',Lam:'LAM',Ezek:'EZK',Dan:'DAN',Hos:'HOS',Joel:'JOL',Amos:'AMO',Obad:'OBA',Jonah:'JON',Mic:'MIC',Nah:'NAM',Hab:'HAB',Zeph:'ZEP',Hag:'HAG',Zech:'ZEC',Mal:'MAL',
  Matt:'MAT',Mark:'MAR',Luke:'LUK',John:'JOH',Acts:'ACT',Rom:'ROM','1Cor':'1CO','2Cor':'2CO',Gal:'GAL',Eph:'EPH',Phil:'PHP',Col:'COL','1Thess':'1TH','2Thess':'2TH','1Tim':'1TI','2Tim':'2TI',Titus:'TIT',Phlm:'PHM',Heb:'HEB',Jas:'JAM','1Pet':'1PE','2Pet':'2PE','1John':'1JO','2John':'2JO','3John':'3JO',Jude:'JUD',Rev:'REV' };

// ── English verse helpers ────────────────────────────────────────────────────
const hasEng = (b, c, v) => !!MSB[b]?.[c]?.[v];
// "PSA 33:6-9" / "GEN 1:31-2:3" → list of [b, c, v] (English numbering)
function expand(ref) {
  const m = ref.match(/^(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/);
  if (!m) return [];
  const b = m[1], c1 = +m[2], v1 = +m[3];
  if (!m[5]) return [[b, c1, v1]];
  const c2 = m[4] ? +m[4] : c1, v2 = +m[5];
  const out = [];
  for (let c = c1; c <= c2; c++) {
    const vs = Object.keys(MSB[b]?.[c] || {}).map(Number).sort((x, y) => x - y);
    for (const v of vs) if ((c > c1 || v >= v1) && (c < c2 || v <= v2)) out.push([b, c, v]);
  }
  return out;
}
function parseOsis(s) {
  const one = (x) => { const [bk, c, v] = x.split('.'); const b = OSIS[bk]; return b ? [b, +c, +v] : null; };
  const [a, z] = s.split('-');
  const A = one(a); if (!A) return null;
  if (!z) return `${A[0]} ${A[1]}:${A[2]}`;
  const Z = one(z); if (!Z || Z[0] !== A[0]) return `${A[0]} ${A[1]}:${A[2]}`;
  return Z[1] === A[1] ? `${A[0]} ${A[1]}:${A[2]}-${Z[2]}` : `${A[0]} ${A[1]}:${A[2]}-${Z[1]}:${Z[2]}`;
}

// ── Tokens (Strong's numbers) per English verse ──────────────────────────────
// Original → English via the versemap; NT numbering is already English.
const e2o = {};   // e2o[layer][book]["c:v"] = ["c:v", …]
for (const layer of ['lxx', 'hebrew']) {
  e2o[layer] = {};
  for (const b of OT) {
    const m = {};
    for (const [o, e] of Object.entries(VM[b]?.[layer] || {})) (m[e] = m[e] || []).push(o);
    e2o[layer][b] = m;
  }
}
const toks = (words) => (words || []).map(w => Number(w[1]) || 0);
// Greek: only meaning-carrying words (nouns, verbs, adjectives, adverbs,
// foreign words) — never articles, pronouns, prepositions, conjunctions or
// particles. Rarity weighting then does the rest.
const G_CONTENT = /^(N|V|A|ADJ|ADV|HEB|ARAM)(-|$)/;
const gtoks = (words) => (words || []).map(w => (G_CONTENT.test(String(w[2] || '')) && Number(w[1])) || 0);
function ntToks(b, c, v) { return gtoks(NT[b]?.[c]?.[v]); }
function lxxToks(b, c, v) { return (e2o.lxx[b]?.[`${c}:${v}`] || [`${c}:${v}`]).flatMap(o => { const [oc, ov] = o.split(':'); return gtoks(LXX[b]?.[oc]?.[ov]); }); }
function hebToks(b, c, v) { return (e2o.hebrew[b]?.[`${c}:${v}`] || [`${c}:${v}`]).flatMap(o => { const [oc, ov] = o.split(':'); return toks(HEB[b]?.[oc]?.[ov]); }); }
function greekToks(b, c, v) { return isOT.has(b) ? lxxToks(b, c, v) : ntToks(b, c, v); }

// Frequencies → stopwords and rarity.
const ntCount = new Map(), lxxCount = new Map(), hebCount = new Map();
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
const verses = (T, books) => books.flatMap(b => Object.entries(T[b] || {}).flatMap(([c, vs]) => Object.entries(vs).map(([v, w]) => [b, c, v, w])));
const NTV = verses(NT, NTB), LXXV = verses(LXX, OT), HEBV = verses(HEB, OT);
for (const [, , , w] of NTV) for (const t of new Set(gtoks(w))) if (t) bump(ntCount, t);
for (const [, , , w] of LXXV) for (const t of new Set(gtoks(w))) if (t) bump(lxxCount, t);
for (const [, , , w] of HEBV) for (const t of new Set(toks(w))) if (t) bump(hebCount, t);
const topN = (m, n) => new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]));
const GSTOP = new Set([1510, 1096, 2192]); // εἰμί, γίνομαι, ἔχω: verbs of being/having
const HSTOP = topN(hebCount, 25);
const gN = NTV.length + LXXV.length;
const gIdf = (t) => Math.log(gN / (1 + (ntCount.get(t) || 0) + (lxxCount.get(t) || 0)));
const hIdf = (t) => Math.log(HEBV.length / (1 + (hebCount.get(t) || 0)));
const content = (ts, stop) => ts.filter(t => t && !stop.has(t));

// Order-preserving weighted overlap (LCS over content tokens).
function wlcs(a, b, idf) {
  const n = a.length, m = b.length;
  if (!n || !m) return { len: 0, w: 0 };
  const L = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const C = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    if (a[i - 1] === b[j - 1]) { L[i][j] = L[i - 1][j - 1] + idf(a[i - 1]); C[i][j] = C[i - 1][j - 1] + 1; }
    else if (L[i - 1][j] >= L[i][j - 1]) { L[i][j] = L[i - 1][j]; C[i][j] = C[i - 1][j]; }
    else { L[i][j] = L[i][j - 1]; C[i][j] = C[i][j - 1]; }
  }
  return { len: C[n][m], w: L[n][m] };
}

// ── OpenBible links (readers' votes rank them) ──────────────────────────────────────────────────────
const links = new Map(); // from → Map(toRef → {votes, kind, info})
const covers = (range, ref) => range.includes('-') && expand(range).some(([b, c, v]) => `${b} ${c}:${v}` === ref);
const add = (from, to, votes, kind, info) => {
  if (!links.has(from)) links.set(from, new Map());
  const m = links.get(from);
  // A text-found link to a verse inside a readers' range link labels that range.
  if (kind && !m.has(to)) for (const k of m.keys()) if (covers(k, to)) { to = k; break; }
  const cur = m.get(to);
  const rank = { f: 6, F: 6, q: 5, Q: 5, p: 4, e: 3, E: 3, s: 3, w: 1, '': 0 };
  if (!cur) m.set(to, { votes, kind, info });
  else {
    cur.votes = Math.max(cur.votes, votes);
    if ((rank[kind] || 0) > (rank[cur.kind] || 0)) { cur.kind = kind; cur.info = info; }
  }
};
let obRead = 0, obKept = 0;
const lowVotes = {}; // links under 2 votes, kept only if the texts back them
for (const line of fs.readFileSync(SRC, 'utf8').split('\n').slice(1)) {
  const [f, t, vs] = line.split('\t');
  if (!t) continue;
  obRead++;
  const from = parseOsis(f), to = parseOsis(t);
  if (!from || !to || from.includes('-')) continue;
  const [fb, fcv] = from.split(' '); const [fc, fv] = fcv.split(':');
  if (!hasEng(fb, fc, fv) || !expand(to).some(([b, c, v]) => hasEng(b, c, v))) continue;
  const votes = Number(vs) || 0;
  if (votes < 2) { (links.get(from)?.get(to)) || (lowVotes[`${from}|${to}`] = votes); continue; }
  add(from, to, votes, '', null); obKept++;
}
// ── 1. NT quotations of the Septuagint ──────────────────────────────────────
// Candidates through an index of the LXX's content words; accepted when the
// NT verse repeats enough of the OT verse's wording, in order.
const lxxIndex = new Map(); // token → [eng ref]
const lxxEng = [];          // [engRef, contentTokens]
for (const b of OT) for (const c of Object.keys(MSB[b] || {})) for (const v of Object.keys(MSB[b][c])) {
  const ct = content(lxxToks(b, c, v), GSTOP);
  if (!ct.length) continue;
  const i = lxxEng.push([`${b} ${c}:${v}`, ct]) - 1;
  for (const t of new Set(ct)) { if ((lxxCount.get(t) || 0) > 1500) continue; if (!lxxIndex.has(t)) lxxIndex.set(t, []); lxxIndex.get(t).push(i); }
}
const QUOTE = { minLen: 3, minW: 15, minLenRare: 2, minWRare: 13 };
// Readers' votes for a pair, either direction (range links count for verses inside).
function obVotes(a, b) {
  let best = 0;
  for (const [x, y] of [[a, b], [b, a]]) for (const [to, L] of links.get(x) || []) if (to === y || covers(to, y)) best = Math.max(best, L.votes);
  return best;
}
const quotes = []; // [ntRef, otRef, len, fulfilled]
const FULFIL = 4137, SAID = [4483, 2046], SCRIPTURE = 1124, WRITE = 1125;
for (const b of NTB) for (const c of Object.keys(NT[b] || {})) for (const v of Object.keys(NT[b][c])) {
  const ct = content(ntToks(b, c, v), GSTOP);
  if (ct.length < 2) continue;
  const score = new Map();
  for (const t of new Set(ct)) for (const i of lxxIndex.get(t) || []) score.set(i, (score.get(i) || 0) + gIdf(t));
  // A citation signal in this verse or the four before it: "it is written",
  // "the Scripture says", "what was spoken"; "that it might be fulfilled"
  // marks a fulfilment.
  const win = [0, 1, 2, 3].flatMap(d => NT[b]?.[c]?.[String(+v - d)] || []);
  const isCite = (w) => {
    const s = Number(w[1]), m = String(w[2] || '');
    if (s === SCRIPTURE) return true;                       // γραφή
    if (s === WRITE) return /^V-R/.test(m);                 // γέγραπται, γεγραμμένον
    if (SAID.includes(s)) return /^V-(A|R)P(P|I)/.test(m);  // ῥηθέν, εἰρημένον, ἐρρέθη
    return false;
  };
  const cited = win.some(isCite);
  const fulfilled = cited && win.some(w => Number(w[1]) === FULFIL);
  const found = [];
  for (const [i, s] of score) {
    if (s < 7) continue;
    const r = wlcs(ct, lxxEng[i][1], gIdf);
    const ratio = r.len / Math.min(ct.length, lxxEng[i][1].length);
    // Either readers link the two verses and the wording lines up in order,
    // or the wording alone is long and close enough to be unmistakable.
    const votes = (r.len >= 2 && r.w >= 9) ? obVotes(`${b} ${c}:${v}`, lxxEng[i][0]) : 0;
    const ok = (cited && r.len >= 5 && r.w >= 24 && ratio >= 0.5)
      || (votes >= 3 && r.len >= 3 && r.w >= 9 && ratio >= 0.4)
      || (votes >= 3 && r.len >= 2 && r.w >= 12 && r.w / r.len >= 6.5);
    if (ok) found.push([lxxEng[i][0], r.len, r.w, ratio]);
  }
  // Keep the strongest match and any near it (a line can echo two OT verses).
  found.sort((x, y) => y[2] - x[2]);
  for (const f of found) if (f[2] >= found[0][2] * 0.8) quotes.push([`${b} ${c}:${v}`, f[0], f[1], !cited || f[3] < 0.3 ? 'e' : fulfilled ? 'f' : 'q']);
}

// ── 2. Parallel accounts and similar wording ────────────────────────────────
const parallels = []; // [a, b, kind]
function compareSets(booksA, booksB, getToks, stop, idf, kind, minLen, minRatio, ranges) {
  const inRange = (b, c) => !ranges || ranges.some(([rb, c1, c2]) => rb === b && c >= c1 && c <= c2);
  const listB = [];
  const idx = new Map();
  for (const b of booksB) for (const c of Object.keys(MSB[b] || {})) { if (!inRange(b, +c)) continue; for (const v of Object.keys(MSB[b][c])) {
    const ct = content(getToks(b, c, v), stop); if (ct.length < 3) continue;
    const i = listB.push([`${b} ${c}:${v}`, ct, b]) - 1;
    for (const t of new Set(ct)) { if (!idx.has(t)) idx.set(t, []); idx.get(t).push(i); }
  } }
  for (const b of booksA) for (const c of Object.keys(MSB[b] || {})) { if (!inRange(b, +c)) continue; for (const v of Object.keys(MSB[b][c])) {
    const ct = content(getToks(b, c, v), stop); if (ct.length < 3) continue;
    const hits = new Map();
    for (const t of new Set(ct)) for (const i of idx.get(t) || []) hits.set(i, (hits.get(i) || 0) + 1);
    for (const [i, n] of hits) {
      if (n < minLen || listB[i][2] === b) continue;
      const r = wlcs(ct, listB[i][1], idf);
      if (r.len >= minLen && r.len / Math.min(ct.length, listB[i][1].length) >= minRatio) parallels.push([`${b} ${c}:${v}`, listB[i][0], kind]);
    }
  } }
}
const GOSPELS = ['MAT', 'MAR', 'LUK', 'JOH'];
compareSets(GOSPELS, GOSPELS, ntToks, GSTOP, gIdf, 'p', 4, 0.45);
// Samuel–Kings and Chronicles, and the OT's other doublets (Hebrew wording).
compareSets(['1SA', '2SA', '1KI', '2KI'], ['1CH', '2CH'], hebToks, HSTOP, hIdf, 'p', 4, 0.5);
compareSets(['2SA'], ['PSA'], hebToks, HSTOP, hIdf, 'p', 4, 0.5, [['2SA', 22, 22], ['PSA', 18, 18]]);
compareSets(['PSA'], ['PSA'], hebToks, HSTOP, hIdf, 'p', 4, 0.5, [['PSA', 14, 14], ['PSA', 53, 53], ['PSA', 40, 40], ['PSA', 70, 70], ['PSA', 57, 57], ['PSA', 60, 60], ['PSA', 108, 108]]);
compareSets(['ISA', 'JER'], ['2KI'], hebToks, HSTOP, hIdf, 'p', 4, 0.5, [['ISA', 36, 39], ['JER', 52, 52], ['2KI', 18, 25]]);
compareSets(['1CH'], ['PSA'], hebToks, HSTOP, hIdf, 'p', 4, 0.5, [['1CH', 16, 16], ['PSA', 96, 96], ['PSA', 105, 106]]);
compareSets(['EZR'], ['2CH'], hebToks, HSTOP, hIdf, 'p', 4, 0.5, [['EZR', 1, 1], ['2CH', 36, 36]]);
compareSets(['2PE'], ['JUD'], ntToks, GSTOP, gIdf, 's', 3, 0.35);
compareSets(['EPH'], ['COL'], ntToks, GSTOP, gIdf, 's', 4, 0.4);

// ── 3. Text-found relationships go on the link both ways (with any votes the pair has).
const votesOf = (a, b) => links.get(a)?.get(b)?.votes ?? lowVotes[`${a}|${b}`] ?? 0;
for (const [nt, ot, len, kind] of quotes) {
  add(nt, ot, votesOf(nt, ot), kind, len);
  add(ot, nt, votesOf(ot, nt), kind.toUpperCase(), len);
}
for (const [a, b, kind] of parallels) { add(a, b, votesOf(a, b), kind, null); add(b, a, votesOf(b, a), kind, null); }

// ── 4. Write per-book shards ────────────────────────────────────────────────
const outDir = path.join(R, 'data', 'xrefs');
fs.mkdirSync(outDir, { recursive: true });
const PRI = { f: 0, F: 0, q: 1, Q: 1, p: 2, e: 3, E: 3, s: 3 };
const stats = { verses: 0, links: 0, q: 0, f: 0, e: 0, p: 0, s: 0, bytes: 0 };
for (const book of [...OT, ...NTB]) {
  const shard = { v: {} };
  for (const [from, m] of links) {
    if (!from.startsWith(book + ' ')) continue;
    const special = [], rest = [];
    for (const [to, L] of m) (L.kind && PRI[L.kind] != null ? special : rest).push([to, L]);
    special.sort((a, b) => PRI[a[1].kind] - PRI[b[1].kind] || b[1].votes - a[1].votes);
    rest.sort((a, b) => b[1].votes - a[1].votes);
    const keep = [...special, ...rest.slice(0, Math.max(0, 40 - special.length))];
    shard.v[from.split(' ')[1]] = keep.map(([to, L]) => {
      const kind = L.kind, info = L.info;
      if (kind) stats[kind.toLowerCase()] = (stats[kind.toLowerCase()] || 0) + 1;
      const row = [to, L.votes];
      if (kind) row.push(kind);
      if (info != null) row.push(info);
      return row;
    });
    stats.verses++; stats.links += keep.length;
  }
  const json = JSON.stringify(shard);
  stats.bytes += json.length;
  fs.writeFileSync(path.join(outDir, `${book}.json`), json);
}
console.log(JSON.stringify({ openBibleRead: obRead, openBibleKept: obKept, quotes: quotes.length, parallels: parallels.length, ...stats, MB: +(stats.bytes / 1e6).toFixed(1) }));
module.exports = {};
