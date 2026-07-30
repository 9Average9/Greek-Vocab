// ══ VS Structure Workspace ════════════════════════════════════════════════════
// Free-canvas Scripture structure tool for the Verse Structure feature.

const VS_STRUCT_LS_PREFIX = 'vs_struct_';

// ── State ─────────────────────────────────────────────────────────────────────
let _vsStructBook        = 'JOH';
let _vsStructChapter     = '3';
let _vsStructVerseStart  = '16';
let _vsStructVerseEnd    = '16';
let _vsStructTranslation = 'MSB';
let _vsStructName        = '';   // user-given name for this structure
let _vsStructCurrentKey  = null; // unique localStorage key for the open structure
let _vsStructEditMode    = true;
let _vsStructWords       = [];   // flat array of word strings
let _vsStructSegments    = [];   // [{ id, startIdx, endIdx, x, y }]
let _vsStructHistory     = [];   // snapshots for undo
let _vsStructFuture      = [];   // snapshots for redo
let _vsStructPickerContext = null;
let _vsStructStudyContext  = null;

// Long-press drag state
let _vsStructDragSeg     = null; // segment being dragged
let _vsStructDragEl      = null; // cached DOM element for active drag
let _vsStructDragWrap    = null; // cached wrap element
let _vsStructDragWrapX   = 0;   // cached wrapRect.left
let _vsStructDragWrapY   = 0;   // cached wrapRect.top
let _vsStructDragOffX    = 0;
let _vsStructDragOffY    = 0;
let _vsStructDragRaf     = null; // rAF handle for throttled position updates
let _vsStructDragPendX   = 0;
let _vsStructDragPendY   = 0;
let _vsStructDragNeedsRender = false;
let _vsStructLpTimer     = null;
let _vsStructLpWord      = null; // { segId, wordIdx }
let _vsStructLpEl        = null;
let _vsStructTouchStart  = null; // { x, y } of touchstart
let _vsStructTouchCurrent = null;
let _vsStructIgnoreCancelUntil = 0;

// ── Storage helpers ──────────────────────────────────────────────────────────
function _vsStructNewKey() {
  return `${VS_STRUCT_LS_PREFIX}${Date.now()}`;
}

function _vsStructCurrentData() {
  const data = {
    id: _vsStructCurrentKey,
    name: _vsStructName,
    bibleVersion: _vsStructTranslation,
    referenceStart: `${_vsStructBook} ${_vsStructChapter}:${_vsStructVerseStart}`,
    referenceEnd:   `${_vsStructBook} ${_vsStructChapter}:${_vsStructVerseEnd}`,
    originalWords: _vsStructWords,
    segments: _vsStructSegments,
    history: [],
    createdAt: _vsStructCurrentKey.replace(VS_STRUCT_LS_PREFIX, '') | 0,
    updatedAt: Date.now()
  };
  return data;
}

function _vsStructSaveLocal() {
  if (!_vsStructCurrentKey) return;
  const data = _vsStructCurrentData();
  if (!_vsStructStudyContext?.studyOnly) {
    try { localStorage.setItem(_vsStructCurrentKey, JSON.stringify(data)); } catch {}
  }
  _vsStructSaveStudyContext(data);
}

function _vsStructSaveStudyContext(data) {
  const ctx = _vsStructStudyContext;
  if (!ctx?.studyId || !window.Studies?.saveStructure) return;
  const user = window.Auth?.getCurrentUser?.();
  if (!user) return;
  if (!ctx.structureId) ctx.structureId = data.id || _vsStructCurrentKey || _vsStructNewKey();
  const displayName = localStorage.getItem('authDisplayName') || localStorage.getItem('authUsername') || 'Anonymous';
  window.Studies.saveStructure(ctx.studyId, user.uid, displayName, data, ctx.structureId)
    .then(id => {
      if (id && _vsStructStudyContext?.studyId === ctx.studyId) _vsStructStudyContext.structureId = id;
    })
    .catch(() => {});
}

function _vsStructRefLabel(data = _vsStructCurrentData()) {
  const start = data.referenceStart || '';
  const end = data.referenceEnd || start;
  return start === end ? start : `${start} - ${end}`;
}

