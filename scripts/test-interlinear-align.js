#!/usr/bin/env node
/* Interlinear alignment checks (node scripts/test-interlinear-align.js).

   Runs rhema-align.js over the whole NT, for both the Byzantine (RP2018) and
   critical (SBLGNT) texts, against the Berean word tables, and asserts known
   verses. Exits non-zero on a failed assertion.

     --stats   also print corpus-wide coverage numbers
*/
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
for (const f of ['rhema-bsb-align.js', 'rhema-nt.js', 'rhema-critical.js', 'rhema-critical-fallbacks.js', 'rhema-msb.js', 'rhema-bsb.js', 'rhema-lexicon.js']) {
  require(path.join(ROOT, f));
}
const A = require(path.join(ROOT, 'rhema-align.js'));
const W = global.window;
const LEMMAS = A.buildLemmaIndex(W.RhemaLexicon);

// Minimal mirror of the app's _rhemaResolveWord numbering rules.
function strongsOf(tok) {
  let s = tok[1];
  if (!s && tok[0]) {
    const key = String(tok[0]).normalize('NFC').replace(/[⸀-⸏.,;··()]/g, '').toLowerCase();
    s = W.RhemaCriticalFallbacks[tok[0]] || W.RhemaCriticalFallbacks[key] || A.strongsForLemma(LEMMAS, tok[3]) || '';
  }
  if (String(s) === '1519' && /^A-/.test(tok[2] || '')) s = 1520;
  return s ? String(s) : '';
}
function verseRows(book, c, v) { return (((W.RhemaBSBAlign[book] || {})[c] || {})[v]) || null; }
function align(text, book, c, v) {
  const toks = ((text[book] || {})[c] || {})[v] || [];
  const rows = verseRows(book, c, v);
  const res = A.alignGreekToRows(toks.map(strongsOf), rows || [], {
    prev: verseRows(book, c, String(+v - 1)), next: verseRows(book, c, String(+v + 1)),
  });
  return { toks, res };
}
const TEXTS = { majority: W.RhemaNT.text, critical: W.RhemaCriticalNT.text };

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  ok   ' + label);
  else { failures++; console.log('  FAIL ' + label + (detail ? '\n       ' + detail : '')); }
}
function eng(mode, book, c, v, surface, nth = 0) {
  const { toks, res } = align(TEXTS[mode], book, c, v);
  let seen = 0;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i][0].replace(/[⸀-⸏.,;··]/g, '') === surface && seen++ === nth) return res.english[i];
  }
  return undefined;
}

console.log('Greek → Berean rows');
check('John 1:1 λόγος → "Word"', eng('majority', 'JOH', '1', '1', 'λόγος') === 'Word');
check('Luke 1:13 εἶπεν (G3004 vs Berean G2036) → "said"', /said/i.test(eng('majority', 'LUK', '1', '13', 'Εἶπεν') || eng('majority', 'LUK', '1', '13', 'εἶπεν') || ''),
  'got ' + JSON.stringify(eng('majority', 'LUK', '1', '13', 'εἶπεν')));
check('Mark 1:22 διδαχῇ → "teaching"', eng('majority', 'MAR', '1', '22', 'διδαχῇ') === 'teaching');
check('Mark 1:22 ἐδίδασκεν → "He taught"', eng('majority', 'MAR', '1', '22', 'διδάσκων') === 'He taught' || eng('majority', 'MAR', '1', '22', 'ἐδίδασκεν') === 'He taught',
  'got ' + JSON.stringify([eng('majority', 'MAR', '1', '22', 'διδάσκων'), eng('majority', 'MAR', '1', '22', 'ἐδίδασκεν')]));
{
  const a = eng('majority', 'MAT', '12', '25', 'αὐτῶν'), b = eng('majority', 'MAT', '12', '25', 'αὐτοῖς');
  check('Matt 12:25 αὐτῶν/αὐτοῖς not swapped', !/them/i.test(a || '') && !/their/i.test(b || ''), `αὐτῶν=${a} αὐτοῖς=${b}`);
}
{
  const { toks, res } = align(TEXTS.critical, '2CO', '13', '13');
  const i = toks.findIndex(t => /ἁγίου/.test(t[0]));
  check('2 Cor 13:13 (SBL "grace" verse) ἁγίου is not "saints"', !/saints/i.test(res.english[i] || ''), `got ${res.english[i]} via ${res.region}`);
}

