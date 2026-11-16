#!/usr/bin/env node
// Export the app's Old Testament verse numbering (Septuagint and Hebrew →
// English) for scripts/build-crossrefs-v2.js. It runs the app's own
// versification (rhemaBuildVersification) in a headless browser, so the
// build uses exactly the mapping the reader shows.
//
//   python3 -m http.server 8765 &      # from the repo root
//   node scripts/export-ot-versemap.js http://localhost:8765/ versemap.json
const { chromium } = require('playwright');
const fs = require('fs');
const [URL = 'http://localhost:8765/', OUT = 'versemap.json'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof _rhemaLoadDataFile === 'function', null, { timeout: 60000 });
  await page.evaluate(async () => { await Promise.all(['rhema-msb.js', 'rhema-lxx.js', 'rhema-ot-hebrew.js'].map(_rhemaLoadDataFile)); });
  const out = await page.evaluate(() => {
    const res = {};
    for (const book of RHEMA_OT_BOOK_ORDER) {
      res[book] = {};
      for (const layer of ['lxx', 'hebrew']) {
        const m = _rhemaVersificationFor(book, layer);
        res[book][layer] = m ? Object.fromEntries([...m.o2e.entries()].map(([k, v]) => [k, Array.isArray(v) ? v.join(':') : String(v)])) : null;
      }
    }
    return res;
  });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, Object.keys(out).length, 'books');
  await b.close();
})();
