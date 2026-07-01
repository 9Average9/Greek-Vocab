#!/usr/bin/env node
// scripts/build-hebrew-bdb.js
//
// Downloads the Open Scriptures Brown-Driver-Briggs XML and builds
// a compact JS file (rhema-hebrew-bdb.js) keyed by Strong's number.
//
// Source: https://github.com/openscriptures/HebrewLexicon
// License: CC BY 4.0 (BDB text is public domain; OpenScriptures XML CC BY 4.0)
// Attribution required: "Open Scriptures Hebrew Bible Project"
//
// Run: node scripts/build-hebrew-bdb.js
// Output: rhema-hebrew-bdb.js

'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'rhema-hebrew-bdb.js');
const BDB_URL = 'https://raw.githubusercontent.com/openscriptures/HebrewLexicon/master/BrownDriverBriggs.xml';
const IDX_URL = 'https://raw.githubusercontent.com/openscriptures/HebrewLexicon/master/LexicalIndex.xml';

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'rhema-build/1.0' } }, res => {
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

function decodeXml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripTags(s) {
  return decodeXml(String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

// Extract def-highlighted text: replace <def>x</def> with **x** then strip rest.
function defText(s) {
  return decodeXml(String(s || '')
    .replace(/<def\b[^>]*>([\s\S]*?)<\/def>/g, (_, t) => stripTags(t))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

// Build strong# → [bdb_id, ...] mapping from LexicalIndex.xml
function parseIndex(xml) {
  const map = {}; // strong# (int) → bdb entry id
  const xrefRe = /<xref\b([^>]*)\/>/g;
  let m;
  while ((m = xrefRe.exec(xml))) {
    const attrs = m[1];
    const bdb = (attrs.match(/bdb="([^"]*)"/) || [])[1];
    const strongStr = (attrs.match(/strong="(\d+)"/) || [])[1];
    if (!bdb || !strongStr) continue;
    const num = parseInt(strongStr, 10);
    if (!num) continue;
    if (!map[num]) map[num] = [];
    if (!map[num].includes(bdb)) map[num].push(bdb);
  }
  return map;
}

// Parse BrownDriverBriggs.xml → id → { pos, def, senses }
function parseBDB(xml) {
  const entries = {};
  // Match each <entry ...>...</entry>
  const entryRe = /<entry\b([^>]*)>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml))) {
    const attrStr = m[1];
    const body = m[2];
    const id = (attrStr.match(/id="([^"]*)"/) || [])[1];
    if (!id) continue;

    // Skip pure root entries (type="root") that have no sense content
    const type = (attrStr.match(/type="([^"]*)"/) || [])[1];

    // Part of speech
    const posMatch = body.match(/<pos\b[^>]*>([\s\S]*?)<\/pos>/);
    const pos = posMatch ? stripTags(posMatch[1]) : '';

    // Top-level <def> (before first <sense>)
    const firstSensePt = body.indexOf('<sense');
    const beforeSenses = firstSensePt >= 0 ? body.slice(0, firstSensePt) : body;
    const topDefMatch = beforeSenses.match(/<def\b[^>]*>([\s\S]*?)<\/def>/);
    const topDef = topDefMatch ? stripTags(topDefMatch[1]) : '';

    // All <sense> elements
    const senses = [];
    const senseRe = /<sense\b([^>]*)>([\s\S]*?)<\/sense>/g;
    let sm;
    while ((sm = senseRe.exec(body))) {
      const senseBody = sm[2];
      // Skip nested senses (they'll be captured by the outer sense)
      const text = defText(senseBody);
      if (text && text.length > 2) senses.push(text);
    }

    if (!topDef && !senses.length && type !== 'root') continue;

    entries[id] = { pos, def: topDef, senses: senses.slice(0, 9) };
  }
  return entries;
}

// Build the final lexicon keyed by Strong's number
function buildLexicon(indexXml, bdbXml) {
  const strongToBdb = parseIndex(indexXml);
  const bdbEntries = parseBDB(bdbXml);

  const lex = {};
  for (const [numStr, bdbIds] of Object.entries(strongToBdb)) {
    const num = parseInt(numStr, 10);
    const parts = [];
    for (const id of bdbIds) {
      const e = bdbEntries[id];
      if (!e) continue;
      parts.push(e);
    }
    if (!parts.length) continue;

    // Sort: entry with more senses (the richer meaning) goes first
    parts.sort((a, b) => b.senses.length - a.senses.length);

    if (parts.length === 1) {
      const p = parts[0];
      if (!p.def && !p.senses.length) continue;
      lex[num] = { pos: p.pos, def: p.def, senses: p.senses };
    } else {
      // Keep entries separate as an array so the UI can show "I." / "II."
      const entries = parts
        .filter(p => p.def || p.senses.length)
        .map(p => ({ pos: p.pos, def: p.def, senses: p.senses }));
      if (!entries.length) continue;
      lex[num] = { entries };
    }
  }
  return lex;
}

async function main() {
  console.log('Fetching BrownDriverBriggs.xml...');
  const bdbXml = await fetchText(BDB_URL);
  console.log(`Fetched BDB: ${(bdbXml.length / 1024 / 1024).toFixed(2)} MB`);

  console.log('Fetching LexicalIndex.xml...');
  const idxXml = await fetchText(IDX_URL);
  console.log(`Fetched index: ${(idxXml.length / 1024).toFixed(0)} KB`);

  const lex = buildLexicon(idxXml, bdbXml);
  const count = Object.keys(lex).length;
  console.log(`Built ${count} BDB entries`);

  // Sample
  const sample = lex[1];
  console.log('H1 sample:', JSON.stringify(sample));
  const sample430 = lex[430];
  console.log('H430 sample:', JSON.stringify(sample430));

  const license = `/*
Brown-Driver-Briggs Hebrew Lexicon for Rhema.
Source: Open Scriptures Hebrew Bible Project (https://github.com/openscriptures/HebrewLexicon)
License: CC BY 4.0. BDB text is public domain (1906); XML markup © Open Scriptures CC BY 4.0.
Attribution: Open Scriptures Hebrew Bible Project
*/`;

  const js = `${license}\nwindow.RhemaHebrewBDB = ${JSON.stringify(lex)};\n`;
  fs.writeFileSync(OUT, js, 'utf8');
  console.log(`Wrote ${OUT} (${(js.length / 1024 / 1024).toFixed(2)} MB, ${count} entries)`);
}

main().catch(err => { console.error(err); process.exit(1); });