function _vsStructFlashSaveBtn() {
  const btn = document.getElementById('vsStructSaveBtn');
  if (btn) {
    btn.style.color = 'var(--secondary-color)';
    setTimeout(() => { btn.style.color = ''; }, 800);
  }
}

function _vsStructCancelLongPress() {
  if (_vsStructLpTimer) {
    clearTimeout(_vsStructLpTimer);
    _vsStructLpTimer = null;
  }
  if (_vsStructLpEl) _vsStructLpEl.classList.remove('long-press-active');
  _vsStructLpEl = null;
}

function _vsStructResetSessionState() {
  _vsStructWords    = [];
  _vsStructSegments = [];
  _vsStructHistory  = [];
  _vsStructFuture   = [];
  _vsStructCancelLongPress();
  _vsStructTouchStart = null;
  _vsStructTouchCurrent = null;
}

function _vsStructStackInitialLayout() {
  requestAnimationFrame(() => {
    let nextY = 20;
    let changed = false;
    [..._vsStructSegments]
      .sort((a, b) => a.y - b.y)
      .forEach(seg => {
        const el = document.querySelector(`[data-seg-id="${seg.id}"]`);
        if (!el) return;
        if (seg.y < nextY) {
          seg.y = nextY;
          el.style.top = seg.y + 'px';
          changed = true;
        }
        nextY = seg.y + el.offsetHeight + 34;
      });
    const canvas = document.getElementById('vsStructCanvas');
    if (canvas) canvas.style.height = Math.max(2000, nextY + 220) + 'px';
    if (changed) _vsStructSaveLocal();
  });
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

  let nextY = 20;
  verseSegs.forEach((seg) => {
    const visibleWords = words.slice(seg.startIdx, seg.endIdx + 1)
      .filter(w => !/^_VERSE_\d+_$/.test(w)).length;
    segments.push({
      id: id++,
      startIdx: seg.startIdx,
      endIdx: seg.endIdx,
      x: 20,
      y: nextY
    });
    nextY += Math.max(138, Math.ceil(visibleWords / 6) * 42 + 70);
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
function openVSStructurePicker(context = null) {
  _vsStructPickerContext = context || null;
  // Inherit current VS selection
  if (typeof _vsBook !== 'undefined')        _vsStructBook        = _vsBook;
  if (typeof _vsChapter !== 'undefined')     _vsStructChapter     = _vsChapter;
  if (typeof _vsVerse !== 'undefined')       _vsStructVerseStart  = _vsVerse;
  _vsStructVerseEnd    = _vsStructVerseStart;
  if (typeof _vsTranslation !== 'undefined') _vsStructTranslation = _vsTranslation;

  // When opened from a study reader, default to that passage and — importantly —
  // the reader's selected translation, so phrasing is saved in it.
  if (context) {
    if (context.book)        _vsStructBook        = context.book;
    if (context.chapter)   { _vsStructChapter     = String(context.chapter); }
    if (context.verse)     { _vsStructVerseStart  = String(context.verse); _vsStructVerseEnd = String(context.verse); }
    if (context.translation) _vsStructTranslation = context.translation;
  }

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
  const bookSel  = document.getElementById('vsStructPickerBook');
  const chSel    = document.getElementById('vsStructPickerChapter');
  const vsSel    = document.getElementById('vsStructPickerVerseStart');
  const veSel    = document.getElementById('vsStructPickerVerseEnd');
  const nameInp  = document.getElementById('vsStructPickerName');
  if (bookSel) _vsStructBook        = bookSel.value;
  if (chSel)   _vsStructChapter     = chSel.value;
  if (vsSel)   _vsStructVerseStart  = vsSel.value;
  if (veSel)   _vsStructVerseEnd    = veSel.value;
  if (nameInp) _vsStructName        = nameInp.value.trim();
  if (+_vsStructVerseEnd < +_vsStructVerseStart) _vsStructVerseEnd = _vsStructVerseStart;

  _vsStructStudyContext = _vsStructPickerContext?.studyId
    ? { studyId: _vsStructPickerContext.studyId, structureId: null, studyOnly: true, returnToStudy: true }
    : null;

  // Always create a brand-new entry
  _vsStructCurrentKey = _vsStructNewKey();

  closeVSStructPicker();
  if (nameInp) nameInp.value = '';

  _vsStructResetSessionState();

  _vsStructOpenWorkspaceModal();

  // Load words fresh
  const canvas = document.getElementById('vsStructCanvas');
  if (canvas) canvas.innerHTML = '<p style="padding:20px;color:var(--muted-color);font-size:0.9rem;">Loading…</p>';
  _vsStructWords    = await _vsStructLoadWords();
  _vsStructSegments = _vsStructDefaultLayout(_vsStructWords);
  _vsStructSyncUndoRedo();
  _vsStructRender();
  _vsStructStackInitialLayout();
  _vsStructSaveLocal();
  _vsStructPickerContext = null;
}

function openVSStructureFromData(data, context = null) {
  if (!data) return;
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
  _vsStructName        = data.name || '';
  _vsStructCurrentKey  = data.id || _vsStructNewKey();
  _vsStructWords       = data.originalWords || [];
  _vsStructSegments    = data.segments || [];
  _vsStructHistory     = [];
  _vsStructFuture      = [];
  _vsStructStudyContext = context?.studyId
    ? { studyId: context.studyId, structureId: context.structureId || data.id || null, studyOnly: !!context.studyOnly, returnToStudy: !!context.returnToStudy }
    : null;
  _vsStructOpenWorkspaceModal();
  _vsStructRender();
}

function _vsStructOpenWorkspaceModal() {
  const modal = document.getElementById('vsStructModal');
  if (!modal) return;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('open'));

  const titleEl  = document.getElementById('vsStructTitle');
  const bookName = (window.RhemaEnglishBooks || []).find(b => b.code === _vsStructBook)?.name || _vsStructBook;
  const refLabel = _vsStructVerseStart === _vsStructVerseEnd
    ? `${bookName} ${_vsStructChapter}:${_vsStructVerseStart}`
    : `${bookName} ${_vsStructChapter}:${_vsStructVerseStart}–${_vsStructVerseEnd}`;
  if (titleEl) titleEl.textContent = _vsStructName || refLabel;

  _vsStructSyncEditBar();
  _vsStructSyncUndoRedo();
}

function closeVSStructureWorkspace() {
  if (_vsStructWords.length) _vsStructSaveLocal();
  vsStructUpdateCabinetBadge();
  const modal = document.getElementById('vsStructModal');
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => {
    modal.style.display = 'none';
    if (_vsStructStudyContext?.returnToStudy) {
      if (typeof switchSandboxTab === 'function') switchSandboxTab('verses');
      if (typeof switchStudyVerseTab === 'function') switchStudyVerseTab('structured');
    }
  }, 340);
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
  openVSStructStudySave();
  _vsStructFlashSaveBtn();
  vsStructUpdateCabinetBadge();
}

async function openVSStructStudySave() {
  const modal = document.getElementById('vsStructStudySaveModal');
  const list = document.getElementById('vsStructStudySaveList');
  if (!modal || !list) return;
  const user = window.Auth?.getCurrentUser?.();
  if (!user) {
    alert('Sign in to save this structure into a study.');
    return;
  }
  list.innerHTML = '<div class="vs-struct-study-empty">Loading studies...</div>';
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('open'));
  const studies = await window.Studies?.getMine?.(user.uid).catch(() => []);
  if (!studies?.length) {
    list.innerHTML = '<div class="vs-struct-study-empty">No studies yet. Create a study first, then save this structure into it.</div>';
    return;
  }
  list.innerHTML = studies.map(study => `
    <label class="vs-struct-study-choice">
      <input type="checkbox" value="${study.id}">
      <span class="vs-struct-study-choice-icon material-symbols-outlined" style="color:${study.color || 'var(--secondary-color)'}">${study.icon || 'menu_book'}</span>
      <span class="vs-struct-study-choice-copy">
        <strong>${study.name || 'Study'}</strong>
        <small>${_vsStructRefLabel()}</small>
      </span>
    </label>
  `).join('');
}

