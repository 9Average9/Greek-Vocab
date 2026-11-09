/* Rhēma Word Study — the Definition tab for Greek words (NT + LXX).

   Answer first, then as deep as the reader wants:

     Answer card .. what the word means in THIS verse, how the reader's Bible
                    words it, the one-sentence summary, "debated in this verse"
     Depth ........ Quick (answer only) · Study (+ card deck) · Deep (+ history,
                    lexicons, method and measured detail) — remembered
     Card deck .... swipeable: Meanings (one colour-coded card per meaning, with
                    why, a real verse, every verse, Save) · This verse (every
                    translation's rendering) · Translations (whole-NT counts per
                    version) · Authors · History · Lexicons · How we know
     Saved ........ saved meanings live on the device (Reader menu → Saved
                    meanings); a short first-run tour explains the layout

   Depends on app.js globals (loaded after it). Hebrew keeps its own renderer.
*/
(function () {
  'use strict';
  const esc = (s) => _escapeRhemaAttr(s == null ? '' : s);

  // ── Context of the tapped word ───────────────────────────────────────────
  // Set by openRhemaSheet(); cleared on close. The word study only claims "in
  // this verse" when the word really was tapped in that verse.
  window._rhemaWordCtx = null;

  function _ctxFor(strongs) {
    const c = window._rhemaWordCtx;
    return c && String(c.strongs) === String(strongs) ? c : null;
  }

  // ── NT authors ──────────────────────────────────────────────────────────
  const AUTHORS = [
    { key: 'mat', name: 'Matthew', books: ['MAT'] },
    { key: 'mar', name: 'Mark', books: ['MAR'] },
    { key: 'luk', name: 'Luke–Acts', books: ['LUK', 'ACT'] },
    { key: 'joh', name: 'John', books: ['JOH', '1JO', '2JO', '3JO', 'REV'] },
    { key: 'pau', name: 'Paul', books: ['ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM'] },
    { key: 'heb', name: 'Hebrews', books: ['HEB'] },
    { key: 'jam', name: 'James', books: ['JAM'] },
    { key: 'pet', name: 'Peter', books: ['1PE', '2PE'] },
    { key: 'jud', name: 'Jude', books: ['JUD'] },
  ];
  const AUTHOR_OF = {};
  AUTHORS.forEach(a => a.books.forEach(b => { AUTHOR_OF[b] = a; }));

  // ── Text cleaners for the reference lexica ───────────────────────────────
  const NT_ABBR = {
    Mat: 'MAT', Mrk: 'MAR', Luk: 'LUK', Jhn: 'JOH', Act: 'ACT', Rom: 'ROM', '1Co': '1CO', '2Co': '2CO',
    Gal: 'GAL', Eph: 'EPH', Php: 'PHP', Col: 'COL', '1Th': '1TH', '2Th': '2TH', '1Ti': '1TI', '2Ti': '2TI',
    Tit: 'TIT', Phm: 'PHM', Heb: 'HEB', Jas: 'JAM', '1Pe': '1PE', '2Pe': '2PE', '1Jo': '1JO', '2Jo': '2JO',
    '3Jo': '3JO', Jud: 'JUD', Rev: 'REV',
  };
  const NT_REF_RE = /\b(Mat|Mrk|Luk|Jhn|Act|Rom|[12]Co|Gal|Eph|Php|Col|[12]Th|[12]Ti|Tit|Phm|Heb|Jas|[12]Pe|[123]Jo|Jud|Rev)\.(\d+):(\d+)/g;

  function _refChip(book, ch, v, strongs, label) {
    return `<button type="button" class="ws-ref" onclick="event.stopPropagation();jumpToRhemaVerse('${esc(book)}','${esc(ch)}','${esc(v)}','${esc(strongs)}')">${esc(label || `${_rhemaBookName(book) || book} ${ch}:${v}`)}</button>`;
  }
  function _refChipFromKey(ref, strongs) {
    const m = String(ref).match(/^(\S+) (\d+):(\d+)$/);
    return m ? _refChip(m[1], m[2], m[3], strongs) : '';
  }

  // Abbott-Smith ships as loose HTML with private tags (<re>, <lb>, <greek>…)
  // and "__1." outline markers. Keep b/i/br, turn the outline into real
  // structure, and make every NT reference a tappable receipt.
  function cleanAbbottSmith(html, strongs) {
    let s = String(html || '')
      .replace(/<lb\s*\/?>/gi, '<br>')
      .replace(/<re>/gi, '<span class="ws-as-note">').replace(/<\/re>/gi, '</span>')
      .replace(/<(\/?)(b|i|br|sup|sub)(\s[^>]*)?>/gi, (m, slash, tag) => `\u0001${slash}${tag.toLowerCase()}\u0002`)
      .replace(/<span class="ws-as-note">/g, '\u0001span class="ws-as-note"\u0002').replace(/<\/span>/g, '\u0001/span\u0002')
      .replace(/<[^>]*>/g, '')
      .replace(/\u0001/g, '<').replace(/\u0002/g, '>');
    s = s.replace(/(<br>\s*)*__\s*([IVX]+\.|\d+\.|\([a-z]\)|\([ivx]+\))/g, (m, br, mark) =>
      `<br><strong class="ws-as-num${/^\(/.test(mark) ? ' ws-as-sub' : ''}">${mark}</strong> `);
    s = s.replace(/(<br>\s*){2,}/g, '<br>');
    return s.replace(NT_REF_RE, (m, ab, ch, v) => {
      const book = NT_ABBR[ab];
      return book ? _refChip(book, ch, v, strongs, m.replace('.', ' ')) : m;
    }).replace(/\(AS\)\s*$/, '');
  }

  // Moulton–Milligan was digitised through a Greek code page, so German names
  // came out as "Nδgeli", "Crφnert". Map those letters back (windows-1253 →
  // Latin-1), restore lost apostrophes ("Deissmann s" → "Deissmann’s"), and
  // drop the "[page N]" header.
  let _cp1253Map = null;
  function _mojibakeMap() {
    if (_cp1253Map) return _cp1253Map;
    _cp1253Map = {};
    try {
      const dec = new TextDecoder('windows-1253');
      for (let b = 0xC0; b <= 0xFF; b++) {
        const greek = dec.decode(new Uint8Array([b]));
        if (greek && greek !== '�') _cp1253Map[greek] = String.fromCharCode(b);
      }
    } catch { _cp1253Map = { 'δ': 'ä', 'φ': 'ö', 'ό': 'ü', 'κ': 'ê', 'θ': 'è', 'ι': 'é' }; }
    return _cp1253Map;
  }
  function cleanMoultonMilligan(text) {
    const map = _mojibakeMap();
    return String(text || '')
      .replace(/^[^<]*\[page \d+\]\s*(<br>)?/, '')
      .replace(/([A-Za-z])([΄-ώ])(?=[A-Za-z])/g, (m, a, g) => a + (map[g] || g))
      .replace(/\b([A-Z][a-z]+) s (?=[A-Za-z(])/g, '$1’s ')
      .split(/<br\s*\/?>/i)
      .map(p => p.trim())
      .filter(Boolean);
  }

  // Moulton–Milligan for this word — unless the entry filed under its number
  // is really another word's (see RhemaAlign.mmHeadwordMatches).
  function _mmText(strongs) {
    const t = (window.RhemaMoultonMilligan || {})[strongs] || '';
    const lemma = (window.RhemaLexicon || {})[strongs]?.lemma;
    return t && (!window.RhemaAlign || RhemaAlign.mmHeadwordMatches(t, lemma)) ? t : '';
  }

  // LSJ for this word — unless it's a homograph's entry (φώς "man" under φῶς
  // "light", νομός "pasture" under νόμος "law"; see RhemaAlign.lsjHeadwordMatches).
  function _lsjText(entry) {
    const t = entry?.classical?.lsj || '';
    return t && (!window.RhemaAlign || RhemaAlign.lsjHeadwordMatches(t, entry.lemma)) ? t : '';
  }

  function _decodeEntities(s) {
    return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }

  // ── Small render helpers ─────────────────────────────────────────────────
  // Everything below the answer card is a deck of cards the reader swipes
  // through. Each card's header still carries the one thing worth knowing
  // (the "teaser").
  const section = (id, icon, title, body, teaser = '') => body ? `<section class="ws-card" data-ws-sec="${id}">
      <header class="ws-card-h"><span class="material-symbols-outlined">${icon}</span><span class="ws-card-t">${title}</span>${teaser ? `<em class="ws-teaser">${teaser}</em>` : ''}</header>
      <div class="ws-card-body">${body}</div>
    </section>` : '';
  const more = (label, body, open = false) => body ? `<details class="ws-more"${open ? ' open' : ''}><summary>${label}</summary><div class="ws-more-body">${body}</div></details>` : '';
  const pct = (x) => Math.round((x || 0) * 100);
  const _ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // ── Depth: Quick · Study · Deep ─────────────────────────────────────────
  // Quick is the answer card alone. Study adds the card deck (meanings, this
  // verse, translations, authors). Deep adds history, the lexicons, the method
  // and the measured detail. The choice is remembered.
  const DEPTHS = [
    ['quick', 'Quick', 'bolt'],
    ['study', 'Study', 'menu_book'],
    ['deep', 'Deep', 'school'],
  ];
  let _wsDepth = _ls.get('rhemaWsDepth', 'study');
  if (!DEPTHS.some(d => d[0] === _wsDepth)) _wsDepth = 'study';
  function depthHtml(uid) {
    return `<div class="ws-depth" role="radiogroup" aria-label="How deep to go">${DEPTHS.map(([k, label, icon]) =>
      `<button type="button" role="radio" aria-checked="${k === _wsDepth}" class="ws-depth-b${k === _wsDepth ? ' on' : ''}" data-depth="${k}" onclick="rhemaWordStudyDepth('${uid}','${k}')"><span class="material-symbols-outlined">${icon}</span>${label}</button>`).join('')}</div>`;
  }
  window.rhemaWordStudyDepth = function (uid, depth) {
    if (!DEPTHS.some(d => d[0] === depth)) return;
    _wsDepth = depth;
    _ls.set('rhemaWsDepth', depth);
    document.querySelectorAll('.ws').forEach(root => {
      DEPTHS.forEach(([k]) => root.classList.toggle(`ws-d-${k}`, k === depth));
      root.querySelectorAll('.ws-depth-b').forEach(b => {
        const on = b.dataset.depth === depth;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
    });
    _wsRefreshDeck(uid);
  };

  // ── The card deck ───────────────────────────────────────────────────────
  // A horizontal scroll-snap strip: native swipe on phones, tabs on top for
  // taps. The strip takes the height of the card in view, so a short card
  // doesn't leave a long blank under it.
  const CARDS = [
    { id: 'range', label: 'Meanings', icon: 'auto_awesome', depth: 'study' },
    { id: 'here', label: 'This verse', icon: 'translate', depth: 'study' },
    { id: 'versions', label: 'Translations', icon: 'compare_arrows', depth: 'study' },
    { id: 'authors', label: 'Authors', icon: 'groups', depth: 'study' },
    { id: 'history', label: 'History', icon: 'timeline', depth: 'deep' },
    { id: 'lex', label: 'Lexicons', icon: 'library_books', depth: 'deep' },
    { id: 'method', label: 'How we know', icon: 'science', depth: 'deep' },
  ];
  function deckHtml(uid, loading) {
    return `<div class="ws-deckwrap">
      <div class="ws-dtabs" id="${uid}-dtabs" role="tablist"></div>
      <div class="ws-deck" id="${uid}-deck">${CARDS.map(c =>
        `<div class="ws-slot" id="${uid}-${c.id}" data-card="${c.id}" data-depth="${c.depth}">${loading[c.id] || ''}</div>`).join('')}</div>
      <div class="ws-dots" id="${uid}-dots" aria-hidden="true"></div>
    </div>`;
  }
  function _wsSlots(root) {
    return [...root.querySelectorAll('.ws-slot')].filter(s =>
      !s.classList.contains('ws-slot-empty') && !(s.dataset.depth === 'deep' && _wsDepth !== 'deep'));
  }
  function _wsRefreshDeck(uid) {
    const root = document.getElementById(uid);
    if (!root) return;
    root.querySelectorAll('.ws-slot').forEach(s => s.classList.toggle('ws-slot-empty', !s.innerHTML.trim()));
    const slots = _wsSlots(root);
    const st = _studies.get(uid);
    const active = st?.active && slots.some(s => s.dataset.card === st.active) ? st.active : slots[0]?.dataset.card;
    const tabs = document.getElementById(`${uid}-dtabs`);
    if (tabs) tabs.innerHTML = slots.map(s => {
      const c = CARDS.find(x => x.id === s.dataset.card);
      return `<button type="button" role="tab" class="ws-dtab${s.dataset.card === active ? ' on' : ''}" data-card="${c.id}" onclick="rhemaWordStudyGo('${uid}','${c.id}')"><span class="material-symbols-outlined">${c.icon}</span>${c.label}</button>`;
    }).join('');
    const dots = document.getElementById(`${uid}-dots`);
    if (dots) dots.innerHTML = slots.length > 1 ? slots.map(s => `<i class="${s.dataset.card === active ? 'on' : ''}"></i>`).join('') : '';
    _wsDeckInit(uid);
    // Cards appear/disappear with the depth; keep the strip on the active one.
    const deck = document.getElementById(`${uid}-deck`);
    const slot = active && document.getElementById(`${uid}-${active}`);
    if (deck && slot && slot.offsetParent && Math.abs(deck.scrollLeft - slot.offsetLeft) > 2) {
      deck.style.scrollBehavior = 'auto';
      deck.scrollLeft = slot.offsetLeft;
      deck.style.scrollBehavior = '';
    }
    _wsSetActive(uid, active, false);
  }
  function _wsDeckInit(uid) {
    const deck = document.getElementById(`${uid}-deck`);
    if (!deck || deck._wsInit) return;
    deck._wsInit = true;
    // Keep sideways swipes inside the deck (the reader underneath turns
    // verses on a horizontal swipe).
    ['touchstart', 'touchmove', 'touchend'].forEach(t => deck.addEventListener(t, e => e.stopPropagation(), { passive: true }));
    let timer = 0;
    deck.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const root = document.getElementById(uid);
        if (!root) return;
        const slots = _wsSlots(root);
        let best = slots[0], bestD = Infinity;
        for (const s of slots) {
          const d = Math.abs(s.offsetLeft - deck.scrollLeft);
          if (d < bestD) { bestD = d; best = s; }
        }
        if (best) _wsSetActive(uid, best.dataset.card, false);
      }, 60);
    }, { passive: true });
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => _wsFitDeck(uid));
      deck.querySelectorAll('.ws-slot').forEach(s => ro.observe(s));
      deck._wsRO = ro;
    }
  }
  function _wsFitDeck(uid) {
    const deck = document.getElementById(`${uid}-deck`);
    const st = _studies.get(uid);
    if (!deck || !st) return;
    const slot = document.getElementById(`${uid}-${st.active}`);
    if (slot && slot.offsetHeight) deck.style.height = `${slot.offsetHeight}px`;
  }
  function _wsSetActive(uid, id, scroll) {
    const st = _studies.get(uid);
    const root = document.getElementById(uid);
    if (!st || !root || !id) return;
    st.active = id;
    root.querySelectorAll('.ws-dtab').forEach(b => b.classList.toggle('on', b.dataset.card === id));
    const slots = _wsSlots(root);
    root.querySelectorAll(`#${uid}-dots i`).forEach((d, i) => d.classList.toggle('on', slots[i]?.dataset.card === id));
    const tab = root.querySelector(`.ws-dtab[data-card="${id}"]`);
    if (tab && tab.parentElement) {
      const p = tab.parentElement;
      p.scrollTo({ left: Math.max(0, tab.offsetLeft - p.clientWidth / 2 + tab.offsetWidth / 2), behavior: 'smooth' });
    }
    const deck = document.getElementById(`${uid}-deck`);
    const slot = document.getElementById(`${uid}-${id}`);
    if (scroll && deck && slot) deck.scrollTo({ left: slot.offsetLeft, behavior: 'smooth' });
    _wsFitDeck(uid);
    // Counting every NT use in a version is real work — start it only when
    // the reader actually looks at the Translations card.
    if (id === 'versions' && !st.versionsStarted && st.entry !== undefined) {
      st.versionsStarted = true;
      const reader = typeof _rhemaReaderVersion === 'function' ? _rhemaReaderVersion() : 'MSB';
      rhemaWordStudyVersion(uid, st.ver || (_wsIsLocal(reader) ? reader : 'MSB'));
    }
  }
  window.rhemaWordStudyGo = function (uid, id) {
    if (_wsDepth === 'quick') rhemaWordStudyDepth(uid, 'study');
    const c = CARDS.find(x => x.id === id);
    if (c && c.depth === 'deep' && _wsDepth !== 'deep') rhemaWordStudyDepth(uid, 'deep');
    _wsSetActive(uid, id, true);
  };

  // ── Answer card ──────────────────────────────────────────────────────────
  // One card that answers "what does this word mean here?" before anything
  // else: the meaning in this verse, how the reader's own Bible words it, the
  // one-sentence summary, and — only when it matters — that it's debated.
  function heroHtml(strongs, lex, decision, ctx, occ, uid) {
    const where = ctx ? `${_rhemaBookName(ctx.book) || ctx.book} ${ctx.chapter}:${ctx.verse}` : '';
    const gloss = decision.gloss || decision.definition || '';
    const form = decision.inflectedGloss && decision.inflectedGloss !== gloss ? decision.inflectedGloss : '';
    const stats = [];
    if (occ?.total) stats.push(`${occ.total.toLocaleString()}× in the NT`);
    return `<div class="ws-hero">
      <div class="ws-hero-top">
        <span class="ws-lemma">${esc(lex.lemma || '')}</span>
        <span class="ws-translit">${esc(lex.translit || '')}</span>
        <span class="ws-g">G${esc(strongs)}</span>
        <span class="ws-hero-save" id="${uid}-hsave"></span>
      </div>
      ${gloss ? `<div class="ws-answer"><span class="ws-answer-k">${where ? `In ${esc(where)}` : 'Core meaning'}</span><strong>${esc(gloss)}</strong>${form ? `<span class="ws-form">this form: ${esc(form)}</span>` : ''}</div>` : ''}
      <div class="ws-hsense" id="${uid}-hsense"></div>
      <div class="ws-yours" id="${uid}-yours"></div>
      <div class="ws-def" id="${uid}-def"><span class="ws-shimmer"></span></div>
      <div class="ws-qm" id="${uid}-qm"></div>
      <div class="ws-glance" id="${uid}-glance">${stats.map(s => `<span>${esc(s)}</span>`).join('')}</div>
    </div>`;
  }

  // Does a note talk about this very verse? ("ROM 5:12", "Rom 5:12",
  // "Romans 5:12-14", "1 Cor 11:10"…)
  function _mentionsVerse(text, ctx) {
    if (!text || !ctx) return false;
    const code = String(ctx.book).toLowerCase();
    const name = String(_rhemaBookName(ctx.book) || '').toLowerCase().replace(/\s+/g, '');
    const re = /\b([1-3]?\s?[A-Za-z]{2,})\.?\s(\d+):(\d+)(?:\s?[-–]\s?(\d+))?/g;
    let m;
    while ((m = re.exec(String(text)))) {
      const tok = m[1].toLowerCase().replace(/\s+/g, '');
      const bookOk = tok === code || (tok.length >= 3 && name.startsWith(tok));
      if (!bookOk || m[2] !== String(ctx.chapter)) continue;
      const a = +m[3], b = m[4] ? +m[4] : a, v = +ctx.verse;
      if (v >= a && v <= b) return true;
    }
    return false;
  }

  function fillHero(uid, entry, strongs) {
    const st = _studies.get(uid);
    const ctx = st?.ctx || null;
    const def = document.getElementById(`${uid}-def`);
    const glance = document.getElementById(`${uid}-glance`);
    const prose = entry?.prose || {};
    const study = entry?.study || null;
    const ref = ctx ? `${ctx.book} ${ctx.chapter}:${ctx.verse}` : '';
    const hereI = ctx && study?.senses ? study.senses.findIndex(x => (x.refs || []).includes(ref)) : -1;
    st && (st.hereSense = hereI);

    const hs = document.getElementById(`${uid}-hsense`);
    if (hs) hs.innerHTML = hereI >= 0
      ? `<span class="ws-answer-k">Meaning here</span><button type="button" class="ws-hsense-b" onclick="rhemaWordStudyOpenSense('${uid}',${hereI})"><b>${esc(study.senses[hereI].label)}</b> — ${esc(study.senses[hereI].definition)}</button>`
      : '';

    // Save from the answer card: the meaning used here, else the core one.
    const hsave = document.getElementById(`${uid}-hsave`);
    if (hsave) {
      const s = hereI >= 0 ? study.senses[hereI] : (study?.senses?.length === 1 ? study.senses[0] : null);
      const payload = s
        ? { label: s.label, definition: s.definition, note: s.note || '', refs: s.refs || [] }
        : (study?.summary || prose.def) ? { label: (st?.gloss || 'Core meaning'), definition: study?.summary || prose.def, note: '', refs: [] } : null;
      hsave.innerHTML = payload ? saveButton(uid, 'hero', strongs, payload, ref) : '';
    }

    if (def) {
      const parts = [];
      if (study?.summary) parts.push(`<p>${esc(study.summary)}</p>`);
      else if (prose.def) parts.push(`<p>${esc(prose.def)}</p>`);
      // Debated? Say so — prominently when it's this very verse.
      if (study?.caution) {
        const here = _mentionsVerse(study.caution, ctx);
        parts.push(`<details class="ws-debate${here ? ' here' : ' ws-not-quick'}"><summary><span class="material-symbols-outlined">forum</span>${here ? 'Debated in this verse' : 'A debated point'}<span class="material-symbols-outlined ws-chev">expand_more</span></summary><p>${esc(study.caution)}</p></details>`);
      }
      if (study?.exegesisTip) parts.push(`<div class="ws-tip ws-not-quick"><span class="material-symbols-outlined">lightbulb</span><p>${esc(study.exegesisTip)}</p></div>`);
      if (entry?.audit?.verdict === 'misleading') {
        parts.push(`<div class="ws-flag"><span class="material-symbols-outlined">flag</span>Rhema’s own review flagged this summary as possibly misleading. Lean on the measured range, the verses and the lexicons.</div>`);
      }
      const about = [
        prose.article ? `<p>${esc(prose.article)}</p>` : '',
        prose.caution && !study ? `<p class="ws-caution">${esc(prose.caution)}</p>` : '',
      ].join('');
      if (about) parts.push(`<div class="ws-deep-only">${more('About this word', about)}</div>`);
      def.innerHTML = parts.join('') || '';
      def.classList.toggle('ws-empty', !parts.length);
    }

    // Quick view: every meaning as a tappable chip that opens it in Study.
    const qm = document.getElementById(`${uid}-qm`);
    if (qm) {
      const senses = study?.senses || [];
      qm.innerHTML = senses.length > 1
        ? `<div class="ws-qm-h">${senses.length} meanings</div><div class="ws-qm-chips">${senses.map((s, i) =>
            `<button type="button" class="ws-qm-chip${i === hereI ? ' here' : ''}" style="--c:${senseColor(i)}" onclick="rhemaWordStudyOpenSense('${uid}',${i})"><span>${i + 1}</span>${esc(s.label)}</button>`).join('')}</div>`
        : '';
    }

    if (glance && entry) {
      const chips = [];
      const top = topAuthor(entry);
      if (entry.count) chips.push(`${entry.count.toLocaleString()}× in the NT`);
      if (entry.lxx?.count) chips.push(`${entry.lxx.count.toLocaleString()}× LXX`);
      if (top) chips.push(`mostly ${top.name}`);
      const conf = _DEEP_CONFIDENCE_LABELS[entry.confidence];
      glance.innerHTML = chips.map(c => `<span>${esc(c)}</span>`).join('') +
        (conf ? `<span class="ws-conf ws-conf-${esc(entry.confidence)}">${esc(conf)}</span>` : '');
    }
  }

  // "Your MSB: 'flesh'" — how the reader's own Bible words this occurrence.
  function fillYours(uid, reader, row, spread) {
    const el = document.getElementById(`${uid}-yours`);
    if (!el) return;
    if (!row) { el.innerHTML = ''; return; }
    const r = row.r || {};
    const said = r.kind === 'none' ? '<i>no separate word — it’s in the phrasing</i>' : r.text ? `“<b>${esc(r.text)}</b>”` : '';
    el.innerHTML = said ? `<span class="ws-answer-k">Your ${esc(reader)}</span><span>${said}</span>${spread > 1
      ? `<button type="button" class="ws-linkish" onclick="rhemaWordStudyGo('${uid}','here')">Bibles differ ${spread} ways <span class="material-symbols-outlined">arrow_forward</span></button>` : ''}` : '';
  }

  // ── Here: how translations render this occurrence ────────────────────────
  const WS_LOCAL = ['BSB', 'MSB'];
  // The licensed versions to line up: the reader's Compare set (NIV, NKJV,
  // NASB, KJV + any the reader pinned), so this matches Compare and costs at
  // most one cached chapter download per version.
  function _apiVersions() {
    let list = [];
    try { list = typeof _rhemaCompareList === 'function' ? _rhemaCompareList() : []; } catch {}
    if (!list.length) list = ['NIV', 'NKJV', 'NASB', 'KJV'];
    return list.filter(v => !WS_LOCAL.includes(v));
  }
  function _versionVerseText(ver, book, ch, v) {
    if (WS_LOCAL.includes(ver)) return _rhemaEnglishText(book, ch, v, ver) || '';
    const chap = typeof _vsChapterFromMemory === 'function' ? _vsChapterFromMemory(ver, book, String(ch)) : null;
    return chap ? String(chap[String(v)] || chap[v] || '') : '';
  }
  function _highlight(text, phrase) {
    const t = esc(text);
    if (!phrase) return t;
    const p = esc(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { return t.replace(new RegExp(`(^|[^A-Za-z])(${p})(?![A-Za-z])`), '$1<mark>$2</mark>'); } catch { return t; }
  }

  function _verseDecisions(ctx) {
    const words = (_rhemaText()[ctx.book] || {})[ctx.chapter]?.[ctx.verse] || [];
    const layer = 'nt-greek';
    const decisions = words.map(w => _rhemaMeaningDecision(_rhemaResolveWord(w, ctx.book, ctx.chapter), { layer, book: ctx.book, chapter: ctx.chapter, verse: ctx.verse }));
    return { words, decisions };
  }

  function renderHere(uid, ctx, strongs, entry) {
    const el = document.getElementById(`${uid}-here`);
    if (!el || !ctx) return;
    const { words, decisions } = _verseDecisions(ctx);
    if (!words[ctx.idx]) { el.innerHTML = ''; return; }
    const p = { book: ctx.book, chapter: ctx.chapter, verse: ctx.verse };
    const reader = typeof _rhemaReaderVersion === 'function' ? _rhemaReaderVersion() : 'MSB';
    const apis = _apiVersions();
    const order = [...new Set([reader, 'BSB', 'MSB', ...apis])];
    const rows = [], missing = [];
    for (const ver of order) {
      const text = _versionVerseText(ver, ctx.book, ctx.chapter, ctx.verse);
      if (!text) { if (!WS_LOCAL.includes(ver)) missing.push(ver); continue; }
      const r = _rhemaVersionRenderingsForVerse(p, words, decisions, text, ver)[ctx.idx] || { text: '', kind: '' };
      rows.push({ ver, text, r });
    }
    // Group identical renderings so agreement and disagreement are obvious.
    const groups = new Map();
    for (const row of rows) {
      const key = row.r.kind === 'none' ? '—' : (row.r.text ? row.r.text.toLowerCase() : '?');
      if (!groups.has(key)) groups.set(key, { label: row.r.kind === 'none' ? 'no separate word' : (row.r.text || 'not matched'), kind: row.r.kind, rows: [] });
      groups.get(key).rows.push(row);
    }
    const sorted = [...groups.values()].sort((a, b) => (a.kind === '' ? 1 : 0) - (b.kind === '' ? 1 : 0) || b.rows.length - a.rows.length);
    const spread = sorted.filter(g => g.kind && g.kind !== 'none').length;
    const groupsHtml = sorted.map(g => `<div class="ws-tr-group ws-tr-k-${g.kind || 'none'}">
        <div class="ws-tr-head"><strong>${g.kind === 'inferred' ? '≈ ' : ''}${esc(g.label)}</strong><span>${g.rows.map(r => esc(r.ver)).join(' · ')}</span></div>
        ${more('Read the verse' + (g.rows.length > 1 ? 's' : ''), g.rows.map(r => `<p class="ws-tr-verse"><b>${esc(r.ver)}</b> ${_highlight(r.text, r.r.text)}</p>`).join(''))}
      </div>`).join('');

    // Which measured sense this verse uses.
    let senseLine = '';
    const ref = `${ctx.book} ${ctx.chapter}:${ctx.verse}`;
    // A verified study sense that cites this very verse is the meaning here;
    // the measured data only knows the English wording, so it says that.
    const studySense = (entry?.study?.senses || []).find(x => (x.refs || []).includes(ref));
    if (studySense) {
      senseLine = `<p class="ws-note">Sense here: <b>${esc(studySense.label)}</b> — ${esc(studySense.definition)}</p>`;
    } else if (entry && entry.verseSense && ref in entry.verseSense && entry.senses?.length > 1) {
      const i = entry.verseSense[ref];
      const s = entry.senses[i];
      if (s) senseLine = `<p class="ws-note">Rendered here as “${esc(s.display)}”, like ${s.count} of its ${entry.count} NT uses (${pct(s.share)}%).</p>`;
    }
    const loadBtn = missing.length && !(typeof _vsIsApiLimited === 'function' && _vsIsApiLimited())
      ? `<button type="button" class="ws-btn" onclick="rhemaWordStudyLoadVersions('${uid}')"><span class="material-symbols-outlined">translate</span>Compare ${esc(missing.slice(0, 4).join(', '))}${missing.length > 4 ? ` +${missing.length - 4}` : ''}</button>`
      : '';
    const teaser = spread > 1 ? `versions split ${spread} ways` : (sorted[0]?.kind && sorted[0].kind !== 'none' ? `“${sorted[0].label}”` : '');
    el.innerHTML = section('here', 'translate', 'In this verse',
      `${senseLine}
       <div class="ws-tr">${groupsHtml}</div>
       ${entry?.study?.translationNote ? more('Why translations differ', `<p>${esc(entry.study.translationNote)}</p>`, true) : ''}
       ${loadBtn}`,
      esc(teaser));
    const mine = rows.find(r => r.ver === reader) || rows.find(r => WS_LOCAL.includes(r.ver));
    fillYours(uid, mine?.ver, mine, spread);
    _wsRefreshDeck(uid);
  }

  // Fetch the licensed versions' chapter blocks for this verse (one request
  // per version; stored on the device so it's free next time), then redraw.
  window.rhemaWordStudyLoadVersions = async function (uid) {
    const st = _studies.get(uid);
    if (!st || !st.ctx) return;
    const btn = document.querySelector(`#${uid}-here .ws-btn`);
    if (btn) { btn.disabled = true; btn.textContent = 'Loading translations…'; }
    const vers = _apiVersions().filter(v => !(typeof _vsTransLimited === 'function' && _vsTransLimited(v)) &&
      (typeof _vsBookInScope !== 'function' || _vsBookInScope(v, st.ctx.book)));
    await Promise.all(vers.map(v => Promise.resolve(typeof _vsEnsureChapter === 'function' ? _vsEnsureChapter(v, st.ctx.book, st.ctx.chapter) : null).catch(() => null)));
    renderHere(uid, st.ctx, st.strongs, st.entry);
  };

  // ── Range of meaning ─────────────────────────────────────────────────────
  function _senseName(entry, sense, i) {
    try { const m = _deepSenseMeaning(entry, sense, i); if (m && m.text) return m.text; } catch {}
    return sense.display || '';
  }
  function _refsBySense(entry) {
    const by = new Map();
    for (const [ref, i] of Object.entries(entry.verseSense || {})) {
      if (!by.has(i)) by.set(i, []);
      by.get(i).push(ref);
    }
    return by;
  }
  function _onlyUseHtml(entry, strongs) {
    const target = String(strongs);
    let ref = Object.keys(entry.verseSense || {})[0] || (entry.refs || [])[0] || '';
    let m = String(ref).match(/^(\S+) (\d+):(\d+)$/);
    const T = _rhemaText() || {};
    const findIn = (b, c, v) => ((T[b] || {})[c] || {})[v]?.findIndex(w => String((_rhemaResolveWord(w, b, c) || w)[1]) === target) ?? -1;
    if (!m || findIn(m[1], m[2], m[3]) < 0) {
      m = null;
      outer: for (const b of RHEMA_NT_BOOK_ORDER) for (const c in (T[b] || {})) for (const v in T[b][c]) {
        if (findIn(b, c, v) >= 0) { m = [null, b, c, v]; break outer; }
      }
    }
    if (!m) return null;
    const [, b, c, v] = m;
    const words = T[b][c][v];
    const idx = findIn(b, c, v);
    const greek = words.map((w, i) => i === idx ? `<b>${esc(w[0])}</b>` : esc(w[0])).join(' ');
    const ver = typeof _rhemaReaderVersion === 'function' && WS_LOCAL.includes(_rhemaReaderVersion()) ? _rhemaReaderVersion() : 'MSB';
    const eng = _rhemaEnglishText(b, c, v, ver) || '';
    let engHtml = esc(eng);
    try { if (typeof _rhemaBVEnglishHtml === 'function') engHtml = _rhemaBVEnglishHtml(eng, b, c, v, words, idx, strongs, ver); } catch {}
    const label = `${_rhemaBookName(b) || b} ${c}:${v}`;
    const lxx = entry.lxx?.count ? ` It also appears ${entry.lxx.count}× in the Septuagint (see Through history).` : '';
    return {
      label,
      html: `<p class="ws-once-greek">${greek}</p>
        <p class="ws-once-eng"><b>${esc(ver)}</b> ${engHtml}</p>
        <div class="ws-refs">${_refChip(b, c, v, strongs, label)}</div>
        <p class="ws-fine">Because it is used only here, its meaning rests on this context and the lexicons below.${lxx}</p>`,
    };
  }

  // Each meaning gets its own colour, used by its chip, card and number.
  const SENSE_COLORS = ['#2498df', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#d946ef', '#84cc16'];
  const senseColor = (i) => SENSE_COLORS[i % SENSE_COLORS.length];

  // A verse that shows the meaning, in the reader's own (on-device) Bible,
  // with the word in bold.
  function _exampleHtml(ref, strongs) {
    const m = String(ref || '').match(/^(\S+) (\d+):(\d+)$/);
    if (!m || (typeof isRhemaNTBook === 'function' && !isRhemaNTBook(m[1]))) return '';
    const [, b, c, v] = m;
    try {
      const words = ((_rhemaText() || {})[b] || {})[c]?.[v];
      if (!words) return '';
      const target = String(strongs);
      const idx = words.findIndex(w => String((_rhemaResolveWord(w, b, c) || w)[1]) === target);
      const reader = typeof _rhemaReaderVersion === 'function' ? _rhemaReaderVersion() : 'MSB';
      const ver = WS_LOCAL.includes(reader) ? reader : 'MSB';
      const eng = _rhemaEnglishText(b, c, v, ver) || '';
      if (!eng) return '';
      let html = esc(eng);
      if (idx >= 0 && typeof _rhemaBVEnglishHtml === 'function') html = _rhemaBVEnglishHtml(eng, b, c, v, words, idx, strongs, ver);
      return `<blockquote class="ws-mx-ex"><p>${html}</p><footer>${_refChip(b, c, v, strongs)}<span class="ws-fine">${esc(ver)}</span></footer></blockquote>`;
    } catch { return ''; }
  }

  // The meaning explorer: numbered chips on top (tap one), one meaning card at
  // a time below — what it means, why, a real verse, every other verse, and a
  // save button.
  function meaningsHtml(uid, entry, strongs) {
    const senses = entry.study.senses;
    const st = _studies.get(uid);
    const ref = st?.ctx ? `${st.ctx.book} ${st.ctx.chapter}:${st.ctx.verse}` : '';
    const hereI = ref ? senses.findIndex(x => (x.refs || []).includes(ref)) : -1;
    const sel = st && st.sel != null && st.sel < senses.length ? st.sel : (hereI >= 0 ? hereI : 0);
    if (st) st.sel = sel;
    const n = senses.length;
    const chips = (refs) => {
      const shown = refs.slice(0, 6).map(r => _refChipFromKey(r, strongs)).join('');
      const rest = refs.slice(6).map(r => _refChipFromKey(r, strongs)).join('');
      return (shown ? `<div class="ws-refs">${shown}</div>` : '') + (rest ? more(`All ${refs.length} verses`, `<div class="ws-refs">${rest}</div>`) : '');
    };
    const picks = n > 1 ? `<div class="ws-mx-picks" role="tablist">${senses.map((s, i) =>
      `<button type="button" role="tab" class="ws-mx-pick${i === sel ? ' on' : ''}${i === hereI ? ' here' : ''}" style="--c:${senseColor(i)}" onclick="rhemaWordStudySense('${uid}',${i})"><span class="ws-mx-n">${i + 1}</span><span class="ws-mx-l">${esc(s.label)}</span></button>`).join('')}</div>` : '';
    const cards = senses.map((s, i) => {
      const refs = s.refs || [];
      const example = _exampleHtml(refs[0], strongs);
      return `<article class="ws-mx-card${i === sel ? ' on' : ''}" data-i="${i}" style="--c:${senseColor(i)}">
        <div class="ws-mx-top"><span class="ws-mx-count">${n > 1 ? `Meaning ${i + 1} of ${n}` : 'Its meaning'}</span>${i === hereI ? '<span class="ws-mx-herebadge"><span class="material-symbols-outlined">my_location</span>this verse</span>' : ''}${saveButton(uid, `s${i}`, strongs, { label: s.label, definition: s.definition, note: s.note || '', refs }, ref)}</div>
        <h4 class="ws-mx-label">${esc(s.label)}</h4>
        <p class="ws-mx-def">${esc(s.definition)}</p>
        ${s.note ? `<div class="ws-mx-why"><span class="material-symbols-outlined">psychology_alt</span><p><b>Why</b> ${esc(s.note)}</p></div>` : ''}
        ${example}
        ${chips(example ? refs.slice(1) : refs)}
        ${n > 1 ? `<div class="ws-mx-nav">
          <button type="button" ${i === 0 ? 'disabled' : ''} onclick="rhemaWordStudySense('${uid}',${i - 1})"><span class="material-symbols-outlined">chevron_left</span>${i > 0 ? esc(senses[i - 1].label) : ''}</button>
          <button type="button" ${i === n - 1 ? 'disabled' : ''} onclick="rhemaWordStudySense('${uid}',${i + 1})">${i < n - 1 ? esc(senses[i + 1].label) : ''}<span class="material-symbols-outlined">chevron_right</span></button>
        </div>` : ''}
      </article>`;
    }).join('');
    return `<div class="ws-mx" id="${uid}-mx">${picks}${cards}</div>`;
  }
  window.rhemaWordStudySense = function (uid, i) {
    const mx = document.getElementById(`${uid}-mx`);
    if (!mx) return;
    const st = _studies.get(uid);
    if (st) st.sel = i;
    mx.querySelectorAll('.ws-mx-pick').forEach((b, k) => b.classList.toggle('on', k === i));
    mx.querySelectorAll('.ws-mx-card').forEach(c => c.classList.toggle('on', Number(c.dataset.i) === i));
    const pick = mx.querySelectorAll('.ws-mx-pick')[i];
    if (pick && pick.parentElement) pick.parentElement.scrollTo({ left: Math.max(0, pick.offsetLeft - 12), behavior: 'smooth' });
    _wsFitDeck(uid);
  };
  window.rhemaWordStudyOpenSense = function (uid, i) {
    rhemaWordStudyGo(uid, 'range');
    rhemaWordStudySense(uid, i);
  };

  function rangeHtml(entry, strongs, uid) {
    if (!entry) return '';
    const senses = (entry.senses || []).slice(0, 8);
    const by = _refsBySense(entry);
    const labels = entry.prose?.senseLabels || [];
    const study = entry.study;
    const chips = (refs, n) => {
      const shown = refs.slice(0, n).map(r => _refChipFromKey(r, strongs)).join('');
      const rest = refs.slice(n).map(r => _refChipFromKey(r, strongs)).join('');
      return (shown ? `<div class="ws-refs">${shown}</div>` : '') + (rest ? more(`All ${refs.length} verses`, `<div class="ws-refs">${rest}</div>`) : '');
    };
    // Used once in the NT: there is no range to measure — show the one verse,
    // with the word in bold, and point to the lexicons.
    if (!study?.senses?.length && entry.count === 1) {
      const once = _onlyUseHtml(entry, strongs);
      if (once) return section('range', 'auto_stories', 'Its only New Testament use', once.html, esc(once.label));
    }
    // How the English renders it, measured over every use.
    let measured = '';
    if (senses.length) {
      measured = `<div class="ws-senses">${senses.map((x, i) => {
        const refs = by.get(i) || x.refs || [];
        return `<div class="ws-sense">
          <div class="ws-sense-top"><span class="ws-sense-n">${i + 1}</span><b>${esc(_senseName(entry, x, i))}</b><span class="ws-count">${x.count}× · ${pct(x.share)}%</span></div>
          <div class="ws-bar"><span style="width:${Math.max(pct(x.share), 2)}%"></span></div>
          ${chips(refs, 4)}
        </div>`;
      }).join('')}</div>`;
      if (labels.length > senses.length) {
        measured += `<div class="ws-extra"><div class="ws-extra-h">Also recognised by the lexicons</div>
          <ul>${labels.slice(senses.length).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
      }
    }
    const parts = [];
    if (study?.senses?.length) {
      parts.push(meaningsHtml(uid, entry, strongs));
      if (measured) parts.push(`<div class="ws-deep-only">${more('How the English renders it, measured over every use', measured)}</div>`);
    } else if (measured) {
      parts.push(measured);
    } else if (entry.count) {
      parts.push(`<p class="ws-note">No single English rendering dominates this word — it is usually woven into the phrasing. The lexicons carry its meaning.</p>`);
    }
    // The fine-grained evidence (Deep).
    const detail = [];
    const rare = (entry.rare || []).filter(r => {
      const words = String(r.display || '').toLowerCase().split(/\s+/).filter(Boolean);
      return words.length && words.length <= 3 && !words.some(w => (window.RhemaAlign && RhemaAlign.isGrammar(w)) || /^(according|being|whom)$/.test(w));
    });
    if (rare.length) detail.push(`<p class="ws-fine">Rare renderings: ${rare.slice(0, 6).map(r => `${esc(r.display)}${r.refs?.[0] ? ' ' + _refChipFromKey(r.refs[0], strongs) : ''}`).join(' · ')}</p>`);
    if (entry.untranslated && entry.count && entry.untranslated >= Math.max(2, entry.count * 0.05)) {
      detail.push(`<p class="ws-fine">Woven into the English phrasing with no word of its own ${entry.untranslated}× of ${entry.count}.</p>`);
    }
    if (entry.contexts?.length) {
      detail.push(`<div class="ws-sub-h">Greek company it keeps</div>` + entry.contexts.map((c, i) => `<div class="ws-pattern">
          <div class="ws-sense-top"><b>Pattern ${i + 1}</b><span class="ws-count">${c.n}× · ${c.share}%</span></div>
          <div class="ws-fine">with ${c.companions.map(x => `<em>${esc(x)}</em>`).join(', ')} — rendered ${c.renderings.map(r => r.r === '(absorbed)' ? `in the phrasing ${r.pct}%` : `“${esc(r.r)}” ${r.pct}%`).join(' · ')}</div>
          ${(c.refs || []).length ? `<div class="ws-refs">${c.refs.map(r => _refChipFromKey(r, strongs)).join('')}</div>` : ''}
        </div>`).join(''));
    }
    if (detail.length) parts.push(`<div class="ws-deep-only">${more('More detail', detail.join(''))}</div>`);
    const n = study?.senses?.length || senses.length;
    return section('range', 'auto_awesome', n > 1 ? 'Meanings' : 'Meaning', parts.join(''),
      n > 1 ? `${n} meanings · tap one` : '');
  }

  // ── Authors ──────────────────────────────────────────────────────────────
  function _authorStats(entry) {
    const by = entry.byBook || {};
    const senseByAuthor = {};
    for (const [ref, i] of Object.entries(entry.verseSense || {})) {
      const a = AUTHOR_OF[ref.split(' ')[0]];
      if (!a) continue;
      (senseByAuthor[a.key] = senseByAuthor[a.key] || {})[i] = ((senseByAuthor[a.key] || {})[i] || 0) + 1;
    }
    return AUTHORS.map(a => {
      const count = a.books.reduce((n, b) => n + (by[b] || 0), 0);
      const s = senseByAuthor[a.key] || {};
      const total = Object.values(s).reduce((x, y) => x + y, 0);
      const topI = Object.keys(s).sort((x, y) => s[y] - s[x])[0];
      return { ...a, count, total, topI: topI != null ? Number(topI) : null, topN: topI != null ? s[topI] : 0 };
    }).filter(a => a.count > 0).sort((x, y) => y.count - x.count);
  }
  function topAuthor(entry) {
    const st = entry ? _authorStats(entry) : [];
    return st.length > 1 ? st[0] : null;
  }
  function authorsHtml(entry, strongs) {
    if (!entry || !entry.count) return '';
    const stats = _authorStats(entry);
    if (!stats.length) return '';
    const max = stats[0].count;
    const multiSense = (entry.senses || []).length > 1;
    const rows = stats.map(a => `<div class="ws-author">
        <div class="ws-author-top"><b>${esc(a.name)}</b><span class="ws-count">${a.count}×</span></div>
        <div class="ws-bar ws-bar-author"><span style="width:${Math.max(4, Math.round(100 * a.count / max))}%"></span></div>
        ${multiSense && a.topI != null && a.total >= 2 ? `<div class="ws-fine">mostly “${esc(_senseName(entry, entry.senses[a.topI], a.topI))}” (${a.topN} of ${a.total} measured)</div>` : ''}
      </div>`).join('');
    const studyNotes = (entry.study?.authorNotes || []).map(a => `<div class="ws-author-note"><span class="material-symbols-outlined">edit_note</span><div><p><b>${esc(a.author)}.</b> ${esc(a.note)}</p>${a.refs?.length ? `<div class="ws-refs">${a.refs.map(r => _refChipFromKey(r, strongs)).join('')}</div>` : ''}</div></div>`).join('');
    const note = studyNotes ? studyNotes : entry.audit?.author_note && !/definition|label|digest|entry/i.test(entry.audit.author_note)
      ? `<div class="ws-author-note"><span class="material-symbols-outlined">edit_note</span><p>${esc(entry.audit.author_note)}</p></div>
`
      : '';
    return section('authors', 'groups', 'Who uses it', `${note}<div class="ws-authors">${rows}</div>`,
      stats.length > 1 ? `mostly ${esc(stats[0].name)} (${stats[0].count})` : esc(stats[0].name));
  }

  // ── History ──────────────────────────────────────────────────────────────
  function historyHtml(entry, lex, strongs) {
    const items = [];
    const bg = (period) => (entry?.study?.background || []).filter(b => b.period === period)
      .map(b => `<p class="ws-bg">${esc(b.note)} <span class="ws-cite">${esc(b.citation)}</span></p>`).join('');
    const lsj = _lsjText(entry);
    if (lsj) {
      const txt = _decodeEntities(lsj);
      const cut = /…\s*$/.test(txt);
      items.push({ short: 'classical', era: 'c. 800–300 BC', title: 'Classical Greek', icon: 'account_balance',
        body: `${bg('classical')}${more(cut ? 'Read the LSJ excerpt' : 'Read the LSJ entry', `<p class="ws-lsj">${esc(txt)}</p>`)}` });
    }
    if (entry?.lxx?.count) {
      const heb = (entry.lxx.hebrew || []).slice(0, 4).map(h => `<span class="ws-heb" dir="rtl">${esc(h.lemma || '')}</span> <span class="ws-fine">H${esc(h.h)} · ${h.count}×</span>`).join('<br>');
      items.push({ short: `LXX ${entry.lxx.count}×`, era: 'c. 250–100 BC', title: 'Septuagint', icon: 'menu_book',
        body: `<p>${entry.lxx.count.toLocaleString()}× in ${entry.lxx.books} book${entry.lxx.books === 1 ? '' : 's'} of the Greek Old Testament — the Bible the apostles quoted.</p>
          ${bg('septuagint')}
          ${heb ? `<p class="ws-fine">It translates the Hebrew:</p><p>${heb}</p>` : ''}
          ${(entry.lxx.refs || []).length ? `<div class="ws-refs">${entry.lxx.refs.slice(0, 6).map(r => _refChipFromKey(r, strongs)).join('')}</div>` : ''}` });
    }
    const mm = _mmText(strongs);
    if (mm) {
      const paras = cleanMoultonMilligan(mm);
      items.push({ short: 'papyri', era: 'c. 300 BC – AD 300', title: 'Everyday Greek: papyri & inscriptions', icon: 'receipt_long',
        body: `${bg('papyri')}<p class="ws-fine">Letters, contracts and inscriptions of the NT world.</p>
          <p class="ws-mm">${esc(paras[0] || '').slice(0, 420)}${(paras[0] || '').length > 420 ? '…' : ''}</p>
          ${paras.length > 1 || (paras[0] || '').length > 420 ? more('Read the full entry', paras.map(p => `<p class="ws-mm">${esc(p)}</p>`).join('')) : ''}` });
    }
    if (entry?.count) {
      const crit = entry.critical?.count;
      const books = Object.keys(entry.byBook || {}).length;
      items.push({ short: `NT ${entry.count}×`, era: 'c. AD 45–95', title: 'New Testament', icon: 'auto_stories',
        body: `<p>${entry.count.toLocaleString()}× in ${books} book${books === 1 ? '' : 's'} of the Majority (Byzantine) text${_critNote(entry.count, crit)}.</p>` });
    }
    if (entry?.classical?.af) {
      items.push({ short: 'early church', era: 'c. AD 95–150', title: 'Apostolic Fathers', icon: 'history_edu',
        body: `${bg('apostolic')}<p>About ${entry.classical.af}× in Clement, Ignatius, Polycarp, the Didache and Hermas — whether the next generation of Christians kept the word, and how.</p>` });
    }
    if (!items.length) return '';
    return section('history', 'timeline', 'Through history', `<ol class="ws-timeline">${items.map(it => `<li>
        <div class="ws-tl-dot"><span class="material-symbols-outlined">${it.icon}</span></div>
        <div class="ws-tl-body"><div class="ws-tl-h"><b>${esc(it.title)}</b><span>${esc(it.era)}</span></div>${it.body}</div>
      </li>`).join('')}</ol>
      <p class="ws-fine">Outside sources show how Greek speakers used the word; context in the biblical text decides what the author meant.</p>`,
      esc(items.map(it => it.short).join(' · ')));
  }

  // Majority vs critical count. A small gap is textual variation; a large one
  // means the two editions catalogue the word differently (SBLGNT files δεῖ
  // under δέω and πρῶτον under πρῶτος), so the numbers aren't comparable.
  function _critNote(count, crit) {
    if (crit == null) return '';
    if (crit === count) return ', the same in the critical text (SBLGNT)';
    const diff = Math.abs(count - crit);
    if (diff <= Math.max(3, Math.round(count * 0.1))) {
      return `; ${crit.toLocaleString()}× in the critical text (SBLGNT) — the ${diff} difference comes from textual variants`;
    }
    return ' (the critical text, SBLGNT, files this word under a different dictionary entry, so its count isn’t directly comparable)';
  }

  // ── Lexicons (tabbed) ────────────────────────────────────────────────────
  function lexiconsHtml(lex, strongs, entry, uid) {
    const tabs = [];
    if (lex.abbott_smith && _rhemaAbbottMatchesLex(lex)) {
      tabs.push(['Abbott-Smith', `<div class="ws-as">${cleanAbbottSmith(lex.abbott_smith, strongs)}</div><p class="ws-fine">A Manual Greek Lexicon of the NT (1922). References are tappable.</p>`]);
    }
    const mm = _mmText(strongs);
    if (mm) tabs.push(['Moulton–Milligan', cleanMoultonMilligan(mm).map(p => `<p class="ws-mm">${esc(p)}</p>`).join('') + '<p class="ws-fine">The Vocabulary of the Greek Testament (1930), from the papyri and inscriptions.</p>']);
    if (_lsjText(entry)) tabs.push(['LSJ', `<p class="ws-lsj">${esc(_decodeEntities(_lsjText(entry)))}</p><p class="ws-fine">Liddell–Scott–Jones, A Greek–English Lexicon (classical Greek).</p>`]);
    if (lex.extended || lex.brief) tabs.push(['Dodson', `<p>${esc(lex.extended || lex.brief)}</p>`]);
    if (lex.strongs_def) {
      tabs.push(["Strong's", `<p>${esc(String(lex.strongs_def).trim())}</p>${lex.kjv_def ? `<p class="ws-fine">KJV renders it: ${esc(String(lex.kjv_def).replace(/^--/, ''))}</p>` : ''}${lex.deriv ? `<p class="ws-fine">Derivation: ${esc(lex.deriv)}</p>` : ''}`]);
    }
    if (!tabs.length) return '';
    const name = `${uid}-lex`;
    return section('lexicons', 'library_books', 'Lexicons', `<div class="ws-tabs" role="tablist">${tabs.map(([t], i) =>
        `<button type="button" role="tab" class="ws-tab${i === 0 ? ' on' : ''}" onclick="rhemaWordStudyTab('${name}',${i},this)">${esc(t)}</button>`).join('')}</div>
      ${tabs.map(([, body], i) => `<div class="ws-pane${i === 0 ? ' on' : ''}" data-ws-pane="${name}-${i}">${body}</div>`).join('')}`,
      esc(tabs.length > 2 ? `${tabs[0][0]}, ${tabs[1][0]} +${tabs.length - 2}` : tabs.map(t => t[0]).join(', ')));
  }
  window.rhemaWordStudyTab = function (name, i, btn) {
    const root = btn.closest('.ws-sec');
    if (!root) return;
    root.querySelectorAll('.ws-tab').forEach((b, k) => b.classList.toggle('on', k === i));
    root.querySelectorAll('.ws-pane').forEach(p => p.classList.toggle('on', p.dataset.wsPane === `${name}-${i}`));
  };

  // ── Method ───────────────────────────────────────────────────────────────
  function methodHtml(entry) {
    if (!entry) return '';
    const why = [...new Set(entry.why || [])];
    return section('method', 'science', 'How we know', `<ul class="ws-method">
        <li>Every verse cited for a sense is checked against the Greek text — the word really occurs there.</li>
        <li>BSB words come from the Berean translators’ own word-for-word tables; other versions are matched to them word by word (≈ marks a match by position).</li>
        <li>Across-translation counts are made on your device from each version’s own text.</li>
      </ul>` + more('Evidence trail',
      `${why.map(w => `<p>${esc(w)}</p>`).join('')}
       <p class="ws-fine">English renderings are measured by aligning every occurrence in the Byzantine text with the Majority Standard Bible (and checked independently against the Berean Standard Bible), then grouping the English renderings. Translation wording approximates meaning; where the lexicons recognise a sense the English hides, it is listed separately.</p>`));
  }


  // ── Across translations: every NT use, per version ───────────────────────
  // How each version renders this word across the whole New Testament. MSB and
  // BSB live on the device, so they measure instantly. Licensed versions (NIV,
  // NKJV, NASB, KJV, ESV…) are measured ON THIS DEVICE from that version's own
  // text: the chapters it needs are downloaded once into the same permanent
  // store the reader uses (ESV: session memory only, per Crossway), and each
  // occurrence is lined up word-for-word through the Berean tables. Nothing is
  // precomputed or redistributed — it's the reader's own copy, counted.
  const _wsOccCache = new Map();
  function _wsOccurrences(strongs) {
    const key = `${_rhemaTextMode}|${strongs}`;
    if (_wsOccCache.has(key)) return _wsOccCache.get(key);
    const T = _rhemaTextForMode(_rhemaTextMode) || {};
    const out = [];
    for (const book of RHEMA_NT_BOOK_ORDER) {
      const B = T[book]; if (!B) continue;
      for (const ch of Object.keys(B).sort((a, b) => a - b)) {
        for (const v of Object.keys(B[ch]).sort((a, b) => a - b)) {
          const words = B[ch][v];
          for (let i = 0; i < words.length; i++) {
            const r = _rhemaResolveWord(words[i], book, ch);
            if (String((r || words[i])[1]) === String(strongs)) out.push({ book, ch, v, idx: i });
          }
        }
      }
    }
    _wsOccCache.set(key, out);
    if (_wsOccCache.size > 30) _wsOccCache.delete(_wsOccCache.keys().next().value);
    return out;
  }

  function _wsVersionList() {
    const reader = typeof _rhemaReaderVersion === 'function' ? _rhemaReaderVersion() : 'MSB';
    const list = [...new Set(['MSB', 'BSB', reader, ..._apiVersions()])];
    const known = typeof VS_VERSIONS !== 'undefined' ? new Set(VS_VERSIONS.map(v => v.code)) : null;
    return list.filter(v => !known || known.has(v));
  }
  const _wsIsLocal = (ver) => WS_LOCAL.includes(ver);
  const _wsVerStats = new Map();   // `${ver}|${mode}|${strongs}` → stats
  const _wsVerBusy = new Map();    // same key → { done, total, phase }

  function _wsChapterText(ver, book, ch) {
    if (_wsIsLocal(ver)) return null;
    return typeof _vsChapterFromMemory === 'function' ? _vsChapterFromMemory(ver, book, String(ch)) : null;
  }
  function _wsVerseText(ver, book, ch, v) {
    if (_wsIsLocal(ver)) return _rhemaEnglishText(book, ch, v, ver) || '';
    const chap = _wsChapterText(ver, book, ch);
    return chap ? String(chap[String(v)] || '') : '';
  }
  function _wsMissingChapters(ver, occs) {
    if (_wsIsLocal(ver)) return [];
    const seen = new Set(), out = [];
    for (const o of occs) {
      const k = `${o.book} ${o.ch}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (typeof _vsBookInScope === 'function' && !_vsBookInScope(ver, o.book)) continue;
      if (!_wsChapterText(ver, o.book, o.ch)) out.push([o.book, o.ch]);
    }
    return out;
  }
  const _wsTidy = (t) => {
    const words = String(t || '').split(/\s+/).filter(Boolean);
    const isG = (w) => window.RhemaAlign && RhemaAlign.isGrammar(w.toLowerCase().replace(/[’']s$/, ''));
    let a = 0, b = words.length;
    while (a < b - 1 && isG(words[a])) a++;
    while (b - 1 > a && isG(words[b - 1])) b--;
    return words.slice(a, b).join(' ');
  };

  async function _wsMeasure(uid, strongs, ver) {
    const key = `${ver}|${_rhemaTextMode}|${strongs}`;
    if (_wsVerStats.has(key) || _wsVerBusy.has(key)) return;
    const busy = { done: 0, total: 0, phase: 'prepare' };
    _wsVerBusy.set(key, busy);
    const redraw = () => _wsRenderVersions(uid, strongs);
    try {
      if (typeof _ensureRhemaBsbAlign === 'function') await _ensureRhemaBsbAlign();
      if (ver === 'BSB' && typeof _rhemaLoadDataFile === 'function') await _rhemaLoadDataFile('rhema-bsb.js').catch(() => {});
      const occs = _wsOccurrences(strongs);
      // 1. Chapters (licensed versions only), one at a time so each block
      //    download covers its neighbours.
      let missing = _wsMissingChapters(ver, occs);
      if (missing.length) {
        busy.phase = 'download'; busy.total = missing.length; redraw();
        for (const [book, ch] of missing) {
          if (typeof _vsTransLimited === 'function' && _vsTransLimited(ver)) { busy.limited = true; break; }
          if (!_wsChapterText(ver, book, ch)) { try { await _vsEnsureChapter(ver, book, ch); } catch {} }
          busy.done++;
          if (busy.done % 3 === 0) redraw();
        }
      }
      // 2. Line up every occurrence, in slices so the sheet stays responsive.
      busy.phase = 'measure'; busy.done = 0; busy.total = occs.length; redraw();
      const lex = (window.RhemaLexicon || {})[strongs] || {};
      const st = _studies.get(uid);
      let meanings = [];
      try { meanings = [...(_deepExpectedMeaningWords(st?.entry || {}, lex) || [])].slice(0, 12); } catch {}
      const baseDecision = _rhemaMeaningDecision(['', strongs, ''], { layer: 'nt-greek' });
      const gloss = String(baseDecision.gloss || '').split(/[;,(]/)[0];
      const tally = new Map();
      let none = 0, unmatched = 0, noText = 0;
      const T = _rhemaTextForMode(_rhemaTextMode) || {};
      let lastVerse = '', verseCache = null;
      for (let k = 0; k < occs.length; k++) {
        const o = occs[k];
        const vk = `${o.book} ${o.ch}:${o.v}`;
        if (vk !== lastVerse) {
          const words = T[o.book][o.ch][o.v];
          const bsbEng = _rhemaBsbEnglishForTokens(words, o.book, o.ch, o.v);
          const text = ver === 'BSB' ? null : _wsVerseText(ver, o.book, o.ch, o.v);
          verseCache = { words, bsbEng, text };
          lastVerse = vk;
        }
        let r;
        if (ver === 'BSB') {
          r = RhemaAlign.bsbRenderings([verseCache.bsbEng[o.idx]])[0];
        } else if (!verseCache.text) {
          noText++; continue;
        } else {
          const items = verseCache.words.map((w, i) => i === o.idx ? { bsb: verseCache.bsbEng[i], gloss, meanings } : { bsb: verseCache.bsbEng[i] });
          r = RhemaAlign.bridgeToVersion(items, verseCache.text)[o.idx];
        }
        if (r.kind === 'none') none++;
        else if (!r.text) unmatched++;
        else {
          let shown = _wsTidy(r.text);
          // "Then"/"But" only because they open the sentence → "then"/"but";
          // capitals mid-sentence (God, He, Lord) are kept.
          const text = verseCache.text || '';
          if (r.start != null && /^[A-Z][a-z]/.test(shown) && (r.start === 0 || /[.!?“"‘'(—:;]\s*$/.test(text.slice(0, r.start)))) {
            shown = shown.charAt(0).toLowerCase() + shown.slice(1);
          }
          const norm = shown.toLowerCase();
          if (!tally.has(norm)) tally.set(norm, { forms: new Map(), count: 0, refs: [], approx: 0 });
          const t = tally.get(norm);
          t.count++;
          t.forms.set(shown, (t.forms.get(shown) || 0) + 1);
          if (r.kind === 'inferred') t.approx++;
          if (t.refs[t.refs.length - 1] !== vk) t.refs.push(vk);
        }
        if (k % 150 === 149) { busy.done = k + 1; redraw(); await new Promise(res => setTimeout(res, 0)); }
      }
      const renderings = [...tally.values()].map(t => ({
        text: [...t.forms.entries()].sort((a, b) => b[1] - a[1])[0][0], count: t.count, refs: t.refs, approx: t.approx,
      })).sort((a, b) => b.count - a.count);
      _wsVerStats.set(key, { ver, total: occs.length, matched: occs.length - none - unmatched - noText, none, unmatched, noText, renderings, limited: !!busy.limited });
    } finally {
      _wsVerBusy.delete(key);
      redraw();
    }
  }

  window.rhemaWordStudyVersion = function (uid, ver) {
    const st = _studies.get(uid);
    if (!st) return;
    st.ver = ver;
    const key = `${ver}|${_rhemaTextMode}|${st.strongs}`;
    // Local versions measure straight away; a licensed version measures
    // straight away only when its chapters are already on the device.
    if (!_wsVerStats.has(key) && (_wsIsLocal(ver) || !_wsMissingChapters(ver, _wsOccurrences(st.strongs)).length)) {
      _wsMeasure(uid, st.strongs, ver);
    }
    _wsRenderVersions(uid, st.strongs);
  };
  window.rhemaWordStudyMeasure = function (uid, ver) {
    const st = _studies.get(uid);
    if (st) _wsMeasure(uid, st.strongs, ver);
  };

  function _wsRenderVersions(uid, strongs) {
    const el = document.getElementById(`${uid}-versions`);
    const st = _studies.get(uid);
    if (!el || !st) return;
    const vers = _wsVersionList();
    const sel = st.ver || vers[0];
    const keyOf = (v) => `${v}|${_rhemaTextMode}|${strongs}`;
    const chips = vers.map(v => {
      const done = _wsVerStats.has(keyOf(v));
      return `<button type="button" class="ws-vchip${v === sel ? ' on' : ''}${done ? ' done' : ''}" onclick="rhemaWordStudyVersion('${uid}','${esc(v)}')">${esc(v)}${done ? ' ✓' : ''}</button>`;
    }).join('');
    const stats = _wsVerStats.get(keyOf(sel));
    const busy = _wsVerBusy.get(keyOf(sel));
    let body = '';
    if (busy) {
      const pctDone = busy.total ? Math.round(100 * busy.done / busy.total) : 0;
      body = `<div class="ws-progress"><div class="ws-note">${busy.phase === 'download'
        ? `Downloading ${esc(sel)}’s New Testament chapters for this word… ${busy.done}/${busy.total}`
        : busy.phase === 'measure' ? `Lining up all ${busy.total.toLocaleString()} uses in ${esc(sel)}…` : 'Preparing…'}</div>
        <div class="ws-bar"><span style="width:${Math.max(3, pctDone)}%"></span></div></div>`;
    } else if (stats) {
      const top = stats.renderings.slice(0, 14);
      const max = top[0]?.count || 1;
      const covered = stats.total - stats.noText;
      body = `<p class="ws-note"><b>${esc(sel)}</b> renders it <b>${stats.renderings.length}</b> different way${stats.renderings.length === 1 ? '' : 's'} across ${covered.toLocaleString()} NT use${covered === 1 ? '' : 's'}${top[0] ? ` — most often “${esc(top[0].text)}” (${Math.round(100 * top[0].count / Math.max(1, covered))}%)` : ''}.</p>
        <div class="ws-vlist">${top.map(r => `<div class="ws-vrow">
            <div class="ws-sense-top"><b>${esc(r.text)}</b>${r.approx ? `<span class="ws-fine" title="Some matched by position">≈${r.approx}</span>` : ''}<span class="ws-count">${r.count}× · ${Math.round(100 * r.count / Math.max(1, covered))}%</span></div>
            <div class="ws-bar"><span style="width:${Math.max(2, Math.round(100 * r.count / max))}%"></span></div>
            ${more(`${r.refs.length} verse${r.refs.length === 1 ? '' : 's'}`, `<div class="ws-refs">${r.refs.slice(0, 60).map(x => _refChipFromKey(x, strongs)).join('')}${r.refs.length > 60 ? `<span class="ws-fine">+${r.refs.length - 60} more</span>` : ''}</div>`)}
          </div>`).join('')}</div>
        ${stats.renderings.length > top.length ? `<p class="ws-fine">…and ${stats.renderings.length - top.length} rarer renderings.</p>` : ''}
        <p class="ws-fine">${[
          stats.none ? `${stats.none} use${stats.none === 1 ? '' : 's'} with no separate English word` : '',
          stats.unmatched ? `${stats.unmatched} not confidently matched` : '',
          stats.noText ? `${stats.noText} in verses ${esc(sel)} doesn’t have${stats.limited ? ' (download limit reached — try again later)' : ''}` : '',
        ].filter(Boolean).join(' · ')}</p>`;
    } else if (!_wsIsLocal(sel)) {
      const missing = _wsMissingChapters(sel, _wsOccurrences(strongs)).length;
      const limited = typeof _vsTransLimited === 'function' && _vsTransLimited(sel);
      body = limited
        ? `<p class="ws-note">${esc(sel)} can’t be downloaded right now (its usage limit is reached). Try again later.</p>`
        : `<p class="ws-note">To count how ${esc(sel)} translates this word everywhere it appears, Rhema needs ${missing} New Testament chapter${missing === 1 ? '' : 's'} of ${esc(sel)} on this device. They download once${sel === 'ESV' ? ' for this session (Crossway doesn’t allow saving the ESV)' : ' and stay for offline reading'}.</p>
           <button type="button" class="ws-btn" onclick="rhemaWordStudyMeasure('${uid}','${esc(sel)}')"><span class="material-symbols-outlined">download</span>Measure ${esc(sel)} across the NT</button>`;
    }
    // Side-by-side once two or more versions are measured.
    const measured = vers.map(v => _wsVerStats.get(keyOf(v))).filter(Boolean);
    const table = measured.length >= 2 ? `<div class="ws-vtable"><div class="ws-sub-h">Side by side</div>
      <table><thead><tr><th>Version</th><th>Most often</th><th>Ways</th></tr></thead><tbody>${measured.map(m => {
        const covered = Math.max(1, m.total - m.noText);
        const t = m.renderings[0];
        return `<tr><td><b>${esc(m.ver)}</b></td><td>${t ? `${esc(t.text)} <span class="ws-fine">${Math.round(100 * t.count / covered)}%</span>` : '—'}${m.renderings[1] ? `<div class="ws-fine">then ${esc(m.renderings[1].text)} ${Math.round(100 * m.renderings[1].count / covered)}%</div>` : ''}</td><td>${m.renderings.length}</td></tr>`;
      }).join('')}</tbody></table></div>` : '';
    const top = stats?.renderings?.[0];
    const teaser = top ? `${sel}: “${top.text}” ${Math.round(100 * top.count / Math.max(1, stats.total - stats.noText))}%` : 'every NT use, per version';
    el.innerHTML = section('versions', 'compare_arrows', 'Across translations',
      `<div class="ws-vchips">${chips}</div>${body || '<p class="ws-fine">Counting…</p>'}${table}`,
      esc(teaser));
    _wsRefreshDeck(uid);
  }

  // ── Saved meanings ──────────────────────────────────────────────────────
  // Kept on this device. Each saved meaning carries the word, the meaning,
  // why, its verses, and the verse it was saved from.
  const SAVE_KEY = 'rhemaSavedMeanings';
  const _wsSave = new Map(); // `${uid}:${key}` → item ready to save
  function _savedList() { try { const l = JSON.parse(_ls.get(SAVE_KEY, '[]')); return Array.isArray(l) ? l : []; } catch { return []; } }
  function _savedWrite(list) { _ls.set(SAVE_KEY, JSON.stringify(list.slice(0, 500))); }
  const _savedHas = (id) => _savedList().some(x => x.id === id);
  function saveButton(uid, key, strongs, payload, ctxRef) {
    const lex = (window.RhemaLexicon || {})[strongs] || {};
    const item = {
      id: `${strongs}|${payload.label}`, strongs: String(strongs), lemma: lex.lemma || '', translit: lex.translit || '',
      label: payload.label, definition: payload.definition || '', note: payload.note || '',
      refs: (payload.refs || []).slice(0, 8), verse: ctxRef || '',
    };
    _wsSave.set(`${uid}:${key}`, item);
    const on = _savedHas(item.id);
    return `<button type="button" class="ws-save${on ? ' on' : ''}" data-save-id="${esc(item.id)}" aria-pressed="${on}" onclick="event.stopPropagation();rhemaWordStudySave('${uid}','${key}')"><span class="material-symbols-outlined">${on ? 'bookmark_added' : 'bookmark_add'}</span><span class="ws-save-l">${on ? 'Saved' : 'Save'}</span></button>`;
  }
  function _syncSaveButtons(id, on) {
    document.querySelectorAll('.ws-save').forEach(b => {
      if (b.dataset.saveId !== id) return;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = `<span class="material-symbols-outlined">${on ? 'bookmark_added' : 'bookmark_add'}</span><span class="ws-save-l">${on ? 'Saved' : 'Save'}</span>`;
    });
    document.querySelectorAll('.ws-saved-n').forEach(n => { const c = _savedList().length; n.textContent = c ? String(c) : ''; });
  }
  window.rhemaWordStudySave = function (uid, key) {
    const item = _wsSave.get(`${uid}:${key}`);
    if (!item) return;
    let list = _savedList();
    const had = list.some(x => x.id === item.id);
    list = had ? list.filter(x => x.id !== item.id) : [{ ...item, savedAt: Date.now() }, ...list];
    _savedWrite(list);
    _syncSaveButtons(item.id, !had);
    _wsToast(had ? 'Removed from Saved meanings'
      : `Saved “${esc(item.label)}” <button type="button" onclick="rhemaShowSavedMeanings()">View</button>`);
  };
  function _wsToast(html) {
    let t = document.getElementById('wsToast');
    if (!t) { t = document.createElement('div'); t.id = 'wsToast'; t.className = 'ws-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = html;
    t.classList.add('on');
    clearTimeout(_wsToast._t);
    _wsToast._t = setTimeout(() => t.classList.remove('on'), 2800);
  }

  // The Saved meanings list (Reader menu → Saved meanings, or the bookmark
  // button in any word study).
  window.rhemaSavedMeaningsHtml = function () {
    const list = _savedList();
    if (!list.length) {
      return `<div class="ws-saved-empty"><span class="material-symbols-outlined">bookmarks</span>
        <p><b>No saved meanings yet.</b></p>
        <p>Open any Greek word, find a meaning you want to remember, and tap <b>Save</b>. It will wait for you here.</p></div>`;
    }
    const verseChip = (ref, strongs) => {
      const m = String(ref || '').match(/^(\S+) (\d+):(\d+)$/);
      if (!m) return '';
      return `<button type="button" class="ws-ref" onclick="closeRhemaReaderPanel();setTimeout(()=>jumpToRhemaVerse('${esc(m[1])}','${esc(m[2])}','${esc(m[3])}','${esc(strongs)}'),220)">${esc(`${_rhemaBookName(m[1]) || m[1]} ${m[2]}:${m[3]}`)}</button>`;
    };
    return `<div class="ws-saved">
      <p class="ws-saved-intro">${list.length} saved meaning${list.length === 1 ? '' : 's'} · newest first</p>
      ${list.map((x, i) => `<article class="ws-saved-item" style="--c:${senseColor(i)}">
        <div class="ws-saved-top">
          <button type="button" class="ws-saved-word" onclick="rhemaOpenWordStudy('${esc(x.strongs)}')"><span class="ws-saved-lemma">${esc(x.lemma)}</span><span class="ws-saved-tr">${esc(x.translit)}</span></button>
          <button type="button" class="ws-saved-x" aria-label="Remove" onclick="rhemaRemoveSavedMeaning('${esc(x.id)}')"><span class="material-symbols-outlined">close</span></button>
        </div>
        <h4>${esc(x.label)}</h4>
        <p>${esc(x.definition)}</p>
        ${x.note ? more('Why', `<p>${esc(x.note)}</p>`) : ''}
        <div class="ws-refs">${x.verse ? `<span class="ws-fine">Saved from</span>${verseChip(x.verse, x.strongs)}` : ''}${(x.refs || []).filter(r => r !== x.verse).slice(0, 4).map(r => verseChip(r, x.strongs)).join('')}</div>
        <button type="button" class="ws-btn" onclick="rhemaOpenWordStudy('${esc(x.strongs)}')"><span class="material-symbols-outlined">menu_book</span>Open the word study</button>
      </article>`).join('')}
    </div>`;
  };
  window.rhemaRemoveSavedMeaning = function (id) {
    _savedWrite(_savedList().filter(x => x.id !== id));
    _syncSaveButtons(id, false);
    const body = document.getElementById('rrpSubBody');
    if (body && body.querySelector('.ws-saved, .ws-saved-empty')) body.innerHTML = rhemaSavedMeaningsHtml();
  };
  window.rhemaShowSavedMeanings = function () {
    if (typeof closeRhemaSheet === 'function') closeRhemaSheet();
    if (typeof openRhemaReaderPanel !== 'function') return;
    openRhemaReaderPanel();
    setTimeout(() => showReaderPanelSection('meanings'), 30);
  };
  // Open a word's study without a verse (from Saved meanings).
  window.rhemaOpenWordStudy = function (strongs) {
    const lex = (window.RhemaLexicon || {})[strongs];
    if (!lex) return;
    if (typeof closeRhemaReaderPanel === 'function') closeRhemaReaderPanel();
    setTimeout(() => {
      const morph = typeof _findAnyMorphForStrongs === 'function' ? _findAnyMorphForStrongs(strongs) : '';
      window._rhemaWordCtx = null;
      _rhemaActiveWord = [lex.lemma, Number(strongs), morph || ''];
      _rhemaActiveWordLayer = 'nt-greek';
      const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
      set('rhemaSheetSurface', lex.lemma || '');
      set('rhemaSheetStrongs', `G${strongs}`);
      set('rhemaSheetLemma', `${lex.lemma || ''}  (${lex.translit || ''})`);
      document.getElementById('rhemaWlBackBtn')?.classList.add('hidden');
      showRhemaTab('definition', _rhemaActiveWord);
      const sheet = document.getElementById('rhemaSheet');
      sheet?.classList.add('open');
      document.getElementById('rhemaSheetBackdrop')?.classList.add('visible');
      if (typeof initRhemaSwipeDown === 'function') initRhemaSwipeDown(sheet);
    }, 240);
  };

  // ── First-run tour ──────────────────────────────────────────────────────
  // Four short tips the first time a word study opens; replay from "?".
  const TOUR_KEY = 'rhemaWsTourDone';
  const TOUR = [
    { sel: '.ws-hero', title: 'The answer first', text: 'What this word means in this verse, and how your Bible words it. Many questions end right here.' },
    { sel: '.ws-depth', title: 'Choose your depth', text: '<b>Quick</b> is just the answer. <b>Study</b> adds every meaning and the translations. <b>Deep</b> adds history, the lexicons and the evidence.' },
    { sel: '.ws-dtabs', title: 'Swipe through cards', text: 'Swipe sideways (or tap a tab) for each meaning, this verse in other Bibles, how translations render the word, and who uses it.' },
    { sel: '.ws-save', title: 'Save a meaning', text: 'Tap <b>Save</b> on any meaning to keep it. Find them all under <b>Saved</b> here, or in the Reader menu.' },
  ];
  let _tour = null;
  window.rhemaWordStudyTour = function (uid, force) {
    if (!force && _ls.get(TOUR_KEY, '')) return;
    const root = document.getElementById(uid);
    if (!root || !root.offsetParent) return;
    if (_wsDepth === 'quick') rhemaWordStudyDepth(uid, 'study');
    _tour = { uid, i: 0 };
    _tourShow();
  };
  function _tourEls() {
    let spot = document.getElementById('wsTourSpot'), tip = document.getElementById('wsTourTip');
    if (!spot) {
      spot = document.createElement('div'); spot.id = 'wsTourSpot'; spot.className = 'ws-tour-spot';
      tip = document.createElement('div'); tip.id = 'wsTourTip'; tip.className = 'ws-tour-tip'; tip.setAttribute('role', 'dialog');
      document.body.append(spot, tip);
    }
    return { spot, tip };
  }
  function _tourShow() {
    if (!_tour) return;
    const root = document.getElementById(_tour.uid);
    const steps = TOUR.filter(s => root && [...root.querySelectorAll(s.sel)].some(el => el.offsetParent));
    const step = steps[_tour.i];
    if (!root || !step) return _tourEnd();
    const target = [...root.querySelectorAll(step.sel)].find(el => el.offsetParent);
    // Scroll only the sheet's own scroller (scrollIntoView would also move the
    // page behind the sheet).
    let sc = target.parentElement;
    while (sc && sc !== document.body) {
      const oy = getComputedStyle(sc).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight) break;
      sc = sc.parentElement;
    }
    if (sc && sc !== document.body) {
      const tr = target.getBoundingClientRect(), sr = sc.getBoundingClientRect();
      if (tr.top < sr.top + 8 || tr.bottom > sr.bottom - 8) sc.scrollTop += tr.top - sr.top - 24;
    }
    const r = target.getBoundingClientRect();
    const { spot, tip } = _tourEls();
    const pad = 6;
    Object.assign(spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.min(r.height, window.innerHeight * 0.5) + pad * 2}px` });
    const last = _tour.i === steps.length - 1;
    tip.innerHTML = `<div class="ws-tour-step">${_tour.i + 1} / ${steps.length}</div><h4>${step.title}</h4><p>${step.text}</p>
      <div class="ws-tour-btns"><button type="button" class="ws-tour-skip" onclick="rhemaWordStudyTourEnd()">${last ? '' : 'Skip'}</button><button type="button" class="ws-tour-next" onclick="rhemaWordStudyTourNext()">${last ? 'Got it' : 'Next'}</button></div>`;
    spot.classList.add('on'); tip.classList.add('on');
    const below = r.top + Math.min(r.height, window.innerHeight * 0.5) + 14;
    const th = tip.offsetHeight || 150;
    const top = below + th < window.innerHeight - 8 ? below : Math.max(8, r.top - th - 14);
    tip.style.top = `${top}px`;
  }
  window.rhemaWordStudyTourNext = function () { if (_tour) { _tour.i++; _tourShow(); } };
  window.rhemaWordStudyTourEnd = _tourEnd;
  function _tourEnd() {
    _tour = null;
    _ls.set(TOUR_KEY, '1');
    document.getElementById('wsTourSpot')?.classList.remove('on');
    document.getElementById('wsTourTip')?.classList.remove('on');
  }

  // ── Main entry ───────────────────────────────────────────────────────────
  const _studies = new Map();
  let _seq = 0;

  window.renderRhemaWordStudy = function (strongs, morph, layer) {
    const activeWord = _rhemaActiveWord && String(_rhemaActiveWord[1]) === String(strongs) ? _rhemaActiveWord : ['', strongs, morph || ''];
    const ctxRaw = _ctxFor(strongs);
    const ctx = ctxRaw && layer === 'nt-greek' && isRhemaNTBook(ctxRaw.book) ? ctxRaw : null;
    const decision = _rhemaMeaningDecision(activeWord, ctxRaw
      ? { layer, book: ctxRaw.book, chapter: ctxRaw.chapter, verse: ctxRaw.verse }
      : { layer });
    const lex = decision.lex;
    if (!lex) return `<p class="ws-note">No definition found for this word.</p>`;
    const uid = `ws${++_seq}`;
    const occ = typeof getCurrentRhemaOccurrences === 'function' ? getCurrentRhemaOccurrences(strongs, 'nt-greek') : null;
    _studies.set(uid, { strongs, ctx, entry: undefined, gloss: decision.gloss || '' });
    if (_studies.size > 20) _studies.delete(_studies.keys().next().value);

    const isNT = layer === 'nt-greek' || !!(occ && occ.total);
    const saved = _savedList().length;
    const loading = {
      range: `<section class="ws-card"><div class="ws-loading">Gathering every meaning across the New Testament…</div></section>`,
      here: ctx ? `<section class="ws-card"><div class="ws-loading">Lining up the translations…</div></section>` : '',
      lex: lexiconsHtml(lex, strongs, null, uid),
    };

    const html = `<div class="ws ws-d-${_wsDepth}" id="${uid}">
      ${heroHtml(strongs, lex, decision, ctxRaw, occ, uid)}
      <div class="ws-bar-row">
        ${depthHtml(uid)}
        <button type="button" class="ws-icon-b" onclick="rhemaShowSavedMeanings()" title="Saved meanings" aria-label="Saved meanings"><span class="material-symbols-outlined">bookmarks</span><span class="ws-saved-n">${saved || ''}</span></button>
        <button type="button" class="ws-icon-b" onclick="rhemaWordStudyTour('${uid}',true)" title="How this works" aria-label="How this works"><span class="material-symbols-outlined">help</span></button>
      </div>
      <button type="button" class="ws-go-deeper" onclick="rhemaWordStudyDepth('${uid}','study')">See every meaning, the translations &amp; more<span class="material-symbols-outlined">arrow_forward</span></button>
      ${deckHtml(uid, loading)}
    </div>`;

    setTimeout(() => {
      _wsRefreshDeck(uid);
      loadDeepLexiconEntry(strongs).then((entry) => {
        if (!document.getElementById(uid)) return;
        const st = _studies.get(uid); if (st) st.entry = entry || null;
        fillHero(uid, entry, strongs);
        const put = (id, h) => { const el = document.getElementById(`${uid}-${id}`); if (el) el.innerHTML = h || ''; };
        const range = rangeHtml(entry, strongs, uid);
        put('range', range || (entry ? '' : section('range', 'auto_awesome', 'Meaning', '<p class="ws-note">This word has no measured New Testament usage; the lexicons carry its meaning.</p>')));
        put('authors', authorsHtml(entry, strongs));
        put('history', historyHtml(entry, lex, strongs));
        put('method', methodHtml(entry));
        if (_lsjText(entry)) put('lex', lexiconsHtml(lex, strongs, entry, uid));
        if (isNT && _wsOccurrences(strongs).length) {
          // Draw the Translations card now; counting starts when it's viewed.
          const reader = typeof _rhemaReaderVersion === 'function' ? _rhemaReaderVersion() : 'MSB';
          if (st && !st.ver) st.ver = _wsIsLocal(reader) ? reader : 'MSB';
          _wsRenderVersions(uid, strongs);
        }
        if (ctx) renderHere(uid, ctx, strongs, entry);
        _wsRefreshDeck(uid);
        setTimeout(() => rhemaWordStudyTour(uid, false), 500);
      });
      if (ctx) {
        Promise.resolve(typeof _ensureRhemaBsbAlign === 'function' ? _ensureRhemaBsbAlign() : null).then(() => {
          if (!document.getElementById(uid)) return;
          renderHere(uid, ctx, strongs, _studies.get(uid)?.entry || null);
        });
      }
    }, 0);
    return html;
  };

  // Exposed for scripts/test-word-study.js
  window.RhemaWordStudy = { cleanAbbottSmith, cleanMoultonMilligan, AUTHORS };
})();
