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
const VS_TRANSLATIONS = ['MSB', 'BSB', 'NIV', 'NKJV', 'NASB'];

const VS_TRANS_LABELS = {
  MSB: 'MSB', BSB: 'BSB', NIV: 'NIV', NKJV: 'NKJV', NASB: 'NASB'
};

// ── State ─────────────────────────────────────────────────────────────────────
let _vsBook        = 'JOH';
let _vsChapter     = '3';
let _vsVerse       = '16';
let _vsTranslation = 'MSB';
let _vsPickerTesta = 'NT';
let _vsHlOn        = false;
let _vsPosActive   = new Set();

// api.bible Bible-ID cache
let _vsBibleIds       = null;
let _vsBibleIdsFetch  = null;

// Verse text cache: "TRANS|BOOK|CH|V" → text
const _vsTextCache = new Map();

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

// ── api.bible Integration ─────────────────────────────────────────────────────
async function _vsGetBibleIds() {
  if (_vsBibleIds) return _vsBibleIds;
  if (_vsBibleIdsFetch) return _vsBibleIdsFetch;

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

  const ids     = await _vsGetBibleIds();
  const bibleId = ids[trans];
  if (!bibleId) return null;

  const verseId = `${_vsApiCode(book)}.${ch}.${v}`;
  const url     = `${VS_API_BASE}/bibles/${bibleId}/verses/${verseId}` +
    `?content-type=text&include-notes=false&include-titles=false` +
    `&include-chapter-numbers=false&include-verse-numbers=false`;

  const r = await fetch(url, { headers: { 'api-key': VS_API_KEY } });
  if (!r.ok) return null;

  const { data } = await r.json();
  const text = (data?.content || '').trim().replace(/\s+/g, ' ');
  _vsTextCache.set(key, text);
  return text;
}

// ── POS Highlighting ──────────────────────────────────────────────────────────
function _vsNlp() {
  // _rhemaEnglishNlp is a top-level let in app.js, shared via the global lexical scope
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

  // Ensure local Bible data is loaded
  if (typeof loadRhemaScripts === 'function') {
    try { await loadRhemaScripts(); } catch { /* continue with API-only */ }
  }

  _vsSyncPills();
  _vsSyncTransRow();
  _vsRenderVerse();
  const bar = document.getElementById('vsHighlightBar');
  if (bar) bar.classList.toggle('hidden', !_vsHlOn);
}

function closeVerseStructure() {
  const modal = document.getElementById('verseStructureModal');
  if (!modal) return;
  modal.classList.remove('vs-active');
  setTimeout(() => modal.classList.add('hidden'), 320);
}

// ── Reference Pills ───────────────────────────────────────────────────────────
function _vsSyncPills() {
  const pb = document.getElementById('vsPillBook');
  if (pb) pb.textContent = _vsBookName(_vsBook);
  const pv = document.getElementById('vsPillVerse');
  if (pv) pv.textContent = `${_vsChapter}:${_vsVerse}`;
  const rv = document.getElementById('vsVerseRef');
  if (rv) rv.textContent = `${_vsBookName(_vsBook)} ${_vsChapter}:${_vsVerse}`;
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
  if (!_vsAllBooks().find(b => b.code === _vsBook && b.testament === t)) {
    const first = _vsAllBooks().find(b => b.testament === t);
    if (first) _vsBook = first.code;
  }
  _vsRenderBookList();
}

function vsPickBook(code) {
  _vsBook        = code;
  _vsPickerTesta = _vsAllBooks().find(b => b.code === code)?.testament || 'NT';
  _vsChapter     = '1';
  _vsVerse       = '1';
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
  const bData = _vsLocalData()[_vsBook] || {};
  const chs   = Object.keys(bData).sort((a, b) => +a - +b);
  if (!chs.includes(_vsChapter)) _vsChapter = chs[0] || '1';

  const cg = document.getElementById('vsChapterGrid');
  if (cg) {
    cg.innerHTML = chs.map(c =>
      `<button class="${c === _vsChapter ? 'active' : ''}" onclick="vsPickChapter('${c}')">${c}</button>`
    ).join('');
  }

  const vs = Object.keys(bData[_vsChapter] || {}).sort((a, b) => +a - +b);
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
  _vsVerse   = '1';
  _vsRenderVersePicker();
}

function vsPickVerse(v) {
  _vsVerse = v;
  closeVSVersePicker();
  _vsSyncPills();
  _vsRenderVerse();
}

