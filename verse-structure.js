// ══ Verse Structure ═══════════════════════════════════════════════════════════
// English Bible study tool: local MSB/BSB + api.bible NIV/NKJV/NASB

const VS_API_BASE = 'https://api.scripture.api.bible/v1';
const VS_API_KEY  = 'dQ9NC5IcC5JrRfOY6Nq-q';

// App book codes that differ from api.bible OSIS codes
const VS_BOOK_CODE_MAP = {
  MAR: 'MRK', JOH: 'JHN', JAM: 'JAS',
  '1JO': '1JN', '2JO': '2JN', '3JO': '3JN'
};

// ── ESV (Crossway api.esv.org) ─────────────────────────────────────────────────
// The ESV streams from Crossway's own API and is NEVER stored on the device:
// Crossway's license does not permit keeping a local copy of the translation,
// so ESV chapters live in session memory only — no IndexedDB, no download
// button, refetched next session. Create a free key at api.esv.org and paste
// it below to enable the version (it stays hidden while the key is empty).
const ESV_API_KEY = '1009748a883d9bc8c7bce4c6ad1dd9e3ace46933';
const ESV_API_BASE = 'https://api.esv.org/v3/passage/text/';

// ── Version registry ──────────────────────────────────────────────────────────
// Single source of truth for every version the app offers. MSB/BSB ship on
// device; everything else streams from api.bible in chapter blocks and is
// cached permanently to IndexedDB. `id` values are pinned bibleIds (verified
// against the live /v1/bibles list) — never prefix-matched, so NASB 2020 and
// NASB 1995 can't be confused. `more` = lives in the "Additional versions"
// tab; `study` = tagged as a study Bible; `scope` = partial canon.
const VS_VERSIONS = [
  { code: 'MSB',    name: 'Majority Standard Bible',            local: true },
  { code: 'BSB',    name: 'Berean Standard Bible',              local: true },
  { code: 'NIV',    name: 'New International Version',          id: '78a9f6124f344018-01' },
  { code: 'NKJV',   name: 'New King James Version',             id: '63097d2a0a2f7db3-01' },
  { code: 'NASB',   name: 'New American Standard 2020',         id: 'a761ca71e0b3ddcf-01' },
  { code: 'NASB95', name: 'New American Standard 1995',         id: 'b8ee27bcd1cae43a-01' },
  { code: 'KJV',    name: 'King James Version',                 id: 'de4e12af7f28f599-01' },
  { code: 'ESV',    name: 'English Standard Version',           esv: true, stream: true },
  { code: 'NLT',    name: 'New Living Translation',             id: 'd6e14a625393b4da-01' },
  { code: 'CSB',    name: 'Christian Standard Bible',           id: 'a556c5305ee15c3f-01' },
  { code: 'AMP',    name: 'Amplified Bible',                    id: 'a81b73293d3080c9-01' },
  { code: 'MSG',    name: 'The Message',                        id: '6f11a7de016f942e-01' },
  { code: 'LXXEN',  name: 'Brenton Septuagint (LXX)',           id: '6bab4d6c61b31b80-01', study: true, scope: 'ot' },
  { code: 'F35',    name: 'Family 35 New Testament',            id: '2f0fd81d7b85b923-01', study: true, scope: 'nt' },
  // Additional versions tab
  { code: 'GNT',    name: 'Good News Translation',              id: '61fd76eafa1577c2-01', more: true },
  { code: 'CEV',    name: 'Contemporary English Version',       id: '555fef9a6cb31151-01', more: true },
  { code: 'NIRV',   name: 'New International Reader’s Version', id: '5b888a42e2d9a89d-01', more: true },
  { code: 'ASV',    name: 'American Standard Version 1901',     id: '06125adad2d5898a-01', more: true },
  { code: 'RV1885', name: 'Revised Version 1885',               id: '40072c4a5aba4022-01', more: true },
  { code: 'GNV',    name: 'Geneva Bible 1599',                  id: 'c315fa9f71d4af3a-01', more: true },
  { code: 'DRA',    name: 'Douay-Rheims 1899',                  id: '179568874c45066f-01', more: true },
  { code: 'WEB',    name: 'World English Bible',                id: '9879dbb7cfe39e4d-01', more: true },
  { code: 'FBV',    name: 'Free Bible Version',                 id: '65eec8e0b60e656b-01', more: true },
  { code: 'T4T',    name: 'Translation for Translators',        id: '66c22495370cdfc0-01', more: true },
  { code: 'LSV',    name: 'Literal Standard Version',           id: '01b29f4b342acc35-01', more: true, study: true },
  { code: 'TCENT',  name: 'Text-Critical New Testament',        id: '32339cf2f720ff8e-01', more: true, study: true, scope: 'nt' },
  { code: 'JPS',    name: 'JPS TaNaKH 1917',                    id: 'bf8f1c7f3f9045a5-01', more: true, study: true, scope: 'ot' },
  { code: 'TOJB',   name: 'Orthodox Jewish Bible',              id: 'c89622d31b60c444-02', more: true, study: true }
  // ESV stays hidden everywhere until an api.esv.org key is pasted above.
].filter(v => !v.esv || ESV_API_KEY);
const VS_VERSION_INFO = Object.fromEntries(VS_VERSIONS.map(v => [v.code, v]));
const VS_LOCAL_SET = new Set(VS_VERSIONS.filter(v => v.local).map(v => v.code));
const VS_TRANSLATIONS = VS_VERSIONS.map(v => v.code);
const VS_API_TRANSLATIONS = VS_VERSIONS.filter(v => !v.local).map(v => v.code);

// Partial-canon scope checks (e.g. Brenton LXX is OT-only, F35 is NT-only).
const VS_NT_BOOKS = new Set(['MAT','MAR','LUK','JOH','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAM','1PE','2PE','1JO','2JO','3JO','JUD','REV']);
function _vsBookInScope(trans, book) {
  const scope = VS_VERSION_INFO[trans]?.scope;
  if (!scope) return true;
  return scope === 'nt' ? VS_NT_BOOKS.has(book) : !VS_NT_BOOKS.has(book);
}
function _vsScopeLabel(trans) {
  const scope = VS_VERSION_INFO[trans]?.scope;
  return scope === 'nt' ? 'New Testament' : scope === 'ot' ? 'Old Testament' : '';
}

// Persistent localStorage cache keys for api.bible data
const VS_LS_VERSE_PFX   = 'vs_v_'; // + "TRANS|BOOK|CH|V"
const VS_LS_CHAPTER_PFX = 'vs_ch_'; // + "TRANS|BOOK|CH" → '1' when fully cached
const VS_LS_API_LIMITED = 'vs_api_limited_until'; // timestamp when limit resets

// ── State ─────────────────────────────────────────────────────────────────────
let _vsBook        = 'JOH';
let _vsChapter     = '3';
let _vsVerse       = '16';
let _vsVerseEnd    = null;   // null = single verse, '20' = range end
let _vsFullChapter = false;
let _vsTranslation = 'MSB';
let _vsPickerTesta = 'NT';
let _vsHlOn        = false;
let _vsPosActive   = new Set();
let _vsWheelOpen   = false;
let _vsXrefContext = false;  // true when xref was opened from VS (not Rhema)

// Range picker tap state: 'start' | 'end'
let _vsRangeTapState = 'start';
let _vsRangeStart    = null;
let _vsRangeEndPick  = null;

// Verse text cache: "TRANS|BOOK|CH|V" → text
const _vsTextCache = new Map();

// In-flight network fetches keyed by "TRANS|BOOK|CH|V" so a fast re-render or
// double-tap can't fire the same verse twice.
const _vsInFlight = new Map();

// ── Utility ───────────────────────────────────────────────────────────────────
function _vsEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function _vsBookName(code) {
  return (window.RhemaBookNames || {})[code] || code;
}