function closeVSStructStudySave() {
  const modal = document.getElementById('vsStructStudySaveModal');
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => { modal.style.display = ''; }, 240);
}

async function confirmVSStructStudySave() {
  const modal = document.getElementById('vsStructStudySaveModal');
  const ids = [...(modal?.querySelectorAll('input[type="checkbox"]:checked') || [])].map(i => i.value);
  if (!ids.length) return;
  const user = window.Auth?.getCurrentUser?.();
  if (!user || !window.Studies?.saveStructure) return;
  const displayName = localStorage.getItem('authDisplayName') || localStorage.getItem('authUsername') || 'Anonymous';
  const data = _vsStructCurrentData();
  await Promise.all(ids.map(id => window.Studies.saveStructure(id, user.uid, displayName, data).catch(() => null)));
  closeVSStructStudySave();
  _vsStructFlashSaveBtn();
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
  let maxY = 0;

  _vsStructSegments.forEach(seg => {
    const words = _vsStructWords.slice(seg.startIdx, seg.endIdx + 1).filter(w => !/^_VERSE_\d+_$/.test(w));
    if (!words.length) return;

    const div = document.createElement('div');
    div.className = 'vs-struct-seg' + (_vsStructEditMode ? ' edit-mode' : '');
    div.dataset.segId = seg.id;
    div.style.left = seg.x + 'px';
    div.style.top  = seg.y + 'px';

    const verseNum = _vsStructVerseNumberForSegment(seg);
    if (verseNum) {
      const label = document.createElement('span');
      label.className = 'vs-struct-verse-num';
      label.textContent = verseNum;
      div.appendChild(label);
    }

    words.forEach((word, wIdx) => {
      const span = document.createElement('span');
      span.className = 'vs-struct-word';
      span.textContent = word;
      // The absolute word index into _vsStructWords (skip markers)
      const absIdx = _vsStructAbsIdx(seg, wIdx);
      span.dataset.absIdx = absIdx;

      if (_vsStructEditMode) {
        span.addEventListener('touchstart',  _vsStructWordTouchStart,  { passive: false });
        span.addEventListener('touchmove',   _vsStructWordTouchMove,   { passive: false });
        span.addEventListener('touchend',    _vsStructWordTouchEnd,    { passive: false });
        span.addEventListener('touchcancel', _vsStructWordTouchEnd,    { passive: true  });
      }
      div.appendChild(span);
    });

    if (_vsStructEditMode) {
      div.addEventListener('touchstart', _vsStructSegTouchStart, { passive: false });
    }

    canvas.appendChild(div);
    maxY = Math.max(maxY, seg.y + div.offsetHeight);
  });
  canvas.style.height = Math.max(2000, maxY + 220) + 'px';
}

