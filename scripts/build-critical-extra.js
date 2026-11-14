#!/usr/bin/env node
// Critical-text (SBLGNT) words that had no dictionary entry: words and
// spellings found only in the modern critical text, which Strong's 1890
// numbering (built on the Textus Receptus) never covered. About 1 word in 1,300
// of the critical text.
//
//   1. Spelling variants of a word or name that is already in the dictionary
//      (Βόος = Βοόζ "Boaz", Ναθάμ = Ναθάν) → that entry.
//   2. Words STEPBible numbers in its "Extended Strong's" (G6000 and up), with
//      their Abbott-Smith entry (TBESG, STEPBible.org, CC BY 4.0).
//   3. The few left (in neither list) get a short standard gloss, marked as
//      added by Rhēma.
//
//   node scripts/build-critical-extra.js path/to/TBESG.txt
// Writes rhema-critical-extra.js.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = path.join(__dirname, '..');
const load = (file) => { const c = { window: {} }; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(R, file), 'utf8'), c); return c.window; };
const W = Object.assign({}, load('rhema-critical.js'), load('rhema-lexicon.js'), load('rhema-critical-fallbacks.js'), load('rhema-align.js'));
const app = fs.readFileSync(path.join(R, 'app.js'), 'utf8');
const surfFallbacks = (() => { const i = app.indexOf('const RHEMA_SURFACE_STRONGS_FALLBACKS = {'); const j = app.indexOf('\n};\n', i); return vm.runInNewContext('(' + app.slice(app.indexOf('{', i), j + 2) + ')'); })();

const strip = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^α-ως]/g, '').replace(/ς/g, 'σ');
// The app's surface key (_rhemaGreekSurfaceKey): accents off, lower case, letters only.
const surfaceKey = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^α-ω]/g, '');
const lemmaIdx = W.RhemaAlign.buildLemmaIndex(W.RhemaLexicon);
const resolves = (w) => {
  if (w[1] && W.RhemaLexicon[w[1]]) return true;
  const k = surfaceKey(w[0]);
  const s = surfFallbacks[k] || W.RhemaCriticalFallbacks[k] || W.RhemaAlign.strongsForLemma(lemmaIdx, w[3]);
  return !!(s && W.RhemaLexicon[s]);
};

// 1. Same word or name, spelled differently in the critical text.
const VARIANT = {
  'Ἀχίμ': 885, 'ἔννυχα': 1773, 'Συροφοινίκισσα': 4949, 'νοσσός': 3502, 'Ἐλμαδάμ': 1678, 'Ἰωρίμ': 2497, 'Ἰωνάμ': 2494,
  'Μεννά': 3104, 'Ναθάμ': 3481, 'Βόος': 1003, 'Ἰάρετ': 2391, 'Ναιμάν': 3497, 'Ἑμμώρ': 1697, 'Ῥαιφάν': 4481,
  'Ἰωβήλ': 5601, // Abbott-Smith: "Ἰωβήδ (WH, -βήλ …; Rec. Ὠβήδ)", Obed
  'ἀνεξεραύνητος': 419, 'ἐξεραυνάω': 1830, 'φαιλόνης': 5341, 'ῥέδη': 4480, 'δυσεντέριον': 1420, 'ἐπικέλλω': 2027,
  'Καῦδα': 2802, 'Ἀμπλιᾶτος': 291, 'πορρώτερον': 4208, 'τρίτον': 5154, 'μενοῦν': 3304, 'ἀγαθουργέω': 14, 'Νέα': 3501,
  'εἰδέα': 2397,
};
// 3. In neither Strong's nor STEPBible's extended list: a short standard gloss.
const OWN = {
  'Ἀσάφ': ['Asaph', 'A name. In Matthew 1:7–8 many manuscripts read Ἀσά (Asa) here.'],
  'καταβαρύνω': ['weigh down, make heavy', ''],
  'στασιαστής': ['rebel, insurrectionist', ''],
  'θορυβάζω': ['trouble, upset, distract', ''],
  'ἐπιλείχω': ['lick (over)', ''],
  'προσκλίνω': ['join, attach oneself to', ''],
  'διόρθωμα': ['reform, improvement', ''],
  'εὐρακύλων': ['northeaster (the wind “Euraquilo”)', ''],
  'εὐπάρεδρος': ['devoted, constantly attending', ''],
  'κημόω': ['muzzle', ''],
  'συμμορφίζω': ['share the form of, be conformed to', ''],
  'ἐνορκίζω': ['put under oath, adjure', ''],
  'ἀφθορία': ['integrity, soundness', ''],
  'κυλισμός': ['rolling, wallowing', ''],
  'παρακαθέζομαι': ['sit beside', ''],
};

