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

  // ══ ESV (Crossway) — streaming-only, never stored ═══════════════════════════

  // Hidden while no key is pasted (the main ctx loaded with ESV_API_KEY = '')
  ok(vm.runInContext('VS_TRANSLATIONS.includes("ESV")', ctx) === false, 'ESV hidden from registry while key is empty');

  // Parser: plain-text [N] markers
  const esvChap = vm.runInContext(
    '_esvParseChapter(' + JSON.stringify('\n  [1] In the beginning was the Word, and the Word was with God. [2] He was\nin the beginning with God. (ESV)') + ')', ctx);
  ok(esvChap && esvChap['1'] === 'In the beginning was the Word, and the Word was with God.', 'ESV parser splits on [N] markers');
  ok(esvChap && esvChap['2'] === 'He was in the beginning with God. (ESV)', 'ESV copyright notice stays on the last verse');
  const esvPsalm = vm.runInContext(
    '_esvParseChapter(' + JSON.stringify('To the choirmaster. A Psalm of David.\n\n  [1] The heavens declare the glory of God. [2] Day to day pours out speech. (ESV)') + ')', ctx);
  ok(esvPsalm && /^To the choirmaster\. A Psalm of David\. The heavens declare/.test(esvPsalm['1']), 'psalm superscription prepends to verse 1');
  ok(vm.runInContext('_esvParseChapter("no markers here")', ctx) === null, 'markerless text parses to null');

  // A context with a key pasted in: ESV appears and streams from memory only.
  const ctx3 = {
    window: {}, console,
    localStorage: {
      _s: {},
      getItem(k) { return this._s[k] ?? null; },
      setItem(k, v) { this._s[k] = String(v); },
      removeItem(k) { delete this._s[k]; },
    },
    document: undefined, indexedDB: undefined,
  };
  vm.createContext(ctx3);
  vm.runInContext(fs.readFileSync(path.join(root, 'rhema-msb.js'), 'utf8'), ctx3);
  const vsSrc = fs.readFileSync(path.join(root, 'verse-structure.js'), 'utf8');
  const keyedSrc = vsSrc.replace("const ESV_API_KEY = '';", "const ESV_API_KEY = 'TESTKEY';");
  if (keyedSrc === vsSrc) { fail++; console.log('✗ could not inject test ESV key (marker changed?)'); }
  vm.runInContext(keyedSrc, ctx3);

  ok(vm.runInContext('VS_TRANSLATIONS.includes("ESV")', ctx3) === true, 'ESV registered once a key is set');
  ok(vm.runInContext('VS_VERSION_INFO.ESV.stream === true', ctx3), 'ESV flagged as streaming');

  // Multi-chapter parser: [c:1] markers at chapter starts
  const multi = vm.runInContext('_esvParseChapters(' +
    JSON.stringify('[1:1] Alpha one. [2] Alpha two. [2:1] Beta one. [2] Beta two. (ESV)') + ', "1")', ctx3);
  ok(multi && multi['1'] && multi['2'] && multi['1']['2'] === 'Alpha two. (ESV)' && multi['2']['1'] === 'Beta one.',
    'range passage splits on [c:1] chapter markers');
  ok(/\(ESV\)\s*$/.test(multi['1']['2']) && /\(ESV\)\s*$/.test(multi['2']['2']),
    'every chapter in a range keeps the (ESV) copyright notice');
  // Fallback: a plain marker that resets means the next chapter
  const reset = vm.runInContext('_esvParseChapters(' +
    JSON.stringify('[1] A. [2] B. [1] C. (ESV)') + ', "5")', ctx3);
  ok(reset && reset['5'] && reset['5']['2'] === 'B. (ESV)' && reset['6'] && reset['6']['1'] === 'C. (ESV)',
    'verse-number reset without a chapter marker rolls to the next chapter');

  // Stub Crossway: serve exactly what q asks for (ranges and ;-joined chapters)
  // from the local verse counts, with [c:1] markers at chapter starts.
  const msb3 = ctx3.window.RhemaMSB;
  const esvToApp = {};
  const esvNames = vm.runInContext('ESV_BOOK_NAMES', ctx3);
  for (const [app, esv] of Object.entries(esvNames)) esvToApp[esv] = app;
  const chapterText = (app, c, withChapterMarker, lead) => {
    const count = Object.keys(msb3[app]?.[String(c)] || {}).length;
    let s = lead || '';
    for (let v = 1; v <= count; v++) {
      s += (v === 1 && withChapterMarker ? `[${c}:1]` : `[${v}]`) + ` ${app} ${c}:${v} text. `;
    }
    return s;
  };
  let esvCalls = 0; const esvUrls = [];
  let dbPuts = 0;
  ctx3.fetch = async (url, opts) => {
    esvCalls++; esvUrls.push(String(url));
    ctx3.__esvAuth = opts?.headers?.Authorization || '';
    const q = decodeURIComponent(String(url).match(/\?q=([^&]+)/)[1]);
    let passages;
    if (q.includes(';')) {
      passages = q.split(';').map(one => {
        const pm = one.match(/^(.+) (\d+)$/);
        const app = esvToApp[pm[1]];
        return chapterText(app, Number(pm[2]), false, 'Superscription of ' + one + '. ') + '(ESV)';
      });
    } else {
      const pm = q.match(/^(.+?) (\d+)(?:-(\d+))?$/);
      const app = esvToApp[pm[1]], s = Number(pm[2]), e = Number(pm[3] || pm[2]);
      let text = '';
      for (let c = s; c <= e; c++) text += chapterText(app, c, true);
      passages = [text + '(ESV)'];
    }
    return { ok: true, status: 200, json: async () => ({ passages }) };
  };
  vm.runInContext('_vsDbPut = function () { __dbPuts(); return Promise.resolve(false); }', ctx3);
  ctx3.__dbPuts = () => { dbPuts++; };

  // One query pulls the maximum block Crossway allows (500 / half-book rule)
  const johBudget = vm.runInContext('_esvQueryBudget("JOH")', ctx3);
  const johTotal = Object.keys(msb3.JOH).reduce((n, c) => n + Object.keys(msb3.JOH[c]).length, 0);
  ok(johBudget === Math.min(500, Math.floor(johTotal / 2)), `John budget follows the half-book rule (${johBudget})`);
  const winJoh = vm.runInContext('_vsBlockWindow("ESV", "JOH", "11", _esvQueryBudget("JOH"))', ctx3);
  const esvGot = await vm.runInContext('_vsEnsureChapter("ESV", "JOH", "11")', ctx3);
  ok(esvGot && esvGot['1'] === 'JOH 11:1 text.', 'ESV target chapter streams through _vsEnsureChapter');
  ok(esvCalls === 1 && new RegExp(`q=John%20${winJoh.start}-${winJoh.end}`).test(esvUrls[0]),
    `one range query for the whole window (${decodeURIComponent(esvUrls[0].match(/\?q=([^&]+)/)[1])})`);
  ok(ctx3.__esvAuth === 'Token TESTKEY', 'Authorization: Token header sent');
  ok(/include-short-copyright=true/.test(esvUrls[0]), 'copyright display param always on');
  let windowVerses = 0;
  for (let c = winJoh.start; c <= winJoh.end; c++) windowVerses += Object.keys(msb3.JOH[String(c)] || {}).length;
  ok(windowVerses <= johBudget && winJoh.start <= 9 && winJoh.end > 11,
    `window has back-context and forward fill within budget (${winJoh.start}-${winJoh.end}, ${windowVerses} verses)`);
  // Every chapter in the window is now free — no second query
  for (let c = winJoh.start; c <= winJoh.end; c++) {
    await vm.runInContext(`_vsEnsureChapter("ESV", "JOH", "${c}")`, ctx3);
  }
  ok(esvCalls === 1, 'reading through the fetched window costs zero extra queries');
  const firstChap = vm.runInContext(`_vsChapterFromMemory("ESV","JOH","${winJoh.start}")`, ctx3);
  ok(firstChap && Object.values(firstChap).some(t => /\(ESV\)\s*$/.test(t)),
    'each cached chapter carries the copyright notice (not just the block tail)');
  ok(dbPuts === 0, 'ESV never writes to IndexedDB');
  ok(!Object.keys(ctx3.localStorage._s).some(k => k.includes('ESV')), 'ESV never persists text to localStorage');

  // Concurrent neighbors ride one query (in-flight covers the whole window)
  const before = esvCalls;
  const [mat5, mat6] = await Promise.all([
    vm.runInContext('_vsEnsureChapter("ESV", "MAT", "5")', ctx3),
    vm.runInContext('_vsEnsureChapter("ESV", "MAT", "6")', ctx3),
  ]);
  ok(mat5?.['1'] && mat6?.['1'] && esvCalls === before + 1,
    `simultaneous neighbor requests share one query (${esvCalls - before} fired)`);

  // Small books: the half-book rule caps the window (never over-asks Crossway)
  const titBudget = vm.runInContext('_esvQueryBudget("TIT")', ctx3);
  const titTotal = Object.keys(msb3.TIT).reduce((n, c) => n + Object.keys(msb3.TIT[c]).length, 0);
  ok(titBudget === Math.floor(titTotal / 2), `Titus budget is half the book (${titBudget} of ${titTotal})`);
  const winTit = vm.runInContext('_vsBlockWindow("ESV", "TIT", "2", _esvQueryBudget("TIT"))', ctx3);
  let titWinVerses = 0;
  for (let c = winTit.start; c <= winTit.end; c++) titWinVerses += Object.keys(msb3.TIT[String(c)] || {}).length;
  ok(titWinVerses <= titBudget, `Titus window respects the half-book cap (${titWinVerses} <= ${titBudget})`);
  // Single/double-chapter books are exempt from the half-book rule
  ok(vm.runInContext('_esvQueryBudget("PHM")', ctx3) === Object.keys(msb3.PHM['1']).length,
    'Philemon (single-chapter) exempt from the half-book rule');

  // Psalms: one ;-joined query, superscriptions stay with their own psalm
  const winPsa = vm.runInContext('_vsBlockWindow("ESV", "PSA", "3", _esvQueryBudget("PSA"))', ctx3);
  const psaBefore = esvCalls;
  const psa3 = await vm.runInContext('_vsEnsureChapter("ESV", "PSA", "3")', ctx3);
  ok(esvCalls === psaBefore + 1 && /%3B/.test(esvUrls[esvUrls.length - 1]), 'Psalms fetch is one semicolon-joined query');
  ok(psa3 && /^Superscription of Psalm 3\./.test(psa3['1']), 'psalm superscription lands on its own psalm verse 1');
  const psaNeighbor = vm.runInContext(`_vsChapterFromMemory("ESV","PSA","${Math.min(winPsa.end, 4)}")`, ctx3);
  ok(psaNeighbor && /^Superscription of Psalm/.test(psaNeighbor['1']), 'neighboring psalm keeps its own superscription');
  let psaWinVerses = 0;
  for (let c = winPsa.start; c <= winPsa.end; c++) psaWinVerses += Object.keys(msb3.PSA[String(c)] || {}).length;
  ok(psaWinVerses <= 500, `Psalms window within the 500-verse cap (${psaWinVerses})`);

  // No bulk download for streaming versions
  ok(await vm.runInContext('_vsDownloadWholeVersion("ESV", null)', ctx3) === false, 'whole-version download refuses ESV');

  // 429 sets the ESV daily flag without touching the api.bible monthly flag
  ctx3.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await vm.runInContext('_esvFetchChapter("JOH", "3")', ctx3);
  ok(vm.runInContext('_vsTransLimited("ESV")', ctx3) === true, 'ESV daily limit set on 429');
  ok(vm.runInContext('_vsIsApiLimited()', ctx3) === false, 'api.bible monthly flag untouched by ESV limit');
  ok(vm.runInContext('_vsTransLimited("NIV")', ctx3) === false, 'other versions unaffected by ESV limit');
  ok(vm.runInContext('_vsLimitLabel("ESV")', ctx3) === 'daily' && vm.runInContext('_vsLimitLabel("NIV")', ctx3) === 'monthly', 'limit labels per source');

  // Every canon book has an ESV passage name
  const missing = vm.runInContext('Object.keys(window.RhemaMSB).filter(b => !ESV_BOOK_NAMES[b])', ctx3);
  ok(missing.length === 0, `ESV book-name map covers the canon (missing: ${missing.join(',') || 'none'})`);

  console.log(`${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