function _vsAllBooks() {
  return window.RhemaEnglishBooks || [];
}

function _vsLocalData() {
  return window.RhemaMSB || window.RhemaBSB || {};
}

function _vsLocalText(trans, book, ch, v) {
  const src = trans === 'BSB' ? window.RhemaBSB : window.RhemaMSB;
  return src?.[book]?.[String(ch)]?.[String(v)] || '';
}

function _vsApiCode(appCode) {
  return VS_BOOK_CODE_MAP[appCode] || appCode;
}

function _vsChapterVerses(book, ch) {
  const bData = _vsLocalData()[book] || {};
  return Object.keys(bData[String(ch)] || {}).sort((a, b) => +a - +b);
}

function _vsChapterList(book) {
  const bData = _vsLocalData()[book] || {};
  return Object.keys(bData).sort((a, b) => +a - +b);
}

// ── API Rate-Limit Handling ────────────────────────────────────────────────────
function _vsIsApiLimited() {
  try {
    const until = parseInt(localStorage.getItem(VS_LS_API_LIMITED) || '0', 10);
    return until > Date.now();
  } catch { return false; }
}

function _vsSetApiLimited() {
  // Mark limit active until the first of next month (when api.bible resets)
  const now   = new Date();
  const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  try { localStorage.setItem(VS_LS_API_LIMITED, String(reset)); } catch {}
  _vsApplyLimitedState();
}

// ESV has its own quota on Crossway's side (a daily query cap per key), fully
// independent of the api.bible monthly limit — track it separately and reset
// at local midnight.
const ESV_LS_LIMITED = 'esv_limited_until';
function _esvIsLimited() {
  try {
    const until = parseInt(localStorage.getItem(ESV_LS_LIMITED) || '0', 10);
    return until > Date.now();
  } catch { return false; }
}
function _esvSetLimited() {
  const now = new Date();
  const reset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  try { localStorage.setItem(ESV_LS_LIMITED, String(reset)); } catch {}
  _vsApplyLimitedState();
}

// Per-version limited check: local versions never limit, ESV checks Crossway's
// daily flag, everything else checks the shared api.bible monthly flag.
function _vsTransLimited(trans) {
  const info = VS_VERSION_INFO[trans];
  if (!info || info.local) return false;
  return info.esv ? _esvIsLimited() : _vsIsApiLimited();
}
function _vsLimitLabel(trans) {
  return VS_VERSION_INFO[trans]?.esv ? 'daily' : 'monthly';
}

function _vsApplyLimitedState() {
  // Grey out chips per-version (ESV's daily limit is independent of api.bible's)
  document.querySelectorAll('#vsTransRow .vs-trans-chip').forEach(chip => {
    chip.classList.toggle('limited', _vsTransLimited(chip.dataset.trans));
  });
  // Show/hide the banner (api.bible quota — covers every streamed version but ESV)
  const banner = document.getElementById('vsApiLimitBanner');
  if (banner) banner.classList.toggle('hidden', !_vsIsApiLimited());
  // If currently on a limited translation, fall back to MSB silently
  if (_vsTransLimited(_vsTranslation)) {
    _vsTranslation = 'MSB';
    _vsSyncTransRow();
  }
}

// ── api.bible Integration ─────────────────────────────────────────────────────
// Bible IDs are pinned in VS_VERSIONS — no runtime lookup, no stale localStorage
// snapshot to block newly-licensed versions, and zero API calls spent on it.
async function _vsGetBibleIds() {
  const ids = {};
  for (const v of VS_VERSIONS) if (v.id) ids[v.code] = v.id;
  return ids;
}

async function _vsFetchVerse(trans, book, ch, v) {
  if (!_vsBookInScope(trans, book)) return null; // e.g. NT book in an OT-only version
  const key = `${trans}|${book}|${ch}|${v}`;
  if (_vsTextCache.has(key)) return _vsTextCache.get(key);

  // Check persistent localStorage cache before hitting the network
  try {
    const stored = localStorage.getItem(VS_LS_VERSE_PFX + key);
    if (stored !== null) {
      _vsTextCache.set(key, stored);
      return stored;
    }
  } catch {}

  // Block-first: pull the whole ~250-verse chapter window instead of a single
  // verse. One passages call caches this chapter (and its neighbors) to
  // IndexedDB forever, so every later verse in the block is free — compare,
  // cross-refs and the reader all share the same downloaded text. The
  // single-verse endpoint below is only a fallback if the block path fails.
  if (typeof _vsEnsureChapter === 'function') {
    try {
      const chap = await _vsEnsureChapter(trans, book, ch);
      // A cached chapter is authoritative: a verse missing from it is a verse
      // the translation omits, not a fetch failure.
      if (chap) return chap[String(v)] || '';
    } catch {}
  }

  // Don't hit the network if the monthly quota is exhausted
  if (_vsIsApiLimited()) return null;

  // De-dupe concurrent requests for the same verse so a fast re-render or
  // double-tap can't fire (or bill) the same call twice.
  if (_vsInFlight.has(key)) return _vsInFlight.get(key);

  const p = (async () => {
    const ids     = await _vsGetBibleIds();
    const bibleId = ids[trans];
    if (!bibleId) return null;

    const verseId = `${_vsApiCode(book)}.${ch}.${v}`;
    const url     = `${VS_API_BASE}/bibles/${bibleId}/verses/${verseId}` +
      `?content-type=text&include-notes=false&include-titles=false` +
      `&include-chapter-numbers=false&include-verse-numbers=false`;

    try {
      const r = await fetch(url, { headers: { 'api-key': VS_API_KEY } });
      if (!r.ok) {
        // 429 = Too Many Requests; 403 can also mean quota exceeded on api.bible
        if (r.status === 429 || r.status === 403) _vsSetApiLimited();
        return null;
      }
      const { data } = await r.json();
      const text = (data?.content || '').trim().replace(/\s+/g, ' ');
      _vsTextCache.set(key, text);
      try { localStorage.setItem(VS_LS_VERSE_PFX + key, text); } catch {}
      return text;
    } catch {
      return null;
    }
  })();

  _vsInFlight.set(key, p);
  try { return await p; }
  finally { _vsInFlight.delete(key); }
}

// NOTE: the old per-verse whole-chapter prefetch (one API call per verse) was
// removed long ago. Chapter-level fetching now goes through the passages block
// layer below — one API call covers up to VS_BLOCK_VERSE_BUDGET verses and is
// cached to IndexedDB permanently, so it is strictly cheaper than per-verse.

// ── POS Highlighting ──────────────────────────────────────────────────────────
function _vsNlp() {
  return typeof _rhemaEnglishNlp !== 'undefined' ? _rhemaEnglishNlp : null;
}

function _vsHighlightText(text) {
  if (!text) return '';
  const nlpObj = _vsNlp();
  if (!_vsHlOn || _vsPosActive.size === 0 || !nlpObj) {
    return _vsEsc(text);
  }
  const POS_MAP = typeof RHEMA_ENGLISH_POS_TO_HIGHLIGHT !== 'undefined'
    ? RHEMA_ENGLISH_POS_TO_HIGHLIGHT : {};
  const HL_CATS = typeof HIGHLIGHT_CATS !== 'undefined' ? HIGHLIGHT_CATS : {};

  const doc = nlpObj.nlp.readDoc(text);
  const rows = [];
  doc.tokens().each(t => rows.push({ v: t.out(), p: t.out(nlpObj.its.pos) }));

  let cursor = 0;
  let html   = '';
  const lower = text.toLowerCase();

  for (const tok of rows) {
    const raw = String(tok.v || '');
    if (!raw) continue;
    const idx = lower.indexOf(raw.toLowerCase(), cursor);
    if (idx < cursor) continue;
    html += _vsEsc(text.slice(cursor, idx));
    const cat   = POS_MAP[tok.p] || null;
    const color = cat && _vsPosActive.has(cat) ? HL_CATS[cat]?.color : null;
    const surf  = text.slice(idx, idx + raw.length);
    html += color
      ? `<span class="rhema-english-pos-highlight" data-cat="${_vsEsc(cat)}" style="background:${color}">${_vsEsc(surf)}</span>`
      : _vsEsc(surf);
    cursor = idx + raw.length;
  }
  html += _vsEsc(text.slice(cursor));
  return html;
}

