/* Rhēma Word Study — the Definition tab for Greek words (NT + LXX).

   One scrollable study, answer first, every claim with its receipt:

     Hero ........ the word, what it means here, the one-paragraph definition
     Here ........ how each translation renders THIS occurrence (BSB exact,
                   MSB, NIV/NKJV/NASB/ESV/… bridged word-for-word), grouped so
                   translation disagreement is visible at a glance
     Range ....... measured senses across every NT use, each with all its verses
     Authors ..... who uses the word, how often, and how each author renders it
     History ..... classical Greek → Septuagint → papyri → NT → Apostolic Fathers
     Lexicons .... Abbott-Smith, Moulton–Milligan, LSJ, Dodson, Strong's — cleaned
                   and with every NT reference tappable
     Method ...... how the numbers were measured and how far to trust them

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

  function _decodeEntities(s) {
    return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }

  // ── Small render helpers ─────────────────────────────────────────────────
  const section = (id, icon, title, body, sub = '') => body ? `<section class="ws-sec" data-ws-sec="${id}">
      <h3 class="ws-sec-h"><span class="material-symbols-outlined">${icon}</span><span>${title}</span>${sub ? `<em>${sub}</em>` : ''}</h3>
      ${body}
    </section>` : '';
  const more = (label, body, open = false) => body ? `<details class="ws-more"${open ? ' open' : ''}><summary>${label}</summary><div class="ws-more-body">${body}</div></details>` : '';
  const pct = (x) => Math.round((x || 0) * 100);

  // ── Hero ─────────────────────────────────────────────────────────────────
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
      </div>
      ${gloss ? `<div class="ws-answer"><span class="ws-answer-k">${where ? `In ${esc(where)}` : 'Core meaning'}</span><strong>${esc(gloss)}</strong>${form ? `<span class="ws-form">this form: ${esc(form)}</span>` : ''}</div>` : ''}
      <div class="ws-def" id="${uid}-def"><span class="ws-shimmer"></span></div>
      <div class="ws-glance" id="${uid}-glance">${stats.map(s => `<span>${esc(s)}</span>`).join('')}</div>
    </div>`;
  }

  function fillHero(uid, entry, strongs) {
    const def = document.getElementById(`${uid}-def`);
    const glance = document.getElementById(`${uid}-glance`);
    const prose = entry?.prose || {};
    if (def) {
      const parts = [];
      const study = entry?.study || null;
      if (study?.summary) parts.push(`<p>${esc(study.summary)}</p>`);
      else if (prose.def) parts.push(`<p>${esc(prose.def)}</p>`);
      if (study?.exegesisTip) parts.push(`<div class="ws-tip"><span class="material-symbols-outlined">lightbulb</span><p>${esc(study.exegesisTip)}</p></div>`);
      if (study?.caution) parts.push(`<p class="ws-caution">${esc(study.caution)}</p>`);
      if (entry?.audit?.verdict === 'misleading') {
        parts.push(`<div class="ws-flag"><span class="material-symbols-outlined">flag</span>Rhema’s own review flagged this summary as possibly misleading. Lean on the measured range, the verses and the lexicons below.</div>`);
      }
      if (prose.article) parts.push(more('About this word', `<p>${esc(prose.article)}</p>${prose.caution ? `<p class="ws-caution">${esc(prose.caution)}</p>` : ''}`));
      else if (prose.caution) parts.push(`<p class="ws-caution">${esc(prose.caution)}</p>`);
      def.innerHTML = parts.join('') || '';
      def.classList.toggle('ws-empty', !parts.length);
    }
    if (glance && entry) {
      const chips = [];
      const top = topAuthor(entry);
      if (entry.count) chips.push(`${entry.count.toLocaleString()}× in the NT`);
      if (entry.lxx?.count) chips.push(`${entry.lxx.count.toLocaleString()}× in the Septuagint`);
      if (top) chips.push(`most used by ${top.name} (${top.count})`);
      if (entry.classical?.af) chips.push(`≈${entry.classical.af}× in the Apostolic Fathers`);
      const conf = _DEEP_CONFIDENCE_LABELS[entry.confidence];
      glance.innerHTML = chips.map(c => `<span>${esc(c)}</span>`).join('') +
        (conf ? `<span class="ws-conf ws-conf-${esc(entry.confidence)}">${esc(conf)}</span>` : '');
    }
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
    if (entry && entry.verseSense && ref in entry.verseSense && entry.senses?.length > 1) {
      const i = entry.verseSense[ref];
      const s = entry.senses[i];
      if (s) senseLine = `<p class="ws-note">Sense used here: <b>${esc(_senseName(entry, s, i))}</b> — ${s.count} of ${entry.count} NT uses (${pct(s.share)}%).</p>`;
    }
    const loadBtn = missing.length && !(typeof _vsIsApiLimited === 'function' && _vsIsApiLimited())
      ? `<button type="button" class="ws-btn" onclick="rhemaWordStudyLoadVersions('${uid}')"><span class="material-symbols-outlined">translate</span>Compare ${esc(missing.slice(0, 4).join(', '))}${missing.length > 4 ? ` +${missing.length - 4}` : ''}</button>`
      : '';
    el.innerHTML = section('here', 'translate', 'How translations render it here',
      `${spread > 1 ? `<p class="ws-note">Translations split <b>${spread} ways</b> on this word here — a sign the Greek carries more than one English word can.</p>` : ''}
       ${senseLine}
       <div class="ws-tr">${groupsHtml}</div>
       ${entry?.study?.translationNote ? `<div class="ws-author-note"><span class="material-symbols-outlined">forum</span><p><b>Why translations differ.</b> ${esc(entry.study.translationNote)}</p></div>` : ''}
       ${loadBtn}
       <p class="ws-fine">BSB is the Berean translators’ own word-for-word table. Other versions are matched to it word by word; ≈ marks a match by position.</p>`,
      esc(`${_rhemaBookName(ctx.book) || ctx.book} ${ctx.chapter}:${ctx.verse}`));
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
  function rangeHtml(entry, strongs) {
    if (!entry) return '';
    const senses = (entry.senses || []).slice(0, 8);
    const by = _refsBySense(entry);
    const labels = entry.prose?.senseLabels || [];
    const parts = [];
    const study = entry.study;
    if (study?.senses?.length) {
      parts.push(`<div class="ws-senses">${study.senses.map((s, i) => `<div class="ws-sense ws-sense-study">
          <div class="ws-sense-top"><span class="ws-sense-n">${i + 1}</span><b>${esc(s.label)}</b></div>
          <p class="ws-sense-def">${esc(s.definition)}</p>
          ${s.note ? `<p class="ws-fine">${esc(s.note)}</p>` : ''}
          ${s.refs?.length ? `<div class="ws-refs">${s.refs.map(r => _refChipFromKey(r, strongs)).join('')}</div>` : ''}
        </div>`).join('')}</div>
        <p class="ws-fine">Every verse above is checked against the Greek text — the word really occurs there.</p>
        <div class="ws-sub-h">How the English renders it, counted</div>`);
    }
    if (senses.length) {
      parts.push(`<div class="ws-senses">${senses.map((s, i) => {
        const refs = by.get(i) || s.refs || [];
        const shown = refs.slice(0, 6).map(r => _refChipFromKey(r, strongs)).join('');
        const rest = refs.slice(6).map(r => _refChipFromKey(r, strongs)).join('');
        const vars = Object.entries(s.variants || {}).filter(([k]) => k.toLowerCase() !== String(s.display).toLowerCase()).slice(0, 4);
        const meta = [];
        if (s.bsbAgree != null) meta.push(`BSB agrees ${pct(s.bsbAgree)}%`);
        if (s.corroborated?.length) meta.push(`also in ${s.corroborated.map(c => _DEEP_CORROBORATION_NAMES[c] || c).join(', ')}`);
        return `<div class="ws-sense">
          <div class="ws-sense-top"><span class="ws-sense-n">${i + 1}</span><b>${esc(_senseName(entry, s, i))}</b><span class="ws-count">${s.count}× · ${pct(s.share)}%</span></div>
          <div class="ws-bar"><span style="width:${Math.max(pct(s.share), 2)}%"></span></div>
          ${vars.length ? `<div class="ws-fine">also worded: ${vars.map(([k, n]) => `${esc(k)} (${n})`).join(', ')}</div>` : ''}
          ${meta.length ? `<div class="ws-fine">${esc(meta.join(' · '))}</div>` : ''}
          ${shown ? `<div class="ws-refs">${shown}</div>` : ''}
          ${rest ? more(`All ${refs.length} verses`, `<div class="ws-refs">${rest}</div>`) : ''}
        </div>`;
      }).join('')}</div>`);
    } else if (entry.count) {
      parts.push(`<p class="ws-note">No single English rendering dominates this word — it is usually absorbed into the phrasing. The lexicons below carry the meaning.</p>`);
    }
    // Lexicon-attested senses the measurement couldn't separate (e.g. σάρξ
    // "human nature" in Paul — English versions mostly still say "flesh").
    if (!study?.senses?.length && labels.length > senses.length) {
      parts.push(`<div class="ws-extra"><div class="ws-extra-h">Also recognised by the lexicons</div>
        <ul>${labels.slice(senses.length).map(l => `<li>${esc(l)}</li>`).join('')}</ul>
        <p class="ws-fine">These senses are real but share their English wording with the senses above, so they can’t be counted from translations alone — check the Authors notes, verses and lexicons.</p></div>`);
    }
    const tail = [];
    // Singleton renderings, minus alignment debris ("those", "according flesh").
    const rare = (entry.rare || []).filter(r => {
      const words = String(r.display || '').toLowerCase().split(/\s+/).filter(Boolean);
      return words.length && words.length <= 3 && !words.some(w => (window.RhemaAlign && RhemaAlign.isGrammar(w)) || /^(according|being|whom)$/.test(w));
    });
    if (rare.length) tail.push(`<p class="ws-fine">Rare renderings: ${rare.slice(0, 6).map(r => `${esc(r.display)}${r.refs?.[0] ? ' ' + _refChipFromKey(r.refs[0], strongs) : ''}`).join(' · ')}</p>`);
    if (entry.untranslated && entry.count && entry.untranslated >= Math.max(2, entry.count * 0.05)) {
      tail.push(`<p class="ws-fine">Woven into the English phrasing with no word of its own ${entry.untranslated}× of ${entry.count}.</p>`);
    }
    if (entry.contexts?.length) {
      tail.push(more('Greek company it keeps', entry.contexts.map((c, i) => `<div class="ws-pattern">
          <div class="ws-sense-top"><b>Pattern ${i + 1}</b><span class="ws-count">${c.n}× · ${c.share}%</span></div>
          <div class="ws-fine">with ${c.companions.map(x => `<em>${esc(x)}</em>`).join(', ')} — rendered ${c.renderings.map(r => r.r === '(absorbed)' ? `in the phrasing ${r.pct}%` : `“${esc(r.r)}” ${r.pct}%`).join(' · ')}</div>
          ${(c.refs || []).length ? `<div class="ws-refs">${c.refs.map(r => _refChipFromKey(r, strongs)).join('')}</div>` : ''}
        </div>`).join('') + `<p class="ws-fine">Grouped by the Greek words around each use — no English involved — so a hidden difference in meaning shows up even when the English stays the same.</p>`));
    }
    return section('range', 'travel_explore', 'Range of meaning', parts.join('') + tail.join(''),
      entry.count ? `measured across all ${entry.count} NT uses` : '');
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
         <p class="ws-fine">Note written in Rhema’s scholarly review pass from the measured evidence and standard lexicons — check it against the verses.</p>`
      : '';
    return section('authors', 'groups', 'Who uses it', `<div class="ws-authors">${rows}</div>${note}`,
      stats.length > 1 ? `${stats.length} NT voices` : '');
  }

  // ── History ──────────────────────────────────────────────────────────────
  function historyHtml(entry, lex, strongs) {
    const items = [];
    const bg = (period) => (entry?.study?.background || []).filter(b => b.period === period)
      .map(b => `<p class="ws-bg">${esc(b.note)} <span class="ws-cite">${esc(b.citation)}</span></p>`).join('');
    const lsj = entry?.classical?.lsj;
    if (lsj) {
      const txt = _decodeEntities(lsj);
      const cut = /…\s*$/.test(txt);
      items.push({ era: 'c. 800–300 BC', title: 'Classical Greek', icon: 'account_balance',
        body: `${bg('classical')}<p class="ws-fine">How Homer, the tragedians, Plato and the historians used it (Liddell–Scott–Jones).</p>${more(cut ? 'Read the LSJ excerpt' : 'Read the LSJ entry', `<p class="ws-lsj">${esc(txt)}</p>`)}` });
    }
    if (entry?.lxx?.count) {
      const heb = (entry.lxx.hebrew || []).slice(0, 4).map(h => `<span class="ws-heb" dir="rtl">${esc(h.lemma || '')}</span> <span class="ws-fine">H${esc(h.h)} · ${h.count}×</span>`).join('<br>');
      items.push({ era: 'c. 250–100 BC', title: 'Septuagint', icon: 'menu_book',
        body: `<p>${entry.lxx.count.toLocaleString()}× in ${entry.lxx.books} book${entry.lxx.books === 1 ? '' : 's'} of the Greek Old Testament — the Bible the apostles quoted.</p>
          ${bg('septuagint')}
          ${heb ? `<p class="ws-fine">It translates the Hebrew:</p><p>${heb}</p>` : ''}
          ${(entry.lxx.refs || []).length ? `<div class="ws-refs">${entry.lxx.refs.slice(0, 6).map(r => _refChipFromKey(r, strongs)).join('')}</div>` : ''}` });
    }
    const mm = (window.RhemaMoultonMilligan || {})[strongs];
    if (mm) {
      const paras = cleanMoultonMilligan(mm);
      items.push({ era: 'c. 300 BC – AD 300', title: 'Everyday Greek: papyri & inscriptions', icon: 'receipt_long',
        body: `${bg('papyri')}<p class="ws-fine">Letters, contracts and inscriptions from the NT world — how ordinary people used the word (Moulton–Milligan).</p>
          <p class="ws-mm">${esc(paras[0] || '').slice(0, 420)}${(paras[0] || '').length > 420 ? '…' : ''}</p>
          ${paras.length > 1 || (paras[0] || '').length > 420 ? more('Read the full entry', paras.map(p => `<p class="ws-mm">${esc(p)}</p>`).join('')) : ''}` });
    }
    if (entry?.count) {
      const crit = entry.critical?.count;
      const books = Object.keys(entry.byBook || {}).length;
      items.push({ era: 'c. AD 45–95', title: 'New Testament', icon: 'auto_stories',
        body: `<p>${entry.count.toLocaleString()}× in ${books} book${books === 1 ? '' : 's'} of the Majority (Byzantine) text${crit != null && crit !== entry.count ? `; ${crit.toLocaleString()}× in the critical text (SBLGNT) — the ${Math.abs(entry.count - crit)} difference comes from textual variants` : crit != null ? ', the same in the critical text (SBLGNT)' : ''}.</p>` });
    }
    if (entry?.classical?.af) {
      items.push({ era: 'c. AD 95–150', title: 'Apostolic Fathers', icon: 'history_edu',
        body: `${bg('apostolic')}<p>About ${entry.classical.af}× in Clement, Ignatius, Polycarp, the Didache and Hermas — whether the next generation of Christians kept the word, and how.</p>` });
    }
    if (!items.length) return '';
    return section('history', 'timeline', 'Through history', `<ol class="ws-timeline">${items.map(it => `<li>
        <div class="ws-tl-dot"><span class="material-symbols-outlined">${it.icon}</span></div>
        <div class="ws-tl-body"><div class="ws-tl-h"><b>${esc(it.title)}</b><span>${esc(it.era)}</span></div>${it.body}</div>
      </li>`).join('')}</ol>
      <p class="ws-fine">Sources outside the Bible witness how Greek speakers used the word; they don’t override what the biblical author means in context.</p>`);
  }

  // ── Lexicons (tabbed) ────────────────────────────────────────────────────
  function lexiconsHtml(lex, strongs, entry, uid) {
    const tabs = [];
    if (lex.abbott_smith && _rhemaAbbottMatchesLex(lex)) {
      tabs.push(['Abbott-Smith', `<div class="ws-as">${cleanAbbottSmith(lex.abbott_smith, strongs)}</div><p class="ws-fine">A Manual Greek Lexicon of the NT (1922). References are tappable.</p>`]);
    }
    const mm = (window.RhemaMoultonMilligan || {})[strongs];
    if (mm) tabs.push(['Moulton–Milligan', cleanMoultonMilligan(mm).map(p => `<p class="ws-mm">${esc(p)}</p>`).join('') + '<p class="ws-fine">The Vocabulary of the Greek Testament (1930), from the papyri and inscriptions.</p>']);
    if (entry?.classical?.lsj) tabs.push(['LSJ', `<p class="ws-lsj">${esc(_decodeEntities(entry.classical.lsj))}</p><p class="ws-fine">Liddell–Scott–Jones, A Greek–English Lexicon (classical Greek).</p>`]);
    if (lex.extended || lex.brief) tabs.push(['Dodson', `<p>${esc(lex.extended || lex.brief)}</p>`]);
    if (lex.strongs_def) {
      tabs.push(["Strong's", `<p>${esc(String(lex.strongs_def).trim())}</p>${lex.kjv_def ? `<p class="ws-fine">KJV renders it: ${esc(String(lex.kjv_def).replace(/^--/, ''))}</p>` : ''}${lex.deriv ? `<p class="ws-fine">Derivation: ${esc(lex.deriv)}</p>` : ''}`]);
    }
    if (!tabs.length) return '';
    const name = `${uid}-lex`;
    return section('lexicons', 'library_books', 'Lexicons', `<div class="ws-tabs" role="tablist">${tabs.map(([t], i) =>
        `<button type="button" role="tab" class="ws-tab${i === 0 ? ' on' : ''}" onclick="rhemaWordStudyTab('${name}',${i},this)">${esc(t)}</button>`).join('')}</div>
      ${tabs.map(([, body], i) => `<div class="ws-pane${i === 0 ? ' on' : ''}" data-ws-pane="${name}-${i}">${body}</div>`).join('')}`);
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
    return section('method', 'science', 'How we know', more('Show the evidence trail',
      `${why.map(w => `<p>${esc(w)}</p>`).join('')}
       <p class="ws-fine">Senses are measured by aligning every occurrence in the Byzantine text with the Majority Standard Bible (and checked independently against the Berean Standard Bible), then grouping the English renderings. Translation wording approximates meaning; where the lexicons recognise a sense the English hides, it is listed separately.</p>`));
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
    _studies.set(uid, { strongs, ctx, entry: null });
    if (_studies.size > 20) _studies.delete(_studies.keys().next().value);

    const nav = [['here', 'Here', !!ctx], ['range', 'Range', true], ['authors', 'Authors', true], ['history', 'History', true], ['lexicons', 'Lexicons', true]]
      .filter(x => x[2]).map(([id, label]) => `<button type="button" onclick="rhemaWordStudyJump('${uid}','${id}')">${label}</button>`).join('');

    const html = `<div class="ws" id="${uid}">
      ${heroHtml(strongs, lex, decision, ctxRaw, occ, uid)}
      <nav class="ws-nav">${nav}</nav>
      <div id="${uid}-here">${ctx ? `<section class="ws-sec"><div class="ws-loading">Lining up the translations…</div></section>` : ''}</div>
      <div id="${uid}-deep"><section class="ws-sec"><div class="ws-loading">Measuring this word across the New Testament…</div></section></div>
      <div id="${uid}-lex">${lexiconsHtml(lex, strongs, null, uid)}</div>
    </div>`;

    setTimeout(() => {
      loadDeepLexiconEntry(strongs).then((entry) => {
        if (!document.getElementById(uid)) return;
        const st = _studies.get(uid); if (st) st.entry = entry;
        fillHero(uid, entry, strongs);
        const deep = document.getElementById(`${uid}-deep`);
        if (deep) deep.innerHTML = [rangeHtml(entry, strongs), authorsHtml(entry, strongs), historyHtml(entry, lex, strongs), methodHtml(entry)].join('')
          || '<p class="ws-note">This word has no measured New Testament usage; the lexicons below carry its meaning.</p>';
        const lexEl = document.getElementById(`${uid}-lex`);
        if (lexEl && entry?.classical?.lsj) lexEl.innerHTML = lexiconsHtml(lex, strongs, entry, uid);
        if (ctx) renderHere(uid, ctx, strongs, entry);
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

  window.rhemaWordStudyJump = function (uid, id) {
    const root = document.getElementById(uid);
    const target = root && root.querySelector(`[data-ws-sec="${id}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Exposed for scripts/test-word-study.js
  window.RhemaWordStudy = { cleanAbbottSmith, cleanMoultonMilligan, AUTHORS };
})();
