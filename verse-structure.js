// ══ Verse Structure ═══════════════════════════════════════════════════════════
// English Bible study tool: local MSB/BSB + api.bible NIV/NKJV/NASB

const VS_API_BASE = 'https://api.scripture.api.bible/v1';
const VS_API_KEY  = 'dQ9NC5IcC5JrRfOY6Nq-q';

// App book codes that differ from api.bible OSIS codes
const VS_BOOK_CODE_MAP = {
  MAR: 'MRK', JOH: 'JHN', JAM: 'JAS',
  '1JO': '1JN', '2JO': '2JN', '3JO': '3JN'
};

const VS_LOCAL_SET    = new Set(['MSB', 'BSB']);
// The Verse Structure tool itself is local-only now (MSB/BSB). The api.bible
// translations (NIV/NKJV/NASB) are fetched in ~250-verse chapter blocks (see
// _vsEnsureChapter below) for the Rhema reader, compare and cross-refs, and
// cached permanently to IndexedDB.
const VS_TRANSLATIONS = ['MSB', 'BSB'];
// Translations that may be requested over the network.
const VS_API_TRANSLATIONS = ['NIV', 'NKJV', 'NASB'];

// Persistent localStorage cache keys for api.bible data
const VS_LS_BIBLE_IDS   = 'vs_bible_ids_v1';
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

// api.bible Bible-ID cache
let _vsBibleIds       = null;
let _vsBibleIdsFetch  = null;

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

function _vsApplyLimitedState() {
  const limited = _vsIsApiLimited();
  // Grey out API-only chips
  document.querySelectorAll('#vsTransRow .vs-trans-chip').forEach(chip => {
    const isApi = !VS_LOCAL_SET.has(chip.dataset.trans);
    chip.classList.toggle('limited', limited && isApi);
  });
  // Show/hide the banner
  const banner = document.getElementById('vsApiLimitBanner');
  if (banner) banner.classList.toggle('hidden', !limited);
  // If currently on a limited translation, fall back to MSB silently
  if (limited && !VS_LOCAL_SET.has(_vsTranslation)) {
    _vsTranslation = 'MSB';
    _vsSyncTransRow();
  }
}

// ── api.bible Integration ─────────────────────────────────────────────────────
async function _vsGetBibleIds() {
  if (_vsBibleIds) return _vsBibleIds;
  if (_vsBibleIdsFetch) return _vsBibleIdsFetch;

  // Check localStorage before hitting the network
  try {
    const cached = localStorage.getItem(VS_LS_BIBLE_IDS);
    if (cached) {
      _vsBibleIds = JSON.parse(cached);
      return _vsBibleIds;
    }
  } catch {}

  _vsBibleIdsFetch = (async () => {
    try {
      const r = await fetch(`${VS_API_BASE}/bibles?language=ENG`, {
        headers: { 'api-key': VS_API_KEY }
      });
      if (!r.ok) throw new Error('api.bible list failed');
      const { data = [] } = await r.json();
      const ids = {};
      for (const b of data) {
        const abbr = (b.abbreviation || b.abbreviationLocal || '')
          .toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!ids.NIV  && /^NIV/.test(abbr))  ids.NIV  = b.id;
        if (!ids.NKJV && /^NKJV/.test(abbr)) ids.NKJV = b.id;
        if (!ids.NASB && /^NASB/.test(abbr)) ids.NASB = b.id;
      }
      _vsBibleIds = ids;
      try { localStorage.setItem(VS_LS_BIBLE_IDS, JSON.stringify(ids)); } catch {}
      return ids;
    } catch {
      _vsBibleIdsFetch = null;
      return {};
    }
  })();
  return _vsBibleIdsFetch;
}

