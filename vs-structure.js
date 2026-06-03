// ══ VS Structure Workspace ════════════════════════════════════════════════════
// Free-canvas Scripture structure tool for the Verse Structure feature.

const VS_STRUCT_LS_PREFIX = 'vs_struct_';

// ── State ─────────────────────────────────────────────────────────────────────
let _vsStructBook        = 'JOH';
let _vsStructChapter     = '3';
let _vsStructVerseStart  = '16';
let _vsStructVerseEnd    = '16';
let _vsStructTranslation = 'MSB';
let _vsStructEditMode    = true;
let _vsStructWords       = [];   // flat array of word strings
let _vsStructSegments    = [];   // [{ id, startIdx, endIdx, x, y }]
let _vsStructHistory     = [];   // snapshots for undo
let _vsStructFuture      = [];   // snapshots for redo

// Long-press drag state
let _vsStructDragSeg     = null; // segment being dragged
let _vsStructDragOffX    = 0;
let _vsStructDragOffY    = 0;
let _vsStructLpTimer     = null;
let _vsStructLpWord      = null; // { segId, wordIdx }
let _vsStructLpEl        = null;
let _vsStructTouchStart  = null; // { x, y } of touchstart

// ── Storage helpers ──────────────────────────────────────────────────────────
function _vsStructKey(book, ch, vs, ve, trans) {
  return `${VS_STRUCT_LS_PREFIX}${book}_${ch}_${vs}_${ve}_${trans}`;
}

