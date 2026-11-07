#!/usr/bin/env node
/* Checks the receipt verifier in build-word-study.js (no API calls):
   node scripts/test-word-study.js */
const path = require('path');
const fs = require('fs');
const B = require('./build-word-study.js');

const W = B.loadWindowFiles(['rhema-nt.js', 'rhema-critical.js', 'rhema-lxx.js', 'rhema-lexicon.js', 'rhema-mm.js']);
const shard = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'deep-lexicon', 'shard-4501.json'), 'utf8'));
const entry = shard[4561]; // σάρξ
const { sources } = B.buildPack(entry, W.RhemaLexicon[4561], W.RhemaMoultonMilligan[4561], W);
const v = B.makeVerifier(W);

let failures = 0;
const check = (label, cond, detail) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`);
  if (!cond) { failures++; if (detail) console.log('       ' + detail); }
};

check('ROM 8:3 contains σάρξ', v.verseHas('ROM 8:3', 4561));
check('JOH 3:16 does not contain σάρξ', !v.verseHas('JOH 3:16', 4561));
check('GEN 2:21 (Septuagint) contains σάρξ', v.verseHas('GEN 2:21', 4561));
check('malformed ref rejected', !v.verseHas('Romans 8:3', 4561));
check('εἶπον verified as λέγω (G2036 ≡ G3004) in Luke 1:13', v.verseHas('LUK 1:13', 2036));

const raw = {
  summary: 'test',
  senses: [
    { label: 'body', definition: 'the physical body', refs: ['MAT 19:5', 'JOH 3:16'], note: null },
    { label: 'fallen human nature', definition: 'x', refs: ['ROM 8:3', 'GAL 5:17'], note: null },
    { label: 'invented', definition: 'no valid refs', refs: ['JOH 3:16', 'REV 99:1'], note: null },
  ],
  authorNotes: [
    { author: 'Paul', note: 'ethical sense', refs: ['ROM 8:3', 'MAT 1:1'] },
  ],
  translationNote: null,
  background: [
    { period: 'classical', note: 'Homer uses the plural', citation: 'Il. 8.380' },
    { period: 'papyri', note: 'made up', citation: 'P Fake 123' },
  ],
  exegesisTip: null,
  caution: null,
};
const out = B.verifyStudy(raw, entry, sources, v);
check('unverifiable verse removed from a sense', out.senses[0].refs.join() === 'MAT 19:5', JSON.stringify(out.senses[0].refs));
check('sense with no verified verse removed', out.senses.length === 2 && !out.senses.some(s => s.label === 'invented'));
check('author-note refs verified', out.authorNotes[0].refs.join() === 'ROM 8:3');
check('history citation found in LSJ kept; invented one dropped', out.background.length === 1 && out.background[0].citation === 'Il. 8.380');
check('stats recorded', out.verified.refsDropped === 4 && out.verified.sensesDropped === 1 && out.verified.backgroundDropped === 1, JSON.stringify(out.verified));

const A = require('../rhema-align.js');
const MM = W.RhemaMoultonMilligan, LX = W.RhemaLexicon;
check('papyri article filed under the wrong word is rejected (φάγω holds φαίνω)', !A.mmHeadwordMatches(MM[5315], LX[5315].lemma));
check('papyri article for the right word is accepted (σάρξ, ἀγάπη)', A.mmHeadwordMatches(MM[4561], LX[4561].lemma) && A.mmHeadwordMatches(MM[26], LX[26].lemma));
check('spelling variants accepted (ἐνκαινίζω for ἐγκαινίζω; ἤ)', A.mmHeadwordMatches(MM[1457], LX[1457].lemma) && A.mmHeadwordMatches(MM[2228], LX[2228].lemma));

console.log(failures ? `\n${failures} failure(s)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
