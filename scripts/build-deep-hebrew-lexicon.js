#!/usr/bin/env node
// scripts/build-deep-hebrew-lexicon.js — Stage 1 of the Rhēma Hebrew deep lexicon.
//
// Builds corpus evidence for every Hebrew/Aramaic Strong's number from data
// already in this repo — no network, no AI:
//
//   1. Walks the full OSHB Hebrew text (rhema-ot-hebrew.js, 39 books) and
//      counts every occurrence of every lemma, building book distribution,
//      verse references, and grammatical role distribution.
//   2. Builds LXX reverse links by scanning the Greek deep-lexicon shards for
//      entries whose lxx.hebrew arrays reference each Hebrew lemma — showing
//      which Greek words the Septuagint uses for each Hebrew word.
//   3. Assigns a confidence tier based on occurrence count.
//   4. Writes shards to data/deep-hebrew-lexicon/ (100 entries per shard).
//
// Output:
//   data/deep-hebrew-lexicon/index.json           manifest + build metadata
//   data/deep-hebrew-lexicon/shard-NNNN.json      100 Strong's entries each
//
// Run: node scripts/build-deep-hebrew-lexicon.js

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT     = path.join(__dirname, '..');
const OUT_DIR  = path.join(ROOT, 'data', 'deep-hebrew-lexicon');
const DEEP_DIR = path.join(ROOT, 'data', 'deep-lexicon');

const OT_BOOKS = [
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA',
  '1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO',
  'ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO',
  'OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL',
];

const POS_NAMES = {
  V: 'verb', N: 'noun', A: 'adjective', P: 'personal pronoun',
  D: 'demonstrative pronoun', R: 'relative pronoun', T: 'definite article',
  C: 'conjunction', M: 'particle', S: 'suffix', I: 'interjection',
};

const VERB_STEM_NAMES = {
  q: 'Qal',  N: 'Niphal', p: 'Piel',   P: 'Pual',  h: 'Hiphil',
  H: 'Hophal', t: 'Hithpael', o: 'Polel', r: 'Hithpolel', m: 'Poel',
  D: 'Nithpael',
};

// ── Load sources ──────────────────────────────────────────────────────────────

function loadWindowGlobals(...files) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox.window;
}

// ── Morphology helpers ────────────────────────────────────────────────────────

function extractPos(morph) {
  // e.g. "HVqp3ms" → 'V'; "HR/Ncfsa" → 'N' (take part after last slash, skip H/A prefix)
  const main = String(morph || '').split('/').pop();
  return main[1] || '';
}

function extractVerbStem(morph) {
  const main = String(morph || '').split('/').pop();
  return main[1] === 'V' ? (main[2] || null) : null;
}

// ── Occurrence index ──────────────────────────────────────────────────────────

function buildOccurrenceIndex(ot) {
  const index = new Map(); // strongs → { count, byBook, refs, pos, verbStems }
  const text = ot.text || {};
  let total = 0;

  for (const book of OT_BOOKS) {
    const bookData = text[book] || {};
    for (const chap of Object.keys(bookData)) {
      const chapData = bookData[chap] || {};
      for (const verse of Object.keys(chapData)) {
        const ref   = `${book} ${chap}:${verse}`;
        const words = chapData[verse] || [];
        for (const word of words) {
          const strongs = Number(word[1]);
          if (!strongs) continue;
          const morph  = String(word[2] || '');

          if (!index.has(strongs)) {
            index.set(strongs, { count: 0, byBook: {}, refs: [], pos: {}, verbStems: {} });
          }
          const e = index.get(strongs);
          e.count++;
          e.byBook[book] = (e.byBook[book] || 0) + 1;
          if (e.refs.length < 10) e.refs.push(ref);

          const pos  = extractPos(morph);
          if (pos) e.pos[pos] = (e.pos[pos] || 0) + 1;
          const stem = extractVerbStem(morph);
          if (stem) e.verbStems[stem] = (e.verbStems[stem] || 0) + 1;

          total++;
        }
      }
    }
  }

  console.log(`  Scanned ${total.toLocaleString()} word-tokens across ${OT_BOOKS.length} books.`);
  return index;
}

// ── LXX reverse index ─────────────────────────────────────────────────────────

function buildLxxReverseIndex() {
  const reverse = new Map(); // hebrew strongs → [{ g, lemma, count }]
  const shardFiles = fs.readdirSync(DEEP_DIR).filter(f => /^shard-\d+\.json$/.test(f));

  for (const file of shardFiles) {
    const shard = JSON.parse(fs.readFileSync(path.join(DEEP_DIR, file), 'utf8'));
    for (const [gStr, entry] of Object.entries(shard)) {
      const g      = Number(gStr);
      const hebrew = entry.lxx?.hebrew || [];
      for (const hEntry of hebrew) {
        const h = Number(hEntry.h);
        if (!h) continue;
        if (!reverse.has(h)) reverse.set(h, []);
        reverse.get(h).push({ g, lemma: entry.lemma || '', count: hEntry.count || 0 });
      }
    }
  }

  for (const arr of reverse.values()) arr.sort((a, b) => b.count - a.count);
  return reverse;
}

