// Challenge My Theology.
// Tap the guide anywhere: he asks what you'd like to do (Challenge My Theology
// or App Tours). While you're working on a challenge, he jumps straight back to
// it. A challenge is ONE major claim a group really teaches, researched on the
// server with real sources (functions/index.js → challengeMyTheology). The guide
// only presents the claim; the reader studies Scripture to answer it.
// Every challenge is posted to the community list with the username of who got
// it; a person's own notes stay private unless they share their answer.
(function () {
  'use strict';

  const ACTIVE_KEY = 'rhemaActiveChallenge';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const jsq = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const GUIDE = 'assets/mascot/guide-skeptic.webp';
  const BOOKS_SRC = 'assets/icons/challenge-books.webp';
  let BOOKS = BOOKS_SRC;
  // The red books take the theme's main color (the gold trim stays gold):
  // red and red-brown pixels get the theme hue, keeping their light and shade.
  let _booksFor = '';
  function themeBooks() {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--secondary-color').trim();
    if (!color || color === _booksFor) return;
    _booksFor = color;
    const probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = color;
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(probe.fillStyle);
    if (!m) return;
    const [tr, tg, tb] = [1, 2, 3].map(i => parseInt(m[i], 16) / 255);
    const tmax = Math.max(tr, tg, tb), tmin = Math.min(tr, tg, tb), td = tmax - tmin;
    let th = 0;
    if (td) th = tmax === tr ? ((tg - tb) / td) % 6 : tmax === tg ? (tb - tr) / td + 2 : (tr - tg) / td + 4;
    th = (th * 60 + 360) % 360;
    const ts = td ? td / (1 - Math.abs(tmax + tmin - 1) || 1) : 0;
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
        for (let i = 0; i < p.length; i += 4) {
          if (p[i + 3] < 8) continue;
          const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn, l = (mx + mn) / 2;
          if (dd < 0.12) continue;                       // greys, outlines, page edges
          let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
          h = (h * 60 + 360) % 360;
          if (!(h < 22 || h > 335)) continue;            // only the reds (gold trim stays)
          const s0 = dd / (1 - Math.abs(2 * l - 1) || 1);
          const s1 = Math.min(1, ts ? (s0 * 0.55 + ts * 0.45) : s0 * 0.25);
          const C = (1 - Math.abs(2 * l - 1)) * s1, X = C * (1 - Math.abs((th / 60) % 2 - 1)), M = l - C / 2;
          const [a, bb, cc] = th < 60 ? [C, X, 0] : th < 120 ? [X, C, 0] : th < 180 ? [0, C, X] : th < 240 ? [0, X, C] : th < 300 ? [X, 0, C] : [C, 0, X];
          p[i] = (a + M) * 255; p[i + 1] = (bb + M) * 255; p[i + 2] = (cc + M) * 255;
        }
        x.putImageData(d, 0, 0);
        BOOKS = c.toDataURL('image/png');
        document.querySelectorAll('img.ch-books-img').forEach(el => { el.src = BOOKS; });
      } catch (e) { /* keep the original art */ }
    };
    img.src = BOOKS_SRC;
  }

  // Quick picks: a few traditions and other faiths, kept short on purpose.
  const TAGS = {
    traditions: [
      ['catholic', 'Catholic'], ['orthodox', 'Orthodox'], ['calvinist', 'Calvinist'],
      ['arminian', 'Arminian'], ['lutheran', 'Lutheran'], ['pentecostal', 'Pentecostal'],
    ],
    others: [
      ['lds', 'Mormon (LDS)'], ['jw', "Jehovah's Witness"], ['islam', 'Islam'],
      ['judaism', 'Judaism'], ['skeptic', 'Skeptic'],
    ],
  };
  // Image credits (Wikipedia / Wikimedia Commons), shown under the pickers.
  const CREDITS = {
    "catholic": {
      "label": "Catholic",
      "credit": "Saint Peter's Basilica, Agostino Veneziano (Agostino dei Musi), 1517. The Metropolitan Museum of Art (public domain)"
    },
    "orthodox": {
      "label": "Orthodox",
      "credit": "Christ Pantocrator, Saint Catherine's Monastery, Sinai, 6th century. Wikimedia Commons (public domain)"
    },
    "calvinist": {
      "label": "Calvinist",
      "credit": "John Calvin (1509–1564), Sebastian Dadler, 1641. The Metropolitan Museum of Art (public domain)"
    },
    "arminian": {
      "label": "Arminian",
      "credit": "Jacobus Arminius, 17th-century portrait engraving. Wikimedia Commons (public domain)"
    },
    "lutheran": {
      "label": "Lutheran",
      "credit": "Martin Luther, Lucas Cranach the Elder, 1528 (Veste Coburg). Wikimedia Commons (public domain)"
    },
    "pentecostal": {
      "label": "Pentecostal",
      "credit": "The Pentecost, Salomon de Bray, early to mid-17th century. The Metropolitan Museum of Art (public domain)"
    },
    "lds": {
      "label": "Mormon (LDS)",
      "credit": "Joseph Smith, 1843 photograph. Wikimedia Commons (public domain)"
    },
    "jw": {
      "label": "Jehovah's Witness",
      "credit": "Charles Taze Russell, founder of the Bible Student movement. Wikimedia Commons (public domain)"
    },
    "islam": {
      "label": "Islam",
      "credit": "Qur'an Manuscript, dated 1268 AH/1851–52 CE. The Metropolitan Museum of Art (public domain)"
    },
    "judaism": {
      "label": "Judaism",
      "credit": "Torah crown (keter), Andrea Zambelli \"L'Honnesta\", ca. 1740–50. The Metropolitan Museum of Art (public domain)"
    },
    "skeptic": {
      "label": "Skeptic",
      "credit": "Bust of Voltaire, Paul-Louis Cyfflé, 1769–77. The Metropolitan Museum of Art (public domain)"
    },
    "trending": {
      "label": "What's trending",
      "credit": "St. Paul Preaching in Athens, Jean Achille Bellanger, 1749. The Metropolitan Museum of Art (public domain)"
    }
  };

  // ── State ───────────────────────────────────────────────────────────────
  let _view = 'chooser';     // chooser | picker | loading | claim | community
  let _current = null;       // the challenge on screen
  let _busy = false;
  const active = {
    get() { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch { return null; } },
    set(c) { try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(c)); } catch {} },
    clear() { try { localStorage.removeItem(ACTIVE_KEY); } catch {} },
  };
  const user = () => window.Auth?.getCurrentUser?.() || null;
  const myName = () => localStorage.getItem('authUsername') || localStorage.getItem('authDisplayName') || '';
  const isGuest = () => (typeof _guestMode !== 'undefined' && _guestMode) || !user();

  // ── Shell ───────────────────────────────────────────────────────────────
  function shell() {
    let el = document.getElementById('chOverlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'chOverlay';
    el.className = 'ch-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="ch-scroll" id="chScroll"></div>';
    document.body.appendChild(el);
    return el;
  }
  // On dark themes the main color can be a dim slate: when it doesn't stand
  // out from the cards, the theme's accent color takes over for lines, art and
  // buttons (still the user's own theme colors).
  function rgbOf(color) {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = '#000'; c.fillStyle = color;
    const v = c.fillStyle;
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v) || [];
    if (m.length) return [1, 2, 3].map(i => parseInt(m[i], 16));
    const r = /rgba?\(([^)]+)\)/.exec(v);
    return r ? r[1].split(',').slice(0, 3).map(Number) : [0, 0, 0];
  }
  function lum([r, g, b]) {
    const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  function themeContrast(el) {
    const cs = getComputedStyle(document.documentElement);
    const sec = cs.getPropertyValue('--secondary-color').trim(), acc = cs.getPropertyValue('--accent-color').trim();
    const card = cs.getPropertyValue('--card-solid-color').trim() || '#fff';
    if (!sec) return;
    const cardRgb = rgbOf(card);
    const weak = contrast(rgbOf(sec), cardRgb) < 3;
    if (weak && acc && contrast(rgbOf(acc), cardRgb) >= 3) el.style.setProperty('--ch-accent', acc);
    else el.style.removeProperty('--ch-accent');
    el.classList.toggle('ch-accent-swap', weak);
  }
  function show(html, view) {
    themeBooks();
    const el = shell();
    themeContrast(el);
    _view = view;
    el.dataset.view = view;
    const sc = el.querySelector('#chScroll');
    sc.innerHTML = html;
    sc.scrollTop = 0;
    if (!el.classList.contains('open')) {
      el.classList.add('open');
      document.body.classList.add('ch-open');
    }
  }
  function close() {
    const el = document.getElementById('chOverlay');
    if (!el) return;
    el.classList.remove('open');
    document.body.classList.remove('ch-open');
  }
  const topBar = (left, right = '') => `<div class="ch-top">${left}<span class="ch-top-gap"></span>${right}</div>`;
  const iconBtn = (icon, label, fn, cls = '') => `<button type="button" class="ch-ibtn ${cls}" onclick="${fn}" aria-label="${esc(label)}" title="${esc(label)}"><span class="material-symbols-outlined">${icon}</span></button>`;

  // ── 1. The guide's question: what would you like to do? ─────────────────
  // Art in the theme's colors: lines in the main color, pages in the card
  // color, little sparkles in the accent color (classes in style.css; CSS
  // variables inside SVG attributes aren't safe on every Safari).
  const ART_CHALLENGE = `<svg viewBox="0 0 96 80" aria-hidden="true" class="ch-art">
      <path class="sf ln" d="M8 58 Q30 50 48 60 Q66 50 88 58 L88 70 Q66 62 48 72 Q30 62 8 70Z"/>
      <path class="pg ln" d="M10 26 Q30 18 48 28 L48 62 Q30 52 10 60Z"/>
      <path class="pg ln" d="M86 26 Q66 18 48 28 L48 62 Q66 52 86 60Z"/>
      <path class="ln qm" d="M40 20 Q40 8 49 8 Q58 8 58 16 Q58 22 51 25 Q49 26 49 31"/>
      <circle class="dot" cx="49" cy="40" r="3.4"/>
      <g class="spk"><path d="M30 10 L34 15"/><path d="M68 10 L64 15"/><path d="M26 20 L31 22"/><path d="M72 20 L67 22"/></g>
    </svg>`;
  const ART_TOURS = `<svg viewBox="0 0 96 80" aria-hidden="true" class="ch-art">
      <path class="pg ln" d="M10 26 L34 18 L60 26 L86 18 L86 64 L60 72 L34 64 L10 72Z"/>
      <path class="ln thin" d="M34 18 L34 64 M60 26 L60 72"/>
      <path class="ln dash" d="M20 58 Q32 44 44 52 T68 40"/>
      <path class="dot" d="M72 8 C64 8 60 14 60 19 C60 27 72 38 72 38 C72 38 84 27 84 19 C84 14 80 8 72 8Z"/>
      <circle class="pg" cx="72" cy="19" r="4"/>
    </svg>`;
  const ART_FOOT = `<svg class="ch-foot" viewBox="0 0 360 120" aria-hidden="true">
      <g class="spk"><path d="M172 18 L170 4"/><path d="M150 24 L140 12"/><path d="M194 24 L204 12"/><path d="M132 36 L118 30"/><path d="M212 36 L226 30"/></g>
      <path class="leaf" d="M30 104 Q10 70 34 52 Q40 78 58 92Z M44 100 Q30 60 62 46 Q60 78 74 96Z"/>
      <path class="leaf" d="M330 104 Q350 70 326 52 Q320 78 302 92Z M316 100 Q330 60 298 46 Q300 78 286 96Z"/>
      <path class="sf" d="M80 98 Q130 74 180 90 Q230 74 280 98 L280 110 Q230 90 180 106 Q130 90 80 110Z"/>
      <path class="pg ln" d="M86 92 Q132 56 180 78 L180 100 Q132 80 86 104Z"/>
      <path class="pg ln" d="M274 92 Q228 56 180 78 L180 100 Q228 80 274 104Z"/>
      <g class="ln thin"><path d="M104 84 Q138 66 168 80"/><path d="M106 92 Q138 76 168 88"/><path d="M256 84 Q222 66 192 80"/><path d="M254 92 Q222 76 192 88"/></g>
      <path class="dot" d="M184 98 L184 116 L190 110 L196 116 L196 96"/>
    </svg>`;
  function chooser() {
    show(`${topBar(iconBtn('close', 'Close', 'RhemaChallenge.close()'))}
      <div class="ch-chooser">
        <h1 class="ch-h1">What would you like to do?</h1>
<svg class="ch-cloud ch-cloud-l" viewBox="0 0 120 50" aria-hidden="true"><path d="M18 44 Q2 44 4 32 Q6 22 18 23 Q20 8 38 9 Q50 0 64 10 Q80 4 88 18 Q104 16 108 30 Q116 44 98 44Z" fill="currentColor"/></svg><svg class="ch-cloud ch-cloud-r" viewBox="0 0 120 50" aria-hidden="true"><path d="M18 44 Q2 44 4 32 Q6 22 18 23 Q20 8 38 9 Q50 0 64 10 Q80 4 88 18 Q104 16 108 30 Q116 44 98 44Z" fill="currentColor"/></svg>
        <img class="ch-hello" src="assets/mascot/guide-cheer.webp" alt="" decoding="async">
        <div class="ch-choices">
          <button type="button" class="ch-choice ch-choice-l" onclick="RhemaChallenge.picker()">
            ${ART_CHALLENGE}<b>Challenge My Theology</b><span class="ch-go"><span class="material-symbols-outlined">arrow_forward</span></span></button>
          <button type="button" class="ch-choice ch-choice-r" onclick="RhemaChallenge.tours()">
            ${ART_TOURS}<b>App Tours</b><span class="ch-go"><span class="material-symbols-outlined">arrow_forward</span></span></button>
        </div>
        ${active.get() ? `<button type="button" class="ch-resume" onclick="RhemaChallenge.openActive()"><span class="material-symbols-outlined">bookmark</span>Back to your current challenge</button>` : ''}
        ${ART_FOOT}
      </div>`, 'chooser');
  }
  function tours() {
    close();
    if (typeof openRhemaReaderPanel === 'function' && document.getElementById('rhemaModal')?.classList.contains('open')) {
      openRhemaReaderPanel();
      setTimeout(() => showReaderPanelSection('tours'), 30);
    } else if (typeof openToursMenu === 'function') openToursMenu();
    else if (typeof resumeRhema === 'function') { resumeRhema(); setTimeout(() => { openRhemaReaderPanel?.(); showReaderPanelSection?.('tours'); }, 500); }
  }

  // ── 2. Pick what to be challenged on ─────────────────────────────────────
  function readerRef() {
    if (typeof _rhemaBook === 'undefined' || !_rhemaBook) return null;
    const label = `${typeof _rhemaBookName === 'function' ? _rhemaBookName(_rhemaBook) : _rhemaBook} ${_rhemaChapter}:${_rhemaVerse}`;
    return { book: _rhemaBook, chapter: String(_rhemaChapter), verse: String(_rhemaVerse || 1), label };
  }
  const tile = (key, label, sub) => `<button type="button" class="ch-tile" onclick="RhemaChallenge.start('${key}')">
      <span class="ch-tile-img"><img src="assets/challenge/${key}.webp" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>
      <b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  function picker() {
    const ref = readerRef();
    const credits = Object.entries(CREDITS).map(([k, c]) => `${esc(c.label || k)}: ${esc(c.credit || '')}`).join(' · ');
    show(`${topBar(iconBtn('arrow_back', 'Back', 'RhemaChallenge.chooser()'), iconBtn('groups', 'Community challenges', 'RhemaChallenge.community()'))}
      <div class="ch-head">
        <img class="ch-head-guide" src="${GUIDE}" alt="" decoding="async">
        <div class="ch-head-t"><span class="ch-kicker">Theological challenge</span><h1 class="ch-h1 ch-h1-left">Challenge me</h1><i class="ch-swash"></i></div>
      </div>
      <p class="ch-lead">Pick a group or type anything. I'll find one big claim they really teach, show you where it comes from, and let you dig into Scripture to answer it.</p>
      <form class="ch-ask" onsubmit="event.preventDefault();RhemaChallenge.start('free')">
        <input id="chPrompt" type="text" maxlength="300" autocomplete="off" placeholder="Anything… “baptism”, “Is hell forever?”" aria-label="What should I challenge you on?">
        <button type="submit" aria-label="Challenge me"><span class="material-symbols-outlined">arrow_forward</span></button>
      </form>
      <div class="ch-quick">
        ${ref ? `<button type="button" class="ch-pill" onclick="RhemaChallenge.start('verse')"><img class="ch-books-img" src="${BOOKS}" alt="" decoding="async"><span><b>From ${esc(ref.label)}</b><small>A claim made from this verse</small></span></button>` : ''}
        <button type="button" class="ch-pill" onclick="RhemaChallenge.start('trending')"><img src="assets/challenge/trending.webp" alt="" decoding="async" onerror="this.remove()"><span><b>What's trending</b><small>A claim being debated right now</small></span></button>
      </div>
      <div class="ch-sec">Christian traditions</div>
      <div class="ch-tiles">${TAGS.traditions.map(([k, l]) => tile(k, l)).join('')}</div>
      <div class="ch-sec">Other faiths &amp; views</div>
      <div class="ch-tiles">${TAGS.others.map(([k, l]) => tile(k, l)).join('')}</div>
      ${credits ? `<details class="ch-credits"><summary>Image credits</summary><p>${credits}</p></details>` : ''}`, 'picker');
  }

  // ── 3. The guide researches ───────────────────────────────────────────────
  const LOADING_LINES = {
    catholic: 'what the Catholic Church teaches', orthodox: 'what the Orthodox Church teaches', calvinist: 'what Reformed teachers say',
    arminian: 'what Arminian teachers say', lutheran: 'what Lutherans confess', pentecostal: 'what Pentecostals teach',
    lds: 'what Latter-day Saints teach', jw: "what Jehovah's Witnesses teach", islam: 'what Muslims believe',
    judaism: 'what Jewish teachers say', skeptic: 'what skeptics argue', trending: "what's being debated right now",
    verse: 'who reads this verse differently', free: 'who teaches this',
  };
  function loading(tag) {
    show(`${topBar(iconBtn('close', 'Cancel', 'RhemaChallenge.picker()'))}
      <div class="ch-loading">
        <img class="ch-loading-guide" src="${GUIDE}" alt="" decoding="async">
        <h2>Hmm… let me look into ${esc(LOADING_LINES[tag] || 'that')}</h2>
        <ol class="ch-steps">
          <li class="on"><span class="material-symbols-outlined">travel_explore</span>Searching their own sources</li>
          <li><span class="material-symbols-outlined">menu_book</span>Reading the pages</li>
          <li><span class="material-symbols-outlined">fact_check</span>Checking every quote is really there</li>
        </ol>
        <p class="ch-fine">Usually about half a minute.</p>
      </div>`, 'loading');
    let i = 0;
    clearInterval(loading._t);
    loading._t = setInterval(() => {
      const items = document.querySelectorAll('.ch-steps li');
      if (!items.length || _view !== 'loading') { clearInterval(loading._t); return; }
      i = Math.min(items.length - 1, i + 1);
      items.forEach((li, k) => li.classList.toggle('on', k <= i));
    }, 9000);
  }
  async function start(tag) {
    if (_busy) return;
    if (isGuest()) {
      if (typeof _showStudyToast === 'function') _showStudyToast('Create a free account to get challenges');
      if (typeof openGuestAccountPrompt === 'function') setTimeout(openGuestAccountPrompt, 300);
      return;
    }
    const prompt = (document.getElementById('chPrompt')?.value || '').trim();
    if (tag === 'free' && prompt.length < 3) { document.getElementById('chPrompt')?.focus(); return; }
    const payload = { tag, prompt: tag === 'free' ? prompt : '' };
    if (tag === 'verse') {
      const ref = readerRef();
      if (!ref) return;
      payload.ref = { book: ref.book, chapter: ref.chapter, verse: ref.verse };
      try { payload.refText = String(_rhemaEnglishText?.(ref.book, ref.chapter, ref.verse) || '').slice(0, 600); } catch {}
    }
    _busy = true;
    loading(tag);
    try {
      if (!window.TheologyChallenge?.create) throw new Error('offline');
      const c = await window.TheologyChallenge.create(payload);
      if (!c || !c.id) throw new Error('empty');
      active.set(c);
      _current = c;
      claim(c, { fresh: true });
    } catch (e) {
      const code = String(e?.code || '');
      const msg = /not-found|unimplemented/.test(code) ? "Challenges are almost ready. The guide's research tool isn't switched on yet, so try again soon."
        : /unauthenticated/.test(code) ? 'Sign in to get a challenge.'
        : e?.message && !/internal|offline|empty|not-found/i.test(e.message) ? e.message
        : "The guide couldn't find a claim with solid sources for that. Try different wording or another topic.";
      show(`${topBar(iconBtn('arrow_back', 'Back', 'RhemaChallenge.picker()'))}
        <div class="ch-loading"><img class="ch-loading-guide" src="${GUIDE}" alt="" decoding="async">
        <h2>Hmm, that didn't work</h2><p class="ch-lead">${esc(msg)}</p>
        <button type="button" class="ch-btn" onclick="RhemaChallenge.picker()">Try another</button></div>`, 'error');
    } finally {
      _busy = false;
      clearInterval(loading._t);
    }
  }

  // ── 4. The claim ──────────────────────────────────────────────────────────
  const timeAgo = (t) => {
    const ms = typeof t === 'number' ? t : (t?.toMillis ? t.toMillis() : (t?.seconds ? t.seconds * 1000 : Date.now()));
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return d < 30 ? `${d}d ago` : new Date(ms).toLocaleDateString();
  };
  const by = (c) => c.username ? `@${c.username}` : (c.displayName || 'a Rhēma user');
  function claim(c, opts = {}) {
    _current = c;
    const mine = user() && c.uid === user().uid;
    const isActive = active.get()?.id === c.id;
    const n = (c.sources || []).length;
    show(`${topBar(iconBtn('arrow_back', 'Back', 'RhemaChallenge.chooser()'),
        iconBtn('checklist', 'New challenge', 'RhemaChallenge.picker()') + iconBtn('groups', 'Community challenges', 'RhemaChallenge.community()'))}
      <div class="ch-head${opts.fresh && !reduced() ? ' ch-pop' : ''}">
        <img class="ch-head-guide" src="${GUIDE}" alt="" decoding="async">
        <div class="ch-head-t"><span class="ch-kicker">Theological challenge</span><h1 class="ch-h1 ch-h1-left">The Claim</h1><i class="ch-swash"></i></div>
      </div>
      <blockquote class="ch-quote">
        <span class="ch-qmark" aria-hidden="true">“</span>
        <p>${esc(c.claim)}”</p>
        <img class="ch-books ch-books-img" src="${BOOKS}" alt="" decoding="async">
      </blockquote>
      <div class="ch-meta"><span class="ch-group">${esc(c.group || c.tagName || '')}</span><span>${mine ? 'Your challenge' : `Challenge for ${esc(by(c))}`} · ${esc(timeAgo(c.createdAt))}</span></div>
      ${c.why ? `<div class="ch-why"><span class="material-symbols-outlined">info</span><div><b>Why this claim?</b><p>${esc(c.why)}</p></div></div>` : ''}
      <div class="ch-sec ch-sec-line">Explore the claim</div>
      ${c.passage ? `<button type="button" class="ch-row" onclick="RhemaChallenge.readPassage()"><span class="material-symbols-outlined">menu_book</span><span><b>Read the Passage</b><small>${esc(c.passage.label)}</small></span><span class="material-symbols-outlined ch-chev">chevron_right</span></button>` : ''}
      <button type="button" class="ch-row" onclick="RhemaChallenge.sources()"><span class="material-symbols-outlined">link</span><span><b>Sources &amp; References</b><small>In their own words, with links</small></span><span class="ch-count">${n}</span><span class="material-symbols-outlined ch-chev">chevron_right</span></button>
      <div class="ch-sec ch-sec-line">Your study</div>
      <div class="ch-notes">
        <textarea id="chNote" rows="5" placeholder="Work through it here: what does the passage say in context? What other verses speak to it?" oninput="RhemaChallenge.noteChanged()"></textarea>
        <label class="ch-share"><input type="checkbox" id="chShare" onchange="RhemaChallenge.noteChanged(true)"><span>Share my answer with the community</span></label>
        <p class="ch-fine" id="chNoteState">Private to you unless you share it.</p>
      </div>
      <div class="ch-answers" id="chAnswers"></div>
      ${isActive
        ? `<button type="button" class="ch-btn ch-btn-ghost" onclick="RhemaChallenge.done()"><span class="material-symbols-outlined">task_alt</span>I'm done with this challenge</button>
           <p class="ch-fine ch-center">While you're working on it, tapping the guide brings you right back here.</p>`
        : `<button type="button" class="ch-btn" onclick="RhemaChallenge.take()"><span class="material-symbols-outlined">bolt</span>Take this challenge</button>
           <p class="ch-fine ch-center">The guide will keep it handy: tap him anytime to come back.</p>`}`, 'claim');
    loadNote(c);
    loadAnswers(c);
  }
  async function loadNote(c) {
    const u = user();
    if (!u || !window.TheologyChallenge?.getNote) return;
    try {
      const n = await window.TheologyChallenge.getNote(u.uid, c.id);
      if (!n || _current?.id !== c.id) return;
      const ta = document.getElementById('chNote'), cb = document.getElementById('chShare');
      if (ta && !ta.value) ta.value = n.text || '';
      if (cb) cb.checked = !!n.shared;
      setNoteState(n.shared ? 'Shared with the community.' : 'Saved. Private to you.');
    } catch {}
  }
  function setNoteState(t) { const el = document.getElementById('chNoteState'); if (el) el.textContent = t; }
  let _noteTimer = 0;
  function noteChanged(now) {
    clearTimeout(_noteTimer);
    setNoteState('Saving…');
    _noteTimer = setTimeout(saveNote, now ? 0 : 900);
  }
  async function saveNote() {
    const u = user(), c = _current;
    if (!u || !c || !window.TheologyChallenge?.saveNote) { setNoteState('Sign in to save your notes.'); return; }
    const text = document.getElementById('chNote')?.value || '';
    const shared = !!document.getElementById('chShare')?.checked;
    try {
      await window.TheologyChallenge.saveNote(u.uid, c.id, text, shared, myName());
      setNoteState(shared ? (text.trim() ? 'Saved and shared with the community.' : 'Write something to share it.') : 'Saved. Private to you.');
      if (shared) loadAnswers(c);
    } catch { setNoteState("Couldn't save. Check your connection."); }
  }
  async function loadAnswers(c) {
    const host = document.getElementById('chAnswers');
    if (!host || !window.TheologyChallenge?.listAnswers) return;
    try {
      const list = (await window.TheologyChallenge.listAnswers(c.id)).filter(a => a.text && a.uid !== user()?.uid);
      if (_current?.id !== c.id || !list.length) { host.innerHTML = ''; return; }
      host.innerHTML = `<div class="ch-sec ch-sec-line">How others answered (${list.length})</div>` + list.map(a =>
        `<div class="ch-answer"><b>${esc(a.name ? '@' + a.name : 'A Rhēma user')}</b><p>${esc(a.text)}</p></div>`).join('');
    } catch { host.innerHTML = ''; }
  }

  function sources() {
    const c = _current;
    if (!c) return;
    let sh = document.getElementById('chSources');
    if (!sh) {
      sh = document.createElement('div');
      sh.id = 'chSources';
      sh.className = 'ch-sheet';
      document.body.appendChild(sh);
    }
    sh.innerHTML = `<div class="ch-sheet-bg" onclick="RhemaChallenge.closeSources()"></div>
      <div class="ch-sheet-card" role="dialog" aria-modal="true">
        <div class="ch-sheet-h"><b>Sources &amp; References</b>${iconBtn('close', 'Close', 'RhemaChallenge.closeSources()')}</div>
        <p class="ch-fine">Each quote below was found word for word on the page it links to. Read them in context before you answer.</p>
        ${(c.sources || []).map(s => `<a class="ch-src" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">
          <q>${esc(s.quote)}</q><span class="ch-src-t"><b>${esc(s.title || s.site)}</b><small>${esc(s.site)}</small></span><span class="material-symbols-outlined">open_in_new</span></a>`).join('')}
        <p class="ch-fine">Found by the guide's web research (AI-assisted) and checked against the pages. The claim is stated the way its own teachers put it; it isn't the app's view.</p>
      </div>`;
    themeContrast(sh.querySelector('.ch-sheet-card'));
    requestAnimationFrame(() => sh.classList.add('open'));
  }
  function closeSources() { document.getElementById('chSources')?.classList.remove('open'); }

  // Read the passage in the reader; a pill brings you back to the challenge.
  function readPassage() {
    const p = _current?.passage;
    if (!p) return;
    close();
    const go = () => {
      if (typeof jumpToRhemaVerse === 'function') jumpToRhemaVerse(p.book, String(p.chapter), String(p.verse), null);
      showBackPill();
    };
    if (!document.getElementById('rhemaModal')?.classList.contains('open') && typeof resumeRhema === 'function') {
      resumeRhema();
      setTimeout(go, 700);
    } else go();
  }
  function showBackPill() {
    let el = document.getElementById('chBackPill');
    if (!el) {
      el = document.createElement('div');
      el.id = 'chBackPill';
      el.className = 'rhema-ip-back ch-back-pill';
      el.innerHTML = `<button type="button" class="rhema-ip-back-go" onclick="RhemaChallenge.backFromPassage()"><img src="${GUIDE}" alt="" class="ch-back-guide"><span class="rhema-ip-back-label">Back to the challenge</span></button><button type="button" class="rhema-ip-back-x" onclick="document.getElementById('chBackPill').classList.remove('show')" aria-label="Stay here"><span class="material-symbols-outlined">close</span></button>`;
      (document.getElementById('rhemaModal') || document.body).appendChild(el);
    }
    requestAnimationFrame(() => el.classList.add('show'));
  }
  function backFromPassage() {
    document.getElementById('chBackPill')?.classList.remove('show');
    if (_current) claim(_current); else openActive();
  }

  function take() {
    if (!_current) return;
    active.set(_current);
    claim(_current);
    if (typeof _showStudyToast === 'function') _showStudyToast("Challenge accepted! Tap the guide anytime to come back to it.");
  }
  function done() {
    active.clear();
    if (typeof _showStudyToast === 'function') _showStudyToast('Nice work! It stays in the community list.');
    chooser();
  }

  // ── 5. Community ──────────────────────────────────────────────────────────
  let _community = [];
  async function community(filter = 'all') {
    show(`${topBar(iconBtn('arrow_back', 'Back', _current ? 'RhemaChallenge.backToCurrent()' : 'RhemaChallenge.picker()'), iconBtn('checklist', 'New challenge', 'RhemaChallenge.picker()'))}
      <div class="ch-head"><img class="ch-head-guide" src="${GUIDE}" alt="" decoding="async">
        <div class="ch-head-t"><span class="ch-kicker">Everyone's challenges</span><h1 class="ch-h1 ch-h1-left">Community</h1><i class="ch-swash"></i></div></div>
      <div class="ch-filter"><button type="button" class="${filter === 'all' ? 'on' : ''}" onclick="RhemaChallenge.community('all')">Newest</button><button type="button" class="${filter === 'mine' ? 'on' : ''}" onclick="RhemaChallenge.community('mine')">Mine</button></div>
      <div class="ch-feed" id="chFeed"><div class="ch-fine ch-center">Loading…</div></div>`, 'community');
    const host = () => document.getElementById('chFeed');
    try {
      if (isGuest()) throw new Error('guest');
      _community = filter === 'mine'
        ? await window.TheologyChallenge.listMine(user().uid)
        : await window.TheologyChallenge.listCommunity(40);
      if (_view !== 'community') return;
      host().innerHTML = _community.length ? _community.map((c, i) => `<button type="button" class="ch-card" onclick="RhemaChallenge.openFromFeed(${i})">
          <span class="ch-card-top"><span class="ch-group">${esc(c.group || c.tagName || '')}</span><small>${esc(timeAgo(c.createdAt))}</small></span>
          <span class="ch-card-claim">“${esc(c.claim)}”</span>
          <span class="ch-card-by"><span class="material-symbols-outlined">person</span>${esc(by(c))}${c.passage ? ` · ${esc(c.passage.label)}` : ''}</span></button>`).join('')
        : `<p class="ch-fine ch-center">${filter === 'mine' ? "You haven't had a challenge yet." : 'No challenges yet. Be the first!'}</p>`;
    } catch (e) {
      if (host()) host().innerHTML = `<p class="ch-fine ch-center">${isGuest() ? 'Create a free account to see the community challenges.' : "Couldn't load the challenges. Check your connection."}</p>`;
    }
  }
  function openFromFeed(i) { const c = _community[i]; if (c) claim(c); }
  function backToCurrent() { if (_current) claim(_current); else picker(); }

  // ── Entry points ──────────────────────────────────────────────────────────
  function openActive() {
    const a = active.get();
    if (!a) { chooser(); return; }
    claim(a);
    // Refresh from the server (the community copy is the source of truth).
    window.TheologyChallenge?.get?.(a.id).then(fresh => { if (fresh && _current?.id === a.id && _view === 'claim') { active.set({ ...a, ...fresh }); _current = { ...a, ...fresh }; } }).catch(() => {});
  }
  // The guide was tapped: straight to the current challenge, or the question.
  function guideTap() {
    if (active.get()) openActive();
    else chooser();
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('chSources')?.classList.contains('open')) closeSources();
    else if (document.getElementById('chOverlay')?.classList.contains('open')) close();
  });

  window.RhemaChallenge = {
    guideTap, chooser, picker, start, community, openFromFeed, backToCurrent, openActive,
    tours, close, sources, closeSources, readPassage, backFromPassage, take, done, noteChanged,
    hasActive: () => !!active.get(),
  };
})();
