// Check every Hebrew short meaning (gloss) against how translators actually
// render the word, and repair the ones no source supports.
//
// A gloss is kept when any of its words is used for the word by the BSB (the
// Berean word tables, data/hebrew-word-stats), by the KJV (Strong's usage
// list) or by Strong's own definition. Otherwise it is replaced by the BSB's
// most common rendering, cut to its core ("was buried" -> "bury"), preferring
// one the KJV list or Strong's also uses. Run after build-hebrew-glosses.py:
//
//   node scripts/validate-hebrew-glosses.js            # report
//   node scripts/validate-hebrew-glosses.js --write    # patch the lexicon
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
// Hand-checked where the data alone can't choose well.
const HAND = {
  3201: 'be able', 954: 'be ashamed', 2181: 'prostitute', 8227: 'rock badger / Shaphan', 5945: 'Most High / upper',
  7782: 'ram\u2019s horn', 182: 'sake / cause', 1443: 'wall up', 5425: 'spring / set free', 5002: 'declaration',
  6240: '-teen (ten)', 539: 'be firm / believe', 842: 'Asherah', 2009: 'behold', 7925: 'rise early', 3426: 'there is', 7130: 'midst / inner part', 639: 'anger / nose',
};
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R + '/rhema-hebrew-lexicon.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync(R + '/rhema-align.js', 'utf8'), ctx);
const L = ctx.window.RhemaHebrewLexicon, A = ctx.window.RhemaAlign;
const stats = {};
for (const f of fs.readdirSync(R + '/data/hebrew-word-stats')) Object.assign(stats, JSON.parse(fs.readFileSync(R + '/data/hebrew-word-stats/' + f, 'utf8')));
const OVERRIDE = new Set((fs.readFileSync(path.join(R, 'scripts/build-hebrew-glosses.py'), 'utf8').match(/OVERRIDE = \{([\s\S]*?)\n\}/)[1].match(/(\d+):/g) || []).map(x => x.replace(':', '')));
const toks = (s) => A.tokenizeEnglish(String(s || '').replace(/[\/()]/g, ' '));
const content = (s) => toks(s).filter(t => !t.grammar).map(t => t.stem);
const LEAD = /^(?:and|but|then|so|now|for|or|the|a|an|that|which|who|to|of|in|on|at|by|with|from|as|when|if|let|may|will|would|shall|should|has|have|had|is|are|was|were|be|been|being|do|does|did|you|he|she|it|they|we|i|his|her|their|your|my|our|its)\s+/i;
const TRAIL = /\s+(?:him|her|them|me|you|it|us|himself|herself|themselves|myself|yourself|his|their|my|your|our|out|up|down|away|off)$/i;
function core(r) {
  let s = String(r || '').replace(/\[[^\]]*\]/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  for (let k = 0; k < 4; k++) { const t = s.replace(LEAD, ''); if (t === s || !content(t).length) break; s = t; }
  for (let k = 0; k < 3; k++) { const t = s.replace(TRAIL, ''); if (t === s || !content(t).length) break; s = t; }
  return s;
}
const kjvWords = (k) => {
  const out = [];
  String(k || '').replace(/[X+]/g, ' ').split(/,(?![^()]*\))/).forEach(item => {
    let it = item.trim();
    const m = it.match(/^\(([a-z]+)-\)\s*(.*)$/); if (m) { out.push(m[2]); out.push(m[1] + m[2]); it = m[2]; }
    const base = it.replace(/\([^)]*\)/g, '').trim(); if (base) out.push(base);
    for (const sm of it.matchAll(/([A-Za-z]+)\(-\s*([a-z]+)(?:,\s*-\s*([a-z]+))?\)/g)) { out.push(sm[1] + sm[2]); if (sm[3]) out.push(sm[1] + sm[3]); }
    for (const sm of it.matchAll(/\(([^)]*)\)/g)) out.push(sm[1].replace(/-/g, ''));
  });
  return out;
};
const META = new Set(content('primitive root number word particle plural singular feminine masculine form prolonged contracted denominative apparently probably perhaps properly implication extension figuratively literally compare same from used corresponding abbreviated adverb noun verb adjective'));
const changes = [];
for (const [k, e] of Object.entries(L)) {
  const st = stats[k]; const g = e.gloss || '';
  if (!st || !st.r || !st.r.length) continue;
  if (OVERRIDE.has(k)) continue;
  const weight = new Map(); let tot = 0;
  for (const [w, n] of st.r) for (const s of new Set(content(w))) { weight.set(s, (weight.get(s) || 0) + n); }
  for (const [, n] of st.r) tot += n;
  const gs = content(g);
  const kj = new Set(kjvWords(e.kjv_def).flatMap(content));
  // Strong's definition, without its own grammar talk ("a primitive number").
  const sd = new Set(content(String(e.strongs_def || '').split(';').slice(0, 3).join(' ')).filter(x => !META.has(x)));
  // Keep the gloss when any source agrees with it: the BSB's renderings, the
  // KJV's renderings (Strong's list) or Strong's own definition.
  const agrees = gs.some(s => weight.has(s) || kj.has(s) || sd.has(s));
  const isName = /^[A-Z]/.test(String(e.kjv_def || '')) && /^[A-Z][a-z]/.test(g);
  if (agrees || (!gs.length && g) || isName) continue;
  // Best rendering: top rendering's core; prefer a shorter rendering with the same content (singular/base form).
  // A function word (or, how, behold) is its own gloss.
  const top0 = st.r[0][0].replace(/\[[^\]]*\]/g, '').trim();
  if (!content(top0).length && top0.split(' ').length <= 2 && st.r[0][1] >= 0.3 * tot) { if (top0 !== g) changes.push({ k, n: st.n, old: g, new: top0, top: st.r.slice(0, 3).map(r => `${r[0]}×${r[1]}`).join(', ') }); continue; }
  let cands = st.r.slice(0, 8).map(([w, n]) => ({ w: core(w), n })).filter(c => c.w && content(c.w).length && c.w.split(' ').length <= 3);
  if (!cands.length || cands[0].n < 3) continue; // too little evidence: keep the dictionary's gloss
  // Prefer the most common rendering that the KJV list or Strong's also uses.
  const backed = cands.filter(c => content(c.w).some(s => kj.has(s) || sd.has(s)));
  if (backed.length && backed[0].n >= 0.15 * cands[0].n) cands = backed.concat(cands.filter(c => !backed.includes(c)));
  const top = cands[0];
  const key = (c) => content(c.w).join(' ');
  const same = cands.filter(c => key(c) === key(top));
  let best = same.reduce((a, b) => (b.w.length < a.w.length ? b : a), top);
  let w = best.w;
  // Proper names keep their capital (Canaan, Sheol, Asherah).
  // Names and peoples keep their capital (Canaan, Sheol, Reubenite).
  const first = w.split(' ')[0].replace(/[^a-z]/gi, '');
  // (KJV list capitalises it, or the BSB does wherever it isn't first: "concerning Asher").
  const mid = st.r.flatMap(r => r[0].split(' ').slice(1)).filter(x => x.toLowerCase() === first.toLowerCase());
  const cap = String(e.kjv_def || '') + (mid.length && mid.every(x => /^[A-Z]/.test(x)) ? ' ' + mid[0] : '');
  if (new RegExp('\\b' + first[0].toUpperCase() + first.slice(1), '').test(cap) || /^(sheol|asherah)/i.test(w)) w = w[0].toUpperCase() + w.slice(1);
  if (w !== g) changes.push({ k, n: st.n, old: g, new: w, top: st.r.slice(0, 3).map(r => `${r[0]}×${r[1]}`).join(', ') });
}
for (const [k, g] of Object.entries(HAND)) {
  const e = L[k]; if (!e) continue;
  const i = changes.findIndex(c => c.k === k);
  if (i >= 0) changes.splice(i, 1);
  if (e.gloss !== g) changes.push({ k, n: stats[k]?.n || 0, old: e.gloss || '', new: g, top: 'hand-checked' });
}
changes.sort((a, b) => b.n - a.n);
console.log(`checked ${Object.keys(L).length} glosses; ${changes.length} need repair`);
for (const c of changes) console.log(`H${c.k} ${c.n}× "${c.old}" → "${c.new}"   [${c.top}]`);
if (WRITE && changes.length) {
  const file = path.join(R, 'rhema-hebrew-lexicon.js');
  let text = fs.readFileSync(file, 'utf8');
  const head = 'window.RhemaHebrewLexicon = ';
  const a = text.indexOf(head) + head.length;
  const b = text.indexOf(';', text.indexOf('\n', a) > 0 ? a : a) ;
  // The lexicon object is one JSON literal up to ';\nwindow.' or ';window.'.
  const end = text.search(/;\s*window\.RhemaHebrewOcc/);
  const data = JSON.parse(text.slice(a, end));
  for (const c of changes) { const e = data[c.k]; if (e) { e.gloss = c.new; e.brief = c.new; e.quick_def = c.new; } }
  text = text.slice(0, a) + JSON.stringify(data) + text.slice(end);
  fs.writeFileSync(file, text);
  console.log('patched', file);
}