function _vsStructCreateSegmentElement(seg) {
  const words = _vsStructWords.slice(seg.startIdx, seg.endIdx + 1).filter(w => !/^_VERSE_\d+_$/.test(w));
  if (!words.length) return null;

  const div = document.createElement('div');
  div.className = 'vs-struct-seg' + (_vsStructEditMode ? ' edit-mode' : '');
  div.dataset.segId = seg.id;
  div.style.left = seg.x + 'px';
  div.style.top  = seg.y + 'px';

  const verseNum = _vsStructVerseNumberForSegment(seg);
  if (verseNum) {
    const label = document.createElement('span');
    label.className = 'vs-struct-verse-num';
    label.textContent = verseNum;
    div.appendChild(label);
  }

  words.forEach((word, wIdx) => {
    const span = document.createElement('span');
    span.className = 'vs-struct-word';
    span.textContent = word;
    const absIdx = _vsStructAbsIdx(seg, wIdx);
    span.dataset.absIdx = absIdx;
    div.appendChild(span);
  });

  if (_vsStructEditMode) {
    div.addEventListener('touchstart', _vsStructSegTouchStart, { passive: false });
  }
  return div;
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

// ── Shared drag initiator ─────────────────────────────────────────────────────
function _vsStructVerseNumberForSegment(seg) {
  if (seg.startIdx === 0) return _vsStructVerseStart;
  const prev = _vsStructWords[seg.startIdx - 1];
  const marker = String(prev || '').match(/^_VERSE_(\d+)_$/);
  return marker ? marker[1] : '';
}

function _vsStructBeginDrag(seg, segEl, touchX, touchY) {
  if (!segEl) return;
  const wrap     = document.getElementById('vsStructCanvasWrap');
  if (!wrap) return;
  const rect     = segEl.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  _vsStructDragSeg   = seg;
  _vsStructDragEl    = segEl;
  _vsStructDragWrap  = wrap;
  _vsStructDragWrapX = wrapRect.left;
  _vsStructDragWrapY = wrapRect.top;
  // Offset = how far the touch point is from the element's top-left corner (viewport coords)
  _vsStructDragOffX  = touchX - rect.left;
  _vsStructDragOffY  = touchY - rect.top;
  segEl.classList.add('dragging');
  window.addEventListener('touchmove',   _vsStructDragMove, { passive: false });
  window.addEventListener('touchend',    _vsStructDragEnd,  { passive: true  });
  window.addEventListener('touchcancel', _vsStructDragEnd,  { passive: true  });
}

// ── Long-press split interaction ──────────────────────────────────────────────
function _vsStructWordTouchStart(e) {
  if (!_vsStructEditMode) return;
  if (e.touches.length > 1) {
    _vsStructCancelLongPress();
    return;
  }
  e.preventDefault(); // prevent one-finger scroll while registering long-press
  const touch = e.touches[0];
  _vsStructTouchStart = { x: touch.clientX, y: touch.clientY };
  _vsStructTouchCurrent = { x: touch.clientX, y: touch.clientY };
  const span   = e.currentTarget;
  const absIdx = parseInt(span.dataset.absIdx, 10);
  const segEl  = span.closest('.vs-struct-seg');
  if (!segEl) return;
  const segId  = parseInt(segEl.dataset.segId, 10);
  const wrap = document.getElementById('vsStructCanvasWrap');
  const spanRect = span.getBoundingClientRect();
  const wrapRect = wrap?.getBoundingClientRect();

  _vsStructLpWord = {
    segId,
    absIdx,
    x: wrap && wrapRect ? spanRect.left - wrapRect.left + wrap.scrollLeft - 8 : null,
    y: wrap && wrapRect ? spanRect.top - wrapRect.top + wrap.scrollTop - 8 : null
  };
  _vsStructLpEl   = span;
  span.classList.add('long-press-active');

  _vsStructLpTimer = setTimeout(() => {
    _vsStructLpTimer = null;
    const pt = _vsStructTouchCurrent || _vsStructTouchStart || { x: touch.clientX, y: touch.clientY };
    _vsStructSplitAndBeginDrag(segId, absIdx, pt.x, pt.y);
  }, 220);
}

function _vsStructWordTouchMove(e) {
  if (e.touches.length > 1) {
    _vsStructCancelLongPress();
    return;
  }
  const touch = e.touches[0];
  _vsStructTouchCurrent = { x: touch.clientX, y: touch.clientY };
  const dx = Math.abs(touch.clientX - (_vsStructTouchStart?.x || 0));
  const dy = Math.abs(touch.clientY - (_vsStructTouchStart?.y || 0));
  if (_vsStructDragSeg) {
    // Already dragging — prevent scroll
    e.preventDefault();
    return;
  }
  if ((dx > 22 || dy > 22) && _vsStructLpTimer) {
    // Finger moved before long-press fired — cancel
    clearTimeout(_vsStructLpTimer);
    _vsStructLpTimer = null;
    if (_vsStructLpEl) _vsStructLpEl.classList.remove('long-press-active');
    _vsStructLpEl = null;
  }
}

function _vsStructWordTouchEnd(e) {
  _vsStructCancelLongPress();
  _vsStructTouchStart = null;
  _vsStructTouchCurrent = null;
}

function _vsStructSplitAndBeginDrag(segId, splitAbsIdx, touchX, touchY) {
  const seg = _vsStructSegments.find(s => s.id === segId);
  if (!seg) return;

  _vsStructPushHistory();

  const canvas = document.getElementById('vsStructCanvas');
  if (!canvas) return;

  let newSeg;
  if (splitAbsIdx === seg.startIdx) {
    // Drag the whole segment
    newSeg = seg;
  } else {
    // Split the data, but do not re-render the touched word out from under
    // the active finger. A temporary live segment moves until touchend.
    const prevEnd = seg.endIdx;
    const oldSegEl = document.querySelector(`[data-seg-id="${seg.id}"]`);
    seg.endIdx    = splitAbsIdx - 1;
    const maxId   = _vsStructSegments.reduce((m, s) => Math.max(m, s.id), 0);
    newSeg = {
      id: maxId + 1,
      startIdx: splitAbsIdx,
      endIdx: prevEnd,
      x: _vsStructLpWord?.x ?? seg.x + 20,
      y: Math.max(0, _vsStructLpWord?.y ?? seg.y + 44)
    };
    _vsStructSegments.push(newSeg);
    _vsStructDragNeedsRender = true;
    _vsStructIgnoreCancelUntil = Date.now() + 650;

    oldSegEl?.querySelectorAll('.vs-struct-word').forEach(wordEl => {
      if (parseInt(wordEl.dataset.absIdx, 10) >= splitAbsIdx) {
        wordEl.classList.add('vs-struct-word-splitting-hidden');
      }
    });

    const liveSegEl = _vsStructCreateSegmentElement(newSeg);
    if (liveSegEl) {
      canvas.appendChild(liveSegEl);
      canvas.style.height = Math.max(parseFloat(canvas.style.height) || 2000, newSeg.y + liveSegEl.offsetHeight + 220) + 'px';
    }
  }

  const segEl = document.querySelector(`[data-seg-id="${newSeg.id}"]`);
  _vsStructBeginDrag(newSeg, segEl, touchX, touchY);
  _vsStructDragMove({ touches: [{ clientX: touchX, clientY: touchY }], preventDefault() {} });
}

// ── Segment drag ───────────────────────────────────────────────────────────────
function _vsStructSegTouchStart(e) {
  if (!_vsStructEditMode) return;
  if (e.touches.length > 1) return;
  if (e.target.classList.contains('vs-struct-word')) return;
  e.preventDefault();
  const touch = e.touches[0];
  const segEl = e.currentTarget;
  const segId = parseInt(segEl.dataset.segId, 10);
  const seg   = _vsStructSegments.find(s => s.id === segId);
  if (!seg) return;
  _vsStructBeginDrag(seg, segEl, touch.clientX, touch.clientY);
}

function _vsStructDragMove(e) {
  if (!_vsStructDragSeg || !_vsStructDragWrap) return;
  if (e.touches?.length > 1) return;
  e.preventDefault();
  const touch = e.touches[0];
  // Canvas coordinates = viewport position relative to wrap + scroll offset
  _vsStructDragPendX = touch.clientX - _vsStructDragWrapX + _vsStructDragWrap.scrollLeft - _vsStructDragOffX;
  _vsStructDragPendY = Math.max(0, touch.clientY - _vsStructDragWrapY + _vsStructDragWrap.scrollTop  - _vsStructDragOffY);
  if (!_vsStructDragRaf) {
    _vsStructDragRaf = requestAnimationFrame(_vsStructDragApply);
  }
}

function _vsStructDragApply() {
  _vsStructDragRaf = null;
  if (!_vsStructDragSeg || !_vsStructDragEl) return;
  _vsStructDragSeg.x = _vsStructDragPendX;
  _vsStructDragSeg.y = _vsStructDragPendY;
  _vsStructDragEl.style.left = _vsStructDragSeg.x + 'px';
  _vsStructDragEl.style.top  = _vsStructDragSeg.y + 'px';
}

function _vsStructDragEnd(e) {
  if (e?.type === 'touchcancel' && Date.now() < _vsStructIgnoreCancelUntil) return;
  _vsStructIgnoreCancelUntil = 0;
  if (_vsStructDragRaf) {
    cancelAnimationFrame(_vsStructDragRaf);
    _vsStructDragRaf = null;
  }
  window.removeEventListener('touchmove',   _vsStructDragMove);
  window.removeEventListener('touchend',    _vsStructDragEnd);
  window.removeEventListener('touchcancel', _vsStructDragEnd);
  if (_vsStructDragEl) _vsStructDragEl.classList.remove('dragging');
  _vsStructDragEl   = null;
  _vsStructDragWrap = null;
  const hadDrag = !!_vsStructDragSeg;
  _vsStructDragSeg  = null;
  if (_vsStructLpEl) {
    _vsStructLpEl.classList.remove('long-press-active');
    _vsStructLpEl = null;
  }
  _vsStructLpWord = null;
  if (hadDrag) {
    if (_vsStructDragNeedsRender) {
      _vsStructDragNeedsRender = false;
      _vsStructRender();
    }
    _vsStructSaveLocal();
  }
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
    const primaryLabel = data.name || displayRef;
    const subLabel     = data.name ? displayRef : '';
    return `<button class="vs-struct-browser-item" onclick="vsStructBrowserOpen(${idx})">
      <span class="vs-struct-browser-item-icon"><span class="material-symbols-outlined">layers</span></span>
      <span class="vs-struct-browser-item-copy">
        <span class="vs-struct-browser-item-ref">${primaryLabel}</span>
        <span class="vs-struct-browser-item-meta">${subLabel ? subLabel + ' · ' : ''}${_vsStructBibleLabel(data.bibleVersion)} · ${data.segments?.length || 0} segments · ${_vsStructFormatDate(data.updatedAt)}</span>
      </span>
      <span class="vs-struct-browser-delete" onclick="event.stopPropagation();vsStructBrowserDelete(${idx}, event)" title="Delete saved structure" aria-label="Delete saved structure">
        <span class="material-symbols-outlined">delete</span>
      </span>
      <span class="vs-struct-browser-item-arrow material-symbols-outlined">chevron_right</span>
    </button>`;
  }).join('');
  // Store refs for click handler
  list._savedData = saved;
}

