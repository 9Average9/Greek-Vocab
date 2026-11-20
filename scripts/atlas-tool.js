#!/usr/bin/env node
/* Atlas gazetteer helper.

   node scripts/atlas-tool.js apply <fixes.json>
     fixes = {
       merge:  [["from name", "into name"], …]   // refs + aka move to "into"; "from" is removed
       rename: { "old": "new" },
       set:    { "name": { lat, lon, modern, conf, note, alts, aka, kind } }
     }
   Rewrites bible-atlas.js one entry per line, keeping the header and footer.
   `aka` lists other spellings found in Bible text (e.g. Peniel) so the verse
   pin matcher still finds the place after a merge.
*/
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'bible-atlas.js');

function load() {
  const src = fs.readFileSync(FILE, 'utf8');
  global.window = {};
  delete require.cache[require.resolve(FILE)];
  require(FILE);
  return { src, list: window.BIBLE_ATLAS.map(p => ({ ...p })) };
}

const KEY_ORDER = ['name', 'modern', 'lat', 'lon', 'kind', 'conf', 'note', 'refs', 'alts', 'aka'];
function q(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function ser(p) {
  const keys = [...KEY_ORDER.filter(k => p[k] !== undefined), ...Object.keys(p).filter(k => !KEY_ORDER.includes(k))];
  const parts = keys.map(k => {
    const v = p[k];
    if (Array.isArray(v)) return `${k}:[${v.map(q).join(',')}]`;
    if (typeof v === 'number') return `${k}:${v}`;
    return `${k}:${q(v)}`;
  });
  return `  { ${parts.join(', ')} }`;
}

function apply(fixFile) {
  const fx = JSON.parse(fs.readFileSync(fixFile, 'utf8'));
  const { src, list } = load();
  const byName = () => new Map(list.map(p => [p.name, p]));
  const problems = [];
  for (const [from, into] of fx.merge || []) {
    const m = byName();
    const a = m.get(from), b = m.get(into);
    if (!a || !b) { problems.push(`merge ${from} -> ${into}: missing`); continue; }
    b.refs = [...new Set([...(b.refs || []), ...(a.refs || [])])];
    const aka = new Set([...(b.aka || []), ...(a.aka || [])]);
    if (b.aka || a.aka) b.aka = [...aka];
    list.splice(list.indexOf(a), 1);
  }
  for (const [from, to] of Object.entries(fx.rename || {})) {
    const p = byName().get(from);
    if (!p) { problems.push(`rename ${from}: missing`); continue; }
    if (byName().has(to)) { problems.push(`rename ${from} -> ${to}: target exists`); continue; }
    p.name = to;
  }
  for (const [name, fields] of Object.entries(fx.set || {})) {
    const p = byName().get(name);
    if (!p) { problems.push(`set ${name}: missing`); continue; }
    Object.assign(p, fields);
  }
  for (const p of list) {
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') problems.push(`${p.name}: bad coords`);
    if (!['certain', 'likely', 'debated'].includes(p.conf)) problems.push(`${p.name}: bad conf ${p.conf}`);
    if (p.alts && !p.alts.length) delete p.alts;
  }
  const names = list.map(p => p.name);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) problems.push('duplicate names: ' + dup.join(', '));
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  const start = src.indexOf('window.BIBLE_ATLAS = [');
  const end = src.indexOf('\n];', start);
  const out = src.slice(0, start) + 'window.BIBLE_ATLAS = [\n' + list.map(ser).join(',\n') + src.slice(end);
  fs.writeFileSync(FILE, out);
  // Round-trip check.
  const again = load().list;
  if (again.map(ser).join('\n') !== list.map(ser).join('\n')) { console.error('round-trip mismatch'); process.exit(1); }
  console.log(`atlas: ${list.length} places`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'apply' && arg) apply(arg);
else console.log('usage: node scripts/atlas-tool.js apply <fixes.json>');
