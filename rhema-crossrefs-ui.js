const RHEMA_XREF_CATEGORIES = [
  { key: 'quoted', title: 'Quoted / Alluded Scripture', short: 'Quoted', icon: 'format_quote', desc: 'Places where this verse quotes, cites, or strongly echoes another Scripture passage.' },
  { key: 'direct', title: 'Direct Cross References', short: 'Direct', icon: 'menu_book', desc: 'Verses that directly reference or relate to this verse.' },
  { key: 'themes', title: 'Thematic Links', short: 'Themes', icon: 'hub', desc: 'Verses connected by common themes and topics.' },
  { key: 'otNt', title: 'Old Testament / New Testament Connections', short: 'OT/NT Connections', icon: 'link', desc: 'Verses connected across the Old and New Testament.' },
  { key: 'parallel', title: 'Parallel Ideas', short: 'Parallel Ideas', icon: 'sync_alt', desc: 'Verses with similar ideas or parallel concepts.' },
  { key: 'prophecy', title: 'Prophecy Fulfillment Links', short: 'Prophecy', icon: 'workspace_premium', desc: 'Verses that show prophecy and its fulfillment.' }
];

let _rhemaXrefCursor = 0;
let _rhemaXrefEnglishVersion = null;

function _xrefEnglishVersion() {
  return _rhemaXrefEnglishVersion || (typeof _rhemaEnglishVersion === 'function' ? _rhemaEnglishVersion() : 'MSB');
}

function _xrefEnglishData(version = _xrefEnglishVersion()) {
  if (typeof _rhemaEnglishData === 'function') return _rhemaEnglishData(version);
  return version === 'BSB' ? window.RhemaBSB : window.RhemaMSB;
}

function _xrefEnglishLabel(version = _xrefEnglishVersion()) {
  return version === 'BSB' ? 'BSB' : 'MSB';
}

function _xrefBookList() {
  if (Array.isArray(window.RhemaEnglishBooks) && window.RhemaEnglishBooks.length) return window.RhemaEnglishBooks;
  return Object.keys(_xrefEnglishData() || {}).map(code => ({
    code,
    name: window.RhemaBookNames?.[code] || window.RhemaNT?.names?.[code] || code,
    testament: (window.RhemaNTBookOrder || []).includes(code) ? 'NT' : 'OT'
  }));
}

function _xrefBookName(code) {
  return window.RhemaBookNames?.[code] || window.RhemaEnglishBooks?.find(b => b.code === code)?.name || window.RhemaNT?.names?.[code] || code;
}

