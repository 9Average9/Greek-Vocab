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
          <rect class="gn-shell" x="34" y="84" width="132" height="50" rx="6"/>
          <path class="gn-zig" d="M34 96 L52 122 L70 96 L88 122 L106 96 L124 122 L142 96 L160 122 L166 112"/>
          <rect class="gn-rim" x="30" y="128" width="140" height="9" rx="4"/>
          <ellipse class="gn-head" cx="100" cy="86" rx="70" ry="14"/>
          <ellipse class="gn-rimtop" cx="100" cy="86" rx="70" ry="14"/>
          <!-- Sticks held from above and outside, swinging from the grip so the tips strike the drum head. -->
          <g class="gn-stick gn-stick-l"><line x1="12" y1="18" x2="74" y2="80"/><circle cx="75" cy="81" r="4.5"/></g>
          <g class="gn-stick gn-stick-r"><line x1="188" y1="18" x2="126" y2="80"/><circle cx="125" cy="81" r="4.5"/></g>
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

  // ── One more note: add the app again for the new look ────────────────────
  // A phone keeps a Home Screen app's old name and icon until it's added again.
  // Shown once, in the installed app, to signed-in people whose copy was in use
  // before the rename (index.html marks rhemaInstallEra). The fresh copy they
  // add starts with empty storage, so it never shows this again.
  const RE_KEY = 'guideReinstallV3644';
  const APP_URL = 'https://9average9.github.io/Greek-Vocab/';
  const esc = (t) => String(t || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const installed = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
  const signedIn = () => !!window.Auth?.getCurrentUser?.();
  function needReinstall() {
    if (get(RE_KEY) === '1' || get('rhemaInstallEra') !== 'pre') return false;
    return installed() && signedIn();
  }
  function platform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'other';
  }
  function hasSermonAudio() {
    try { return (JSON.parse(get('rhemaSermonNotes.v1') || '{}').sermons || []).some(x => x.audioSegments?.length); } catch { return false; }
  }
  const READY_KEY = 'guideReinstallCheckV3644';
  let reStep = 0;
  // The exact name that signs in on the new app: the email for accounts that
  // connected one (a username alone won't work for those), else the username.
  function signInName() {
    const info = window.Auth?.getAuthEmailInfo?.() || {};
    if (info.email && !info.isAutoGenerated) return { name: info.email, isEmail: true, noEmail: false };
    const fromEmail = info.email ? String(info.email).split('@')[0] : '';
    return { name: fromEmail || get('authUsername') || '', isEmail: false, noEmail: true };
  }
  function reinstall() {
    if (el) return;
    // Make sure the account has this phone's latest before they move.
    try { window.rhemaDeviceBackupNow?.(); } catch {}
    if (!document.getElementById('gnFont')) {
      const l = document.createElement('link');
      l.id = 'gnFont'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap';
      document.head.appendChild(l);
    }
    el = document.createElement('div');
    el.className = 'gn-overlay gn-re';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Add Rhēma again for the new look');
    el.innerHTML = '<div class="gn-stage gn-slide"></div>';
    document.body.appendChild(el);
    document.body.classList.add('gn-open');
    noteView(true);
  }
  const copyBtn = (text) => `<button type="button" class="gn-re-copy" data-copy="${esc(text)}" onclick="RhemaGuideNews.copyLink(this)"><span class="material-symbols-outlined">content_copy</span>Copy</button>`;
  function noteView(first) {
    const stage = el?.querySelector('.gn-stage');
    if (!stage) return;
    const os = platform();
    const browser = os === 'ios' ? 'Safari' : os === 'android' ? 'Chrome' : 'your browser';
    const addStep = os === 'ios' ? 'Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.'
      : os === 'android' ? 'Tap <b>⋮</b>, then <b>Add to Home screen</b> (or <b>Install app</b>).'
      : 'Add it to your Home Screen from the browser’s menu.';
    const who = signInName();
    const ready = get(READY_KEY) === '1';
    stage.className = 'gn-stage gn-slide' + (first ? '' : ' gn-re-back');
    stage.innerHTML = `
        <div class="gn-guide-wrap"><img class="gn-guide" src="${M}${ready ? 'guide-thumbs' : 'guide-wow'}.webp" alt="" decoding="async"><i class="gn-shadow"></i></div>
        <div class="gn-card">
          <span class="gn-kicker">One more thing!</span>
          <h2 class="gn-title">Add me again for the new look</h2>
          <p class="gn-body">Your phone keeps the old name and icon until you add the app again.</p>
          ${ready
            ? `<div class="gn-re-ready"><span class="material-symbols-outlined">verified_user</span><span><b>Safety check done.</b> You know how to sign in and your things are saved.</span></div>`
            : `<button type="button" class="gn-re-check" onclick="RhemaGuideNews.readyCheck(0)"><span class="material-symbols-outlined">shield</span><span><b>Start with a 1-minute safety check</b><small>Make sure you can sign in before you move</small></span><span class="material-symbols-outlined">chevron_right</span></button>`}
          <ol class="gn-re-steps">
            <li style="--k:0"><span class="gn-re-n">1</span><div>Copy this link and paste it into ${browser}:
              <div class="gn-re-link"><span class="gn-re-url">${APP_URL}</span>${copyBtn(APP_URL)}</div></div></li>
            <li style="--k:1"><span class="gn-re-n">2</span><div>${addStep}</div></li>
            <li style="--k:2"><span class="gn-re-n">3</span><div>Open the new Rhēma and <b>sign in again</b>${who.name ? ` with <b>${esc(who.name)}</b>` : ''}.</div></li>
          </ol>
          <div class="gn-note"><span class="material-symbols-outlined">key</span><p>You’ll need your password to sign in, so make sure you remember it!</p></div>
          <p class="gn-re-after">Your progress, notes and settings come along once you sign in. Keep this old icon until you’re in and see your things; then you can delete it.${hasSermonAudio() ? ' Sermon audio recordings stay in this old copy.' : ''}</p>
        </div>
        <div class="gn-actions gn-re-actions">
          <button type="button" class="gn-go" onclick="RhemaGuideNews.reinstallDone(true)"><span class="material-symbols-outlined">thumb_up</span>Got it!</button>
          <button type="button" class="gn-later" onclick="RhemaGuideNews.reinstallDone(false)">Remind me next time</button>
        </div>`;
    stage.scrollTop = 0;
  }

  // ── Safety check: a short walk-through before moving ────────────────────
  // 1 the exact sign-in name, 2 the password really works (checked against the
  // account, never stored), 3 this phone's things saved to the account,
  // 4 keep the old copy until the new one is signed in.
  const CHECK_STEPS = 4;
  function checkFrame(i, pose, title, body, foot) {
    const stage = el?.querySelector('.gn-stage');
    if (!stage) return null;
    reStep = i;
    stage.className = 'gn-stage gn-slide gn-re-checking';
    stage.innerHTML = `
      <div class="gn-re-prog" aria-label="Step ${i + 1} of ${CHECK_STEPS}">${Array.from({ length: CHECK_STEPS }, (_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="gn-guide-wrap"><img class="gn-guide" src="${M}${pose}.webp" alt="" decoding="async"><i class="gn-shadow"></i></div>
      <div class="gn-card">
        <span class="gn-kicker">Safety check ${i + 1} of ${CHECK_STEPS}</span>
        <h2 class="gn-title">${title}</h2>
        ${body}
      </div>
      <div class="gn-actions gn-re-actions">${foot}</div>`;
    stage.scrollTop = 0;
    return stage;
  }
  const backLink = `<button type="button" class="gn-later" onclick="RhemaGuideNews.readyBack()">Back</button>`;
  function readyCheck(i) {
    if (!el) return;
    if (i === 0) {
      const who = signInName();
      checkFrame(0, 'guide-inspect', 'Your sign-in name',
        `<p class="gn-body">On the new app, sign in with:</p>
         <div class="gn-re-link gn-re-name"><span class="gn-re-url">${esc(who.name || 'your username')}</span>${who.name ? copyBtn(who.name) : ''}</div>
         ${who.isEmail ? `<p class="gn-re-tip"><span class="material-symbols-outlined">info</span><span>Use this <b>email</b>, not your username. Your account signs in with its email.</span></p>` : ''}
         <p class="gn-re-tip"><span class="material-symbols-outlined">photo_camera</span><span>Take a screenshot or write it down so it’s handy.</span></p>
         ${who.noEmail ? `<p class="gn-re-warn"><span class="material-symbols-outlined">warning</span><span>Your account has no email yet, so a forgotten password can’t be reset by email later. Connecting one is a good safety net.</span></p>
         <button type="button" class="gn-re-email" onclick="RhemaGuideNews.connectEmail()">Connect an email</button>` : ''}`,
        `<button type="button" class="gn-go" onclick="RhemaGuideNews.readyCheck(1)">I’ve got it<span class="material-symbols-outlined">arrow_forward</span></button>${backLink}`);
    } else if (i === 1) {
      const who = signInName();
      checkFrame(1, 'guide-think', 'Does your password work?',
        `<p class="gn-body">Type your password to test it. It’s only checked with your account, never saved or shown.</p>
         <form class="gn-re-pw" onsubmit="event.preventDefault(); RhemaGuideNews.testPassword()">
           <input type="text" autocomplete="username" value="${esc(who.name)}" hidden>
           <div class="gn-re-pw-row"><input id="gnRePw" type="password" autocomplete="current-password" placeholder="Your password" aria-label="Your password">
             <button type="button" class="gn-re-eye" aria-label="Show password" onclick="const i=document.getElementById('gnRePw'); i.type = i.type === 'password' ? 'text' : 'password'; this.firstElementChild.textContent = i.type === 'password' ? 'visibility' : 'visibility_off';"><span class="material-symbols-outlined">visibility</span></button></div>
           <button type="submit" class="gn-re-test">Test my password</button>
         </form>
         <div class="gn-re-result" id="gnReResult" aria-live="polite"></div>`,
        `<button type="button" class="gn-go" id="gnReNext" disabled onclick="RhemaGuideNews.readyCheck(2)">Next<span class="material-symbols-outlined">arrow_forward</span></button>${backLink}`);
    } else if (i === 2) {
      checkFrame(2, 'guide-inspect', 'Saving your things',
        `<div class="gn-re-result" id="gnReResult" aria-live="polite"><div class="gn-re-busy"><span class="gn-re-spin"></span>Saving this phone’s things to your account…</div></div>`,
        `<button type="button" class="gn-go" id="gnReNext" disabled onclick="RhemaGuideNews.readyCheck(3)">Next<span class="material-symbols-outlined">arrow_forward</span></button>${backLink}`);
      saveNow();
    } else if (i === 3) {
      checkFrame(3, 'guide-thumbs', 'Keep this copy until you’re in',
        `<p class="gn-body">Don’t delete the old icon yet. Add the new one, sign in, and check that your things are there. Then you can delete the old one.</p>
         <p class="gn-re-tip"><span class="material-symbols-outlined">health_and_safety</span><span>If anything goes wrong, this copy still works just like before.</span></p>`,
        `<button type="button" class="gn-go" onclick="RhemaGuideNews.readyDone()"><span class="material-symbols-outlined">verified_user</span>I’m ready!</button>${backLink}`);
    }
  }
  function readyBack() { if (reStep > 0) readyCheck(reStep - 1); else noteView(false); }
  function readyDone() {
    try { localStorage.setItem(READY_KEY, '1'); } catch {}
    noteView(false);
  }
  let testing = false;
  async function testPassword() {
    if (testing) return;
    const input = document.getElementById('gnRePw'), out = document.getElementById('gnReResult'), next = document.getElementById('gnReNext');
    const pw = input?.value || '';
    if (!out) return;
    if (!pw) { out.innerHTML = '<p class="gn-re-bad">Type your password first.</p>'; input?.focus(); return; }
    testing = true;
    out.innerHTML = '<div class="gn-re-busy"><span class="gn-re-spin"></span>Checking…</div>';
    let ok = null;
    try { ok = await window.Auth?.verifyPassword?.(pw); } catch (e) { ok = e?.code === 'auth/too-many-requests' ? 'many' : 'offline'; }
    testing = false;
    if (!el || reStep !== 1) return;
    const who = signInName();
    if (ok === true) {
      if (input) input.value = '';
      out.innerHTML = `<p class="gn-re-good"><span class="material-symbols-outlined">check_circle</span><span><b>That’s it!</b> This password will sign you in on the new app.</span></p>`;
      if (next) next.disabled = false;
    } else if (ok === 'offline' || ok === 'many') {
      out.innerHTML = `<p class="gn-re-bad"><span class="material-symbols-outlined">wifi_off</span><span>${ok === 'many' ? 'Too many tries for now. Wait a few minutes, then test it again.' : 'Couldn’t check right now. Make sure you’re online, then test it again.'}</span></p>`;
    } else {
      out.innerHTML = `<p class="gn-re-bad"><span class="material-symbols-outlined">error</span><span><b>That’s not it.</b> Try again.</span></p>
        <p class="gn-re-tip"><span class="material-symbols-outlined">key</span><span>Don’t remember it? Since you’re signed in here, you can set a new one. You don’t need the old one.</span></p>
        <button type="button" class="gn-re-email" onclick="RhemaGuideNews.newPassword()">Set a new password</button>`;
    }
  }
  // Opens the app's "Set a new password" dialog over this screen; once it's
  // saved (the app signs back in with it, so it's proven to work) this step passes.
  function newPassword() {
    if (typeof window.openSetPasswordModal !== 'function') return;
    window.openSetPasswordModal('safety');
  }
  window.addEventListener('rhema:password-set', () => {
    if (!el || reStep !== 1) return;
    const out = document.getElementById('gnReResult'), next = document.getElementById('gnReNext');
    if (out) out.innerHTML = `<p class="gn-re-good"><span class="material-symbols-outlined">check_circle</span><span><b>New password saved.</b> It works, and it’s the one you’ll sign in with on the new app.</span></p>`;
    if (next) next.disabled = false;
  });
  async function sendReset(btn) {
    const who = signInName();
    if (!who.isEmail || !btn) return;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await window.Auth.sendPasswordReset(who.name);
      btn.outerHTML = `<p class="gn-re-good"><span class="material-symbols-outlined">mark_email_read</span><span>Sent! Open the email, set a new password, then test it here.</span></p>`;
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Email me a reset link';
      const out = document.getElementById('gnReResult');
      out?.insertAdjacentHTML('beforeend', `<p class="gn-re-bad"><span class="material-symbols-outlined">error</span><span>Couldn’t send it right now. Make sure you’re online and try again.</span></p>`);
    }
  }
  async function saveNow() {
    let ok = false;
    try { ok = await (window.rhemaDeviceBackupNow?.() ?? Promise.resolve(false)); } catch {}
    const out = document.getElementById('gnReResult'), next = document.getElementById('gnReNext');
    if (!el || reStep !== 2 || !out) return;
    if (ok) {
      out.innerHTML = `<p class="gn-re-good"><span class="material-symbols-outlined">cloud_done</span><span><b>Saved to your account.</b></span></p>
        <ul class="gn-re-saved">
          <li><span class="material-symbols-outlined">check</span>Lessons, XP, streak and known words</li>
          <li><span class="material-symbols-outlined">check</span>Highlights, notes and reading plans</li>
          <li><span class="material-symbols-outlined">check</span>Word Log, Workspace and Trails</li>
          <li><span class="material-symbols-outlined">check</span>Your reading spot, settings, sermon notes and quiz history</li>
        </ul>`;
      if (next) next.disabled = false;
    } else {
      out.innerHTML = `<p class="gn-re-bad"><span class="material-symbols-outlined">cloud_off</span><span>Couldn’t save right now. Make sure you’re online, then try again.</span></p>
        <button type="button" class="gn-re-email" onclick="RhemaGuideNews.readyCheck(2)">Try again</button>`;
    }
  }
  function copyLink(btn) {
    const done = () => {
      if (!btn) return;
      btn.classList.add('ok');
      btn.innerHTML = '<span class="material-symbols-outlined">check</span>Copied!';
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove('ok'); btn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>Copy'; } }, 2200);
    };
    const text = btn?.dataset?.copy || APP_URL;
    const url = btn?.parentElement?.querySelector('.gn-re-url');
    const fallback = () => {
      try {
        const r = document.createRange(); r.selectNodeContents(url);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        if (document.execCommand('copy')) done();
      } catch {}
    };
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    } catch { fallback(); }
  }
  // seen: true marks it done for good; false shows it again next time.
  function reinstallDone(seen) {
    if (seen) { try { localStorage.setItem(RE_KEY, '1'); } catch {} }
    if (!el) return;
    const node = el;
    node.classList.add('gn-closing');
    el = null;
    setTimeout(() => { node.remove(); document.body.classList.remove('gn-open'); }, reduced() ? 50 : 420);
  }
  // Opens "Connect your email" on top of this screen, so they come straight
  // back to the safety check when it's closed.
  function connectEmail() {
    try { window.openConnectEmailModal?.(); } catch {}
    document.getElementById('connectEmailModal')?.classList.add('over-guide');
  }

  // ── When to show it ──────────────────────────────────────────────────────
  function clearToShow() {
    if (document.hidden || window.__devBackupLoading) return false;
    if (typeof _appLaunchReleased === 'undefined' || !_appLaunchReleased) return false;
    const launch = document.getElementById('appLaunchScreen');
    if (launch && !launch.classList.contains('hidden')) return false;
    if (document.getElementById('authModal')?.classList.contains('open')) return false;
    if (document.getElementById('installAppModal')?.classList.contains('open')) return false;
    if (document.getElementById('notifPromptModal')?.classList.contains('open')) return false;
    if (document.getElementById('appCoachOverlay')?.classList.contains('hidden') === false) return false;
    return true;
  }
  // Big news first (if not seen yet), then the note about adding the app again.
  // Both wait until nothing else is on screen; a closed app picks up next time.
  let tries = 0, ready = 0, ticking = false;
  function tick() {
    ticking = false;
    const wantNews = !seen(), wantRe = get(RE_KEY) !== '1' && get('rhemaInstallEra') === 'pre' && installed();
    if (!wantNews && !wantRe) return;
    if (!el && clearToShow() && !document.querySelector('.ch-overlay, .modal-overlay.open, .modal.open')) {
      if (++ready >= 3) {
        ready = 0;
        if (wantNews) show();
        else if (needReinstall()) reinstall();
      }
    } else ready = 0;
    if (++tries < 900) { ticking = true; setTimeout(tick, 400); }
  }
  function boot() {
    if (window.top !== window || document.documentElement.classList.contains('mv-embed')) return;
    if (!ticking) { ticking = true; setTimeout(tick, 1200); }
  }

  window.RhemaGuideNews = { next, finish, show, reinstall, copyLink, reinstallDone, connectEmail,
    readyCheck, readyBack, readyDone, testPassword, sendReset, newPassword,
    _reset: () => { try { localStorage.removeItem(KEY); localStorage.removeItem(RE_KEY); } catch {} } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