// ── Translation Chips ─────────────────────────────────────────────────────────
function _vsSyncTransRow() {
  document.querySelectorAll('#vsTransRow .vs-trans-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.trans === _vsTranslation);
  });
}

function vsSelectTrans(t) {
  _vsTranslation = t;
  _vsSyncTransRow();
  _vsRenderVerse();
}

// ── Verse Display ─────────────────────────────────────────────────────────────
async function _vsRenderVerse() {
  const display = document.getElementById('vsVerseDisplay');
  const loading = document.getElementById('vsLoadingMsg');
  if (!display) return;

  if (VS_LOCAL_SET.has(_vsTranslation)) {
    const text = _vsLocalText(_vsTranslation, _vsBook, _vsChapter, _vsVerse);
    display.innerHTML = text
      ? `<div class="vs-verse-text">${_vsHighlightText(text)}</div>`
      : `<div class="vs-verse-empty">Verse not found in local data.</div>`;
    loading?.classList.add('hidden');
    display.classList.remove('hidden');
    return;
  }

  // API-backed translation
  display.classList.add('hidden');
  if (loading) { loading.textContent = `Loading ${_vsTranslation}…`; loading.classList.remove('hidden'); }

  try {
    const text = await _vsFetchVerse(_vsTranslation, _vsBook, _vsChapter, _vsVerse);
    if (loading) loading.classList.add('hidden');
    if (text) {
      display.innerHTML = `<div class="vs-verse-text">${_vsHighlightText(text)}</div>`;
    } else {
      display.innerHTML =
        `<div class="vs-error"><span class="material-symbols-outlined">info</span>Verse unavailable in ${_vsTranslation}.</div>`;
    }
    display.classList.remove('hidden');
  } catch {
    if (loading) loading.classList.add('hidden');
    display.innerHTML =
      `<div class="vs-error"><span class="material-symbols-outlined">wifi_off</span>Could not load verse. Check your connection.</div>`;
    display.classList.remove('hidden');
  }
}

// ── Verse Navigation ──────────────────────────────────────────────────────────
function vsNavVerse(dir) {
  const bData = _vsLocalData()[_vsBook] || {};
  const chs   = Object.keys(bData).sort((a, b) => +a - +b);
  const vs    = Object.keys(bData[_vsChapter] || {}).sort((a, b) => +a - +b);
  const vIdx  = vs.indexOf(String(_vsVerse));

  if (dir > 0) {
    if (vIdx < vs.length - 1) {
      _vsVerse = vs[vIdx + 1];
    } else {
      const cIdx = chs.indexOf(String(_vsChapter));
      if (cIdx < chs.length - 1) { _vsChapter = chs[cIdx + 1]; _vsVerse = '1'; }
    }
  } else {
    if (vIdx > 0) {
      _vsVerse = vs[vIdx - 1];
    } else {
      const cIdx = chs.indexOf(String(_vsChapter));
      if (cIdx > 0) {
        _vsChapter = chs[cIdx - 1];
        const prevVs = Object.keys(bData[_vsChapter] || {}).sort((a, b) => +a - +b);
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
  const btn = document.getElementById('vsHlToggleBtn');
  if (btn) btn.classList.toggle('vs-nav-active', _vsHlOn);

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
  if (_vsPosActive.has(cat)) { _vsPosActive.delete(cat); }
  else                       { _vsPosActive.add(cat);    }
  _vsRefreshHlBar();
  _vsRenderVerse();
}

function _vsRefreshHlBar() {
  document.querySelectorAll('#vsHighlightBar .rhema-hl-pill').forEach(btn => {
    btn.classList.toggle('hl-active', _vsPosActive.has(btn.dataset.cat));
  });
}

// ── Cross References ──────────────────────────────────────────────────────────
function openVSCrossReferences() {
  // Point rhema at the current VS reference then open cross-refs within it
  if (typeof _rhemaBook    !== 'undefined') _rhemaBook    = _vsBook;
  if (typeof _rhemaChapter !== 'undefined') _rhemaChapter = _vsChapter;
  if (typeof _rhemaVerse   !== 'undefined') _rhemaVerse   = _vsVerse;
  if (typeof syncRhemaPicker === 'function') syncRhemaPicker();
  if (typeof showRhema === 'function') {
    showRhema();
    setTimeout(() => {
      if (typeof openRhemaCrossReferences === 'function') openRhemaCrossReferences();
    }, 100);
  } else if (typeof openRhemaCrossReferences === 'function') {
    openRhemaCrossReferences();
  }
}