function _xrefParseRef(ref) {
  const m = String(ref || '').trim().match(/^([1-3]?[A-Z]{2,3})\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  return { book: m[1], chapter: m[2], verse: m[3], endVerse: m[4] || null };
}

function _xrefKey(obj = _rhemaXrefActive) {
  return `${obj.book} ${obj.chapter}:${obj.verse}${obj.endVerse ? '-' + obj.endVerse : ''}`;
}

function _xrefDisplay(ref) {
  const parsed = _xrefParseRef(ref);
  if (!parsed) return ref;
  return `${_xrefBookName(parsed.book)} ${parsed.chapter}:${parsed.verse}${parsed.endVerse ? '-' + parsed.endVerse : ''}`;
}

function _xrefEnglishText(refOrObj) {
  const p = typeof refOrObj === 'string' ? _xrefParseRef(refOrObj) : refOrObj;
  if (!p) return '';
  const chapter = (_xrefEnglishData()?.[p.book] || {})[String(p.chapter)] || {};
  const start = Number(p.verse);
  const end = Number(p.endVerse || p.verse);
  const verses = [];
  for (let v = start; v <= end; v++) {
    if (chapter[String(v)]) verses.push(chapter[String(v)]);
  }
  return verses.join(' ');
}

function _xrefCurrentData() {
  const raw = window.RhemaCrossRefs?.[_xrefKey()] || {};
  if (raw.direct || raw.themes || raw.otNt || raw.parallel || raw.prophecy || raw.quoted) {
    return _xrefApplyCuratedScriptureNotes(raw, _xrefKey());
  }
  const map = { d: 'direct', t: 'themes', o: 'otNt', p: 'parallel', f: 'prophecy' };
  const labels = window.RhemaCrossRefLabels || [];
  const expanded = {};
  for (const [shortKey, category] of Object.entries(map)) {
    expanded[category] = (raw[shortKey] || []).map(value => {
      const [ref, labelIndex] = String(value).split('|');
      return { ref, label: labels[Number(labelIndex)] || 'Related reference' };
    });
  }
  return _xrefApplyCuratedScriptureNotes(expanded, _xrefKey());
}

function _xrefCuratedScriptureNotes(key) {
  if (typeof window.getRhemaScriptureNotesForKey === 'function') {
    return window.getRhemaScriptureNotesForKey(key);
  }
  return [];
}

function _xrefApplyCuratedScriptureNotes(data, key) {
  const curated = _xrefCuratedScriptureNotes(key);
  if (!curated.length) return data;
  const curatedRefs = new Set(curated.map(item => item.ref));
  const next = {};
  RHEMA_XREF_CATEGORIES.forEach(cat => { next[cat.key] = []; });
  Object.entries(data || {}).forEach(([category, refs]) => {
    next[category] = Array.isArray(refs) ? refs.filter(item => !curatedRefs.has(item.ref)) : [];
  });
  next.quoted = curated.map(item => ({
    ref: item.ref,
    label: item.label,
    type: item.type
  }));
  return next;
}

function _xrefCategoryMeta(key) {
  return RHEMA_XREF_CATEGORIES.find(c => c.key === key) || RHEMA_XREF_CATEGORIES[0];
}

function _xrefClip(text, max = 86) {
  const clean = String(text || '').trim();
  return clean.length > max ? clean.slice(0, max).trim() + '...' : clean;
}

function _xrefEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

async function openRhemaCrossReferences(forceCoach = false) {
  const inVsCtx = typeof _vsXrefContext !== 'undefined' && _vsXrefContext;
  if (!inVsCtx && typeof closeRhemaWheel === 'function') closeRhemaWheel();
  await loadRhemaScripts();
  // In VS context use the selected VS translation, else use Rhema's current translation
  if (inVsCtx && typeof _vsTranslation !== 'undefined') {
    _rhemaXrefEnglishVersion = _vsTranslation;
  } else {
    _rhemaXrefEnglishVersion = typeof _rhemaEnglishVersion === 'function' ? _rhemaEnglishVersion() : 'MSB';
  }
  _rhemaXrefActive = { book: _rhemaBook || 'JOH', chapter: _rhemaChapter || '1', verse: _rhemaVerse || '1' };
  _rhemaXrefBreadcrumb = [_xrefKey(_rhemaXrefActive)];
  _rhemaXrefCursor = 0;
  _rhemaXrefCategory = null;
  renderRhemaCrossReferences();
  if (!inVsCtx) {
    setTimeout(() => {
      if (typeof startCrossRefCoach === 'function') startCrossRefCoach(forceCoach);
    }, 160);
  }
}

function setRhemaXrefEnglishVersion(version) {
  const inVsCtx = typeof _vsXrefContext !== 'undefined' && _vsXrefContext;
  if (inVsCtx) {
    // Accept all 5 translations in VS context
    _rhemaXrefEnglishVersion = ['MSB','BSB','NIV','NKJV','NASB'].includes(version) ? version : 'MSB';
  } else {
    _rhemaXrefEnglishVersion = version === 'BSB' ? 'BSB' : 'MSB';
  }
  if (_rhemaXrefView === 'trail') renderRhemaXrefTrail();
  else renderRhemaCrossReferences();
}

function _showRhemaXrefShell(view) {
  document.getElementById('rhemaXrefPage')?.classList.toggle('hidden', view === 'select');
  document.getElementById('rhemaXrefSelectPage')?.classList.toggle('hidden', view !== 'select');
  const inVsCtx = typeof _vsXrefContext !== 'undefined' && _vsXrefContext;
  if (!inVsCtx) {
    document.getElementById('rhemaModal')?.classList.add('xref-open');
    document.querySelector('.rhema-sandbox-arrows')?.classList.remove('visible');
  }
}

function _closeRhemaXrefShell() {
  document.getElementById('rhemaXrefPage')?.classList.add('hidden');
  document.getElementById('rhemaXrefSelectPage')?.classList.add('hidden');
  document.getElementById('rhemaXrefInfoModal')?.classList.add('hidden');
  const inVsCtx = typeof _vsXrefContext !== 'undefined' && _vsXrefContext;
  if (!inVsCtx) {
    document.getElementById('rhemaModal')?.classList.remove('xref-open');
    if (_studySandboxId) document.querySelector('.rhema-sandbox-arrows')?.classList.add('visible');
  }
  // Reset VS context flag so next open from Rhema works normally
  if (inVsCtx && typeof _vsXrefContext !== 'undefined') _vsXrefContext = false;
}

function _xrefTopCardText() {
  const v = _xrefEnglishVersion();
  if (v === 'MSB' || v === 'BSB') return _xrefEnglishText(_rhemaXrefActive);
  // VS context with API translation: try cache, fall back to MSB/BSB local
  if (typeof _vsTextCache !== 'undefined') {
    const key = `${v}|${_rhemaXrefActive.book}|${_rhemaXrefActive.chapter}|${_rhemaXrefActive.verse}`;
    const cached = _vsTextCache.get(key);
    if (cached) return cached;
  }
  return _xrefEnglishText(_rhemaXrefActive);
}

function _xrefRefText(refOrObj) {
  const p = typeof refOrObj === 'string' ? _xrefParseRef(refOrObj) : refOrObj;
  if (!p) return '';
  const v = _xrefEnglishVersion();
  if (v === 'MSB' || v === 'BSB') return _xrefEnglishText(refOrObj);
  if (typeof _vsTextCache !== 'undefined') {
    const key = `${v}|${p.book}|${p.chapter}|${p.verse}`;
    const cached = _vsTextCache.get(key);
    if (cached) return cached;
  }
  return _xrefEnglishText(refOrObj);
}

async function _xrefLoadAsyncVerseTexts(refs) {
  const v = _xrefEnglishVersion();
  if (v === 'MSB' || v === 'BSB') return;
  if (typeof _vsFetchVerse !== 'function') return;
  const toFetch = refs.filter(r => {
    const p = _xrefParseRef(r);
    if (!p) return false;
    return !_vsTextCache?.has(`${v}|${p.book}|${p.chapter}|${p.verse}`);
  });
  if (!toFetch.length) return;
  await Promise.all(toFetch.map(async r => {
    const p = _xrefParseRef(r);
    if (!p) return;
    await _vsFetchVerse(v, p.book, p.chapter, p.verse);
  }));
  // Update DOM spans by data-xref-ref
  const body = document.getElementById('rxMainView');
  if (!body) return;
  body.querySelectorAll('[data-xref-ref]').forEach(el => {
    const ref = el.dataset.xrefRef;
    const p = _xrefParseRef(ref);
    if (!p) return;
    const key = `${v}|${p.book}|${p.chapter}|${p.verse}`;
    const text = _vsTextCache?.get(key);
    if (text) {
      const clipped = el.dataset.xrefClip === '1' ? _xrefClip(text) : text;
      el.textContent = clipped;
    }
  });
  // Also update top card text
  const topCardP = body.querySelector('.rx-top-card p');
  if (topCardP) {
    const text = _xrefTopCardText();
    if (text) topCardP.textContent = text;
  }
}

function _xrefTopCardHtml() {
  const ref = _xrefKey();
  const inVsCtx = typeof _vsXrefContext !== 'undefined' && _vsXrefContext;
  const versions = inVsCtx ? ['MSB', 'BSB', 'NIV', 'NKJV', 'NASB'] : ['MSB', 'BSB'];
  return `<div class="rx-top-card" role="button" tabindex="0" onclick="openRhemaCrossRefSelect()" onkeydown="if(event.key==='Enter'||event.key===' ')openRhemaCrossRefSelect()">
    <div class="rx-top-card-copy">
      <h3>${_xrefEscape(_xrefDisplay(ref))}</h3>
      <p>${_xrefEscape(_xrefTopCardText())}</p>
      <span class="rx-change"><span class="material-symbols-outlined">touch_app</span>Tap to change verse</span>
    </div>
    <span class="material-symbols-outlined rx-top-watermark">auto_stories</span>
  </div>
  <div class="rx-translation-toggle" aria-label="English translation">
    ${versions.map(version => `<button class="${_xrefEnglishVersion() === version ? 'active' : ''}" onclick="setRhemaXrefEnglishVersion('${version}')">${version}</button>`).join('')}
  </div>`;
}

function _renderXrefBreadcrumb() {
  const el = document.getElementById('rxBreadcrumb');
  if (!el) return;
  if (_rhemaXrefBreadcrumb.length <= 1) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const scroll = document.getElementById('rxBreadcrumbScroll');
  if (!scroll) return;
  scroll.innerHTML = _rhemaXrefBreadcrumb.map((ref, idx) => {
    const active = idx === _rhemaXrefCursor;
    return `<button class="${active ? 'active' : ''}" onclick="rhemaXrefJumpBreadcrumb(${idx})">${_xrefEscape(_xrefDisplay(ref))}</button>`;
  }).join('<span class="material-symbols-outlined">chevron_right</span>');
  requestAnimationFrame(() => {
    const activeBtn = scroll.querySelector('button.active');
    if (activeBtn) activeBtn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    else scroll.scrollLeft = scroll.scrollWidth;
  });
}

function renderRhemaCrossReferences() {
  _rhemaXrefView = 'main';
  _showRhemaXrefShell('main');
  const title = document.getElementById('rxPageTitle');
  if (title) title.textContent = 'Cross References';
  _renderXrefBreadcrumb();
  const data = _xrefCurrentData();
  const body = document.getElementById('rxMainView');
  if (!body) return;
  const allRefs = [];
  body.innerHTML = _xrefTopCardHtml() + `<div class="rx-category-list">${RHEMA_XREF_CATEGORIES.map(cat => {
    const refs = data[cat.key] || [];
    const isEmpty = refs.length === 0;
    if (!isEmpty) refs.forEach(item => allRefs.push(item.ref));
    const preview = !isEmpty ? refs.slice(0, 2).map(item => {
      allRefs.push(item.ref);
      return `<div class="rx-preview-line"><strong>${_xrefEscape(_xrefDisplay(item.ref))}</strong><span data-xref-ref="${_xrefEscape(item.ref)}" data-xref-clip="1">${_xrefEscape(_xrefClip(_xrefRefText(item.ref)))}</span></div>`;
    }).join('') : '';
    const chips = cat.key === 'themes' && !isEmpty ? refs.slice(0, 5).map(item => `<span>${_xrefEscape(item.label)}</span>`).join('') : '';
    return `<button class="rx-category-card${isEmpty ? ' rx-no-data' : ''}" data-xref-cat="${cat.key}" onclick="openRhemaXrefCategory('${cat.key}')">
      <span class="rx-category-icon"><span class="material-symbols-outlined">${cat.icon}</span></span>
      <span class="rx-category-copy">
        <span class="rx-category-title">${cat.title} <em>${isEmpty ? '—' : refs.length}</em></span>
        <span class="rx-category-desc">${cat.desc}</span>
        ${isEmpty ? '' : chips ? `<span class="rx-chip-row">${chips}</span>` : preview}
      </span>
      <span class="material-symbols-outlined rx-card-arrow">${isEmpty ? 'block' : 'chevron_right'}</span>
    </button>`;
  }).join('')}</div>`;
  _xrefLoadAsyncVerseTexts([_xrefKey(_rhemaXrefActive), ...allRefs]);
}

function openRhemaXrefCategory(key) {
  const refs = _xrefCurrentData()[key] || [];
  if (!refs.length) {
    const card = document.querySelector(`[data-xref-cat="${key}"]`);
    if (card) {
      card.classList.remove('rx-shaking');
      void card.offsetWidth;
      card.classList.add('rx-shaking');
      setTimeout(() => card.classList.remove('rx-shaking'), 400);
    }
    return;
  }
  _rhemaXrefCategory = key;
  _rhemaXrefView = 'trail';
  renderRhemaXrefTrail();
}

function renderRhemaXrefTrail() {
  const cat = _xrefCategoryMeta(_rhemaXrefCategory);
  const title = document.getElementById('rxPageTitle');
  if (title) title.textContent = cat.title;
  _showRhemaXrefShell('main');
  _renderXrefBreadcrumb();
  const refs = (_xrefCurrentData()[cat.key] || []);
  const cards = refs.map(item => `<button class="rx-verse-card" onclick="rhemaXrefFollow('${item.ref.replace(/'/g, "\\'")}')">
    <span class="rx-verse-copy">
      <strong>${_xrefEscape(_xrefDisplay(item.ref))}</strong>
      <span data-xref-ref="${_xrefEscape(item.ref)}">${_xrefEscape(_xrefRefText(item.ref))}</span>
      <em>${_xrefEscape(item.label)}</em>
    </span>
    <span class="rx-arrow-btn material-symbols-outlined">arrow_forward</span>
  </button>`).join('');
  const save = _studySandboxId ? `<button class="rx-save-trail-btn" onclick="saveCurrentRhemaTrail()"><span class="material-symbols-outlined">bookmark</span>Save Trail</button>` : '';
  document.getElementById('rxMainView').innerHTML = _xrefTopCardHtml() +
    `<div class="rx-active-category" data-xref-cat="${cat.key}"><span class="rx-category-icon"><span class="material-symbols-outlined">${cat.icon}</span></span><div><strong>${cat.title} <em>${refs.length}</em></strong><p>${cat.desc}</p></div></div>` +
    `<div class="rx-verse-stack">${cards || '<p class="rx-empty">No starter links are loaded for this verse yet.</p>'}</div>${save}`;
  _xrefLoadAsyncVerseTexts([_xrefKey(_rhemaXrefActive), ...refs.map(r => r.ref)]);
}

function rhemaXrefFollow(ref) {
  const parsed = _xrefParseRef(ref);
  if (!parsed) return;
  _rhemaXrefActive = parsed;
  _rhemaBook = parsed.book;
  _rhemaChapter = parsed.chapter;
  _rhemaVerse = parsed.verse;
  _rhemaXrefBreadcrumb.push(_xrefKey(parsed));
  _rhemaXrefCursor = _rhemaXrefBreadcrumb.length - 1;
  _rhemaXrefCategory = null;
  const inVsCtx = typeof _vsXrefContext !== 'undefined' && _vsXrefContext;
  if (!inVsCtx && typeof syncRhemaPicker === 'function') syncRhemaPicker();
  renderRhemaCrossReferences();
}

function openRhemaXrefTrailFromReader(sourceRef, targetRef = null, category = null) {
  const source = _xrefParseRef(sourceRef);
  const target = targetRef ? _xrefParseRef(targetRef) : null;
  const active = target || source;
  if (!source || !active) return;
  if (typeof closeRhemaWheel === 'function') closeRhemaWheel();
  _rhemaXrefEnglishVersion = typeof _rhemaEnglishVersion === 'function' ? _rhemaEnglishVersion() : 'MSB';
  _rhemaXrefActive = active;
  _rhemaBook = active.book;
  _rhemaChapter = active.chapter;
  _rhemaVerse = active.verse;
  _rhemaXrefBreadcrumb = [_xrefKey(source)];
  if (target) _rhemaXrefBreadcrumb.push(_xrefKey(target));
  _rhemaXrefCursor = _rhemaXrefBreadcrumb.length - 1;
  _rhemaXrefCategory = !target && category ? category : null;
  _rhemaXrefView = _rhemaXrefCategory ? 'trail' : 'main';
  if (typeof syncRhemaPicker === 'function') syncRhemaPicker();
  if (_rhemaXrefCategory) renderRhemaXrefTrail();
  else renderRhemaCrossReferences();
}

function rhemaXrefJumpBreadcrumb(idx) {
  const parsed = _xrefParseRef(_rhemaXrefBreadcrumb[idx]);
  if (!parsed) return;
  _rhemaXrefCursor = idx;
  _rhemaXrefActive = parsed;
  _rhemaBook = parsed.book;
  _rhemaChapter = parsed.chapter;
  _rhemaVerse = parsed.verse;
  _rhemaXrefCategory = null;
  const inVsCtx = typeof _vsXrefContext !== 'undefined' && _vsXrefContext;
  if (!inVsCtx && typeof syncRhemaPicker === 'function') syncRhemaPicker();
  renderRhemaCrossReferences();
}

function clearRhemaXrefBreadcrumb() {
  _rhemaXrefBreadcrumb = [_xrefKey(_rhemaXrefActive)];
  _rhemaXrefCursor = 0;
  _renderXrefBreadcrumb();
}

function rhemaCrossRefBack() {
  if (_rhemaXrefCursor > 0) {
    rhemaXrefJumpBreadcrumb(_rhemaXrefCursor - 1);
    return;
  }
  if (_rhemaXrefView === 'trail') {
    _rhemaXrefCategory = null;
    renderRhemaCrossReferences();
    return;
  }
  _closeRhemaXrefShell();
}

function openRhemaCrossRefSelect() {
  _rhemaXrefSelect = {
    testament: _xrefBookList().find(b => b.code === _rhemaXrefActive.book)?.testament || 'NT',
    book: _rhemaXrefActive.book,
    chapter: _rhemaXrefActive.chapter,
    verse: _rhemaXrefActive.verse
  };
  _rhemaXrefView = 'select';
  _showRhemaXrefShell('select');
  renderRhemaXrefSelect();
}

function closeRhemaCrossRefSelect() {
  _showRhemaXrefShell('main');
  _rhemaXrefView = _rhemaXrefCategory ? 'trail' : 'main';
}

function renderRhemaXrefSelect() {
  const testamentGrid = document.getElementById('rxTestamentGrid');
  if (testamentGrid) {
    testamentGrid.innerHTML = ['OT', 'NT'].map(t => `<button class="${_rhemaXrefSelect.testament === t ? 'active' : ''}" onclick="rhemaXrefSelectTestament('${t}')"><span class="material-symbols-outlined">auto_stories</span>${t === 'OT' ? 'Old Testament' : 'New Testament'}</button>`).join('');
  }
  const books = _xrefBookList().filter(b => b.testament === _rhemaXrefSelect.testament);
  const bookList = document.getElementById('rxBookList');
  if (bookList) {
    bookList.innerHTML = books.map(b => `<div class="rhema-book-row${b.code === _rhemaXrefSelect.book ? ' selected' : ''}" onclick="rhemaXrefSelectBook('${b.code}')"><span class="material-symbols-outlined rhema-book-icon">menu_book</span><span class="rhema-book-name">${_xrefEscape(b.name)}</span><span class="material-symbols-outlined rhema-book-check">check</span></div>`).join('');
    const sel = bookList.querySelector('.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  const bookBtn = document.getElementById('rxBookBtnLabel');
  if (bookBtn) bookBtn.textContent = books.find(b => b.code === _rhemaXrefSelect.book)?.name || 'Select Book';
  const chapters = Object.keys(_xrefEnglishData()?.[_rhemaXrefSelect.book] || {}).sort((a,b) => +a - +b);
  if (!chapters.includes(_rhemaXrefSelect.chapter)) _rhemaXrefSelect.chapter = chapters[0] || '1';
  document.getElementById('rxChapterGrid').innerHTML = chapters.map(ch => `<button class="${ch === _rhemaXrefSelect.chapter ? 'active' : ''}" onclick="rhemaXrefSelectChapter('${ch}')">${ch}</button>`).join('');
  const verses = Object.keys(_xrefEnglishData()?.[_rhemaXrefSelect.book]?.[_rhemaXrefSelect.chapter] || {}).sort((a,b) => +a - +b);
  if (!verses.includes(_rhemaXrefSelect.verse)) _rhemaXrefSelect.verse = verses[0] || '1';
  document.getElementById('rxVerseGrid').innerHTML = verses.map(v => `<button class="${v === _rhemaXrefSelect.verse ? 'active' : ''}" onclick="rhemaXrefSelectVerse('${v}')">${v}</button>`).join('');
  const selected = document.getElementById('rxSelectedCard');
  if (selected) selected.innerHTML = `<span>Selected Reference</span><strong>${_xrefEscape(_xrefDisplay(_xrefKey(_rhemaXrefSelect)))}</strong><p>${_xrefEscape(_xrefEnglishText(_rhemaXrefSelect))}</p>`;
}

function rhemaXrefSelectTestament(testament) {
  _rhemaXrefSelect.testament = testament;
  const first = _xrefBookList().find(b => b.testament === testament);
  if (first) _rhemaXrefSelect = { testament, book: first.code, chapter: '1', verse: '1' };
  renderRhemaXrefSelect();
}

function rhemaXrefSelectBook(code) {
  _rhemaXrefSelect.book = code;
  _rhemaXrefSelect.chapter = '1';
  _rhemaXrefSelect.verse = '1';
  closeRxBookPicker();
  renderRhemaXrefSelect();
}

function openRxBookPicker() {
  const el = document.getElementById('rxBookPickerOverlay');
  if (!el) return;
  const input = document.getElementById('rxBookSearchInput');
  if (input) { input.value = ''; rxFilterBooks(''); }
  el.classList.remove('hidden');
  const sel = document.getElementById('rxBookList')?.querySelector('.selected');
  if (sel) setTimeout(() => sel.scrollIntoView({ block: 'center' }), 50);
}

function closeRxBookPicker() {
  document.getElementById('rxBookPickerOverlay')?.classList.add('hidden');
}

function rxFilterBooks(query) {
  const q = query.toLowerCase().trim();
  document.getElementById('rxBookList')?.querySelectorAll('.rhema-book-row').forEach(row => {
    row.style.display = !q || row.querySelector('.rhema-book-name')?.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function rhemaXrefSelectChapter(ch) {
  _rhemaXrefSelect.chapter = ch;
  _rhemaXrefSelect.verse = '1';
  renderRhemaXrefSelect();
}

function rhemaXrefSelectVerse(v) {
  _rhemaXrefSelect.verse = v;
  renderRhemaXrefSelect();
}

function applyRhemaXrefSelection() {
  _rhemaXrefActive = { ..._rhemaXrefSelect };
  _rhemaBook = _rhemaXrefActive.book;
  _rhemaChapter = _rhemaXrefActive.chapter;
  _rhemaVerse = _rhemaXrefActive.verse;
  _rhemaXrefBreadcrumb = [_xrefKey(_rhemaXrefActive)];
  _rhemaXrefCursor = 0;
  _rhemaXrefCategory = null;
  const inVsCtx = typeof _vsXrefContext !== 'undefined' && _vsXrefContext;
  if (!inVsCtx && typeof syncRhemaPicker === 'function') syncRhemaPicker();
  renderRhemaCrossReferences();
}

function openRhemaCrossRefInfo() {
  document.getElementById('rhemaXrefInfoModal')?.classList.remove('hidden');
}

function closeRhemaCrossRefInfo(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('rhemaXrefInfoModal')?.classList.add('hidden');
}

let _trailSaveResolve = null;

function _promptTrailTitle(defaultTitle) {
  return new Promise(resolve => {
    _trailSaveResolve = resolve;
    const input = document.getElementById('rxTrailSaveInput');
    if (input) input.value = defaultTitle;
    document.getElementById('rxTrailSaveModal')?.classList.remove('hidden');
    setTimeout(() => { input?.focus(); input?.select(); }, 80);
  });
}

function rxTrailSaveConfirm() {
  const val = (document.getElementById('rxTrailSaveInput')?.value || '').trim();
  document.getElementById('rxTrailSaveModal')?.classList.add('hidden');
  _trailSaveResolve?.(val || null);
  _trailSaveResolve = null;
}

function rxTrailSaveDismiss() {
  document.getElementById('rxTrailSaveModal')?.classList.add('hidden');
  _trailSaveResolve?.(null);
  _trailSaveResolve = null;
}

async function saveCurrentRhemaTrail() {
  if (!_studySandboxId || !_rhemaXrefCategory) return;
  const uid = window.Auth?.getCurrentUser()?.uid;
  if (!uid) return;
  const cat = _xrefCategoryMeta(_rhemaXrefCategory);
  const refs = (_xrefCurrentData()[_rhemaXrefCategory] || []).map(item => ({
    reference: _xrefDisplay(item.ref),
    rawRef: item.ref,
    label: item.label,
    text: _xrefEnglishText(item.ref),
    translation: _xrefEnglishLabel()
  }));
  const defaultTitle = `${_xrefDisplay(_rhemaXrefBreadcrumb[0])} Trail`;
  const title = await _promptTrailTitle(defaultTitle);
  if (!title) return;
  const trail = {
    title,
    startVerse: _xrefDisplay(_rhemaXrefBreadcrumb[0]),
    currentVerse: _xrefDisplay(_xrefKey()),
    activeRef: _xrefKey(),
    categoryKey: _rhemaXrefCategory,
    categoryPath: cat.title,
    translation: _xrefEnglishLabel(),
    breadcrumbTrail: _rhemaXrefBreadcrumb.map(_xrefDisplay),
    rawBreadcrumbTrail: [..._rhemaXrefBreadcrumb],
    connections: refs
  };
  const displayName = localStorage.getItem('authDisplayName') || localStorage.getItem('authUsername') || 'Anonymous';
  const ok = await window.Studies?.saveTrail?.(_studySandboxId, uid, displayName, trail);
  _showStudyToast(ok ? 'Trail saved.' : 'Could not save trail.');
}

function openSavedRhemaTrail(trailId) {
  const trail = _sandboxTrailsCache.find(t => t.id === trailId);
  if (!trail) return;
  const active = _xrefParseRef(trail.activeRef || trail.rawBreadcrumbTrail?.at?.(-1));
  if (!active) return;
  _rhemaXrefActive = active;
  _rhemaXrefBreadcrumb = (trail.rawBreadcrumbTrail || [trail.activeRef]).filter(Boolean);
  const _restoredCursorIdx = trail.activeRef ? _rhemaXrefBreadcrumb.lastIndexOf(trail.activeRef) : -1;
  _rhemaXrefCursor = _restoredCursorIdx >= 0 ? _restoredCursorIdx : _rhemaXrefBreadcrumb.length - 1;
  _rhemaXrefCategory = trail.categoryKey || 'direct';
  _rhemaBook = active.book;
  _rhemaChapter = active.chapter;
  _rhemaVerse = active.verse;
  _rhemaXrefView = 'trail';
  switchSandboxTab('rhema');
  showRhema().then(() => {
    _showRhemaXrefShell('main');
    renderRhemaXrefTrail();
  });
}

function _renderSandboxTrails(trails) {
  const list = document.getElementById('ssTrailsList');
  if (!list) return;
  if (!trails?.length) {
    list.innerHTML = '<p class="ss-hint">No trails saved yet. Open Cross-Ref from Rhema, follow a trail, then tap Save Trail.</p>';
    return;
  }
  list.innerHTML = trails.map(t => {
    const date = t.savedAt?.toDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(t.savedAt.toDate()) : '';
    return `<div class="ss-trail-item">
      <button onclick="openSavedRhemaTrail('${t.id}')">
        <strong>${_xrefEscape(t.title || 'Saved Trail')}</strong>
        <span>${_xrefEscape((t.breadcrumbTrail || []).join(' -> '))}</span>
        <em>${_xrefEscape(t.categoryPath || '')}${date ? ' - ' + date : ''}</em>
      </button>
      <button class="ss-trail-del" onclick="deleteSandboxTrail('${t.id}')"><span class="material-symbols-outlined">delete</span></button>
    </div>`;
  }).join('');
}

async function deleteSandboxTrail(trailId) {
  const studyId = _studySandboxId || _activeSandboxStudy?.id;
  if (!studyId) return;
  await window.Studies?.deleteTrail?.(studyId, trailId);
}

Object.assign(window, {
  openRhemaCrossReferences,
  renderRhemaCrossReferences,
  openRhemaXrefCategory,
  renderRhemaXrefTrail,
  rhemaXrefFollow,
  rhemaXrefJumpBreadcrumb,
  clearRhemaXrefBreadcrumb,
  rhemaCrossRefBack,
  openRhemaCrossRefSelect,
  closeRhemaCrossRefSelect,
  renderRhemaXrefSelect,
  rhemaXrefSelectTestament,
  rhemaXrefSelectBook,
  rhemaXrefSelectChapter,
  rhemaXrefSelectVerse,
  applyRhemaXrefSelection,
  openRhemaCrossRefInfo,
  closeRhemaCrossRefInfo,
  saveCurrentRhemaTrail,
  setRhemaXrefEnglishVersion,
  openRhemaXrefTrailFromReader,
  openSavedRhemaTrail,
  deleteSandboxTrail,
  openRxBookPicker,
  closeRxBookPicker,
  rxFilterBooks,
  rxTrailSaveConfirm,
  rxTrailSaveDismiss
});
