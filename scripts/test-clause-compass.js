#!/usr/bin/env node
// Clause Compass accuracy harness.
// Extracts the flow-analysis section straight out of app.js (so it always tests
// the shipping code), stubs the browser/NLP globals, and checks marker output
// against expectations on realistic verse texts. Run: node scripts/test-clause-compass.js
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const startMarker = 'let _rhemaFlowOn = false;';
const endMarker = 'function _rhemaFlowPresentCats';
const start = appSrc.indexOf(startMarker);
const end = appSrc.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) {
  console.error('Could not locate the flow section in app.js');
  process.exit(1);
}
const section = appSrc.slice(start, end);

const context = {
  console,
  // Browser/NLP stubs: no wink-nlp in node, so the fallback tokenizer runs —
  // the same degraded path the app uses before the NLP bundle loads.
  _rhemaEnglishNlp: null,
  _rhemaEnglishNlpPromise: null,
  _rhemaEnglishVersion: () => 'MSB',
  _rhemaText: () => ({}),
  isRhemaNTBook: () => false,
  _rhemaShowEnglish: true,
  _rhemaHighlightBarOn: false,
  _rhemaSyntaxMode: false,
  _rhemaPosHighlights: new Set(),
  _rhemaEnglishPosCache: new Map(),
  RHEMA_ENGLISH_NEGATIONS: new Set(),
  RHEMA_ENGLISH_POS_TO_HIGHLIGHT: {},
  HIGHLIGHT_CATS: {},
  RHEMA_ENGLISH_NLP_BUNDLE_VERSION: 'test',
  document: undefined,
  window: undefined
};
vm.createContext(context);
vm.runInContext(section, context);

const analyze = (text) =>
  vm.runInContext('_rhemaAnalyzeEnglishFlow(' + JSON.stringify(text) + ', "TestBook", "1", "' + Math.random() + '")', context);

// Each case: verse text, markers that MUST be found (cat -> phrase substring),
// and markers that MUST NOT be found.
const CASES = [
  // ── True positives that must keep working ────────────────────────────────
  { text: 'For God so loved the world that He gave His one and only Son.',
    want: [['REASON', 'For']], ban: [] },
  { text: 'Therefore go and make disciples of all nations.',
    want: [['CONCLUSION', 'Therefore'], ['COMMAND', 'go']], ban: [] },
  { text: 'But seek first the kingdom of God and His righteousness.',
    want: [['CONTRAST', 'But'], ['COMMAND', 'seek']], ban: [] },
  { text: 'If anyone comes to Me and does not hate his own father, he cannot be My disciple.',
    want: [['CONDITION', 'If']], ban: [] },
  { text: 'And when you pray, do not be like the hypocrites.',
    want: [['CONDITION', 'when'], ['COMMAND', 'do not be']], ban: [] },
  { text: 'Truly, truly, I say to you, whoever believes has eternal life.',
    want: [['EMPHASIS', 'Truly, truly'], ['CONDITION', 'whoever']], ban: [] },
  { text: 'Ask and it will be given to you; seek and you will find.',
    want: [['COMMAND', 'Ask'], ['COMMAND', 'seek']], ban: [] },
  { text: 'I have told you these things so that in Me you may have peace.',
    want: [['PURPOSE', 'so that']], ban: [] },
  { text: 'Whoever believes in Him shall not perish but have eternal life.',
    want: [['CONDITION', 'Whoever']], ban: [] },
  { text: 'Do not be anxious about anything, but in every situation present your requests to God.',
    want: [['COMMAND', 'Do not be'], ['CONTRAST', 'but']], ban: [] },
  // Verb-verb command idioms must not be caught by the subject-noun guard.
  { text: 'Keep watch and pray so that you will not fall into temptation.',
    want: [['COMMAND', 'Keep'], ['PURPOSE', 'so that']], ban: [] },
  { text: 'Fear God and keep His commandments.',
    want: [['COMMAND', 'Fear']], ban: [] },
  { text: 'He who believes in Me will live, even though he dies.',
    want: [['CONTRAST', 'even though']], ban: [] },
  { text: 'Blessed are those who hunger, for they shall be satisfied.',
    want: [['REASON', 'for']], ban: [] },

  // ── False positives the compass currently produces ───────────────────────
  // Narrative/temporal "when" is not a condition.
  { text: 'When Jesus heard this, He marveled and said to those following Him.',
    want: [], ban: [['CONDITION', 'When']] },
  { text: 'When evening came, His disciples went down to the sea.',
    want: [], ban: [['CONDITION', 'When']] },
  { text: 'And when He saw the crowds, He went up on the mountain.',
    want: [], ban: [['CONDITION', 'when']] },
  // Clause-initial noun that happens to spell like a verb is not a command.
  { text: 'Fear came upon all who lived around them.',
    want: [], ban: [['COMMAND', 'Fear']] },
  { text: 'Fear seized them all, and they glorified God.',
    want: [], ban: [['COMMAND', 'Fear']] },
  // Temporal "since" is not a reason.
  { text: 'Since the beginning of creation no one has seen such things.',
    want: [], ban: [['REASON', 'Since']] },

  // ── Conditional "when" with present/second-person must survive the fix ───
  { text: 'And when you fast, do not be somber like the hypocrites.',
    want: [['CONDITION', 'when']], ban: [] },
  { text: 'When you give to the needy, do not announce it with trumpets.',
    want: [['CONDITION', 'When']], ban: [] }
];

let pass = 0, fail = 0;
const failures = [];
CASES.forEach(({ text, want, ban }, i) => {
  const spans = analyze(text).spans.map((s) => ({ cat: s.cat, src: text.slice(s.start, s.end) }));
  const missing = want.filter(([cat, phrase]) =>
    !spans.some((s) => s.cat === cat && s.src.toLowerCase() === phrase.toLowerCase()));
  const wrong = ban.filter(([cat, phrase]) =>
    spans.some((s) => s.cat === cat && s.src.toLowerCase() === phrase.toLowerCase()));
  if (!missing.length && !wrong.length) { pass++; return; }
  fail++;
  failures.push({ i, text, spans, missing, wrong });
});

failures.forEach(({ i, text, spans, missing, wrong }) => {
  console.log(`\nCASE ${i}: ${text}`);
  console.log('  found:   ' + (spans.map((s) => `${s.cat}("${s.src}")`).join(' ') || '(none)'));
  if (missing.length) console.log('  MISSING: ' + missing.map(([c, p]) => `${c}("${p}")`).join(' '));
  if (wrong.length) console.log('  WRONG:   ' + wrong.map(([c, p]) => `${c}("${p}")`).join(' '));
});
console.log(`\n${pass}/${CASES.length} cases pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