// ── Modal Open / Close ────────────────────────────────────────────────────────
async function openVerseStructure() {
  const modal = document.getElementById('verseStructureModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => modal.classList.add('vs-active'));
  });

  if (typeof loadRhemaScripts === 'function') {
    try { await loadRhemaScripts(); } catch { /* continue */ }
  }

  _vsSyncPills();
  _vsApplyLimitedState();
  _vsSyncTransRow();
  _vsRenderVerse();
  _syncVSWheelItems();
  const bar = document.getElementById('vsHighlightBar');
  if (bar) bar.classList.toggle('hidden', !_vsHlOn);
  if (typeof vsStructUpdateCabinetBadge === 'function') vsStructUpdateCabinetBadge();
}

function closeVerseStructure() {
  closeVSWheel();
  const modal = document.getElementById('verseStructureModal');
  if (!modal) return;
  modal.classList.remove('vs-active');
  setTimeout(() => modal.classList.add('hidden'), 320);
}

// ── Sync UI ───────────────────────────────────────────────────────────────────
function _vsSyncPills() {
  const label = document.getElementById('vsPillRefLabel');
  if (label) {
    label.textContent = `${_vsBookName(_vsBook)} ${_vsChapter}:${_vsVerse}`;
  }
  const rangeLabel = document.getElementById('vsRangeBtnLabel');
  const rangeBtn   = document.getElementById('vsRangeBtn');
  if (rangeLabel) {
    if (_vsFullChapter) {
      rangeLabel.textContent = 'All';
    } else if (_vsVerseEnd) {
      rangeLabel.textContent = `${_vsVerse}–${_vsVerseEnd}`;
    } else {
      rangeLabel.textContent = `v${_vsVerse}`;
    }
  }
  if (rangeBtn) {
    rangeBtn.classList.toggle('vs-range-active', !!_vsVerseEnd || _vsFullChapter);
    rangeBtn.disabled = _vsFullChapter;
  }
  const ref = document.getElementById('vsVerseRef');
  if (ref) {
    if (_vsFullChapter) {
      ref.textContent = `${_vsBookName(_vsBook)} ${_vsChapter}`;
    } else if (_vsVerseEnd) {
      ref.textContent = `${_vsBookName(_vsBook)} ${_vsChapter}:${_vsVerse}–${_vsVerseEnd}`;
    } else {
      ref.textContent = `${_vsBookName(_vsBook)} ${_vsChapter}:${_vsVerse}`;
    }
  }
}

// ── Book Picker ───────────────────────────────────────────────────────────────
function openVSBookPicker() {
  const ov = document.getElementById('vsBookPickerOverlay');
  if (!ov) return;
  _vsRenderBookList();
  ov.classList.remove('hidden');
}

function closeVSBookPicker() {
  document.getElementById('vsBookPickerOverlay')?.classList.add('hidden');
}

