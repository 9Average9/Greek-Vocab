// Across translations — four looks at the same numbers.
//
// The word study's "Across translations" (Greek and Hebrew) counts how a
// version renders a word everywhere it appears. This draws those counts four
// ways, and a cycle button morphs one look into the next:
//   ring     — a donut: the main rendering's share in the middle (default)
//   bubbles  — every rendering as a bubble sized by how often it's used
//   stripes  — one stacked bar per counted version, to compare Bibles
//   tree     — the original word branching to its English renderings
// Tap any slice / bubble / stripe / branch for the verses behind it. The look
// is remembered per device. The data never changes between looks.
(function () {
  'use strict';
  const LOOKS = ['ring', 'bubbles', 'stripes', 'tree'];
  const NAMES = { ring: 'Ring', bubbles: 'Bubbles', stripes: 'Stripes', tree: 'Tree' };
  const ICONS = { ring: 'donut_large', bubbles: 'bubble_chart', stripes: 'stacked_bar_chart', tree: 'account_tree' };
  const LOOK_KEY = 'rhemaXlLook';
  const states = new Map(); // key -> { host, data, sel, all }
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const jsq = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  function look() {
    try { const v = localStorage.getItem(LOOK_KEY); if (LOOKS.includes(v)) return v; } catch (e) {}
    return 'ring';
  }
  function setLook(v) { try { localStorage.setItem(LOOK_KEY, v); } catch (e) {} }
  const pct = (n, d) => Math.round(100 * n / Math.max(1, d));

  // data: { key, word, ver, covered, renderings:[{text,count,refs,forms}],
  //         compare:[{ver, covered, renderings}], refChip(ref)→html, note }
  function topWithOther(rs, n) {
    const top = rs.slice(0, n);
    const rest = rs.slice(n);
    const other = rest.reduce((a, r) => a + r.count, 0);
    return { top, rest, other };
  }

  function ringHtml(d) {
    const { top, other } = topWithOther(d.renderings, 4);
    const parts = top.map((r, i) => ({ label: r.text, count: r.count, i, idx: i }));
    if (other) parts.push({ label: 'other words', count: other, i: 4, idx: 'other' });
    let off = 25;
    const gap = parts.length > 1 ? 1.1 : 0;
    const arcs = parts.map(p => {
      const share = 100 * p.count / Math.max(1, d.covered);
      const len = Math.max(0.6, share - gap);
      const s = `<circle class="xlv-arc xlv-c${p.i}${String(sel(d.key)) === String(p.idx) ? ' on' : ''}" cx="21" cy="21" r="15.915" pathLength="100" stroke-dasharray="${len} ${100 - len}" stroke-dashoffset="${off}" onclick="RhemaXlViews.pick('${jsq(d.key)}','${p.idx}')"><title>${esc(p.label)}: ${p.count}×</title></circle>`;
      off -= share;
      return s;
    }).join('');
    const t = d.renderings[0];
    return `<div class="xlv-ring">
      <svg viewBox="0 0 42 42" class="xlv-donut" role="img" aria-label="Share of each rendering">
        <circle class="xlv-track" cx="21" cy="21" r="15.915"/>${arcs}
        ${t ? `<text x="21" y="20.6" text-anchor="middle" class="xlv-big">${pct(t.count, d.covered)}%</text>
        <text x="21" y="26" text-anchor="middle" class="xlv-small">“${esc(t.text.length > 14 ? t.text.slice(0, 13) + '…' : t.text)}”</text>` : ''}
      </svg>
      <div class="xlv-legend">${parts.map(p => `<button type="button" class="${String(sel(d.key)) === String(p.idx) ? 'on' : ''}" onclick="RhemaXlViews.pick('${jsq(d.key)}','${p.idx}')"><i class="xlv-c${p.i}"></i><b>${esc(p.label)}</b><span>${p.count}×</span></button>`).join('')}</div>
    </div>`;
  }

  function bubblesHtml(d) {
    const rs = d.renderings.slice(0, 14);
    const max = rs[0]?.count || 1;
    // Biggest in the middle: order alternates around the center.
    const order = [];
    rs.forEach((r, i) => (i % 2 ? order.push({ r, i }) : order.unshift({ r, i })));
    return `<div class="xlv-cloud">${order.map(({ r, i }, n) => {
      const k = Math.sqrt(r.count / max);
      const size = 12.5 + k * 22;
      const strength = Math.round(14 + 72 * k);
      return `<button type="button" class="xlv-bub${String(sel(d.key)) === String(i) ? ' on' : ''}" style="font-size:${size.toFixed(1)}px;--k:${strength}%;--d:${n * 45}ms" data-dark="${strength > 46 ? 1 : 0}" onclick="RhemaXlViews.pick('${jsq(d.key)}','${i}')">${esc(r.text)}<small>${r.count}</small></button>`;
    }).join('')}</div>`;
  }

  function stripesHtml(d) {
    const rows = [{ ver: d.ver, covered: d.covered, renderings: d.renderings }, ...(d.compare || [])];
    // Segments follow THIS version's top three renderings, then "other words".
    const keys = d.renderings.slice(0, 3).map(r => r.text.toLowerCase());
    const segFor = (row) => {
      const vals = keys.map(k => row.renderings.filter(r => r.text.toLowerCase() === k).reduce((a, r) => a + r.count, 0));
      const other = Math.max(0, row.covered - vals.reduce((a, b) => a + b, 0));
      return [...vals, other];
    };
    const labels = [...d.renderings.slice(0, 3).map(r => r.text), 'other words'];
    const bars = rows.map((row, ri) => {
      const seg = segFor(row);
      return `<div class="xlv-srow${ri === 0 ? ' main' : ''}">
        <div class="xlv-slabel"><b>${esc(row.ver)}</b><span>${row.covered.toLocaleString()} uses</span></div>
        <div class="xlv-stripe">${seg.map((c, i) => c ? `<button type="button" class="xlv-seg xlv-c${i === 3 ? 4 : i}" style="flex:${c};--d:${ri * 120 + i * 60}ms" onclick="RhemaXlViews.pick('${jsq(d.key)}','${i === 3 ? 'other' : i}')" title="${esc(labels[i])}: ${c}×">${c / Math.max(1, row.covered) >= 0.1 ? pct(c, row.covered) + '%' : ''}</button>` : '').join('')}</div>
      </div>`;
    }).join('');
    let diff = '';
    if (rows.length >= 2 && d.renderings[0]) {
      const a = rows[0], b = rows[1];
      const k = d.renderings[0].text.toLowerCase();
      const pa = pct(a.renderings.filter(r => r.text.toLowerCase() === k).reduce((x, r) => x + r.count, 0), a.covered);
      const pb = pct(b.renderings.filter(r => r.text.toLowerCase() === k).reduce((x, r) => x + r.count, 0), b.covered);
      const onlyB = b.renderings.filter(r => !a.renderings.some(x => x.text.toLowerCase() === r.text.toLowerCase())).slice(0, 3).map(r => `“${esc(r.text)}”`);
      diff = `<div class="xlv-diff"><b>What’s different:</b> ${pa === pb ? `both use “${esc(d.renderings[0].text)}” ${pa}% of the time` : `${esc(a.ver)} uses “${esc(d.renderings[0].text)}” ${pa}% of the time, ${esc(b.ver)} ${pb}%`}${onlyB.length ? `; only ${esc(b.ver)} uses ${onlyB.join(', ')}` : ''}.</div>`;
    } else {
      diff = `<p class="xlv-hint">Pick another version above to compare it here.</p>`;
    }
    return `<div class="xlv-stripes">${bars}
      <div class="xlv-key">${labels.map((l, i) => `<span><i class="xlv-c${i === 3 ? 4 : i}"></i>${esc(l)}</span>`).join('')}</div>${diff}</div>`;
  }

  function treeHtml(d) {
    const rs = d.renderings.slice(0, 7);
    const max = rs[0]?.count || 1;
    const W = 340, H = Math.max(170, rs.length * 40 + 14), cx = 78, cy = H / 2, x1 = 172;
    const step = (H - 14) / Math.max(1, rs.length);
    const word = String(d.word || '');
    let s = '';
    rs.forEach((r, i) => {
      const y = 7 + step * (i + 0.5);
      const w = Math.max(1.6, (r.count / max) * 15);
      s += `<path class="xlv-branch" style="--d:${i * 70}ms" d="M${cx + 30},${cy} C${cx + 80},${cy} ${x1 - 60},${y} ${x1},${y}" stroke-width="${w.toFixed(1)}" stroke-opacity="${(0.28 + 0.6 * r.count / max).toFixed(2)}"/>`;
    });
    const leaves = rs.map((r, i) => {
      const y = 7 + step * (i + 0.5);
      return `<button type="button" class="xlv-leaf${i === 0 ? ' top' : ''}${String(sel(d.key)) === String(i) ? ' on' : ''}" style="top:${((y - 14) / H * 100).toFixed(2)}%;--d:${150 + i * 70}ms" onclick="RhemaXlViews.pick('${jsq(d.key)}','${i}')"><b>${esc(r.text)}</b><span>${r.count}</span></button>`;
    }).join('');
    return `<div class="xlv-tree" style="height:${H}px">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${s}</svg>
      <div class="xlv-root" style="top:${((cy - 34) / H * 100).toFixed(2)}%"><b>${esc(word)}</b><span>${d.total.toLocaleString()} uses</span></div>
      <div class="xlv-leaves" style="left:${(x1 / W * 100).toFixed(2)}%">${leaves}</div>
    </div>`;
  }

  function sel(key) { return states.get(key)?.sel ?? ''; }
  // Every rendering is a row that opens to its verses (one open at a time):
  // the verse in the chosen version with the word in bold, tap to read it.
  function markIn(text, phrase) {
    const t = String(text || '');
    const p = String(phrase || '').trim();
    if (!t) return '';
    const i = p ? t.toLowerCase().indexOf(p.toLowerCase()) : -1;
    return i < 0 ? esc(t) : `${esc(t.slice(0, i))}<b>${esc(t.slice(i, i + p.length))}</b>${esc(t.slice(i + p.length))}`;
  }
  function verseRows(d, st, r) {
    const all = st.all.has(r.text);
    const shown = all ? r.refs : r.refs.slice(0, 25);
    const rows = shown.map(x => {
      const chip = d.refChip(x);
      const text = typeof d.verseText === 'function' ? d.verseText(x) : '';
      return text
        ? `<div class="xlv-vrow" onclick="this.querySelector('.ws-ref,button')?.click()">${chip}<span class="xlv-vtext">${markIn(text, r.text)}</span></div>`
        : `<div class="xlv-vrow xlv-vrow-chip">${chip}</div>`;
    }).join('');
    return `${r.forms && r.forms.length ? `<div class="xlv-forms">${r.forms.slice(0, 4).map(([f, c]) => `${esc(f)} ${c}`).join(' · ')}</div>` : ''}${rows}${shown.length < r.refs.length ? `<button type="button" class="xlv-all" onclick="RhemaXlViews.all('${jsq(d.key)}','${jsq(r.text)}')">Show all ${r.refs.length} verses</button>` : ''}`;
  }
  function versesHtml(d, st) {
    const open = String(st.sel ?? '');
    const list = d.renderings.map((r, i) => {
      const on = open === String(i);
      return `<div class="xlv-acc-row${on ? ' open' : ''}">
        <button type="button" class="xlv-acc-h" aria-expanded="${on}" onclick="RhemaXlViews.pick('${jsq(d.key)}','${on ? '' : i}')">
          <i class="xlv-c${Math.min(i, 4)}"></i><b>“${esc(r.text)}”</b><span>${r.count}× · ${pct(r.count, d.covered)}%</span><span class="material-symbols-outlined">expand_more</span></button>
        ${on ? `<div class="xlv-acc-b">${verseRows(d, st, r)}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="xlv-verses"><div class="xlv-vh">Every verse, by how ${esc(d.ver || 'this version')} words it</div>${list}</div>`;
  }

  function chartHtml(d, lk) {
    return lk === 'bubbles' ? bubblesHtml(d) : lk === 'stripes' ? stripesHtml(d) : lk === 'tree' ? treeHtml(d) : ringHtml(d);
  }
  function draw(key, opts = {}) {
    const st = states.get(key);
    if (!st || !document.body.contains(st.host)) { states.delete(key); return; }
    const d = st.data, lk = st.look;
    const i = LOOKS.indexOf(lk);
    const next = LOOKS[(i + 1) % LOOKS.length];
    st.host.innerHTML = `<div class="xlv" data-look="${lk}">
      <div class="xlv-bar">
        <span class="xlv-same"><span class="material-symbols-outlined">${ICONS[lk]}</span>${NAMES[lk]} <small>· same data, ${i + 1} of ${LOOKS.length} looks</small></span>
        <button type="button" class="xlv-cycle" onclick="RhemaXlViews.cycle('${jsq(key)}')" aria-label="Show this as ${NAMES[next]} (same data)" title="Same data as ${NAMES[next]}"><span class="material-symbols-outlined">autorenew</span></button>
      </div>
      <div class="xlv-chart${opts.enter ? ' xlv-enter' : ''}">${chartHtml(d, lk)}</div>
      ${versesHtml(d, st)}
    </div>`;
  }

  // Draw (or redraw) a card. Keeps the user's selected slice when the same
  // word/version is redrawn.
  function render(host, data) {
    if (!host || !data) return;
    const prev = states.get(data.key);
    const st = { host, data, look: look(), sel: prev && prev.data.ver === data.ver ? prev.sel : '', all: prev && prev.data.ver === data.ver ? prev.all : new Set() };
    states.set(data.key, st);
    draw(data.key);
    watchForCoach(data.key, host);
  }
  // First time a chart is really on screen: the guide shows the cycle button.
  const COACH_KEY = 'xlLooksCoachSeenV1';
  const coachSeen = () => { try { return localStorage.getItem(COACH_KEY) === '1'; } catch (e) { return true; } };
  let coachIO = null;
  function watchForCoach(key, host) {
    if (coachSeen() || typeof window.startXlLooksCoach !== 'function' || !('IntersectionObserver' in window)) return;
    coachIO?.disconnect();
    let t = 0;
    coachIO = new IntersectionObserver((entries) => {
      const e = entries[0];
      clearTimeout(t);
      if (!e || e.intersectionRatio < 0.6) return;
      t = setTimeout(() => {
        if (coachSeen() || !document.body.contains(host)) return;
        coachIO?.disconnect();
        window.startXlLooksCoach(key);
      }, 700);
    }, { threshold: [0, 0.6, 1] });
    coachIO.observe(host);
  }
  // The fun part: the current look folds away and the next one springs in.
  function cycle(key, opts = {}) {
    const st = states.get(key);
    if (!st) return;
    // Found it on their own: no need for the guide to show it.
    if (!opts.fromCoach) { try { localStorage.setItem(COACH_KEY, '1'); } catch (e) {} coachIO?.disconnect(); }
    const chart = st.host.querySelector('.xlv-chart');
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const go = () => {
      st.look = LOOKS[(LOOKS.indexOf(st.look) + 1) % LOOKS.length];
      setLook(st.look);
      // Every other card on screen follows the chosen look.
      for (const [k, other] of states) if (k !== key) other.look = st.look;
      draw(key, { enter: !reduce });
      const lbl = st.host.querySelector('.xlv-same');
      if (lbl && !reduce) { lbl.classList.add('xlv-flash'); setTimeout(() => lbl.classList.remove('xlv-flash'), 900); }
      document.dispatchEvent(new CustomEvent('rhema-xl-cycled', { detail: { key, look: st.look } }));
    };
    const btn = st.host.querySelector('.xlv-cycle');
    btn?.classList.add('spin');
    if (!chart || reduce) { go(); return; }
    chart.classList.add('xlv-leave');
    setTimeout(go, 260);
  }
  function pick(key, idx) {
    const st = states.get(key);
    if (!st) return;
    st.sel = String(idx) === 'other' ? String(Math.min(4, st.data.renderings.length - 1)) : String(idx);
    draw(key);
    // Scroll only the sheet's own content, never the page (on iPhone,
    // scrollIntoView can slide the whole reader up and show the home screen).
    const row = st.host.querySelector('.xlv-acc-row.open');
    if (row && typeof window._wsScrollInto === 'function') window._wsScrollInto(row, 70);
  }
  function all(key, text) {
    const st = states.get(key);
    if (!st) return;
    st.all.add(text);
    draw(key);
  }
  window.RhemaXlViews = { render, cycle, pick, all, look, LOOKS };
})();
