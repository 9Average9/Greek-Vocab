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
vm.runInContext('localStorage.setItem("vs_blockcap2_NIV", "60")', ctx);
const win3 = vm.runInContext('_vsBlockWindow("NIV", "PSA", "1")', ctx);
ok(winVersesPsa(win3) <= 60 || win3.start === win3.end, 'learned cap respected');
function winVersesPsa(w) { let n = 0; for (let c = w.start; c <= w.end; c++) n += Object.keys(msb.PSA[String(c)] || {}).length; return n; }

// Seeding populates the verse cache used by compare/cross-refs
const seeded = vm.runInContext('_vsTextCache.get("NIV|GEN|6|1")', ctx);
ok(seeded === 'x', 'seeding feeds _vsTextCache for existing consumers');

// ── Parser: real-world api.bible shapes (measured from live payloads) ────────
// Verse tags use "2CO 1:1" sids and wrap the printed number; the salutation
// paragraph's text has NO verseId of its own; continuation paras carry `vid`.
const realContent = [
  { type: 'tag', name: 'para', attrs: { style: 'po' }, items: [
    { type: 'tag', name: 'verse', attrs: { style: 'v', number: '1', sid: '2CO 1:1' }, items: [
      { type: 'text', text: '1' }
    ] },
    { type: 'text', text: 'Paul, an apostle of Christ Jesus by the will of God,' }
  ] },
  { type: 'tag', name: 'para', attrs: { style: 'po', vid: '2CO 1:1' }, items: [
    { type: 'text', text: 'To the church of God in Corinth.' }
  ] },
  { type: 'tag', name: 'para', attrs: { style: 'p' }, items: [
    { type: 'tag', name: 'verse', attrs: { style: 'v', number: '3', sid: '2CO 1:3' }, items: [
      { type: 'text', text: '3' }
    ] },
    { type: 'text', text: 'Praise be to the God and Father of our Lord,', attrs: { verseId: '2CO.1.3' } }
  ] }
];
const real = vm.runInContext('_vsParsePassageJson(' + JSON.stringify(realContent) + ', "2CO")', ctx);
ok(real['1'] && real['1']['1'] === 'Paul, an apostle of Christ Jesus by the will of God, To the church of God in Corinth.',
  'chapter-opening verse with space/colon sid + para vid parses (the 2 Cor 1:1 bug)');
ok(real['1'] && !/1\s*Paul/.test(real['1']['1']), 'printed verse number inside verse tag is skipped');
ok(real['1'] && real['1']['3'] === 'Praise be to the God and Father of our Lord,', 'dot-format text verseId still wins');

// Grouped verses (The Message): text on the first verse, pointers for the rest
const msgContent = [
  { type: 'tag', name: 'para', attrs: { style: 'p' }, items: [
    { type: 'tag', name: 'verse', attrs: { style: 'v', number: '1-2', sid: 'JHN 3:1-2' }, items: [
      { type: 'text', text: '1-2' }
    ] },
    { type: 'text', text: 'There was a man of the Pharisee sect, Nicodemus.' }
  ] }
];
const msg = vm.runInContext('_vsParsePassageJson(' + JSON.stringify(msgContent) + ', "JHN")', ctx);
ok(msg['3'] && msg['3']['1'] === 'There was a man of the Pharisee sect, Nicodemus.', 'range sid text lands on first verse');
ok(msg['3'] && /combined with verse 1/.test(msg['3']['2'] || ''), 'covered range verses get a pointer, not a gap');

// ── Scope: partial-canon versions never fetch out-of-canon books ─────────────
ok(vm.runInContext('_vsBookInScope("F35", "JOH")', ctx) === true, 'F35 (NT-only) allows John');
ok(vm.runInContext('_vsBookInScope("F35", "GEN")', ctx) === false, 'F35 (NT-only) blocks Genesis');
ok(vm.runInContext('_vsBookInScope("LXXEN", "GEN")', ctx) === true, 'Brenton LXX (OT-only) allows Genesis');
ok(vm.runInContext('_vsBookInScope("LXXEN", "JOH")', ctx) === false, 'Brenton LXX (OT-only) blocks John');
ok(vm.runInContext('_vsBookInScope("KJV", "JOH")', ctx) === true, 'full-canon version allows everything');

