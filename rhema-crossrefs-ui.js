
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

// "JOH 3:16", "PSA 33:6-9", "GEN 1:31-2:3"
function _xrefParseRef(ref) {
  const m = String(ref || '').trim().match(/^([1-3]?[A-Z]{2,3})\s+(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/);
  if (!m) return null;
  const out = { book: m[1], chapter: m[2], verse: m[3], endVerse: m[5] || null };
  if (m[4] && m[4] !== m[2]) out.endChapter = m[4];
  return out;
}

function _xrefKey(obj = _rhemaXrefActive) {
  return `${obj.book} ${obj.chapter}:${obj.verse}${obj.endVerse ? '-' + (obj.endChapter ? obj.endChapter + ':' : '') + obj.endVerse : ''}`;
}

function _xrefDisplay(ref) {
  const parsed = _xrefParseRef(ref);
  if (!parsed) return ref;
  const end = parsed.endVerse ? '-' + (parsed.endChapter ? parsed.endChapter + ':' : '') + parsed.endVerse : '';
  return `${_xrefBookName(parsed.book)} ${parsed.chapter}:${parsed.verse}${end}`;
}

function _xrefEnglishText(refOrObj) {
  const p = typeof refOrObj === 'string' ? _xrefParseRef(refOrObj) : refOrObj;
  if (!p) return '';
  const data = _xrefEnglishData()?.[p.book] || {};
  const c1 = Number(p.chapter), c2 = Number(p.endChapter || p.chapter);
  const verses = [];
  for (let c = c1; c <= c2; c++) {
    const chapter = data[String(c)] || {};
    const from = c === c1 ? Number(p.verse) : 1;
    const to = c === c2 ? Number(p.endVerse || (c === c1 ? p.verse : 999)) : 999;
    Object.keys(chapter).map(Number).sort((a, b) => a - b).forEach(v => { if (v >= from && v <= to) verses.push(chapter[String(v)]); });
  }
  return verses.join(' ');
}

function _xrefCuratedScriptureNotes(key) {
  if (typeof window.getRhemaScriptureNotesForKey === 'function') {
    return window.getRhemaScriptureNotesForKey(key);
  }
  return [];
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
  // Cross-references are local-only (MSB/BSB). The api.bible translations
  // (NIV/NKJV/NASB) live exclusively in the Rhema compare feature now, to keep
  // network calls to an absolute minimum.
  _rhemaXrefEnglishVersion = version === 'BSB' ? 'BSB' : 'MSB';
  if (_rhemaXrefView === 'trail') renderRhemaXrefTrail();
  else renderRhemaCrossReferences();
}

function _showRhemaXrefShell(view) {
  document.getElementById('rhemaXrefPage')?.classList.toggle('hidden', view === 'select');
  document.getElementById('rhemaXrefSelectPage')?.classList.toggle('hidden', view !== 'select');
  // Lock the page behind the full-screen overlay so a scroll gesture inside the
  // cross-reference panel can't leak through and scroll the reader in the back.
  document.body.classList.add('rx-scroll-lock');
  document.documentElement.classList.add('rx-scroll-lock');
  const inVsCtx = typeof _vsXrefContext !== 'undefined' && _vsXrefContext;
  if (!inVsCtx) {
    document.getElementById('rhemaModal')?.classList.add('xref-open');
    document.querySelector('.rhema-sandbox-arrows')?.classList.remove('visible');
  }
}

function _closeRhemaXrefShell() {
  document.getElementById('rxCompareSheet')?.remove();
  document.getElementById('rhemaXrefPage')?.classList.add('hidden');
  document.getElementById('rhemaXrefSelectPage')?.classList.add('hidden');
  document.getElementById('rhemaXrefInfoModal')?.classList.add('hidden');
  document.body.classList.remove('rx-scroll-lock');
  document.documentElement.classList.remove('rx-scroll-lock');
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
  const versions = ['MSB', 'BSB'];
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

// ── Cross references ─────────────────────────────────────────────────────────
// data/xrefs/<BOOK>.json (scripts/build-crossrefs-v2.js): OpenBible.info's
// links (CC BY), ranked by readers' votes, each with the reason it's there —
// found from the Greek and Hebrew texts, never guessed:
//   q/Q quotes · f/F fulfillment (the NT says so) · e/E echoes the wording ·
//   p parallel account · s similar wording · w same uncommon word · '' related.
const RHEMA_XREFS_VERSION = '3.0.591';
const RX_FILTERS = [
  { key: 'best', label: 'Best' },
  { key: 'quotes', label: 'Quotes', kinds: 'qQfFn' },
  { key: 'parallels', label: 'Parallels', kinds: 'ps' },
  { key: 'echoes', label: 'Echoes', kinds: 'eE' },
  { key: 'words', label: 'Same word', kinds: 'w' },
  { key: 'all', label: 'All' }
];
const RX_KIND = {
  f: { icon: 'verified', label: 'Fulfillment', cls: 'q' },
  F: { icon: 'verified', label: 'Fulfillment', cls: 'q' },
  q: { icon: 'format_quote', label: 'Quote', cls: 'q' },
  Q: { icon: 'format_quote', label: 'Quote', cls: 'q' },
  n: { icon: 'sticky_note_2', label: 'Footnote', cls: 'q' },
  p: { icon: 'compare_arrows', label: 'Parallel', cls: 'p' },
  s: { icon: 'compare_arrows', label: 'Similar', cls: 'p' },
  e: { icon: 'graphic_eq', label: 'Echo', cls: 'e' },
  E: { icon: 'graphic_eq', label: 'Echo', cls: 'e' },
  w: { icon: 'translate', label: 'Same word', cls: 'w' },
  '': { icon: 'link', label: 'Related', cls: 'r' }
};
// Old saved trails stored a category; map it to a filter.
const RX_OLD_CATEGORY = { quoted: 'quotes', prophecy: 'quotes', direct: 'best', otNt: 'best', themes: 'all', parallel: 'parallels' };
const RX_PAGE = 15;
let _rxShown = RX_PAGE;
let _rxRowsCache = { key: '', rows: [] };
const _rxShards = new Map();     // book → loading promise
const _rxShardData = new Map();  // book → loaded shard

function _rxFilter() {
  const f = _rhemaXrefCategory;
  return RX_FILTERS.some(x => x.key === f) ? f : (RX_OLD_CATEGORY[f] || 'best');
}
function _rxLoadBook(book) {
  if (!_rxShards.has(book)) {
    _rxShards.set(book, fetch(`data/xrefs/${book}.json?v=${RHEMA_XREFS_VERSION}`)
      .then(r => { if (!r.ok) throw new Error('xrefs ' + r.status); return r.json(); })
      .then(j => { _rxShardData.set(book, j); return j; })
      .catch(e => { _rxShards.delete(book); throw e; }));
  }
  return _rxShards.get(book);
}
function _rxShardNow(book) { return _rxShardData.get(book); }
// The links for the active verse, ranked: fulfillments, quotes and parallels
// first, then everything else by readers' votes.
function _rxRows(key = _xrefKey()) {
  if (_rxRowsCache.key === key) return _rxRowsCache.rows;
  const p = _xrefParseRef(key);
  const shard = p && _rxShardNow(p.book);
  if (!shard) return null;
  const raw = shard.v?.[`${p.chapter}:${p.verse}`] || [];
  const rows = raw.map(([ref, votes, kind = '', info = null]) => ({ ref, votes: votes || 0, kind, info, word: kind === 'w' ? shard.w?.[info] : null }));
  // Official footnote citations (MSB/BSB): add them, or mark the matching link.
  const seen = new Map(rows.map(r => [r.ref, r]));
  const inRange = (range, ref) => {
    const a = _xrefParseRef(range), b = _xrefParseRef(ref);
    if (!a || !b || a.book !== b.book || !a.endVerse) return false;
    const at = (c, v) => Number(c) * 1000 + Number(v);
    const x = at(b.chapter, b.verse);
    return x >= at(a.chapter, a.verse) && x <= at(a.endChapter || a.chapter, a.endVerse);
  };
  _xrefCuratedScriptureNotes(key).forEach(n => {
    const hit = seen.get(n.ref) || rows.find(r => inRange(r.ref, n.ref));
    if (hit) hit.footnote = true;
    else rows.push({ ref: n.ref, votes: 0, kind: 'n', info: null, footnote: true });
  });
  const top = r => (/[fFqQnp]/.test(r.kind) || r.footnote) ? 1 : 0;
  rows.sort((a, b) => top(b) - top(a) || b.votes - a.votes);
  _rxRowsCache = { key, rows };
  return rows;
}
function _rxFiltered(rows, filter = _rxFilter()) {
  const f = RX_FILTERS.find(x => x.key === filter);
  if (!f || !f.kinds) return filter === 'best' ? rows.slice(0, 12) : rows;
  return rows.filter(r => (r.kind && f.kinds.includes(r.kind)) || (filter === 'quotes' && r.footnote));
}

// Words two verses share, for highlighting (English, ignoring the small words).
const RX_STOP = new Set('the a an and or but of to in on at by for with from as is are was were be been being it its he him his she her they them their we us our you your i me my mine this that these those who whom which what not no nor so then than there here when will shall would should may might can could do does did have has had all any every one into upon out up down over under also even just let like say said says unto said'.split(' '));
function _rxStem(w) {
  let s = w.toLowerCase().replace(/[’']s$/, '').replace(/[^a-z]/g, '');
  if (s.length > 4) s = s.replace(/(ing|ed|es|s)$/, '');
  return s;
}
function _rxWordSet(text) {
  return new Set(String(text || '').split(/\s+/).map(_rxStem).filter(s => s.length > 2 && !RX_STOP.has(s)));
}
function _rxHighlight(text, against) {
  const set = against instanceof Set ? against : _rxWordSet(against);
  return String(text || '').split(/(\s+)/).map(tok => {
    const s = _rxStem(tok);
    const safe = _xrefEscape(tok);
    return s.length > 2 && !RX_STOP.has(s) && set.has(s) ? `<mark class="rx-hl">${safe}</mark>` : safe;
  }).join('');
}

function _rxBookOf(ref) { return _xrefBookName(String(ref).split(' ')[0]); }
// Why this link is here, in plain words.
function _rxWhy(row, src) {
  const why = _rxWhyBase(row, src);
  return row.footnote && row.kind && row.kind !== 'n' ? `${why} · cited in the ${_xrefEnglishLabel()} footnotes` : why;
}
function _rxWhyBase(row, src) {
  const n = row.info ? ` · ${row.info} words alike in the Greek` : '';
  switch (row.kind) {
    case 'f': return `${_xrefDisplay(src)} quotes this and says it was fulfilled${n}`;
    case 'F': return `Quotes this verse and says it was fulfilled${n}`;
    case 'q': return `${_xrefDisplay(src)} quotes this${n}`;
    case 'Q': return `Quotes this verse${n}`;
    case 'e': case 'E': return `Same wording, without a quote formula${n}`;
    case 'p': return _rxBookOf(row.ref) === _rxBookOf(src) ? 'A parallel passage' : `A parallel passage in ${_rxBookOf(row.ref)}`;
    case 's': return 'Very similar wording';
    case 'w': return row.word ? `Both use ${row.word[0]}${row.word[1] ? ` “${row.word[1]}”` : ''}` : 'Both use the same uncommon word';
    case 'n': return `Cited in the ${_xrefEnglishLabel()} footnotes`;
    default: return row.footnote ? `Cited in the ${_xrefEnglishLabel()} footnotes` : 'Linked by readers';
  }
}

function _rxCardHtml(row, i, srcSet) {
  const k = RX_KIND[row.kind] || RX_KIND[''];
  const ref = row.ref;
  const esc = _xrefEscape;
  const js = String(ref).replace(/'/g, "\\'");
  const text = _xrefRefText(ref);
  const hl = /[qQfFeEpsn]/.test(row.kind) ? _rxHighlight(text, srcSet) : esc(text);
  return `<article class="rx-link rx-k-${k.cls}">
    <button type="button" class="rx-link-main" onclick="rhemaXrefFollow('${js}')">
      <span class="rx-link-top"><strong>${esc(_xrefDisplay(ref))}</strong><span class="rx-kind"><span class="material-symbols-outlined">${k.icon}</span>${k.label}</span></span>
      <span class="rx-link-text" data-xref-ref="${esc(ref)}">${hl}</span>
      <span class="rx-link-why">${esc(_rxWhy(row, _xrefKey()))}</span>
    </button>
    <div class="rx-link-actions">
      <button type="button" onclick="rxCompare(${i})"><span class="material-symbols-outlined">splitscreen</span>Compare</button>
      <button type="button" onclick="rxOpenInReader('${js}')"><span class="material-symbols-outlined">menu_book</span>Read</button>
      <button type="button" onclick="rhemaXrefFollow('${js}')"><span class="material-symbols-outlined">alt_route</span>Its links</button>
      ${row.votes > 0 ? `<span class="rx-votes" title="Readers who voted for this link on OpenBible.info">${row.votes.toLocaleString()} ${row.votes === 1 ? 'vote' : 'votes'}</span>` : ''}
    </div>
  </article>`;
}

function renderRhemaCrossReferences() {
  _rhemaXrefView = 'main';
  _showRhemaXrefShell('main');
  const title = document.getElementById('rxPageTitle');
  if (title) title.textContent = 'Cross References';
  _renderXrefBreadcrumb();
  const body = document.getElementById('rxMainView');
  if (!body) return;
  const key = _xrefKey();
  const book = _rhemaXrefActive.book;
  const rows = _rxRows(key);
  if (!rows) {
    body.innerHTML = _xrefTopCardHtml() + '<div class="rx-loading">Loading cross references…</div>';
    _rxLoadBook(book).then(() => {
      if (_xrefKey() === key && _rhemaXrefView === 'main') renderRhemaCrossReferences();
    }).catch(() => {
      if (_xrefKey() === key) body.innerHTML = _xrefTopCardHtml() + '<div class="rx-loading">Couldn’t load cross references. Check your connection and try again.</div>';
    });
    return;
  }
  const filter = _rxFilter();
  const counts = Object.fromEntries(RX_FILTERS.map(f => [f.key, f.key === 'best' ? Math.min(12, rows.length) : _rxFiltered(rows, f.key).length]));
  const chips = RX_FILTERS.filter(f => f.key === 'best' || f.key === 'all' || counts[f.key]).map(f =>
    `<button type="button" role="tab" aria-selected="${f.key === filter}" class="rx-chip${f.key === filter ? ' on' : ''}" onclick="rxSetFilter('${f.key}')">${f.label}${f.key === 'best' ? '' : `<span>${counts[f.key]}</span>`}</button>`).join('');
  const list = _rxFiltered(rows, filter);
  const shown = list.slice(0, filter === 'best' ? 12 : _rxShown);
  const srcSet = _rxWordSet(_xrefTopCardText());
  const cards = shown.map(r => _rxCardHtml(r, rows.indexOf(r), srcSet)).join('');
  const more = list.length > shown.length
    ? `<button type="button" class="rx-more" onclick="rxShowMore()">Show ${Math.min(RX_PAGE, list.length - shown.length)} more <span>of ${list.length - shown.length}</span></button>`
    : filter === 'best' && rows.length > shown.length
      ? `<button type="button" class="rx-more" onclick="rxSetFilter('all')">See all ${rows.length} links</button>` : '';
  const inStudy = typeof _rhemaStudyId === 'function' ? _rhemaStudyId() : _studySandboxId;
  const save = inStudy && rows.length ? `<button class="rx-save-trail-btn" onclick="saveCurrentRhemaTrail()"><span class="material-symbols-outlined">bookmark</span>Save trail</button>` : '';
  body.innerHTML = _xrefTopCardHtml() +
    (rows.length ? `<div class="rx-filters" role="tablist" aria-label="Kinds of link">${chips}</div>` : '') +
    `<div class="rx-links">${cards || `<p class="rx-empty">${rows.length ? 'None of this kind for this verse.' : 'No cross references for this verse yet.'}</p>`}</div>` +
    more + save +
    `<p class="rx-credit">Links from OpenBible.info (CC BY), ranked by readers’ votes. Quotes, parallels and shared words are found by comparing the Greek and Hebrew texts. <button type="button" onclick="openRhemaCrossRefInfo()">How this works</button></p>`;
  _xrefLoadAsyncVerseTexts([key, ...shown.map(r => r.ref)]);
}
function rxSetFilter(key) {
  _rhemaXrefCategory = key === 'best' ? null : key;
  _rxShown = RX_PAGE;
  renderRhemaCrossReferences();
  document.querySelector('#rxMainView .rx-filters')?.scrollIntoView({ block: 'nearest' });
}
function rxShowMore() {
  const y = document.getElementById('rxMainView')?.scrollTop;
  _rxShown += RX_PAGE;
  renderRhemaCrossReferences();
  const body = document.getElementById('rxMainView');
  if (body && y != null) body.scrollTop = y;
}
// Old entry points: a "category" is now a filter on the same screen.
function openRhemaXrefCategory(key) { rxSetFilter(RX_OLD_CATEGORY[key] || key); }
function renderRhemaXrefTrail() { renderRhemaCrossReferences(); }

// Side by side: the verse you're on and the linked one, shared words marked.
function rxCompare(i) {
  const rows = _rxRows() || [];
  const row = rows[i];
  if (!row) return;
  const src = _xrefKey();
  const esc = _xrefEscape;
  const a = _xrefTopCardText();
  const b = _xrefRefText(row.ref);
  const k = RX_KIND[row.kind] || RX_KIND[''];
  const js = String(row.ref).replace(/'/g, "\\'");
  document.getElementById('rxCompareSheet')?.remove();
  const ov = document.createElement('div');
  ov.id = 'rxCompareSheet';
  ov.className = 'rx-compare-ov';
  ov.addEventListener('click', e => { if (e.target === ov) rxCloseCompare(); });
  ov.innerHTML = `<div class="rx-compare" role="dialog" aria-label="Compare verses">
    <div class="rx-compare-hd"><strong>Compare</strong><button type="button" class="rx-icon-btn" onclick="rxCloseCompare()" aria-label="Close"><span class="material-symbols-outlined">close</span></button></div>
    <div class="rx-compare-v"><span>${esc(_xrefDisplay(src))}</span><p>${_rxHighlight(a, b)}</p></div>
    <div class="rx-compare-why rx-k-${k.cls}"><span class="material-symbols-outlined">${k.icon}</span>${esc(_rxWhy(row, src))}</div>
    <div class="rx-compare-v"><span>${esc(_xrefDisplay(row.ref))}</span><p>${_rxHighlight(b, a)}</p></div>
    <p class="rx-compare-note">Highlighted: words the two verses share in the ${esc(_xrefEnglishLabel())}.</p>
    <div class="rx-compare-actions">
      <button type="button" onclick="rxCloseCompare();rhemaXrefFollow('${js}')"><span class="material-symbols-outlined">alt_route</span>Its links</button>
      <button type="button" class="primary" onclick="rxCloseCompare();rxOpenInReader('${js}')"><span class="material-symbols-outlined">menu_book</span>Read it</button>
    </div>
  </div>`;
  document.getElementById('rhemaXrefPage')?.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('open'));
}
function rxCloseCompare() {
  const ov = document.getElementById('rxCompareSheet');
  if (!ov) return;
  ov.classList.remove('open');
  setTimeout(() => ov.remove(), 220);
}
// Go read the linked verse in the reader.
function rxOpenInReader(ref) {
  const p = _xrefParseRef(ref);
  if (!p) return;
  const inVsCtx = typeof _vsXrefContext !== 'undefined' && _vsXrefContext;
  if (inVsCtx) { rhemaXrefFollow(ref); return; }
  rxCloseCompare();
  _closeRhemaXrefShell();
  if (typeof jumpToRhemaVerse === 'function') jumpToRhemaVerse(p.book, p.chapter, p.verse);
}

function rhemaXrefFollow(ref) {
  const full = _xrefParseRef(ref);
  if (!full) return;
  const parsed = { book: full.book, chapter: full.chapter, verse: full.verse };
  rxCloseCompare();
  _rxShown = RX_PAGE;
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
  _rhemaXrefCategory = !target && category ? (RX_OLD_CATEGORY[category] || category) : null;
  _rhemaXrefView = 'main';
  _rxShown = RX_PAGE;
  if (typeof syncRhemaPicker === 'function') syncRhemaPicker();
  renderRhemaCrossReferences();
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
  if (document.getElementById('rxCompareSheet')) { rxCloseCompare(); return; }
  if (_rhemaXrefCategory) {
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
  _rhemaXrefView = 'main';
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
  const uid = window.Auth?.getCurrentUser()?.uid;
  const studyId = uid ? await _rhemaRequireStudy() : null;
  if (!uid || !studyId) return;
  const filter = _rxFilter();
  const label = RX_FILTERS.find(f => f.key === filter)?.label || 'Best';
  const refs = _rxFiltered(_rxRows() || [], filter).map(row => ({
    reference: _xrefDisplay(row.ref),
    rawRef: row.ref,
    label: _rxWhy(row, _xrefKey()),
    text: _xrefEnglishText(row.ref),
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
    categoryKey: filter,
    categoryPath: `Cross references · ${label}`,
    translation: _xrefEnglishLabel(),
    breadcrumbTrail: _rhemaXrefBreadcrumb.map(_xrefDisplay),
    rawBreadcrumbTrail: [..._rhemaXrefBreadcrumb],
    connections: refs
  };
  const displayName = localStorage.getItem('authDisplayName') || localStorage.getItem('authUsername') || 'Anonymous';
  const ok = await window.Studies?.saveTrail?.(studyId, uid, displayName, trail);
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
  const savedFilter = RX_OLD_CATEGORY[trail.categoryKey] || trail.categoryKey;
  _rhemaXrefCategory = savedFilter && savedFilter !== 'best' ? savedFilter : null;
  _rhemaBook = active.book;
  _rhemaChapter = active.chapter;
  _rhemaVerse = active.verse;
  _rhemaXrefView = 'main';
  // The reader's own study: the reader is already open behind the Trails tool.
  if (!_studySandboxId && document.getElementById('rhemaModal')?.classList.contains('open')) {
    if (document.getElementById('studySandbox')?.classList.contains('tool-host')) closeStudyToolHost();
    _rhemaChapter = String(active.chapter);
    _rhemaVerse = String(active.verse);
    _rhemaFullChapter = true;
    renderRhemaVerse();
    _showRhemaXrefShell('main');
    renderRhemaXrefTrail();
    return;
  }
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
  rxTrailSaveDismiss,
  rxSetFilter,
  rxShowMore,
  rxCompare,
  rxCloseCompare,
  rxOpenInReader
});