function vsStructBrowserDelete(idx, e) {
  e?.stopPropagation?.();
  const list = document.getElementById('vsStructBrowserList');
  const saved = list?._savedData;
  const data = saved?.[idx];
  if (!data?.id) return;
  const label = data.name || data.referenceStart || 'this structure';
  if (!confirm(`Delete "${label}"? This removes the saved structure from this device.`)) return;
  try { localStorage.removeItem(data.id); } catch {}
  if (_vsStructCurrentKey === data.id) _vsStructCurrentKey = null;
  _vsStructRenderBrowserList();
  vsStructUpdateCabinetBadge();
}

function vsStructBrowserOpen(idx) {
  const list = document.getElementById('vsStructBrowserList');
  const saved = list?._savedData;
  if (!saved?.[idx]) return;
  const data = saved[idx];

  closeVSStructureBrowser();
  openVSStructureFromData(data);
}

function vsStructUpdateCabinetBadge() {
  const badge = document.getElementById('vsCabinetBadge');
  if (!badge) return;
  const count = _vsStructAllSaved().length;
  badge.classList.toggle('visible', count > 0);
}

Object.assign(window, {
  openVSStructurePicker,
  closeVSStructPicker,
  vsStructPickerUpdateChapters,
  vsStructPickerUpdateVerses,
  openVSStructureWorkspace,
  openVSStructureFromData,
  closeVSStructureWorkspace,
  toggleVSStructEdit,
  vsStructUndo,
  vsStructRedo,
  vsStructReset,
  vsStructSave,
  openVSStructStudySave,
  closeVSStructStudySave,
  confirmVSStructStudySave,
  openVSStructInfo,
  closeVSStructInfo,
  openVSStructureBrowser,
  closeVSStructureBrowser,
  vsStructBrowserDelete,
  vsStructBrowserOpen,
  vsStructUpdateCabinetBadge
});
