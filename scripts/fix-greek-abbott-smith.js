#!/usr/bin/env node
// Abbott-Smith text attached to the wrong word in rhema-lexicon.js:
//  - STEPBible (TBESG) lists several lines under one number for G1, G2424, G2501
//    and the build kept the LAST (ἔα "ah!" under Alpha, Ἰωσή under Ἰησοῦς);
//    take the line whose headword is the entry's word.
//  - TBESG itself files σέ/σοί/σοῦ/ὑμᾶς/ὑμεῖς/ὑμῖν under αὐτός's text; they are
//    forms of σύ, whose entry covers them.
//  - TBESG has another word's text for G62, G1633, G3426: their own Abbott-Smith
//    entries (public domain, 1922) are given here.
//   node scripts/fix-greek-abbott-smith.js path/to/TBESG.txt
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..');
const P = path.join(R, 'rhema-lexicon.js');
const src = fs.readFileSync(P, 'utf8');
const marker = 'window.RhemaLexicon = ';
const a = src.indexOf(marker) + marker.length;
// find the end of the object literal
const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(src, ctx);
const L = ctx.window.RhemaLexicon;
const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^α-ως]/g, '').replace(/ς/g, 'σ');
const clean = d => d.replace(/<ref='[^']*'>/g, '').replace(/<\/ref>/g, '').replace(/<BR \/>/gi, '<br>').replace(/†\s*\([A-Z]+\)\s*$/g, '').trim();
const T = {};
for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  const f = line.split('\t'); if (!/^G\d/.test(f[0]) || f.length < 8) continue;
  (T[parseInt(f[0].slice(1), 10)] ||= []).push(f);
}
let n = 0;
for (const k of ['1', '2424', '2501']) {
  const head = d => strip(d.replace(/<[^>]+>/g, '').trim().split(/[,\s]/)[0] || '');
  const pick = (T[k] || []).find(r => head(r[7]) === strip(L[k].lemma)) || (T[k] || [])[0];
  if (pick) { L[k].abbott_smith = clean(pick[7]); n++; }
}
for (const k of ['4571', '4671', '4675', '5209', '5210', '5213']) { L[k].abbott_smith = L['4771'].abbott_smith; n++; }
const OWN = {
  '62': '<b>ἀγράμματος</b>, -ον (γράμμα), <br> <b>unlettered, illiterate</b>: Act.4:13.†',
  '1633': '<b>ἐκ-χωρέω</b>, -ῶ, <br> <b>to go out, depart</b>: Luk.21:21.†',
  '3426': '<b>μόδιος</b>, -ου, ὁ (Lat. <i>modius</i>), <br> a dry measure (about a peck), <b>a bushel</b>: Mat.5:15, Mrk.4:21, Luk.11:33.†',
};
for (const [k, t] of Object.entries(OWN)) { L[k].abbott_smith = t; n++; }
// rewrite only the lexicon object, keeping everything after it (occurrences etc.)
const rest = src.slice(a);
let depth = 0, i = 0, inStr = false, esc = false;
for (; i < rest.length; i++) {
  const c = rest[i];
  if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
  if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
}
fs.writeFileSync(P, src.slice(0, a) + JSON.stringify(L) + rest.slice(i));
console.log('entries fixed', n);