async function _vsFetchVerse(trans, book, ch, v) {
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
  if (!VS_LOCAL_SET.has(t) && _vsIsApiLimited()) {
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
const VS_LS_BLOCK_CAP_PFX = 'vs_blockcap_'; // + trans → learned per-version cap

const _vsChapterMem = new Map();      // "TRANS|BOOK|CH" → { verseNum: text }
const _vsChapterInFlight = new Map(); // block fetches keyed by target chapter
const _vsIdbKnownKeys = new Set();    // chapter keys known to exist in IndexedDB
let _vsDbPromise = null;

function _vsDb() {
  if (_vsDbPromise) return _vsDbPromise;
  _vsDbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open('rhema-bible-cache', 1);
      req.onupgradeneeded = () => {
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
function _vsBlockWindow(trans, book, targetCh) {
  const target = parseInt(targetCh, 10);
  const chapters = _vsChapterList(book).map(Number);
  const countFor = (ch) => _vsChapterVerses(book, ch).length || 30;
  if (!chapters.length || !chapters.includes(target)) return { start: target, end: target };
  const min = chapters[0], max = chapters[chapters.length - 1];
  let budget = _vsBlockBudget(trans) - countFor(target);
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
  return { start, end };
}

// Parses api.bible JSON passage content into { chapterNum: { verseNum: text } }.
// Walks the whole content tree: verse boundaries come from verse-tag sid/verseId
// attrs ("GEN.5.1"); text nodes that carry their own verseId win over the
// running marker. Titles/notes are excluded by the request flags.
function _vsParsePassageJson(content, apiBook) {
  const out = {};
  let cur = null;
  const idRe = new RegExp('^' + apiBook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.(\\d+)\\.(\\d+)');
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const attrs = node.attrs || {};
    const marker = attrs.sid || attrs.verseId;
    if (typeof marker === 'string') {
      const m = marker.match(idRe);
      if (m) cur = { ch: m[1], v: m[2] };
    }
    if (node.type === 'text' && typeof node.text === 'string') {
      const own = typeof attrs.verseId === 'string' ? attrs.verseId.match(idRe) : null;
      const tgt = own ? { ch: own[1], v: own[2] } : cur;
      if (tgt) {
        const chOut = out[tgt.ch] || (out[tgt.ch] = {});
        chOut[tgt.v] = (chOut[tgt.v] || '') + node.text;
      }
    }
    if (node.items) visit(node.items);
  };
  visit(content);
  for (const ch of Object.keys(out)) {
    for (const v of Object.keys(out[ch])) {
      const t = out[ch][v].replace(/\s+/g, ' ').trim();
      if (t) out[ch][v] = t; else delete out[ch][v];
    }
    if (!Object.keys(out[ch]).length) delete out[ch];
  }
  return out;
}

// Fetches the block containing targetCh. One network call caches ~8 chapters.
async function _vsFetchChapterBlock(trans, book, targetCh) {
  if (_vsIsApiLimited()) return null;
  const flightKey = _vsChapterKey(trans, book, targetCh);
  if (_vsChapterInFlight.has(flightKey)) return _vsChapterInFlight.get(flightKey);
  const p = (async () => {
    const ids = await _vsGetBibleIds();
    const bibleId = ids[trans];
    if (!bibleId) return null;
    const { start, end } = _vsBlockWindow(trans, book, targetCh);
    const api = _vsApiCode(book);
    const passageId = start === end ? `${api}.${start}` : `${api}.${start}-${api}.${end}`;
    const url = `${VS_API_BASE}/bibles/${bibleId}/passages/${passageId}` +
      `?content-type=json&include-notes=false&include-titles=false` +
      `&include-chapter-numbers=false&include-verse-numbers=false&include-verse-spans=false`;
    try {
      const r = await fetch(url, { headers: { 'api-key': VS_API_KEY } });
      if (!r.ok) {
        if (r.status === 429 || r.status === 403) _vsSetApiLimited();
        return null;
      }
      const { data } = await r.json();
      const byChapter = _vsParsePassageJson(data?.content, api);
      let versesGot = 0;
      for (const [chNum, verses] of Object.entries(byChapter)) {
        _vsSeedChapter(trans, book, chNum, verses);
        _vsDbPut(_vsChapterKey(trans, book, chNum), verses);
        versesGot += Object.keys(verses).length;
      }
      // Truncation learning: if the tail of the window came back empty, this
      // version's per-request cap is lower than our budget — remember it.
      if (end > start && !byChapter[String(end)] && versesGot > 0) {
        try { localStorage.setItem(VS_LS_BLOCK_CAP_PFX + trans, String(Math.max(30, versesGot))); } catch {}
      }
      return _vsChapterFromMemory(trans, book, targetCh);
    } catch { return null; }
  })().finally(() => _vsChapterInFlight.delete(flightKey));
  _vsChapterInFlight.set(flightKey, p);
  return p;
}

// Public entry: memory → IndexedDB → block fetch. Resolves to the chapter's
// { verseNum: text } map, or null when unavailable (offline / over quota).
async function _vsEnsureChapter(trans, book, ch) {
  ch = String(ch);
  if (!VS_API_TRANSLATIONS.includes(trans)) return null;
  const mem = _vsChapterFromMemory(trans, book, ch);
  if (mem) return mem;
  const stored = await _vsDbGet(_vsChapterKey(trans, book, ch));
  if (stored) { _vsSeedChapter(trans, book, ch, stored); return stored; }
  return _vsFetchChapterBlock(trans, book, ch);
}
