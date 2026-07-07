#!/usr/bin/env node
// Golden Threads data integrity: every ref must exist in the MSB text, ids
// unique, categories valid, notes present. Run: node scripts/test-threads-data.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'bible-threads.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'rhema-msb.js'), 'utf8'), ctx);
const data = ctx.window.BibleThreads, msb = ctx.window.RhemaMSB;
const catIds = new Set(data.categories.map(c => c.id));
const ids = new Set();
let errors = 0, stops = 0;
const err = (m) => { console.log('✗ ' + m); errors++; };
data.topics.forEach(t => {
  if (ids.has(t.id)) err(`duplicate topic id: ${t.id}`); ids.add(t.id);
  if (!catIds.has(t.cat)) err(`${t.id}: unknown category ${t.cat}`);
  if (!t.title || !t.intro || !t.tagline) err(`${t.id}: missing title/intro/tagline`);
  if (!Array.isArray(t.verses) || t.verses.length < 6) err(`${t.id}: too few verses`);
  const seen = new Set();
  (t.verses || []).forEach(({ r, n }) => {
    stops++;
    if (!n || n.length < 10) err(`${t.id} ${r}: missing/short note`);
    if (seen.has(r)) err(`${t.id}: duplicate ref ${r} within thread`); seen.add(r);
    const m = String(r).match(/^([A-Z0-9]{3})\s+(\d+):(\d+)$/);
    if (!m) { err(`${t.id}: bad ref format "${r}"`); return; }
    const text = msb?.[m[1]]?.[m[2]]?.[m[3]];
    if (!text) err(`${t.id}: ref not found in MSB: ${r}`);
    else if (text.length < 15) console.log(`⚠ short verse ${r}: "${text}"`);
  });
});
console.log(`${data.topics.length} threads, ${stops} stops, ${errors} errors`);
process.exit(errors ? 1 : 0);