function _vsStructSaveLocal() {
  const key = _vsStructKey(_vsStructBook, _vsStructChapter, _vsStructVerseStart, _vsStructVerseEnd, _vsStructTranslation);
  const data = {
    id: key,
    bibleVersion: _vsStructTranslation,
    referenceStart: `${_vsStructBook} ${_vsStructChapter}:${_vsStructVerseStart}`,
    referenceEnd:   `${_vsStructBook} ${_vsStructChapter}:${_vsStructVerseEnd}`,
    originalWords: _vsStructWords,
    segments: _vsStructSegments,
    history: [],
    updatedAt: Date.now()
  };
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

function _vsStructLoadLocal() {
  const key = _vsStructKey(_vsStructBook, _vsStructChapter, _vsStructVerseStart, _vsStructVerseEnd, _vsStructTranslation);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

// ── Snapshot (undo/redo) ──────────────────────────────────────────────────────
function _vsStructSnapshot() {
  return JSON.parse(JSON.stringify(_vsStructSegments));
}

function _vsStructPushHistory() {
  _vsStructHistory.push(_vsStructSnapshot());
  if (_vsStructHistory.length > 60) _vsStructHistory.shift();
  _vsStructFuture = [];
  _vsStructSyncUndoRedo();
}

function _vsStructSyncUndoRedo() {
  const u = document.getElementById('vsStructUndoBtn');
  const r = document.getElementById('vsStructRedoBtn');
  if (u) u.disabled = _vsStructHistory.length === 0;
  if (r) r.disabled = _vsStructFuture.length === 0;
}

function vsStructUndo() {
  if (!_vsStructHistory.length) return;
  _vsStructFuture.push(_vsStructSnapshot());
  _vsStructSegments = _vsStructHistory.pop();
  _vsStructSyncUndoRedo();
  _vsStructRender();
  _vsStructSaveLocal();
}

function vsStructRedo() {
  if (!_vsStructFuture.length) return;
  _vsStructHistory.push(_vsStructSnapshot());
  _vsStructSegments = _vsStructFuture.pop();
  _vsStructSyncUndoRedo();
  _vsStructRender();
  _vsStructSaveLocal();
}

function vsStructReset() {
  _vsStructPushHistory();
  _vsStructSegments = _vsStructDefaultLayout(_vsStructWords);
  _vsStructRender();
  _vsStructSaveLocal();
}

// ── Default layout ────────────────────────────────────────────────────────────
function _vsStructDefaultLayout(words) {
  // One segment per verse (split at verse boundaries using ___ markers if present)
  // or one segment per ~8 words if no markers
  const segments = [];
  let id = 0;

  // Find verse boundaries (marked by _VERSE_N_ tokens inserted during load)
  const verseSegs = [];
  let segStart = 0;
  for (let i = 0; i <= words.length; i++) {
    const isMarker = i < words.length && /^_VERSE_\d+_$/.test(words[i]);
    const isEnd = i === words.length;
    if ((isMarker || isEnd) && i > segStart) {
      verseSegs.push({ startIdx: segStart, endIdx: i - 1 });
      segStart = i + 1; // skip marker
    } else if (isMarker) {
      segStart = i + 1;
    }
  }

  if (!verseSegs.length) {
    // No markers — chunk every 8 words
    const CHUNK = 8;
    for (let i = 0; i < words.length; i += CHUNK) {
      verseSegs.push({ startIdx: i, endIdx: Math.min(i + CHUNK - 1, words.length - 1) });
    }
  }

  const COLS = 2;
  const COL_W = 340;
  const ROW_H = 90;
  verseSegs.forEach((seg, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    segments.push({
      id: id++,
      startIdx: seg.startIdx,
      endIdx: seg.endIdx,
      x: 20 + col * (COL_W + 20),
      y: 20 + row * ROW_H
    });
  });
  return segments;
}

// ── Word loading ──────────────────────────────────────────────────────────────
async function _vsStructLoadWords() {
  const book  = _vsStructBook;
  const ch    = _vsStructChapter;
  const vs    = parseInt(_vsStructVerseStart, 10);
  const ve    = parseInt(_vsStructVerseEnd,   10);
  const trans = _vsStructTranslation;

  const words = [];
  for (let v = vs; v <= ve; v++) {
    let text = '';
    if (trans === 'MSB' || trans === 'BSB') {
      const src = trans === 'BSB' ? window.RhemaBSB : window.RhemaMSB;
      text = src?.[book]?.[String(ch)]?.[String(v)] || '';
    } else {
      // Try VS cache first
      const cacheKey = `${trans}|${book}|${ch}|${v}`;
      if (_vsTextCache?.has(cacheKey)) {
        text = _vsTextCache.get(cacheKey);
      } else if (typeof _vsFetchVerse === 'function') {
        text = (await _vsFetchVerse(trans, book, ch, v)) || '';
      }
    }
    if (!text) continue;
    // Tokenize: split on whitespace, keep punctuation attached
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    if (ve > vs) {
      // Insert verse boundary marker
      words.push(`_VERSE_${v}_`);
    }
    words.push(...tokens);
  }
  return words;
}

// ── Picker ────────────────────────────────────────────────────────────────────
function openVSStructurePicker() {
  // Inherit current VS selection
  if (typeof _vsBook !== 'undefined')        _vsStructBook        = _vsBook;
  if (typeof _vsChapter !== 'undefined')     _vsStructChapter     = _vsChapter;
  if (typeof _vsVerse !== 'undefined')       _vsStructVerseStart  = _vsVerse;
  _vsStructVerseEnd    = _vsStructVerseStart;
  if (typeof _vsTranslation !== 'undefined') _vsStructTranslation = _vsTranslation;

  _vsStructPopulatePicker();
  const modal = document.getElementById('vsStructPickerModal');
  if (modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('open'));
  }
}

function closeVSStructPicker() {
  const modal = document.getElementById('vsStructPickerModal');
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => { modal.style.display = ''; }, 240);
}

function _vsStructPopulatePicker() {
  const bookSel = document.getElementById('vsStructPickerBook');
  if (!bookSel) return;

  const books = (window.RhemaEnglishBooks || []);
  bookSel.innerHTML = books.map(b => `<option value="${b.code}"${b.code === _vsStructBook ? ' selected' : ''}>${b.name}</option>`).join('');
  vsStructPickerUpdateChapters();
}

