#!/usr/bin/env node
/* Bible Journeys data tool.

   node scripts/journeys-tool.js dump <id|book|all> [more…]
       Compact view of journeys for review: places (with Atlas match and
       distance), then each story step with the place it happens at.

   node scripts/journeys-tool.js apply scripts/journey-fixes/<file>.json
       Apply corrections and rewrite BIBLE_JOURNEYS in app.js. A fix is keyed
       by journey id and may set:
         points:   full replacement list of places
         steps:    full replacement list of story steps
         at:       [place index for each step]          (story order)
         by:       { "<step index>": "sea" }            (reached by ship)
         set:      { field: value } for top-level fields (subtitle, note…)
       Every step must end up with an "at"; checked on apply.

   node scripts/journeys-tool.js check
       Fail if any journey has a step without a valid "at".
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app.js');

function load() {
  const s = fs.readFileSync(APP, 'utf8');
  const a = s.indexOf('const BIBLE_JOURNEYS = [');
  if (a < 0) throw new Error('BIBLE_JOURNEYS not found');
  const i = s.indexOf('[', a);
  let d = 0, j = i, q = null;
  for (; j < s.length; j++) {
    const ch = s[j];
    if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '[') d++;
    else if (ch === ']') { d--; if (!d) break; }
  }
  const list = vm.runInNewContext('(' + s.slice(i, j + 1) + ')');
  return { s, start: i, end: j + 1, list };
}

function atlas() {
  const c = { window: {} };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'bible-atlas.js'), 'utf8'), c);
  const by = new Map();
  const norm = (x) => String(x || '').toLowerCase().replace(/[’']/g, '').replace(/^the\s+/, '').trim();
  c.window.BIBLE_ATLAS.forEach(p => [p.name, ...(p.alts || [])].forEach(n => { if (!by.has(norm(n))) by.set(norm(n), p); }));
  return (name) => by.get(norm(name));
}
const km = (a, b) => {
  const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ── serializer: readable JS, same shape as the hand-written list ──────────────
const str = (v) => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
const key = (k) => /^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k);
function inline(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(inline).join(', ') + ']';
  if (typeof v === 'object') return '{ ' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${key(k)}: ${inline(x)}`).join(', ') + ' }';
  if (typeof v === 'string') return str(v);
  return String(v);
}
function block(v, ind) {
  const pad = '  '.repeat(ind);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every(x => typeof x !== 'object' || x === null)) {
      const one = inline(v);
      if (one.length < 100) return one;
      return '[\n' + v.map(x => pad + '  ' + inline(x)).join(',\n') + '\n' + pad + ']';
    }
    return '[\n' + v.map(x => pad + '  ' + inline(x)).join(',\n') + '\n' + pad + ']';
  }
  if (v && typeof v === 'object') {
    return '{\n' + Object.entries(v).filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${pad}  ${key(k)}: ${block(x, ind + 1)}`).join(',\n') + '\n' + pad + '}';
  }
  return inline(v);
}
function serialize(list) {
  return '[\n' + list.map(j => '  ' + block(j, 1)).join(',\n') + '\n]';
}
function save(doc, list) {
  const out = doc.s.slice(0, doc.start) + serialize(list) + doc.s.slice(doc.end);
  // Round-trip guard: what we wrote must read back identically.
  const again = vm.runInNewContext('(' + serialize(list) + ')');
  if (JSON.stringify(again) !== JSON.stringify(list)) throw new Error('round-trip mismatch');
  fs.writeFileSync(APP, out);
}

// The offline diagram draws each place at x/y (0–100). A new place gets x/y
// from a straight-line fit of the journey's other places (lon→x, lat→y), or
// from the bounding box when there's nothing to fit.
function fillSchematic(j) {
  const pts = j.points || [];
  const known = pts.filter(p => typeof p.x === 'number' && typeof p.y === 'number' && typeof p.lat === 'number');
  const fit = (xs, ys) => {
    const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
    const m = sxx ? sxy / sxx : 0;
    return v => my + m * (v - mx);
  };
  let fx, fy;
  if (known.length >= 2 && new Set(known.map(p => p.lon)).size > 1 && new Set(known.map(p => p.lat)).size > 1) {
    fx = fit(known.map(p => p.lon), known.map(p => p.x));
    fy = fit(known.map(p => p.lat), known.map(p => p.y));
  } else {
    const lons = pts.map(p => p.lon), lats = pts.map(p => p.lat);
    const [a, b, c, d] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
    fx = v => 15 + 70 * ((v - a) / ((b - a) || 1));
    fy = v => 85 - 70 * ((v - c) / ((d - c) || 1));
  }
  pts.forEach(p => {
    if (typeof p.x === 'number' && typeof p.y === 'number') return;
    if (typeof p.lat !== 'number') return;
    p.x = Math.round(Math.max(5, Math.min(95, fx(p.lon))));
    p.y = Math.round(Math.max(5, Math.min(95, fy(p.lat))));
  });
  // keep key order tidy: ancient, modern, x, y, lat, lon, rest
  j.points = pts.map(({ ancient, modern, x, y, lat, lon, ...rest }) => Object.assign({ ancient, modern, x, y, lat, lon }, rest));
}

function problems(j) {
  const out = [];
  (j.steps || []).forEach((st, i) => {
    if (!Number.isInteger(st.at) || st.at < 0 || st.at >= (j.points || []).length) out.push(`step ${i} has no valid at`);
    if (st.by && st.by !== 'sea') out.push(`step ${i} by must be 'sea'`);
  });
  (j.points || []).forEach((p, i) => { if (typeof p.lat !== 'number' || typeof p.lon !== 'number') out.push(`place ${i} has no coordinates`); });
  return out;
}

const [, , cmd, ...args] = process.argv;
if (cmd === 'dump') {
  const { list } = load();
  const find = atlas();
  const want = args.length ? args : ['all'];
  list.filter(j => want.includes('all') || want.includes(j.id) || want.includes(((j.refs || [])[0] || {}).book)).forEach(j => {
    console.log(`\n## ${j.id} — ${j.title}  (${(j.refs || []).map(r => `${r.book} ${r.chFrom}-${r.chTo}`).join('; ')})`);
    (j.points || []).forEach((p, i) => {
      const a = find(p.ancient);
      const d = a && typeof p.lat === 'number' ? Math.round(km(p, a)) : null;
      console.log(`  [${i}] ${p.ancient} = ${p.modern} (${p.lat}, ${p.lon})${a ? `  atlas ${d}km ${a.conf || ''}` : '  atlas —'}`);
    });
    (j.steps || []).forEach((st, i) => console.log(`  ${i}. @${st.at ?? '?'}${st.by ? ' ⛵' : ''} ${st.label} | ${st.ref} | ${st.miles ?? ''} | ${st.copy}`));
  });
} else if (cmd === 'apply') {
  const doc = load();
  const fixes = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  let n = 0;
  for (const [id, f] of Object.entries(fixes)) {
    if (id.startsWith('_')) continue;
    const j = doc.list.find(x => x.id === id);
    if (!j) throw new Error('unknown journey ' + id);
    if (f.set) Object.assign(j, f.set);
    if (f.points) j.points = f.points;
    if (f.steps) j.steps = f.steps;
    if (f.at) {
      if (f.at.length !== j.steps.length) throw new Error(`${id}: ${f.at.length} at values for ${j.steps.length} steps`);
      f.at.forEach((a, i) => { j.steps[i].at = a; });
    }
    if (f.by) Object.entries(f.by).forEach(([i, v]) => { j.steps[Number(i)].by = v; });
    fillSchematic(j);
    // keep keys tidy: at/by right after label
    j.steps = j.steps.map(st => { const { label, ref, copy, miles, at, by, ...rest } = st; return Object.assign({ label, ref, copy }, miles != null ? { miles } : {}, { at }, by ? { by } : {}, rest); });
    const p = problems(j);
    if (p.length) throw new Error(`${id}: ${p.join('; ')}`);
    n++;
  }
  save(doc, doc.list);
  console.log(`applied ${n} journey fixes`);
} else if (cmd === 'check') {
  const { list } = load();
  const bad = list.map(j => [j.id, problems(j)]).filter(([, p]) => p.length);
  bad.forEach(([id, p]) => console.log(id, p.join('; ')));
  console.log(`${list.length - bad.length}/${list.length} journeys complete`);
  process.exitCode = bad.length ? 1 : 0;
} else {
  console.log('usage: journeys-tool.js dump <ids…> | apply <fixes.json> | check');
}
