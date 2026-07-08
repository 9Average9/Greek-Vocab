#!/usr/bin/env node
// Audits rhema-english-dictionary.js for TOTAL coverage: every word appearing
// in the MSB and BSB texts must resolve to a non-empty definition using the
// same key fallbacks the app uses at runtime.
// Run: node scripts/test-english-dictionary.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['rhema-msb.js', 'rhema-bsb.js', 'rhema-english-dictionary.js'])
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
const entries = ctx.window.RhemaEnglishDictionary.entries;

// Mirrors _rhemaBundledEnglishDefs key fallbacks in app.js.
function lookup(word) {
  const clean = String(word).toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '').replace(/’/g, "'");
  return entries[clean] || entries[clean.replace(/'s$/, '').replace(/'$/, '')] || entries[clean.replace(/[^a-z'-]/g, '')] || null;
}

let total = 0, missing = [];
const seen = new Set();
for (const src of [ctx.window.RhemaMSB, ctx.window.RhemaBSB]) {
  for (const book of Object.values(src))
    for (const ch of Object.values(book))
      for (const v of Object.values(ch))
        for (const m of String(v).matchAll(/[A-Za-z][A-Za-z'’\-]*/g)) {
          const w = m[0];
          const key = w.toLowerCase().replace(/’/g, "'");
          if (seen.has(key)) continue;
          seen.add(key);
          if (key.replace(/'s$/, '').replace(/'$/, '').length < 2 && !['a', 'i'].includes(key)) continue;
          total++;
          const defs = lookup(w);
          if (!defs || !defs.length || !defs.every((d) => Array.isArray(d) && d[1] && d[1].length >= 2)) missing.push(w);
        }
}
if (missing.length) console.log('MISSING:', missing.slice(0, 40));
console.log(`${total} unique surface words checked, ${missing.length} without definitions`);
process.exit(missing.length ? 1 : 0);
