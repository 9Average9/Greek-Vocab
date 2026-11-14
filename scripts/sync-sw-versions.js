#!/usr/bin/env node
// Keep the service worker's precache list asking for the same ?v= of each data
// file that the app requests (RHEMA_DATA_VERSIONS and the few per-file version
// constants). Run after bumping the app version, since a blanket version
// replace also catches data files whose version happened to equal it.
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'app.js'), 'utf8');
const swPath = path.join(R, 'service-worker.js');
let sw = fs.readFileSync(swPath, 'utf8');
const i = app.indexOf('const RHEMA_DATA_VERSIONS = {');
const want = {};
for (const m of app.slice(i, app.indexOf('};', i)).matchAll(/'([^']+\.js)':\s*'([^']+)'/g)) want[m[1]] = m[2];
for (const [file, cname] of [['rhema-bsb-align.js', 'RHEMA_BSB_ALIGN_VERSION'], ['rhema-english-dictionary.js', 'RHEMA_ENGLISH_DICT_VERSION']]) {
  const m = app.match(new RegExp(`const ${cname} = '([^']+)'`)); if (m) want[file] = m[1];
}
let n = 0;
sw = sw.replace(/"\.\/(rhema-[a-z0-9-]+\.js)\?v=([0-9.]+)"/g, (all, f, v) => {
  if (want[f] && want[f] !== v) { n++; return `"./${f}?v=${want[f]}"`; }
  return all;
});
fs.writeFileSync(swPath, sw);
console.log('service worker data versions synced:', n);