// Ordered-alignment invariant: two tokens with the same Strong's never cross.
function crossings(mode) {
  let n = 0;
  const T = TEXTS[mode];
  for (const b in W.RhemaBSBAlign) for (const c in W.RhemaBSBAlign[b]) for (const v in W.RhemaBSBAlign[b][c]) {
    const { toks, res } = align(T, b, c, v);
    const last = {};
    toks.forEach((t, i) => {
      const s = strongsOf(t); const j = res.rowIdx[i];
      if (!s || j < 0 || res.region !== 'own') return;
      if (last[s] != null && j < last[s]) n++;
      last[s] = j;
    });
  }
  return n;
}

console.log('\nVersion bridge');
function bridge(book, c, v, text, mode = 'majority') {
  const { toks, res } = align(TEXTS[mode], book, c, v);
  return { toks, out: A.bridgeToVersion(toks.map((t, i) => ({ bsb: res.english[i] })), text) };
}
function under(r, surface, nth = 0) {
  let seen = 0;
  for (let i = 0; i < r.toks.length; i++) if (r.toks[i][0].replace(/[⸀-⸏.,;··]/g, '') === surface && seen++ === nth) return r.out[i];
  return null;
}
{
  // NIV wording, quoted for a test fixture.
  const r = bridge('MAR', '1', '22', 'The people were amazed at his teaching, because he taught them as one who had authority, not as the teachers of the law.');
  const art = under(r, 'τῇ');
  check('NIV Mark 1:22 article τῇ does not take the supplied "The"', !art || art.text.toLowerCase() !== 'the', JSON.stringify(art));
  const amazed = under(r, 'ἐξεπλήσσοντο');
  check('NIV Mark 1:22 ἐξεπλήσσοντο → "amazed"', /amazed/.test(amazed?.text || ''), JSON.stringify(amazed));
  const scribes = under(r, 'γραμματεῖς');
  check('NIV Mark 1:22 γραμματεῖς → "teachers of the law" (inferred)', /teachers/.test(scribes?.text || '') && scribes.kind === 'inferred', JSON.stringify(scribes));
  const kai = r.toks.map((t, i) => t[0] === 'καὶ' || t[0] === 'Καὶ' ? r.out[i] : null).filter(Boolean);
  check('NIV Mark 1:22 the καί before οὐχ is "not"-adjacent or none, never the first-word "and"', kai.every(x => x.text !== 'The'), JSON.stringify(kai));
}
{
  const msb = W.RhemaMSB.MAR['1']['22'];
  const r = bridge('MAR', '1', '22', msb);
  const matched = r.out.filter(o => o.kind === 'match').length, words = r.out.filter(o => o.kind !== 'none').length;
  check(`MSB Mark 1:22 near-complete (${matched}/${words})`, matched >= words - 1, JSON.stringify(r.out));
}
{
  const r = bridge('JOH', '3', '16', W.RhemaMSB.JOH['3']['16']);
  const loved = under(r, 'ἠγάπησεν');
  check('MSB John 3:16 ἠγάπησεν → "loved"', /loved/.test(loved?.text || ''), JSON.stringify(loved));
  const one = under(r, 'μονογενῆ');
  check('MSB John 3:16 μονογενῆ → "only begotten"/"one and only"', /only/.test(one?.text || ''), JSON.stringify(one));
}
check('lemma lookup: οὕτω(ς) → G3779, οἶδα → G1492; γαμίζω is NOT γεμίζω',
  A.strongsForLemma(LEMMAS, 'οὕτω(ς)') === '3779' && A.strongsForLemma(LEMMAS, 'οἶδα') === '1492' && A.strongsForLemma(LEMMAS, 'γαμίζω') !== '1072');
check('translit of surface forms', A.translitGreek('ἠγάπησεν') === 'ēgapēsen' && A.translitGreek('υἱὸν') === 'huion' && A.translitGreek('ἄγγελος') === 'angelos' && A.translitGreek('ῥῆμα') === 'rhēma');
{
  const s = A.stem;
  check('stems: teacher/teachers, father/fathers, love/loved/loves/loving, said/say', s('teacher') === s('teachers') && s('father') === s('fathers') && new Set(['love', 'loved', 'loves', 'loving'].map(s)).size === 1 && s('said') === s('say'));
}

if (process.argv.includes('--stats')) {
  console.log('\nCorpus coverage');
  for (const mode of ['majority', 'critical']) {
    let tok = 0, aligned = 0, verses = 0, low = 0;
    const T = TEXTS[mode];
    for (const b in T) for (const c in T[b]) for (const v in T[b][c]) {
      const { toks, res } = align(T, b, c, v);
      verses++; tok += toks.length;
      aligned += res.english.filter(e => e != null).length;
      if (res.ratio < 0.45) low++;
    }
    console.log(`  ${mode}: ${aligned}/${tok} tokens aligned (${(100 * aligned / tok).toFixed(1)}%), ${low} of ${verses} verses withheld as unreliable, same-Strong's crossings: ${crossings(mode)}`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