function vsStructPickerUpdateChapters() {
  const bookSel = document.getElementById('vsStructPickerBook');
  const chSel   = document.getElementById('vsStructPickerChapter');
  if (!bookSel || !chSel) return;
  _vsStructBook = bookSel.value;

  const localData = (window.RhemaMSB || window.RhemaBSB || {});
  const chapters  = Object.keys(localData[_vsStructBook] || {}).sort((a, b) => +a - +b);
  chSel.innerHTML = chapters.map(c => `<option${c === _vsStructChapter ? ' selected' : ''}>${c}</option>`).join('');
  vsStructPickerUpdateVerses();
}

function vsStructPickerUpdateVerses() {
  const chSel  = document.getElementById('vsStructPickerChapter');
  const vsSel  = document.getElementById('vsStructPickerVerseStart');
  const veSel  = document.getElementById('vsStructPickerVerseEnd');
  if (!chSel || !vsSel || !veSel) return;
  _vsStructChapter = chSel.value;

  const localData = (window.RhemaMSB || window.RhemaBSB || {});
  const verses    = Object.keys(localData[_vsStructBook]?.[_vsStructChapter] || {}).sort((a, b) => +a - +b);
  const opts = verses.map(v => `<option${v === _vsStructVerseStart ? ' selected' : ''}>${v}</option>`).join('');
  vsSel.innerHTML = opts;
  veSel.innerHTML = verses.map(v => `<option${v === _vsStructVerseEnd ? ' selected' : ''}>${v}</option>`).join('');
}

async function openVSStructureWorkspace() {
  const bookSel = document.getElementById('vsStructPickerBook');
  const chSel   = document.getElementById('vsStructPickerChapter');
  const vsSel   = document.getElementById('vsStructPickerVerseStart');
  const veSel   = document.getElementById('vsStructPickerVerseEnd');
  if (bookSel) _vsStructBook        = bookSel.value;
  if (chSel)   _vsStructChapter     = chSel.value;
  if (vsSel)   _vsStructVerseStart  = vsSel.value;
  if (veSel)   _vsStructVerseEnd    = veSel.value;
  // Ensure end >= start
  if (+_vsStructVerseEnd < +_vsStructVerseStart) _vsStructVerseEnd = _vsStructVerseStart;

  closeVSStructPicker();

  // Show workspace
  const modal = document.getElementById('vsStructModal');
  if (!modal) return;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('open'));

  // Update title
  const titleEl = document.getElementById('vsStructTitle');
  const bookName = (window.RhemaEnglishBooks || []).find(b => b.code === _vsStructBook)?.name || _vsStructBook;
  const rangeLabel = _vsStructVerseStart === _vsStructVerseEnd
    ? `${bookName} ${_vsStructChapter}:${_vsStructVerseStart}`
    : `${bookName} ${_vsStructChapter}:${_vsStructVerseStart}–${_vsStructVerseEnd}`;
  if (titleEl) titleEl.textContent = rangeLabel;

  // Sync edit bar
  _vsStructSyncEditBar();

  // Try to restore saved layout
  const saved = _vsStructLoadLocal();
  if (saved?.segments?.length && saved?.originalWords?.length) {
    _vsStructWords    = saved.originalWords;
    _vsStructSegments = saved.segments;
    _vsStructHistory  = [];
    _vsStructFuture   = [];
    _vsStructSyncUndoRedo();
    _vsStructRender();
    return;
  }

  // Load words fresh
  const canvas = document.getElementById('vsStructCanvas');
  if (canvas) canvas.innerHTML = '<p style="padding:20px;color:var(--muted-color);font-size:0.9rem;">Loading…</p>';
  _vsStructWords    = await _vsStructLoadWords();
  _vsStructSegments = _vsStructDefaultLayout(_vsStructWords);
  _vsStructHistory  = [];
  _vsStructFuture   = [];
  _vsStructSyncUndoRedo();
  _vsStructRender();
}

