#!/usr/bin/env node
// Tests the chapter-block layer in verse-structure.js: the api.bible JSON
// passage parser and the block-window builder (budget, book bounds, cached
// skips, back-context). Run: node scripts/test-vs-block.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const store = {};
const ctx = {
  window: {}, console,
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  document: undefined, fetch: undefined,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'rhema-msb.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'verse-structure.js'), 'utf8'), ctx);

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) pass++; else { fail++; console.log('✗ ' + label); } };

// ── Parser: synthetic api.bible JSON content ─────────────────────────────────
const content = [
  { type: 'tag', name: 'para', attrs: { style: 'p' }, items: [
    { type: 'tag', name: 'verse', attrs: { style: 'v', number: '1', sid: 'GEN.5.1' } },
    { type: 'text', text: 'This is the book ', attrs: { verseId: 'GEN.5.1' } },
    { type: 'tag', name: 'char', attrs: { style: 'nd' }, items: [
      { type: 'text', text: 'of the generations', attrs: { verseId: 'GEN.5.1' } }
    ] },
    { type: 'text', text: ' of Adam.', attrs: { verseId: 'GEN.5.1' } },
    { type: 'tag', name: 'verse', attrs: { style: 'v', number: '2', sid: 'GEN.5.2' } },
    { type: 'text', text: 'Male and female He created them.' }
  ] },
  { type: 'tag', name: 'para', attrs: { style: 'p' }, items: [
    { type: 'tag', name: 'verse', attrs: { style: 'v', number: '1', sid: 'GEN.6.1' } },
    { type: 'text', text: 'Now it came to pass...' }
  ] }
];
const parsed = vm.runInContext('_vsParsePassageJson(' + JSON.stringify(content) + ', "GEN")', ctx);
ok(parsed['5'] && parsed['5']['1'] === 'This is the book of the generations of Adam.', 'nested char content joins verse 5:1');
ok(parsed['5'] && parsed['5']['2'] === 'Male and female He created them.', 'sid tracking covers unmarked text (5:2)');
ok(parsed['6'] && parsed['6']['1'] === 'Now it came to pass...', 'chapter boundary respected (6:1)');
ok(Object.keys(parsed).length === 2, 'exactly two chapters parsed');

// ── Window builder ───────────────────────────────────────────────────────────
const win1 = vm.runInContext('_vsBlockWindow("NIV", "GEN", "5")', ctx);
ok(win1.start <= 5 && win1.end >= 5, 'window contains target');
ok(win1.start >= 5 - 2, 'back-context limited to two chapters');
const msb = ctx.window.RhemaMSB;
const winVerses = (w) => { let n = 0; for (let c = w.start; c <= w.end; c++) n += Object.keys(msb.GEN[String(c)] || {}).length; return n; };
ok(winVerses(win1) <= 250, `window within 250-verse budget (got ${winVerses(win1)})`);
ok(win1.end > 5, 'window extends forward');

// Single-chapter book stays put
const winPhm = vm.runInContext('_vsBlockWindow("NIV", "PHM", "1")', ctx);
ok(winPhm.start === 1 && winPhm.end === 1, 'Philemon window is one chapter');

// Cached chapters are skipped: cache GEN 6-7, window from 5 must stop at 5
vm.runInContext('_vsSeedChapter("NIV","GEN","6",{"1":"x"}); _vsSeedChapter("NIV","GEN","7",{"1":"x"});', ctx);
const win2 = vm.runInContext('_vsBlockWindow("NIV", "GEN", "5")', ctx);
ok(win2.end === 5, `forward stops at cached chapter (end=${win2.end})`);

// Learned cap shrinks the budget
vm.runInContext('localStorage.setItem("vs_blockcap_NIV", "60")', ctx);
const win3 = vm.runInContext('_vsBlockWindow("NIV", "PSA", "1")', ctx);
ok(winVersesPsa(win3) <= 60 || win3.start === win3.end, 'learned cap respected');
function winVersesPsa(w) { let n = 0; for (let c = w.start; c <= w.end; c++) n += Object.keys(msb.PSA[String(c)] || {}).length; return n; }

// Seeding populates the verse cache used by compare/cross-refs
const seeded = vm.runInContext('_vsTextCache.get("NIV|GEN|6|1")', ctx);
ok(seeded === 'x', 'seeding feeds _vsTextCache for existing consumers');

console.log(`${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