// ── Truncation: partially-served tail chapter must not be cached ─────────────
(async () => {
  // Serve GEN 10 complete + GEN 11 with only 5 of its verses (mid-chapter cut).
  const gen10Count = Object.keys(msb.GEN['10']).length;
  const items = [];
  for (let v = 1; v <= gen10Count; v++) {
    items.push({ type: 'tag', name: 'verse', attrs: { number: String(v), sid: `GEN 10:${v}` }, items: [{ type: 'text', text: String(v) }] });
    items.push({ type: 'text', text: `Chapter ten verse ${v}.` });
  }
  for (let v = 1; v <= 5; v++) {
    items.push({ type: 'tag', name: 'verse', attrs: { number: String(v), sid: `GEN 11:${v}` }, items: [{ type: 'text', text: String(v) }] });
    items.push({ type: 'text', text: `Chapter eleven verse ${v}.` });
  }
  ctx.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: { content: [{ type: 'tag', name: 'para', attrs: { style: 'p' }, items }] } }) });
  ctx.indexedDB = undefined;
  const got = await vm.runInContext('_vsFetchChapterBlock("KJV", "GEN", "10")', ctx);
  ok(got && Object.keys(got).length === gen10Count, 'complete chapter from a truncated response is cached');
  ok(vm.runInContext('_vsChapterFromMemory("KJV","GEN","11")', ctx) === null, 'partial tail chapter is NOT cached');
  ok(Number(store['vs_blockcap2_KJV'] || 0) >= 30, 'truncation learning records the real cap');

  // ── Backward fill: paging back into a book must still pull a full block ─────
  // CSB GEN 6 cached (user came from there) → target GEN 5 can't extend forward,
  // so the window spends its budget backward past the 2-chapter context cap.
  vm.runInContext('_vsSeedChapter("CSB","GEN","6",{"1":"x"})', ctx);
  const winBack = vm.runInContext('_vsBlockWindow("CSB", "GEN", "5")', ctx);
  ok(winBack.start === 1 && winBack.end === 5, `backward window fills the budget (got ${winBack.start}-${winBack.end})`);

  // ── Whole-version download: minimal calls for a full canon ──────────────────
  // Stub server returns every requested chapter in full; count the calls needed
  // to download all of F35 (NT-only). Theoretical floor: NT verses / 250.
  const ctx2 = {
    window: {}, console,
    localStorage: { getItem: (k) => null, setItem: () => {}, removeItem: () => {} },
    document: undefined, indexedDB: undefined,
  };
  vm.createContext(ctx2);
  vm.runInContext(fs.readFileSync(path.join(root, 'rhema-msb.js'), 'utf8'), ctx2);
  vm.runInContext(fs.readFileSync(path.join(root, 'verse-structure.js'), 'utf8'), ctx2);
  const msb2 = ctx2.window.RhemaMSB;
  const apiToApp = { MRK: 'MAR', JHN: 'JOH', JAS: 'JAM', '1JN': '1JO', '2JN': '2JO', '3JN': '3JO' };
  let calls = 0;
  ctx2.fetch = async (url) => {
    calls++;
    const m = String(url).match(/\/passages\/([A-Z0-9]+)\.(\d+)(?:-[A-Z0-9]+\.(\d+))?\?/);
    const apiBook = m[1], s = Number(m[2]), e = Number(m[3] || m[2]);
    const appBook = apiToApp[apiBook] || apiBook;
    const items = [];
    for (let c = s; c <= e; c++) {
      const count = Object.keys(msb2[appBook]?.[String(c)] || {}).length;
      for (let v = 1; v <= count; v++) {
        items.push({ type: 'tag', name: 'verse', attrs: { number: String(v), sid: `${apiBook} ${c}:${v}` }, items: [{ type: 'text', text: String(v) }] });
        items.push({ type: 'text', text: `${appBook} ${c}:${v} text.` });
      }
    }
    return { ok: true, status: 200, json: async () => ({ data: { content: [{ type: 'tag', name: 'para', attrs: { style: 'p' }, items }] } }) };
  };
  const done = await vm.runInContext('_vsDownloadWholeVersion("F35", null)', ctx2);
  const stats = vm.runInContext('_vsVersionCacheStats("F35")', ctx2);
  const ntVerses = vm.runInContext('_vsBooksForTrans("F35")', ctx2)
    .reduce((n, b) => n + Object.keys(msb2[b] || {}).reduce((m, c) => m + Object.keys(msb2[b][c]).length, 0), 0);
  const floor = Math.ceil(ntVerses / 250);
  ok(done === true, 'whole-version download completes');
  ok(stats.cached === stats.total && stats.total > 250, `every chapter cached (${stats.cached}/${stats.total})`);
  ok(calls <= floor + 27, `call count near the theoretical floor (${calls} calls for ${ntVerses} verses; floor ${floor})`);
  ok(vm.runInContext('_vsChapterFromMemory("F35","REV","22")', ctx2)?.['21'], 'last NT verse present after bulk download');

  console.log(`${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
