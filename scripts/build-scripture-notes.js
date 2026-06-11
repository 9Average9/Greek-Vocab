const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const REPO_RELEASE_API = 'https://api.github.com/repos/BSB-publishing/bsb2usfm/releases/latest';
const WORK_DIR = path.join(os.tmpdir(), 'rhema-bsb-msb-notes-build');
const EXTRACT_DIR = path.join(WORK_DIR, 'extract');
const OUT_FILE = path.join(__dirname, '..', 'rhema-scripture-notes.js');

const SOURCE_TO_APP_BOOK = {
  JHN: 'JOH',
  JAS: 'JAM'
};

const BOOK_NAME_TO_CODE = {
  Genesis: 'GEN', Exodus: 'EXO', Leviticus: 'LEV', Numbers: 'NUM', Deuteronomy: 'DEU',
  Joshua: 'JOS', Judges: 'JDG', Ruth: 'RUT',
  '1 Samuel': '1SA', '2 Samuel': '2SA',
  '1 Kings': '1KI', '2 Kings': '2KI',
  '1 Chronicles': '1CH', '2 Chronicles': '2CH',
  Ezra: 'EZR', Nehemiah: 'NEH', Esther: 'EST', Job: 'JOB',
  Psalm: 'PSA', Psalms: 'PSA', Proverbs: 'PRO', Ecclesiastes: 'ECC',
  'Song of Solomon': 'SNG', Isaiah: 'ISA', Jeremiah: 'JER', Lamentations: 'LAM',
  Ezekiel: 'EZK', Daniel: 'DAN', Hosea: 'HOS', Joel: 'JOL', Amos: 'AMO',
  Obadiah: 'OBA', Jonah: 'JON', Micah: 'MIC', Nahum: 'NAM', Habakkuk: 'HAB',
  Zephaniah: 'ZEP', Haggai: 'HAG', Zechariah: 'ZEC', Malachi: 'MAL',
  Matthew: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JOH', Acts: 'ACT',
  Romans: 'ROM', '1 Corinthians': '1CO', '2 Corinthians': '2CO',
  Galatians: 'GAL', Ephesians: 'EPH', Philippians: 'PHP', Colossians: 'COL',
  '1 Thessalonians': '1TH', '2 Thessalonians': '2TH',
  '1 Timothy': '1TI', '2 Timothy': '2TI', Titus: 'TIT', Philemon: 'PHM',
  Hebrews: 'HEB', James: 'JAM', '1 Peter': '1PE', '2 Peter': '2PE',
  '1 John': '1JO', '2 John': '2JO', '3 John': '3JO', Jude: 'JUD', Revelation: 'REV'
};

const BOOK_PATTERN = Object.keys(BOOK_NAME_TO_CODE)
  .sort((a, b) => b.length - a.length)
  .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const CITATION_START_RE = new RegExp(`^(?:See\\s+)?(?:${BOOK_PATTERN})\\s+\\d+:\\d+`, 'i');
const REF_RE = new RegExp(`\\b(${BOOK_PATTERN})\\s+(\\d+):(\\d+)(?:[\\u2013-](\\d+))?`, 'gi');

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'RhemaScriptureNotesBuilder' } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Request failed ${res.statusCode}: ${url}`));
          return;
        }
        resolve(JSON.parse(body));
      });
    }).on('error', reject);
  });
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https.get(url, { headers: { 'User-Agent': 'RhemaScriptureNotesBuilder' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.rmSync(destination, { force: true });
        download(res.headers.location, destination).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        file.close();
        reject(new Error(`Download failed ${res.statusCode}: ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => {
      file.close();
      reject(err);
    });
  });
}

function unzip(zipFile, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}'`], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-q', '-o', zipFile, '-d', destination], { stdio: 'inherit' });
  }
}

function textOf(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object') return textOf(node.content || []);
  return '';
}

function refsFromText(text) {
  const refs = [];
  for (const match of text.matchAll(REF_RE)) {
    const book = BOOK_NAME_TO_CODE[match[1]];
    if (!book) continue;
    const ref = `${book} ${Number(match[2])}:${Number(match[3])}${match[4] ? '-' + Number(match[4]) : ''}`;
    if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

function classifyNote(body) {
  if (/^See\s+/i.test(body)) return 'scripture cross-reference';
  return 'scripture citation';
}

function addNote(output, version, key, body, refs) {
  for (const ref of refs) {
    const row = {
      ref,
      type: classifyNote(body),
      label: body,
      source: `${version} official footnote`
    };
    output[version][key] ||= [];
    const exists = output[version][key].some(item => item.ref === row.ref && item.label === row.label);
    if (!exists) output[version][key].push(row);
  }
}

function parseUsjDir(version, dir) {
  const output = { [version]: {} };
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.usj'))) {
    const sourceBook = file.replace(/\.usj$/, '');
    const appBook = SOURCE_TO_APP_BOOK[sourceBook] || sourceBook;
    const tree = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    function walk(node) {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      if (node.type === 'note') {
        const fullText = textOf(node).replace(/\s+/g, ' ').trim();
        const match = fullText.match(/^(\d+):(\d+)\s+(.+)$/);
        if (match) {
          const key = `${appBook} ${Number(match[1])}:${Number(match[2])}`;
          const body = match[3].trim();
          const refs = refsFromText(body);
          if (refs.length && CITATION_START_RE.test(body) && !body.includes('...')) {
            addNote(output, version, key, body, refs);
          }
        }
      }
      walk(node.content);
    }
    walk(tree.content);
  }
  return output[version];
}

async function main() {
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const release = await requestJson(REPO_RELEASE_API);
  const result = {
    meta: {
      source: 'BSB-publishing/bsb2usfm',
      release: release.tag_name,
      generatedAt: new Date().toISOString(),
      filter: 'Official USJ footnotes whose note body starts with a Scripture reference or "See" plus a Scripture reference.'
    },
    BSB: {},
    MSB: {}
  };
  for (const version of ['BSB', 'MSB']) {
    const assetName = `${version}_usj.zip`;
    const asset = release.assets.find(item => item.name === assetName);
    if (!asset) throw new Error(`Missing release asset ${assetName}`);
    const zipFile = path.join(WORK_DIR, assetName);
    await download(asset.browser_download_url, zipFile);
    const destination = path.join(EXTRACT_DIR, version);
    unzip(zipFile, destination);
    result[version] = parseUsjDir(version, destination);
  }
  const body = `// Generated by scripts/build-scripture-notes.js from BSB/MSB official USJ release data.\n// Do not edit by hand.\nwindow.RhemaScriptureNotes = ${JSON.stringify(result, null, 2)};\n`;
  fs.writeFileSync(OUT_FILE, body, 'utf8');
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`BSB note verses: ${Object.keys(result.BSB).length}`);
  console.log(`MSB note verses: ${Object.keys(result.MSB).length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
