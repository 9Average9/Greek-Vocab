/* ══════════════════════════════════════════════════════════════════════════
   KNOWLEDGE CHECK — practice library for the Greek classes.
   30 fact-checked practice questions per lesson (greek-practice.js, loaded on
   first use). A lesson's practice opens once that lesson is finished.
   Progress (per question: right-in-a-row, tries, rights) is kept on the device
   and synced with the account. A question is "mastered" once it has been
   answered right every time, or twice in a row after a miss.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const G = window.gcShared;
  if (!G) return;
  const { ART, laurel, decoHTML, esc, setFull, ensureScreen, CLASSES, lessonsFor, isDone, byKey } = G;

  const ROUND = 10;
  const KEY = 'gcPracticeV1';
  const KIND = { letter: 'Name the letter', sound: 'Sound', form: 'Form', meaning: 'Meaning', concept: 'Concept', reading: 'Reading', truefalse: 'True or false' };
  const PRAISE = ['Nice!', 'Excellent!', 'You got it!', 'Spot on!', 'Well done!', 'Correct!'];
  const ICON = {
    flame: '<svg class="gp-flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c1 3.4 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.2 2.6-5.4.2 1.8 1 2.9 2.2 3.4C11 9 10.6 6 12 2.5z"/><path d="M12 12c.6 1.6 2.4 2.4 2.4 4.4a2.4 2.4 0 0 1-4.8 0c0-1.3.8-2 1.4-2.6.1.7.4 1.1.9 1.3-.2-1.1-.3-2.1.1-3.1z"/></svg>',
    mix: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    lock: '<svg class="gp-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/></svg>',
    happy: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4M9 9.5h.01M15 9.5h.01"/></svg>',
    meh: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 15.5h7M9 9.5h.01M15 9.5h.01"/></svg>'
  };

  /* ── Data ─────────────────────────────────────────────────────────────── */
  let _dataP = null;
  function loadData() {
    if (window.GREEK_PRACTICE) return Promise.resolve(window.GREEK_PRACTICE);
    if (_dataP) return _dataP;
    const v = (typeof APP_VERSION !== 'undefined' && APP_VERSION) || '1';
    _dataP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `greek-practice.js?v=${v}`;
      s.onload = () => (window.GREEK_PRACTICE ? resolve(window.GREEK_PRACTICE) : reject(new Error('no data')));
      s.onerror = () => { _dataP = null; reject(new Error('load failed')); };
      document.head.appendChild(s);
    });
    return _dataP;
  }
  const qs = lid => (window.GREEK_PRACTICE && window.GREEK_PRACTICE[lid]) || [];
  const COUNT = 30;

  /* ── Progress ─────────────────────────────────────────────────────────── */
  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.q) return d; } catch {}
    return { q: {}, days: [], n: 0, r: 0 };
  }
  let ST = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch {} }
  function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  const qkey = (lid, q) => `${lid}:${hash((q.q || '') + '|' + (q.greek || ''))}`;
  const ent = k => ST.q[k] || [0, 0, 0, 0]; // [right in a row, tries, rights, last was wrong]
  // Mastered: right twice in a row, or right every time it has been asked.
  const mastered = k => { const e = ent(k); return e[0] >= 2 || (e[0] >= 1 && e[2] === e[1]); };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function dayStreak() {
    const set = new Set(ST.days || []);
    const d = new Date();
    if (!set.has(today())) d.setDate(d.getDate() - 1);
    let n = 0;
    for (;;) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!set.has(k)) break;
      n++; d.setDate(d.getDate() - 1);
    }
    return n;
  }
  function record(k, ok) {
    const e = ent(k).slice();
    e[1]++; if (ok) { e[0]++; e[2]++; e[3] = 0; } else { e[0] = 0; e[3] = 1; }
    ST.q[k] = e; ST.n = (ST.n || 0) + 1; if (ok) ST.r = (ST.r || 0) + 1;
    const t = today();
    ST.days = ST.days || [];
    if (!ST.days.includes(t)) { ST.days.push(t); ST.days = ST.days.slice(-120); }
    save();
  }
  function masteredIn(lid) { return qs(lid).filter(q => mastered(qkey(lid, q))).length; }
  function masteredTotal() { return Object.keys(ST.q).filter(mastered).length; }

  // Cloud sync (merged into the account record by app.js).
  window.getGreekPracticeSyncData = () => ({ greekPractice: ST });
  window.mergeGreekPracticeFromCloud = (cloud) => {
    if (!cloud || !cloud.q) return;
    Object.entries(cloud.q).forEach(([k, e]) => { const mine = ST.q[k]; if (!mine || (e[1] || 0) > (mine[1] || 0)) ST.q[k] = e; });
    ST.days = [...new Set([...(ST.days || []), ...(cloud.days || [])])].sort().slice(-120);
    ST.n = Math.max(ST.n || 0, cloud.n || 0); ST.r = Math.max(ST.r || 0, cloud.r || 0);
    save();
  };

  /* ── Which lessons are open for practice ─────────────────────────────── */
  const doneLessons = cls => lessonsFor(cls).filter(l => isDone(cls, l.id));
  function classStats(cls) {
    const done = doneLessons(cls);
    const total = done.length * COUNT;
    const m = window.GREEK_PRACTICE ? done.reduce((s, l) => s + masteredIn(l.id), 0) : 0;
    return { done: done.length, total, m, pct: total ? Math.round(m / total * 100) : 0 };
  }

  /* ── Knowledge Check tab ─────────────────────────────────────────────── */
  function ring(p, glyph) {
    return `<span class="gp-ring"><svg viewBox="0 0 56 56" aria-hidden="true"><circle class="bg" cx="28" cy="28" r="24"/><circle class="fg" data-p="${p}" cx="28" cy="28" r="24"/></svg><b${glyph.length > 2 ? ' class="gp-small"' : ''}>${esc(glyph)}</b></span>`;
  }
  function hubHTML() {
    if (!window.GREEK_PRACTICE) {
      loadData().then(() => { if (document.querySelector('#greekClassesPage .gc-tab-kc')) window.gcHubTab('kc'); }).catch(() => {
        const b = document.getElementById('gcTabBody'); if (b) b.innerHTML = '<p class="gp-empty">Practice could not load. Check your connection and try again.</p>';
      });
      return '<div class="gp-loading"><span></span><span></span><span></span></div>';
    }
    const anyDone = CLASSES.some(c => doneLessons(c).length);
    const acc = ST.n ? Math.round(ST.r / ST.n * 100) : 0;
    const streak = dayStreak();
    return `<div class="gp-hero">
        <div class="gp-art">${laurel(0)}<span class="gp-badge">${ART.quiz}</span>${laurel(1)}</div>
        <h2>Knowledge Check</h2>
        <p>${COUNT} fresh practice questions for every lesson</p>
      </div>
      <div class="gp-stats">
        <div class="gp-stat"><b>${ICON.flame.replace('gp-flame', 'gp-flame' + (streak ? ' gp-lit' : ''))}${streak}</b><small>day streak</small></div>
        <div class="gp-stat"><b data-count="${masteredTotal()}">0</b><small>mastered</small></div>
        <div class="gp-stat"><b>${ST.n ? acc + '%' : '–'}</b><small>accuracy</small></div>
      </div>
      <div class="gp-mix${anyDone ? '' : ' gp-off'}">
        <div><h3>${ICON.mix}Daily Mix</h3>
        <p>${anyDone ? `${ROUND} questions from everything you've finished, more of the ones you missed.` : 'Finish a lesson to unlock practice.'}</p></div>
        <button type="button" class="gp-go" ${anyDone ? '' : 'disabled'} onclick="gcPracticeMix()">Start</button>
      </div>
      <h2 class="gc-section-label">Practice by class</h2>
      <div class="gp-class-list">${CLASSES.map(cls => {
        const st = classStats(cls);
        const all = lessonsFor(cls).length;
        return `<button type="button" class="gp-cls${st.done ? '' : ' gp-locked'}" ${st.done ? `onclick="gcPracticeClass('${cls.key}')"` : 'disabled'}>
          ${ring(st.pct, cls.glyph)}
          <span class="gp-cls-text"><strong>${esc(cls.name)}</strong><small>${st.done ? `${st.done} of ${all} lessons ready · ${st.total} questions` : 'Finish a lesson to unlock'}</small></span>
          ${st.done ? `<span class="gp-pct">${st.pct}%<small>mastered</small></span>` : ICON.lock}
        </button>`;
      }).join('')}</div>`;
  }
  function animateIn(root) {
    requestAnimationFrame(() => {
      root.querySelectorAll('.gp-ring .fg').forEach(c => { c.style.strokeDashoffset = 151 * (1 - (+c.dataset.p || 0) / 100); });
      root.querySelectorAll('.gp-mbar i').forEach(i => { i.style.width = i.dataset.w + '%'; });
      root.querySelectorAll('[data-count]').forEach(el => {
        const to = +el.dataset.count || 0; const t0 = performance.now(); const dur = Math.min(900, 300 + to * 6);
        const step = now => { const k = Math.min(1, (now - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    });
  }
  window.gcPracticeHubHTML = hubHTML;
  window.gcPracticeAfterRender = animateIn;

  /* ── A class's practice list ─────────────────────────────────────────── */
  let _from = { kind: 'hub' };
  function openClassPractice(key) {
    const cls = byKey(key);
    if (!cls) return;
    loadData().then(() => {
      _from = { kind: 'class', key };
      const el = ensureScreen('greekPracticePage', 'Class practice');
      const list = lessonsFor(cls);
      const ready = doneLessons(cls);
      el.innerHTML = `${decoHTML()}<div class="gc-page">
        <header class="gc-brand-row">
          <button type="button" class="gc-icon-btn" onclick="gcOpenHub('kc')" aria-label="Back to Knowledge Check">${ART.back}</button>
          <h1 class="gc-brand gc-brand-sm">${ART.temple}<span>${esc(cls.name)} Practice</span></h1>
          <span class="gc-icon-spacer"></span>
        </header>
        <div class="gc-key" aria-hidden="true"></div>
        <div class="gp-mix"><div><h3>${ART.target}Class Mix</h3><p>${ROUND} questions from ${ready.length === 1 ? 'the lesson' : `all ${ready.length} lessons`} you've finished.</p></div>
          <button type="button" class="gp-go" onclick="gcPracticeClassMix('${cls.key}')">Start</button></div>
        <div class="gp-lesson-list">${list.map((l, i) => {
          const d = isDone(cls, l.id);
          const m = d ? masteredIn(l.id) : 0;
          const star = d && m >= COUNT;
          return `<button type="button" class="gp-row${d ? '' : ' gp-locked'}${star ? ' gp-star' : ''}" style="animation-delay:${Math.min(i, 12) * 0.04}s" ${d ? `onclick="gcPracticeLesson('${cls.key}','${l.id}')"` : 'disabled'}>
            <span class="gp-n">${star ? ICON.star : i + 1}</span>
            <span class="gp-row-text"><strong>${esc(l.title)}</strong>
              <span class="gp-mbar"><span class="t"><i data-w="${d ? m / COUNT * 100 : 0}"></i></span><b>${d ? `${m}/${COUNT}` : ''}</b></span></span>
            ${d ? '<span class="gc-pill">Practice</span>' : ICON.lock}
          </button>`;
        }).join('')}</div>
      </div>`;
      if (typeof showScreen === 'function') showScreen('greekPracticePage');
      setFull('full');
      if (typeof hideBottomNav === 'function') hideBottomNav();
      animateIn(el);
    }).catch(() => {});
  }

  /* ── Picking a round ─────────────────────────────────────────────────── */
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // Missed last time first, then never tried, then not yet mastered, then
  // mastered (least practiced first). Mixed rounds spread across lessons.
  function pick(lids, n = ROUND) {
    const tiers = [[], [], [], []];
    lids.forEach(lid => qs(lid).forEach((q, i) => {
      const k = qkey(lid, q); const e = ent(k);
      const t = e[3] ? 0 : !e[1] ? 1 : e[0] < 2 ? 2 : 3;
      tiers[t].push({ lid, i, q, k, w: e[1] });
    }));
    tiers.forEach((t, i) => { shuffle(t); if (i === 3) t.sort((a, b) => a.w - b.w); });
    let pool = tiers.flat();
    if (lids.length > 1) {
      // Round-robin across lessons within the priority order.
      const by = {}; pool.forEach(x => (by[x.lid] = by[x.lid] || []).push(x));
      const order = shuffle(Object.keys(by)); const out = [];
      while (out.length < n && order.some(l => by[l].length)) order.forEach(l => { if (by[l].length && out.length < n) out.push(by[l].shift()); });
      pool = out;
    }
    return pool.slice(0, n);
  }
  function lessonTitle(lid) {
    for (const c of CLASSES) { const l = lessonsFor(c).find(x => x.id === lid); if (l) return l.title; }
    return '';
  }

  /* ── The question player ─────────────────────────────────────────────── */
  let R = null;
  function startRound(items, title, back) {
    if (!items.length) return;
    R = { items, i: 0, right: 0, streak: 0, res: [], title, back, newly: 0 };
    const el = ensureScreen('greekQuizPage', 'Practice question');
    el.innerHTML = `${decoHTML()}<div class="gp-q-top">
        <button type="button" class="gc-icon-btn" onclick="gcPracticeQuit()" aria-label="Stop practice">${ICON.close}</button>
        <div class="gp-segs" aria-hidden="true">${items.map(() => '<i></i>').join('')}</div>
        <div class="gp-streak" aria-label="Streak">${ICON.flame.replace('gp-flame', 'gp-flame gp-lit')}<span>0</span></div>
      </div>
      <div class="gp-q-body" id="gpBody"></div>
      <div class="gp-sheet" id="gpSheet"></div>
      <canvas class="gp-confetti" id="gpConfetti"></canvas>`;
    if (typeof showScreen === 'function') showScreen('greekQuizPage');
    setFull('full');
    if (typeof hideBottomNav === 'function') hideBottomNav();
    renderQ();
  }
  function segs() {
    document.querySelectorAll('#greekQuizPage .gp-segs i').forEach((s, i) => {
      s.className = R.res[i] === true ? 'ok' : R.res[i] === false ? 'no' : i === R.i ? 'cur' : '';
    });
  }
  function renderQ() {
    const it = R.items[R.i]; const q = it.q;
    const opts = q.options.map((o, i) => ({ o, i }));
    if (q.kind !== 'truefalse') shuffle(opts);
    R.opts = opts;
    segs();
    const g = q.greek || '';
    const gcls = g.length <= 3 ? 'gp-glyph' : g.length <= 14 ? 'gp-glyph gp-word' : 'gp-glyph gp-phrase';
    const body = document.getElementById('gpBody');
    body.innerHTML = `<p class="gp-meta">${esc(lessonTitle(it.lid))} · Question ${R.i + 1} of ${R.items.length}</p>
      <div class="gp-qcard"><span class="gp-chip">${esc(KIND[q.kind] || 'Question')}</span>
        ${g ? `<span class="${gcls}" lang="grc">${esc(g)}</span>` : ''}
        <p class="gp-qtext">${esc(q.q)}</p></div>
      <div class="gp-opts">${opts.map((x, j) => `<button type="button" class="gp-opt" style="animation-delay:${0.05 + j * 0.06}s" onclick="gcPracticePick(${j}, this)"><span class="gp-k">${q.kind === 'truefalse' ? (j ? 'F' : 'T') : 'ABCD'[j]}</span><span class="gp-o${/^[\u0370-\u03FF\u1F00-\u1FFF\/ ]{1,4}$/.test(x.o) ? ' gp-o-greek' : ''}" ${/[\u0370-\u03FF\u1F00-\u1FFF]/.test(x.o) ? 'lang="grc"' : ''}>${esc(x.o)}</span></button>`).join('')}</div>`;
    body.scrollTop = 0;
    const sh = document.getElementById('gpSheet'); sh.className = 'gp-sheet'; sh.innerHTML = '';
  }
  function pickAnswer(j, el) {
    if (!R || R.locked) return;
    R.locked = true;
    const it = R.items[R.i]; const q = it.q;
    const chosen = R.opts[j].i; const ok = chosen === q.answer;
    const wasMastered = mastered(it.k);
    record(it.k, ok);
    if (!wasMastered && mastered(it.k)) R.newly++;
    R.res[R.i] = ok;
    if (ok) { R.right++; R.streak++; } else R.streak = 0;
    const btns = [...document.querySelectorAll('#gpBody .gp-opt')];
    btns.forEach((b, x) => {
      b.disabled = true;
      if (R.opts[x].i === q.answer) b.classList.add(ok ? 'gp-right' : 'gp-reveal');
      else if (x === j) b.classList.add('gp-wrong');
      else b.classList.add('gp-dim');
    });
    const good = btns.find((b, x) => R.opts[x].i === q.answer);
    if (good) good.querySelector('.gp-k').innerHTML = '<svg class="gp-check" viewBox="0 0 24 24"><path d="M5.5 12.5l4 4 9-9.5"/></svg>';
    if (!ok) el.querySelector('.gp-k').textContent = '✕';
    const st = document.querySelector('#greekQuizPage .gp-streak');
    if (st) { st.querySelector('span').textContent = R.streak; if (ok) { st.classList.remove('gp-bump'); void st.offsetWidth; st.classList.add('gp-bump'); } }
    if (ok) {
      const x = document.createElement('span'); x.className = 'gp-xp'; x.textContent = '+10 XP'; el.appendChild(x);
      burst(el);
    }
    segs();
    const last = R.i >= R.items.length - 1;
    const sh = document.getElementById('gpSheet');
    sh.className = 'gp-sheet ' + (ok ? 'gp-good' : 'gp-bad');
    sh.innerHTML = `<h4>${ok ? ICON.happy + PRAISE[(R.i + R.right) % PRAISE.length] : ICON.meh + 'Not quite'}</h4>
      <p>${esc(q.explain || '')}</p>
      <button type="button" class="gp-go gp-wide" onclick="gcPracticeNext()">${last ? 'See results' : 'Next question'}${ART.right}</button>`;
    requestAnimationFrame(() => sh.classList.add('gp-on'));
  }
  function next() {
    if (!R) return;
    R.locked = false;
    document.getElementById('gpSheet')?.classList.remove('gp-on');
    if (R.i >= R.items.length - 1) { setTimeout(results, 160); return; }
    R.i++;
    setTimeout(renderQ, 140);
  }
  function quit() {
    const back = R?.back; R = null;
    if (back && back.kind === 'class') openClassPractice(back.key); else window.gcOpenHub('kc');
  }

  /* ── Results ─────────────────────────────────────────────────────────── */
  function results() {
    const total = R.items.length, right = R.right;
    const missed = R.items.filter((_, i) => R.res[i] === false);
    R.missed = missed;
    const stars = right / total >= 0.9 ? 3 : right / total >= 0.7 ? 2 : right / total >= 0.4 ? 1 : 0;
    const xp = right * 10;
    if (xp && typeof addXP === 'function') { try { addXP(xp, 'Knowledge Check', false); } catch {} }
    try { if (typeof syncUserData === 'function') syncUserData(); } catch {}
    const el = document.getElementById('greekQuizPage');
    const gains = [];
    if (R.newly) gains.push(`+${R.newly} mastered`);
    if (xp) gains.push(`+${xp} XP`);
    const ds = dayStreak(); if (ds) gains.push(`${ds}-day streak`);
    el.innerHTML = `${decoHTML()}<div class="gc-page gp-res">
      <h1 class="gc-brand gc-brand-sm">${ART.temple}<span>Round complete</span></h1>
      <div class="gc-key" aria-hidden="true"></div>
      <div class="gp-stars">${[0, 1, 2].map(i => `<span class="${i < stars ? '' : 'gp-off'}">${ICON.star}</span>`).join('')}</div>
      <div class="gp-big"><svg viewBox="0 0 190 190" aria-hidden="true"><defs><linearGradient id="gpRG" x1="0" x2="1"><stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="var(--secondary-color)"/></linearGradient></defs><circle class="bg" cx="95" cy="95" r="85"/><circle class="fg" cx="95" cy="95" r="85"/></svg>
        <div class="gp-num"><b>0</b><small>of ${total} right</small></div></div>
      <h2>${['Keep going!', 'Good work!', 'Great round!', 'Perfect round!'][stars]}</h2>
      <p class="gp-sub">${esc(R.title)}</p>
      <div class="gp-gain">${gains.map((g, i) => `<span style="animation-delay:${1.3 + i * 0.18}s">${esc(g)}</span>`).join('')}</div>
      <div class="gp-btns">
        ${missed.length ? `<button type="button" class="gp-go gp-wide" onclick="gcPracticeMissed()">Practice the ${missed.length} you missed</button>` : `<button type="button" class="gp-go gp-wide" onclick="gcPracticeAgain()">Another round</button>`}
        <button type="button" class="gp-ghost" onclick="gcPracticeQuit()">Done</button>
      </div>
    </div><canvas class="gp-confetti" id="gpConfetti"></canvas>`;
    const fg = el.querySelector('.gp-big .fg');
    requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = 534 * (1 - right / total); }));
    const num = el.querySelector('.gp-num b'); let n = 0;
    const t = setInterval(() => { num.textContent = n; if (n++ >= right) clearInterval(t); }, 120);
    el.querySelectorAll('.gp-stars span').forEach((s, i) => setTimeout(() => s.classList.add('gp-pop'), 650 + i * 260));
    if (right / total >= 0.7) setTimeout(() => burst(null, true), 800);
  }

  /* ── Confetti ────────────────────────────────────────────────────────── */
  let parts = [], anim = null;
  function burst(fromEl, rain) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.getElementById('gpConfetti'); if (!cv) return;
    const pr = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    cv.width = pr.width * dpr; cv.height = pr.height * dpr;
    const r = fromEl ? fromEl.getBoundingClientRect() : null;
    const sec = getComputedStyle(document.documentElement).getPropertyValue('--secondary-color').trim() || '#1d4ed8';
    const cols = ['#22c55e', '#fbbf24', sec, '#f472b6', '#38bdf8'];
    const n = rain ? 130 : 42;
    for (let i = 0; i < n; i++) {
      const x = rain ? Math.random() * pr.width : r.left - pr.left + r.width / 2;
      const y = rain ? -20 - Math.random() * 220 : r.top - pr.top + r.height / 2;
      const a = rain ? Math.PI / 2 : Math.random() * Math.PI * 2, sp = rain ? 2 + Math.random() * 3 : 4 + Math.random() * 7;
      parts.push({ x, y, vx: Math.cos(a) * sp * (rain ? 0.3 : 1), vy: Math.sin(a) * sp - (rain ? 0 : 4), g: rain ? 0.05 : 0.25, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w: 5 + Math.random() * 5, h: 8 + Math.random() * 6, c: cols[i % cols.length], life: rain ? 260 : 70 });
    }
    if (!anim) loop(cv);
  }
  function loop(cv) {
    const cx = cv.getContext('2d'); const dpr = window.devicePixelRatio || 1;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => p.life-- > 0);
    parts.forEach(p => { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = Math.min(1, p.life / 30); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore(); });
    anim = parts.length && document.body.contains(cv) ? requestAnimationFrame(() => loop(cv)) : (parts = [], null);
  }

  /* ── Entry points ────────────────────────────────────────────────────── */
  function allDoneLids() { return CLASSES.flatMap(c => doneLessons(c).map(l => l.id)); }
  window.gcPracticeMix = () => loadData().then(() => startRound(pick(allDoneLids()), 'Daily Mix', { kind: 'hub' })).catch(() => {});
  window.gcPracticeClass = openClassPractice;
  window.gcPracticeClassMix = key => loadData().then(() => { const c = byKey(key); startRound(pick(doneLessons(c).map(l => l.id)), `${c.name} · Class Mix`, { kind: 'class', key }); });
  window.gcPracticeLesson = (key, lid) => loadData().then(() => startRound(pick([lid]), `${lessonTitle(lid)} · ${byKey(key)?.name || ''}`, { kind: 'class', key }));
  window.gcPracticePick = pickAnswer;
  window.gcPracticeNext = next;
  window.gcPracticeQuit = quit;
  window.gcPracticeMissed = () => { if (!R) return; const m = R.missed.slice(); startRound(shuffle(m), R.title, R.back); };
  window.gcPracticeAgain = () => {
    if (!R) return; const lids = [...new Set(R.items.map(x => x.lid))]; const back = R.back, title = R.title;
    startRound(pick(lids), title, back);
  };
  if (Array.isArray(window.screens)) {} // screens are registered by ensureScreen
})();