function closeVSStructureWorkspace() {
  if (_vsStructWords.length) _vsStructSaveLocal();
  vsStructUpdateCabinetBadge();
  const modal = document.getElementById('vsStructModal');
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => { modal.style.display = ''; }, 340);
}

// ── Edit mode ─────────────────────────────────────────────────────────────────
function toggleVSStructEdit() {
  _vsStructEditMode = !_vsStructEditMode;
  _vsStructSyncEditBar();
  _vsStructRender();
}

function _vsStructSyncEditBar() {
  const bar = document.getElementById('vsStructEditBar');
  const btn = document.getElementById('vsStructEditBtn');
  if (bar) bar.classList.toggle('visible', _vsStructEditMode);
  if (btn) btn.classList.toggle('active', _vsStructEditMode);
  const canvas = document.getElementById('vsStructCanvas');
  if (canvas) canvas.classList.toggle('edit-mode', _vsStructEditMode);
}

// ── Save ──────────────────────────────────────────────────────────────────────
function vsStructSave() {
  _vsStructSaveLocal();
  // Firebase sync if signed in
  if (typeof firebase !== 'undefined' && firebase.auth?.().currentUser) {
    const uid = firebase.auth().currentUser.uid;
    const key = _vsStructKey(_vsStructBook, _vsStructChapter, _vsStructVerseStart, _vsStructVerseEnd, _vsStructTranslation);
    const data = {
      id: key,
      bibleVersion: _vsStructTranslation,
      referenceStart: `${_vsStructBook} ${_vsStructChapter}:${_vsStructVerseStart}`,
      referenceEnd:   `${_vsStructBook} ${_vsStructChapter}:${_vsStructVerseEnd}`,
      originalWords: _vsStructWords,
      segments: _vsStructSegments,
      history: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp?.() || Date.now(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp?.() || Date.now()
    };
    firebase.firestore?.()
      .collection('users').doc(uid)
      .collection('structureLayouts').doc(key)
      .set(data, { merge: true })
      .catch(() => {});
  }

  // Flash save button
  const btn = document.getElementById('vsStructSaveBtn');
  if (btn) {
    btn.style.color = 'var(--secondary-color)';
    setTimeout(() => { btn.style.color = ''; }, 800);
  }
  vsStructUpdateCabinetBadge();
}

// ── Info ──────────────────────────────────────────────────────────────────────
function openVSStructInfo() {
  const modal = document.getElementById('vsStructInfoModal');
  if (!modal) return;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('open'));
}

function closeVSStructInfo() {
  const modal = document.getElementById('vsStructInfoModal');
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => { modal.style.display = ''; }, 240);
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function _vsStructRender() {
  const canvas = document.getElementById('vsStructCanvas');
  if (!canvas) return;
  canvas.innerHTML = '';
  canvas.classList.toggle('edit-mode', _vsStructEditMode);

  _vsStructSegments.forEach(seg => {
    const words = _vsStructWords.slice(seg.startIdx, seg.endIdx + 1).filter(w => !/^_VERSE_\d+_$/.test(w));
    if (!words.length) return;

    const div = document.createElement('div');
    div.className = 'vs-struct-seg' + (_vsStructEditMode ? ' edit-mode' : '');
    div.dataset.segId = seg.id;
    div.style.left = seg.x + 'px';
    div.style.top  = seg.y + 'px';

    words.forEach((word, wIdx) => {
      const span = document.createElement('span');
      span.className = 'vs-struct-word';
      span.textContent = word;
      // The absolute word index into _vsStructWords (skip markers)
      const absIdx = _vsStructAbsIdx(seg, wIdx);
      span.dataset.absIdx = absIdx;

      if (_vsStructEditMode) {
        span.addEventListener('touchstart', _vsStructWordTouchStart, { passive: true });
        span.addEventListener('touchmove',  _vsStructWordTouchMove,  { passive: true });
        span.addEventListener('touchend',   _vsStructWordTouchEnd,   { passive: false });
      }
      div.appendChild(span);
    });

    if (_vsStructEditMode) {
      div.addEventListener('touchstart', _vsStructSegTouchStart, { passive: true });
      div.addEventListener('touchmove',  _vsStructSegTouchMove,  { passive: false });
      div.addEventListener('touchend',   _vsStructSegTouchEnd,   { passive: true });
    }

    canvas.appendChild(div);
  });
}

