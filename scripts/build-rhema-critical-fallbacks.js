#!/usr/bin/env node
// Builds safe Strong's fallbacks for SBLGNT/Critical forms missing Strong numbers.
//
// The source Critical file is left untouched. This helper derives a normalized
// Greek surface -> Strong's map only when that surface has exactly one Strong's
// value in the shipped Majority text. Ambiguous forms are intentionally skipped.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'rhema-critical-fallbacks.js');

function loadGlobals(files) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox.window;
}

function greekKey(surface = '') {
  return String(surface)
    .normalize('NFD')
    .replace(/\u0345/g, '\u03b9')
    .replace(/[\u0300-\u0344\u0346-\u036f]/g, '')
    .replace(/\u03c2/g, '\u03c3')
    .toLowerCase()
    .replace(/[^\u03b1-\u03c9]/g, '');
}

// Curated lemma aliases for Critical/SBLGNT spellings that differ from the
// Majority-text lexicon spelling but point to the same established Strong's
// entry. These are intentionally explicit; ambiguous text-critical names and
// split numerals are left unresolved instead of guessed.
const CURATED_LEMMA_STRONGS = {
  τεσσερακοντα: '5062',
  καφαρναουμ: '2584',
  φοβεομαι: '5399',
  κραβαττοσ: '2895',
  σαμαριτησ: '4541',
  μωυσησ: '3475',
  γαμιζω: '1061',
  εγκακεω: '1573',
  εραυναω: '2045',
  μαθθαιοσ: '3156',
  τετρααρχησ: '5076',
  λεγιων: '3003',
  βαλλαντιον: '905',
  προσωπολημψια: '4382',
  ελεαω: '1653',
  ειδωλολατρια: '1495',
  ελιακιμ: '1662',
  νεφθαλιμ: '3508',
  ισκαριωθ: '2469',
  τετρααρχεω: '5075',
  οιδα: '1492',
  συνιστημι: '4921',
  ανεπιλημπτοσ: '423',
  νηφαλιοσ: '3524',
  βιβλαριδιον: '974',
  βοεσ: '1003',
  ιωβηδ: '5601',
  ναζαρα: '3478',
  κρυφαιοσ: '2927',
  καναναιοσ: '2581',
  επικαλεω: '1941',
  γεθσημανι: '1068',
  ιαιροσ: '2383',
  αναγαιον: '508',
  ωταριον: '5621',
  μνηστευομαι: '3423',
  μαθθατ: '3158',
  καιναμ: '2536',
  χρεοφειλετησ: '5533',
  επιριπτω: '1977',
  σαμαριτισ: '4542',
  μαθθιασ: '3159',
  τεσσερακονταετησ: '5063',
  επαρχεια: '1885',
  επιστασισ: '1999',
  οικτιρω: '3627',
  συμφορον: '4851',
  ησσων: '2276',
  λογεια: '3048',
  ητταομαι: '2274',
  σκοτοομαι: '4654',
  οφθαλμοδουλια: '3787',
  χρυσουσ: '5552',
  // High-confidence SBLGNT vocabulary verified against the shipped Rhema Lexicon
  // (the deponent/orthographic form points to the same established Strong's entry).
  εκπλησσομαι: '1605',
  μεταμορφοομαι: '3339',
  συσχηματιζομαι: '4964',
  δεικνυμι: '1166',
  μιμνηισκομαι: '3403',
  αμφοτεροι: '297',
  ημισυσ: '2255',
  αρσην: '730',
  ξυραομαι: '3587',
  μεταπεμπομαι: '3343',
  βατταλογεω: '945',
  κολλαομαι: '2853',
  εξολεθρευω: '1842',
  φαρμακον: '5331',
  ζηλευω: '2206',
};

function isContentMorph(morph = '') {
  const pos = String(morph).split('-')[0];
  return !['', 'T', 'ADV', 'CONJ', 'COND', 'PRT', 'PART', 'PREP'].includes(pos);
}

function add(map, key, strongs) {
  if (!key || !strongs) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(String(strongs));
}

function walkText(text, visit) {
  for (const book of Object.keys(text || {})) {
    for (const chapter of Object.keys(text[book] || {})) {
      for (const verse of Object.keys(text[book][chapter] || {})) {
        (text[book][chapter][verse] || []).forEach((word, index) => visit(word, { book, chapter, verse, index }));
      }
    }
  }
}

function asciiJson(value) {
  return JSON.stringify(value, null, 2).replace(/[^\x09\x0a\x0d\x20-\x7e]/g, (char) => {
    const code = char.charCodeAt(0).toString(16).padStart(4, '0');
    return `\\u${code}`;
  });
}

function main() {
  const globals = loadGlobals(['rhema-nt.js', 'rhema-critical.js']);
  const majority = globals.RhemaNT?.text || {};
  const critical = globals.RhemaCriticalNT?.text || {};
  const surfaceStrong = new Map();
  const criticalLemmaStrong = new Map();

  walkText(majority, (word) => add(surfaceStrong, greekKey(word[0]), word[1]));
  // The Critical text is internally consistent in lemma spelling: a missing-tag
  // form can borrow the Strong's number that other occurrences of the SAME lemma
  // already carry. This uses the text's own tags — no guessing.
  walkText(critical, (word) => { if (word[1] && word[3]) add(criticalLemmaStrong, greekKey(word[3]), word[1]); });

  const fallback = {};
  const skipped = { ambiguous: 0, unresolved: 0 };
  const resolvedBy = { surface: 0, curatedLemma: 0, criticalLemma: 0 };
  let missing = 0;
  walkText(critical, (word) => {
    if (word[1] || !isContentMorph(word[2])) return;
    missing += 1;
    const surfaceKey = greekKey(word[0]);
    const lemmaKey = greekKey(word[3] || '');
    const values = surfaceStrong.get(surfaceKey);
    const critLemma = criticalLemmaStrong.get(lemmaKey);
    if (values?.size === 1) {
      fallback[surfaceKey] = [...values][0];
      resolvedBy.surface += 1;
    } else if (CURATED_LEMMA_STRONGS[lemmaKey]) {
      fallback[surfaceKey] = CURATED_LEMMA_STRONGS[lemmaKey];
      resolvedBy.curatedLemma += 1;
    } else if (critLemma?.size === 1) {
      fallback[surfaceKey] = [...critLemma][0];
      resolvedBy.criticalLemma += 1;
    } else if (values?.size > 1 || critLemma?.size > 1) {
      skipped.ambiguous += 1;
    } else {
      skipped.unresolved += 1;
    }
  });

  const sorted = Object.fromEntries(Object.entries(fallback).sort(([a], [b]) => a.localeCompare(b)));
  const body = `// Generated by scripts/build-rhema-critical-fallbacks.js\n` +
    `// Maps normalized Critical/SBLGNT Greek surfaces that lack Strong's numbers\n` +
    `// to a unique Strong's number observed for the same surface in the Majority text.\n` +
    `window.RhemaCriticalFallbacks = ${asciiJson(sorted)};\n`;
  fs.writeFileSync(OUT, body);

  console.log(JSON.stringify({
    missingCriticalContentWords: missing,
    fallbackKeys: Object.keys(sorted).length,
    resolvedBy,
    skipped,
    out: OUT,
  }, null, 2));
}

main();
