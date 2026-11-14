#!/usr/bin/env node
// Critical text (rhema-critical.js): fix Strong's numbers for words whose
// dictionary forms differ only by accent or breathing. build-rhema-critical.js
// matched SBLGNT lemmas to Strong's with accents stripped, so τίς "who?" got
// τὶς "someone" (G5100), δεῖ got δέω "bind", ποῦ "where?" got πού "somewhere",
// ἄρα "then" got ἀρά "curse", Στέφανος (Stephen) got στέφανος "crown", etc.
// For each such word: the entry whose accented lemma matches exactly, else the
// one the Majority text has in the same verse. Idempotent; run after
// build-rhema-critical.js.   node scripts/fix-critical-homographs.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..');
const load = f => { const c = { window: {} }; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8'), c); return c.window; };
const L = load('rhema-lexicon.js').RhemaLexicon;
const M = load('rhema-nt.js').RhemaNT.text;
const file = path.join(R, 'rhema-critical.js');
const src = fs.readFileSync(file, 'utf8');
const a = src.indexOf('window.RhemaCriticalNT = ') + 'window.RhemaCriticalNT = '.length;
const data = JSON.parse(src.slice(a, src.lastIndexOf(';')));
const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ').toLowerCase();
const acc = s => String(s || '').normalize('NFC').replace(/ς/g, 'σ').toLowerCase();
const groups = new Map();
for (const [k, e] of Object.entries(L)) { const s = strip(e.lemma); if (!groups.has(s)) groups.set(s, []); groups.get(s).push(k); }
let changed = 0;
for (const b in data.text) for (const c in data.text[b]) for (const v in data.text[b][c]) {
  const maj = new Set((M[b]?.[c]?.[v] || []).map(w => String(w[1])));
  for (const w of data.text[b][c][v]) {
    const n = String(w[1] || '');
    if (!n || w[3] === 'τις') continue; // unaccented τις is the enclitic "someone" (G5100)
    // SBLGNT files impersonal δεῖ / ἔδει "it is necessary" under δέω; Strong's
    // keeps it apart (G1163) from δέω "bind" (G1210). Same spelling as the
    // Majority text's G1163 in this verse → G1163.
    // The same for δέομαι "ask, pray" (G1189), which SBLGNT also files under δέω.
    if (w[3] === 'δέω') {
      const sk = strip(w[0]).replace(/[^α-ω]/g, '');
      const hit = ['1163', '1189'].find(id => maj.has(id) && (M[b][c][v] || []).some(x => String(x[1]) === id && strip(x[0]).replace(/[^α-ω]/g, '') === sk));
      if (hit) { if (n !== hit) { w[1] = Number(hit); changed++; } continue; }
    }
    const g = groups.get(strip(w[3]));
    if (!g || g.length < 2 || !g.includes(n)) continue;
    const exact = g.filter(k => acc(L[k].lemma) === acc(w[3]));
    let pick = exact.length === 1 ? exact[0] : null;
    if (!pick) { const inMaj = g.filter(k => maj.has(k)); if (inMaj.length === 1) pick = inMaj[0]; }
    if (pick && pick !== n) { w[1] = Number(pick); changed++; }
  }
}
fs.writeFileSync(file, src.slice(0, a) + JSON.stringify(data) + src.slice(src.lastIndexOf(';')));
console.log('retagged', changed, 'words');