// Given a segment and a within-segment word index (skipping markers), returns the absolute index in _vsStructWords
function _vsStructAbsIdx(seg, withinIdx) {
  let count = 0;
  for (let i = seg.startIdx; i <= seg.endIdx; i++) {
    if (/^_VERSE_\d+_$/.test(_vsStructWords[i])) continue;
    if (count === withinIdx) return i;
    count++;
  }
  return seg.startIdx + withinIdx;
}

// ── Long-press split interaction ──────────────────────────────────────────────
function _vsStructWordTouchStart(e) {
  if (!_vsStructEditMode) return;
  const touch = e.touches[0];
  _vsStructTouchStart = { x: touch.clientX, y: touch.clientY };
  const span   = e.currentTarget;
  const absIdx = parseInt(span.dataset.absIdx, 10);
  const segEl  = span.closest('.vs-struct-seg');
  if (!segEl) return;
  const segId  = parseInt(segEl.dataset.segId, 10);

  _vsStructLpWord = { segId, absIdx };
  _vsStructLpEl   = span;
  span.classList.add('long-press-active');

  _vsStructLpTimer = setTimeout(() => {
    _vsStructLpTimer = null;
    _vsStructSplitAndBeginDrag(segId, absIdx, touch.clientX, touch.clientY);
  }, 300);
}

function _vsStructWordTouchMove(e) {
  if (!_vsStructLpTimer && !_vsStructDragSeg) return;
  const touch = e.touches[0];
  const dx = Math.abs(touch.clientX - (_vsStructTouchStart?.x || 0));
  const dy = Math.abs(touch.clientY - (_vsStructTouchStart?.y || 0));
  if ((dx > 8 || dy > 8) && _vsStructLpTimer) {
    // User scrolled — cancel long press
    clearTimeout(_vsStructLpTimer);
    _vsStructLpTimer = null;
    if (_vsStructLpEl) _vsStructLpEl.classList.remove('long-press-active');
    _vsStructLpEl = null;
  }
}

function _vsStructWordTouchEnd(e) {
  if (_vsStructLpTimer) {
    clearTimeout(_vsStructLpTimer);
    _vsStructLpTimer = null;
  }
  if (_vsStructLpEl) {
    _vsStructLpEl.classList.remove('long-press-active');
    _vsStructLpEl = null;
  }
}

function _vsStructSplitAndBeginDrag(segId, splitAbsIdx, touchX, touchY) {
  const seg = _vsStructSegments.find(s => s.id === segId);
  if (!seg) return;

  _vsStructPushHistory();

  const canvas  = document.getElementById('vsStructCanvas');
  const wrap    = document.getElementById('vsStructCanvasWrap');
  if (!canvas || !wrap) return;
  const wrapRect = wrap.getBoundingClientRect();

  let newSeg;
  if (splitAbsIdx === seg.startIdx) {
    // Drag the whole segment
    newSeg = seg;
  } else {
    // Split: shorten seg, create new
    const prevEnd = seg.endIdx;
    seg.endIdx    = splitAbsIdx - 1;
    const maxId   = _vsStructSegments.reduce((m, s) => Math.max(m, s.id), 0);
    newSeg = {
      id: maxId + 1,
      startIdx: splitAbsIdx,
      endIdx: prevEnd,
      x: seg.x + 20,
      y: seg.y + 60
    };
    _vsStructSegments.push(newSeg);
    _vsStructRender();
  }

  // Begin drag
  const segEl = document.querySelector(`[data-seg-id="${newSeg.id}"]`);
  if (!segEl) return;
  const rect = segEl.getBoundingClientRect();
  _vsStructDragSeg  = newSeg;
  _vsStructDragOffX = touchX - rect.left + wrapRect.left + wrap.scrollLeft;
  _vsStructDragOffY = touchY - rect.top  + wrapRect.top  + wrap.scrollTop;
  segEl.classList.add('dragging');

  // Attach move/end to window
  window.addEventListener('touchmove', _vsStructDragMove, { passive: false });
  window.addEventListener('touchend',  _vsStructDragEnd,  { passive: true });
}

