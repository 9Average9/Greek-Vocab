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
  // Art in the theme's colors, with depth: gradients built from the theme's
  // main color, card color and accent (stop colors set by CSS classes, since
  // CSS variables inside SVG attributes aren't safe on every Safari).
  const ART_DEFS = `<defs>
      <linearGradient id="chgCover" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s-acc"/><stop offset="1" class="s-accdk"/></linearGradient>
      <linearGradient id="chgPageL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="s-card"/><stop offset=".78" class="s-card"/><stop offset="1" class="s-pgshade"/></linearGradient>
      <linearGradient id="chgPageR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" class="s-card"/><stop offset=".78" class="s-card"/><stop offset="1" class="s-pgshade"/></linearGradient>
      <linearGradient id="chgMark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s-acclt"/><stop offset="1" class="s-accdk"/></linearGradient>
      <linearGradient id="chgFold1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="s-card"/><stop offset="1" class="s-pgshade"/></linearGradient>
      <linearGradient id="chgFold2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="s-soft"/><stop offset="1" class="s-card"/></linearGradient>
      <radialGradient id="chgGlow" cx=".5" cy=".55" r=".5"><stop offset="0" class="s-glow"/><stop offset="1" class="s-glow0"/></radialGradient>
      <linearGradient id="chgLeaf" x1="0" y1="1" x2="1" y2="0"><stop offset="0" class="s-acc"/><stop offset="1" class="s-acclt"/></linearGradient>
    </defs>`;
  const SPARK = (x, y, r) => `<path class="ch-star" d="M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z"/>`;
  const ART_CHALLENGE = `<svg viewBox="0 0 120 100" aria-hidden="true" class="ch-art">${ART_DEFS}
      <ellipse class="ch-shadow" cx="60" cy="90" rx="44" ry="6"/>
      <path fill="url(#chgCover)" d="M10 70 Q36 60 60 72 Q84 60 110 70 L110 80 Q84 70 60 84 Q36 70 10 80Z"/>
      <path class="ch-edge" d="M14 66 Q36 57 60 68 L60 76 Q36 64 14 74Z"/>
      <path class="ch-edge" d="M106 66 Q84 57 60 68 L60 76 Q84 64 106 74Z"/>
      <path fill="url(#chgPageL)" class="ch-stroke" d="M14 34 Q36 24 60 38 L60 72 Q36 58 14 68Z"/>
      <path fill="url(#chgPageR)" class="ch-stroke" d="M106 34 Q84 24 60 38 L60 72 Q84 58 106 68Z"/>
      <g class="ch-lines"><path d="M22 42 Q36 36 52 44"/><path d="M22 49 Q36 43 52 51"/><path d="M22 56 Q36 50 52 58"/><path d="M98 42 Q84 36 68 44"/><path d="M98 49 Q84 43 68 51"/><path d="M98 56 Q84 50 68 58"/></g>
      <path class="ch-mark-sh" d="M48 25 Q48 9 61 9 Q74 9 74 21 Q74 29 65 33 Q62 35 62 41"/>
      <path class="ch-mark" stroke="url(#chgMark)" d="M47 23 Q47 7 60 7 Q73 7 73 19 Q73 27 64 31 Q61 33 61 39"/>
      <path class="ch-mark-hi" d="M52 15 Q55 10 61 10"/>
      <circle cx="61" cy="47" r="4.6" fill="url(#chgMark)"/>
      ${SPARK(28, 16, 6)}${SPARK(96, 14, 5)}${SPARK(102, 30, 3)}${SPARK(18, 30, 3)}
    </svg>`;
  const ART_TOURS = `<svg viewBox="0 0 120 100" aria-hidden="true" class="ch-art">${ART_DEFS}
      <ellipse class="ch-shadow" cx="60" cy="90" rx="46" ry="6"/>
      <path fill="url(#chgFold1)" class="ch-stroke" d="M12 34 L40 24 L40 78 L12 88Z"/>
      <path fill="url(#chgFold2)" class="ch-stroke" d="M40 24 L72 34 L72 88 L40 78Z"/>
      <path fill="url(#chgFold1)" class="ch-stroke" d="M72 34 L104 24 L104 78 L72 88Z"/>
      <path class="ch-terrain" d="M18 72 Q26 62 34 70 Q38 74 40 70 L40 78 L18 85Z"/>
      <path class="ch-terrain" d="M78 60 Q86 52 96 58 L98 70 Q88 66 80 72Z"/>
      <path class="ch-route" d="M22 78 Q34 60 50 66 T80 52"/>
      <circle class="ch-start" cx="22" cy="78" r="3.4"/>
      <ellipse class="ch-shadow" cx="88" cy="56" rx="8" ry="2.6"/>
      <path fill="url(#chgMark)" d="M88 6 C78 6 72 13 72 21 C72 32 88 50 88 50 C88 50 104 32 104 21 C104 13 98 6 88 6Z"/>
      <circle class="ch-pin-hole" cx="88" cy="21" r="6"/>
      <path class="ch-mark-hi" d="M78 16 Q80 10 86 9"/>
      ${SPARK(24, 14, 5)}${SPARK(112, 40, 3.5)}
    </svg>`;
  const ART_FOOT = `<svg class="ch-foot" viewBox="0 0 360 130" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${ART_DEFS}
      <ellipse cx="180" cy="80" rx="150" ry="58" fill="url(#chgGlow)"/>
      <g class="ch-rays"><path d="M180 20 L180 6"/><path d="M156 26 L146 14"/><path d="M204 26 L214 14"/><path d="M136 40 L122 32"/><path d="M224 40 L238 32"/></g>
      <path fill="url(#chgLeaf)" class="ch-leaf" d="M58 112 Q20 86 36 46 Q60 70 70 104Z"/>
      <path fill="url(#chgLeaf)" class="ch-leaf ch-leaf2" d="M74 112 Q58 70 92 50 Q96 84 84 110Z"/>
      <path class="ch-vein" d="M40 54 Q54 80 66 106 M88 58 Q86 84 80 108"/>
      <path fill="url(#chgLeaf)" class="ch-leaf" d="M302 112 Q340 86 324 46 Q300 70 290 104Z"/>
      <path fill="url(#chgLeaf)" class="ch-leaf ch-leaf2" d="M286 112 Q302 70 268 50 Q264 84 276 110Z"/>
      <path class="ch-vein" d="M320 54 Q306 80 294 106 M272 58 Q274 84 280 108"/>
      <ellipse class="ch-shadow" cx="180" cy="122" rx="104" ry="7"/>
      <path fill="url(#chgCover)" d="M78 108 Q128 88 180 102 Q232 88 282 108 L282 118 Q232 98 180 114 Q128 98 78 118Z"/>
      <path class="ch-edge" d="M84 104 Q130 86 180 98 L180 106 Q130 92 84 112Z"/>
      <path class="ch-edge" d="M276 104 Q230 86 180 98 L180 106 Q230 92 276 112Z"/>
      <path fill="url(#chgPageL)" class="ch-stroke" d="M86 92 Q130 62 180 82 L180 104 Q130 86 86 106Z"/>
      <path fill="url(#chgPageR)" class="ch-stroke" d="M274 92 Q230 62 180 82 L180 104 Q230 86 274 106Z"/>
      <g class="ch-lines"><path d="M102 88 Q136 72 168 86"/><path d="M104 96 Q136 82 168 94"/><path d="M258 88 Q224 72 192 86"/><path d="M256 96 Q224 82 192 94"/></g>
      <path fill="url(#chgMark)" d="M184 100 L184 126 L190 120 L196 126 L196 98Z"/>
      ${SPARK(118, 30, 6)}${SPARK(244, 28, 5)}${SPARK(268, 52, 3.5)}${SPARK(96, 54, 3.5)}
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
  const tile = (key, label, sub) => `<button type="button" class="ch-tile" onclick="RhemaChallenge.topics('${key}')">
      <span class="ch-tile-img"><img src="assets/challenge/${key}.webp" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>
      <b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  function picker() {
    const ref = readerRef();
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
        <button type="button" class="ch-pill" onclick="RhemaChallenge.topics('trending')"><img src="assets/challenge/trending.webp" alt="" decoding="async" onerror="this.remove()"><span><b>What's trending</b><small>A claim being debated right now</small></span></button>
      </div>
      <div class="ch-sec">Christian traditions</div>
      <div class="ch-tiles">${TAGS.traditions.map(([k, l]) => tile(k, l)).join('')}</div>
      <div class="ch-sec">Other faiths &amp; views</div>
      <div class="ch-tiles">${TAGS.others.map(([k, l]) => tile(k, l)).join('')}</div>`, 'picker');
  }

  // Picking a group opens a few topics they're known for (or "surprise me").
  const TOPICS = {
    catholic: ['Salvation', 'Papal authority', 'Scripture & Tradition', 'The Eucharist', 'Mary', 'Purgatory', 'Justification & works', 'Baptism', 'Confession to a priest', 'Praying to saints'],
    orthodox: ['Salvation', 'Theosis', 'Icons', 'Holy Tradition & councils', 'Baptism & chrismation', 'The Filioque', 'Sacraments & grace', 'Mary the Theotokos', 'The one true Church'],
    calvinist: ['Salvation', 'TULIP', 'Election', 'Predestination', 'Limited atonement', 'Irresistible grace', 'Total depravity', 'Perseverance of the saints', 'Lordship & assurance', 'Sovereignty & free will'],
    arminian: ['Salvation', 'Free will', 'Prevenient grace', 'Conditional election', 'Losing salvation', 'Christ died for all', 'Resisting grace', 'Assurance'],
    lutheran: ['Salvation', 'Baptismal regeneration', 'Real presence in the Supper', 'Law & Gospel', 'Infant baptism', 'Losing faith', 'Two kingdoms'],
    pentecostal: ['Salvation', 'Baptism in the Spirit', 'Speaking in tongues', 'Healing', 'Prophecy today', 'Tongues as initial evidence', 'Prosperity'],
    lds: ['Salvation', 'The nature of God', 'Jesus & Lucifer', 'Exaltation', 'The Book of Mormon', 'The Great Apostasy', 'Temples & baptism for the dead', 'Pre-mortal life'],
    jw: ['Salvation', 'Jesus & the Trinity', 'Jesus as Michael', 'The 144,000', 'The holy spirit', 'Soul & hell', 'Blood transfusions', 'The name Jehovah'],
    islam: ['Salvation', 'Jesus as a prophet', 'The crucifixion', 'The Bible changed', 'The Trinity', 'Sin & forgiveness', 'Muhammad foretold'],
    judaism: ['Salvation', 'The Messiah', 'Isaiah 53', 'The Trinity', 'Keeping the Law', 'Atonement without sacrifice', 'The resurrection of Jesus'],
    skeptic: ['Salvation & fairness', 'Bible contradictions', 'The resurrection', 'The problem of evil', 'Are the Gospels reliable?', 'Miracles', 'Hell', 'Science & Scripture'],
    trending: ['Salvation', 'The gospel message', 'End times', 'The church & culture', 'Gender & sexuality', 'The Holy Spirit today', 'Science & creation', 'Hell & judgment'],
  };
  const TAG_NAMES = Object.fromEntries([...TAGS.traditions, ...TAGS.others, ['trending', "What's trending"]]);
  function topics(key) {
    const list = TOPICS[key];
    if (!list) { start(key); return; }
    show(`${topBar(iconBtn('arrow_back', 'Back', 'RhemaChallenge.picker()'), iconBtn('groups', 'Community challenges', 'RhemaChallenge.community()'))}
      <div class="ch-topic-head">
        <span class="ch-tile-img ch-topic-img"><img src="assets/challenge/${key}.webp" alt="" decoding="async" onerror="this.remove()"></span>
        <div><span class="ch-kicker">${key === 'trending' ? 'A trending debate about' : 'Challenge me on'}</span><h1 class="ch-h1 ch-h1-left ch-topic-h">${esc(TAG_NAMES[key] || key)}</h1></div>
      </div>
      <p class="ch-lead">Pick what you'd like to be challenged on.</p>
      <div class="ch-topics">${list.map(t => `<button type="button" class="ch-topic" onclick="RhemaChallenge.start('${key}','${jsq(t)}')">${esc(t)}<span class="material-symbols-outlined">arrow_forward</span></button>`).join('')}
        <button type="button" class="ch-topic ch-topic-any" onclick="RhemaChallenge.start('${key}','')"><span class="material-symbols-outlined">casino</span>Surprise me<span class="material-symbols-outlined">arrow_forward</span></button>
      </div>`, 'topics');
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
  async function start(tag, topic) {
    if (_busy) return;
    if (isGuest()) {
      if (typeof _showStudyToast === 'function') _showStudyToast('Create a free account to get challenges');
      if (typeof openGuestAccountPrompt === 'function') setTimeout(openGuestAccountPrompt, 300);
      return;
    }
    const prompt = (document.getElementById('chPrompt')?.value || '').trim();
    if (tag === 'free' && prompt.length < 3) { document.getElementById('chPrompt')?.focus(); return; }
    const payload = { tag, prompt: tag === 'free' ? prompt : String(topic || '') };
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
      ${c.explain ? `<div class="ch-why"><span class="material-symbols-outlined">lightbulb</span><div><b>What they mean</b><p>${esc(c.explain)}</p></div></div>` : ''}
      ${c.why ? `<div class="ch-why"><span class="material-symbols-outlined">info</span><div><b>Why they hold it</b><p>${esc(c.why)}</p></div></div>` : ''}
      ${c.passage ? passageCard(c) : ''}
      <div class="ch-sec ch-sec-line">Explore the claim</div>
      ${c.passage ? `<button type="button" class="ch-row" onclick="RhemaChallenge.readPassage()"><span class="material-symbols-outlined">menu_book</span><span><b>Read it in context</b><small>${esc(c.passage.label)} in the reader</small></span><span class="material-symbols-outlined ch-chev">chevron_right</span></button>` : ''}
      <button type="button" class="ch-row" onclick="RhemaChallenge.sources()"><span class="material-symbols-outlined">link</span><span><b>Sources &amp; References</b><small>In their own words, with links</small></span><span class="ch-count">${n}</span><span class="material-symbols-outlined ch-chev">chevron_right</span></button>
      ${isActive
        ? `<button type="button" class="ch-btn ch-btn-ghost" onclick="RhemaChallenge.done()"><span class="material-symbols-outlined">task_alt</span>I'm done with this challenge</button>
           <p class="ch-fine ch-center">Saved in the community. While you're on it, tapping the guide brings you right back here.</p>`
        : `<button type="button" class="ch-btn" onclick="RhemaChallenge.take()"><span class="material-symbols-outlined">bolt</span>Take this challenge</button>
           <p class="ch-fine ch-center">The guide will keep it handy: tap him anytime to come back.</p>`}`, 'claim');
  }
  // The passage they use: its words (reader version), the words the claim
  // rests on marked, and how the group reads them.
  function passageCard(c) {
    const p = c.passage;
    const kw = Array.isArray(c.keyWords) ? c.keyWords.filter(k => k && k.words) : [];
    setTimeout(() => fillPassage(c), 0);
    return `<section class="ch-pass">
        <div class="ch-pass-h"><span class="material-symbols-outlined">auto_stories</span><b>The passage they use</b><span class="ch-pass-ref">${esc(p.label)}</span></div>
        <div class="ch-pass-text" id="chPassText"><span class="ch-fine">Loading the passage…</span></div>
        ${c.passageUse ? `<div class="ch-pass-use"><b>How they read it</b><p>${esc(c.passageUse)}</p></div>` : ''}
        ${kw.length ? `<div class="ch-kws"><b>The words it rests on</b>${kw.map(k => `<div class="ch-kw-row"><mark class="ch-kw">${esc(k.words)}</mark><p>${esc(k.reading)}</p></div>`).join('')}</div>` : ''}
      </section>`;
  }
  const _passCache = new Map();
  async function passageVerses(p) {
    const tryVer = async (ver) => {
      if (ver === 'MSB' || ver === 'BSB') {
        if (typeof _rhemaLoadDataFile === 'function') await _rhemaLoadDataFile(ver === 'BSB' ? 'rhema-bsb.js' : 'rhema-msb.js').catch(() => {});
        const out = [];
        for (let v = p.verse; v <= (p.endVerse || p.verse); v++) {
          const t = typeof _rhemaEnglishText === 'function' ? _rhemaEnglishText(p.book, p.chapter, v, ver) : '';
          if (t) out.push([v, t]);
        }
        return out;
      }
      if (typeof _vsBookInScope === 'function' && !_vsBookInScope(ver, p.book)) return [];
      let chap = typeof _vsChapterFromMemory === 'function' ? _vsChapterFromMemory(ver, p.book, String(p.chapter)) : null;
      if (!chap && typeof _vsEnsureChapter === 'function') {
        try { await _vsEnsureChapter(ver, p.book, String(p.chapter)); } catch {}
        chap = typeof _vsChapterFromMemory === 'function' ? _vsChapterFromMemory(ver, p.book, String(p.chapter)) : null;
      }
      const out = [];
      if (chap) for (let v = p.verse; v <= (p.endVerse || p.verse); v++) { const t = chap[String(v)]; if (t) out.push([v, String(t)]); }
      return out;
    };
    const reader = typeof _rhemaReaderVersion === 'function' ? _rhemaReaderVersion() : 'BSB';
    const key = `${reader}|${p.book}|${p.chapter}|${p.verse}|${p.endVerse}`;
    if (_passCache.has(key)) return _passCache.get(key);
    let ver = reader, verses = [];
    for (const v of [reader, 'BSB', 'MSB'].filter((x, i, a) => a.indexOf(x) === i)) {
      try { verses = await tryVer(v); } catch { verses = []; }
      if (verses.length) { ver = v; break; }
    }
    const res = { ver, verses };
    if (verses.length) _passCache.set(key, res);
    return res;
  }
  // Escape text and wrap the key phrases (any case, loose punctuation).
  function markWords(text, kws) {
    const ranges = [];
    for (const k of kws) {
      const parts = String(k.words || '').toLowerCase().replace(/[“”"‘’.,;:!?]/g, ' ').split(/\s+/).filter(Boolean);
      if (!parts.length) continue;
      const re = new RegExp(`(^|[^\\p{L}])(${parts.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]")).join("[\\s,;:.!?’'”“—–-]+")})(?=$|[^\\p{L}])`, 'giu');
      let m;
      while ((m = re.exec(text))) {
        const a = m.index + m[1].length, b = a + m[2].length;
        if (!ranges.some(r => a < r[1] && b > r[0])) ranges.push([a, b]);
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    }
    ranges.sort((x, y) => x[0] - y[0]);
    let out = '', at = 0;
    for (const [a, b] of ranges) { out += esc(text.slice(at, a)) + `<mark class="ch-kw">${esc(text.slice(a, b))}</mark>`; at = b; }
    return out + esc(text.slice(at));
  }
  async function fillPassage(c) {
    const el = document.getElementById('chPassText');
    if (!el || !c.passage) return;
    const { ver, verses } = await passageVerses(c.passage);
    if (_current !== c || !el.isConnected) return;
    if (!verses.length) { el.innerHTML = `<span class="ch-fine">Tap “Read it in context” below to open ${esc(c.passage.label)}.</span>`; return; }
    const kws = Array.isArray(c.keyWords) ? c.keyWords : [];
    const rows = verses.map(([v, t]) => { const h = markWords(t, kws); return { v, h, hit: h.includes('<mark') }; });
    const body = rows.map(r => `<sup>${r.v}</sup>${r.h}`).join(' ');
    const long = rows.length > 4 || body.length > 900;
    const hits = rows.filter(r => r.hit);
    // A long passage opens on the verses the claim rests on.
    const short = long && hits.length && hits.length < rows.length
      ? rows.map((r, i) => r.hit ? `<sup>${r.v}</sup>${r.h}` : (i && rows[i - 1].hit === false ? '' : '<span class="ch-gap">…</span>')).filter(Boolean).join(' ')
      : '';
    el.innerHTML = short
      ? `<p class="ch-pass-verses">${short}</p><p class="ch-pass-verses" hidden>${body}</p>
         <button type="button" class="ch-more" onclick="const p=this.parentNode.querySelectorAll('.ch-pass-verses');p[0].remove();p[1].hidden=false;this.remove()">Show the whole passage</button>
         <span class="ch-pass-ver">${esc(ver)}</span>`
      : `<p class="ch-pass-verses${long ? ' ch-clamp' : ''}">${body}</p>
         ${long ? `<button type="button" class="ch-more" onclick="this.previousElementSibling.classList.remove('ch-clamp');this.remove()">Show the whole passage</button>` : ''}
         <span class="ch-pass-ver">${esc(ver)}</span>`;
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
        <p class="ch-fine">Each quote below was found word for word on the page it links to. Read them in context.</p>
        ${(c.sources || []).map(s => `<a class="ch-src" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">
          <q>${esc(s.quote)}</q><span class="ch-src-t"><b>${esc(s.title || s.site)}</b><small>${esc(s.site)}</small></span><span class="material-symbols-outlined">open_in_new</span></a>`).join('')}
        <p class="ch-fine">Found by the guide's web research and checked against the pages. The claim is stated the way its own teachers put it; it isn't the app's view.</p>
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
    show(`${topBar(iconBtn('arrow_back', 'Back', _current ? 'RhemaChallenge.backToCurrent()' : 'RhemaChallenge.picker()'))}
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
    tours, close, sources, closeSources, readPassage, backFromPassage, take, done, topics,
    hasActive: () => !!active.get(),
  };
})();
