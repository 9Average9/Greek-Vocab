/* ══════════════════════════════════════════════════════════════════════════
   BIBLE QUIZ  —  a premium, full-screen, AI-generated Scripture quiz studio.

   Self-contained IIFE. The only global it exposes is window.openBibleQuiz(el),
   called by the Tools tile on the home screen. The whole UI (page shell + every
   view) is injected on first open, so index.html only needs the tile plus the
   <script>/<link> tags.

   How the feature works, in one breath:
     • The user describes a passage + difficulty + focus; ONE call to the
       generateBibleQuiz Cloud Function returns the entire quiz as structured
       JSON — every question, its options, the answer, a tailored hint, the
       supporting reference/verse, and an explanation. Generating it all up
       front is the efficient path: hints and explanations are then instant,
       with zero extra AI calls while the user plays.
     • Results (score %, per-question review) and individually-saved questions
       persist to localStorage so history + stats survive across sessions.
     • High-percentage and longer quizzes award XP to the profile via addXP().

   Added beyond the brief:
     - Four difficulty tiers (Broad → Scholar) with plain-language meaning.
     - Focus areas (people, places, numbers, prophecy, …) the user can weight
       the quiz toward. Tricky distractors are always on — every quiz is a
       real test.
     - Helper copy lives behind tiny ⓘ info buttons that reveal on tap and
       auto-hide after 5 seconds, keeping every screen clean.
     - Per-quiz + lifetime stats (quizzes taken, average score, XP earned).
     - Save individual questions to a personal review deck.
     - Instant graded feedback with the correct verse revealed after answering.
     - "Quiz after reading habit": when enabled, completing a habit whose note
       contains a Bible reference offers a knowledge check on that passage via
       window.BibleQuiz.maybeOfferHabitQuiz (called from the habits code).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const BQ_KEY = 'discipleBibleQuiz.v1';
  const uid = () => 'bq' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  /* ───────── Reference data ───────── */
  const DIFFICULTIES = [
    { id: 'broad',    name: 'Broad',    desc: 'Themes & main events' },
    { id: 'balanced', name: 'Balanced', desc: 'A fair, varied mix' },
    { id: 'detailed', name: 'Detailed', desc: 'Names, numbers, order' },
    { id: 'scholar',  name: 'Scholar',  desc: 'Deep & precise' }
  ];
  const FOCUS = [
    { id: 'narrative',   label: 'Story & events', icon: 'menu_book' },
    { id: 'people',      label: 'People',         icon: 'group' },
    { id: 'places',      label: 'Places',         icon: 'public' },
    { id: 'numbers',     label: 'Numbers',        icon: 'tag' },
    { id: 'quotes',      label: 'Who said it',    icon: 'format_quote' },
    { id: 'prophecy',    label: 'Prophecy',       icon: 'bolt' },
    { id: 'application', label: 'Application',    icon: 'self_improvement' }
  ];
  const CAT_ICON = {
    narrative: 'menu_book', people: 'group', places: 'public', numbers: 'tag',
    doctrine: 'church', quotes: 'format_quote', prophecy: 'bolt', application: 'self_improvement'
  };
  const LETTERS = ['A', 'B', 'C', 'D'];

  /* ───────── Persistence ───────── */
  function loadStore() {
    try {
      const raw = localStorage.getItem(BQ_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (!Array.isArray(s.quizzes)) s.quizzes = [];
        if (!Array.isArray(s.savedQuestions)) s.savedQuestions = [];
        if (!s.settings || typeof s.settings !== 'object') s.settings = {};
        // ON by default for everyone — the feature comes to the user instead
        // of waiting to be discovered. habitQuizSet records a deliberate
        // toggle, so an explicit "off" sticks across sessions; stores saved
        // before this flag existed get migrated to on.
        if (!s.settings.habitQuizSet || typeof s.settings.habitQuiz !== 'boolean') s.settings.habitQuiz = true;
        if (!Number.isFinite(s.settings.habitQuizCount)) s.settings.habitQuizCount = 5;
        if (!s.promptedHabitChecks || typeof s.promptedHabitChecks !== 'object') s.promptedHabitChecks = {};
        return s;
      }
    } catch (e) {}
    return {
      quizzes: [], savedQuestions: [],
      settings: { habitQuiz: true, habitQuizCount: 5 },
      promptedHabitChecks: {}
    };
  }
  let store = loadStore();
  let saveTimer = null;
  function persist(now) {
    clearTimeout(saveTimer);
    const write = () => { try { localStorage.setItem(BQ_KEY, JSON.stringify(store)); } catch (e) {} };
    if (now) write(); else saveTimer = setTimeout(write, 350);
  }

  /* ───────── DOM helpers (mirrors the app's own tiny el/icon pattern) ───────── */
  function el(tag, props, kids) {
    const n = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'class') n.className = props[k];
      else if (k === 'html') n.innerHTML = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k === 'style' && typeof props[k] === 'object') Object.assign(n.style, props[k]);
      else if (k.startsWith('on') && typeof props[k] === 'function') n.addEventListener(k.slice(2), props[k]);
      else if (props[k] != null && props[k] !== false) n.setAttribute(k, props[k] === true ? '' : props[k]);
    }
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  const icon = name => el('span', { class: 'material-symbols-outlined', text: name });

  /* Tiny ⓘ button + auto-hiding helper text. Helper copy stays hidden until the
     info button is tapped, then fades back out after 5 seconds — so every
     screen stays clean by default but nothing is unexplained. */
  function infoHelp(helpText) {
    const help = el('div', { class: 'bq-help', text: helpText });
    const btn = el('button', { class: 'bq-infobtn', type: 'button', 'aria-label': 'More info', 'aria-expanded': 'false' }, [icon('info')]);
    let hideTimer = null;
    const hide = () => {
      clearTimeout(hideTimer);
      help.classList.remove('bq-help-show');
      btn.setAttribute('aria-expanded', 'false');
    };
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (help.classList.contains('bq-help-show')) { hide(); return; }
      help.classList.add('bq-help-show');
      btn.setAttribute('aria-expanded', 'true');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 5000);
    });
    return { btn, help };
  }

  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById('bqToast');
    if (!t) { t = el('div', { class: 'bq-toast', id: 'bqToast' }); (page || document.body).appendChild(t); }
    t.textContent = msg;
    t.classList.add('bq-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('bq-show'), 2200);
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ───────── Page shell ───────── */
  let page = null;
  function buildShell() {
    if (page) return;
    page = el('section', { class: 'bq-hidden', id: 'bibleQuizPage' });
    document.body.appendChild(page);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && page && !page.classList.contains('bq-hidden')) back();
    });
    // If the app was backgrounded mid-generation and the request was dropped,
    // re-fire it the moment we're visible again.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!page || page.classList.contains('bq-hidden')) return;
      if (genInFlight) return; // a call is still pending — let it resolve
      const a = store && store.active;
      if (a && a.phase === 'generating' && (view === 'loading' || view === 'error') && a.payload && a.payload.base) {
        runGeneration(a.payload.base, a.payload.total || (form && form.numQuestions) || 10);
      }
    });
  }

  window.openBibleQuiz = function (launcher) {
    buildShell();
    // Already mid-flight in this context (feature was just hidden, not closed)
    // — re-reveal whatever's on screen instead of resetting to home.
    if (genInFlight || (quiz && (view === 'quiz' || view === 'loading'))) {
      page.classList.remove('bq-hidden');
      requestAnimationFrame(() => page.classList.add('bq-open'));
      return;
    }
    store = loadStore();
    page.classList.remove('bq-hidden');
    requestAnimationFrame(() => page.classList.add('bq-open'));
    // A persisted, recent, unfinished session? Resume it. Otherwise go home.
    const a = store.active;
    if (a && (Date.now() - (a.savedAt || 0)) < BQ_ACTIVE_TTL && resumeActive(a)) return;
    if (a) clearActive();
    renderHome();
  };

  function closeFeature() {
    if (!page) return;
    page.classList.remove('bq-open');
    setTimeout(() => page && page.classList.add('bq-hidden'), 280);
    if (typeof window.showBottomNav === 'function') window.showBottomNav();
  }

  // Contextual back — where "back" goes depends on the current view.
  function back() {
    if (view === 'home') closeFeature();
    else if (view === 'builder' || view === 'archive') renderHome();
    else if (view === 'quiz') {
      if (confirm('Leave this quiz? Your progress will be lost.')) { clearActive(); renderHome(); }
    } else renderHome();
  }

  /* ───────── Top bar ───────── */
  function topbar(opts) {
    // opts: { left:{icon,onclick,label}, title, sub, right:{icon,onclick,label} }
    return el('div', { class: 'bq-topbar' }, [
      opts.left
        ? el('button', { class: 'bq-iconbtn', onclick: opts.left.onclick, 'aria-label': opts.left.label || 'Back' }, [icon(opts.left.icon)])
        : el('span'),
      el('div', { class: 'bq-topbar-title' }, [
        el('strong', { text: opts.title }),
        opts.sub ? el('small', { text: opts.sub }) : null
      ]),
      opts.right
        ? el('button', { class: 'bq-iconbtn', onclick: opts.right.onclick, 'aria-label': opts.right.label || 'Menu' }, [icon(opts.right.icon)])
        : el('span')
    ]);
  }

  function mount(topbarNode, scrollKids, footerNode) {
    page.innerHTML = '';
    page.appendChild(topbarNode);
    const scroll = el('div', { class: 'bq-scroll' }, scrollKids);
    page.appendChild(scroll);
    if (footerNode) page.appendChild(footerNode);
    return scroll;
  }

  /* ───────── Stats ───────── */
  function stats() {
    const qz = store.quizzes;
    const count = qz.length;
    const avg = count ? Math.round(qz.reduce((a, q) => a + (q.pct || 0), 0) / count) : 0;
    const xp = qz.reduce((a, q) => a + (q.xp || 0), 0);
    return { count, avg, xp };
  }

  /* ══════════════════════════════════════════════════════════════════════
     HOME
     ══════════════════════════════════════════════════════════════════════ */
  let view = 'home';
  function renderHome() {
    view = 'home';
    const s = stats();
    const kids = [];
    let rise = 0;
    const staggered = node => {
      node.classList.add('bq-rise');
      node.style.animationDelay = (rise++ * 60) + 'ms';
      return node;
    };

    // Hero — one line of copy, the rest behind the ⓘ button.
    const heroInfo = infoHelp('Point the AI at any passage — or several — and it writes a real test of what the text says, with hints, verses, and explanations. Score high to earn XP.');
    kids.push(staggered(el('div', { class: 'bq-hero' }, [
      el('div', { class: 'bq-hero-badge' }, [icon('quiz')]),
      el('div', { class: 'bq-hero-title' }, [el('h1', { text: 'Bible Quiz' }), heroInfo.btn]),
      el('p', { text: 'Turn what you read into what you remember.' }),
      heroInfo.help
    ])));

    kids.push(staggered(el('button', { class: 'bq-cta', onclick: newQuiz }, [icon('add'), 'New Quiz'])));

    // Lifetime stat strip
    kids.push(staggered(el('div', { class: 'bq-stats' }, [
      el('div', { class: 'bq-card bq-stat' }, [el('b', { text: String(s.count) }), el('span', { text: 'Quizzes' })]),
      el('div', { class: 'bq-card bq-stat' }, [el('b', { text: s.count ? s.avg + '%' : '—' }), el('span', { text: 'Avg score' })]),
      el('div', { class: 'bq-card bq-stat' }, [el('b', { text: String(s.xp) }), el('span', { text: 'XP earned' })])
    ])));

    // Quiz after reading habit — toggle + questions-per-check stepper
    kids.push(staggered(habitSyncCard()));

    // Recent quizzes
    if (store.quizzes.length) {
      kids.push(staggered(el('div', { class: 'bq-section-label', text: 'Recent quizzes' })));
      const list = el('div', { class: 'bq-recent-list' });
      store.quizzes.slice(0, 3).forEach(q => list.appendChild(histCard(q)));
      kids.push(staggered(list));
      if (store.quizzes.length > 3) {
        kids.push(staggered(el('button', { class: 'bq-cta bq-ghost', style: { marginTop: '12px' }, onclick: () => renderArchive('history') }, [icon('folder'), 'All past quizzes'])));
      }
    }

    mount(topbar({
      left: { icon: 'arrow_back', onclick: closeFeature, label: 'Close' },
      title: 'Bible Quiz',
      right: { icon: 'folder', onclick: () => renderArchive('history'), label: 'Past quizzes' }
    }), kids);
  }

  // "Quiz after reading habit?" — when on, finishing a habit whose note holds a
  // Bible reference offers a quick knowledge check with this many questions.
  function habitSyncCard() {
    const st = store.settings;
    const info = infoHelp('Finish any habit with a Bible reference in its note (e.g. “Read John 3”) and a knowledge check on that passage is offered automatically.');

    const countVal = el('b', { text: String(st.habitQuizCount) });
    const minus = el('button', { class: 'bq-mini-btn', type: 'button', text: '−', 'aria-label': 'Fewer questions' });
    const plus = el('button', { class: 'bq-mini-btn', type: 'button', text: '+', 'aria-label': 'More questions' });
    const syncCount = () => {
      countVal.textContent = String(st.habitQuizCount);
      minus.disabled = st.habitQuizCount <= 3;
      plus.disabled = st.habitQuizCount >= 15;
    };
    minus.addEventListener('click', () => { if (st.habitQuizCount > 3) { st.habitQuizCount--; syncCount(); persist(); } });
    plus.addEventListener('click', () => { if (st.habitQuizCount < 15) { st.habitQuizCount++; syncCount(); persist(); } });
    syncCount();
    const countRow = el('div', { class: 'bq-habit-count' + (st.habitQuiz ? ' bq-open-row' : '') }, [
      el('span', { class: 'bq-habit-count-label', text: 'Questions per check' }),
      el('div', { class: 'bq-mini-step' }, [minus, countVal, plus])
    ]);

    const sw = el('button', { class: 'bq-switch' + (st.habitQuiz ? ' bq-on' : ''), role: 'switch', 'aria-checked': String(st.habitQuiz), onclick: () => {
      st.habitQuiz = !st.habitQuiz;
      st.habitQuizSet = true; // deliberate choice — survives the on-by-default migration
      sw.classList.toggle('bq-on', st.habitQuiz);
      sw.setAttribute('aria-checked', String(st.habitQuiz));
      countRow.classList.toggle('bq-open-row', st.habitQuiz);
      persist();
    } });

    return el('div', { class: 'bq-card bq-habit-card' }, [
      el('div', { class: 'bq-toggle' }, [
        el('div', { class: 'bq-toggle-main' }, [
          el('div', { class: 'bq-toggle-title' }, [el('strong', { text: 'Quiz after reading habit?' }), info.btn]),
          info.help
        ]),
        sw
      ]),
      countRow
    ]);
  }

  function histCard(q) {
    const d = q.createdAt ? new Date(q.createdAt) : null;
    const dateStr = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    return el('div', { class: 'bq-card bq-hist-item', onclick: () => renderResults(q, false) }, [
      el('div', { class: 'bq-hist-score', text: (q.pct != null ? q.pct : 0) + '%' }),
      el('div', { class: 'bq-hist-main' }, [
        el('strong', { text: q.title || q.reference || 'Quiz' }),
        el('small', { text: `${q.correct}/${q.numQuestions} correct · ${dateStr}` })
      ]),
      icon('chevron_right')
    ]);
  }

  /* ══════════════════════════════════════════════════════════════════════
     BUILDER
     ══════════════════════════════════════════════════════════════════════ */
  let form = null;
  function defaultForm() {
    return { reference: '', difficulty: 'balanced', numQuestions: 10, focus: [], tricky: true };
  }
  // Fresh "New Quiz" entry point — always starts with a cleared passage bar.
  // (renderBuilder itself keeps values, so "Try again" after an error doesn't
  // wipe what the user typed.)
  function newQuiz() {
    if (!form) form = defaultForm();
    form.reference = '';
    clearActive(); // starting fresh abandons any in-progress session
    renderBuilder();
  }
  function renderBuilder() {
    view = 'builder';
    if (!form) form = defaultForm();

    const refInput = el('input', {
      class: 'bq-input', type: 'text', value: form.reference,
      placeholder: 'e.g. John 3; Romans 8:1–17',
      oninput: e => { form.reference = e.target.value; }
    });

    // Difficulty — compact one-row segmented control; the selected tier's
    // description lives on a single animated line underneath instead of
    // cluttering every button.
    const diffDesc = el('div', { class: 'bq-seg-desc', text: (DIFFICULTIES.find(d => d.id === form.difficulty) || DIFFICULTIES[1]).desc });
    const diffRow = el('div', { class: 'bq-seg' }, DIFFICULTIES.map(d => {
      const b = el('button', { class: 'bq-seg-opt' + (form.difficulty === d.id ? ' bq-sel' : ''), onclick: () => {
        form.difficulty = d.id;
        diffRow.querySelectorAll('.bq-seg-opt').forEach((n, i) => n.classList.toggle('bq-sel', DIFFICULTIES[i].id === d.id));
        diffDesc.textContent = d.desc;
        diffDesc.classList.remove('bq-desc-swap');
        void diffDesc.offsetWidth; // restart the little swap animation
        diffDesc.classList.add('bq-desc-swap');
      } }, [el('strong', { text: d.name })]);
      return b;
    }));
    const diffGrid = el('div', {}, [diffRow, diffDesc]);

    // Focus pills
    const pillWrap = el('div', { class: 'bq-pills' }, FOCUS.map(f => {
      const p = el('button', { class: 'bq-pill' + (form.focus.includes(f.id) ? ' bq-sel' : ''), onclick: () => {
        const i = form.focus.indexOf(f.id);
        if (i >= 0) form.focus.splice(i, 1); else form.focus.push(f.id);
        p.classList.toggle('bq-sel');
      } }, [icon(f.icon), f.label]);
      return p;
    }));

    // Stepper
    const stepVal = el('div', { class: 'bq-step-val' }, [
      el('b', { text: String(form.numQuestions) }),
      el('span', { text: 'questions' })
    ]);
    const minus = el('button', { class: 'bq-step-btn', text: '−' });
    const plus = el('button', { class: 'bq-step-btn', text: '+' });
    const syncStep = () => {
      stepVal.querySelector('b').textContent = String(form.numQuestions);
      minus.disabled = form.numQuestions <= 3;
      plus.disabled = form.numQuestions >= 20;
    };
    minus.addEventListener('click', () => { if (form.numQuestions > 3) { form.numQuestions--; syncStep(); } });
    plus.addEventListener('click', () => { if (form.numQuestions < 20) { form.numQuestions++; syncStep(); } });
    syncStep();
    const stepper = el('div', { class: 'bq-stepper' }, [minus, stepVal, plus]);

    // Each field's helper copy hides behind a tiny ⓘ at the end of the label.
    const field = (ic, labelText, helpText, control) => {
      const info = infoHelp(helpText);
      return el('div', { class: 'bq-field' }, [
        el('label', { class: 'bq-label' }, [icon(ic), labelText, info.btn]),
        info.help,
        control
      ]);
    };

    const kids = [
      el('div', { class: 'bq-form' }, [
        field('menu_book', 'Passage',
          'A book, chapter, verse, or range — and you can list several passages at once, like “John 3; Romans 8:1–17”.',
          refInput),
        field('tune', 'Difficulty',
          'From broad themes to exact, easily-confused details. Wrong answers are always genuinely plausible — every quiz is a real test.',
          diffGrid),
        field('category', 'Focus (optional)',
          'Weight the questions toward what you want to test. Leave blank for a natural spread.',
          pillWrap),
        field('format_list_numbered', 'Length',
          'More questions is a bigger test — and earns more XP.',
          stepper)
      ])
    ];

    const footer = el('div', { class: 'bq-footer' }, [
      el('button', { class: 'bq-next', onclick: startGeneration }, [icon('auto_awesome'), 'Generate Quiz'])
    ]);

    mount(topbar({
      left: { icon: 'arrow_back', onclick: renderHome, label: 'Back' },
      title: 'New Quiz',
      right: { icon: 'folder', onclick: () => renderArchive('history'), label: 'Past quizzes' }
    }), kids, footer);
  }

  /* ══════════════════════════════════════════════════════════════════════
     GENERATION
     ══════════════════════════════════════════════════════════════════════ */
  // Long quizzes stream in two parts: a fast 3-question opener the user can
  // start answering right away, then the rest written in the background while
  // they play. genToken guards against stale responses after a restart.
  let genToken = 0;
  let genInFlight = 0;        // outstanding generate() calls in THIS page context
  let activePayload = null;   // { base, total } — enough to resume generation

  // Resume window: a persisted in-progress quiz older than this is discarded.
  const BQ_ACTIVE_TTL = 6 * 60 * 60 * 1000;

  // Retry a generate() call a few times with exponential backoff. Transient
  // failures (busy service, transport blips, brief backgrounding) recover on
  // their own; auth/config/argument errors are fatal and thrown immediately.
  function genWithRetry(payload, tries) {
    tries = tries || 3;
    genInFlight++;
    const attempt = n => window.BibleQuizAI.generate(payload).catch(err => {
      if (isFatalGenError(err) || n >= tries) throw err;
      const wait = Math.min(8000, 700 * Math.pow(2, n - 1)) + Math.floor(Math.random() * 400);
      return new Promise(r => setTimeout(r, wait)).then(() => attempt(n + 1));
    });
    return attempt(1).finally(() => { genInFlight = Math.max(0, genInFlight - 1); });
  }

  function isFatalGenError(err) {
    const code = err && err.code ? String(err.code) : '';
    return /unauthenticated|failed-precondition|invalid-argument|permission-denied/.test(code);
  }

  function startGeneration() {
    const ref = (form.reference || '').trim();
    if (!ref) { toast('Add a passage reference first.'); return; }
    if (!window.BibleQuizAI || typeof window.BibleQuizAI.generate !== 'function') {
      renderError("The quiz service isn't available right now. Please reload the app and try again.");
      return;
    }
    runGeneration({
      reference: ref,
      difficulty: form.difficulty,
      focus: form.focus.slice(),
      tricky: form.tricky
    }, form.numQuestions);
  }

  // The actual generation driver — usable both for a fresh start and for
  // resuming a persisted-but-unfinished generation after a reload/foreground.
  function runGeneration(base, total) {
    renderLoading();
    const gen = ++genToken;
    activePayload = { base: base, total: total };
    saveActive('generating');
    const firstCount = total > 5 ? 3 : total;
    genWithRetry(Object.assign({ numQuestions: firstCount }, base))
      .then(data => {
        if (gen !== genToken) return;
        if (!data || !Array.isArray(data.questions) || !data.questions.length) {
          renderError("Couldn't build questions for that passage. Try a broader or clearer reference.");
          clearActive();
          return;
        }
        startQuiz(data, total);
        if (total > data.questions.length) fetchRemainder(gen, base, total - data.questions.length, data.questions);
      })
      .catch(err => {
        if (gen !== genToken) return;
        renderError(describeGenError(err));
        // Keep the pending record for transient failures so returning to the
        // app can retry; drop it only when the error can't be recovered.
        if (isFatalGenError(err)) clearActive();
      });
  }

  function describeGenError(err) {
    const code = err && err.code ? String(err.code) : '';
    if (code.indexOf('unauthenticated') >= 0) return 'Please sign in to your account to create quizzes.';
    if (code.indexOf('resource-exhausted') >= 0) return 'The quiz service is busy right now. Reopen Bible Quiz in a moment and it’ll pick back up.';
    if (code.indexOf('failed-precondition') >= 0) return 'Bible Quiz isn’t configured on the server yet.';
    return (err && err.message) || 'Something went wrong generating the quiz. Please try again.';
  }

  function fetchRemainder(gen, base, count, existing) {
    const payload = Object.assign({
      numQuestions: Math.max(3, Math.min(20, count)),
      // Tell the server what's already been asked so it doesn't repeat.
      avoid: existing.map(q => q.question).slice(0, 30)
    }, base);
    genWithRetry(payload)
      .then(data => {
        if (gen !== genToken || !quiz) return;
        const have = new Set(quiz.questions.map(q => String(q.question).toLowerCase()));
        ((data && data.questions) || []).forEach(q => {
          if (!q || !q.question || have.has(String(q.question).toLowerCase())) return;
          if (quiz.questions.length >= quiz.expectedTotal) return;
          have.add(String(q.question).toLowerCase());
          quiz.questions.push(Object.assign({}, q, { userAnswer: null, selected: null, hintShown: false, saved: false }));
        });
        settleRemainder(false);
      })
      .catch(() => { if (gen === genToken && quiz) settleRemainder(true); });
  }

  /* ───────── Active-session persistence (survive backgrounding / reload) ───────── */
  // The whole in-progress quiz (or the pending generation request) is mirrored
  // to storage so leaving the app and coming back — even after the OS kills the
  // tab — resumes exactly where the user was.
  function serializeActive(phase) {
    if (phase === 'generating') {
      return { phase: 'generating', payload: activePayload, savedAt: Date.now() };
    }
    if (!quiz) return null;
    return {
      phase: 'playing',
      savedAt: Date.now(),
      qIndex: qIndex,
      quiz: {
        title: quiz.title, reference: quiz.reference, difficulty: quiz.difficulty,
        focus: quiz.focus || [], tricky: !!quiz.tricky,
        expectedTotal: quiz.expectedTotal, loading: !!quiz.loading,
        questions: quiz.questions
      }
    };
  }
  function saveActive(phase) {
    try {
      const a = serializeActive(phase);
      if (a) { store.active = a; persist(true); }
    } catch (e) {}
  }
  function clearActive() {
    if (store && store.active) { delete store.active; persist(true); }
    activePayload = null;
  }

  function resumeActive(a) {
    if (a.phase === 'playing' && a.quiz && Array.isArray(a.quiz.questions) && a.quiz.questions.length) {
      quiz = a.quiz;
      quiz.questions = quiz.questions.map(q => Object.assign({ userAnswer: null, selected: null, hintShown: false, saved: false }, q));
      qIndex = Math.min(a.qIndex || 0, Math.max(0, (quiz.expectedTotal || quiz.questions.length) - 1));
      renderQuiz(false);
      toast('Picked up where you left off.');
      // The background batch never finished — resume it.
      if (quiz.loading && quiz.questions.length < quiz.expectedTotal) {
        const gen = ++genToken;
        fetchRemainder(gen, {
          reference: quiz.reference, difficulty: quiz.difficulty,
          focus: quiz.focus || [], tricky: !!quiz.tricky
        }, quiz.expectedTotal - quiz.questions.length, quiz.questions);
      }
      return true;
    }
    if (a.phase === 'generating' && a.payload && a.payload.base) {
      form = form || defaultForm();
      form.reference = a.payload.base.reference;
      runGeneration(a.payload.base, a.payload.total || form.numQuestions || 10);
      return true;
    }
    return false;
  }

  // Remainder finished (or failed): lock the quiz length to what we actually
  // have and refresh whatever the user is looking at.
  function settleRemainder(failed) {
    quiz.loading = false;
    const shrunk = quiz.questions.length < quiz.expectedTotal;
    quiz.expectedTotal = quiz.questions.length;
    if (failed && shrunk) toast('Kept this one to ' + quiz.questions.length + ' questions.');
    saveActive('playing');
    if (view !== 'quiz') return;
    if (qIndex >= quiz.questions.length) {
      // User was sitting on the "writing…" screen.
      if (qIndex < quiz.expectedTotal) renderQuiz(true);
      else finishQuiz();
    } else {
      renderQuiz(false); // refresh the "Question X of N" counter + footer
    }
  }

  function renderLoading() {
    view = 'loading';
    page.innerHTML = '';
    page.appendChild(topbar({ title: 'Building your quiz', sub: form.reference }));
    page.appendChild(el('div', { class: 'bq-loading' }, [
      el('div', { class: 'bq-orb' }, [icon('auto_awesome')]),
      el('h2', { text: 'Writing your first questions…' }),
      el('p', { text: 'The AI is reading ' + (form.reference || 'the passage') + '. You’ll start in seconds — the rest is written while you play.' }),
      el('div', { class: 'bq-dots' }, [el('span'), el('span'), el('span')])
    ]));
  }

  function renderError(msg) {
    view = 'error';
    const kids = [
      el('div', { class: 'bq-hero', style: { paddingTop: '30px' } }, [
        el('div', { class: 'bq-hero-badge', style: { background: 'color-mix(in srgb, var(--bq-wrong) 80%, #000)' } }, [icon('error')]),
        el('h1', { text: 'Hmm.' }),
        el('div', { class: 'bq-error-box' }, [icon('info'), el('span', { text: msg })])
      ]),
      el('button', { class: 'bq-cta', style: { marginTop: '20px' }, onclick: renderBuilder }, [icon('refresh'), 'Try again'])
    ];
    mount(topbar({
      left: { icon: 'arrow_back', onclick: renderBuilder, label: 'Back' },
      title: 'New Quiz'
    }), kids);
  }

  /* ══════════════════════════════════════════════════════════════════════
     QUIZ RUNTIME
     ══════════════════════════════════════════════════════════════════════ */
  let quiz = null; // { title, reference, difficulty, expectedTotal, loading, questions:[...] }
  let qIndex = 0;

  function startQuiz(data, expectedTotal) {
    quiz = {
      title: data.title || data.reference,
      reference: data.reference,
      difficulty: data.difficulty || form.difficulty,
      focus: data.focus || [],
      tricky: !!data.tricky,
      expectedTotal: Math.max(expectedTotal || 0, data.questions.length),
      loading: (expectedTotal || 0) > data.questions.length,
      questions: data.questions.map(q => Object.assign({}, q, { userAnswer: null, selected: null, hintShown: false, saved: false }))
    };
    qIndex = 0;
    renderQuiz(false);
    saveActive('playing');
  }

  function renderQuiz(animate) {
    view = 'quiz';
    const total = quiz.expectedTotal;
    const waiting = qIndex >= quiz.questions.length; // background batch still writing
    const q = waiting ? null : quiz.questions[qIndex];
    const answered = !!q && q.userAnswer != null;
    const pct = Math.round(((qIndex + 1) / total) * 100);

    // Progress card
    const progressFill = el('div', { class: 'bq-progress-fill' });
    const progress = el('div', { class: 'bq-card bq-progress-card' }, [
      el('div', { class: 'bq-progress-top' }, [
        el('span', { text: `Question ${qIndex + 1} of ${total}` }),
        el('b', { text: pct + '%' })
      ]),
      el('div', { class: 'bq-progress-track' }, [progressFill])
    ]);

    let qcard, actions = null, optionsWrap = null, extras = null;
    if (waiting) {
      // The user answered faster than the AI writes — brief holding card.
      qcard = el('div', { class: 'bq-card bq-qcard bq-qwait' + (animate ? ' bq-anim-in' : '') }, [
        el('div', { class: 'bq-orb bq-orb-sm' }, [icon('auto_awesome')]),
        el('h2', { text: 'Writing your next question…' }),
        el('p', { text: 'You’re faster than the ink dries. One second.' }),
        el('div', { class: 'bq-dots' }, [el('span'), el('span'), el('span')])
      ]);
    } else {
      optionsWrap = el('div', { class: 'bq-options' });
      q.options.forEach((opt, i) => optionsWrap.appendChild(optionNode(q, i)));

      qcard = el('div', { class: 'bq-card bq-qcard' + (animate ? ' bq-anim-in' : '') }, [
        el('div', { class: 'bq-qcat' }, [icon(CAT_ICON[q.category] || 'menu_book')]),
        el('h2', { class: 'bq-question', text: q.question }),
        q.reference ? el('p', { class: 'bq-qref', text: q.reference }) : null,
        optionsWrap
      ]);

      // Hint + reveal slots live inside the card, appended dynamically
      extras = el('div', { class: 'bq-qcard-extras' });
      qcard.appendChild(extras);

      const hintBtn = el('button', { class: 'bq-qaction', onclick: () => showHint(q, extras, hintBtn) }, [icon('lightbulb'), 'Show Hint']);
      const saveBtn = el('button', { class: 'bq-qaction' + (q.saved ? ' bq-saved' : ''), onclick: () => toggleSaveQuestion(q, saveBtn) }, [
        icon(q.saved ? 'bookmark_added' : 'bookmark'),
        q.saved ? 'Saved' : 'Save Question'
      ]);
      actions = el('div', { class: 'bq-qactions' }, [hintBtn, saveBtn]);
    }

    // Footer button: Check Answer → Next Question / See Results.
    const nextBtn = el('button', { class: 'bq-next', onclick: onFooterTap }, []);
    const footer = el('div', { class: 'bq-footer' }, [nextBtn]);

    const scroll = mount(topbar({
      left: { icon: 'home', onclick: () => back(), label: 'Home' },
      title: 'Bible Quiz',
      sub: quiz.reference,
      right: { icon: 'folder', onclick: leaveToArchive, label: 'Past quizzes' }
    }), actions ? [progress, qcard, actions] : [progress, qcard], footer);

    // Restore state when revisiting or re-rendering mid-question.
    if (q) {
      if (answered) {
        gradeOptions(optionsWrap, q);
        appendReveal(extras, q);
        if (q.hintShown) appendHint(extras, q);
      } else {
        if (q.selected != null) {
          Array.prototype.forEach.call(optionsWrap.children, n => n.classList.toggle('bq-picked', n._index === q.selected));
        }
        if (q.hintShown) appendHint(extras, q);
      }
    }
    syncFooterBtn(nextBtn);

    // Animate progress bar to its value after paint.
    requestAnimationFrame(() => { progressFill.style.width = pct + '%'; });

    // Stash refs used by grading
    scroll._optionsWrap = optionsWrap;
    scroll._extras = extras;
    scroll._nextBtn = nextBtn;
  }

  // One footer button, three states.
  function syncFooterBtn(btn) {
    if (!btn) return;
    const waiting = qIndex >= quiz.questions.length;
    const q = waiting ? null : quiz.questions[qIndex];
    btn.innerHTML = '';
    if (waiting) {
      btn.appendChild(icon('auto_awesome'));
      btn.appendChild(document.createTextNode('Writing…'));
      btn.disabled = true;
    } else if (q.userAnswer == null) {
      btn.appendChild(icon('check_circle'));
      btn.appendChild(document.createTextNode('Check Answer'));
      btn.disabled = q.selected == null;
    } else {
      const isLast = qIndex + 1 >= quiz.expectedTotal;
      btn.appendChild(document.createTextNode(isLast ? 'See Results' : 'Next Question'));
      btn.appendChild(icon(isLast ? 'flag' : 'arrow_forward'));
      btn.disabled = false;
    }
  }

  function onFooterTap() {
    if (qIndex >= quiz.questions.length) return;
    const q = quiz.questions[qIndex];
    if (q.userAnswer == null) checkAnswer(); else goNext();
  }

  function optionNode(q, i) {
    const badge = el('div', { class: 'bq-opt-badge', text: LETTERS[i] });
    const node = el('button', { class: 'bq-opt', onclick: () => selectOption(q, i, node) }, [
      badge,
      el('div', { class: 'bq-opt-text', text: q.options[i] })
    ]);
    node._badge = badge;
    node._index = i;
    return node;
  }

  // Tapping an option only highlights it — the user can move freely between
  // answers until they press Check Answer.
  function selectOption(q, i, node) {
    if (q.userAnswer != null) return; // locked once checked
    q.selected = i;
    const scroll = page.querySelector('.bq-scroll');
    if (scroll && scroll._optionsWrap) {
      Array.prototype.forEach.call(scroll._optionsWrap.children, n => n.classList.toggle('bq-picked', n._index === i));
    }
    node.classList.add('bq-pop');
    setTimeout(() => node.classList.remove('bq-pop'), 340);
    if (scroll && scroll._nextBtn) syncFooterBtn(scroll._nextBtn);
  }

  function checkAnswer() {
    const q = quiz.questions[qIndex];
    if (!q || q.userAnswer != null || q.selected == null) return;
    q.userAnswer = q.selected;
    const scroll = page.querySelector('.bq-scroll');
    if (!scroll) return;
    gradeOptions(scroll._optionsWrap, q);
    appendReveal(scroll._extras, q);
    syncFooterBtn(scroll._nextBtn);
    saveActive('playing'); // persist the graded answer
  }

  function gradeOptions(wrap, q) {
    Array.prototype.forEach.call(wrap.children, node => {
      const i = node._index;
      node.classList.add('bq-locked');
      if (i === q.answerIndex) node.classList.add('bq-right');
      else if (i === q.userAnswer) node.classList.add('bq-wrong');
      else node.classList.add('bq-dim');
      // mark badge glyph for clarity
      if (i === q.answerIndex) { node._badge.innerHTML = ''; node._badge.appendChild(icon('check')); }
      else if (i === q.userAnswer) { node._badge.innerHTML = ''; node._badge.appendChild(icon('close')); }
    });
  }

  function appendReveal(extras, q) {
    if (extras.querySelector('.bq-reveal')) return;
    const body = el('div', { class: 'bq-reveal-body' }, [
      el('strong', { text: q.reference || 'Reference' }),
      q.verse ? el('p', { text: '“' + q.verse + '”' }) : null,
      q.explanation ? el('p', { class: 'bq-expl', text: q.explanation }) : null
    ]);
    extras.appendChild(el('div', { class: 'bq-reveal' }, [
      el('div', { class: 'bq-reveal-ico' }, [icon('menu_book')]),
      body
    ]));
  }

  function showHint(q, extras, btn) {
    if (q.hintShown) return;
    q.hintShown = true;
    if (btn) { btn.disabled = true; btn.classList.add('bq-dim'); }
    appendHint(extras, q);
  }
  function appendHint(extras, q) {
    if (extras.querySelector('.bq-hint')) return;
    // Reveal card should sit below the hint if both present — insert hint first.
    const hint = el('div', { class: 'bq-hint' }, [icon('lightbulb'), el('span', { text: q.hint || 'Re-read the passage carefully — the answer is there.' })]);
    const reveal = extras.querySelector('.bq-reveal');
    if (reveal) extras.insertBefore(hint, reveal); else extras.appendChild(hint);
  }

  function toggleSaveQuestion(q, btn) {
    q.saved = !q.saved;
    btn.classList.toggle('bq-saved', q.saved);
    btn.innerHTML = '';
    btn.appendChild(icon(q.saved ? 'bookmark_added' : 'bookmark'));
    btn.appendChild(document.createTextNode(q.saved ? 'Saved' : 'Save Question'));
    if (q.saved) {
      store.savedQuestions.unshift({
        id: uid(),
        question: q.question, options: q.options.slice(), answerIndex: q.answerIndex,
        reference: q.reference, verse: q.verse, hint: q.hint, explanation: q.explanation,
        category: q.category, quizTitle: quiz ? quiz.title : '', savedAt: Date.now(),
        _fromQuestion: q.question // used to locate on un-save
      });
      toast('Question saved to your deck.');
    } else {
      const idx = store.savedQuestions.findIndex(s => s._fromQuestion === q.question && s.reference === q.reference);
      if (idx >= 0) store.savedQuestions.splice(idx, 1);
      toast('Removed from your deck.');
    }
    persist();
  }

  function goNext() {
    const q = quiz.questions[qIndex];
    if (!q || q.userAnswer == null) return;
    if (qIndex + 1 >= quiz.expectedTotal) { finishQuiz(); return; }
    // Advancing past the loaded questions shows the "writing…" card until the
    // background batch lands (settleRemainder re-renders when it does).
    const card = page.querySelector('.bq-qcard');
    const advance = () => { qIndex++; renderQuiz(true); saveActive('playing'); };
    if (card && !reduceMotion()) {
      card.classList.add('bq-anim-out');
      setTimeout(advance, 200);
    } else advance();
  }

  function leaveToArchive() {
    if (confirm('Leave this quiz? Your progress will be lost.')) { clearActive(); renderArchive('history'); }
  }

  /* ══════════════════════════════════════════════════════════════════════
     RESULTS
     ══════════════════════════════════════════════════════════════════════ */
  function computeXP(numQuestions, pct) {
    const base = numQuestions * 3;
    let xp = Math.round(base * (pct / 100));
    if (pct >= 90) xp += numQuestions * 3;      // mastery bonus
    else if (pct >= 75) xp += numQuestions;      // strong-finish bonus
    return Math.max(numQuestions, xp);           // finishing always earns something
  }

  function finishQuiz() {
    const total = quiz.questions.length;
    const correct = quiz.questions.reduce((a, q) => a + (q.userAnswer === q.answerIndex ? 1 : 0), 0);
    const pct = Math.round((correct / total) * 100);
    const xp = computeXP(total, pct);

    const record = {
      id: uid(),
      title: quiz.title,
      reference: quiz.reference,
      difficulty: quiz.difficulty,
      numQuestions: total,
      correct,
      pct,
      xp,
      createdAt: Date.now(),
      questions: quiz.questions.map(q => ({
        question: q.question, options: q.options, answerIndex: q.answerIndex,
        reference: q.reference, verse: q.verse, explanation: q.explanation,
        category: q.category, userAnswer: q.userAnswer
      }))
    };
    store.quizzes.unshift(record);
    clearActive(); // quiz is done — no session to resume
    persist(true);

    // Award XP to the profile (addXP no-ops gracefully if not signed in).
    if (typeof window.addXP === 'function') {
      try { window.addXP(xp, `Bible Quiz — ${pct}% on ${quiz.reference}`, true); } catch (e) {}
    }

    renderResults(record, true);
  }

  function praise(pct) {
    if (pct >= 95) return 'Outstanding.';
    if (pct >= 85) return 'Excellent work.';
    if (pct >= 70) return 'Well done.';
    if (pct >= 50) return 'Good effort — keep going.';
    return 'Every read-through counts. Try again.';
  }

  function renderResults(record, fresh) {
    view = 'results';
    const ring = el('div', { class: 'bq-ring' }, [
      el('b', { text: (record.pct || 0) + '%' }),
      el('span', { text: `${record.correct}/${record.numQuestions}` })
    ]);
    // Custom properties must be set via setProperty (style-object assignment won't take).
    ring.style.setProperty('--bq-pct', (record.pct || 0) + '%');
    const hero = el('div', { class: 'bq-result-hero' }, [
      ring,
      el('h2', { class: 'bq-result-title', text: praise(record.pct || 0) }),
      el('p', { class: 'bq-result-sub', text: (record.title || record.reference) }),
      fresh ? el('div', { class: 'bq-xp-badge' }, [icon('bolt'), `+${record.xp} XP`])
            : el('div', { class: 'bq-xp-badge' }, [icon('bolt'), `${record.xp} XP earned`])
    ]);

    // Review list
    const review = el('div', { class: 'bq-review' });
    (record.questions || []).forEach((q, i) => review.appendChild(reviewItem(q, i)));

    const kids = [
      hero,
      el('div', { class: 'bq-section-label', text: 'Review', style: { marginTop: '18px' } }),
      review
    ];

    const footer = el('div', { class: 'bq-footer' }, [
      el('button', { class: 'bq-next', onclick: newQuiz }, [icon('add'), 'New Quiz'])
    ]);

    mount(topbar({
      left: { icon: 'home', onclick: renderHome, label: 'Home' },
      title: 'Results',
      sub: record.reference,
      right: { icon: 'folder', onclick: () => renderArchive('history'), label: 'Past quizzes' }
    }), kids, footer);
  }

  function reviewItem(q, i) {
    const ok = q.userAnswer === q.answerIndex;
    const kids = [
      el('div', { class: 'bq-review-q' }, [
        el('div', { class: 'bq-review-mark ' + (ok ? 'ok' : 'no') }, [icon(ok ? 'check' : 'close')]),
        el('p', { text: `${i + 1}. ${q.question}` })
      ])
    ];
    const ans = el('div', { class: 'bq-review-ans' });
    if (!ok && q.userAnswer != null) {
      ans.appendChild(el('span', { class: 'bq-ra wrong' }, [el('b', { text: 'You: ' }), q.options[q.userAnswer]]));
    }
    ans.appendChild(el('span', { class: 'bq-ra right' }, [el('b', { text: 'Answer: ' }), q.options[q.answerIndex] + (q.reference ? '  (' + q.reference + ')' : '')]));
    if (q.explanation) ans.appendChild(el('span', { class: 'bq-ra expl', text: q.explanation }));
    kids.push(ans);
    return el('div', { class: 'bq-card bq-review-item' }, kids);
  }

  /* ══════════════════════════════════════════════════════════════════════
     ARCHIVE (the "file cabinet")
     ══════════════════════════════════════════════════════════════════════ */
  function renderArchive(tab) {
    view = 'archive';
    tab = tab || 'history';
    const historyTab = el('button', { class: 'bq-tab' + (tab === 'history' ? ' bq-sel' : ''), onclick: () => renderArchive('history') }, ['Quizzes']);
    const savedTab = el('button', { class: 'bq-tab' + (tab === 'saved' ? ' bq-sel' : ''), onclick: () => renderArchive('saved') }, ['Saved questions']);
    const tabs = el('div', { class: 'bq-tabs' }, [historyTab, savedTab]);

    const kids = [tabs];

    if (tab === 'history') {
      if (!store.quizzes.length) {
        kids.push(emptyState('folder', 'No past quizzes yet. Take one and it lands here — with your score and a full review.'));
      } else {
        const list = el('div', { class: 'bq-recent-list' });
        store.quizzes.forEach(q => list.appendChild(archiveHistCard(q)));
        kids.push(list);
      }
    } else {
      if (!store.savedQuestions.length) {
        kids.push(emptyState('bookmark', 'No saved questions yet. Tap “Save Question” during a quiz to build a personal review deck.'));
      } else {
        const list = el('div', { class: 'bq-recent-list' });
        store.savedQuestions.forEach(sq => list.appendChild(savedQCard(sq)));
        kids.push(list);
      }
    }

    mount(topbar({
      left: { icon: 'arrow_back', onclick: renderHome, label: 'Back' },
      title: 'Past Quizzes',
      right: { icon: 'add', onclick: newQuiz, label: 'New quiz' }
    }), kids);
  }

  function archiveHistCard(q) {
    const d = q.createdAt ? new Date(q.createdAt) : null;
    const dateStr = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const delBtn = el('button', { class: 'bq-hist-del', 'aria-label': 'Delete quiz', onclick: e => {
      e.stopPropagation();
      if (confirm('Delete this quiz from your history?')) {
        const i = store.quizzes.findIndex(x => x.id === q.id);
        if (i >= 0) { store.quizzes.splice(i, 1); persist(true); }
        renderArchive('history');
      }
    } }, [icon('delete')]);
    return el('div', { class: 'bq-card bq-hist-item', onclick: () => renderResults(q, false) }, [
      el('div', { class: 'bq-hist-score', text: (q.pct != null ? q.pct : 0) + '%' }),
      el('div', { class: 'bq-hist-main' }, [
        el('strong', { text: q.title || q.reference || 'Quiz' }),
        el('small', { text: `${q.correct}/${q.numQuestions} correct · ${dateStr}` })
      ]),
      delBtn
    ]);
  }

  function savedQCard(sq) {
    const delBtn = el('button', { class: 'bq-hist-del', 'aria-label': 'Delete saved question', onclick: () => {
      const i = store.savedQuestions.findIndex(x => x.id === sq.id);
      if (i >= 0) { store.savedQuestions.splice(i, 1); persist(true); }
      renderArchive('saved');
    } }, [icon('delete')]);
    return el('div', { class: 'bq-card bq-saveq' }, [
      el('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } }, [
        el('div', { style: { flex: '1 1 auto', minWidth: '0' } }, [
          el('p', { class: 'bq-saveq-q', text: sq.question }),
          el('div', { class: 'bq-saveq-meta', text: (sq.reference || '') + (sq.quizTitle ? ' · ' + sq.quizTitle : '') }),
          el('div', { class: 'bq-saveq-ans', text: 'Answer: ' + (sq.options ? sq.options[sq.answerIndex] : '') })
        ]),
        delBtn
      ])
    ]);
  }

  function emptyState(ic, msg) {
    return el('div', { class: 'bq-empty' }, [icon(ic), el('p', { text: msg })]);
  }

  /* ══════════════════════════════════════════════════════════════════════
     QUIZ AFTER READING HABIT
     The habits code calls window.BibleQuiz.maybeOfferHabitQuiz() whenever a
     habit day is completed with a note. If the feature toggle is on and the
     note contains one or more Bible references, a sleek theme-matching modal
     offers a knowledge check that jumps straight into quiz generation.
     ══════════════════════════════════════════════════════════════════════ */

  // In-memory throttle for the no-reference ask-modal (per habit+day). Resets
  // on reload — a fresh session prompting again is fine and desirable.
  const _lastAskAt = {};

  // Book names + common abbreviations, longest-first so e.g. "John" wins over "Jn".
  const BQ_BOOKS = [
    'Genesis', 'Gen', 'Exodus', 'Exod', 'Exo', 'Leviticus', 'Lev', 'Numbers', 'Num',
    'Deuteronomy', 'Deut', 'Joshua', 'Josh', 'Judges', 'Judg', 'Ruth',
    'Samuel', 'Sam', 'Kings', 'Kgs', 'Chronicles', 'Chron', 'Chr',
    'Ezra', 'Nehemiah', 'Neh', 'Esther', 'Esth', 'Job',
    'Psalms', 'Psalm', 'Pss', 'Ps', 'Proverbs', 'Prov', 'Ecclesiastes', 'Eccl',
    'Song of Solomon', 'Song of Songs', 'Isaiah', 'Isa', 'Jeremiah', 'Jer',
    'Lamentations', 'Lam', 'Ezekiel', 'Ezek', 'Daniel', 'Dan', 'Hosea', 'Hos',
    'Joel', 'Amos', 'Obadiah', 'Obad', 'Jonah', 'Micah', 'Mic', 'Nahum', 'Nah',
    'Habakkuk', 'Hab', 'Zephaniah', 'Zeph', 'Haggai', 'Hag', 'Zechariah', 'Zech',
    'Malachi', 'Mal', 'Matthew', 'Matt', 'Mark', 'Luke', 'John', 'Jn', 'Acts',
    'Romans', 'Rom', 'Corinthians', 'Cor', 'Galatians', 'Gal', 'Ephesians', 'Eph',
    'Philippians', 'Phil', 'Colossians', 'Col', 'Thessalonians', 'Thess',
    'Timothy', 'Tim', 'Titus', 'Philemon', 'Phlm', 'Hebrews', 'Heb', 'James', 'Jas',
    'Peter', 'Pet', 'Jude', 'Revelation', 'Rev'
  ].sort((a, b) => b.length - a.length).map(b => b.replace(/ /g, '\\s+'));

  // "1 John 4:7-12", "Jn 3", "Psalm 23", "2 Cor. 5:17–21", "Genesis 1-3", …
  const BQ_REF_RE = new RegExp(
    '\\b(?:([123])\\s*)?(' + BQ_BOOKS.join('|') + ')\\.?\\s+' +
    '(\\d{1,3}(?::\\d{1,3})?(?:\\s*[-–—]\\s*\\d{1,3}(?::\\d{1,3})?)?)',
    'gi'
  );

  // Pull every Bible reference out of free text; '' when none found.
  function extractReferences(text) {
    if (!text || typeof text !== 'string') return '';
    const refs = [];
    const seen = new Set();
    let m;
    BQ_REF_RE.lastIndex = 0;
    while ((m = BQ_REF_RE.exec(text)) !== null) {
      const ref = ((m[1] ? m[1] + ' ' : '') + m[2].replace(/\s+/g, ' ') + ' ' + m[3].replace(/\s+/g, '')).trim();
      const key = ref.toLowerCase();
      if (!seen.has(key)) { seen.add(key); refs.push(ref); }
      if (refs.length >= 5) break; // keep the quiz scoped
    }
    return refs.join('; ');
  }

  /* Smart habit-name detection — for Bible-reading habits completed WITHOUT a
     reference in the note. A full reference in the habit name ("Read John 3")
     is used directly; otherwise a name that clearly means Scripture reading
     triggers an ask-modal where the user types the passage. */
  const BQ_BIBLE_WORDS = /\b(bible|scriptures?|gospels?|devotionals?|devotions?|testament|word|quiet\s+time)\b/i;
  const BQ_READING_WORDS = /\b(read(?:ing)?|study(?:ing)?|chapters?|verses?|passages?|memori[sz]e)\b/i;
  // Books whose bare name is unmistakably Scripture (not also a common
  // personal name or everyday word like "Mark", "Job", "Numbers", "Acts").
  const BQ_CLEAR_BOOKS = new RegExp('\\b(?:' + [
    'Genesis', 'Exodus', 'Leviticus', 'Deuteronomy', 'Psalms?', 'Proverbs', 'Ecclesiastes',
    'Song\\s+of\\s+(?:Solomon|Songs)', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel',
    'Hosea', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai',
    'Zechariah', 'Malachi', 'Matthew', 'Romans', 'Corinthians', 'Galatians', 'Ephesians',
    'Philippians', 'Colossians', 'Thessalonians', 'Philemon', 'Hebrews', 'Revelation',
    'Chronicles', 'Nehemiah', 'Ezra', 'Esther', 'Leviticus', 'Zephaniah'
  ].join('|') + ')\\b', 'i');
  const BQ_ANY_BOOK_RE = new RegExp('\\b(?:([123])\\s*)?(' + BQ_BOOKS.join('|') + ')\\b\\.?', 'i');

  // First Bible book mentioned in the text (chapter not required) — used to
  // prefill the ask-modal, e.g. habit "Proverbs" prefills "Proverbs ".
  function bibleBookInName(name) {
    const m = BQ_ANY_BOOK_RE.exec(name || '');
    if (!m) return '';
    return ((m[1] ? m[1] + ' ' : '') + m[2].replace(/\s+/g, ' ')).trim();
  }

  function looksLikeBibleReadingHabit(name) {
    if (!name) return false;
    // "Bible", "Scripture", "the Word", "quiet time", … ("word" boundaries
    // keep "crossword"/"Wordle" from matching).
    if (BQ_BIBLE_WORDS.test(name)) return true;
    if (BQ_CLEAR_BOOKS.test(name)) return true;
    // A plain reading habit — "Reading", "Morning read", "Read 3 chapters".
    // In this app that's nearly always Scripture, and the modal is a
    // dismissible question, so err on the side of offering.
    if (/\bread(?:ing)?\b/i.test(name)) return true;
    // Other study words ("study", "chapter", "memorize") need a book named,
    // so "Read John" qualifies but "Study for exams" and "Pray for John" don't.
    return BQ_READING_WORDS.test(name) && !!bibleBookInName(name);
  }

  function startHabitQuiz(refs) {
    buildShell();
    store = loadStore();
    form = defaultForm();
    form.reference = refs;
    form.numQuestions = Math.max(3, Math.min(20, store.settings.habitQuizCount || 5));
    page.classList.remove('bq-hidden');
    requestAnimationFrame(() => page.classList.add('bq-open'));
    startGeneration();
  }

  let habitModal = null;
  function closeHabitModal() {
    if (!habitModal) return;
    const node = habitModal;
    habitModal = null;
    node.classList.remove('bq-hm-show');
    setTimeout(() => node.remove(), reduceMotion() ? 0 : 260);
  }

  function showHabitQuizModal(refs, habitName) {
    if (habitModal) return;
    const n = Math.max(3, Math.min(20, store.settings.habitQuizCount || 5));
    const card = el('div', { class: 'bq-hm-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Knowledge check' }, [
      el('div', { class: 'bq-hm-badge' }, [icon('auto_awesome')]),
      el('div', { class: 'bq-hm-kicker' }, [icon('check_circle'), habitName ? habitName + ' complete' : 'Reading complete']),
      el('h3', { text: 'Ready for a quick knowledge check?' }),
      el('p', {}, [
        'Lock in what you just read with a quick ' + n + '-question check on ',
        el('strong', { text: refs }),
        '.'
      ]),
      el('button', { class: 'bq-hm-go', onclick: () => { closeHabitModal(); startHabitQuiz(refs); } }, [icon('bolt'), 'Take Knowledge Check']),
      el('button', { class: 'bq-hm-skip', onclick: closeHabitModal }, ['Not now'])
    ]);
    card.addEventListener('click', e => e.stopPropagation());
    habitModal = el('div', { class: 'bq-hm-overlay', onclick: closeHabitModal }, [card]);
    document.body.appendChild(habitModal);
    requestAnimationFrame(() => habitModal && habitModal.classList.add('bq-hm-show'));
  }

  // Fallback modal when we know it's a Bible-reading habit but don't know the
  // passage: asks for the reference (prefilled with any book found in the
  // habit name) and the number of questions, then generates.
  function showHabitAskModal(prefillBook, habitName) {
    if (habitModal) return;
    const st = store.settings;
    const input = el('input', {
      class: 'bq-hm-input', type: 'text',
      placeholder: 'e.g. John 3; Romans 8:1–17',
      value: prefillBook ? prefillBook + ' ' : ''
    });
    const countVal = el('b', { text: String(st.habitQuizCount) });
    const minus = el('button', { class: 'bq-mini-btn', type: 'button', text: '−', 'aria-label': 'Fewer questions' });
    const plus = el('button', { class: 'bq-mini-btn', type: 'button', text: '+', 'aria-label': 'More questions' });
    const syncCount = () => {
      countVal.textContent = String(st.habitQuizCount);
      minus.disabled = st.habitQuizCount <= 3;
      plus.disabled = st.habitQuizCount >= 15;
    };
    minus.addEventListener('click', () => { if (st.habitQuizCount > 3) { st.habitQuizCount--; syncCount(); persist(); } });
    plus.addEventListener('click', () => { if (st.habitQuizCount < 15) { st.habitQuizCount++; syncCount(); persist(); } });
    syncCount();
    const go = () => {
      const ref = input.value.trim();
      if (!ref) {
        input.classList.add('bq-hm-shake');
        setTimeout(() => input.classList.remove('bq-hm-shake'), 400);
        input.focus();
        return;
      }
      closeHabitModal();
      startHabitQuiz(ref);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    const card = el('div', { class: 'bq-hm-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Knowledge check' }, [
      el('div', { class: 'bq-hm-badge' }, [icon('auto_awesome')]),
      el('div', { class: 'bq-hm-kicker' }, [icon('check_circle'), habitName ? habitName + ' complete' : 'Reading complete']),
      el('h3', { text: 'Quick knowledge check on what you read?' }),
      el('p', { text: 'Tell me the passage and I’ll build the test.' }),
      input,
      el('div', { class: 'bq-hm-countrow' }, [
        el('span', { text: 'Questions' }),
        el('div', { class: 'bq-mini-step' }, [minus, countVal, plus])
      ]),
      el('button', { class: 'bq-hm-go', onclick: go }, [icon('bolt'), 'Take Knowledge Check']),
      el('button', { class: 'bq-hm-skip', onclick: closeHabitModal }, ['Not now'])
    ]);
    card.addEventListener('click', e => e.stopPropagation());
    habitModal = el('div', { class: 'bq-hm-overlay', onclick: closeHabitModal }, [card]);
    document.body.appendChild(habitModal);
    requestAnimationFrame(() => {
      if (!habitModal) return;
      habitModal.classList.add('bq-hm-show');
      setTimeout(() => { try { input.focus(); } catch (e) {} }, 380);
    });
  }

  window.BibleQuiz = {
    isHabitQuizEnabled() {
      store = loadStore();
      return !!store.settings.habitQuiz;
    },
    // opts: { habitId, habitName, dateKey, note } — returns true if a check was offered.
    maybeOfferHabitQuiz(opts) {
      opts = opts || {};
      store = loadStore();
      if (!store.settings.habitQuiz) return false;
      const name = opts.habitName || '';
      // A reference in the note ALWAYS wins; failing that, a full reference in
      // the habit name itself (e.g. a habit called "Read John 3").
      let refs = extractReferences(opts.note);
      if (!refs) refs = extractReferences(name);
      // No reference anywhere — but a clearly Bible-reading habit still gets
      // an ask-modal so the user can type what they read.
      const askInstead = !refs && looksLikeBibleReadingHabit(name);
      if (!refs && !askInstead) return false;
      const key = (opts.habitId || 'habit') + '|' + (opts.dateKey || 'today');

      if (refs) {
        // Reference-based auto offer: at most once per habit/day per distinct
        // passage — but a NEW reference the same day (e.g. ask-modal dismissed,
        // then "John 3" added to the note) still gets offered.
        const prior = store.promptedHabitChecks[key];
        const priorRefs = prior && typeof prior === 'object' ? (prior.refs || '') : (prior ? '' : null);
        if (prior != null && refs === priorRefs) return false;
        store.promptedHabitChecks[key] = { at: Date.now(), refs: refs };
        const cutoff = Date.now() - 14 * 86400000;
        for (const k in store.promptedHabitChecks) {
          const v = store.promptedHabitChecks[k];
          const at = (v && typeof v === 'object') ? v.at : v;
          if (!at || at < cutoff) delete store.promptedHabitChecks[k];
        }
        persist(true);
      } else {
        // No-reference ask offer: only a short in-memory throttle so a single
        // completion can't double-fire from two code paths, but every genuine
        // completion of a Bible-reading habit still prompts (it is NOT blocked
        // for the whole day the way a specific-passage offer is).
        const now = Date.now();
        if (_lastAskAt[key] && (now - _lastAskAt[key]) < 20000) return false;
        _lastAskAt[key] = now;
      }
      // Small delay so the habit UI (check animation, milestone toast) lands first.
      setTimeout(() => {
        if (refs) showHabitQuizModal(refs, name);
        else showHabitAskModal(bibleBookInName(opts.note || '') || bibleBookInName(name), name);
      }, 700);
      return true;
    }
  };
})();