// ── Segment drag ───────────────────────────────────────────────────────────────
function _vsStructSegTouchStart(e) {
  if (!_vsStructEditMode) return;
  // Only start segment drag if touch is directly on the segment background (not a word span)
  if (e.target.classList.contains('vs-struct-word')) return;
  const touch  = e.touches[0];
  const segEl  = e.currentTarget;
  const segId  = parseInt(segEl.dataset.segId, 10);
  const seg    = _vsStructSegments.find(s => s.id === segId);
  if (!seg) return;
  const wrap   = document.getElementById('vsStructCanvasWrap');
  if (!wrap) return;
  const wrapRect = wrap.getBoundingClientRect();
  const rect     = segEl.getBoundingClientRect();
  _vsStructDragSeg  = seg;
  _vsStructDragOffX = touch.clientX - rect.left + wrapRect.left + wrap.scrollLeft;
  _vsStructDragOffY = touch.clientY - rect.top  + wrapRect.top  + wrap.scrollTop;
  segEl.classList.add('dragging');
  window.addEventListener('touchmove', _vsStructDragMove, { passive: false });
  window.addEventListener('touchend',  _vsStructDragEnd,  { passive: true });
}

function _vsStructSegTouchMove(e) {
  // Prevent canvas scroll while dragging segment background
  if (_vsStructDragSeg && !e.target.classList.contains('vs-struct-word')) {
    e.preventDefault();
  }
}

function _vsStructSegTouchEnd() {}

function _vsStructDragMove(e) {
  if (!_vsStructDragSeg) return;
  e.preventDefault();
  const touch = e.touches[0];
  const wrap  = document.getElementById('vsStructCanvasWrap');
  if (!wrap) return;
  const wrapRect = wrap.getBoundingClientRect();
  const newX = touch.clientX - wrapRect.left + wrap.scrollLeft - _vsStructDragOffX;
  const newY = touch.clientY - wrapRect.top  + wrap.scrollTop  - _vsStructDragOffY;
  _vsStructDragSeg.x = Math.max(0, newX);
  _vsStructDragSeg.y = Math.max(0, newY);
  const segEl = document.querySelector(`[data-seg-id="${_vsStructDragSeg.id}"]`);
  if (segEl) {
    segEl.style.left = _vsStructDragSeg.x + 'px';
    segEl.style.top  = _vsStructDragSeg.y + 'px';
  }
}

function _vsStructDragEnd() {
  window.removeEventListener('touchmove', _vsStructDragMove);
  window.removeEventListener('touchend',  _vsStructDragEnd);
  if (!_vsStructDragSeg) return;
  const segEl = document.querySelector(`[data-seg-id="${_vsStructDragSeg.id}"]`);
  if (segEl) segEl.classList.remove('dragging');
  _vsStructDragSeg = null;
  _vsStructSaveLocal();
}

// ── Saved Structures Browser ──────────────────────────────────────────────────
function _vsStructAllSaved() {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(VS_STRUCT_LS_PREFIX)) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data?.segments?.length) results.push(data);
    } catch {}
  }
  results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return results;
}

function _vsStructFormatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function _vsStructBibleLabel(v) {
  return v || 'MSB';
}

function openVSStructureBrowser() {
  const modal = document.getElementById('vsStructBrowserModal');
  if (!modal) return;
  _vsStructRenderBrowserList();
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('open'));
}

