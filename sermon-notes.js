/* ══════════════════════════════════════════════════════════════════════════
   SERMON NOTES  —  a premium, self-contained sermon note-taking studio.

   Everything lives in one IIFE. The only global it exposes is
   window.openSermonNotes(launcher), called by the Tools tile on the home
   screen. The full UI (page shell, sheets, toast) is injected on first open,
   so index.html stays untouched beyond the tile + <script>/<link> tags.

   Data is persisted to localStorage under SN_KEY. Audio blobs are kept in
   memory for the session (they are far too large for localStorage), while the
   timestamps captured against them are saved with the notes.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SN_KEY = 'rhemaSermonNotes.v1';
  const uid = () => 'sn' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const nowISO = () => new Date().toISOString();

  /* ───────── Persistence ───────── */
  function loadStore() {
    try {
      const raw = localStorage.getItem(SN_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { sermons: [], templates: [] };
  }
  let store = loadStore();
  let saveTimer = null;
  function persist(immediate) {
    clearTimeout(saveTimer);
    const write = () => {
      try {
        localStorage.setItem(SN_KEY, JSON.stringify(store));
      } catch (e) {
        // Quota — most likely a large drawing dataURL. Drop drawings and retry.
        try {
          const slim = JSON.parse(JSON.stringify(store));
          slim.sermons.forEach(s => { s.drawing = ''; });
          localStorage.setItem(SN_KEY, JSON.stringify(slim));
          toast('Storage full — drawings not saved');
        } catch (e2) {}
      }
    };
    if (immediate) write(); else saveTimer = setTimeout(write, 500);
  }

  /* ───────── Model helpers ───────── */
  function newSermon(fromTemplate) {
    const t = fromTemplate || {};
    return {
      id: uid(),
      title: t.title || '',
      passage: t.passage || '',
      speaker: t.speaker || '',
      date: nowISO(),
      paper: t.paper || 'dotted',
      font: t.font || 'clean',
      penColor: t.penColor || '#6d4bd8',
      mainIdea: '',
      outline: (t.outline || []).map(o => ({ id: uid(), title: o.title || '', passages: o.passages || '', notes: '' })),
      activePoint: 0,
      following: false,
      blocks: [],
      stickies: [],
      decorations: [],
      verses: [],
      takeaways: (t.takeaways || []).map(x => ({ id: uid(), text: x, done: false })),
      bookmarks: [],
      drawing: '',
      canvasH: 0,
      audioSegments: [], // [{ id, startAt, duration }] — blobs live in IndexedDB by id
      audioTotal: 0,     // continuous timeline length across all segments (seconds)
      heard: [],         // auto-caught spoken Bible references
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
  }
  function getSermon(id) { return store.sermons.find(s => s.id === id); }
  function touch(s) { s.updatedAt = nowISO(); persist(); }
  // Bring older sermons up to the multi-segment audio model.
  function migrateSermon(s) {
    if (!s) return s;
    if (!Array.isArray(s.audioSegments)) s.audioSegments = [];
    if (s.hasAudio && s.audioSegments.length === 0) {
      s.audioSegments = [{ id: s.id, startAt: 0, duration: s.audioDuration || 0 }];
    }
    if (typeof s.audioTotal !== 'number') s.audioTotal = s.audioSegments.reduce((a, x) => a + (x.duration || 0), 0);
    if (!Array.isArray(s.heard)) s.heard = [];
    delete s.hasAudio; delete s.audioDuration;
    return s;
  }

  /* ───────── Tiny DOM builder ───────── */
  function el(tag, props, kids) {
    const n = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'class') n.className = props[k];
      else if (k === 'html') n.innerHTML = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k === 'style' && typeof props[k] === 'object') Object.assign(n.style, props[k]);
      else if (k.startsWith('on') && typeof props[k] === 'function') n.addEventListener(k.slice(2), props[k]);
      else if (k === 'data') for (const d in props[k]) n.dataset[d] = props[k][d];
      else if (props[k] != null && props[k] !== false) n.setAttribute(k, props[k] === true ? '' : props[k]);
    }
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  const icon = name => el('span', { class: 'material-symbols-outlined', text: name });

  /* ───────── Toast ───────── */
  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById('snToast');
    // Must live INSIDE #sermonNotesPage so the scoped --sn-* theme vars resolve.
    if (!t) { t = el('div', { class: 'sn-toast', id: 'snToast' }); (page || document.body).appendChild(t); }
    t.textContent = msg;
    t.classList.add('sn-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('sn-show'), 2200);
  }

  /* ───────── In-app dialogs (premium replacements for prompt/confirm) ───────── */
  function dialogScrim(build, onCancel) {
    const existing = document.getElementById('snDialogScrim');
    if (existing) existing.remove();
    const box = el('div', { class: 'sn-dialog', onclick: e => e.stopPropagation() });
    build(box);
    const scrim = el('div', { class: 'sn-sheet-scrim sn-center', id: 'snDialogScrim',
      onclick: e => { if (e.target === scrim && onCancel) onCancel(); } }, [box]);
    (page || document.body).appendChild(scrim);
    requestAnimationFrame(() => scrim.classList.add('sn-open'));
    return scrim;
  }
  function closeDialog() {
    const s = document.getElementById('snDialogScrim');
    if (!s) return;
    s.classList.remove('sn-open');
    setTimeout(() => s.remove(), 240);
  }
  // Returns a Promise resolving to the entered string, or null if cancelled.
  function snPrompt(opts) {
    return new Promise(resolve => {
      let input;
      const done = val => { closeDialog(); resolve(val); };
      dialogScrim(box => {
        box.appendChild(el('div', { class: 'sn-dialog-icon' }, [icon(opts.icon || 'edit')]));
        box.appendChild(el('h3', { text: opts.title || 'Enter a value' }));
        if (opts.message) box.appendChild(el('p', { text: opts.message }));
        input = el('input', { class: 'sn-dialog-input', type: 'text', value: opts.value || '', placeholder: opts.placeholder || '' });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') done(input.value.trim()); });
        box.appendChild(input);
        box.appendChild(el('div', { class: 'sn-dialog-actions' }, [
          el('button', { class: 'sn-dialog-btn sn-cancel', text: 'Cancel', onclick: () => done(null) }),
          el('button', { class: 'sn-dialog-btn sn-ok', text: opts.ok || 'Save', onclick: () => done(input.value.trim()) })
        ]));
      }, () => done(null));
      setTimeout(() => { if (input) { input.focus(); input.select(); } }, 120);
    });
  }
  // Returns a Promise resolving true (confirmed) / false (cancelled).
  function snConfirm(opts) {
    return new Promise(resolve => {
      const done = val => { closeDialog(); resolve(val); };
      dialogScrim(box => {
        box.appendChild(el('div', { class: 'sn-dialog-icon' + (opts.danger ? ' sn-danger' : '') }, [icon(opts.icon || (opts.danger ? 'warning' : 'help'))]));
        box.appendChild(el('h3', { text: opts.title || 'Are you sure?' }));
        if (opts.message) box.appendChild(el('p', { text: opts.message }));
        box.appendChild(el('div', { class: 'sn-dialog-actions' }, [
          el('button', { class: 'sn-dialog-btn sn-cancel', text: opts.cancel || 'Cancel', onclick: () => done(false) }),
          el('button', { class: 'sn-dialog-btn sn-ok' + (opts.danger ? ' sn-danger' : ''), text: opts.ok || 'Confirm', onclick: () => done(true) })
        ]));
      }, () => done(false));
    });
  }

  /* ───────── IndexedDB audio storage ─────────
     Recordings are far too large for localStorage, but IndexedDB gets a much
     larger quota (typically tens–hundreds of MB), so full sermon audio persists
     per device. Metadata still lives in localStorage; blobs live here keyed by
     sermon id. Everything degrades gracefully if IndexedDB is unavailable. */
  const AUDIO_DB = 'rhemaSermonAudio', AUDIO_STORE = 'clips';
  let _dbPromise = null;
  function audioDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject('no-idb');
      const req = indexedDB.open(AUDIO_DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(AUDIO_STORE)) req.result.createObjectStore(AUDIO_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
    return _dbPromise;
  }
  async function saveAudioBlob(id, blob) {
    const db = await audioDB(); if (!db) return false;
    return new Promise(res => {
      try {
        const tx = db.transaction(AUDIO_STORE, 'readwrite');
        tx.objectStore(AUDIO_STORE).put(blob, id);
        tx.oncomplete = () => res(true); tx.onerror = () => res(false);
      } catch (e) { res(false); }
    });
  }
  async function loadAudioBlob(id) {
    const db = await audioDB(); if (!db) return null;
    return new Promise(res => {
      try {
        const tx = db.transaction(AUDIO_STORE, 'readonly');
        const rq = tx.objectStore(AUDIO_STORE).get(id);
        rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  }
  async function deleteAudioBlob(id) {
    const db = await audioDB(); if (!db) return;
    try { const tx = db.transaction(AUDIO_STORE, 'readwrite'); tx.objectStore(AUDIO_STORE).delete(id); } catch (e) {}
  }

  /* ───────── Verse recognition ───────── */
  const BOOKS = '(?:(?:1|2|3|I|II|III)\\s?)?(?:Genesis|Gen|Exodus|Exod|Exo|Leviticus|Lev|Numbers|Num|Deuteronomy|Deut|Joshua|Josh|Judges|Judg|Ruth|Samuel|Sam|Kings|Kgs|Chronicles|Chron|Chr|Ezra|Nehemiah|Neh|Esther|Esth|Job|Psalms|Psalm|Pss|Ps|Proverbs|Prov|Ecclesiastes|Eccles|Eccl|Song of Songs|Song of Solomon|Song|Isaiah|Isa|Jeremiah|Jer|Lamentations|Lam|Ezekiel|Ezek|Daniel|Dan|Hosea|Hos|Joel|Amos|Obadiah|Obad|Jonah|Micah|Mic|Nahum|Nah|Habakkuk|Hab|Zephaniah|Zeph|Haggai|Hag|Zechariah|Zech|Malachi|Mal|Matthew|Matt|Mark|Luke|John|Acts|Romans|Rom|Corinthians|Cor|Galatians|Gal|Ephesians|Eph|Philippians|Phil|Colossians|Col|Thessalonians|Thess|Timothy|Tim|Titus|Philemon|Phlm|Hebrews|Heb|James|Jas|Peter|Pet|Jude|Revelation|Rev)';
  const VERSE_RE = new RegExp('\\b' + BOOKS + '\\.?\\s+\\d+(?::\\d+(?:[-–]\\d+)?)?\\b', 'g');
  function findVerses(text) {
    if (!text) return [];
    const out = [];
    let m;
    VERSE_RE.lastIndex = 0;
    while ((m = VERSE_RE.exec(text)) !== null) out.push(m[0].replace(/\s+/g, ' ').trim());
    return out;
  }
  // ── Reference → Rhema book code resolution ──────────────────────────────
  // Build a lookup of normalized book name / abbreviation → Rhema code, from the
  // app's own tables plus common abbreviations, so typed refs resolve reliably.
  let _bookLookup = null;
  function bookLookup() {
    if (_bookLookup) return _bookLookup;
    const map = {};
    const norm = t => String(t).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    const names = window.RhemaBookNames || {};
    const abbr = window.RhemaBookAbbr || {};
    Object.keys(names).forEach(code => { map[norm(names[code])] = code; });
    Object.keys(abbr).forEach(code => { if (abbr[code]) map[norm(abbr[code])] = code; });
    // Hand-rolled common abbreviations / alternates (roman numerals, short forms).
    const extra = {
      'gen': 'GEN', 'ex': 'EXO', 'exod': 'EXO', 'lev': 'LEV', 'num': 'NUM', 'deut': 'DEU', 'dt': 'DEU',
      'josh': 'JOS', 'judg': 'JDG', 'ps': 'PSA', 'psalm': 'PSA', 'psalms': 'PSA', 'prov': 'PRO', 'eccl': 'ECC',
      'song': 'SNG', 'song of songs': 'SNG', 'isa': 'ISA', 'jer': 'JER', 'ezek': 'EZK', 'dan': 'DAN',
      'matt': 'MAT', 'mt': 'MAT', 'mk': 'MAR', 'mark': 'MAR', 'lk': 'LUK', 'jn': 'JOH', 'john': 'JOH',
      'rom': 'ROM', '1 cor': '1CO', '2 cor': '2CO', 'i cor': '1CO', 'ii cor': '2CO',
      'gal': 'GAL', 'eph': 'EPH', 'phil': 'PHP', 'php': 'PHP', 'col': 'COL',
      '1 thess': '1TH', '2 thess': '2TH', '1 tim': '1TI', '2 tim': '2TI', 'philem': 'PHM', 'phlm': 'PHM',
      'heb': 'HEB', 'jas': 'JAM', '1 pet': '1PE', '2 pet': '2PE', '1 jn': '1JO', '2 jn': '2JO', '3 jn': '3JO',
      'rev': 'REV'
    };
    Object.keys(extra).forEach(k => { if (!map[k]) map[k] = extra[k]; });
    _bookLookup = map;
    return map;
  }
  // Parse "Philippians 2:5" / "1 Cor 13:4-7" → { code, chapter, verse, name }.
  function parseRef(ref) {
    if (!ref) return null;
    const m = String(ref).trim().match(/^((?:[1-3]|i{1,3})\s?)?([A-Za-z][A-Za-z. ]*?)\s+(\d+)(?::(\d+))?/i);
    if (!m) return null;
    const bookName = ((m[1] || '') + (m[2] || '')).replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const code = bookLookup()[bookName];
    if (!code) return null;
    return { code, chapter: parseInt(m[3], 10), verse: m[4] ? parseInt(m[4], 10) : 1, name: window.RhemaBookNames?.[code] || bookName };
  }

  // ── Open a reference in Rhema, with a Back button returning to Sermon Notes ──
  let _snRhemaReturn = false;
  function openVerseRef(ref) {
    const p = parseRef(ref);
    const setter = window.snSetRhemaVerse || window.jumpToRhemaVerse;
    if (!p || typeof showRhema !== 'function' || typeof setter !== 'function') { toast('📖 ' + ref); return false; }
    _snRhemaReturn = true;
    const backBtn = document.getElementById('rhemaSermonNotesBackBtn');
    const homeBtn = document.querySelector('#rhemaSlide .rhema-back-btn');
    if (backBtn) backBtn.classList.remove('hidden');
    if (homeBtn) homeBtn.classList.add('hidden');
    // Rhema's modal (z-index 1000) sits ABOVE the Sermon Notes page (945), so we
    // open it straight on top — it slides up over the Verses view. Sermon Notes
    // stays mounted underneath, so there's no flash of the Home screen and it's
    // revealed again when Rhema slides back down on Back. snSetRhemaVerse opens
    // the verse as the plain main view WITHOUT adding to the breadcrumb trail.
    Promise.resolve(showRhema()).then(() => {
      try { setter(p.code, p.chapter, p.verse); } catch (e) {}
    }).catch(() => {});
    return true;
  }
  // Wired to the Rhema header Back button (added in index.html).
  window._snRhemaBack = function () {
    const backBtn = document.getElementById('rhemaSermonNotesBackBtn');
    const homeBtn = document.querySelector('#rhemaSlide .rhema-back-btn');
    if (backBtn) backBtn.classList.add('hidden');
    if (homeBtn) homeBtn.classList.remove('hidden');
    _snRhemaReturn = false;
    // Make sure Sermon Notes is visible on the Verses tab underneath before Rhema
    // slides away (it normally stayed mounted, but guard the edge case).
    if (page && page.classList.contains('sn-hidden')) {
      activeTab = 'verses';
      page.classList.remove('sn-hidden');
      page.classList.add('sn-open');
      if (current) renderEditor(); else openLibrary();
    }
    // Slide Rhema down to reveal Sermon Notes (mirrors the app's own close anim).
    const modal = document.getElementById('rhemaModal');
    if (modal && modal.classList.contains('open')) {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { modal.classList.remove('open'); }
      else {
        modal.classList.add('rhema-nav-leave');
        setTimeout(() => modal.classList.remove('open', 'rhema-nav-leave'), 320);
      }
    }
    if (typeof showBottomNav === 'function') showBottomNav();
  };

  /* ══════════════════════════════════════════════════════════════════════
     PAGE SHELL
     ══════════════════════════════════════════════════════════════════════ */
  let page, launchRect = null, current = null; // current = active sermon id (editor) or null (library)
  let activeTab = 'notes';
  let versesSub = 'added'; // 'added' | 'heard'

  function buildShell() {
    if (page) return;
    page = el('section', { class: 'sn-hidden', id: 'sermonNotesPage' }, [
      el('div', { class: 'sn-scroll', id: 'snScroll' })
    ]);
    document.body.appendChild(page);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && page && !page.classList.contains('sn-hidden')) {
        if (document.querySelector('.sn-sheet-scrim.sn-open')) closeSheet();
        else if (current) openLibrary();
        else closeSermonNotes();
      }
    });
    // Tapping an auto-detected verse chip in the notes opens it in Rhema.
    page.addEventListener('click', e => {
      const chip = e.target.closest && e.target.closest('.sn-verse-chip');
      if (chip && chip.dataset.ref) { e.preventDefault(); openVerseRef(chip.dataset.ref); }
    });
    // Recording guards: if the tab is backgrounded or the app is closed while
    // recording, flush the current segment so it's saved (never lost).
    const flushIfRecording = () => { if (audioState.recording) { const s = getSermon(current); if (s) stopRecording(s).then(() => refreshAudio(s)); } };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushIfRecording();
      else if (audioState.recording) acquireWakeLock(); // wake lock drops when hidden
    });
    window.addEventListener('pagehide', flushIfRecording);
    window.addEventListener('beforeunload', e => {
      if (audioState.recording) { flushIfRecording(); e.preventDefault(); e.returnValue = ''; return ''; }
    });
  }

  window.openSermonNotes = function (launcher) {
    buildShell();
    try { launchRect = launcher ? launcher.getBoundingClientRect() : null; } catch (e) { launchRect = null; }
    store = loadStore();
    openLibrary();
    page.classList.remove('sn-hidden');
    requestAnimationFrame(() => page.classList.add('sn-open'));
  };

  window.closeSermonNotes = function () {
    if (!page) return;
    resetAudioSession();
    page.classList.remove('sn-open');
    setTimeout(() => page && page.classList.add('sn-hidden'), 280);
  };

  function scrollEl() { return document.getElementById('snScroll'); }

  /* ══════════════════════════════════════════════════════════════════════
     LIBRARY VIEW
     ══════════════════════════════════════════════════════════════════════ */
  function openLibrary() {
    current = null;
    const root = scrollEl();
    root.innerHTML = '';
    root.scrollTop = 0;

    const hero = el('div', { class: 'sn-lib-hero' }, [
      el('h1', { text: 'Sermon Notes' }),
      el('p', { text: 'A living notebook for every message — outline, capture, draw, and turn Sunday into something you actually keep.' }),
      el('div', { class: 'sn-lib-actions' }, [
        el('button', { class: 'sn-lib-new', onclick: () => createAndOpen() }, [icon('add'), 'New Sermon']),
        el('button', { class: 'sn-lib-new sn-ghost', onclick: openTemplateSheet }, [icon('bookmarks'), 'Templates'])
      ])
    ]);

    const wrap = el('div', { class: 'sn-lib' }, [
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' } }, [
        el('button', { class: 'sn-iconbtn', onclick: closeSermonNotes, 'aria-label': 'Close' }, [icon('arrow_back')]),
        el('strong', { text: 'Your notebook', style: { fontSize: '.95rem', color: 'var(--sn-muted)' } })
      ]),
      hero
    ]);

    if (!store.sermons.length) {
      wrap.appendChild(el('div', { class: 'sn-empty' }, [icon('auto_stories'), el('p', { text: 'No sermons yet. Tap “New Sermon” before the message starts.' })]));
    } else {
      wrap.appendChild(el('div', { class: 'sn-lib-section', text: 'Recent' }));
      const list = el('div', { class: 'sn-lib-list' });
      store.sermons.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).forEach(s => {
        list.appendChild(libCard(s));
      });
      wrap.appendChild(list);
    }
    root.appendChild(wrap);
  }

  function libCard(s) {
    const d = s.date ? new Date(s.date) : null;
    const dateStr = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const meta = el('div', { class: 'sn-lib-card-meta' });
    if (s.passage) meta.appendChild(el('span', { class: 'sn-chip', text: s.passage }));
    meta.appendChild(el('span', { class: 'sn-chip', text: (s.outline.length || 0) + ' pts' }));
    meta.appendChild(el('span', { class: 'sn-chip', text: (s.verses.length || 0) + ' verses' }));
    return el('div', { class: 'sn-lib-card', onclick: () => openEditor(s.id) }, [
      el('div', { class: 'sn-lib-card-icon' }, [icon('edit_note')]),
      el('div', { class: 'sn-lib-card-main' }, [
        el('strong', { text: s.title || 'Untitled sermon' }),
        el('small', { text: (s.speaker ? s.speaker + ' · ' : '') + dateStr }),
        meta
      ]),
      el('button', {
        class: 'sn-lib-card-del', 'aria-label': 'Delete',
        onclick: (e) => { e.stopPropagation(); confirmDelete(s); }
      }, [icon('delete')])
    ]);
  }

  function createAndOpen(tpl) {
    const s = newSermon(tpl);
    store.sermons.unshift(s);
    persist(true);
    openEditor(s.id);
  }
  async function confirmDelete(s) {
    const ok = await snConfirm({ title: 'Delete this sermon?', message: '“' + (s.title || 'Untitled sermon') + '” and its notes will be permanently removed.', ok: 'Delete', danger: true, icon: 'delete' });
    if (!ok) return;
    store.sermons = store.sermons.filter(x => x.id !== s.id);
    (s.audioSegments || []).forEach(seg => deleteAudioBlob(seg.id));
    deleteAudioBlob(s.id); // legacy single-blob key
    persist(true);
    openLibrary();
    toast('Sermon deleted');
  }

  /* ══════════════════════════════════════════════════════════════════════
     EDITOR VIEW
     ══════════════════════════════════════════════════════════════════════ */
  function openEditor(id) {
    current = id;
    activeTab = 'notes';
    // Fully reset the audio engine for the sermon we're opening.
    resetAudioSession();
    const s = getSermon(id);
    if (s) migrateSermon(s);
    renderEditor();
    // Preload every saved segment's blob → object URL so playback is instant.
    if (s && s.audioSegments.length) {
      Promise.all(s.audioSegments.map(seg =>
        loadAudioBlob(seg.id).then(blob => { if (blob) audioState.segUrls[seg.id] = URL.createObjectURL(blob); })
      )).then(() => {
        if (current === id) refreshAudio(s);
      });
    }
  }

  function renderEditor() {
    const s = getSermon(current);
    if (!s) return openLibrary();
    const root = scrollEl();
    root.innerHTML = '';
    root.scrollTop = 0;

    // Header
    const header = el('div', { class: 'sn-header' }, [
      el('button', { class: 'sn-iconbtn', 'aria-label': 'Back to library', onclick: openLibrary }, [icon('arrow_back')]),
      el('div', { class: 'sn-head-titles' }, [
        el('input', { class: 'sn-head-title', placeholder: 'Sermon title…', value: s.title,
          oninput: e => { s.title = e.target.value; touch(s); } }),
        el('input', { class: 'sn-head-sub', placeholder: 'Passage · Speaker', value: [s.passage, s.speaker].filter(Boolean).join('  ·  '),
          onchange: e => { const parts = e.target.value.split('·'); s.passage = (parts[0] || '').trim(); s.speaker = (parts[1] || '').trim(); touch(s); } })
      ]),
      el('button', { class: 'sn-live-pill', onclick: openMoreSheet }, [icon('more_horiz'), 'More'])
    ]);

    // Tabs
    const tabs = el('div', { class: 'sn-tabs' }, ['notes', 'outline', 'verses', 'takeaways'].map(t =>
      el('button', { class: 'sn-tab' + (t === activeTab ? ' sn-active' : ''), text: t.charAt(0).toUpperCase() + t.slice(1),
        onclick: () => { activeTab = t; renderTabBody(s); syncTabs(); } })
    ));

    const body = el('div', { id: 'snTabBody' });
    root.appendChild(el('div', { class: 'sn-topbar' }, [header, tabs]));
    root.appendChild(body);
    renderTabBody(s);
  }

  function syncTabs() {
    document.querySelectorAll('.sn-tab').forEach(t =>
      t.classList.toggle('sn-active', t.textContent.toLowerCase() === activeTab));
  }

  function renderTabBody(s) {
    const body = document.getElementById('snTabBody');
    body.innerHTML = '';
    if (activeTab === 'notes') body.appendChild(renderNotes(s));
    else if (activeTab === 'outline') body.appendChild(renderOutline(s));
    else if (activeTab === 'verses') body.appendChild(renderVerses(s));
    else if (activeTab === 'takeaways') body.appendChild(renderTakeaways(s));
  }

  /* ───────── NOTES TAB ───────── */
  let drawTool = null; // null | pen | marker | highlighter | eraser | shape
  function renderNotes(s) {
    const wrap = el('div', { class: 'sn-paper-wrap' });

    // Audio timeline
    wrap.appendChild(renderAudio(s));

    // Current point indicator
    wrap.appendChild(renderCurrentPoint(s));

    // The paper canvas
    const canvas = el('div', { class: 'sn-canvas paper-' + s.paper + ' font-' + s.font, id: 'snCanvas' });
    if (s.canvasH) canvas.style.minHeight = s.canvasH + 'px';

    // Main idea
    const mi = el('div', { class: 'sn-mainidea' }, [
      el('div', { class: 'sn-mainidea-label', text: 'Main Idea' }),
      el('div', { class: 'sn-mainidea-text', contenteditable: 'true', id: 'snMainIdea', html: mdChips(s.mainIdea) })
    ]);
    const miText = mi.querySelector('#snMainIdea');
    miText.addEventListener('focus', () => { miText.textContent = s.mainIdea; });
    miText.addEventListener('blur', () => {
      s.mainIdea = miText.textContent.trim();
      collectVerses(s, s.mainIdea);
      miText.innerHTML = mdChips(s.mainIdea);
      touch(s);
    });
    canvas.appendChild(mi);

    // Blocks (inline + free-floating)
    s.blocks.forEach(b => canvas.appendChild(renderBlock(s, b)));

    // Stickies
    s.stickies.forEach(st => canvas.appendChild(renderSticky(s, st)));

    // Decorations
    s.decorations.forEach(dc => canvas.appendChild(renderDeco(s, dc)));

    // Add-space button (grow the sheet vertically)
    canvas.appendChild(el('button', { class: 'sn-canvas-extend', title: 'Add more space',
      onclick: () => {
        const cur = s.canvasH || canvas.offsetHeight || 640;
        s.canvasH = cur + 360; canvas.style.minHeight = s.canvasH + 'px'; touch(s);
        requestAnimationFrame(() => initDrawing(s));
      } }, [icon('expand_more'), 'Add space']));

    // Drawing layer
    const dc = el('canvas', { class: 'sn-draw-canvas', id: 'snDrawCanvas' });
    canvas.appendChild(dc);

    wrap.appendChild(canvas);

    // Quick capture
    wrap.appendChild(el('div', { class: 'sn-qc-label', text: 'Quick Capture' }));
    const qc = el('div', { class: 'sn-quickcap' }, [
      quickBtn('keypoint', 'star', 'Key Point'),
      quickBtn('question', 'help', 'Question'),
      quickBtn('application', 'target', 'Application'),
      quickBtn('quote', 'format_quote', 'Quote')
    ].map(b => (b.__s = s, b.addEventListener('click', () => addCapture(s, b.dataset.kind)), b)));
    wrap.appendChild(qc);

    // Bottom dock
    wrap.appendChild(renderDock(s));

    // Init drawing after layout settles
    requestAnimationFrame(() => initDrawing(s));
    return wrap;
  }

  function quickBtn(kind, ic, label) {
    return el('button', { class: 'sn-qc', data: { kind } }, [icon(ic), label]);
  }

  // Main-idea / read-only chips renderer (verse refs → chips)
  function mdChips(text) {
    if (!text) return '';
    return escapeHTML(text).replace(VERSE_RE, m => {
      const ref = m.replace(/\s+/g, ' ').trim();
      return '<span class="sn-verse-chip" contenteditable="false" data-ref="' + escapeAttr(ref) + '"><span class="material-symbols-outlined">menu_book</span>' + escapeHTML(ref) + '</span>';
    });
  }
  function escapeHTML(t) { return String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function escapeAttr(t) { return String(t).replace(/"/g, '&quot;'); }

  function addCapture(s, kind) {
    const b = { id: uid(), kind, text: '', x: null, y: null, ts: audioState.recording ? audioElapsed() : null };
    s.blocks.push(b);
    touch(s);
    const canvas = document.getElementById('snCanvas');
    const node = renderBlock(s, b);
    canvas.insertBefore(node, document.getElementById('snDrawCanvas'));
    const body = node.querySelector('.sn-block-body');
    if (body) { body.focus(); }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderBlock(s, b) {
    const tags = {
      keypoint: ['star', 'Key Point'], question: ['help', 'Question'],
      application: ['target', 'Application'], quote: ['format_quote', 'Quote'], note: ['notes', 'Note']
    };
    const tg = tags[b.kind] || tags.note;
    const node = el('div', { class: 'sn-block' + (b.x != null ? ' sn-free' : ''), data: { kind: b.kind, id: b.id } });
    if (b.x != null) { node.style.left = b.x + 'px'; node.style.top = b.y + 'px'; }
    node.appendChild(el('span', { class: 'sn-block-tag' }, [icon(tg[0]), tg[1]]));
    const body = el('div', { class: 'sn-block-body', contenteditable: 'true', data: { ph: 'Write ' + tg[1].toLowerCase() + '…' }, html: mdChips(b.text) });
    body.addEventListener('focus', () => { body.textContent = b.text; });
    body.addEventListener('blur', () => {
      b.text = body.textContent.trim();
      collectVerses(s, b.text);
      body.innerHTML = mdChips(b.text);
      if (!b.text && b.kind === 'note') { /* keep */ }
      touch(s);
    });
    node.appendChild(body);
    // timestamp
    if (b.ts != null) {
      node.appendChild(el('div', { class: 'sn-block-ts', onclick: () => seekAudio(b.ts) }, [icon('schedule'), fmtTime(b.ts)]));
    }
    // grip: drag to move, press-and-hold to delete
    const grip = el('div', { class: 'sn-block-grip', title: 'Drag to move · hold to delete' }, [icon('drag_indicator')]);
    node.appendChild(grip);
    const deleteBlock = async () => {
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
      const ok = await snConfirm({ title: 'Delete this block?', message: 'Remove this ' + tg[1].toLowerCase() + '.', ok: 'Delete', danger: true, icon: 'delete' });
      if (ok) { s.blocks = s.blocks.filter(x => x.id !== b.id); node.remove(); touch(s); }
    };
    enableDrag(node, grip, s, (x, y) => { b.x = x; b.y = y; touch(s); }, { onLongPress: deleteBlock });
    grip.addEventListener('dblclick', deleteBlock); // desktop shortcut
    return node;
  }

  /* ───────── Sticky notes ───────── */
  function renderSticky(s, st) {
    const node = el('div', { class: 'sn-sticky ' + (st.color || ''), data: { id: st.id } });
    node.style.left = (st.x || 20) + 'px';
    node.style.top = (st.y || 20) + 'px';
    const grip = el('div', { class: 'sn-sticky-grip' }, [icon('drag_indicator')]);
    const body = el('div', { class: 'sn-sticky-body', contenteditable: 'true', text: st.text || '' });
    body.addEventListener('blur', () => { st.text = body.textContent.trim(); touch(s); });
    node.appendChild(grip);
    node.appendChild(el('button', { class: 'sn-sticky-x', 'aria-label': 'Remove', text: '×',
      onclick: () => { s.stickies = s.stickies.filter(x => x.id !== st.id); node.remove(); touch(s); } }));
    node.appendChild(body);
    enableDrag(node, grip, s, (x, y) => { st.x = x; st.y = y; touch(s); });
    return node;
  }
  function addSticky(s, color) {
    const st = { id: uid(), text: '', color: color || '', x: 24 + Math.round(Math.random() * 40), y: 60 + Math.round(Math.random() * 60) };
    s.stickies.push(st); touch(s);
    const canvas = document.getElementById('snCanvas');
    if (canvas) { canvas.insertBefore(renderSticky(s, st), document.getElementById('snDrawCanvas')); }
  }

  /* ───────── Decorations ───────── */
  function renderDeco(s, dcm) {
    const node = el('div', { class: 'sn-deco', data: { id: dcm.id }, text: dcm.emoji });
    node.style.left = (dcm.x || 40) + 'px';
    node.style.top = (dcm.y || 40) + 'px';
    enableDrag(node, node, s, (x, y) => { dcm.x = x; dcm.y = y; touch(s); });
    node.addEventListener('dblclick', () => { s.decorations = s.decorations.filter(x => x.id !== dcm.id); node.remove(); touch(s); });
    return node;
  }
  function addDeco(s, emoji) {
    const d = { id: uid(), emoji, x: 40 + Math.round(Math.random() * 80), y: 80 + Math.round(Math.random() * 80) };
    s.decorations.push(d); touch(s);
    const canvas = document.getElementById('snCanvas');
    if (canvas) canvas.insertBefore(renderDeco(s, d), document.getElementById('snDrawCanvas'));
    toast('Double-tap a sticker to remove it');
  }

  /* ───────── Dragging (pointer) ─────────
     Bulletproof drag: listeners live on window during the gesture and are
     always cleaned up, so a block can never get "stuck" un-movable (the old
     setPointerCapture-on-handle approach could leave a dangling capture after
     editing text). A small move threshold means a tap never nudges the block,
     and a press-and-hold with no movement fires onLongPress (used to delete). */
  function enableDrag(node, handle, s, onEnd, opts) {
    opts = opts || {};
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', e => {
      if (drawTool) return;                       // drawing mode owns the pointer
      if (e.button != null && e.button > 0) return;
      const canvas = document.getElementById('snCanvas');
      if (!canvas) return;
      // Drop any active text caret so selection can't fight the drag.
      if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
      const pid = e.pointerId, startX = e.clientX, startY = e.clientY;
      const nr = node.getBoundingClientRect();
      const ox = startX - nr.left, oy = startY - nr.top;
      let started = false;
      let lpTimer = opts.onLongPress ? setTimeout(() => {
        if (!started) { cleanup(); opts.onLongPress(); }
      }, 550) : null;
      const move = ev => {
        if (ev.pointerId !== pid) return;
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!started) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          started = true;
          clearTimeout(lpTimer);
          node.classList.add('sn-free');
          if (opts.onStart) opts.onStart();
          node.style.zIndex = 60;
        }
        const cr = canvas.getBoundingClientRect();
        let x = ev.clientX - cr.left - ox;
        let y = ev.clientY - cr.top - oy;
        x = Math.max(0, Math.min(x, canvas.clientWidth - node.offsetWidth));
        y = Math.max(0, Math.min(y, canvas.clientHeight - node.offsetHeight));
        node.style.left = x + 'px'; node.style.top = y + 'px';
        ev.preventDefault();
      };
      const up = ev => {
        if (ev.pointerId !== pid) return;
        cleanup();
        if (started) onEnd(parseInt(node.style.left, 10) || 0, parseInt(node.style.top, 10) || 0);
      };
      function cleanup() {
        clearTimeout(lpTimer);
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
      }
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
    });
  }

  /* ───────── Drawing engine ───────── */
  let drawCtx = null, drawing = false, lastPt = null, snapshot = null, shapeStart = null;
  function initDrawing(s) {
    const canvas = document.getElementById('snCanvas');
    const dc = document.getElementById('snDrawCanvas');
    if (!canvas || !dc) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    dc.width = w * dpr; dc.height = h * dpr;
    dc.style.width = w + 'px'; dc.style.height = h + 'px';
    drawCtx = dc.getContext('2d');
    drawCtx.scale(dpr, dpr);
    drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
    // Restore saved drawing at its natural height-for-width so growing the sheet
    // vertically never stretches existing strokes.
    if (s.drawing) {
      const img = new Image();
      img.onload = () => drawCtx.drawImage(img, 0, 0, w, img.height * (w / img.width));
      img.src = s.drawing;
    }
    dc.onpointerdown = e => {
      if (!drawTool) return;
      drawing = true; dc.setPointerCapture(e.pointerId);
      const p = ptOf(e, dc);
      lastPt = p; shapeStart = p;
      applyBrush();
      if (drawTool === 'shape') snapshot = drawCtx.getImageData(0, 0, dc.width, dc.height);
      else { drawCtx.beginPath(); drawCtx.moveTo(p.x, p.y); drawCtx.lineTo(p.x + 0.1, p.y + 0.1); drawCtx.stroke(); }
      e.preventDefault();
    };
    dc.onpointermove = e => {
      if (!drawing || !drawTool) return;
      const p = ptOf(e, dc);
      if (drawTool === 'shape') {
        drawCtx.putImageData(snapshot, 0, 0);
        drawCtx.beginPath();
        drawCtx.moveTo(shapeStart.x, shapeStart.y);
        drawCtx.lineTo(p.x, p.y);
        drawCtx.stroke();
      } else {
        drawCtx.beginPath();
        drawCtx.moveTo(lastPt.x, lastPt.y);
        drawCtx.lineTo(p.x, p.y);
        drawCtx.stroke();
      }
      lastPt = p;
    };
    const end = () => {
      if (!drawing) return;
      drawing = false;
      drawCtx.globalCompositeOperation = 'source-over';
      drawCtx.globalAlpha = 1;
      saveDrawing(s);
    };
    dc.onpointerup = end;
    dc.onpointercancel = end;
  }
  function ptOf(e, dc) {
    const r = dc.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function applyBrush() {
    const color = getSermon(current).penColor || '#6d4bd8';
    drawCtx.globalCompositeOperation = 'source-over';
    drawCtx.globalAlpha = 1;
    drawCtx.strokeStyle = color;
    if (drawTool === 'pen') drawCtx.lineWidth = 2.4;
    else if (drawTool === 'marker') drawCtx.lineWidth = 6;
    else if (drawTool === 'highlighter') { drawCtx.lineWidth = 18; drawCtx.globalAlpha = 0.32; }
    else if (drawTool === 'shape') drawCtx.lineWidth = 3;
    else if (drawTool === 'eraser') { drawCtx.globalCompositeOperation = 'destination-out'; drawCtx.lineWidth = 22; }
  }
  let drawSaveTimer = null;
  function saveDrawing(s) {
    clearTimeout(drawSaveTimer);
    drawSaveTimer = setTimeout(() => {
      const dc = document.getElementById('snDrawCanvas');
      if (!dc) return;
      try { s.drawing = dc.toDataURL('image/png'); } catch (e) {}
      touch(s);
    }, 400);
  }
  function setDrawTool(tool) {
    drawTool = (drawTool === tool) ? null : tool;
    const canvas = document.getElementById('snCanvas');
    if (canvas) canvas.classList.toggle('sn-drawing', !!drawTool);
    document.querySelectorAll('.sn-tool[data-tool]').forEach(t =>
      t.classList.toggle('sn-tool-on', t.dataset.tool === drawTool));
  }

  /* ───────── Bottom dock ───────── */
  function renderDock(s) {
    const dockInner = el('div', { class: 'sn-dock-inner' }, [
      toolBtn('style', 'grid_view', () => openPaperSheet(s)),
      toolBtn('font', 'text_fields', () => openFontSheet(s)),
      el('div', { class: 'sn-dock-sep' }),
      drawToolBtn('pen', 'edit'),
      drawToolBtn('marker', 'brush'),
      drawToolBtn('highlighter', 'ink_highlighter'),
      drawToolBtn('shape', 'timeline'),
      drawToolBtn('eraser', 'ink_eraser'),
      colorTool(s),
      el('div', { class: 'sn-dock-sep' }),
      toolBtn('sticky', 'sticky_note_2', () => openStickerSheet(s)),
      toolBtn('deco', 'auto_awesome', () => openDecoSheet(s)),
      toolBtn('clear', 'delete_sweep', async () => {
        const ok = await snConfirm({ title: 'Clear drawing?', message: 'Removes all pen, marker and highlighter strokes on this page. Your typed notes stay.', ok: 'Clear', danger: true, icon: 'delete_sweep' });
        if (ok) {
          const dc = document.getElementById('snDrawCanvas');
          if (dc && drawCtx) { drawCtx.clearRect(0, 0, dc.width, dc.height); s.drawing = ''; touch(s); }
        }
      })
    ]);
    return el('div', { class: 'sn-dock' }, [dockInner]);
  }
  function toolBtn(id, ic, fn) { return el('button', { class: 'sn-tool', 'aria-label': id, onclick: fn }, [icon(ic)]); }
  function drawToolBtn(tool, ic) {
    return el('button', { class: 'sn-tool' + (drawTool === tool ? ' sn-tool-on' : ''), data: { tool }, 'aria-label': tool, onclick: () => setDrawTool(tool) }, [icon(ic)]);
  }
  function colorTool(s) {
    const swatch = el('span', { class: 'sn-tool-swatch', style: { background: s.penColor } });
    const input = el('input', { type: 'color', value: s.penColor });
    input.addEventListener('input', e => { s.penColor = e.target.value; swatch.style.background = e.target.value; touch(s); });
    return el('label', { class: 'sn-tool sn-tool-color', 'aria-label': 'Pen color' }, [swatch, input]);
  }

  /* ───────── Current point indicator ───────── */
  function renderCurrentPoint(s) {
    const box = el('div', { class: 'sn-currentpoint', id: 'snCurrentPoint' });
    drawCurrentPoint(s, box);
    return box;
  }
  function drawCurrentPoint(s, box) {
    box.innerHTML = '';
    const pts = s.outline;
    if (!pts.length) {
      box.appendChild(el('div', { class: 'sn-cp-kick', text: 'Current Point' }));
      box.appendChild(el('div', { class: 'sn-cp-row' }, [
        el('div', { class: 'sn-cp-now' }, [el('strong', { text: 'No outline yet' }), el('small', { text: 'Add points in the Outline tab to follow along.' })]),
        el('button', { class: 'sn-cp-follow', onclick: () => { activeTab = 'outline'; renderTabBody(s); syncTabs(); } }, [icon('add'), 'Outline'])
      ]));
      return;
    }
    const i = Math.max(0, Math.min(s.activePoint || 0, pts.length - 1));
    const now = pts[i];
    const next = pts[i + 1];
    box.appendChild(el('div', { class: 'sn-cp-kick', text: 'Current Point · ' + (i + 1) + ' of ' + pts.length }));
    box.appendChild(el('div', { class: 'sn-cp-row' }, [
      el('div', { class: 'sn-cp-btns' }, [
        el('button', { class: 'sn-cp-nav', 'aria-label': 'Previous', onclick: () => { s.activePoint = Math.max(0, i - 1); touch(s); drawCurrentPoint(s, box); } }, [icon('chevron_left')])
      ]),
      el('div', { class: 'sn-cp-now' }, [
        el('strong', { text: (i + 1) + '. ' + (now.title || 'Untitled point') }),
        el('small', { text: next ? 'Next: ' + (next.title || 'Untitled point') : 'Final point' })
      ]),
      el('div', { class: 'sn-cp-btns' }, [
        el('button', { class: 'sn-cp-nav', 'aria-label': 'Next', onclick: () => { s.activePoint = Math.min(pts.length - 1, i + 1); touch(s); drawCurrentPoint(s, box); } }, [icon('chevron_right')]),
        el('button', { class: 'sn-cp-follow' + (s.following ? ' sn-on' : ''), onclick: () => { s.following = !s.following; touch(s); drawCurrentPoint(s, box); if (s.following) toast('Following along — new captures tag to point ' + (i + 1)); } }, [icon('podcasts'), s.following ? 'Following' : 'Follow'])
      ])
    ]));
  }

  /* ══════════════════════════════════════════════════════════════════════
     AUDIO ENGINE — multi-segment recording on one continuous timeline, with
     a real playback player and live speech → verse catching.

     • Each Record→Stop makes a SEGMENT (blob in IndexedDB). Segments chain into
       one virtual timeline (startAt + duration), so accidentally stopping and
       starting again never loses anything — both takes are saved and play back
       seamlessly as one recording.
     • Note timestamps use the continuous timeline (baseOffset + elapsed).
     • While recording, SpeechRecognition (if available) listens and catches
       spoken Bible references into the sermon's "Heard" list.
     ══════════════════════════════════════════════════════════════════════ */
  const audioState = {
    recorder: null, chunks: [], recording: false, startTs: 0, baseOffset: 0,
    stream: null, segId: null, timer: null, heardThisSession: 0,
    segUrls: {},                 // segmentId → object URL (session cache)
    player: { audio: null, seg: null, playing: false, raf: 0 },
    speech: null, speechWanted: false,
    transcript: [], _lastInterim: null   // running transcript for the final sweep
  };
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec / 60), r = sec % 60;
    return m + ':' + String(r).padStart(2, '0');
  }
  function audioElapsed() { return Math.round(audioState.baseOffset + (audioState.recording ? (Date.now() - audioState.startTs) / 1000 : 0)); }

  // Keep the screen awake during recording so a 45-minute sermon isn't cut off
  // by the phone auto-locking (which would suspend capture).
  async function acquireWakeLock() {
    try { if (navigator.wakeLock && !audioState.wakeLock) audioState.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  function releaseWakeLock() { try { if (audioState.wakeLock) audioState.wakeLock.release(); } catch (e) {} audioState.wakeLock = null; }

  function resetAudioSession() {
    stopPlayback();
    if (audioState.recording) {
      audioState._stopAt = audioElapsed(); // capture length before clearing the flag
      audioState.recording = false;
      try { audioState.recorder && audioState.recorder.stop(); } catch (e) {}
    }
    stopSpeech();
    releaseWakeLock();
    audioState.recording = false; audioState.baseOffset = 0; audioState.segId = null;
    if (audioState.timer) { clearInterval(audioState.timer); audioState.timer = null; }
    Object.values(audioState.segUrls).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    audioState.segUrls = {};
    audioState.player = { audio: null, seg: null, playing: false, raf: 0 };
    audioState.heardThisSession = 0;
  }

  function renderAudio(s) {
    const box = el('div', { class: 'sn-audio', id: 'snAudio' });
    drawAudio(s, box);
    return box;
  }
  function refreshAudio(s) { const box = document.getElementById('snAudio'); if (box) drawAudio(s, box); }

  /* ───────── Recording ───────── */
  async function toggleRecord(s, box) {
    if (audioState.recording) { await stopRecording(s); refreshAudio(s); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Recording isn’t supported on this device'); return; }
    stopPlayback();
    // Warm the Bible data so caught references can be validated to real passages.
    if (typeof window.loadRhemaScripts === 'function') { try { window.loadRhemaScripts(); } catch (e) {} }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioState.stream = stream;
      audioState.chunks = [];
      audioState.segId = uid();
      audioState.baseOffset = s.audioTotal || 0; // continue the timeline
      let rec;
      try { rec = new MediaRecorder(stream, { mimeType: 'audio/webm' }); }
      catch (e) { rec = new MediaRecorder(stream); }
      audioState.recorder = rec;
      rec.ondataavailable = e => { if (e.data && e.data.size) audioState.chunks.push(e.data); };
      rec.onstop = () => finalizeSegment(s, box);
      rec.start(3000); // periodic flush so a crash still leaves recoverable chunks
      audioState.recording = true;
      audioState.startTs = Date.now();
      audioState.heardThisSession = 0;
      audioState.transcript = []; audioState._lastInterim = null;
      acquireWakeLock();
      startSpeech(s);
      refreshAudio(s);
      audioState.timer = setInterval(() => updateRecTimer(), 500);
      toast(s.audioSegments.length ? 'Recording resumed — new part' : 'Recording started');
    } catch (e) {
      toast(e && e.name === 'NotAllowedError' ? 'Microphone permission needed' : 'Couldn’t start recording');
    }
  }
  function updateRecTimer() {
    const te = document.getElementById('snAudioTime');
    if (te) te.textContent = fmtTime(audioElapsed());
    const hc = document.getElementById('snHeardCount');
    if (hc && audioState.speech) hc.textContent = String(audioState.heardThisSession || 0);
  }
  function stopRecording(s) {
    return new Promise(resolve => {
      if (!audioState.recording) return resolve();
      audioState._resolveStop = resolve;
      audioState._stopAt = audioElapsed(); // capture length while still "recording"
      audioState.recording = false;
      if (audioState.timer) { clearInterval(audioState.timer); audioState.timer = null; }
      stopSpeech();
      try { audioState.recorder.stop(); } catch (e) { finalizeSegment(s); }
    });
  }
  function finalizeSegment(s, box) {
    const stopAt = (audioState._stopAt != null) ? audioState._stopAt : audioElapsed();
    audioState._stopAt = null;
    const dur = Math.max(1, Math.round(stopAt - (audioState.baseOffset || 0)));
    if (audioState.stream) { audioState.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); audioState.stream = null; }
    const segId = audioState.segId;
    const blob = new Blob(audioState.chunks, { type: 'audio/webm' });
    audioState.chunks = [];
    if (blob.size > 0 && segId) {
      const seg = { id: segId, startAt: audioState.baseOffset || 0, duration: dur };
      s.audioSegments.push(seg);
      s.audioTotal = (s.audioTotal || 0) + dur;
      audioState.segUrls[segId] = URL.createObjectURL(blob);
      touch(s);
      saveAudioBlob(segId, blob).then(ok => { if (!ok) toast('Audio kept for this session only'); });
    }
    audioState.baseOffset = s.audioTotal || 0;
    audioState.recording = false;
    releaseWakeLock();
    finalReferenceSweep(s);
    refreshAudio(s);
    if (audioState._resolveStop) { const r = audioState._resolveStop; audioState._resolveStop = null; r(); }
  }

  // Post-recording final check: re-parse the FULL transcript in one pass,
  // stitching across the ~1-min recognizer restart boundaries, to recover
  // references the live pass split or dropped. Adds/upgrades any it finds.
  function finalReferenceSweep(s) {
    if (audioState._lastInterim) { audioState.transcript.push(audioState._lastInterim); audioState._lastInterim = null; }
    const chunks = audioState.transcript || [];
    audioState.transcript = [];
    if (!chunks.length) return;
    // Seed supersession with the references already caught live.
    const doneList = s.heard.map(h => ({ key: heardKey(h), code: h.code, chapter: h.chapter, verse: h.verse, kind: h.kind, id: h.id }));
    let prevTail = '', changed = 0;
    chunks.forEach(ch => {
      const stitched = (prevTail ? prevTail + ' ' : '') + (ch.text || '');
      parseSpokenRefs(stitched).forEach(ref => { if (commitHeardRef(s, ref, heardKey(ref), ch.t, doneList, stitched)) changed++; });
      prevTail = String(ch.text || '').split(/\s+/).slice(-8).join(' ');
    });
    if (changed > 0) { updateHeardBadge(s); if (activeTab === 'verses' && versesSub === 'heard') renderTabBody(s); toast('Final check found ' + changed + ' more reference' + (changed === 1 ? '' : 's')); }
  }

  /* ───────── Playback (continuous across segments) ───────── */
  function timeline(s) { return (s.audioSegments || []).slice().sort((a, b) => a.startAt - b.startAt); }
  function segAt(s, t) { const tl = timeline(s); return tl.find(g => t >= g.startAt && t < g.startAt + g.duration) || tl[tl.length - 1] || null; }
  function ensurePlayerAudio() {
    if (!audioState.player.audio) {
      const a = new Audio();
      a.addEventListener('ended', onSegEnded);
      audioState.player.audio = a;
    }
    return audioState.player.audio;
  }
  let _playbackSermon = null;
  function playFrom(s, globalT) {
    const seg = segAt(s, globalT);
    if (!seg) { toast('No recording yet'); return; }
    const url = audioState.segUrls[seg.id];
    _playbackSermon = s;
    const a = ensurePlayerAudio();
    const startLocal = Math.max(0, globalT - seg.startAt);
    const begin = () => { try { a.currentTime = startLocal; } catch (e) {} a.play().then(() => { audioState.player.playing = true; runPlayLoop(s); }).catch(() => {}); };
    if (audioState.player.seg && audioState.player.seg.id === seg.id && a.src) { begin(); }
    else if (url) { audioState.player.seg = seg; a.src = url; a.onloadedmetadata = () => { a.onloadedmetadata = null; begin(); }; if (a.readyState >= 1) begin(); }
    else {
      loadAudioBlob(seg.id).then(blob => {
        if (!blob) { toast('That part isn’t available'); return; }
        audioState.segUrls[seg.id] = URL.createObjectURL(blob);
        audioState.player.seg = seg; a.src = audioState.segUrls[seg.id];
        a.onloadedmetadata = () => { a.onloadedmetadata = null; begin(); };
      });
    }
  }
  function onSegEnded() {
    const s = _playbackSermon; if (!s) return;
    const cur = audioState.player.seg; if (!cur) return;
    const nextStart = cur.startAt + cur.duration;
    const next = segAt(s, nextStart);
    if (next && next.id !== cur.id) playFrom(s, nextStart);
    else { audioState.player.playing = false; cancelAnimationFrame(audioState.player.raf); updatePlayheadUI(s, 0, true); }
  }
  function togglePlayback(s) {
    const p = audioState.player;
    if (p.playing) { pausePlayback(); }
    else if (p.audio && p.seg && p.audio.src) { p.audio.play().then(() => { p.playing = true; runPlayLoop(s); }).catch(() => {}); }
    else playFrom(s, 0);
  }
  function pausePlayback() { const p = audioState.player; if (p.audio) { try { p.audio.pause(); } catch (e) {} } p.playing = false; cancelAnimationFrame(p.raf); syncPlayBtn(); }
  function stopPlayback() { const p = audioState.player; if (p.audio) { try { p.audio.pause(); } catch (e) {} } p.playing = false; if (p.raf) cancelAnimationFrame(p.raf); }
  function globalPlayTime() { const p = audioState.player; return p.seg && p.audio ? p.seg.startAt + (p.audio.currentTime || 0) : 0; }
  function runPlayLoop(s) {
    cancelAnimationFrame(audioState.player.raf);
    const step = () => { updatePlayheadUI(s, globalPlayTime(), false); if (audioState.player.playing) audioState.player.raf = requestAnimationFrame(step); };
    step(); syncPlayBtn();
  }
  function updatePlayheadUI(s, t, ended) {
    const total = s.audioTotal || 1;
    const fill = document.getElementById('snPlayFill');
    const knob = document.getElementById('snPlayKnob');
    const cur = document.getElementById('snPlayCur');
    const pct = ended ? 0 : Math.min(100, (t / total) * 100);
    if (fill) fill.style.width = pct + '%';
    if (knob) knob.style.left = pct + '%';
    if (cur) cur.textContent = fmtTime(ended ? 0 : t);
  }
  function syncPlayBtn() {
    const btn = document.getElementById('snPlayBtn');
    if (btn) btn.querySelector('.material-symbols-outlined').textContent = audioState.player.playing ? 'pause' : 'play_arrow';
  }
  const SN_PREROLL = 3; // seconds of lead-in so the run-up to a reference isn't cut off
  function seekAudio(t) {
    const s = getSermon(current); if (!s) return;
    if (!s.audioSegments || !s.audioSegments.length) { toast('Record audio to jump back to ' + fmtTime(t)); return; }
    const from = Math.max(0, (t || 0) - SN_PREROLL);
    playFrom(s, from);
    toast('▶ ' + fmtTime(t));
  }

  /* ───────── The audio widget UI ───────── */
  function drawAudio(s, box) {
    box.innerHTML = '';
    const hasAudio = s.audioSegments && s.audioSegments.length > 0;

    if (audioState.recording) {
      box.classList.add('sn-audio-live');
      box.appendChild(el('button', { class: 'sn-audio-rec sn-recording', 'aria-label': 'Stop recording', onclick: () => toggleRecord(s, box) }, [icon('stop')]));
      const mid = el('div', { class: 'sn-audio-mid' }, [
        el('div', { class: 'sn-audio-liverow' }, [
          el('span', { class: 'sn-audio-dot' }),
          el('div', { class: 'sn-audio-time', id: 'snAudioTime', text: fmtTime(audioElapsed()) }),
          el('div', { class: 'sn-eq' }, [el('span'), el('span'), el('span'), el('span'), el('span')])
        ]),
        el('div', { class: 'sn-audio-hint' }, [
          audioState.speech
            ? el('span', {}, ['Listening for verses · caught ', el('strong', { id: 'snHeardCount', text: String(audioState.heardThisSession) }), ' so far'])
            : el('span', { text: 'Recording… your captures get timestamps' })
        ])
      ]);
      box.appendChild(mid);
      return;
    }
    box.classList.remove('sn-audio-live');

    if (!hasAudio) {
      box.appendChild(el('button', { class: 'sn-audio-rec', 'aria-label': 'Record', onclick: () => toggleRecord(s, box) }, [icon('mic')]));
      box.appendChild(el('div', { class: 'sn-audio-mid' }, [
        el('div', { class: 'sn-audio-time', text: 'Record the sermon' }),
        el('div', { class: 'sn-audio-hint', text: 'Timestamps your notes and auto-catches spoken verses.' })
      ]));
      return;
    }

    // Playback player
    const ready = s.audioSegments.every(seg => audioState.segUrls[seg.id]);
    box.appendChild(el('button', { class: 'sn-audio-rec sn-audio-play', id: 'snPlayBtn', 'aria-label': 'Play / pause', onclick: () => togglePlayback(s) }, [icon(audioState.player.playing ? 'pause' : 'play_arrow')]));
    const track = el('div', { class: 'sn-play-track', onpointerdown: e => scrubStart(e, s) }, [
      el('span', { class: 'sn-play-fill', id: 'snPlayFill' }),
      el('span', { class: 'sn-play-knob', id: 'snPlayKnob' })
    ]);
    const times = el('div', { class: 'sn-play-times' }, [
      el('span', { id: 'snPlayCur', text: fmtTime(globalPlayTime()) }),
      el('span', { text: fmtTime(s.audioTotal || 0) })
    ]);
    box.appendChild(el('div', { class: 'sn-audio-mid' }, [
      track, times,
      el('div', { class: 'sn-audio-hint', text: (s.audioSegments.length > 1 ? s.audioSegments.length + ' parts · ' : '') + (ready ? 'Tap a note’s timestamp to jump there' : 'Loading audio…') })
    ]));
    box.appendChild(el('button', { class: 'sn-audio-more', 'aria-label': 'Record more', title: 'Record another part', onclick: () => toggleRecord(s, box) }, [icon('mic'), 'More']));
    updatePlayheadUI(s, globalPlayTime(), false);
  }
  function scrubStart(e, s) {
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const wasPlaying = audioState.player.playing;
    const to = ev => {
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      updatePlayheadUI(s, pct * (s.audioTotal || 0), false);
      return pct;
    };
    const move = ev => to(ev);
    const up = ev => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      const pct = to(ev);
      playFrom(s, pct * (s.audioTotal || 0));
      if (!wasPlaying) { /* start playing from seek — natural */ }
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    to(e);
  }

  /* ══════════════════════════════════════════════════════════════════════
     SPEECH → VERSE CATCHER
     ══════════════════════════════════════════════════════════════════════ */
  function speechSupported() { return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window; }
  function startSpeech(s) {
    if (!speechSupported()) { audioState.speech = null; return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    try {
      const r = new SR();
      // interimResults gives us the moment each phrase is FIRST heard, so a
      // reference gets the timestamp of when it was actually said — not when the
      // engine finalizes (which can lag to the end of the recording).
      r.continuous = true; r.interimResults = true; r.lang = 'en-US';
      // Per result index: when each reference was FIRST heard, and which ones we
      // already committed. Committing live off interim results (not waiting for
      // the final, which can lag minutes) means every reference is caught the
      // moment it's spoken AND gets its own accurate timestamp — instead of all
      // the references in one long result sharing a single time.
      const seenAt = {};   // i → { refKey: firstElapsedSeconds }
      const done = {};     // i → [ committed {key, code, chapter, verse, kind, id} ]
      const chunkT = {};   // i → elapsed when this result index was first seen
      r.onresult = e => {
        const now = audioElapsed();
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i], txt = res[0].transcript;
          if (!seenAt[i]) seenAt[i] = {};
          if (!done[i]) done[i] = [];
          if (chunkT[i] == null) chunkT[i] = now;
          parseSpokenRefs(txt).forEach(ref => {
            const key = heardKey(ref);
            if (seenAt[i][key] == null) seenAt[i][key] = now; // first-heard time
            commitHeardRef(s, ref, key, seenAt[i][key], done[i], txt);
          });
          if (res.isFinal) {
            // Log the finalized transcript for the post-sermon final sweep.
            audioState.transcript.push({ text: txt, t: chunkT[i] });
            audioState._lastInterim = null;
            delete seenAt[i]; delete done[i]; delete chunkT[i];
          } else {
            audioState._lastInterim = { text: txt, t: chunkT[i] };
          }
        }
        updateRecTimer();
      };
      r.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { audioState.speechWanted = false; audioState.speech = null; } };
      let lastStart = 0, backoff = 0;
      r.onstart = () => { lastStart = Date.now(); };
      r.onend = () => {
        // Web Speech sessions time out (~1 min); relaunch so a long sermon keeps
        // being transcribed. Keep the interim we had at the restart boundary so
        // the final sweep can stitch across it, then reset per-index tracking.
        if (audioState._lastInterim) { audioState.transcript.push(audioState._lastInterim); audioState._lastInterim = null; }
        for (const k in seenAt) delete seenAt[k];
        for (const k in done) delete done[k];
        for (const k in chunkT) delete chunkT[k];
        if (!audioState.speechWanted) return;
        // If it ended almost immediately (e.g. no network at church), back off so
        // we don't hot-loop and drain the battery; recover to instant restarts
        // once healthy sessions resume.
        backoff = (Date.now() - lastStart < 1500) ? Math.min((backoff || 200) * 2, 8000) : 0;
        setTimeout(() => { if (audioState.speechWanted) { try { r.start(); } catch (e) {} } }, backoff);
      };
      audioState.speech = r; audioState.speechWanted = true;
      r.start();
    } catch (e) { audioState.speech = null; }
  }
  // Commit one caught reference for a result index, superseding a less-specific
  // partial (book→chapter→exact) heard earlier in the same utterance.
  // Returns true if it added or upgraded a reference, false if it was a no-op.
  function commitHeardRef(s, ref, key, t, doneList, txt) {
    if (doneList.some(d => d.key === key)) return false;
    const spec = e => e.kind === 'exact' ? 3 : e.kind === 'chapter' ? 2 : e.kind === 'book' ? 1 : 0;
    if (ref.code) {
      for (let k = doneList.length - 1; k >= 0; k--) {
        const d = doneList[k];
        if (d.code !== ref.code) continue;
        const sameChapter = d.kind === 'book' || d.chapter === ref.chapter;
        if (sameChapter && spec(d) > spec(ref)) return false;       // a better one already exists
        if (sameChapter && spec(ref) > spec(d)) {                   // this refines an earlier partial
          s.heard = s.heard.filter(h => h.id !== d.id); doneList.splice(k, 1);
        }
      }
    }
    const entry = addHeard(s, Object.assign({}, ref, { t: t, phrase: txt }));
    if (entry) { doneList.push({ key, code: ref.code, chapter: ref.chapter, verse: ref.verse, kind: ref.kind, id: entry.id }); return true; }
    return false;
  }
  function stopSpeech() {
    audioState.speechWanted = false;
    if (audioState.speech) { try { audioState.speech.stop(); } catch (e) {} audioState.speech = null; }
  }

  /* ── Spoken-reference tables & parser ──
     Bare numbered-book names are AMBIGUOUS (Corinthians → 1/2 Cor); an ordinal
     resolves them. Book-only mentions are only recorded when the name is
     unambiguously a book (RARE) or a cue word ("book of…", "turn to…") is
     present — this stops everyday words / personal names from false-firing. But
     the moment a chapter number appears, we ALWAYS record the reference, so an
     exact "Acts 6:5" is never demoted to a mere "book mentioned". */
  const SB_SINGLE = { genesis:'GEN', exodus:'EXO', leviticus:'LEV', numbers:'NUM', deuteronomy:'DEU', joshua:'JOS', judges:'JDG', ruth:'RUT', ezra:'EZR', nehemiah:'NEH', esther:'EST', job:'JOB', psalms:'PSA', psalm:'PSA', proverbs:'PRO', ecclesiastes:'ECC', 'song of solomon':'SNG', 'song of songs':'SNG', song:'SNG', isaiah:'ISA', jeremiah:'JER', lamentations:'LAM', ezekiel:'EZK', daniel:'DAN', hosea:'HOS', joel:'JOL', amos:'AMO', obadiah:'OBA', jonah:'JON', micah:'MIC', nahum:'NAM', habakkuk:'HAB', zephaniah:'ZEP', haggai:'HAG', zechariah:'ZEC', malachi:'MAL', matthew:'MAT', mark:'MAR', luke:'LUK', acts:'ACT', romans:'ROM', galatians:'GAL', ephesians:'EPH', philippians:'PHP', colossians:'COL', titus:'TIT', philemon:'PHM', hebrews:'HEB', james:'JAM', jude:'JUD', revelation:'REV', revelations:'REV' };
  const SB_AMBIG = { john:['JOH','1JO','2JO','3JO'], corinthians:['1CO','2CO'], samuel:['1SA','2SA'], kings:['1KI','2KI'], chronicles:['1CH','2CH'], thessalonians:['1TH','2TH'], timothy:['1TI','2TI'], peter:['1PE','2PE'] };
  const SB_NUMBERED = { john:{1:'1JO',2:'2JO',3:'3JO'}, corinthians:{1:'1CO',2:'2CO'}, samuel:{1:'1SA',2:'2SA'}, kings:{1:'1KI',2:'2KI'}, chronicles:{1:'1CH',2:'2CH'}, thessalonians:{1:'1TH',2:'2TH'}, timothy:{1:'1TI',2:'2TI'}, peter:{1:'1PE',2:'2PE'} };
  const SB_RARE = new Set(['genesis','exodus','leviticus','deuteronomy','nehemiah','psalms','psalm','proverbs','ecclesiastes','song of solomon','song of songs','isaiah','jeremiah','lamentations','ezekiel','obadiah','habakkuk','zephaniah','haggai','zechariah','malachi','galatians','ephesians','philippians','colossians','thessalonians','corinthians','hebrews','revelation','revelations','philemon','nahum','deuteronomy','leviticus']);
  const SB_CUES = new Set(['book','turn','read','reading','gospel','epistle','letter','passage','open','opening','over','scripture','verse','chapter']);
  const SB_ORD = { first:1, second:2, third:3, one:1, two:2, three:3, i:1, ii:2, iii:3, '1':1, '2':2, '3':3 };
  const SB_UNITS = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
  const SB_TENS = { twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
  function sbBookName(code) { return (window.RhemaBookNames && window.RhemaBookNames[code]) || code; }
  function sbReadNumber(toks, i) {
    if (i >= toks.length) return null;
    if (/^\d{1,3}$/.test(toks[i])) return { value: parseInt(toks[i], 10), next: i + 1 };
    let val = null, j = i, hundreds = 0;
    if (toks[j] === 'a' && toks[j + 1] === 'hundred') { hundreds = 100; j += 2; val = 100; }
    if (SB_UNITS[toks[j]] != null && toks[j + 1] === 'hundred') { hundreds = SB_UNITS[toks[j]] * 100; j += 2; val = hundreds; }
    if (SB_TENS[toks[j]] != null) { val = (hundreds || 0) + SB_TENS[toks[j]]; j++; if (SB_UNITS[toks[j]] != null && SB_UNITS[toks[j]] < 10) { val += SB_UNITS[toks[j]]; j++; } return { value: val, next: j }; }
    if (SB_UNITS[toks[j]] != null) { val = (hundreds || 0) + SB_UNITS[toks[j]]; j++; return { value: val, next: j }; }
    if (val != null) return { value: val, next: j };
    return null;
  }
  function sbRhemaReady() { try { return typeof window._rhemaText === 'function' && window._rhemaText(); } catch (e) { return false; } }
  function sbSuffix(ch, v) { return ch != null ? ' ' + ch + (v != null ? ':' + v : '') : ''; }
  // Return a book's chapter map from Rhema, or null if data isn't available.
  function sbChapters(code) { const T = sbRhemaReady(); return (T && T[code]) || null; }
  // Repair a (chapter, verse) so it points at a real passage. Speech often merges
  // "chapter 1 verse 2" into "12"; if the raw chapter doesn't exist we try
  // splitting the digits into a real chapter+verse. Falls back to chapter-only or
  // book-only rather than inventing a non-existent reference.
  function sbFix(code, chapter, verse) {
    if (chapter == null) return { chapter: null, verse: null };
    const B = sbChapters(code);
    if (!B) return { chapter, verse }; // no data loaded → trust as spoken
    const has = (c, v) => !!(B[String(c)] && (v == null || B[String(c)][String(v)]));
    if (has(chapter, verse)) return { chapter, verse };
    const d = String(chapter);
    if (d.length >= 2) {
      // Prefer a split that satisfies the spoken verse (if any), else any real split.
      for (let cut = 1; cut < d.length; cut++) {
        const c = parseInt(d.slice(0, cut), 10), v = parseInt(d.slice(cut), 10);
        if (verse != null && has(c, verse)) return { chapter: c, verse };
        if (has(c, v)) return { chapter: c, verse: v };
      }
    }
    if (B[String(chapter)]) return { chapter, verse: null }; // chapter real, verse wasn't
    return { chapter: null, verse: null }; // couldn't validate → book mention
  }

  // Pure parser: text → array of classified reference entries (no timestamp).
  function parseSpokenRefs(text) {
    const results = [];
    if (!text) return results;
    const toks = String(text).toLowerCase().replace(/[:]/g, ' : ').replace(/[^a-z0-9: ]+/g, ' ').split(/\s+/).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      let baseName = null, span = 0, explicitNum = null;
      const t0 = toks[i], ord = SB_ORD[t0];
      if (ord != null && SB_AMBIG[toks[i + 1]]) { explicitNum = ord; baseName = toks[i + 1]; span = 2; }
      else if (t0 === 'song' && toks[i + 1] === 'of' && (toks[i + 2] === 'solomon' || toks[i + 2] === 'songs')) { baseName = 'song of ' + toks[i + 2]; span = 3; }
      else if (SB_SINGLE[t0] || SB_AMBIG[t0]) { baseName = t0; span = 1; }
      if (!baseName) continue;

      // chapter / verse after the book
      let j = i + span, chapter = null, verse = null;
      if (toks[j] === 'the') j++;
      if (toks[j] === 'chapter' || toks[j] === 'chapters') j++;
      const cn = sbReadNumber(toks, j);
      if (cn) {
        chapter = cn.value; j = cn.next;
        if (toks[j] === ':') { j++; const vn = sbReadNumber(toks, j); if (vn) { verse = vn.value; j = vn.next; } }
        else if (toks[j] === 'verse' || toks[j] === 'verses' || toks[j] === 'v') { j++; const vn = sbReadNumber(toks, j); if (vn) { verse = vn.value; j = vn.next; } }
        else { const vn = sbReadNumber(toks, j); if (vn && vn.value <= 176) { verse = vn.value; j = vn.next; } }
      }

      // confidence gate for bare book mentions (a spoken number always counts).
      const rawHadNumber = chapter != null;
      const cue = [toks[i - 1], toks[i - 2], toks[i - 3]].some(w => w && SB_CUES.has(w));
      if (!rawHadNumber && !SB_RARE.has(baseName) && !cue) { i += span - 1; continue; }

      // resolve candidate code(s)
      let codes;
      if (explicitNum != null) { const c = SB_NUMBERED[baseName] && SB_NUMBERED[baseName][explicitNum]; if (!c) { i += span - 1; continue; } codes = [c]; }
      else if (SB_AMBIG[baseName]) codes = SB_AMBIG[baseName].slice();
      else codes = [SB_SINGLE[baseName]];

      // Validate + repair each candidate against real chapter/verse ranges, so a
      // speech-merged number ("Philippians 12" ← "1 2") becomes the real
      // "Philippians 1:2" and we never store a passage that doesn't exist.
      let cand = codes.map(c => { const f = sbFix(c, chapter, verse); return { code: c, chapter: f.chapter, verse: f.verse, ref: sbBookName(c) + sbSuffix(f.chapter, f.verse), kind: f.chapter == null ? 'book' : (f.verse == null ? 'chapter' : 'exact') }; });
      // When a number was spoken, prefer candidates that resolved to a real chapter.
      if (rawHadNumber) { const withCh = cand.filter(c => c.chapter != null); if (withCh.length) cand = withCh; }
      // De-dupe identical resolved refs (e.g. two options that fixed to the same).
      const seen = new Set(); cand = cand.filter(c => { if (seen.has(c.ref)) return false; seen.add(c.ref); return true; });

      if (cand.length === 1) {
        const c = cand[0];
        results.push({ kind: c.kind, code: c.code, chapter: c.chapter, verse: c.verse, ref: c.ref, options: null });
      } else {
        results.push({ kind: 'ambiguous', code: null, chapter, verse, ref: cand[0].ref, options: cand.map(c => c.ref), codes: cand.map(c => c.code) });
      }
      i += span - 1;
    }
    return results;
  }
  function catchReferences(s, text, t) {
    parseSpokenRefs(text).forEach(e => { e.t = t; e.phrase = text; addHeard(s, e); });
  }
  // QA hooks (namespaced) — validate the recognizer without live speech.
  window.__snParseSpokenRefs = parseSpokenRefs;
  window.__snFeedSpeech = (text, t) => { const s = getSermon(current); if (s) catchReferences(s, text, t == null ? audioElapsed() : t); };

  function heardKey(e) {
    if (e.kind === 'ambiguous') return 'amb:' + e.codes.join(',') + ':' + (e.chapter || '') + ':' + (e.verse || '');
    if (e.kind === 'book') return 'book:' + e.code;
    if (e.kind === 'chapter') return 'ch:' + e.code + ':' + e.chapter;
    return 'ex:' + e.code + ':' + e.chapter + ':' + e.verse;
  }
  function addHeard(s, entry) {
    const key = heardKey(entry);
    const existing = s.heard.find(h => heardKey(h) === key);
    if (existing) {
      // Same reference again LATER in the sermon (a real re-mention, >8s after the
      // last one) bumps the ×count; interim re-fires of the same moment don't.
      if (entry.t != null && (existing.lastT == null || entry.t - existing.lastT > 8)) {
        existing.count = (existing.count || 1) + 1; existing.lastT = entry.t; persist();
        if (activeTab === 'verses' && versesSub === 'heard') renderTabBody(s);
      }
      return existing;
    }
    entry.id = uid(); entry.count = 1; entry.confirmed = false; entry.lastT = entry.t;
    s.heard.push(entry);
    touch(s);
    audioState.heardThisSession = (audioState.heardThisSession || 0) + 1;
    updateRecTimer();
    updateHeardBadge(s);
    if (activeTab === 'verses' && versesSub === 'heard') renderTabBody(s);
    return entry;
  }
  function updateHeardBadge(s) {
    const b = document.getElementById('snHeardBadge');
    if (b) { const n = s.heard.length; b.textContent = n; b.classList.toggle('sn-hidden', !n); }
  }

  /* ───────── OUTLINE TAB ───────── */
  function renderOutline(s) {
    const pane = el('div', { class: 'sn-pane' });
    pane.appendChild(el('div', { class: 'sn-pane-head' }, [
      el('h2', { text: 'Sermon Outline' }),
      el('button', { class: 'sn-add-btn', onclick: () => { s.outline.push({ id: uid(), title: '', passages: '', notes: '' }); touch(s); renderTabBody(s); } }, [icon('add'), 'Add point'])
    ]));
    if (!s.outline.length) {
      pane.appendChild(el('div', { class: 'sn-empty' }, [icon('format_list_numbered'), el('p', { text: 'Build the skeleton of the message — points, sub-points, and the passages behind them.' })]));
    }
    s.outline.forEach((o, i) => {
      const item = el('div', { class: 'sn-outline-item' + (i === s.activePoint ? ' sn-cp-active' : '') }, [
        el('div', { class: 'sn-oi-top' }, [
          el('div', { class: 'sn-oi-num', text: String(i + 1), onclick: () => { s.activePoint = i; touch(s); renderTabBody(s); } }),
          el('input', { class: 'sn-oi-title', placeholder: 'Point ' + (i + 1) + ' title…', value: o.title, oninput: e => { o.title = e.target.value; touch(s); } }),
          el('button', { class: 'sn-oi-del', 'aria-label': 'Delete point', onclick: () => { s.outline.splice(i, 1); if (s.activePoint >= s.outline.length) s.activePoint = Math.max(0, s.outline.length - 1); touch(s); renderTabBody(s); } }, [icon('close')])
        ]),
        el('input', { class: 'sn-oi-passages', placeholder: 'Supporting passages (e.g. Philippians 2:1-5)', value: o.passages, onchange: e => { o.passages = e.target.value; collectVerses(s, o.passages); touch(s); } }),
        el('textarea', { class: 'sn-oi-notes', placeholder: 'Notes for this point…', oninput: e => { o.notes = e.target.value; touch(s); } }, [o.notes || ''])
      ]);
      pane.appendChild(item);
    });
    return pane;
  }

  /* ───────── VERSES TAB ───────── */
  function collectVerses(s, text) {
    const refs = findVerses(text);
    let added = 0;
    refs.forEach(r => {
      if (!s.verses.some(v => v.ref.toLowerCase() === r.toLowerCase())) {
        s.verses.push({ id: uid(), ref: r, note: '' });
        added++;
      }
    });
    if (added) { touch(s); }
    return added;
  }
  // Add one reference (deduped). Returns true if it was newly added.
  function addVerseRef(s, ref) {
    ref = String(ref || '').replace(/\s+/g, ' ').trim();
    if (!ref) return false;
    if (s.verses.some(v => v.ref.toLowerCase() === ref.toLowerCase())) { toast('Already added'); return false; }
    s.verses.push({ id: uid(), ref, note: '' });
    touch(s);
    if (activeTab === 'verses') renderTabBody(s);
    toast('Verse added');
    return true;
  }

  /* ───────── Add-verse sheet: type OR browse (book → chapter → verse + range) ───────── */
  function openVerseAddSheet(s) {
    openSheet(sheet => {
      sheet.appendChild(el('h3', { text: 'Add a Verse' }));
      sheet.appendChild(el('p', { class: 'sn-sheet-sub', text: 'Type a reference, or browse to pick the exact verse and range.' }));

      // Type row
      const input = el('input', { class: 'sn-dialog-input', style: { marginBottom: '0', flex: '1' }, placeholder: 'e.g. Philippians 2:1-5' });
      const addTyped = () => { if (input.value.trim()) { addVerseRef(s, input.value); closeSheet(); } };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') addTyped(); });
      sheet.appendChild(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' } }, [
        input, el('button', { class: 'sn-add-btn', onclick: addTyped }, [icon('add'), 'Add'])
      ]));

      sheet.appendChild(el('div', { class: 'sn-sheet-section', text: 'Or browse the Bible' }));
      const browse = el('div', { class: 'sn-vp' });
      sheet.appendChild(browse);
      buildVerseBrowser(browse, s);
    });
  }

  // State machine for the in-sheet reference browser.
  function buildVerseBrowser(root, s) {
    const state = { step: 'book', code: null, chapter: null, start: null, end: null };
    const rhemaReady = () => typeof window._rhemaBookOrder === 'function' && typeof window._rhemaText === 'function' && window._rhemaBookOrder().length;

    const ensure = () => {
      if (rhemaReady()) { render(); return; }
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'sn-vp-loading' }, [icon('hourglass_top'), 'Loading Bible…']));
      if (typeof window.loadRhemaScripts === 'function') {
        Promise.resolve(window.loadRhemaScripts()).then(() => render()).catch(() => fail());
      } else fail();
    };
    const fail = () => { root.innerHTML = ''; root.appendChild(el('div', { class: 'sn-vp-loading', text: 'Bible data unavailable — type the reference above instead.' })); };

    function render() {
      if (!rhemaReady()) return fail();
      root.innerHTML = '';
      if (state.step === 'book') return renderBooks();
      if (state.step === 'chapter') return renderChapters();
      if (state.step === 'verse') return renderVersesGrid();
    }
    function crumb() {
      const parts = [];
      parts.push(el('button', { class: 'sn-vp-crumb', onclick: () => { state.step = 'book'; render(); } }, ['Books']));
      if (state.code) parts.push(el('button', { class: 'sn-vp-crumb', onclick: () => { state.step = 'chapter'; render(); } }, [window._rhemaBookName(state.code)]));
      if (state.chapter) parts.push(el('span', { class: 'sn-vp-crumb sn-cur', text: 'Ch ' + state.chapter }));
      return el('div', { class: 'sn-vp-crumbs' }, parts);
    }
    function renderBooks() {
      const search = el('input', { class: 'sn-dialog-input', style: { marginBottom: '10px' }, placeholder: 'Search books…' });
      root.appendChild(search);
      const list = el('div', { class: 'sn-vp-books' });
      root.appendChild(list);
      const codes = window._rhemaBookOrder();
      const paint = q => {
        list.innerHTML = '';
        codes.forEach(code => {
          const name = window._rhemaBookName(code);
          if (q && !name.toLowerCase().includes(q)) return;
          list.appendChild(el('button', { class: 'sn-vp-book', onclick: () => { state.code = code; state.chapter = null; state.start = state.end = null; state.step = 'chapter'; render(); } }, [
            el('span', { class: 'material-symbols-outlined', text: 'menu_book' }), name
          ]));
        });
      };
      paint('');
      search.addEventListener('input', () => paint(search.value.toLowerCase().trim()));
    }
    function renderChapters() {
      root.appendChild(crumb());
      const chapters = Object.keys((window._rhemaText()[state.code]) || {}).sort((a, b) => +a - +b);
      const grid = el('div', { class: 'sn-vp-grid' });
      chapters.forEach(ch => grid.appendChild(el('button', { class: 'sn-vp-cell', text: ch, onclick: () => { state.chapter = ch; state.start = state.end = null; state.step = 'verse'; render(); } })));
      root.appendChild(grid);
    }
    function renderVersesGrid() {
      root.appendChild(crumb());
      const verses = Object.keys(((window._rhemaText()[state.code]) || {})[state.chapter] || {}).sort((a, b) => +a - +b);
      const hint = el('div', { class: 'sn-vp-hint', text: 'Tap a verse. Tap a second verse to make a range.' });
      root.appendChild(hint);
      const grid = el('div', { class: 'sn-vp-grid' });
      const paint = () => {
        grid.querySelectorAll('.sn-vp-cell').forEach(c => {
          const v = +c.dataset.v;
          const inRange = state.start != null && state.end != null && v >= Math.min(state.start, state.end) && v <= Math.max(state.start, state.end);
          c.classList.toggle('sn-sel', inRange || v === state.start);
        });
        confirmRow.classList.toggle('sn-hidden', state.start == null);
        if (state.start != null) {
          const a = Math.min(state.start, state.end == null ? state.start : state.end);
          const b = Math.max(state.start, state.end == null ? state.start : state.end);
          const ref = window._rhemaBookName(state.code) + ' ' + state.chapter + ':' + a + (b !== a ? '-' + b : '');
          confirmLabel.textContent = ref;
        }
      };
      verses.forEach(v => {
        grid.appendChild(el('button', { class: 'sn-vp-cell', data: { v }, text: v, onclick: () => {
          const n = +v;
          if (state.start == null || (state.start != null && state.end != null)) { state.start = n; state.end = null; }
          else if (n === state.start) { state.end = null; }
          else { state.end = n; }
          paint();
        } }));
      });
      root.appendChild(grid);
      const confirmLabel = el('strong', { class: 'sn-vp-conf-label' });
      const confirmRow = el('div', { class: 'sn-vp-confirm sn-hidden' }, [
        confirmLabel,
        el('button', { class: 'sn-add-btn', onclick: () => {
          const a = Math.min(state.start, state.end == null ? state.start : state.end);
          const b = Math.max(state.start, state.end == null ? state.start : state.end);
          const ref = window._rhemaBookName(state.code) + ' ' + state.chapter + ':' + a + (b !== a ? '-' + b : '');
          addVerseRef(s, ref); closeSheet();
        } }, [icon('add'), 'Add'])
      ]);
      root.appendChild(confirmRow);
      paint();
    }
    ensure();
  }
  function renderVerses(s) {
    const pane = el('div', { class: 'sn-pane' });
    pane.appendChild(el('div', { class: 'sn-pane-head' }, [
      el('h2', { text: 'Verses' }),
      versesSub === 'added'
        ? el('button', { class: 'sn-add-btn', onclick: () => openVerseAddSheet(s) }, [icon('add'), 'Add verse'])
        : el('span')
    ]));
    // Sub-tabs: Added (manual/typed) vs Heard (auto-caught from audio).
    const subTab = (id, label, count) => el('button', {
      class: 'sn-subtab' + (versesSub === id ? ' sn-active' : ''),
      onclick: () => { versesSub = id; renderTabBody(s); }
    }, [label, count != null ? el('span', { class: 'sn-subtab-badge' + (count ? '' : ' sn-hidden'), id: id === 'heard' ? 'snHeardBadge' : null, text: String(count) }) : null]);
    pane.appendChild(el('div', { class: 'sn-subtabs' }, [
      subTab('added', 'Added', s.verses.length),
      subTab('heard', 'Heard in Sermon', s.heard.length)
    ]));

    if (versesSub === 'added') {
      pane.appendChild(el('p', { class: 'sn-sub-hint', text: 'References you type in your notes or add here.' }));
      if (!s.verses.length) {
        pane.appendChild(el('div', { class: 'sn-empty' }, [icon('menu_book'), el('p', { text: 'No verses yet. Type something like “Philippians 2:5” in your notes and it lands here automatically.' })]));
      }
      s.verses.forEach(v => {
        pane.appendChild(el('div', { class: 'sn-verse-card' }, [
          icon('menu_book'),
          el('div', { style: { flex: '1', minWidth: '0' } }, [
            el('div', { class: 'sn-verse-ref', text: v.ref }),
            el('input', { class: 'sn-verse-note', placeholder: 'Note…', value: v.note, style: { border: 'none', background: 'transparent', color: 'var(--sn-muted)', width: '100%', outline: 'none', fontSize: '.8rem' }, oninput: e => { v.note = e.target.value; touch(s); } })
          ]),
          el('button', { class: 'sn-verse-open', onclick: () => openVerseRef(v.ref) }, ['Open']),
          el('button', { class: 'sn-verse-del', 'aria-label': 'Remove', onclick: () => { s.verses = s.verses.filter(x => x.id !== v.id); touch(s); renderTabBody(s); } }, [icon('close')])
        ]));
      });
    } else {
      renderHeard(s, pane);
    }
    return pane;
  }

  // "Heard in Sermon" — everything the listener caught being spoken.
  function renderHeard(s, pane) {
    pane.appendChild(el('p', { class: 'sn-sub-hint', text: speechSupported()
      ? 'Every Bible reference we catch being spoken while recording lands here, with the moment it was said. Confirm the ones you want to keep.'
      : 'Live listening isn’t supported in this browser, so nothing is auto-caught here. Recording and manual verses still work.' }));
    if (!s.heard.length) {
      pane.appendChild(el('div', { class: 'sn-empty' }, [icon('hearing'), el('p', { text: 'Nothing caught yet. Start recording and references spoken during the sermon will appear here.' })]));
      return;
    }
    // Newest first
    s.heard.slice().sort((a, b) => (b.t || 0) - (a.t || 0)).forEach(h => pane.appendChild(heardCard(s, h)));
  }
  function heardCard(s, h) {
    const kindLabel = h.kind === 'book' ? 'Book mentioned' : h.kind === 'chapter' ? 'Chapter' : h.kind === 'ambiguous' ? 'Possible match' : 'Exact reference';
    const kindIcon = h.kind === 'book' ? 'menu_book' : h.kind === 'ambiguous' ? 'help' : 'my_location';
    const top = el('div', { class: 'sn-heard-top' }, [
      el('span', { class: 'sn-heard-kind sn-hk-' + h.kind }, [icon(kindIcon), kindLabel]),
      el('button', { class: 'sn-heard-time', onclick: () => seekAudio(h.t) }, [icon('play_circle'), fmtTime(h.t)]),
      h.count > 1 ? el('span', { class: 'sn-heard-count', text: '×' + h.count }) : null
    ]);
    const card = el('div', { class: 'sn-heard-card' + (h.confirmed ? ' sn-confirmed' : '') }, [top]);

    if (h.kind === 'ambiguous') {
      card.appendChild(el('div', { class: 'sn-heard-ambnote', text: 'One of these might have been said — tap the right one:' }));
      const opts = el('div', { class: 'sn-heard-options' });
      h.options.forEach((label, idx) => {
        opts.appendChild(el('button', { class: 'sn-heard-opt', onclick: () => {
          addVerseRef(s, label); h.confirmed = true; h.chosen = label; versesSub = 'added'; touch(s); renderTabBody(s);
        } }, [label]));
      });
      card.appendChild(opts);
      card.appendChild(el('div', { class: 'sn-heard-actions' }, [
        el('button', { class: 'sn-heard-open', onclick: () => openVerseRef(h.options[0]) }, [icon('menu_book'), 'Open first']),
        el('button', { class: 'sn-heard-dismiss', onclick: () => { s.heard = s.heard.filter(x => x.id !== h.id); touch(s); renderTabBody(s); } }, [icon('close'), 'Dismiss'])
      ]));
    } else {
      card.appendChild(el('div', { class: 'sn-heard-ref', text: h.ref }));
      const actions = el('div', { class: 'sn-heard-actions' });
      if (h.kind !== 'book') actions.appendChild(el('button', { class: 'sn-heard-add', onclick: () => { addVerseRef(s, h.ref); h.confirmed = true; touch(s); renderTabBody(s); } }, [icon('add'), h.confirmed ? 'Added' : 'Add to verses']));
      actions.appendChild(el('button', { class: 'sn-heard-open', onclick: () => openVerseRef(h.ref) }, [icon('menu_book'), 'Open']));
      actions.appendChild(el('button', { class: 'sn-heard-dismiss', onclick: () => { s.heard = s.heard.filter(x => x.id !== h.id); touch(s); renderTabBody(s); } }, [icon('close'), 'Dismiss']));
      card.appendChild(actions);
    }
    return card;
  }

  /* ───────── TAKEAWAYS TAB ───────── */
  function renderTakeaways(s) {
    const pane = el('div', { class: 'sn-pane' });
    pane.appendChild(el('div', { class: 'sn-pane-head' }, [
      el('h2', { text: 'Takeaways' }),
      el('button', { class: 'sn-add-btn', onclick: () => { s.takeaways.push({ id: uid(), text: '', done: false }); touch(s); renderTabBody(s); const inp = document.querySelector('.sn-take:last-child .sn-take-text'); if (inp) inp.focus(); } }, [icon('add'), 'Add'])
    ]));
    pane.appendChild(el('p', { style: { color: 'var(--sn-muted)', fontSize: '.84rem', margin: '-6px 2px 16px' }, text: 'The lessons and next steps you walk away with. Check them off as you live them out.' }));
    if (!s.takeaways.length) {
      pane.appendChild(el('div', { class: 'sn-empty' }, [icon('task_alt'), el('p', { text: 'No takeaways yet. After the message, jot the 1–3 things you don’t want to forget.' })]));
    }
    s.takeaways.forEach(t => {
      const row = el('div', { class: 'sn-take' + (t.done ? ' sn-done' : '') }, [
        el('div', { class: 'sn-take-check', onclick: () => { t.done = !t.done; touch(s); renderTabBody(s); } }, [icon('check')]),
        el('textarea', { class: 'sn-take-text', rows: '1', placeholder: 'A lesson or next step…', oninput: e => { t.text = e.target.value; e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; touch(s); } }, [t.text || '']),
        el('button', { class: 'sn-take-del', 'aria-label': 'Remove', onclick: () => { s.takeaways = s.takeaways.filter(x => x.id !== t.id); touch(s); renderTabBody(s); } }, [icon('close')])
      ]);
      pane.appendChild(row);
      const ta = row.querySelector('.sn-take-text');
      requestAnimationFrame(() => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
    });
    return pane;
  }

  /* ══════════════════════════════════════════════════════════════════════
     BOTTOM SHEETS
     ══════════════════════════════════════════════════════════════════════ */
  function openSheet(builder) {
    closeSheet();
    const sheet = el('div', { class: 'sn-sheet' }, [el('div', { class: 'sn-sheet-grip' })]);
    builder(sheet);
    const scrim = el('div', { class: 'sn-sheet-scrim', id: 'snSheetScrim', onclick: e => { if (e.target === scrim) closeSheet(); } }, [sheet]);
    (page || document.body).appendChild(scrim);
    requestAnimationFrame(() => scrim.classList.add('sn-open'));
  }
  function closeSheet() {
    const scrim = document.getElementById('snSheetScrim');
    if (!scrim) return;
    scrim.classList.remove('sn-open');
    setTimeout(() => scrim.remove(), 240);
  }

  function openPaperSheet(s) {
    openSheet(sheet => {
      sheet.appendChild(el('h3', { text: 'Paper Style' }));
      sheet.appendChild(el('p', { class: 'sn-sheet-sub', text: 'Set the backdrop for your notes canvas.' }));
      const grid = el('div', { class: 'sn-paper-grid' });
      [['blank', 'Blank', 'pv-blank'], ['dotted', 'Dotted', 'pv-dotted'], ['lined', 'Lined', 'pv-lined'], ['grid', 'Grid', 'pv-grid'], ['dark', 'Dark', 'pv-dark'], ['cream', 'Cream', 'pv-cream']].forEach(([id, label, pv]) => {
        grid.appendChild(el('div', { class: 'sn-paper-opt' + (s.paper === id ? ' sn-sel' : ''), onclick: () => {
          s.paper = id; touch(s);
          const c = document.getElementById('snCanvas');
          if (c) c.className = 'sn-canvas paper-' + id + ' font-' + s.font + (drawTool ? ' sn-drawing' : '');
          closeSheet();
        } }, [el('div', { class: 'sn-paper-swatch ' + pv }), el('small', { text: label })]));
      });
      sheet.appendChild(grid);
    });
  }

  function openFontSheet(s) {
    openSheet(sheet => {
      sheet.appendChild(el('h3', { text: 'Text Style' }));
      sheet.appendChild(el('p', { class: 'sn-sheet-sub', text: 'Choose how your typed notes feel.' }));
      const grid = el('div', { class: 'sn-font-grid' });
      [['clean', 'Clean', 'Aa Bb Cc'], ['hand', 'Handwritten', 'Sunday notes'], ['marker', 'Marker', 'Big Idea'], ['type', 'Typewriter', 'Sermon 01'], ['minimal', 'Minimal', 'quietly']].forEach(([id, label, demo]) => {
        grid.appendChild(el('div', { class: 'sn-font-opt' + (s.font === id ? ' sn-sel' : ''), onclick: () => {
          s.font = id; touch(s);
          const c = document.getElementById('snCanvas');
          if (c) c.className = 'sn-canvas paper-' + s.paper + ' font-' + id + (drawTool ? ' sn-drawing' : '');
          closeSheet();
        } }, [el('div', { class: 'sn-font-demo font-' + id, text: demo }), el('small', { text: label })]));
      });
      sheet.appendChild(grid);
    });
  }

  function openStickerSheet(s) {
    openSheet(sheet => {
      sheet.appendChild(el('h3', { text: 'Sticky Notes' }));
      sheet.appendChild(el('p', { class: 'sn-sheet-sub', text: 'Drop a movable note for a thought, definition, or reminder.' }));
      const grid = el('div', { class: 'sn-color-grid', style: { gridTemplateColumns: 'repeat(5,1fr)' } });
      [['', 'Yellow'], ['c-green', 'Green'], ['c-pink', 'Pink'], ['c-blue', 'Blue'], ['c-purple', 'Purple']].forEach(([cls, label]) => {
        const sw = el('div', { class: 'sn-sticky ' + cls, style: { position: 'static', width: 'auto', minHeight: '54px', transform: 'none', margin: '0', display: 'grid', placeItems: 'center', fontWeight: '800', cursor: 'pointer' }, text: label });
        sw.addEventListener('click', () => { addSticky(s, cls); closeSheet(); });
        grid.appendChild(sw);
      });
      sheet.appendChild(grid);
    });
  }

  function openDecoSheet(s) {
    openSheet(sheet => {
      sheet.appendChild(el('h3', { text: 'Decorations & Stickers' }));
      sheet.appendChild(el('p', { class: 'sn-sheet-sub', text: 'Mark up your page. Drag to place, double-tap to remove.' }));
      const grid = el('div', { class: 'sn-sticker-grid' });
      ['⭐','✝️','👑','➡️','❤️','🔖','🔥','💡','🙏','📌','✅','❓','💬','🕊️','🌿','📖','✨','⚡'].forEach(em => {
        grid.appendChild(el('div', { class: 'sn-sticker', text: em, onclick: () => { addDeco(s, em); closeSheet(); } }));
      });
      sheet.appendChild(grid);
    });
  }

  /* ───────── More / actions sheet ───────── */
  function openMoreSheet() {
    const s = getSermon(current);
    openSheet(sheet => {
      sheet.appendChild(el('h3', { text: s.title || 'This sermon' }));
      sheet.appendChild(el('p', { class: 'sn-sheet-sub', text: 'Review, save, and share your notes.' }));
      sheet.appendChild(sheetRow('summarize', 'Post-Sermon Review', 'Auto-organize points, questions, verses & takeaways', () => { closeSheet(); openReview(s); }));
      sheet.appendChild(sheetRow('bookmark_add', 'Add Bookmark', 'Flag this moment' + (audioState.recording ? ' at ' + fmtTime(audioElapsed()) : ''), () => { addBookmark(s); closeSheet(); }));
      sheet.appendChild(sheetRow('collections_bookmark', 'Bookmarks (' + s.bookmarks.length + ')', 'Jump to saved moments', () => { closeSheet(); openBookmarks(s); }));
      sheet.appendChild(sheetRow('ios_share', 'Share / Export', 'Study sheet, copy text, or save drawing', () => { closeSheet(); openShareSheet(s); }));
      sheet.appendChild(sheetRow('bookmarks', 'Save as Template', 'Reuse this layout every week', () => { saveAsTemplate(s); closeSheet(); }));
      sheet.appendChild(sheetRow('content_copy', 'Duplicate Sermon', 'Make a copy to edit', () => { duplicateSermon(s); closeSheet(); }));
      sheet.appendChild(sheetRow('delete', 'Delete Sermon', 'Remove permanently', () => { closeSheet(); confirmDelete(s); }));
    });
  }
  function sheetRow(ic, title, sub, fn) {
    return el('button', { class: 'sn-row', onclick: fn }, [icon(ic), el('span', { class: 'sn-row-txt' }, [el('span', { text: title }), el('small', { text: sub })])]);
  }

  /* ───────── Bookmarks ───────── */
  async function addBookmark(s) {
    const label = await snPrompt({ title: 'Add a bookmark', message: 'Flag this moment' + (audioState.recording ? ' at ' + fmtTime(audioElapsed()) + '.' : '.'), value: 'Important moment', icon: 'bookmark_add', ok: 'Save' });
    if (label == null) return;
    s.bookmarks.push({ id: uid(), label: label || 'Moment', t: audioState.recording ? audioElapsed() : null, at: nowISO() });
    touch(s);
    toast('Bookmarked');
  }
  function openBookmarks(s) {
    openSheet(sheet => {
      sheet.appendChild(el('h3', { text: 'Bookmarks' }));
      sheet.appendChild(el('p', { class: 'sn-sheet-sub', text: 'Saved moments from this message.' }));
      if (!s.bookmarks.length) { sheet.appendChild(el('div', { class: 'sn-empty' }, [icon('bookmark'), el('p', { text: 'No bookmarks yet.' })])); return; }
      s.bookmarks.forEach(b => {
        sheet.appendChild(el('button', { class: 'sn-row', onclick: () => { if (b.t != null) seekAudio(b.t); else toast(b.label); } }, [
          icon('bookmark'),
          el('span', { class: 'sn-row-txt' }, [el('span', { text: b.label }), el('small', { text: b.t != null ? 'Audio ' + fmtTime(b.t) : new Date(b.at).toLocaleString() })]),
          el('span', { class: 'material-symbols-outlined', style: { color: 'var(--sn-muted)' }, text: 'close', onclick: (e) => { e.stopPropagation(); s.bookmarks = s.bookmarks.filter(x => x.id !== b.id); touch(s); closeSheet(); openBookmarks(s); } })
        ]));
      });
    });
  }

  /* ───────── Post-sermon review ───────── */
  function openReview(s) {
    openSheet(sheet => {
      sheet.appendChild(el('h3', { text: 'Post-Sermon Review' }));
      sheet.appendChild(el('p', { class: 'sn-sheet-sub', text: (s.title || 'This message') + ' — everything you captured, organized.' }));

      if (s.mainIdea) {
        sheet.appendChild(reviewBlock('star', 'Main Idea', [s.mainIdea]));
      }
      const byKind = k => s.blocks.filter(b => b.kind === k && b.text).map(b => b.text);
      sheet.appendChild(reviewBlock('format_list_numbered', 'Outline', s.outline.map((o, i) => (i + 1) + '. ' + (o.title || 'Untitled') + (o.passages ? '  (' + o.passages + ')' : ''))));
      sheet.appendChild(reviewBlock('star', 'Key Points', byKind('keypoint')));
      sheet.appendChild(reviewBlock('help', 'Questions', byKind('question')));
      sheet.appendChild(reviewBlock('target', 'Applications', byKind('application')));
      sheet.appendChild(reviewBlock('format_quote', 'Quotes', byKind('quote')));
      sheet.appendChild(reviewBlock('menu_book', 'Verses', s.verses.map(v => v.ref + (v.note ? ' — ' + v.note : ''))));
      sheet.appendChild(reviewBlock('task_alt', 'Takeaways', s.takeaways.map(t => (t.done ? '✓ ' : '• ') + t.text).filter(x => x.length > 2)));
    });
  }
  function reviewBlock(ic, title, items) {
    const block = el('div', { class: 'sn-review-block' }, [el('h4', {}, [icon(ic), title])]);
    if (!items || !items.length) block.appendChild(el('div', { class: 'sn-review-empty', text: 'Nothing captured here.' }));
    else { const ul = el('ul'); items.forEach(i => ul.appendChild(el('li', { text: i }))); block.appendChild(ul); }
    return block;
  }

  /* ───────── Share / Export ───────── */
  function openShareSheet(s) {
    openSheet(sheet => {
      sheet.appendChild(el('h3', { text: 'Share & Export' }));
      sheet.appendChild(el('p', { class: 'sn-sheet-sub', text: 'Take your notes with you.' }));
      sheet.appendChild(sheetRow('picture_as_pdf', 'Study Sheet (PDF / Print)', 'Clean printable summary', () => { closeSheet(); exportStudySheet(s); }));
      sheet.appendChild(sheetRow('content_copy', 'Copy as Text', 'Paste into any app or message', () => { copyText(s); closeSheet(); }));
      sheet.appendChild(sheetRow('download', 'Download Drawing (PNG)', 'Just your handwriting & sketches', () => { downloadDrawing(s); closeSheet(); }));
      if (navigator.share) sheet.appendChild(sheetRow('share', 'Share Summary…', 'Send to a group or friend', () => { shareNative(s); closeSheet(); }));
    });
  }
  function plainText(s) {
    const lines = [];
    lines.push((s.title || 'Sermon Notes').toUpperCase());
    if (s.passage || s.speaker) lines.push([s.passage, s.speaker].filter(Boolean).join(' · '));
    if (s.date) lines.push(new Date(s.date).toLocaleDateString());
    lines.push('');
    if (s.mainIdea) { lines.push('MAIN IDEA'); lines.push(s.mainIdea); lines.push(''); }
    if (s.outline.length) { lines.push('OUTLINE'); s.outline.forEach((o, i) => { lines.push((i + 1) + '. ' + (o.title || '') + (o.passages ? ' (' + o.passages + ')' : '')); if (o.notes) lines.push('   ' + o.notes); }); lines.push(''); }
    const kinds = { keypoint: 'KEY POINTS', question: 'QUESTIONS', application: 'APPLICATIONS', quote: 'QUOTES' };
    Object.keys(kinds).forEach(k => { const items = s.blocks.filter(b => b.kind === k && b.text); if (items.length) { lines.push(kinds[k]); items.forEach(b => lines.push('• ' + b.text)); lines.push(''); } });
    if (s.verses.length) { lines.push('VERSES'); s.verses.forEach(v => lines.push('• ' + v.ref + (v.note ? ' — ' + v.note : ''))); lines.push(''); }
    if (s.takeaways.length) { lines.push('TAKEAWAYS'); s.takeaways.forEach(t => lines.push((t.done ? '[x] ' : '[ ] ') + t.text)); lines.push(''); }
    lines.push('— Notes taken in Rhema Sermon Notes');
    return lines.join('\n');
  }
  function copyText(s) {
    const txt = plainText(s);
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Copied to clipboard')).catch(() => fallbackCopy(txt));
    else fallbackCopy(txt);
  }
  function fallbackCopy(txt) {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied to clipboard'); } catch (e) { toast('Copy not supported'); }
    ta.remove();
  }
  function shareNative(s) {
    navigator.share({ title: s.title || 'Sermon Notes', text: plainText(s) }).catch(() => {});
  }
  function downloadDrawing(s) {
    const dc = document.getElementById('snDrawCanvas');
    if (!dc) { toast('Open the Notes tab first'); return; }
    const url = dc.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = (s.title || 'sermon') + '-drawing.png'; a.click();
    toast('Drawing downloaded');
  }
  function exportStudySheet(s) {
    const w = window.open('', '_blank');
    if (!w) { toast('Allow pop-ups to export'); return; }
    const esc = escapeHTML;
    const sect = (title, inner) => inner ? '<h2>' + esc(title) + '</h2>' + inner : '';
    const list = arr => arr.length ? '<ul>' + arr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
    const kinds = { keypoint: 'Key Points', question: 'Questions', application: 'Applications', quote: 'Quotes' };
    let blocksHTML = '';
    Object.keys(kinds).forEach(k => { const items = s.blocks.filter(b => b.kind === k && b.text).map(b => b.text); if (items.length) blocksHTML += sect(kinds[k], list(items)); });
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(s.title || 'Sermon Notes') + '</title>' +
      '<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 24px;color:#1f2430;line-height:1.55}' +
      'h1{font-size:26px;margin:0 0 4px;color:#3a2170}.meta{color:#6b7280;margin-bottom:24px}' +
      'h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#6d4bd8;border-bottom:2px solid #efeaff;padding-bottom:4px;margin:26px 0 10px}' +
      '.idea{background:#efeaff;border-left:4px solid #6d4bd8;padding:12px 16px;border-radius:8px;font-size:17px}' +
      'ul{margin:0;padding-left:20px}li{margin:4px 0}@media print{body{margin:0}}</style></head><body>' +
      '<h1>' + esc(s.title || 'Sermon Notes') + '</h1>' +
      '<div class="meta">' + esc([s.passage, s.speaker, s.date ? new Date(s.date).toLocaleDateString() : ''].filter(Boolean).join(' · ')) + '</div>' +
      (s.mainIdea ? '<div class="idea">' + esc(s.mainIdea) + '</div>' : '') +
      (s.outline.length ? sect('Outline', '<ol>' + s.outline.map(o => '<li><strong>' + esc(o.title || '') + '</strong>' + (o.passages ? ' <em>(' + esc(o.passages) + ')</em>' : '') + (o.notes ? '<br>' + esc(o.notes) : '') + '</li>').join('') + '</ol>') : '') +
      blocksHTML +
      sect('Verses', list(s.verses.map(v => v.ref + (v.note ? ' — ' + v.note : '')))) +
      sect('Takeaways', list(s.takeaways.map(t => (t.done ? '✓ ' : '') + t.text).filter(x => x.length > 1))) +
      '<p style="margin-top:40px;color:#9aa0b4;font-size:12px">Notes taken in Rhema Sermon Notes</p>' +
      '<script>setTimeout(function(){window.print()},350)<\/script></body></html>';
    w.document.write(html); w.document.close();
  }

  /* ───────── Templates ───────── */
  async function saveAsTemplate(s) {
    const name = await snPrompt({ title: 'Save as template', message: 'Reuse this layout (paper, font, outline & colors) for future sermons.', value: s.title || 'My Sunday layout', icon: 'bookmarks', ok: 'Save' });
    if (!name) return;
    store.templates.push({
      id: uid(), name: name,
      paper: s.paper, font: s.font, penColor: s.penColor,
      outline: s.outline.map(o => ({ title: o.title, passages: o.passages })),
      takeaways: []
    });
    persist(true);
    toast('Template saved');
  }
  function openTemplateSheet() {
    openSheet(sheet => {
      sheet.appendChild(el('h3', { text: 'Personal Templates' }));
      sheet.appendChild(el('p', { class: 'sn-sheet-sub', text: 'Start a new sermon from a saved layout.' }));
      sheet.appendChild(sheetRow('add', 'Blank Sermon', 'Start fresh', () => { closeSheet(); createAndOpen(); }));
      const starters = [
        { name: 'Classic 3-Point', outline: [{ title: 'Point 1', passages: '' }, { title: 'Point 2', passages: '' }, { title: 'Point 3', passages: '' }], paper: 'lined', font: 'hand' },
        { name: 'Verse-by-Verse', outline: [{ title: 'Context', passages: '' }, { title: 'Observation', passages: '' }, { title: 'Meaning', passages: '' }, { title: 'Application', passages: '' }], paper: 'dotted', font: 'clean' }
      ];
      sheet.appendChild(el('div', { class: 'sn-sheet-section', text: 'Starters' }));
      starters.forEach(t => sheet.appendChild(sheetRow('dashboard_customize', t.name, t.outline.length + ' points · ' + t.paper, () => { closeSheet(); createAndOpen(t); })));
      if (store.templates.length) {
        sheet.appendChild(el('div', { class: 'sn-sheet-section', text: 'Saved by you' }));
        store.templates.forEach(t => sheet.appendChild(el('button', { class: 'sn-row', onclick: () => { closeSheet(); createAndOpen(t); } }, [
          icon('bookmarks'),
          el('span', { class: 'sn-row-txt' }, [el('span', { text: t.name }), el('small', { text: (t.outline || []).length + ' points · ' + t.paper })]),
          el('span', { class: 'material-symbols-outlined', style: { color: 'var(--sn-muted)' }, text: 'close', onclick: (e) => { e.stopPropagation(); store.templates = store.templates.filter(x => x.id !== t.id); persist(true); closeSheet(); openTemplateSheet(); } })
        ])));
      }
    });
  }
  function duplicateSermon(s) {
    const copy = JSON.parse(JSON.stringify(s));
    copy.id = uid(); copy.title = (s.title || 'Sermon') + ' (copy)';
    copy.createdAt = copy.updatedAt = nowISO();
    copy.drawing = s.drawing;
    // Give each audio segment a fresh id and copy its blob across.
    (copy.audioSegments || []).forEach(seg => {
      const oldId = seg.id, newId = uid();
      seg.id = newId;
      loadAudioBlob(oldId).then(b => { if (b) saveAudioBlob(newId, b); });
    });
    store.sermons.unshift(copy); persist(true);
    openEditor(copy.id);
    toast('Duplicated');
  }

})();
