// ── The guide's big news ─────────────────────────────────────────────────────
// A one-time, can't-skip show the guide puts on the next time each user opens
// the app (new or returning), with a note from Josh, the developer: a few quick slides on what's new, then a drum roll for
// the headline feature, Challenge My Theology. Short on purpose (~20 seconds).
// Finishing it (either button on the last screen) marks it seen; closing the
// app midway shows it again next time.
(function () {
  'use strict';
  const KEY = 'guideBigNewsV3627';
  const M = 'assets/mascot/';
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const seen = () => get(KEY) === '1';
  const markSeen = () => { try { localStorage.setItem(KEY, '1'); } catch {} };

  const SLIDES = [
    { pose: 'guide-wow', kicker: 'Psst… big news!', title: 'Hi! I’m your Rhēma guide',
      body: 'I give the tours now, so tap me whenever you need a hand. And Rhēma just got a <b>lot</b> of new stuff. This takes 20 seconds!',
      note: 'Hey, it’s Josh, the developer! These are big updates, so please give them a little attention, <u>especially the last one</u>.',
      btn: 'Show me!' },
    { pose: 'guide-inspect', kicker: 'New #1', title: 'Word sheets, rebuilt',
      body: 'Tap any Greek or Hebrew word. Its page is now calm cards:',
      chips: [['translate', 'Across translations, in 4 looks'], ['format_list_bulleted', 'Every meaning, with verses'], ['travel_explore', 'Occurrences with the original words'], ['bookmark', 'One Save → your Word Log']] },
    { pose: 'guide-thumbs', kicker: 'New #2', title: 'Study faster',
      chips: [['visibility', 'At a glance: a whole chapter in one look'], ['hub', 'Cross references that say why they connect'], ['manage_search', 'Search the Greek and Hebrew by form']] },
    { pose: 'guide-cheer', kicker: 'New #3', title: 'Read together',
      chips: [['view_quilt', 'Multi-view: up to 6 Bibles side by side'], ['group', 'Reading plans with friends']] },
  ];

  let el = null, idx = 0, timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  // ── Sound: a synthesized snare roll + crash (started from a tap) ─────────
  let ac = null, noise = null, master = null;
  function audio() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.45;
        master.connect(ac.destination);
        noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch { return null; }
  }
  function hit(t, vol, dur, freq, q = 0.9) {
    const s = ac.createBufferSource(); s.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function boom(t) {
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.75);
  }
  function drumRoll(sec) {
    if (!audio()) return;
    const t0 = ac.currentTime + 0.05;
    let t = t0, i = 0;
    while (t < t0 + sec) {
      const p = (t - t0) / sec;
      hit(t, 0.08 + 0.32 * p * p, 0.06, i % 2 ? 2100 : 1700);
      t += 0.07 - 0.03 * p;
      i++;
    }
    const tc = t0 + sec;
    boom(tc);
    hit(tc, 0.7, 0.25, 900, 0.6);
    hit(tc, 0.5, 1.8, 6500, 0.5);
    hit(tc + 0.02, 0.35, 1.4, 9000, 0.4);
  }
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch {} };

  // ── Confetti ─────────────────────────────────────────────────────────────
  function confetti(n) {
    const cv = el?.querySelector('.gn-confetti');
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
    const css = getComputedStyle(document.body);
    const cols = ['--secondary-color', '--accent-color', '--primary-light', '--primary-color']
      .map(v => css.getPropertyValue(v).trim()).filter(Boolean).concat(['#f5c542', '#ffffff', '#ffd98a']);
    const parts = Array.from({ length: n }, (_, i) => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.2, y: H * 0.42,
      vx: (Math.random() - 0.5) * 26 * dpr, vy: (-10 - Math.random() * 18) * dpr,
      w: (6 + Math.random() * 7) * dpr, h: (9 + Math.random() * 9) * dpr,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5, c: cols[i % cols.length], star: i % 7 === 0
    }));
    const ctx = cv.getContext('2d');
    const start = performance.now();
    (function frame(now) {
      if (!el || !cv.isConnected) return;
      const age = now - start;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.55 * dpr; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - age / 3600);
        ctx.fillStyle = p.c;
        if (p.star) { ctx.font = `${p.h * 1.6}px serif`; ctx.fillText('✦', -p.h / 2, p.h / 2); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 2);
        ctx.restore();
      }
      if (age < 3700) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(start);
  }

  // ── Screens ──────────────────────────────────────────────────────────────
  const dots = (on) => `<div class="gn-dots">${SLIDES.map((_, i) => `<i class="${i === on ? 'on' : i < on ? 'done' : ''}"></i>`).join('')}<i class="gn-dot-star${on >= SLIDES.length ? ' on' : ''}">★</i></div>`;
  function slide(i) {
    const s = SLIDES[i];
    const stage = el.querySelector('.gn-stage');
    stage.className = 'gn-stage gn-slide';
    stage.innerHTML = `
      ${dots(i)}
      <div class="gn-guide-wrap"><img class="gn-guide" src="${M}${s.pose}.webp" alt="" decoding="async"><i class="gn-shadow"></i></div>
      <div class="gn-card">
        <span class="gn-kicker">${s.kicker}</span>
        <h2 class="gn-title">${s.title}</h2>
        ${s.body ? `<p class="gn-body">${s.body}</p>` : ''}
        ${s.note ? `<div class="gn-note"><span class="material-symbols-outlined">push_pin</span><p>${s.note}</p><span class="gn-sig">— Josh</span></div>` : ''}
        ${s.chips ? `<ul class="gn-chips">${s.chips.map(([ic, t], k) => `<li style="--k:${k}"><span class="material-symbols-outlined">${ic}</span>${t}</li>`).join('')}</ul>` : ''}
      </div>
      <button type="button" class="gn-next" disabled onclick="RhemaGuideNews.next()">${s.btn || 'Next'}<span class="material-symbols-outlined">arrow_forward</span></button>`;
    // A short beat so the animation lands before the button wakes up.
    later(() => stage.querySelector('.gn-next')?.removeAttribute('disabled'), reduced() ? 150 : 650);
  }
  function drum() {
    const stage = el.querySelector('.gn-stage');
    stage.className = 'gn-stage gn-drum';
    stage.innerHTML = `
      ${dots(SLIDES.length)}
      <div class="gn-beams" aria-hidden="true"><i></i><i></i></div>
      <p class="gn-drum-a">And last but not least…</p>
      <p class="gn-drum-b">the most exciting new feature…</p>
      <div class="gn-drumkit" aria-hidden="true">
        <svg viewBox="0 0 200 150" class="gn-snare">
          <g class="gn-stick gn-stick-l"><rect x="20" y="8" width="8" height="78" rx="4" transform="rotate(-38 24 86)"/><circle cx="24" cy="10" r="6" transform="rotate(-38 24 86)"/></g>
          <g class="gn-stick gn-stick-r"><rect x="172" y="8" width="8" height="78" rx="4" transform="rotate(38 176 86)"/><circle cx="176" cy="10" r="6" transform="rotate(38 176 86)"/></g>
          <rect class="gn-shell" x="34" y="84" width="132" height="50" rx="6"/>
          <path class="gn-zig" d="M34 96 L52 122 L70 96 L88 122 L106 96 L124 122 L142 96 L160 122 L166 112"/>
          <rect class="gn-rim" x="30" y="128" width="140" height="9" rx="4"/>
          <ellipse class="gn-head" cx="100" cy="86" rx="70" ry="14"/>
          <ellipse class="gn-rimtop" cx="100" cy="86" rx="70" ry="14"/>
        </svg>
        <span class="gn-drr">drrrrrrrr</span>
      </div>`;
    const roll = reduced() ? 1.4 : 2.6;
    drumRoll(roll);
    buzz([30, 40, 30, 40, 30, 40, 30, 40, 30, 40, 30, 40, 30, 40, 30, 40, 400]);
    later(() => stage.classList.add('gn-b-in'), 900);
    if (!reduced()) {
      later(() => el.classList.add('gn-shake1'), 300);
      later(() => { el.classList.remove('gn-shake1'); el.classList.add('gn-shake2'); }, 1500);
      later(() => { el.classList.remove('gn-shake2'); el.classList.add('gn-shake3'); }, 2200);
    }
    later(reveal, roll * 1000 + 50);
  }
  function reveal() {
    el.classList.remove('gn-shake1', 'gn-shake2', 'gn-shake3');
    el.classList.add('gn-flash');
    later(() => el.classList.remove('gn-flash'), 700);
    const stage = el.querySelector('.gn-stage');
    stage.className = 'gn-stage gn-reveal';
    const words = ['Challenge', 'My', 'Theology'];
    stage.innerHTML = `
      ${dots(SLIDES.length)}
      <div class="gn-rays" aria-hidden="true"></div>
      <div class="gn-hero">
        <img class="gn-skeptic" src="${M}guide-skeptic.webp" alt="" decoding="async">
        <img class="gn-books ch-books-img" src="assets/icons/challenge-books.webp" alt="" decoding="async">
      </div>
      <h1 class="gn-big">${words.map((w, i) => `<span style="--i:${i}">${w}</span>`).join(' ')}</h1>
      <p class="gn-why">I’ll hand you a <b>real claim</b> another group makes from the Bible, with its passage and sources. Your job: open the Scripture, see <b>why you believe what you do</b>, and find <b>what’s wrong with the claim</b>.</p>
      <ol class="gn-steps">
        <li style="--k:0"><span class="material-symbols-outlined">campaign</span>Get a claim</li>
        <li style="--k:1"><span class="material-symbols-outlined">menu_book</span>Dig into the passage</li>
        <li style="--k:2"><span class="material-symbols-outlined">verified</span>Know why you believe</li>
      </ol>
      <p class="gn-find">Find it anytime: <b>tap me</b> → Challenge My Theology</p>
      <div class="gn-actions">
        <button type="button" class="gn-go" onclick="RhemaGuideNews.finish(true)"><span class="material-symbols-outlined">bolt</span>Challenge me now!</button>
        <button type="button" class="gn-later" onclick="RhemaGuideNews.finish(false)">I’ll try it later</button>
      </div>`;
    confetti(reduced() ? 40 : 150);
    later(() => confetti(reduced() ? 0 : 70), 900);
  }

  function next() {
    const btn = el?.querySelector('.gn-next');
    if (!el || (btn && btn.disabled)) return;
    if (idx === SLIDES.length - 1) audio(); // unlock sound inside the tap
    idx++;
    const stage = el.querySelector('.gn-stage');
    stage.classList.add('gn-out');
    later(() => (idx < SLIDES.length ? slide(idx) : drum()), reduced() ? 60 : 260);
  }
  function finish(go) {
    markSeen();
    clearTimers();
    if (!el) return;
    const node = el;
    node.classList.add('gn-closing');
    setTimeout(() => {
      node.remove();
      document.body.classList.remove('gn-open');
      if (go && window.RhemaChallenge) RhemaChallenge.picker();
    }, reduced() ? 50 : 420);
    el = null;
    try { if (ac && ac.state === 'running') setTimeout(() => ac.suspend().catch(() => {}), 2500); } catch {}
  }
  function show() {
    if (el) return;
    idx = 0;
    if (!document.getElementById('gnFont')) {
      const l = document.createElement('link');
      l.id = 'gnFont'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap';
      document.head.appendChild(l);
    }
    el = document.createElement('div');
    el.className = 'gn-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'What’s new in Rhēma');
    el.innerHTML = `<canvas class="gn-confetti" aria-hidden="true"></canvas>
      <div class="gn-curtain gn-curtain-l" aria-hidden="true"></div><div class="gn-curtain gn-curtain-r" aria-hidden="true"></div>
      <div class="gn-valance" aria-hidden="true"></div>
      <div class="gn-stage"></div>
      <div class="gn-flashlayer" aria-hidden="true"></div>`;
    document.body.appendChild(el);
    document.body.classList.add('gn-open');
    slide(0);
    requestAnimationFrame(() => requestAnimationFrame(() => el && el.classList.add('gn-open-curtains')));
  }

  // ── When to show it ──────────────────────────────────────────────────────
  function clearToShow() {
    if (document.hidden) return false;
    if (typeof _appLaunchReleased === 'undefined' || !_appLaunchReleased) return false;
    const launch = document.getElementById('appLaunchScreen');
    if (launch && !launch.classList.contains('hidden')) return false;
    if (document.getElementById('authModal')?.classList.contains('open')) return false;
    if (document.getElementById('installAppModal')?.classList.contains('open')) return false;
    if (document.getElementById('notifPromptModal')?.classList.contains('open')) return false;
    if (document.getElementById('appCoachOverlay')?.classList.contains('hidden') === false) return false;
    return true;
  }
  function boot() {
    if (window.top !== window || document.documentElement.classList.contains('mv-embed')) return;
    if (seen()) return;
    let tries = 0, ready = 0;
    const tick = () => {
      if (seen() || el) return;
      if (clearToShow()) { if (++ready >= 3) return show(); } else ready = 0;
      if (++tries < 600) setTimeout(tick, 400);
    };
    setTimeout(tick, 1200);
  }

  window.RhemaGuideNews = { next, finish, show, _reset: () => { try { localStorage.removeItem(KEY); } catch {} } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
