// "At a glance": a chapter summary that opens only when the reader taps the
// eye button by the chapter title. Every line
// is counted from data the app already has, and each card says where it came from:
//   • Key words: counted from the Greek / Hebrew text on screen.
//   • Old Testament quotes (or "Quoted in the New Testament"): the
//     cross-reference data's quote/fulfillment links + MSB/BSB official
//     footnote citations.
//   • Told elsewhere: parallel-account links (Gospels, Kings/Chronicles…).
//   • Most linked verses: OpenBible.info cross references, by readers' votes.
//   • Yours: the reader's own highlights and notes in this chapter.
(function () {
  'use strict';

  // The most common words carry grammar more than a chapter's subject; they're
  // skipped so they don't crowd the list (the card says so).
  const SKIP = new Set([
    'G1510', 'G3004', 'G2036', 'G2046', 'G3956', 'G1096', 'G2192', // be, say, say, say, all, become, have
    'H1961', 'H559', 'H3605', 'H1696'                              // be, say, all, speak
  ]);
  // Rough word counts of each text, used for each word's usual rate.
  const TEXT_SIZE = { 'nt-greek': 138000, hebrew: 305000, lxx: 600000 };
  const MIN_HERE = 2, MIN_RATIO = 4, MAX_WORDS = 6, MIN_PARALLEL = 3;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bookName = code => (typeof _rhemaBookName === 'function' ? _rhemaBookName(code) : code);
  const isOT = code => (typeof isRhemaOTBook === 'function' ? isRhemaOTBook(code) : false);
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const refLabel = ref => {
    const p = typeof _xrefParseRef === 'function' ? _xrefParseRef(ref) : null;
    if (!p) return esc(ref);
    const end = p.endVerse ? `-${p.endChapter ? p.endChapter + ':' : ''}${p.endVerse}` : '';
    return `${esc(bookName(p.book))} ${p.chapter}:${p.verse}${end}`;
  };

  // ── The button ──────────────────────────────────────────────────────────
  const EYE = `<svg class="glb-eye" viewBox="0 0 28 20" aria-hidden="true">
      <path class="glb-white" d="M2 10 Q14 -2 26 10 Q14 22 2 10Z"/>
      <g class="glb-look"><circle class="glb-iris" cx="14" cy="10" r="5"/><circle class="glb-pupil" cx="14" cy="10" r="2.4"/><circle class="glb-glint" cx="15.6" cy="8.3" r="1"/></g>
      <path class="glb-lid" d="M2 10 Q14 -2 26 10 Q14 -2 2 10Z"/>
    </svg>`;
  function buttonHtml() {
    return `<button type="button" class="glance-btn" onclick="event.stopPropagation();RhemaGlance.open(this)" aria-label="This chapter at a glance">` +
      `${EYE}<span class="glb-txt">At a glance</span><i class="glb-sp" aria-hidden="true"></i></button>`;
  }

  // ── Data ────────────────────────────────────────────────────────────────
  function layerNow(book) {
    return typeof getCurrentOriginalLanguageLayer === 'function' ? getCurrentOriginalLanguageLayer(book) : (isOT(book) ? 'hebrew' : 'nt-greek');
  }
  function layerName(layer) {
    return layer === 'hebrew' ? 'Hebrew Old Testament' : layer === 'lxx' ? 'Septuagint (LXX)' : 'Greek New Testament';
  }
  function layerShort(layer) {
    return layer === 'hebrew' ? 'the Hebrew OT' : layer === 'lxx' ? 'the LXX' : 'the NT';
  }
  // The word's main part of speech: N(oun) V(erb) A(djective) or P(roper name).
  function partOf(morph, layer) {
    const m = String(morph || '');
    if (layer !== 'hebrew') return (m.match(/^([NVA])-/) || [])[1] || '';
    for (const seg of m.replace(/^H/, '').split('/')) {
      if (/^Np/.test(seg)) return 'P';
      if ('NVA'.includes(seg[0])) return seg[0];
    }
    return '';
  }
  function chapterVerses(book, chapter) {
    if (typeof _rhemaOrigChapterList === 'function') return _rhemaOrigChapterList(book, chapter);
    const T = (_rhemaText()[book] || {})[chapter] || {};
    return Object.keys(T).map(Number).sort((a, b) => a - b).map(v => [String(chapter), String(v)]);
  }
  // The English verse a Hebrew/Greek verse lines up with (Psalm titles and a
  // few chapters number differently), so "v. 3" here means v. 3 on screen.
  function engVerse(book, chapter, oc, ov) {
    const e = typeof _rhemaVersificationFor === 'function' ? _rhemaVersificationFor(book)?.o2e?.get(`${oc}:${ov}`) : null;
    if (e) { const [c, v] = e.split(':'); return c === String(Number(chapter)) ? v : `${c}:${v}`; }
    return oc === String(Number(chapter)) ? ov : `${oc}:${ov}`;
  }
  function keyWords(book, chapter) {
    const layer = layerNow(book);
    const T = _rhemaText()[book] || {};
    const lex = typeof getCurrentRhemaLexicon === 'function' ? getCurrentRhemaLexicon(layer) : {};
    const prefix = layer === 'hebrew' ? 'H' : 'G';
    const tally = new Map();
    let n = 0;
    for (const [oc, ov] of chapterVerses(book, chapter)) {
      ((T[oc] || {})[ov] || []).forEach((w, idx) => {
        n++;
        const s = String(w?.[1] ?? '');
        if (!/^\d+$/.test(s) || SKIP.has(prefix + s)) return;
        const part = partOf(w[2], layer);
        if (!part || part === 'P') return;
        const L = lex?.[s];
        if (!L?.lemma) return;
        // Greek names start with a capital letter in the lexicon.
        if (layer !== 'hebrew' && /^\p{Lu}/u.test(L.lemma.normalize('NFD').replace(/\p{M}/gu, ''))) return;
        const t = tally.get(s) || { s, here: 0, at: [oc, ov, idx], verses: new Set() };
        t.here++; t.verses.add(engVerse(book, chapter, oc, ov));
        tally.set(s, t);
      });
    }
    const size = TEXT_SIZE[layer] || 138000;
    const rows = [];
    for (const t of tally.values()) {
      if (t.here < MIN_HERE) continue;
      const occ = typeof getCurrentRhemaOccurrences === 'function' ? getCurrentRhemaOccurrences(t.s, layer) : null;
      const total = Math.max(occ?.total || 0, t.here);
      const ratio = t.here / (total * n / size);
      if (ratio < MIN_RATIO) continue;
      const L = lex[t.s];
      rows.push({ ...t, total, ratio, score: t.here * Math.log(ratio), lemma: L.lemma, gloss: String(L.brief || L.quick_def || '').split(';')[0].trim(), translit: L.translit || '' });
    }
    rows.sort((a, b) => b.score - a.score);
    return { layer, prefix, words: rows.slice(0, MAX_WORDS), tokens: n };
  }

  // ── Quotes across the testaments ────────────────────────────────────────
  // Only the publishers' own footnotes count as quotes: every MSB/BSB footnote
  // that cites the other testament. (The cross-reference data's text-matched
  // "quote" links also catch look-alike wording, so on their own they're not
  // used here; they only add "Fulfilled" when a footnote backs them.)
  const parse = r => {
    const m = String(r || '').match(/^(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/);
    return m ? { b: m[1], c: +m[2], v: +m[3], ec: m[4] ? +m[4] : +m[2], ev: m[5] ? +m[5] : +m[3] } : null;
  };
  const overlaps = (a, b) => {
    a = parse(a); b = parse(b);
    if (!a || !b || a.b !== b.b) return false;
    const s = x => x.c * 1000 + x.v, e = x => x.ec * 1000 + x.ev;
    return s(a) <= e(b) && s(b) <= e(a);
  };
  const notesFor = key => (typeof _xrefCuratedScriptureNotes === 'function' ? _xrefCuratedScriptureNotes(key) : []);
  async function ensureNotes() {
    if (!window.RhemaScriptureNotes && typeof _rhemaLoadDataFile === 'function') {
      try { await _rhemaLoadDataFile('rhema-scripture-notes.js'); } catch {}
    }
  }
  // NT verse keys whose footnotes cite something in this OT chapter.
  function citedFromNT(book, chapter) {
    const R = window.RhemaScriptureNotes;
    if (!R) return [];
    const keys = new Set([...Object.keys(R.MSB || {}), ...Object.keys(R.BSB || {})].map(k => k.replace(/^MRK /, 'MAR ')));
    const out = [];
    const ch = Number(chapter);
    for (const k of keys) {
      if (isOT(k.split(' ')[0])) continue;
      notesFor(k).forEach(n => {
        const p = parse(n.ref);
        if (!p || p.b !== book || ch < p.c || ch > p.ec) return;
        const v = p.c === ch ? p.v : 1;
        out.push({ verse: String(v), ref: k, type: n.type, otRef: n.ref });
      });
    }
    return out;
  }

  async function xrefData(book, chapter) {
    await ensureNotes();
    let shard = null;
    if (typeof _rxLoadBook === 'function') {
      try { await _rxLoadBook(book); shard = _rxShardNow(book); } catch {}
    }
    const ot = isOT(book);
    const ch = Number(chapter);
    const keyOf = v => `${book} ${ch}:${v}`;
    const rowsOf = v => (shard?.v || {})[`${ch}:${v}`] || [];
    const nums = new Set(Object.keys(shard?.v || {}).filter(k => k.startsWith(`${ch}:`)).map(k => k.slice(`${ch}:`.length)));
    chapterVerses(book, chapter).forEach(([oc, ov]) => { if (oc === String(ch)) nums.add(ov); });
    const verses = [...nums].filter(v => /^\d+$/.test(v)).sort((a, b) => a - b);

    const quotes = [];
    const seen = new Set();
    const add = q => { const k = q.verse + '|' + q.ref; if (!seen.has(k)) { seen.add(k); quotes.push(q); } };
    if (!ot) {
      for (const v of verses) {
        const f = rowsOf(v).filter(r => /f/.test(r[2] || ''));
        notesFor(keyOf(v)).forEach(n => {
          if (!n.ref || !isOT(String(n.ref).split(' ')[0])) return;
          const cite = /citation/.test(n.type || '');
          add({ verse: v, ref: n.ref, tag: cite ? (f.some(r => overlaps(r[0], n.ref)) ? 'Fulfilled' : 'Quote') : 'See also' });
        });
      }
    } else {
      citedFromNT(book, chapter).forEach(c => {
        const cite = /citation/.test(c.type || '');
        const f = rowsOf(c.verse).some(r => /F/.test(r[2] || '') && overlaps(r[0], c.ref));
        add({ verse: c.verse, ref: c.ref, tag: cite ? (f ? 'Fulfilled' : 'Quote') : 'See also' });
      });
      quotes.sort((a, b) => a.verse - b.verse || (typeof _rhemaRefSortValue === 'function' ? _rhemaRefSortValue(a.ref) - _rhemaRefSortValue(b.ref) : 0));
    }

    // Parallel accounts: another book's chapter that several verses here
    // are linked to as the same event or saying.
    const parallels = new Map();
    const linked = [];
    for (const v of verses) {
      const raw = rowsOf(v);
      let votes = 0;
      raw.forEach(([ref, vt = 0, kind = '']) => {
        if (vt > 0) votes += vt;
        if (kind !== 'p') return;
        const p = parse(ref); if (!p) return;
        const k = `${p.b} ${p.c}`;
        const g = parallels.get(k) || { book: p.b, chapter: p.c, verses: new Set(), first: { src: keyOf(v), ref } };
        g.verses.add(v); parallels.set(k, g);
      });
      if (raw.length && votes > 0) linked.push({ verse: v, votes, count: raw.length });
    }
    linked.sort((a, b) => b.votes - a.votes || b.count - a.count);
    return {
      quotes,
      parallels: [...parallels.values()].filter(g => g.verses.size >= MIN_PARALLEL).sort((a, b) => b.verses.size - a.verses.size),
      linked: linked.slice(0, 3),
      hasShard: !!shard
    };
  }

  function yours(book, chapter) {
    if (typeof _rhemaCurMarks !== 'function') return [];
    const marks = _rhemaCurMarks();
    const pre = `${book} ${chapter}:`;
    return Object.entries(marks)
      .filter(([ref, m]) => ref.startsWith(pre) && m && (m.color || m.note))
      .map(([ref, m]) => ({ verse: ref.slice(pre.length), color: m.color || m.noteColor || '', note: !!m.note }))
      .filter(m => /^\d+$/.test(m.verse))
      .sort((a, b) => a.verse - b.verse);
  }

  function verseText(v) {
    const el = document.querySelector(`#rhemaEnglishDisplay .rhema-english-verse[data-verse="${v}"]`);
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('sup, .rhema-verse-num, .rhema-chapter-verse-label, button, .rhema-reader-note-btn').forEach(x => x.remove());
    const t = c.textContent.replace(/\s+/g, ' ').trim().replace(/^\d+\s*/, '');
    return t.length > 120 ? t.slice(0, 117).replace(/\s+\S*$/, '') + '…' : t;
  }

  // ── Sheet ───────────────────────────────────────────────────────────────
  let _btn = null, _busy = false;

  function card(i, icon, title, body, source) {
    return `<section class="glc-card" style="--i:${i}"><div class="glc-head"><span class="material-symbols-outlined">${icon}</span><h3>${title}</h3></div>` +
      `${body}<p class="glc-src"><span class="material-symbols-outlined">info</span>${source}</p></section>`;
  }

  async function build(book, chapter) {
    const kw = keyWords(book, chapter);
    const xr = await xrefData(book, chapter);
    const mine = yours(book, chapter);
    const ot = isOT(book);
    const out = [];
    let i = 0;

    // Key words
    if (kw.words.length) {
      const max = Math.max(...kw.words.map(w => w.here));
      const rows = kw.words.map(w => {
        const [oc, ov, idx] = w.at;
        const num = x => /^\d+$/.test(x) ? Number(x) : (x === 'title' ? 0 : 999);
        const vs = [...w.verses].map(x => x === 'title' ? 'title' : x).sort((a, b) => num(a) - num(b));
        const where = vs.length > 4 ? `vv. ${vs.slice(0, 4).join(', ')}…` : `v${vs.length > 1 ? 'v' : ''}. ${vs.join(', ')}`;
        return `<button type="button" class="glw" onclick="RhemaGlance.word('${esc(oc)}','${esc(ov)}',${idx})">` +
          `<span class="glw-top"><span class="glw-lemma${kw.layer === 'hebrew' ? ' glw-heb' : ''}">${esc(w.lemma)}</span><span class="glw-gloss">${esc(w.gloss)}</span><span class="glw-n">${w.here}×<small>here</small></span></span>` +
          `<span class="glw-bar"><i style="width:${Math.round(w.here / max * 100)}%"></i></span>` +
          `<span class="glw-sub">${w.here} times in this chapter (${esc(where)}) · ${w.total.toLocaleString()} in all of ${layerShort(kw.layer)}</span></button>`;
      }).join('');
      out.push(card(i++, 'key', 'Key words', `<div class="glw-list">${rows}</div>`,
        `Picked by a fixed rule, not by hand: from the ${layerName(kw.layer)} of this chapter, words used at least ${MIN_HERE} times here and at least ${MIN_RATIO}× more often than in ${layerShort(kw.layer)} as a whole, ranked by how much this chapter leans on them. Names and the most common words (be, say, all) are skipped. The big number is how many times it's in this chapter. Tap one for its full study.`));
    } else {
      out.push(card(i++, 'key', 'Key words', `<p class="glc-empty">No word repeats here often enough to stand out.</p>`,
        `Counted from the ${layerName(kw.layer)} on screen.`));
    }

    if (xr) {
      // Quotes across the testaments
      if (xr.quotes.length) {
        const rows = xr.quotes.slice(0, 14).map(q =>
          `<button type="button" class="glq" onclick="RhemaGlance.xref('${esc(book)} ${Number(chapter)}:${esc(q.verse)}','${esc(q.ref)}')">` +
          `<span class="glq-v">v. ${esc(q.verse)}</span><span class="material-symbols-outlined glq-arrow">${ot ? 'east' : 'west'}</span>` +
          `<span class="glq-ref">${refLabel(q.ref)}</span><span class="glq-tag glq-${q.tag.replace(/\s+/g, '').toLowerCase()}">${q.tag}</span></button>`).join('');
        const more = xr.quotes.length > 14 ? `<p class="glc-more">+ ${xr.quotes.length - 14} more in Cross references</p>` : '';
        const ver = typeof _xrefLocalVersion === 'function' ? _xrefLocalVersion() : 'MSB';
        out.push(card(i++, 'format_quote', ot ? 'Quoted in the New Testament' : 'Old Testament quotes',
          `<div class="glq-list">${rows}</div>${more}`,
          ot
            ? `From the ${ver} official footnotes: each New Testament verse whose footnote cites this chapter. "Fulfilled": that verse says the Scripture was fulfilled. "See also": the footnote points here without calling it a quote.`
            : `From the ${ver} official footnotes that cite the Old Testament. "Fulfilled": this verse says the Scripture was fulfilled. "See also": the footnote points there without calling it a quote.`));
      }
      // Parallel accounts
      if (xr.parallels.length) {
        const chips = xr.parallels.slice(0, 6).map(g =>
          `<button type="button" class="glp" onclick="RhemaGlance.xref('${esc(g.first.src)}','${esc(g.first.ref)}')"><b>${esc(bookName(g.book))} ${esc(g.chapter)}</b><span>${g.verses.size} verse${g.verses.size === 1 ? '' : 's'} here</span></button>`).join('');
        out.push(card(i++, 'compare_arrows', 'Told elsewhere too', `<div class="glp-list">${chips}</div>`,
          `Parallel accounts from the cross-reference data: another book's chapter that ${MIN_PARALLEL} or more verses here are linked to as the same event or saying.`));
      }
      // Most linked verses
      if (xr.linked.length) {
        const rows = xr.linked.map((l, k) => {
          const t = verseText(l.verse);
          return `<button type="button" class="gll" onclick="RhemaGlance.verse('${esc(l.verse)}')"><span class="gll-rank">${k + 1}</span>` +
            `<span class="gll-body"><b>Verse ${esc(l.verse)}</b>${t ? `<span class="gll-t">${esc(t)}</span>` : ''}<span class="gll-n">${l.count} linked passages · ${l.votes.toLocaleString()} reader votes</span></span></button>`;
        }).join('');
        out.push(card(i++, 'hub', 'Most cross-referenced verses', `<div class="gll-list">${rows}</div>`,
          'OpenBible.info cross references (CC BY), ranked by how many readers voted for each verse’s links.'));
      }
    }

    // Yours
    {
      const body = mine.length
        ? `<div class="gly-list">${mine.map(m => `<button type="button" class="gly" style="--gly:${esc(m.color || 'var(--secondary-color)')}" onclick="RhemaGlance.verse('${esc(m.verse)}')"><i></i>v. ${esc(m.verse)}${m.note ? '<span class="material-symbols-outlined">edit_note</span>' : ''}</button>`).join('')}</div>`
        : `<p class="glc-empty">Nothing marked yet. Tap a verse to highlight it or add a note.</p>`;
      out.push(card(i++, 'bookmark_heart', 'Yours', body, 'Your own highlights and notes in this chapter.'));
    }

    const intro = typeof openBookIntro === 'function'
      ? `<button type="button" class="glc-intro" style="--i:${i}" onclick="RhemaGlance.intro('${esc(book)}')"><span class="material-symbols-outlined">menu_book</span>About the book of ${esc(bookName(book))}<span class="material-symbols-outlined">chevron_right</span></button>` : '';
    return out.join('') + intro;
  }

  function ensureShell() {
    let ov = document.getElementById('glanceOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'glanceOverlay';
    ov.className = 'glance-overlay';
    ov.innerHTML = `<div class="glance-backdrop" onclick="RhemaGlance.close()"></div>` +
      `<div class="glance-sheet" role="dialog" aria-modal="true" aria-labelledby="glanceTitle">` +
            `<div class="glance-top">${EYE.replace('glb-eye', 'glb-eye gls-eye')}<div class="glance-titles"><h2 id="glanceTitle"></h2><p>Counted from the app’s own data.</p></div>` +
      `<button type="button" class="glance-x" onclick="RhemaGlance.close()" aria-label="Close"><span class="material-symbols-outlined">close</span></button></div>` +
      `<div class="glance-body" id="glanceBody"></div></div>`;
    document.body.appendChild(ov);
    // Swipe down on the top bar to close.
    const sheet = ov.querySelector('.glance-sheet');
    let y0 = null;
    ov.querySelector('.glance-top').addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchend', e => {
      if (y0 != null && e.changedTouches[0].clientY - y0 > 70) close();
      y0 = null;
    });
    return ov;
  }

  function originFor(sheet, btn) {
    const r = btn?.getBoundingClientRect?.();
    const s = sheet.getBoundingClientRect();
    if (!r || !s.width) return '50% 0%';
    return `${Math.round(r.left + r.width / 2 - s.left)}px ${Math.round(r.top + r.height / 2 - s.top)}px`;
  }

  async function open(btn) {
    if (_busy) return;
    const book = typeof _rhemaBook !== 'undefined' ? _rhemaBook : null;
    const chapter = typeof _rhemaChapter !== 'undefined' ? String(_rhemaChapter) : null;
    if (!book || !chapter) return;
    _busy = true;
    _btn = btn || document.querySelector('.glance-btn');
    const ov = ensureShell();
    const sheet = ov.querySelector('.glance-sheet');
    const body = ov.querySelector('#glanceBody');
    ov.querySelector('#glanceTitle').textContent = `${bookName(book)} ${chapter} at a glance`;
    body.innerHTML = `<div class="glance-wait"><span></span><span></span><span></span></div>`;
    body.scrollTop = 0;
    // 1) The eye pops wide and throws sparkles.
    _btn?.classList.remove('glb-wink');
    _btn?.classList.add('glb-pop');
    await new Promise(r => setTimeout(r, reduced() ? 0 : 260));
    // 2) The sheet springs out of the button.
    ov.classList.add('open');
    ov.classList.remove('closing');
    sheet.style.transformOrigin = originFor(sheet, _btn);
    sheet.classList.remove('glance-in'); void sheet.offsetWidth; sheet.classList.add('glance-in');
    try {
      body.innerHTML = await build(book, chapter);
    } catch (e) {
      console.warn('glance', e);
      body.innerHTML = `<p class="glc-empty">Couldn’t read this chapter’s data. Try again in a moment.</p>`;
    }
    _btn?.classList.remove('glb-pop');
    _busy = false;
  }

  function close(then) {
    const ov = document.getElementById('glanceOverlay');
    if (!ov || !ov.classList.contains('open')) { then?.(); return; }
    const sheet = ov.querySelector('.glance-sheet');
    const btn = _btn && document.body.contains(_btn) ? _btn : document.querySelector('.glance-btn');
    sheet.style.transformOrigin = originFor(sheet, btn);
    ov.classList.add('closing');
    const done = () => {
      ov.classList.remove('open', 'closing');
      sheet.classList.remove('glance-in');
      // The eye winks goodbye.
      if (btn) { btn.classList.remove('glb-wink'); void btn.offsetWidth; btn.classList.add('glb-wink'); setTimeout(() => btn.classList.remove('glb-wink'), 900); }
      then?.();
    };
    setTimeout(done, reduced() ? 0 : 340);
  }

  // ── Card actions ────────────────────────────────────────────────────────
  function word(oc, ov, idx) {
    close(() => { if (typeof openRhemaSheet === 'function') openRhemaSheet(Number(idx), String(ov), String(oc)); });
  }
  function xref(src, target) {
    close(() => { if (typeof openRhemaXrefTrailFromReader === 'function') openRhemaXrefTrailFromReader(src, target); });
  }
  function verse(v) {
    close(() => {
      if (typeof _rhemaScrollVerseToTop === 'function') _rhemaScrollVerseToTop(String(v), { smooth: true });
      const el = document.querySelector(`#rhemaEnglishDisplay .rhema-english-verse[data-verse="${v}"]`);
      if (el) { el.classList.remove('glance-flash'); void el.offsetWidth; el.classList.add('glance-flash'); setTimeout(() => el.classList.remove('glance-flash'), 1600); }
    });
  }
  // The intro opens at the start of the book; a "Back to John 3" pill at the
  // bottom of the reader brings you straight back to where you were.
  function intro(book) {
    close(() => {
      if (typeof _rhemaMarkJumpOrigin === 'function') {
        let before = null;
        try { before = _rhemaReturnTo; } catch {}
        _rhemaMarkJumpOrigin();
        try { if (_rhemaReturnTo && _rhemaReturnTo !== before) _rhemaReturnTo.chapterOnly = true; } catch {}
      }
      openBookIntro(book);
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('glanceOverlay')?.classList.contains('open')) close();
  });

  window.RhemaGlance = { buttonHtml, open, close, word, xref, verse, intro, _keyWords: keyWords, _xrefData: xrefData };
})();