function closeVSStructureBrowser() {
  const modal = document.getElementById('vsStructBrowserModal');
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => { modal.style.display = ''; }, 240);
}

function _vsStructRenderBrowserList() {
  const list = document.getElementById('vsStructBrowserList');
  if (!list) return;
  const saved = _vsStructAllSaved();
  if (!saved.length) {
    list.innerHTML = `<div class="vs-struct-browser-empty">
      <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;margin-bottom:10px;color:var(--secondary-color)">folder_open</span>
      No saved structures yet.<br>Open a passage from the Structure tool and save it.
    </div>`;
    return;
  }
  list.innerHTML = saved.map((data, idx) => {
    const refLabel = data.referenceStart === data.referenceEnd
      ? data.referenceStart
      : `${data.referenceStart} – ${data.referenceEnd}`;
    const bookName = (window.RhemaEnglishBooks || []).find(b => data.referenceStart?.startsWith(b.code))?.name || '';
    const displayRef = bookName
      ? refLabel.replace(data.referenceStart.split(' ')[0], bookName)
      : refLabel;
    return `<button class="vs-struct-browser-item" onclick="vsStructBrowserOpen(${idx})">
      <span class="vs-struct-browser-item-icon material-symbols-outlined">layers</span>
      <span class="vs-struct-browser-item-copy">
        <span class="vs-struct-browser-item-ref">${displayRef}</span>
        <span class="vs-struct-browser-item-meta">${_vsStructBibleLabel(data.bibleVersion)} · ${data.segments?.length || 0} segments · ${_vsStructFormatDate(data.updatedAt)}</span>
      </span>
      <span class="vs-struct-browser-item-arrow material-symbols-outlined">chevron_right</span>
    </button>`;
  }).join('');
  // Store refs for click handler
  list._savedData = saved;
}

function vsStructBrowserOpen(idx) {
  const list = document.getElementById('vsStructBrowserList');
  const saved = list?._savedData;
  if (!saved?.[idx]) return;
  const data = saved[idx];

  closeVSStructureBrowser();

  // Parse stored ref: "JOH 3:16"
  const parseRef = ref => {
    const m = String(ref || '').match(/^(\S+)\s+(\d+):(\d+)$/);
    return m ? { book: m[1], chapter: m[2], verse: m[3] } : null;
  };
  const start = parseRef(data.referenceStart);
  const end   = parseRef(data.referenceEnd);
  if (!start) return;

  _vsStructBook        = start.book;
  _vsStructChapter     = start.chapter;
  _vsStructVerseStart  = start.verse;
  _vsStructVerseEnd    = end?.verse || start.verse;
  _vsStructTranslation = data.bibleVersion || 'MSB';
  _vsStructWords       = data.originalWords || [];
  _vsStructSegments    = data.segments || [];
  _vsStructHistory     = [];
  _vsStructFuture      = [];

  // Open workspace directly (skip picker)
  const modal = document.getElementById('vsStructModal');
  if (!modal) return;
  const titleEl = document.getElementById('vsStructTitle');
  const books   = window.RhemaEnglishBooks || [];
  const bName   = books.find(b => b.code === _vsStructBook)?.name || _vsStructBook;
  const rangeLabel = _vsStructVerseStart === _vsStructVerseEnd
    ? `${bName} ${_vsStructChapter}:${_vsStructVerseStart}`
    : `${bName} ${_vsStructChapter}:${_vsStructVerseStart}–${_vsStructVerseEnd}`;
  if (titleEl) titleEl.textContent = rangeLabel;
  _vsStructSyncEditBar();
  _vsStructSyncUndoRedo();

  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('open'));
  _vsStructRender();
}

function vsStructUpdateCabinetBadge() {
  const badge = document.getElementById('vsCabinetBadge');
  if (!badge) return;
  const count = _vsStructAllSaved().length;
  badge.classList.toggle('visible', count > 0);
}
