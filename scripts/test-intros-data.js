#!/usr/bin/env node
// Validates bible-intros.js: all 66 books present with every required field,
// key verses exist in the MSB text, outline chapter ranges fit the real
// chapter counts, and debate entries are well-formed.
// Run: node scripts/test-intros-data.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'rhema-msb.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'bible-intros.js'), 'utf8'), ctx);
const msb = ctx.window.RhemaMSB;
const books = ctx.window.BibleIntros.books;

const ORDER = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL',
  'MAT','MAR','LUK','JOH','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAM','1PE','2PE','1JO','2JO','3JO','JUD','REV'];

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) pass++; else { fail++; console.log('✗ ' + label); } };

ok(Object.keys(books).length === 66, `66 books (got ${Object.keys(books).length})`);
ok(ORDER.every(c => books[c]), 'every canonical book code present');
ok(Object.keys(books).every(c => ORDER.includes(c)), 'no unknown book codes');
ok(Object.keys(books).every(c => msb[c]), 'every code exists in MSB data');

for (const [code, e] of Object.entries(books)) {
  for (const f of ['genre', 'author', 'date', 'setting', 'purpose', 'theme', 'key', 'outline']) {
    ok(!!e[f], `${code}.${f} present`);
  }
  // key verse: "CODE C:V" and exists in the MSB text
  const m = String(e.key).match(/^(\S+) (\d+):(\d+)$/);
  ok(!!m, `${code}.key parses (${e.key})`);
  if (m) {
    ok(m[1] === code, `${code}.key points at its own book`);
    ok(!!(((msb[m[1]] || {})[m[2]] || {})[m[3]]), `${code}.key verse exists in MSB (${e.key})`);
  }
  // outline ranges fit real chapter counts and ascend
  const maxCh = Math.max(...Object.keys(msb[code]).map(Number));
  let prevStart = 0;
  for (const [range, title] of e.outline) {
    const nums = String(range).match(/\d+/g)?.map(Number) || [];
    ok(nums.length >= 1 && nums.every(n => n >= 1 && n <= maxCh),
      `${code} outline range "${range}" within 1–${maxCh}`);
    ok(typeof title === 'string' && title.length > 4, `${code} outline "${range}" has a title`);
    if (nums[0] < prevStart) { fail++; console.log(`✗ ${code} outline out of order at "${range}"`); } else pass++;
    prevStart = nums[0];
  }
  // substantial prose
  ok(e.theme.length > 120, `${code}.theme is substantial`);
  ok(e.setting.length > 40 && e.purpose.length > 40, `${code} setting/purpose substantial`);
  // debates well-formed
  for (const d of e.debates || []) {
    ok(!!(d.q && d.s && d.more && d.more.length > 200), `${code} debate "${(d.q || '').slice(0, 30)}…" complete`);
  }
}

// The books Free Grace interpreters read distinctively must carry that discussion.
for (const code of ['JOH', 'JAM', 'HEB', '1JO']) {
  const e = books[code];
  const all = JSON.stringify(e);
  ok(/Free Grace/i.test(all), `${code} includes the Free Grace perspective`);
}

console.log(`${pass} checks pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