// ── Confidence + rationale ────────────────────────────────────────────────────

function computeConfidence(count) {
  if (count >= 500) return 'high';
  if (count >= 100) return 'good';
  if (count >= 20)  return 'moderate';
  if (count >= 2)   return 'low';
  return 'none';
}

function buildWhyArray(s, lemma, stats) {
  const lines = [];
  const bookCount = Object.keys(stats.byBook).length;
  lines.push(
    `${lemma || 'H' + s} appears ${stats.count} time${stats.count !== 1 ? 's' : ''} in the ` +
    `Hebrew Old Testament across ${bookCount} book${bookCount !== 1 ? 's' : ''}.`
  );

  const topPos = Object.entries(stats.pos).sort(([, a], [, b]) => b - a).slice(0, 2);
  if (topPos.length) {
    lines.push(`Primarily functions as: ${topPos.map(([p, c]) => `${POS_NAMES[p] || p} (${c}×)`).join(', ')}.`);
  }

  const topStems = Object.entries(stats.verbStems).sort(([, a], [, b]) => b - a).slice(0, 3);
  if (topStems.length) {
    lines.push(`Verb stems attested: ${topStems.map(([st, c]) => `${VERB_STEM_NAMES[st] || st} (${c}×)`).join(', ')}.`);
  }

  if (stats.count === 1) {
    lines.push('Hapax legomenon — occurs only once; range of meaning inferred from context and ancient versions.');
  } else if (stats.count < 5) {
    lines.push('Rare word — sparse attestation limits confidence in a complete semantic range.');
  }

  return lines;
}

// ── Write shards ──────────────────────────────────────────────────────────────

function writeShards(lexicon, occIndex, lxxIndex) {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allStrongs = Object.keys(lexicon).map(Number).sort((a, b) => a - b);
  const SHARD_SIZE = 100;
  const shardMeta  = [];

  for (let i = 0; i < allStrongs.length; i += SHARD_SIZE) {
    const batch = allStrongs.slice(i, i + SHARD_SIZE);
    const shardFile = `shard-${String(batch[0]).padStart(4, '0')}.json`;
    const data = {};

    for (const s of batch) {
      const lex   = lexicon[s] || {};
      const stats = occIndex.get(s) || { count: 0, byBook: {}, refs: [], pos: {}, verbStems: {} };
      const lxx   = (lxxIndex.get(s) || []).slice(0, 6);

      data[s] = {
        s,
        lemma:      lex.lemma     || '',
        translit:   lex.translit  || '',
        pronounce:  lex.pronounce || '',
        count:      stats.count,
        refs:       stats.refs,
        byBook:     stats.byBook,
        morph:      Object.keys(stats.pos).length      ? stats.pos       : null,
        verbStems:  Object.keys(stats.verbStems).length ? stats.verbStems : null,
        lxxGreek:   lxx.length ? lxx : null,
        confidence: computeConfidence(stats.count),
        why:        buildWhyArray(s, lex.lemma, stats),
        prose:      null,
      };
    }

    fs.writeFileSync(path.join(OUT_DIR, shardFile), JSON.stringify(data));
    shardMeta.push({ file: shardFile, from: batch[0], to: batch[batch.length - 1] });
  }

  const index = {
    shards:       shardMeta,
    buildAt:      new Date().toISOString(),
    totalEntries: allStrongs.length,
    source:       'OSHB/MorphHB (CC BY 4.0) + LXX reverse links from Rhema Greek deep lexicon',
  };
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));

  console.log(`  Wrote ${shardMeta.length} shards (${allStrongs.length} entries) → ${OUT_DIR}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('Loading Hebrew lexicon and OT text…');
  const globals = loadWindowGlobals('rhema-hebrew-lexicon.js', 'rhema-ot-hebrew.js');
  const lexicon = globals.RhemaHebrewLexicon || {};
  const ot      = globals.RhemaHebrewOT      || {};
  console.log(`  Lexicon: ${Object.keys(lexicon).length} entries`);

  console.log('Building occurrence index from OT text…');
  const occIndex = buildOccurrenceIndex(ot);

  console.log('Building LXX reverse links from Greek deep lexicon…');
  const lxxIndex = buildLxxReverseIndex();
  console.log(`  LXX links found for ${lxxIndex.size} Hebrew lemmas.`);

  console.log('Writing shards…');
  writeShards(lexicon, occIndex, lxxIndex);

  const conf = {};
  for (const stats of occIndex.values()) {
    const c = computeConfidence(stats.count);
    conf[c] = (conf[c] || 0) + 1;
  }
  console.log('Confidence breakdown (attested lemmas):', conf);
  console.log('Done.');
}

main();
