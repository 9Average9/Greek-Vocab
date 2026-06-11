#!/usr/bin/env node
// scripts/build-deep-lexicon-classical.js — Step 1 of the "wider Greek" layer.
//
// Pulls two openly licensed corpora and distills them into a small sidecar
// (data/deep-lexicon/classical/classical.json) keyed by Strong's number:
//
//   lsj — a trimmed plain-text excerpt of the word's entry in Liddell-Scott-
//         Jones (the standard lexicon of ALL ancient Greek literature), from
//         the Perseus digitization (CC BY-SA; Unicode keys via gcelano).
//         This is the "classical range" — what the word meant across a
//         millennium of Greek, not just the NT.
//
//   af  — approximate occurrence count in the Apostolic Fathers (the
//         generation of Christian writers right after the NT; Lake text via
//         jtauber/apostolic-fathers, CC BY-SA). The AF corpus is not yet
//         lemmatized upstream, so tokens are matched by *surface form*
//         against the ~600K tagged form→lemma pairs of our NT+LXX corpora.
//         Coverage is partial and counts are approximate — they answer "did
//         the next generation keep using this word, roughly how much",
//         nothing finer. The meta block records match coverage honestly.
//
// Purely statistical: no doctrinal judgment is involved at any point.
//
// Run: node scripts/build-deep-lexicon-classical.js
// Then: node scripts/build-deep-lexicon.js   (auto-merges the sidecar)

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'deep-lexicon', 'classical');

const LSJ_BASE = 'https://raw.githubusercontent.com/gcelano/LSJ_GreekUnicode/master/';
const AF_BASE = 'https://raw.githubusercontent.com/jtauber/apostolic-fathers/master/';

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'deep-lexicon-build/1.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchText(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Greek normalization ──────────────────────────────────────────────────────

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ̓̔͂ͅ]/g, '').normalize('NFC');
}
function normForm(s) {
  return stripDiacritics(String(s).toLowerCase()).replace(/ς/g, 'σ').replace(/[^Ͱ-Ͽἀ-῿]/g, '');
}

// ── Load app corpora ─────────────────────────────────────────────────────────

function loadWindowGlobals(...files) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox.window;
}