function _vsRenderBookList() {
  const tg = document.getElementById('vsTestamentGrid');
  if (tg) {
    tg.innerHTML = ['OT', 'NT'].map(t =>
      `<button class="vs-testa-btn${_vsPickerTesta === t ? ' active' : ''}" onclick="vsPickTestament('${t}')">
        <span class="material-symbols-outlined">auto_stories</span>
        ${t === 'OT' ? 'Old Testament' : 'New Testament'}
      </button>`
    ).join('');
  }
  const books = _vsAllBooks().filter(b => b.testament === _vsPickerTesta);
  const list  = document.getElementById('vsBookList');
  if (list) {
    list.innerHTML = books.map(b =>
      `<div class="rhema-book-row${b.code === _vsBook ? ' selected' : ''}" onclick="vsPickBook('${b.code}')">
        <span class="material-symbols-outlined rhema-book-icon">menu_book</span>
        <span class="rhema-book-name">${_vsEsc(b.name)}</span>
        <span class="material-symbols-outlined rhema-book-check">check</span>
      </div>`
    ).join('');
    setTimeout(() => list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' }), 40);
  }
}

function vsFilterBooks(q) {
  const query = q.toLowerCase().trim();
  document.getElementById('vsBookList')?.querySelectorAll('.rhema-book-row').forEach(r => {
    r.style.display = !query || r.querySelector('.rhema-book-name')?.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
}

function vsPickTestament(t) {
  _vsPickerTesta = t;
  const search = document.getElementById('vsBookSearchInput');
  if (search) search.value = '';
  _vsRenderBookList();
}

function vsPickBook(code) {
  _vsBook        = code;
  _vsPickerTesta = _vsAllBooks().find(b => b.code === code)?.testament || 'NT';
  _vsChapter     = _vsChapterList(code)[0] || '1';
  _vsVerse       = _vsChapterVerses(code, _vsChapter)[0] || '1';
  _vsVerseEnd    = null;
  closeVSBookPicker();
  _vsRenderVersePicker();
  openVSVersePicker();
  _vsSyncPills();
}

// ── Verse Picker ──────────────────────────────────────────────────────────────
function openVSVersePicker() {
  const ov = document.getElementById('vsVersePickerOverlay');
  if (!ov) return;
  _vsRenderVersePicker();
  ov.classList.remove('hidden');
}

function closeVSVersePicker() {
  document.getElementById('vsVersePickerOverlay')?.classList.add('hidden');
}

function _vsRenderVersePicker() {
  const chs = _vsChapterList(_vsBook);
  if (!chs.includes(_vsChapter)) _vsChapter = chs[0] || '1';

  const cg = document.getElementById('vsChapterGrid');
  if (cg) {
    cg.innerHTML = chs.map(c =>
      `<button class="${c === _vsChapter ? 'active' : ''}" onclick="vsPickChapter('${c}')">${c}</button>`
    ).join('');
  }

  const vs = _vsChapterVerses(_vsBook, _vsChapter);
  if (!vs.includes(_vsVerse)) _vsVerse = vs[0] || '1';

  const vg = document.getElementById('vsVerseGrid');
  if (vg) {
    vg.innerHTML = vs.map(v =>
      `<button class="${v === _vsVerse ? 'active' : ''}" onclick="vsPickVerse('${v}')">${v}</button>`
    ).join('');
  }

  const prev = document.getElementById('vsVersePreview');
  if (prev) {
    const text = _vsLocalText('MSB', _vsBook, _vsChapter, _vsVerse) ||
                 _vsLocalText('BSB', _vsBook, _vsChapter, _vsVerse);
    prev.innerHTML = `<strong>${_vsEsc(_vsBookName(_vsBook))} ${_vsChapter}:${_vsVerse}</strong>` +
      `<p>${_vsEsc(text)}</p>`;
  }
}

function vsPickChapter(ch) {
  _vsChapter = ch;
  _vsVerse   = _vsChapterVerses(_vsBook, ch)[0] || '1';
  _vsVerseEnd = null;
  _vsRenderVersePicker();
}

function vsPickVerse(v) {
  _vsVerse    = v;
  _vsVerseEnd = null;
  closeVSVersePicker();
  _vsSyncPills();
  _vsRenderVerse();
}

// ── Range Picker ──────────────────────────────────────────────────────────────
function openVSRangePicker() {
  if (_vsFullChapter) return;
  const ov = document.getElementById('vsRangePickerOverlay');
  if (!ov) return;
  _vsRangeTapState = 'start';
  _vsRangeStart    = _vsVerse;
  _vsRangeEndPick  = _vsVerseEnd || _vsVerse;
  _vsRenderRangeGrid();
  ov.classList.remove('hidden');
}

function closeVSRangePicker() {
  document.getElementById('vsRangePickerOverlay')?.classList.add('hidden');
}

function _vsRenderRangeGrid() {
  const vs = _vsChapterVerses(_vsBook, _vsChapter);
  const grid = document.getElementById('vsRangeGrid');
  if (!grid) return;

  const startN = _vsRangeStart ? parseInt(_vsRangeStart, 10) : null;
  const endN   = _vsRangeEndPick ? parseInt(_vsRangeEndPick, 10) : null;

  grid.innerHTML = vs.map(v => {
    const n = parseInt(v, 10);
    let cls = '';
    if (startN !== null && endN !== null) {
      if (n === startN && n === endN) cls = 'range-start range-end';
      else if (n === startN) cls = 'range-start';
      else if (n === endN)   cls = 'range-end';
      else if (n > startN && n < endN) cls = 'range-mid';
    } else if (startN !== null && n === startN) {
      cls = 'range-start';
    }
    return `<button class="${cls}" onclick="vsRangeTap('${v}')">${v}</button>`;
  }).join('');

  const sel = document.getElementById('vsRangeSelection');
  if (sel) {
    if (startN !== null && endN !== null && startN !== endN) {
      sel.textContent = `Verses ${startN}–${endN}`;
    } else if (startN !== null) {
      sel.textContent = `Verse ${startN} selected – tap end verse`;
    } else {
      sel.textContent = 'Tap a verse to begin';
    }
  }

  const applyBtn = document.getElementById('vsRangeApplyBtn');
  if (applyBtn) {
    const hasRange = startN !== null && endN !== null && endN >= startN;
    applyBtn.disabled = !hasRange;
  }
}

function vsRangeTap(v) {
  const n = parseInt(v, 10);
  if (_vsRangeTapState === 'start') {
    _vsRangeStart   = v;
    _vsRangeEndPick = v;
    _vsRangeTapState = 'end';
  } else {
    const startN = parseInt(_vsRangeStart, 10);
    if (n < startN) {
      // Tapped before start: reset start
      _vsRangeStart    = v;
      _vsRangeEndPick  = v;
    } else {
      _vsRangeEndPick  = v;
    }
  }
  _vsRenderRangeGrid();
}

function applyVSRange() {
  const startN = parseInt(_vsRangeStart, 10);
  const endN   = parseInt(_vsRangeEndPick, 10);
  if (isNaN(startN) || isNaN(endN) || endN < startN) return;

  _vsVerse    = String(startN);
  _vsVerseEnd = startN === endN ? null : String(endN);
  closeVSRangePicker();
  _vsSyncPills();
  _vsRenderVerse();
}

// ── Tool Wheel ────────────────────────────────────────────────────────────────
function openVSWheel() {
  const overlay = document.getElementById('vsWheelOverlay');
  if (!overlay) return;
  _vsWheelOpen = true;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('open'));
  _syncVSWheelItems();
}

function closeVSWheel() {
  const overlay = document.getElementById('vsWheelOverlay');
  if (!overlay) return;
  _vsWheelOpen = false;
  overlay.classList.remove('open');
  setTimeout(() => { if (!_vsWheelOpen) overlay.style.display = 'none'; }, 280);
}

function toggleVSWheel() {
  if (_vsWheelOpen) closeVSWheel();
  else openVSWheel();
}

function vsWheelAction(tool) {
  closeVSWheel();
  if (tool === 'xref') {
    setTimeout(() => openVSCrossReferences(), 120);
  } else if (tool === 'highlight') {
    toggleVSHighlightBar();
  } else if (tool === 'chapter') {
    _vsFullChapter = !_vsFullChapter;
    if (_vsFullChapter) _vsVerseEnd = null;
    _vsSyncPills();
    _vsRenderVerse();
    _syncVSWheelItems();
  } else if (tool === 'structure') {
    setTimeout(() => {
      if (typeof openVSStructurePicker === 'function') openVSStructurePicker();
    }, 120);
  }
}

function _syncVSWheelItems() {
  const chBtn = document.getElementById('vsWheelChapter');
  if (chBtn) chBtn.classList.toggle('active', _vsFullChapter);
  const hlBtn = document.getElementById('vsWheelHighlight');
  if (hlBtn) hlBtn.classList.toggle('active', _vsHlOn);
  const dot = document.getElementById('vsToolDot');
  if (dot) dot.classList.toggle('active', _vsHlOn || _vsFullChapter);
}

// ── Translation Chips ─────────────────────────────────────────────────────────
function _vsSyncTransRow() {
  document.querySelectorAll('#vsTransRow .vs-trans-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.trans === _vsTranslation);
  });
}

function vsSelectTrans(t) {
  if (_vsTransLimited(t)) {
    // Flash the banner to explain why the chip isn't switching
    const banner = document.getElementById('vsApiLimitBanner');
    if (banner) {
      banner.classList.remove('hidden');
      banner.classList.remove('vs-limit-flash');
      void banner.offsetWidth; // force reflow to restart animation
      banner.classList.add('vs-limit-flash');
    }
    return;
  }
  _vsTranslation = t;
  _vsSyncTransRow();
  _vsRenderVerse();
}

// ── Verse Display ─────────────────────────────────────────────────────────────
async function _vsRenderVerse() {
  const display = document.getElementById('vsVerseDisplay');
  const loading = document.getElementById('vsLoadingMsg');
  if (!display) return;

  // Full chapter mode
  if (_vsFullChapter) {
    await _vsRenderChapter(display, loading);
    return;
  }

  // Range mode
  if (_vsVerseEnd) {
    await _vsRenderRange(display, loading);
    return;
  }

  // Single verse
  if (VS_LOCAL_SET.has(_vsTranslation)) {
    const text = _vsLocalText(_vsTranslation, _vsBook, _vsChapter, _vsVerse);
    display.innerHTML = text
      ? `<div class="vs-verse-text">${_vsHighlightText(text)}</div>`
      : `<div class="vs-verse-empty">Verse not found in local data.</div>`;
    loading?.classList.add('hidden');
    display.classList.remove('hidden');
    return;
  }

  display.classList.add('hidden');
  if (loading) { loading.textContent = `Loading ${_vsTranslation}…`; loading.classList.remove('hidden'); }

  try {
    const text = await _vsFetchVerse(_vsTranslation, _vsBook, _vsChapter, _vsVerse);
    if (loading) loading.classList.add('hidden');
    display.innerHTML = text
      ? `<div class="vs-verse-text">${_vsHighlightText(text)}</div>`
      : `<div class="vs-error"><span class="material-symbols-outlined">info</span>Verse unavailable in ${_vsTranslation}.</div>`;
    display.classList.remove('hidden');
  } catch {
    if (loading) loading.classList.add('hidden');
    display.innerHTML =
      `<div class="vs-error"><span class="material-symbols-outlined">wifi_off</span>Could not load verse.</div>`;
    display.classList.remove('hidden');
  }
}

async function _vsRenderRange(display, loading) {
  const startN = parseInt(_vsVerse, 10);
  const endN   = parseInt(_vsVerseEnd, 10);
  const vs     = [];
  for (let i = startN; i <= endN; i++) vs.push(String(i));

  if (VS_LOCAL_SET.has(_vsTranslation)) {
    const lines = vs.map(v => {
      const text = _vsLocalText(_vsTranslation, _vsBook, _vsChapter, v);
      return `<div class="vs-chapter-verse"><span class="vs-verse-num">${v}</span><span class="vs-verse-text-inline">${_vsHighlightText(text)}</span></div>`;
    });
    display.innerHTML = `<div class="vs-chapter-view">${lines.join('')}</div>`;
    loading?.classList.add('hidden');
    display.classList.remove('hidden');
    return;
  }

  display.classList.add('hidden');
  if (loading) { loading.textContent = `Loading ${_vsTranslation}…`; loading.classList.remove('hidden'); }

  const texts = await Promise.all(vs.map(v => _vsFetchVerse(_vsTranslation, _vsBook, _vsChapter, v).catch(() => null)));
  if (loading) loading.classList.add('hidden');
  const lines = vs.map((v, i) =>
    `<div class="vs-chapter-verse"><span class="vs-verse-num">${v}</span><span class="vs-verse-text-inline">${_vsHighlightText(texts[i] || '')}</span></div>`
  );
  display.innerHTML = `<div class="vs-chapter-view">${lines.join('')}</div>`;
  display.classList.remove('hidden');
}

async function _vsRenderChapter(display, loading) {
  const vs = _vsChapterVerses(_vsBook, _vsChapter);

  if (VS_LOCAL_SET.has(_vsTranslation)) {
    const lines = vs.map(v => {
      const text = _vsLocalText(_vsTranslation, _vsBook, _vsChapter, v);
      return `<div class="vs-chapter-verse"><span class="vs-verse-num">${v}</span><span class="vs-verse-text-inline">${_vsHighlightText(text)}</span></div>`;
    });
    display.innerHTML = `<div class="vs-chapter-view">${lines.join('')}</div>`;
    loading?.classList.add('hidden');
    display.classList.remove('hidden');
    return;
  }

  display.classList.add('hidden');
  if (loading) { loading.textContent = `Loading ${_vsTranslation}…`; loading.classList.remove('hidden'); }

  const texts = await Promise.all(vs.map(v => _vsFetchVerse(_vsTranslation, _vsBook, _vsChapter, v).catch(() => null)));
  if (loading) loading.classList.add('hidden');
  const lines = vs.map((v, i) =>
    `<div class="vs-chapter-verse"><span class="vs-verse-num">${v}</span><span class="vs-verse-text-inline">${_vsHighlightText(texts[i] || '')}</span></div>`
  );
  display.innerHTML = `<div class="vs-chapter-view">${lines.join('')}</div>`;
  display.classList.remove('hidden');
}

// ── Verse Navigation ──────────────────────────────────────────────────────────
function vsNavVerse(dir) {
  const chs = _vsChapterList(_vsBook);

  if (_vsFullChapter) {
    const cIdx = chs.indexOf(String(_vsChapter));
    if (dir > 0 && cIdx < chs.length - 1) _vsChapter = chs[cIdx + 1];
    else if (dir < 0 && cIdx > 0)          _vsChapter = chs[cIdx - 1];
    _vsSyncPills();
    _vsRenderVerse();
    return;
  }

  // Clear range on nav
  _vsVerseEnd = null;

  const vs   = _vsChapterVerses(_vsBook, _vsChapter);
  const vIdx = vs.indexOf(String(_vsVerse));

  if (dir > 0) {
    if (vIdx < vs.length - 1) {
      _vsVerse = vs[vIdx + 1];
    } else {
      const cIdx = chs.indexOf(String(_vsChapter));
      if (cIdx < chs.length - 1) {
        _vsChapter = chs[cIdx + 1];
        _vsVerse   = _vsChapterVerses(_vsBook, _vsChapter)[0] || '1';
      }
    }
  } else {
    if (vIdx > 0) {
      _vsVerse = vs[vIdx - 1];
    } else {
      const cIdx = chs.indexOf(String(_vsChapter));
      if (cIdx > 0) {
        _vsChapter = chs[cIdx - 1];
        const prevVs = _vsChapterVerses(_vsBook, _vsChapter);
        _vsVerse = prevVs[prevVs.length - 1] || '1';
      }
    }
  }
  _vsSyncPills();
  _vsRenderVerse();
}

// ── POS Highlight Bar ─────────────────────────────────────────────────────────
function toggleVSHighlightBar() {
  _vsHlOn = !_vsHlOn;
  const bar = document.getElementById('vsHighlightBar');
  if (bar) bar.classList.toggle('hidden', !_vsHlOn);
  _syncVSWheelItems();

  if (_vsHlOn && typeof _loadRhemaEnglishNlp === 'function') {
    _loadRhemaEnglishNlp()
      .then(() => { _vsRefreshHlBar(); _vsRenderVerse(); })
      .catch(() => {});
  }
  if (!_vsHlOn) {
    _vsPosActive.clear();
    _vsRenderVerse();
  }
}

function toggleVSHighlight(cat) {
  if (_vsPosActive.has(cat)) _vsPosActive.delete(cat);
  else                        _vsPosActive.add(cat);
  _vsRefreshHlBar();
  _vsRenderVerse();
}

function _vsRefreshHlBar() {
  document.querySelectorAll('#vsHighlightBar .rhema-hl-pill').forEach(btn => {
    btn.classList.toggle('hl-active', _vsPosActive.has(btn.dataset.cat));
  });
}

// ── Cross References ──────────────────────────────────────────────────────────
async function openVSCrossReferences() {
  // Load scripts if needed (xref data lives in rhema bundles)
  if (typeof loadRhemaScripts === 'function') {
    try { await loadRhemaScripts(); } catch { /* continue */ }
  }

  // Set the shared rhema state variables so xref functions work
  if (typeof _rhemaBook    !== 'undefined') _rhemaBook    = _vsBook;
  if (typeof _rhemaChapter !== 'undefined') _rhemaChapter = _vsChapter;
  if (typeof _rhemaVerse   !== 'undefined') _rhemaVerse   = _vsVerse;

  // Mark that xref was opened from VS context (suppresses syncRhemaPicker / showRhema)
  _vsXrefContext = true;

  // Open cross-reference directly — the xref pages are now position:fixed top-level
  // so they appear above the VS modal without needing rhemaModal to be open
  if (typeof openRhemaCrossReferences === 'function') {
    openRhemaCrossReferences();
  }
}

// ══ Chapter-Block Fetching + IndexedDB Cache ═══════════════════════════════════
// One passage call fetches a window of whole chapters (~250 verses) instead of
// one verse. Chapters are cached permanently on-device in IndexedDB (localStorage
// tops out around 5MB — a full translation is ~4.5MB, so it can't live there),
// mirrored in memory for synchronous reads, and each verse is seeded into
// _vsTextCache so every existing consumer (compare, cross-refs) reads them free.
// The window is anchored on the requested chapter, extends through contiguous
// UNCACHED chapters (backward a little, forward a lot), never crosses a book,
// and never exceeds the per-request verse budget.
const VS_BLOCK_VERSE_BUDGET = 250;
// v2 prefix: caps learned under the v1 parser could be wrong — start fresh.
const VS_LS_BLOCK_CAP_PFX = 'vs_blockcap2_'; // + trans → learned per-version cap

const _vsChapterMem = new Map();      // "TRANS|BOOK|CH" → { verseNum: text }
const _vsChapterInFlight = new Map(); // block fetches keyed by target chapter
const _vsIdbKnownKeys = new Set();    // chapter keys known to exist in IndexedDB
let _vsDbPromise = null;

function _vsDb() {
  if (_vsDbPromise) return _vsDbPromise;
  _vsDbPromise = new Promise((resolve) => {
    try {
      // v2: v1 blocks were parsed without verse-number markers, which silently
      // dropped chapter-opening verses (the NIV "2 Cor 1:1 missing" bug) and
      // could cache truncated tail chapters. Rebuild the store so every
      // chapter re-downloads correctly.
      const req = indexedDB.open('rhema-bible-cache', 2);
      req.onupgradeneeded = () => {
        try { req.result.deleteObjectStore('chapters'); } catch {}
        try { req.result.createObjectStore('chapters'); } catch {}
      };
      req.onsuccess = () => {
        const db = req.result;
        // Load the key registry once so the window builder can skip chapters
        // already on-device without an async round trip per chapter.
        try {
          const tx = db.transaction('chapters', 'readonly').objectStore('chapters').getAllKeys();
          tx.onsuccess = () => (tx.result || []).forEach((k) => _vsIdbKnownKeys.add(String(k)));
        } catch {}
        resolve(db);
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return _vsDbPromise;
}

function _vsDbGet(key) {
  return _vsDb().then((db) => new Promise((resolve) => {
    if (!db) return resolve(null);
    try {
      const tx = db.transaction('chapters', 'readonly').objectStore('chapters').get(key);
      tx.onsuccess = () => resolve(tx.result || null);
      tx.onerror = () => resolve(null);
    } catch { resolve(null); }
  }));
}

function _vsDbPut(key, val) {
  return _vsDb().then((db) => new Promise((resolve) => {
    if (!db) return resolve(false);
    try {
      const tx = db.transaction('chapters', 'readwrite').objectStore('chapters').put(val, key);
      tx.onsuccess = () => { _vsIdbKnownKeys.add(key); resolve(true); };
      tx.onerror = () => resolve(false);
    } catch { resolve(false); }
  }));
}

function _vsChapterKey(trans, book, ch) { return `${trans}|${book}|${String(ch)}`; }

function _vsSeedChapter(trans, book, ch, verses) {
  const key = _vsChapterKey(trans, book, ch);
  _vsChapterMem.set(key, verses);
  for (const [v, t] of Object.entries(verses)) {
    _vsTextCache.set(`${trans}|${book}|${String(ch)}|${v}`, t);
  }
}

function _vsChapterFromMemory(trans, book, ch) {
  return _vsChapterMem.get(_vsChapterKey(trans, book, ch)) || null;
}

function _vsChapterKnownCached(trans, book, ch) {
  const key = _vsChapterKey(trans, book, ch);
  return _vsChapterMem.has(key) || _vsIdbKnownKeys.has(key);
}

function _vsBlockBudget(trans) {
  try {
    const learned = parseInt(localStorage.getItem(VS_LS_BLOCK_CAP_PFX + trans) || '0', 10);
    if (learned > 0) return Math.max(30, learned);
  } catch {}
  return VS_BLOCK_VERSE_BUDGET;
}

// Whole-chapter window around targetCh: backward through uncached neighbors
// (so paging back is covered), then forward as far as the budget allows.
// budgetOverride lets a source with different per-query rules (ESV) size the
// window itself instead of using the api.bible budget/learned cap.
function _vsBlockWindow(trans, book, targetCh, budgetOverride) {
  const target = parseInt(targetCh, 10);
  const chapters = _vsChapterList(book).map(Number);
  const countFor = (ch) => _vsChapterVerses(book, ch).length || 30;
  if (!chapters.length || !chapters.includes(target)) return { start: target, end: target };
  const min = chapters[0], max = chapters[chapters.length - 1];
  let budget = (budgetOverride || _vsBlockBudget(trans)) - countFor(target);
  let start = target, end = target;
  // A little back-context first (up to ~2 chapters), then forward with the rest.
  let backSteps = 0;
  while (backSteps < 2 && start - 1 >= min && !_vsChapterKnownCached(trans, book, start - 1)) {
    const c = countFor(start - 1);
    if (c > budget) break;
    start--; budget -= c; backSteps++;
  }
  while (end + 1 <= max && !_vsChapterKnownCached(trans, book, end + 1)) {
    const c = countFor(end + 1);
    if (c > budget) break;
    end++; budget -= c;
  }
  // Forward blocked (book end, or the chapters ahead are already cached — e.g.
  // paging BACKWARD into a book): spend the rest of the budget backward so the
  // call still pulls a full-size block instead of a couple of chapters.
  while (start - 1 >= min && !_vsChapterKnownCached(trans, book, start - 1)) {
    const c = countFor(start - 1);
    if (c > budget) break;
    start--; budget -= c;
  }
  return { start, end };
}

// Parses api.bible JSON passage content into { chapterNum: { verseNum: text } }.
// Verified against live payloads: verse boundaries come from `verse` tags whose
// sid uses "2CO 1:1" (space/colon) format — the printed number is a text node
// INSIDE that tag and must be skipped. Text nodes may carry their own verseId
// in "2CO.1.3" (dot) format, which wins over the running marker. Continuation
// paragraphs mark their verse via a para-level `vid` attr. Some versions (MSG,
// CEV) group verses: sid "JHN 3:1-2" — the text lands on the first verse and
// the rest of the range gets a pointer note so no verse reads as missing.
function _vsParsePassageJson(content, apiBook) {
  const out = {};
  const ranges = [];
  let cur = null;
  const esc = apiBook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idRe = new RegExp('^' + esc + '[ .](\\d+)[:.](\\d+)(?:-(\\d+))?');
  const parseId = (s) => {
    const m = typeof s === 'string' ? s.match(idRe) : null;
    return m ? { ch: m[1], v: m[2], end: m[3] || null } : null;
  };
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const attrs = node.attrs || {};
    const marker = parseId(attrs.sid) || parseId(attrs.verseId) || parseId(attrs.vid);
    if (marker) {
      cur = marker;
      if (marker.end && Number(marker.end) > Number(marker.v)) ranges.push(marker);
    }
    // The verse tag itself only wraps the printed verse number — take its sid
    // (above) but never descend into it, or the number joins the text.
    if (node.type === 'tag' && node.name === 'verse') return;
    if (node.type === 'text' && typeof node.text === 'string') {
      const own = parseId(attrs.verseId);
      const tgt = own || cur;
      if (tgt) {
        const chOut = out[tgt.ch] || (out[tgt.ch] = {});
        // Space-join fragments: one verse can span paragraphs/poetry lines and
        // the pieces don't carry their own separators.
        chOut[tgt.v] = (chOut[tgt.v] ? chOut[tgt.v] + ' ' : '') + node.text;
      }
    }
    if (node.items) visit(node.items);
  };
  visit(content);
  // Grouped verses (MSG "3:1-2"): point the covered verses at the first one.
  for (const r of ranges) {
    const chOut = out[r.ch];
    if (!chOut || !chOut[r.v]) continue;
    for (let v = Number(r.v) + 1; v <= Number(r.end); v++) {
      if (!chOut[String(v)]) chOut[String(v)] = `(verses ${r.v}-${r.end} are combined with verse ${r.v} in this translation)`;
    }
  }
  for (const ch of Object.keys(out)) {
    for (const v of Object.keys(out[ch])) {
      const t = out[ch][v].replace(/\s+/g, ' ').trim();
      if (t) out[ch][v] = t; else delete out[ch][v];
    }
    if (!Object.keys(out[ch]).length) delete out[ch];
  }
  return out;
}

// Recent failed block fetches ("TRANS|BOOK|CH" → timestamp) so a render loop
// can't hammer the API retrying a chapter that just failed.
const _vsChapterFailAt = new Map();

// Fetches the block containing targetCh. One network call caches many chapters.
async function _vsFetchChapterBlock(trans, book, targetCh) {
  if (_vsIsApiLimited()) return null;
  const flightKey = _vsChapterKey(trans, book, targetCh);
  if (_vsChapterInFlight.has(flightKey)) return _vsChapterInFlight.get(flightKey);
  const failedAt = _vsChapterFailAt.get(flightKey);
  if (failedAt && Date.now() - failedAt < 60000) return null;
  const p = (async () => {
    const bibleId = VS_VERSION_INFO[trans]?.id;
    if (!bibleId) return null;
    const { start, end } = _vsBlockWindow(trans, book, targetCh);
    const api = _vsApiCode(book);
    const passageId = start === end ? `${api}.${start}` : `${api}.${start}-${api}.${end}`;
    // include-verse-numbers must stay TRUE: the verse-number tags carry the sid
    // markers that anchor chapter-opening verses (without them the salutation
    // paragraphs at the start of chapters have no verse attribution at all —
    // that was the "2 Cor 1:1 missing in NIV" bug).
    const url = `${VS_API_BASE}/bibles/${bibleId}/passages/${passageId}` +
      `?content-type=json&include-notes=false&include-titles=false` +
      `&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false`;
    try {
      const r = await fetch(url, { headers: { 'api-key': VS_API_KEY } });
      if (!r.ok) {
        if (r.status === 429 || r.status === 403) _vsSetApiLimited();
        else _vsChapterFailAt.set(flightKey, Date.now());
        return null;
      }
      const { data } = await r.json();
      const byChapter = _vsParsePassageJson(data?.content, api);
      const gotChapters = Object.keys(byChapter).map(Number).sort((a, b) => a - b);
      // The API truncates long passages MID-CHAPTER (measured: NIV serves 200
      // verses and cuts wherever that lands). A partially-served tail chapter
      // must never be cached as if complete — drop it unless it holds at least
      // as many verses as the local text expects (small tolerance for verses
      // some translations legitimately omit).
      if (gotChapters.length > 1) {
        const last = gotChapters[gotChapters.length - 1];
        const expected = _vsChapterVerses(book, last).length;
        if (expected && Object.keys(byChapter[String(last)]).length < expected - 3) {
          delete byChapter[String(last)];
          gotChapters.pop();
        }
      }
      let versesGot = 0;
      for (const [chNum, verses] of Object.entries(byChapter)) {
        _vsSeedChapter(trans, book, chNum, verses);
        _vsDbPut(_vsChapterKey(trans, book, chNum), verses);
        versesGot += Object.keys(verses).length;
      }
      // Truncation learning: served less than requested → this version's
      // per-request cap is lower than our budget. Remember it so the next
      // window is sized right (nothing was wasted — kept chapters are cached).
      const lastGot = gotChapters[gotChapters.length - 1] || 0;
      if (end > start && lastGot < end && versesGot > 0) {
        try { localStorage.setItem(VS_LS_BLOCK_CAP_PFX + trans, String(Math.max(30, versesGot))); } catch {}
      }
      const result = _vsChapterFromMemory(trans, book, targetCh);
      // Back off only on a truly empty response; if the call cached SOME
      // chapters (e.g. truncation ate the target), the immediate retry's
      // window starts at the target and will land it.
      if (!result && versesGot === 0) _vsChapterFailAt.set(flightKey, Date.now());
      else _vsChapterFailAt.delete(flightKey);
      return result;
    } catch {
      _vsChapterFailAt.set(flightKey, Date.now());
      return null;
    }
  })().finally(() => _vsChapterInFlight.delete(flightKey));
  _vsChapterInFlight.set(flightKey, p);
  return p;
}

// ── ESV streaming fetch (Crossway api.esv.org) ─────────────────────────────────
// The ESV never touches IndexedDB or localStorage: Crossway's license does not
// permit keeping a copy of the translation on the device, so chapters are
// seeded into session memory only and refetched next launch. The trailing
// "(ESV)" on each chapter comes from include-short-copyright=true, which is
// what fulfills Crossway's copyright-display requirement — leave it in.

// App book codes → the passage names Crossway's `q` parameter expects.
const ESV_BOOK_NAMES = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy',
  JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth', '1SA': '1 Samuel', '2SA': '2 Samuel',
  '1KI': '1 Kings', '2KI': '2 Kings', '1CH': '1 Chronicles', '2CH': '2 Chronicles',
  EZR: 'Ezra', NEH: 'Nehemiah', EST: 'Esther', JOB: 'Job', PSA: 'Psalm',
  PRO: 'Proverbs', ECC: 'Ecclesiastes', SNG: 'Song of Solomon', ISA: 'Isaiah',
  JER: 'Jeremiah', LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel',
  HOS: 'Hosea', JOL: 'Joel', AMO: 'Amos', OBA: 'Obadiah', JON: 'Jonah',
  MIC: 'Micah', NAM: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah', HAG: 'Haggai',
  ZEC: 'Zechariah', MAL: 'Malachi',
  MAT: 'Matthew', MAR: 'Mark', LUK: 'Luke', JOH: 'John', ACT: 'Acts',
  ROM: 'Romans', '1CO': '1 Corinthians', '2CO': '2 Corinthians', GAL: 'Galatians',
  EPH: 'Ephesians', PHP: 'Philippians', COL: 'Colossians',
  '1TH': '1 Thessalonians', '2TH': '2 Thessalonians', '1TI': '1 Timothy',
  '2TI': '2 Timothy', TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews',
  JAM: 'James', '1PE': '1 Peter', '2PE': '2 Peter', '1JO': '1 John',
  '2JO': '2 John', '3JO': '3 John', JUD: 'Jude', REV: 'Revelation'
};

// Crossway's per-query ceiling: "up to 500 verses per query, or half a book,
// whichever is less (excepting single-chapter and double-chapter books)."
// Sizing every query to this ceiling gets the most text per query, so the
// 5,000/day budget goes as far as it possibly can.
function _esvQueryBudget(book) {
  const chs = _vsChapterList(book);
  let total = 0;
  for (const c of chs) total += _vsChapterVerses(book, c).length;
  if (chs.length <= 2) return Math.min(500, Math.max(1, total)); // exempt from the half-book rule
  return Math.min(500, Math.max(1, Math.floor(total / 2)));
}

// Splits a plain-text ESV passage on its verse markers into
// { chapterNum: { verseNum: text } }. Markers are [5] within a chapter and
// [3:1] at chapter starts (include-first-verse-numbers); as a fallback, a
// plain marker that doesn't increase means the passage crossed into the next
// chapter. Anything before the first marker (psalm superscriptions like
// "To the choirmaster. A Psalm of David.") belongs to that first verse, and
// every chapter keeps a closing "(ESV)" — the copyright notice Crossway's
// license requires wherever the text is displayed.
function _esvParseChapters(passage, startCh) {
  const text = String(passage || '');
  const markers = [];
  const re = /\[(?:(\d+):)?(\d+)\]/g;
  let m;
  while ((m = re.exec(text))) markers.push({ ch: m[1] || null, v: m[2], start: m.index, end: re.lastIndex });
  if (!markers.length) return null;
  const out = {};
  let ch = String(parseInt(startCh, 10) || 1);
  let lastV = 0;
  for (let i = 0; i < markers.length; i++) {
    const mk = markers[i];
    if (mk.ch) ch = String(Number(mk.ch));
    else if (i > 0 && Number(mk.v) <= lastV) ch = String(Number(ch) + 1);
    lastV = Number(mk.v);
    const seg = text.slice(mk.end, i + 1 < markers.length ? markers[i + 1].start : undefined)
      .replace(/\s+/g, ' ').trim();
    if (seg) {
      const chOut = out[ch] || (out[ch] = {});
      chOut[mk.v] = chOut[mk.v] ? chOut[mk.v] + ' ' + seg : seg;
    }
    if (i === 0) {
      const lead = text.slice(0, mk.start).replace(/\s+/g, ' ').trim();
      if (lead) {
        const chOut = out[ch] || (out[ch] = {});
        chOut[mk.v] = chOut[mk.v] ? lead + ' ' + chOut[mk.v] : lead;
      }
    }
  }
  // The short-copyright "(ESV)" arrives once per passage; make sure every
  // chapter carries it so the notice shows no matter which chapter renders.
  for (const c of Object.keys(out)) {
    const vs = Object.keys(out[c]);
    if (!vs.length) { delete out[c]; continue; }
    const last = vs.reduce((a, b) => (Number(a) > Number(b) ? a : b));
    if (!/\(ESV\)\s*$/.test(out[c][last])) out[c][last] += ' (ESV)';
  }
  return Object.keys(out).length ? out : null;
}

// Single-chapter convenience wrapper (used for the per-psalm passages).
function _esvParseChapter(passage) {
  const byCh = _esvParseChapters(passage, 1);
  if (!byCh) return null;
  return byCh[Object.keys(byCh)[0]] || null;
}

// Fetches the ESV block containing targetCh and seeds it into session memory.
// Reuses the same window logic as the api.bible layer — a couple of chapters
// of back-context for paging backward, then forward to the budget, skipping
// anything already in memory and never crossing a book — sized to Crossway's
// own per-query ceiling so one query pulls the maximum text. Psalms are
// requested as one semicolon-joined query per chapter-passage so each psalm's
// superscription stays attached to its own chapter. NO persistence, ever.
async function _esvFetchChapter(book, ch) {
  if (!ESV_API_KEY || _esvIsLimited()) return null;
  ch = String(ch);
  const flightKey = _vsChapterKey('ESV', book, ch);
  if (_vsChapterInFlight.has(flightKey)) return _vsChapterInFlight.get(flightKey);
  const failedAt = _vsChapterFailAt.get(flightKey);
  if (failedAt && Date.now() - failedAt < 60000) return null;
  const name = ESV_BOOK_NAMES[book];
  if (!name) return null;
  const { start, end } = _vsBlockWindow('ESV', book, ch, _esvQueryBudget(book));
  const perChapter = book === 'PSA'; // keep superscriptions with their psalm
  const q = perChapter
    ? Array.from({ length: end - start + 1 }, (_, i) => `${name} ${start + i}`).join(';')
    : (start === end ? `${name} ${start}` : `${name} ${start}-${end}`);
  const p = (async () => {
    const url = ESV_API_BASE + '?q=' + encodeURIComponent(q) +
      '&include-passage-references=false&include-verse-numbers=true' +
      '&include-first-verse-numbers=true&include-footnotes=false' +
      '&include-footnote-body=false&include-headings=false' +
      '&include-short-copyright=true&indent-poetry=false&indent-paragraphs=0&line-length=0';
    try {
      const r = await fetch(url, { headers: { Authorization: 'Token ' + ESV_API_KEY } });
      if (!r.ok) {
        // 429 = quota/throttle hit; 401/403 = key rejected — either way stop
        // hitting Crossway until tomorrow instead of failing every chapter.
        if (r.status === 429 || r.status === 401 || r.status === 403) _esvSetLimited();
        else _vsChapterFailAt.set(flightKey, Date.now());
        return null;
      }
      const data = await r.json();
      const passages = data?.passages || [];
      let byChapter;
      if (perChapter) {
        byChapter = {};
        passages.forEach((pas, i) => {
          const verses = _esvParseChapter(pas);
          if (verses) byChapter[String(start + i)] = verses;
        });
      } else {
        byChapter = _esvParseChapters(passages[0], start) || {};
      }
      for (const [chNum, verses] of Object.entries(byChapter)) {
        _vsSeedChapter('ESV', book, chNum, verses); // memory only — never _vsDbPut
      }
      const result = _vsChapterFromMemory('ESV', book, ch);
      if (!result) _vsChapterFailAt.set(flightKey, Date.now());
      else _vsChapterFailAt.delete(flightKey);
      return result;
    } catch {
      _vsChapterFailAt.set(flightKey, Date.now());
      return null;
    }
  })();
  // Register the fetch under EVERY uncached chapter in the window, not just the
  // target — a concurrent request for a neighboring chapter (compare while the
  // reader loads, read-ahead) rides this query instead of firing its own.
  const registered = [];
  for (let c = start; c <= end; c++) {
    const k = _vsChapterKey('ESV', book, String(c));
    if (_vsChapterInFlight.has(k) || _vsChapterMem.has(k)) continue;
    _vsChapterInFlight.set(k, k === flightKey ? p : p.then(() => _vsChapterFromMemory('ESV', book, String(c))));
    registered.push(k);
  }
  p.finally(() => registered.forEach(k => _vsChapterInFlight.delete(k)));
  return p;
}

// ── Whole-version download ─────────────────────────────────────────────────────
// Walks the canon in order and fetches every not-yet-cached chapter through the
// block layer. Because each fetch pulls a max-size window and skips anything
// already on device, a full Bible lands in roughly (total verses / block cap)
// calls — the theoretical minimum — and an interrupted run resumes for free.
let _vsBulkTrans = null; // one whole-version download at a time

function _vsBooksForTrans(trans) {
  const order = typeof RHEMA_BOOK_ORDER !== 'undefined' ? RHEMA_BOOK_ORDER
    : Object.keys((typeof window !== 'undefined' && window.RhemaMSB) || {});
  return order.filter(b => _vsBookInScope(trans, b) && _vsChapterList(b).length);
}

function _vsVersionCacheStats(trans) {
  let total = 0, cached = 0;
  for (const b of _vsBooksForTrans(trans)) {
    for (const ch of _vsChapterList(b)) {
      total++;
      if (_vsChapterKnownCached(trans, b, String(ch))) cached++;
    }
  }
  return { cached, total };
}

async function _vsDownloadWholeVersion(trans, onProgress) {
  // Streaming-only versions (ESV) may not be saved to the device — no bulk download.
  if (_vsBulkTrans || !VS_API_TRANSLATIONS.includes(trans) || VS_VERSION_INFO[trans]?.stream) return false;
  _vsBulkTrans = trans;
  try {
    await _vsDb(); // wake IndexedDB so the cached-chapter registry is loaded
    for (const book of _vsBooksForTrans(trans)) {
      for (const ch of _vsChapterList(book).map(String)) {
        if (_vsIsApiLimited()) return false;
        if (_vsChapterKnownCached(trans, book, ch)) continue;
        await _vsEnsureChapter(trans, book, ch);
        if (onProgress) onProgress(_vsVersionCacheStats(trans));
      }
    }
    return _vsVersionCacheStats(trans).cached >= _vsVersionCacheStats(trans).total;
  } finally { _vsBulkTrans = null; }
}

// Warm the IndexedDB registry shortly after launch so cache stats are accurate
// the first time a picker renders.
if (typeof indexedDB !== 'undefined' && typeof setTimeout !== 'undefined') {
  setTimeout(() => { try { _vsDb(); } catch {} }, 2500);
}

// Drop translation chips for versions not in the registry — the ESV chip ships
// in the markup but only shows once an api.esv.org key is pasted above.
if (typeof document !== 'undefined' && typeof setTimeout !== 'undefined') {
  setTimeout(() => {
    try {
      document.querySelectorAll('#vsTransRow .vs-trans-chip').forEach(chip => {
        if (!VS_VERSION_INFO[chip.dataset.trans]) chip.remove();
      });
    } catch {}
  }, 0);
}

// Public entry: memory → IndexedDB → block fetch. Resolves to the chapter's
// { verseNum: text } map, or null when unavailable (offline / over quota /
// outside the version's canon).
async function _vsEnsureChapter(trans, book, ch) {
  ch = String(ch);
  if (!VS_API_TRANSLATIONS.includes(trans)) return null;
  if (!_vsBookInScope(trans, book)) return null;
  const mem = _vsChapterFromMemory(trans, book, ch);
  if (mem) return mem;
  // ESV streams from Crossway and is never stored — skip IndexedDB entirely.
  if (VS_VERSION_INFO[trans]?.esv) return _esvFetchChapter(book, ch);
  const stored = await _vsDbGet(_vsChapterKey(trans, book, ch));
  if (stored) { _vsSeedChapter(trans, book, ch, stored); return stored; }
  return _vsFetchChapterBlock(trans, book, ch);
}
