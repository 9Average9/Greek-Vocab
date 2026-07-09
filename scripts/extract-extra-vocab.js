#!/usr/bin/env node
// Builds scripts/data/extra-english-vocab.json — the vocabulary (word list
// only, never the licensed text) of every downloadable translation, used by
// build-english-dictionary.py so the offline dictionary covers all versions.
//
// Usage: node scripts/extract-extra-vocab.js <dir-with-corpus-CODE.txt-files>
// Corpus files are plain text dumps of each version (fetch them with the
// api.bible passages endpoint; they are NOT committed to the repo).
'use strict';
const fs = require('fs'), path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('usage: extract-extra-vocab.js <corpus dir>'); process.exit(1); }

// Early-Modern-spelling translations: words seen ONLY here are flagged so the
// dictionary builder gives them spelling-alias entries.
const EARLY_MODERN = new Set(['GNV']);
// The Orthodox Jewish Bible uses thousands of transliterated Hebrew terms;
// words seen only there get a tailored entry.
const HEBREW_HEAVY = new Set(['TOJB']);

// Object.create(null): corpus words like "constructor" must not collide with
// Object.prototype members.
const info = Object.create(null); // word → { lc, cap, gnv }
const seenIn = Object.create(null); // word → Set of version codes
for (const f of fs.readdirSync(dir)) {
  const m = f.match(/^corpus-([A-Z0-9]+)\.txt$/);
  if (!m) continue;
  const code = m[1];
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const t of text.matchAll(/[A-Za-z][A-Za-z'’\-]*/g)) {
    const raw = t[0];
    let w = raw.toLowerCase().replace(/’/g, "'").replace(/'s$/, '').replace(/'$/, '');
    if (w.length < 2 && w !== 'a' && w !== 'i') continue;
    const e = info[w] || (info[w] = { lc: 0, cap: 0 });
    if (/^[a-z]/.test(raw)) e.lc++; else e.cap++;
    (seenIn[w] || (seenIn[w] = new Set())).add(code);
  }
}
for (const [w, versions] of Object.entries(seenIn)) {
  if ([...versions].every(v => EARLY_MODERN.has(v))) info[w].gnv = 1;
  if ([...versions].every(v => HEBREW_HEAVY.has(v))) info[w].heb = 1;
}
const out = path.join(__dirname, 'data', 'extra-english-vocab.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(info));
console.log(Object.keys(info).length, 'words →', out);