async function main() {
  console.log('Building classical sidecar (LSJ + Apostolic Fathers)…\n');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Loading app corpora for lemma + form tables…');
  const w = loadWindowGlobals('rhema-lexicon.js', 'rhema-nt.js', 'rhema-lxx.js');
  const lexicon = w.RhemaLexicon || {};

  // Lemma → strongs (for LSJ headword matching). Both exact-with-accents and
  // accent-stripped keys; first writer wins so lower Strong's numbers (more
  // common assignments) take precedence on collisions.
  const lemmaExact = new Map();
  const lemmaLoose = new Map();
  for (const [s, e] of Object.entries(lexicon)) {
    if (!e.lemma) continue;
    const exact = e.lemma.normalize('NFC').toLowerCase();
    const loose = normForm(e.lemma);
    if (!lemmaExact.has(exact)) lemmaExact.set(exact, Number(s));
    if (loose && !lemmaLoose.has(loose)) lemmaLoose.set(loose, Number(s));
  }
  console.log(`  ${lemmaExact.size} lemmas to match`);

  // Surface form → strongs, from every tagged token in NT + LXX. Ambiguous
  // forms resolve to the strongs that uses the form most often.
  console.log('Building form→lemma table from tagged NT+LXX…');
  const formCounts = new Map(); // form → Map(strongs → count)
  for (const corpus of [w.RhemaNT?.text, w.RhemaLXX?.text]) {
    for (const chapters of Object.values(corpus || {})) {
      for (const verses of Object.values(chapters)) {
        for (const words of Object.values(verses)) {
          for (const [surface, strongs] of words) {
            const f = normForm(surface);
            if (!f) continue;
            if (!formCounts.has(f)) formCounts.set(f, new Map());
            const m = formCounts.get(f);
            m.set(strongs, (m.get(strongs) || 0) + 1);
          }
        }
      }
    }
  }
  const formToStrongs = new Map();
  for (const [f, m] of formCounts) {
    formToStrongs.set(f, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  console.log(`  ${formToStrongs.size} distinct forms`);

  // ── Apostolic Fathers ──────────────────────────────────────────────────────
  console.log('\nFetching Apostolic Fathers texts…');
  const readme = await fetchText(AF_BASE + 'README.md');
  const textFiles = [...new Set([...readme.matchAll(/texts\/(\d+[^)\s]+\.txt)/g)].map(m => m[1]))];
  console.log(`  ${textFiles.length} texts listed`);
  const afCounts = new Map();
  let afTokens = 0, afMatched = 0;
  for (const file of textFiles) {
    process.stdout.write(`  ${file}… `);
    try {
      const text = await fetchText(AF_BASE + 'texts/' + file);
      const tokens = text.split(/\s+/)
        .map(t => normForm(t))
        .filter(Boolean);
      afTokens += tokens.length;
      for (const t of tokens) {
        const s = formToStrongs.get(t);
        if (s) { afMatched++; afCounts.set(s, (afCounts.get(s) || 0) + 1); }
      }
      console.log(`✓ (${tokens.length} tokens)`);
    } catch (e) { console.log(`✗ ${e.message}`); }
  }
  const afCoverage = afTokens ? afMatched / afTokens : 0;
  console.log(`  AF: ${afTokens} tokens, ${Math.round(afCoverage * 100)}% matched by form (approximate counts)`);

  // ── LSJ ────────────────────────────────────────────────────────────────────
  console.log('\nFetching LSJ (27 parts, ~1GB total — extracts are kept, parts discarded)…');
  const lsj = new Map(); // strongs → trimmed text
  const entryRe = /<entryFree[^>]*key="([^"]+)"[^>]*>([\s\S]*?)<\/entryFree>/g;
  for (let part = 1; part <= 27; part++) {
    process.stdout.write(`  part ${part}/27… `);
    let xml;
    try {
      xml = await fetchText(`${LSJ_BASE}grc.lsj.perseus-eng${part}.xml`);
    } catch (e) { console.log(`✗ ${e.message}`); continue; }
    let matched = 0, m;
    entryRe.lastIndex = 0;
    while ((m = entryRe.exec(xml)) !== null) {
      const key = m[1].replace(/\d+$/, '').normalize('NFC').toLowerCase();
      let s = lemmaExact.get(key);
      if (s === undefined) s = lemmaLoose.get(normForm(key));
      if (s === undefined || lsj.has(s)) continue;
      const text = m[2]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length < 20) continue;
      lsj.set(s, text.length > 520 ? text.slice(0, 520) + '…' : text);
      matched++;
    }
    console.log(`✓ (${matched} matched)`);
  }
  console.log(`  LSJ entries matched to NT lemmas: ${lsj.size}`);

  // ── Write sidecar ──────────────────────────────────────────────────────────
  const entries = {};
  const allStrongs = new Set([...lsj.keys(), ...afCounts.keys()]);
  for (const s of allStrongs) {
    entries[s] = {};
    if (lsj.has(s)) entries[s].lsj = lsj.get(s);
    if (afCounts.has(s)) entries[s].af = afCounts.get(s);
  }
  const sidecar = {
    meta: {
      built: new Date().toISOString().slice(0, 10),
      lsj: { source: 'Perseus LSJ via gcelano/LSJ_GreekUnicode (CC BY-SA)', matched: lsj.size },
      af: {
        source: 'jtauber/apostolic-fathers (Lake text, CC BY-SA)',
        method: 'surface-form match against tagged NT+LXX forms — counts are approximate',
        tokens: afTokens, coverage: Math.round(afCoverage * 1000) / 1000,
        matchedWords: afCounts.size,
      },
    },
    entries,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'classical.json'), JSON.stringify(sidecar));
  console.log(`\nWrote classical.json (${Object.keys(entries).length} words, ${(JSON.stringify(sidecar).length / 1024 / 1024).toFixed(1)} MB)`);
  console.log('Run build-deep-lexicon.js to merge into the shards.');
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
