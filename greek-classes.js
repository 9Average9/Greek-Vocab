/* ══════════════════════════════════════════════════════════════════════════
   GREEK CLASSES
   The Lessons tab: four Classes (Basics, Advanced, Basic Verbs, Advanced
   Verbs), a lesson list for each class, and a page-by-page lesson player.

   The player runs on top of the existing lesson markup in index.html. Each
   lesson section stays where it is (so its styles, knowledge checks, quizzes,
   completion rules and sync keep working); the player just shows one part of
   it at a time and marks each section read as its page is shown.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const ART = {
    temple: '<svg class="gc-temple" viewBox="0 0 40 40" aria-hidden="true"><path d="M4 14 20 5l16 9z"/><path d="M6 14h28M8 33h24M5 37h30"/><path d="M10 17v13M16 17v13M24 17v13M30 17v13"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4 4 9-9.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.6C10.2 5.2 7.6 4.6 3.6 4.8v13c4-.2 6.6.4 8.4 1.8 1.8-1.4 4.4-2 8.4-1.8v-13c-4-.2-6.6.4-8.4 1.8zM12 6.6v13"/></svg>',
    target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" class="gc-fill"/></svg>',
    quiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4.5" width="14" height="17" rx="2.5"/><path d="M9 4.5V3h6v1.5M8 11l1.6 1.6L12 10M14 11.5h2.5M8 16l1.6 1.6L12 15M14 16.5h2.5"/></svg>'
  };
  const LEAVES = [[24, 18, -30], [21, 32, -38], [20, 46, -44], [21, 60, -52], [25, 74, -60], [31, 86, -68], [38, 96, -76]];
  const laurel = flip => `<svg class="gc-laurel${flip ? ' gc-flip' : ''}" viewBox="0 0 60 110" aria-hidden="true"><path class="gc-laurel-stem" d="M46 104C22 88 14 58 22 10"/>${LEAVES.map(([x, y, r]) => `<ellipse cx="${x - 7}" cy="${y}" rx="8" ry="3.6" transform="rotate(${r} ${x - 7} ${y})"/><ellipse cx="${x + 7}" cy="${y + 3}" rx="8" ry="3.6" transform="rotate(${-r - 140} ${x + 7} ${y + 3})"/>`).join('')}</svg>`;

  // Faint Greek words scattered behind each screen.
  const DECO = [
    ['λόγος', 6, 78, 2.4, -8], ['Ψ', 82, 58, 3.4, 10], ['α', 86, 14, 2.6, 0], ['ζωή', 4, 34, 2, -6],
    ['Ω', 78, 90, 3, -10], ['ἀρχή', 10, 96, 2.2, 6], ['β', 90, 36, 2.2, 8], ['Φ', 2, 58, 2.6, 0]
  ];
  const decoHTML = () => `<div class="gc-deco" aria-hidden="true">${DECO.map(([t, x, y, s, r]) =>
    `<span style="left:${x}%;top:${y}%;font-size:${s}rem;transform:rotate(${r}deg)">${t}</span>`).join('')}</div>`;

  /* ── The four classes ─────────────────────────────────────────────────── */
  const CLASSES = [
    {
      key: 'basic', n: 1, name: 'Basics', glyph: 'ΑΩ',
      desc: 'Letters, sounds, nouns and the building blocks',
      screen: 'newLearnMenu', dash: 'learnDashboard', sel: '.learn-lesson', suffix: 'Lesson', open: 'showLearnLesson',
      mode: 'basic', done: () => (typeof completedLessons !== 'undefined' ? completedLessons : {})
    },
    {
      key: 'advanced', n: 2, name: 'Advanced', glyph: 'Ξ',
      desc: 'The same foundations in depth, with checks and a quiz in every lesson',
      screen: 'advancedLearnMenu', dash: 'advLearnDashboard', sel: '.adv-learn-lesson', suffix: 'Lesson', open: 'showAdvancedLesson',
      mode: 'advanced', done: () => (typeof completedAdvancedLessons !== 'undefined' ? completedAdvancedLessons : {})
    },
    {
      key: 'verbBasic', n: 3, name: 'Basic Verbs', glyph: 'λύω',
      desc: 'Tense, voice, mood and how Greek verbs are built',
      screen: 'basicVerbsLearnMenu', dash: 'verbBasicDashboard', sel: '.basic-verb-lesson', suffix: 'VbLesson', open: 'showBasicVerbLesson',
      mode: 'verbBasic', done: () => (typeof completedVerbBasicLessons !== 'undefined' ? completedVerbBasicLessons : {})
    },
    {
      key: 'verbAdv', n: 4, name: 'Advanced Verbs', glyph: 'Ψ',
      desc: 'Aspect, participles, the subjunctive and reading real NT verbs',
      screen: 'advVerbsLearnMenu', dash: 'verbAdvDashboard', sel: '.adv-verb-lesson', suffix: 'VaLesson', open: 'showAdvVerbLesson',
      mode: 'verbAdvanced', done: () => (typeof completedVerbAdvancedLessons !== 'undefined' ? completedVerbAdvancedLessons : {})
    }
  ];
  const byKey = k => CLASSES.find(c => c.key === k);
  const MODE_TO_KEY = { basic: 'basic', advanced: 'advanced', verbBasic: 'verbBasic', verbAdvanced: 'verbAdv', verbAdv: 'verbAdv' };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // Lessons for a class, read from that class's original lesson menu so titles,
  // subtitles, times and order always match the lesson content.
  const _lessonCache = {};
  function lessonsFor(cls) {
    if (_lessonCache[cls.key]) return _lessonCache[cls.key];
    const dash = document.getElementById(cls.dash);
    const out = [];
    dash?.querySelectorAll('button[onclick]').forEach(btn => {
      const m = /\(\s*'([^']+)'\s*\)/.exec(btn.getAttribute('onclick') || '');
      if (!m || !/Lesson\(/.test(btn.getAttribute('onclick'))) return;
      const id = m[1];
      const time = (btn.querySelector('.lesson-est-time')?.textContent || '').replace(/schedule/g, '').replace(/[~\s]+/g, ' ').trim();
      out.push({
        id,
        title: btn.querySelector('.lesson-text strong')?.textContent.trim() || id,
        sub: btn.querySelector('.lesson-text small:not(.lesson-est-time)')?.textContent.trim() || '',
        time
      });
    });
    _lessonCache[cls.key] = out;
    return out;
  }
  const isDone = (cls, id) => cls.done()[id] === true;
  const doneCount = cls => lessonsFor(cls).filter(l => isDone(cls, l.id)).length;
  const nextLesson = cls => lessonsFor(cls).find(l => !isDone(cls, l.id));

  function currentClassKey() {
    try { return MODE_TO_KEY[localStorage.getItem('lessonMode')] || 'basic'; } catch { return 'basic'; }
  }
  function rememberClass(cls) {
    try { localStorage.setItem('lessonMode', cls.mode); } catch {}
  }

  /* ── Full-screen helpers ─────────────────────────────────────────────── */
  function setFull(mode) {
    const html = document.documentElement;
    html.classList.toggle('gc-hub-on', mode === 'hub');
    html.classList.toggle('gc-full-on', mode === 'full');
    document.body?.classList.toggle('gc-hub-on', mode === 'hub');
    document.body?.classList.toggle('gc-full-on', mode === 'full');
  }

  function ensureScreen(id, label) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('section');
    el.className = 'screen gc-screen';
    el.id = id;
    el.setAttribute('aria-label', label);
    (document.getElementById('allToolsPage')?.parentNode || document.querySelector('main') || document.body).appendChild(el);
    if (typeof screens !== 'undefined' && Array.isArray(screens) && !screens.includes(id)) screens.push(id);
    return el;
  }

  /* ── Classes hub (Lessons tab) ───────────────────────────────────────── */
  function renderHub() {
    const el = ensureScreen('greekClassesPage', 'Greek Classes');
    const cur = currentClassKey();
    el.innerHTML = `${decoHTML()}<div class="gc-page gc-hub-page">
      <header class="gc-brand-row gc-brand-solo"><h1 class="gc-brand">${ART.temple}<span>Greek</span></h1></header>
      <div class="gc-key" aria-hidden="true"></div>
      <h2 class="gc-section-label">Classes</h2>
      <div class="gc-class-list">${CLASSES.map(cls => {
        const total = lessonsFor(cls).length;
        const done = doneCount(cls);
        const pct = total ? Math.round(done / total * 100) : 0;
        return `<button type="button" class="gc-class-card${cls.key === cur ? ' gc-current' : ''}" onclick="gcOpenClass('${cls.key}')">
          <span class="gc-emblem${cls.glyph.length > 2 ? ' gc-emblem-word' : ''}">${esc(cls.glyph)}</span>
          <span class="gc-class-text">
            <small>Class ${cls.n} · ${total} lessons</small>
            <strong>${esc(cls.name)}</strong>
            <span class="gc-class-desc">${esc(cls.desc)}</span>
            <span class="gc-bar-row"><span class="gc-bar"><i style="width:${pct}%"></i></span><b>${done}/${total}</b></span>
          </span>
        </button>`;
      }).join('')}</div>
    </div>`;
  }

  function openHub() {
    renderHub();
    if (typeof showScreen === 'function') showScreen('greekClassesPage');
    setFull('hub');
    if (typeof setNavActive === 'function') setNavActive('lessons');
    if (typeof showBottomNav === 'function') showBottomNav();
    if (typeof _updateAppHeaderForScreen === 'function') _updateAppHeaderForScreen('greekClassesPage');
    requestAnimationFrame(() => { const p = document.querySelector('#greekClassesPage .gc-page'); if (p) p.scrollTop = 0; });
  }

  /* ── Inside a class: the lesson list ─────────────────────────────────── */
  let _classKey = 'basic';
  function renderClass(cls) {
    const el = ensureScreen('greekClassPage', 'Class lessons');
    const list = lessonsFor(cls);
    const done = doneCount(cls);
    const next = nextLesson(cls);
    const pct = list.length ? Math.round(done / list.length * 100) : 0;
    el.innerHTML = `${decoHTML()}<div class="gc-page gc-class-page">
      <header class="gc-brand-row">
        <button type="button" class="gc-icon-btn" onclick="gcOpenHub()" aria-label="Back to classes">${ART.back}</button>
        <h1 class="gc-brand gc-brand-sm">${ART.temple}<span>${esc(cls.name)}</span></h1>
        <span class="gc-icon-spacer"></span>
      </header>
      <div class="gc-key" aria-hidden="true"></div>
      <p class="gc-sub">Class ${cls.n} · ${done} of ${list.length} lessons done</p>
      <div class="gc-bar gc-bar-wide"><i style="width:${pct}%"></i></div>
      <div class="gc-lesson-list">${list.map((l, i) => {
        const d = isDone(cls, l.id);
        const isNext = next && next.id === l.id && done > 0;
        return `<button type="button" class="gc-lesson-row${d ? ' gc-done' : ''}${isNext ? ' gc-next' : ''}" onclick="gcOpenLesson('${cls.key}','${l.id}')">
          <span class="gc-num">${d ? ART.check : i + 1}</span>
          <span class="gc-lesson-text"><strong>${esc(l.title)}</strong><small>${esc(l.sub)}</small></span>
          ${isNext ? '<span class="gc-pill">Continue</span>' : (l.time ? `<span class="gc-time">${esc(l.time)}</span>` : '')}
        </button>`;
      }).join('')}</div>
    </div>`;
  }

  function openClass(key) {
    const cls = byKey(key) || CLASSES[0];
    _classKey = cls.key;
    rememberClass(cls);
    leavePlayer();
    renderClass(cls);
    if (typeof showScreen === 'function') showScreen('greekClassPage');
    setFull('full');
    if (typeof setNavActive === 'function') setNavActive('lessons');
    if (typeof hideBottomNav === 'function') hideBottomNav();
    requestAnimationFrame(() => {
      const page = document.querySelector('#greekClassPage .gc-page');
      const target = page?.querySelector('.gc-next') || page?.querySelector('.gc-lesson-row:not(.gc-done)');
      if (page) page.scrollTop = 0;
      if (page && target && target.offsetTop > page.clientHeight * 0.7) page.scrollTop = target.offsetTop - page.clientHeight * 0.35;
    });
  }

  /* ── Lesson player ───────────────────────────────────────────────────── */
  const P = { cls: null, id: null, section: null, screen: null, pages: [], page: 0 };
  const pageKey = (cls, id) => `gcPage_${cls.key}_${id}`;

  function sectionFor(cls, id) { return document.getElementById(id + cls.suffix); }

  // Split one lesson section into pages:
  //   cover (title + lead) → one page per section → (checks) → (quiz)
  function buildPages(section) {
    const container = section.querySelector('.lesson-block')?.parentElement;
    if (!container) return [];
    const kids = Array.from(container.children);
    const pages = [{ kind: 'cover', els: [] }];
    let cur = pages[0];
    let afterRule = false;
    kids.forEach(k => {
      const c = k.classList;
      if (c.contains('lesson-block')) {
        cur = { kind: 'block', els: [k], block: k };
        pages.push(cur);
        afterRule = false;
      } else if (k.tagName === 'HR') {
        afterRule = true;
        k.classList.add('gc-pg-hide-always');
      } else if (c.contains('knowledge-check')) {
        if (afterRule || cur.kind === 'cover') {
          if (cur.kind !== 'checks') { cur = { kind: 'checks', els: [] }; pages.push(cur); }
        }
        cur.els.push(k);
      } else if (c.contains('adv-quiz-start-area')) {
        cur = { kind: 'quiz', els: [k] };
        pages.push(cur);
      } else if (c.contains('complete-lesson-box')) {
        k.classList.add('gc-pg-hide-always');
        pages[pages.length - 1].completeBox = k;
      } else {
        // lesson lead, title, cheat strip, intro highlight: all on the cover,
        // unless they sit between sections (then they stay with that page).
        (pages.length === 1 ? pages[0] : cur).els.push(k);
      }
    });
    return pages;
  }

  function prepareSection(cls, section) {
    if (section.dataset.gcReady === '1') return;
    section.dataset.gcReady = '1';
    section.querySelectorAll('.lesson-block').forEach(b => {
      if (b.hasAttribute('onclick')) { b.dataset.gcOnclick = b.getAttribute('onclick'); b.removeAttribute('onclick'); }
      b.classList.add('open');
    });
    // Cover title + laurel art, added once.
    const container = section.querySelector('.lesson-block')?.parentElement;
    container?.classList.add('gc-container');
    if (container && !container.querySelector('.gc-cover')) {
      const lesson = lessonsFor(cls).find(l => l.id === section.id.replace(cls.suffix, '')) || {};
      const cover = document.createElement('div');
      cover.className = 'gc-cover';
      cover.innerHTML = `<h2 class="gc-cover-title">${esc(lesson.title || '')}</h2>
        <div class="gc-cover-art">${laurel(0)}<span class="gc-cover-glyph">${esc(cls.glyph)}</span>${laurel(1)}</div>`;
      container.insertBefore(cover, container.firstChild);
      const meta = document.createElement('p');
      meta.className = 'gc-cover-meta';
      const parts = section.querySelectorAll('.lesson-block').length;
      const checks = section.querySelectorAll('.knowledge-check').length;
      meta.innerHTML = `<span>${ART.book}${parts} part${parts === 1 ? '' : 's'}</span>${lesson.time ? `<span>${ART.clock}${esc(lesson.time)}</span>` : ''}${checks ? `<span>${ART.target}${checks} check${checks === 1 ? '' : 's'}</span>` : ''}`;
      const lead = container.querySelector(':scope > .lesson-lead');
      if (lead) lead.after(meta); else cover.appendChild(meta);
    }
  }

  function markRead(page) {
    const { cls, section, id } = P;
    if (!page?.block || !cls || !section) return;
    try {
      if (cls.key === 'basic' || cls.key === 'advanced') {
        if (typeof markLessonBlockOpened === 'function') markLessonBlockOpened(section, page.block);
      } else {
        const track = cls.key === 'verbBasic' ? 'basic' : 'adv';
        if (typeof _markVerbBlockOpened === 'function') _markVerbBlockOpened(section, page.block, track);
        page.block.classList.add('visited');
        if (typeof _updateVerbCompleteButton === 'function') _updateVerbCompleteButton(id, track);
        if (track === 'adv' && typeof _checkVerbAdvQuizAvailability === 'function') _checkVerbAdvQuizAvailability(id);
      }
    } catch (e) { console.warn('gc markRead', e); }
  }

  function ensureChrome(screenEl) {
    if (screenEl.querySelector(':scope > .gc-player-head')) return;
    const head = document.createElement('header');
    head.className = 'gc-player-head';
    head.innerHTML = `<div class="gc-brand-row">
        <button type="button" class="gc-icon-btn" onclick="gcPlayerBack()" aria-label="Back to lessons">${ART.back}</button>
        <div class="gc-brand gc-brand-sm">${ART.temple}<span>Greek</span></div>
        <span class="gc-icon-spacer"></span>
      </div>
      <p class="gc-sub gc-player-sub"></p>
      <div class="gc-bar gc-bar-player"><i></i></div>`;
    const foot = document.createElement('footer');
    foot.className = 'gc-player-foot';
    foot.innerHTML = `<p class="gc-foot-hint" hidden></p>
      <div class="gc-foot-row">
        <button type="button" class="gc-prev" onclick="gcPrevPage()" aria-label="Previous page">${ART.left}</button>
        <button type="button" class="gc-next-btn" onclick="gcNextPage()"><span>Next</span>${ART.right}</button>
      </div>`;
    screenEl.insertBefore(head, screenEl.firstChild);
    screenEl.appendChild(foot);
    screenEl.insertAdjacentHTML('afterbegin', decoHTML());
  }

  function enterPlayer(cls, id) {
    const section = sectionFor(cls, id);
    const screenEl = document.getElementById(cls.screen);
    if (!section || !screenEl) return false;
    // Leave any other track's player cleanly first.
    if (P.screen && P.screen !== screenEl) P.screen.classList.remove('gc-player-on');
    prepareSection(cls, section);
    ensureChrome(screenEl);
    P.cls = cls; P.id = id; P.section = section; P.screen = screenEl;
    P.pages = buildPages(section);
    let saved = 0;
    try { saved = parseInt(localStorage.getItem(pageKey(cls, id)) || '0', 10) || 0; } catch {}
    if (isDone(cls, id)) saved = 0;
    P.page = Math.min(Math.max(saved, 0), P.pages.length - 1);
    screenEl.classList.add('gc-player-on');
    setFull('full');
    if (typeof hideBottomNav === 'function') hideBottomNav();
    rememberClass(cls);
    _classKey = cls.key;
    showPage(P.page, true);
    return true;
  }

  function leavePlayer() {
    if (P.screen) P.screen.classList.remove('gc-player-on');
    P.cls = null; P.id = null; P.section = null; P.screen = null; P.pages = []; P.page = 0;
  }

  function showPage(n, instant) {
    const { pages, section, cls, id } = P;
    if (!section) return;
    n = Math.min(Math.max(n, 0), pages.length - 1);
    const dir = n >= P.page ? 1 : -1;
    P.page = n;
    pages.forEach((pg, i) => pg.els.forEach(el => el.classList.toggle('gc-pg-hide', i !== n)));
    section.querySelectorAll('.gc-cover, .gc-cover-meta').forEach(el => el.classList.toggle('gc-pg-hide', n !== 0));
    section.dataset.gcKind = pages[n].kind;
    // Sections that are shown together with a check are read once seen.
    markRead(pages[n]);
    try { localStorage.setItem(pageKey(cls, id), String(n)); } catch {}
    section.scrollTop = 0;
    if (!instant) {
      section.classList.remove('gc-turn-next', 'gc-turn-prev');
      void section.offsetWidth;
      section.classList.add(dir > 0 ? 'gc-turn-next' : 'gc-turn-prev');
    }
    refreshChrome();
  }

  function lessonIndex() {
    const list = lessonsFor(P.cls);
    return list.findIndex(l => l.id === P.id);
  }

  function refreshChrome() {
    const { screen, pages, page, cls, id, section } = P;
    if (!screen || !cls) return;
    const list = lessonsFor(cls);
    const idx = lessonIndex();
    const sub = screen.querySelector('.gc-player-sub');
    if (sub) sub.textContent = `Lesson ${idx + 1} of ${list.length} · ${cls.name}`;
    const bar = screen.querySelector('.gc-bar-player i');
    if (bar) bar.style.width = `${Math.round((page + 1) / pages.length * 100)}%`;
    const prev = screen.querySelector('.gc-prev');
    if (prev) prev.disabled = page === 0;
    const nextBtn = screen.querySelector('.gc-next-btn');
    const label = nextBtn?.querySelector('span');
    const hint = screen.querySelector('.gc-foot-hint');
    if (!nextBtn || !label) return;
    nextBtn.disabled = false;
    nextBtn.classList.remove('gc-finish');
    if (hint) { hint.hidden = true; hint.textContent = ''; }
    const last = page === pages.length - 1;
    if (!last) { label.textContent = 'Next'; return; }
    const nextL = list[idx + 1];
    if (isDone(cls, id)) {
      label.textContent = nextL ? `Continue to Lesson ${idx + 2}` : 'Back to lessons';
      return;
    }
    const quizBtn = section?.querySelector('.adv-start-quiz-btn');
    if (quizBtn) {
      label.textContent = 'Start lesson quiz';
      nextBtn.disabled = quizBtn.disabled;
      if (quizBtn.disabled && hint) {
        hint.hidden = false;
        hint.textContent = 'Answer every knowledge check in this lesson to unlock the quiz.';
      }
      return;
    }
    const completeBtn = section?.querySelector('.complete-lesson-btn');
    label.textContent = 'Complete lesson';
    nextBtn.classList.add('gc-finish');
    if (completeBtn && completeBtn.disabled && hint) {
      hint.hidden = false;
      hint.textContent = 'Go back and read every page to complete this lesson.';
      nextBtn.disabled = true;
    }
  }

  function nextPage() {
    const { pages, page, cls, id, section } = P;
    if (!cls) return;
    if (page < pages.length - 1) { showPage(page + 1); return; }
    const list = lessonsFor(cls);
    const idx = lessonIndex();
    if (isDone(cls, id)) {
      const nextL = list[idx + 1];
      if (nextL) openLesson(cls.key, nextL.id);
      else openClass(cls.key);
      return;
    }
    const quizBtn = section?.querySelector('.adv-start-quiz-btn');
    if (quizBtn) { if (!quizBtn.disabled) quizBtn.click(); return; }
    const completeBtn = section?.querySelector('.complete-lesson-btn');
    if (completeBtn && !completeBtn.disabled) completeBtn.click();
    setTimeout(refreshChrome, 60);
  }

  function prevPage() { if (P.cls && P.page > 0) showPage(P.page - 1); }
  function playerBack() { openClass(P.cls?.key || _classKey); }

  /* ── Open a lesson from anywhere ─────────────────────────────────────── */
  const ORIG = {};
  function openLesson(key, id) {
    const cls = byKey(key);
    if (!cls) return;
    const fn = ORIG[cls.open] || window[cls.open];
    if (typeof showScreen === 'function') showScreen(cls.screen);
    if (typeof fn === 'function') fn(id);
    enterPlayer(cls, id);
  }

  /* ── Route the old menus and dashboards to the new screens ───────────── */
  function wrap(name, after) {
    const orig = window[name];
    if (typeof orig !== 'function' || orig.__gc) return;
    ORIG[name] = orig;
    const w = function (...args) { return after(orig, args); };
    w.__gc = true;
    window[name] = w;
  }

  function install() {
    // Lesson openers → player.
    CLASSES.forEach(cls => {
      wrap(cls.open, (orig, args) => {
        if (typeof showScreen === 'function' && !document.getElementById(cls.screen)?.classList.contains('active')) showScreen(cls.screen);
        const r = orig.apply(this, args);
        enterPlayer(cls, args[0]);
        return r;
      });
    });
    // Track menus → that class's lesson list.
    const toClass = key => (orig, args) => { openClass(key); };
    wrap('_openBasicLearnMenu', toClass('basic'));
    wrap('showAdvancedLearnMenu', toClass('advanced'));
    wrap('showBasicVerbsTrack', toClass('verbBasic'));
    wrap('showAdvVerbsTrack', toClass('verbAdv'));
    // Lesson dashboards (e.g. "Back to lessons" after finishing) → lesson list.
    const dashTo = key => (orig, args) => { try { orig.apply(this, args); } catch {} openClass(key); };
    wrap('showLearnDashboard', dashTo('basic'));
    wrap('showAdvancedLearnDashboard', dashTo('advanced'));
    wrap('showVerbBasicDashboard', dashTo('verbBasic'));
    wrap('showVerbAdvDashboard', dashTo('verbAdv'));
    // The Lessons tab → Classes.
    wrap('showNewLearnMenu', () => openHub());

    // Leave the player when any other screen opens.
    wrap('showScreen', (orig, args) => {
      const id = args[0];
      const r = orig.apply(this, args);
      const inPlayer = P.screen && P.screen.id === id;
      if (!inPlayer && P.screen) leavePlayer();
      if (id === 'greekClassesPage') setFull('hub');
      else if (id === 'greekClassPage' || inPlayer) setFull('full');
      else setFull(null);
      return r;
    });

    // Keep the footer button in step with checks, quizzes and completion.
    document.addEventListener('click', () => { if (P.cls) setTimeout(refreshChrome, 80); }, true);
    ['completeLesson', 'completeAdvancedLesson', 'completeVerbBasicLesson', 'completeVerbAdvancedLesson'].forEach(n => {
      wrap(n, (orig, args) => { const r = orig.apply(this, args); setTimeout(refreshChrome, 30); return r; });
    });

    // Swipe between pages.
    let sx = 0, sy = 0, st = 0;
    document.addEventListener('touchstart', e => {
      if (!P.cls || !e.target.closest?.('.gc-player-on')) return;
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
    }, { passive: true });
    document.addEventListener('touchend', e => {
      if (!P.cls || !st || !e.target.closest?.('.gc-player-on')) { st = 0; return; }
      if (e.target.closest('table, .table-scroll, [class*="scroll"], input, textarea, .knowledge-check')) { st = 0; return; }
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Date.now() - st < 600 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) {
        if (dx < 0 && P.page < P.pages.length - 1) showPage(P.page + 1);
        else if (dx > 0) prevPage();
      }
      st = 0;
    }, { passive: true });
  }

  window.gcOpenHub = openHub;
  window.gcOpenClass = openClass;
  window.gcOpenLesson = openLesson;
  window.gcNextPage = nextPage;
  window.gcPrevPage = prevPage;
  window.gcPlayerBack = playerBack;
  window.gcRefresh = refreshChrome;

  install();
})();
