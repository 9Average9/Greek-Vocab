#!/usr/bin/env node
// LIVE api.bible verification: fetches a real passage for every API version in
// VS_VERSIONS and runs it through the shipping parser, asserting that
// chapter-opening verses (the "2 Cor 1:1 missing" bug) and verse coverage come
// through. Needs network access to api.scripture.api.bible — skips cleanly if
// the host is unreachable. Run: node scripts/test-vs-live.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execFileSync } = require('child_process');

// curl honors HTTPS_PROXY (Node's fetch does not in all environments).
function curlJson(url, apiKey) {
  const out = execFileSync('curl', ['-sS', '-m', '45', '-w', '\n%{http_code}', '-H', `api-key: ${apiKey}`, url],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const nl = out.lastIndexOf('\n');
  const status = Number(out.slice(nl + 1));
  return { status, body: status >= 200 && status < 300 ? JSON.parse(out.slice(0, nl)) : null };
}
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

const VERSIONS = vm.runInContext('VS_VERSIONS', ctx).filter(v => v.id);
const API_KEY = vm.runInContext('VS_API_KEY', ctx);
const API_BASE = vm.runInContext('VS_API_BASE', ctx);
const msb = ctx.window.RhemaMSB;

// One representative passage per canon scope. 2CO.1 is the regression case:
// its opening salutation carries no inline verseIds in most versions.
const target = (v) => (v.scope === 'ot' ? { book: 'GEN', api: 'GEN', ch: '1' } : { book: '2CO', api: '2CO', ch: '1' });

(async () => {
  try {
    curlJson(`${API_BASE}/bibles`, API_KEY);
  } catch {
    console.log('api.scripture.api.bible unreachable — skipping live checks.');
    process.exit(0);
  }
  let pass = 0, fail = 0;
  for (const v of VERSIONS) {
    const { book, api, ch } = target(v);
    const expected = Object.keys((msb[book] || {})[ch] || {}).length;
    try {
      const url = `${API_BASE}/bibles/${v.id}/passages/${api}.${ch}` +
        `?content-type=json&include-notes=false&include-titles=false` +
        `&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false`;
      const r = curlJson(url, API_KEY);
      if (!r.body) { fail++; console.log(`✗ ${v.code}: HTTP ${r.status}`); continue; }
      const { data } = r.body;
      const parsed = vm.runInContext(
        `_vsParsePassageJson(${JSON.stringify(data.content)}, ${JSON.stringify(api)})`, ctx);
      const verses = parsed[ch] || {};
      const got = Object.keys(verses).length;
      const issues = [];
      if (!verses['1'] || verses['1'].length < 8) issues.push(`verse 1 missing/short: "${verses['1'] || ''}"`);
      // Tolerate small legitimate differences (omitted verses, groupings that
      // start mid-range), but a big shortfall means the parser dropped text.
      if (expected && got < expected - 3) issues.push(`only ${got}/${expected} verses`);
      if (/undefined|\[object/.test(Object.values(verses).join(' '))) issues.push('garbage in text');
      if (issues.length) { fail++; console.log(`✗ ${v.code} ${api}.${ch}: ${issues.join('; ')}`); }
      else { pass++; console.log(`✓ ${v.code} ${api}.${ch}: ${got}/${expected || '?'} verses, v1="${verses['1'].slice(0, 48)}..."`); }
    } catch (e) {
      fail++; console.log(`✗ ${v.code}: ${e.message}`);
    }
  }
  console.log(`\n${pass} pass, ${fail} fail (live)`);
  process.exit(fail ? 1 : 0);
})();