// 2. TBESG: Extended Strong's with Abbott-Smith.
const tbesg = new Map();
for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  const f = line.split('\t');
  if (!/^G\d/.test(f[0]) || f.length < 8) continue;
  const n = parseInt(f[0].slice(1), 10);
  const k = strip(f[3]);
  if (!tbesg.has(k)) tbesg.set(k, []);
  tbesg.get(k).push({ n, kind: f[1] || '', lemma: f[3].trim(), translit: (f[4] || '').trim(), morph: f[5] || '', gloss: (f[6] || '').trim(), def: f[7] || '' });
}
const cleanDef = d => d.replace(/<ref='[^']*'>/g, '').replace(/<\/ref>/g, '').replace(/<BR \/>/gi, '<br>').replace(/†\s*\([A-Z]+\)\s*$/g, '').trim();

const lemmaMap = {};
const lex = {};
const report = { variant: 0, tbesg: 0, own: 0, left: [] };
const T = W.RhemaCriticalNT.text;
const decided = new Map(); // lemma -> key or null
let ownN = 0;
for (const b in T) for (const c in T[b]) for (const v in T[b][c]) for (const w of T[b][c][v]) {
  // Every unnumbered word; the app consults this list last, after its other
  // fallbacks, so words it already resolves are unaffected.
  if (w[1]) continue;
  const lemma = w[3] || w[0];
  if (!decided.has(lemma)) {
    let key = null;
    const lemmaOwn = Object.keys(OWN).find(x => strip(x) === strip(lemma)) || (lemma === 'καταβαρύνομαι' ? 'καταβαρύνω' : lemma === 'προσκλίνομαι' ? 'προσκλίνω' : lemma === 'συμμορφίζομαι' ? 'συμμορφίζω' : lemma === 'εὐπάρεδρον' ? 'εὐπάρεδρος' : null);
    if (VARIANT[lemma] && W.RhemaLexicon[VARIANT[lemma]]) { key = String(VARIANT[lemma]); report.variant++; }
    else {
      const cap = /^\p{Lu}/u.test(lemma);
      const hit = (tbesg.get(strip(lemma)) || []).find(e => e.n > 5624 && (!cap || /^N:/.test(e.morph) || /a Name of/.test(e.kind)));
      if (hit) {
        key = String(hit.n);
        lex[key] = { lemma: hit.lemma, translit: hit.translit, gloss: hit.gloss, brief: hit.gloss, strongs_def: '', kjv_def: '', abbott_smith: cleanDef(hit.def),
          source: 'STEPBible Extended Strong’s (TBESG, Abbott-Smith), CC BY 4.0' };
        report.tbesg++;
      } else if (lemmaOwn) {
        key = `SBL${++ownN}`;
        const [gloss, note] = OWN[lemmaOwn];
        lex[key] = { lemma: lemmaOwn, translit: W.RhemaAlign.translitGreek(lemmaOwn), gloss, brief: gloss, strongs_def: '', kjv_def: '', abbott_smith: '',
          note: note || '', source: 'Short gloss added by Rhēma (this word isn’t in Strong’s or STEPBible’s lists)' };
        report.own++;
      }
    }
    decided.set(lemma, key);
    if (key) lemmaMap[lemma] = key;
  }
}
report.left = [...decided].filter(([l, k]) => !k && !resolves(['', '', '', l])).map(([l]) => l);
const out = `// Generated by scripts/build-critical-extra.js: dictionary entries for
// critical-text (SBLGNT) words Strong's numbering doesn't cover.
// Sources: STEPBible TBESG (Abbott-Smith), STEPBible.org, CC BY 4.0; spelling
// variants point to existing entries; a few short glosses added by Rhēma.
window.RhemaCriticalExtra = ${JSON.stringify({ lemma: lemmaMap, lex })};
`;
fs.writeFileSync(path.join(R, 'rhema-critical-extra.js'), out);
console.log(JSON.stringify({ ...report, lemmas: Object.keys(lemmaMap).length, entries: Object.keys(lex).length, bytes: out.length }));
