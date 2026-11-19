// Grammar search — "find every form like this".
//
// Exact searches of the parsed original-language text, answered on the device
// from the same data the reader shows (never guessed):
//   • a word: G3056, H1254, λόγος, בָּרָא (any form), or one exact form
//   • a form: "aorist imperative", "genitive plural", "Qal perfect",
//     "Hiphil imperative", "participle"…
//   • any mix, in a scope: "aorist imperatives in James", "λόγος genitive in
//     John", "Qal imperative in Psalms", "every H2617 in Ruth"
// Greek NT: the reader's text (Byzantine majority, or the critical text when
// that's on). Hebrew OT: the Westminster Leningrad text with OSHB parsing.
//
// It lives in Rhēma's search box (typed queries that name a word or a form),
// and in every word sheet ("Find every form like this"), and the smart (AI)
// search hands word questions to it so counts are exact.
(function () {
  'use strict';
  // app.js keeps these as top-level const/let: shared by name, not on window.
  /* global RHEMA_OT_BOOK_ORDER, RHEMA_NT_BOOK_ORDER, RHEMA_BOOK_NAMES, _rhemaTextMode */
  const OT_ORDER = () => (typeof RHEMA_OT_BOOK_ORDER !== 'undefined' ? RHEMA_OT_BOOK_ORDER : []);
  const NT_ORDER = () => (typeof RHEMA_NT_BOOK_ORDER !== 'undefined' ? RHEMA_NT_BOOK_ORDER : []);
  const BOOK_NAMES = () => (typeof RHEMA_BOOK_NAMES !== 'undefined' ? RHEMA_BOOK_NAMES : {});
  const TEXT_MODE = () => (typeof _rhemaTextMode !== 'undefined' ? _rhemaTextMode : 'majority');

  // ── Greek (Robinson-style codes: V-AAM-2S, V-2AAI-3S, N-GSM, P-1GS…) ──────
  function gkFeatures(code) {
    const c = String(code || '');
    const parts = c.split('-');
    const pos = parts[0] || '';
    const f = { pos };
    if (pos === 'V') {
      const m = (parts[1] || '').match(/^2?([PIFARL])([AMPEDONQX])([ISOMNPRD])$/);
      if (m) { f.tense = m[1]; f.voice = m[2]; f.mood = m[3] === 'D' ? 'M' : m[3]; }
      const rest = parts[2] || '';
      let r;
      if ((r = rest.match(/^([123])([SP])$/))) { f.person = r[1]; f.number = r[2]; }
      else if ((r = rest.match(/^([NGDAV])([SP])([MFN])$/))) { f.case = r[1]; f.number = r[2]; f.gender = r[3]; }
    } else {
      const rest = parts.slice(1).join('-');
      const p = rest.match(/^([123])/);
      if (p && (pos === 'P' || pos === 'S' || pos === 'F')) f.person = p[1];
      const r = rest.match(/([NGDAV])([SP])([MFN]?)$/);
      if (r) { f.case = r[1]; f.number = r[2]; if (r[3]) f.gender = r[3]; }
    }
    return f;
  }
  // Which codes count as a feature value (deponent and either-voice forms
  // count for both middle and passive).
  const GK_VOICE = { A: 'AQ', M: 'MDEN', P: 'POEN' };
  function gkMatch(f, want) {
    for (const k of Object.keys(want)) {
      const w = want[k];
      if (k === 'voice') { if (!f.voice || !GK_VOICE[w].includes(f.voice)) return false; continue; }
      if (k === 'pos') { if (w === 'P' ? !(f.pos === 'P' || f.pos === 'R' || f.pos === 'D' || f.pos === 'F' || f.pos === 'S' || f.pos === 'C' || f.pos === 'I' || f.pos === 'K' || f.pos === 'X' || f.pos === 'Q') : f.pos !== w) return false; continue; }
      if (f[k] !== w) return false;
    }
    return true;
  }

  // ── Hebrew (OSHB codes: HVqp3ms, HC/Vqw3ms, HNcmsa…) ─────────────────────
  function heFeatures(code) {
    const c = String(code || '');
    const lang = c[0] === 'A' ? 'A' : 'H';
    const segs = c.slice(1).split('/');
    const core = segs.find(s => /^[VNA]/.test(s)) || segs[segs.length - 1] || '';
    const f = { lang, pos: core[0] || '' };
    if (f.pos === 'V') {
      f.stem = core[1] || '';
      f.form = core[2] || '';
      const rest = core.slice(3);
      let r;
      if ((r = rest.match(/^([123])([mfcb])([spd])$/))) { f.person = r[1]; f.gender = r[2]; f.number = r[3]; }
      else if ((r = rest.match(/^([mfcb])([spd])/))) { f.gender = r[1]; f.number = r[2]; }
    } else if (f.pos === 'N' || f.pos === 'A') {
      const r = core.slice(f.pos === 'N' ? 2 : 2).match(/([mfcb])([spd])([acd]?)/);
      if (r) { f.gender = r[1]; f.number = r[2]; if (r[3]) f.state = r[3]; }
    }
    return f;
  }
  function heMatch(f, want) {
    for (const k of Object.keys(want)) {
      const w = want[k];
      if (k === 'form') {
        const ok = w === 'inf' ? (f.form === 'a' || f.form === 'c') : w === 'ptc' ? (f.form === 'r' || f.form === 's') : f.form === w;
        if (!ok) return false; continue;
      }
      if (k === 'gender') { if (!(f.gender === w || f.gender === 'c' || f.gender === 'b')) return false; continue; }
      if (f[k] !== w) return false;
    }
    return true;
  }

  // ── Words people type ─────────────────────────────────────────────────────
  const GK_TERMS = [
    ['tense', 'P', /\bpresents?\b/], ['tense', 'I', /\bimperfects?\b/], ['tense', 'F', /\bfutures?\b/],
    ['tense', 'A', /\baorists?\b/], ['tense', 'R', /\bperfects?\b/], ['tense', 'L', /\bpluperfects?\b/],
    ['voice', 'A', /\bactive\b/], ['voice', 'M', /\bmiddle\b/], ['voice', 'P', /\bpassives?\b/],
    ['mood', 'I', /\bindicatives?\b/], ['mood', 'S', /\bsubjunctives?\b/], ['mood', 'O', /\boptatives?\b/],
    ['mood', 'M', /\bimperatives?\b/], ['mood', 'N', /\binfinitives?\b/], ['mood', 'P', /\bparticiples?\b/],
    ['case', 'N', /\bnominatives?\b/], ['case', 'G', /\bgenitives?\b/], ['case', 'D', /\bdatives?\b/], ['case', 'A', /\baccusatives?\b/], ['case', 'V', /\bvocatives?\b/],
    ['gender', 'M', /\bmasculine\b/], ['gender', 'F', /\bfeminine\b/], ['gender', 'N', /\bneuter\b/],
    ['number', 'S', /\bsingular\b/], ['number', 'P', /\bplurals?\b/],
    ['person', '1', /\b(?:1st|first)[- ]person\b|\b1st\b/], ['person', '2', /\b(?:2nd|second)[- ]person\b|\b2nd\b/], ['person', '3', /\b(?:3rd|third)[- ]person\b|\b3rd\b/],
    ['pos', 'V', /\bverbs?\b/], ['pos', 'N', /\bnouns?\b/], ['pos', 'A', /\badjectives?\b/], ['pos', 'T', /\barticles?\b/],
  ];
  const HE_TERMS = [
    ['stem', 'q', /\bqal\b/], ['stem', 'N', /\bniphal\b/], ['stem', 'p', /\bpiel\b/], ['stem', 'P', /\bpual\b/],
    ['stem', 'h', /\bhiphil\b/], ['stem', 'H', /\bhophal\b/], ['stem', 't', /\bhithpael\b/],
    ['form', 'w', /\b(?:wayyiqtols?|consecutive imperfects?|vav[- ]consecutive imperfects?|narrative past)\b/],
    ['form', 'q', /\b(?:weqatals?|consecutive perfects?)\b/],
    ['form', 'p', /\bperfects?\b/], ['form', 'i', /\bimperfects?\b/], ['form', 'v', /\bimperatives?\b/],
    ['form', 'j', /\bjussives?\b/], ['form', 'h', /\bcohortatives?\b/],
    ['form', 'a', /\binfinitives? absolute\b/], ['form', 'c', /\binfinitives? construct\b/], ['form', 'inf', /\binfinitives?\b/],
    ['form', 's', /\bpassive participles?\b/], ['form', 'ptc', /\bparticiples?\b/],
    ['gender', 'm', /\bmasculine\b/], ['gender', 'f', /\bfeminine\b/],
    ['number', 's', /\bsingular\b/], ['number', 'p', /\bplurals?\b/], ['number', 'd', /\bduals?\b/],
    ['person', '1', /\b(?:1st|first)[- ]person\b|\b1st\b/], ['person', '2', /\b(?:2nd|second)[- ]person\b|\b2nd\b/], ['person', '3', /\b(?:3rd|third)[- ]person\b|\b3rd\b/],
    ['pos', 'V', /\bverbs?\b/], ['pos', 'N', /\bnouns?\b/],
  ];
  const TECHNICAL = /\b(aorists?|pluperfects?|optatives?|subjunctives?|imperatives?|infinitives?|participles?|nominatives?|genitives?|datives?|accusatives?|vocatives?|indicatives?|qal|niphal|piel|pual|hiphil|hophal|hithpael|wayyiqtols?|weqatals?|jussives?|cohortatives?)\b/;
  const HE_ONLY = /\b(qal|niphal|piel|pual|hiphil|hophal|hithpael|wayyiqtols?|weqatals?|jussives?|cohortatives?|consecutive|infinitives? (?:absolute|construct)|duals?)\b/;
  const GK_ONLY = /\b(aorists?|pluperfects?|middle|optatives?|subjunctives?|nominatives?|genitives?|datives?|accusatives?|vocatives?|neuter|indicatives?)\b/;

  // Labels for chips and titles.
  const GK_LABEL = {
    tense: { P: 'Present', I: 'Imperfect', F: 'Future', A: 'Aorist', R: 'Perfect', L: 'Pluperfect' },
    voice: { A: 'Active', M: 'Middle', P: 'Passive', D: 'Middle (deponent)', O: 'Passive (deponent)', E: 'Middle or passive', N: 'Middle or passive (deponent)', Q: 'Active' },
    mood: { I: 'Indicative', S: 'Subjunctive', O: 'Optative', M: 'Imperative', N: 'Infinitive', P: 'Participle' },
    case: { N: 'Nominative', G: 'Genitive', D: 'Dative', A: 'Accusative', V: 'Vocative' },
    gender: { M: 'Masculine', F: 'Feminine', N: 'Neuter' }, number: { S: 'Singular', P: 'Plural' },
    person: { 1: '1st person', 2: '2nd person', 3: '3rd person' }, pos: { V: 'Verb', N: 'Noun', A: 'Adjective', T: 'Article', P: 'Pronoun' },
  };
  const HE_LABEL = {
    stem: { q: 'Qal', N: 'Niphal', p: 'Piel', P: 'Pual', h: 'Hiphil', H: 'Hophal', t: 'Hithpael', Q: 'Qal passive', o: 'Polel', O: 'Polal', r: 'Hithpolel', m: 'Poel', M: 'Poal' },
    form: { p: 'Perfect', q: 'Weqatal (consecutive perfect)', i: 'Imperfect', w: 'Wayyiqtol (narrative past)', v: 'Imperative', j: 'Jussive', h: 'Cohortative', a: 'Infinitive absolute', c: 'Infinitive construct', inf: 'Infinitive', r: 'Participle', s: 'Passive participle', ptc: 'Participle' },
    gender: { m: 'Masculine', f: 'Feminine', c: 'Common', b: 'Both' }, number: { s: 'Singular', p: 'Plural', d: 'Dual' },
    person: { 1: '1st person', 2: '2nd person', 3: '3rd person' }, pos: { V: 'Verb', N: 'Noun', A: 'Adjective' }, state: { a: 'Absolute', c: 'Construct', d: 'Determined' },
  };
  const GK_ORDER = ['pos', 'tense', 'voice', 'mood', 'person', 'case', 'number', 'gender'];
  const HE_ORDER = ['pos', 'stem', 'form', 'person', 'gender', 'number', 'state'];
  const label = (lang, k, v) => ((lang === 'hebrew' ? HE_LABEL : GK_LABEL)[k] || {})[v] || v;

  // ── Scope ─────────────────────────────────────────────────────────────────
  const GROUPS = {
    gospels: ['MAT', 'MAR', 'LUK', 'JOH'],
    pauline: ['ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM'],
    general: ['HEB', 'JAM', '1PE', '2PE', '1JO', '2JO', '3JO', 'JUD'],
    torah: ['GEN', 'EXO', 'LEV', 'NUM', 'DEU'],
    prophets: ['ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL'],
    wisdom: ['JOB', 'PSA', 'PRO', 'ECC', 'SNG'],
  };
  const GROUP_NAMES = { gospels: 'the Gospels', pauline: 'Paul’s letters', general: 'the general letters', torah: 'the Law', prophets: 'the Prophets', wisdom: 'the wisdom books' };
  function scopeFrom(q) {
    const s = q.toLowerCase();
    if (/\bgospels?\b/.test(s)) return { books: GROUPS.gospels, label: GROUP_NAMES.gospels, testament: 'nt' };
    if (/\b(?:paul'?s?|pauline)\b/.test(s)) return { books: GROUPS.pauline, label: GROUP_NAMES.pauline, testament: 'nt' };
    if (/\bgeneral (?:letters|epistles)\b/.test(s)) return { books: GROUPS.general, label: GROUP_NAMES.general, testament: 'nt' };
    if (/\b(?:torah|pentateuch|the law)\b/.test(s)) return { books: GROUPS.torah, label: GROUP_NAMES.torah, testament: 'ot' };
    if (/\bprophets\b/.test(s)) return { books: GROUPS.prophets, label: GROUP_NAMES.prophets, testament: 'ot' };
    if (/\bwisdom\b/.test(s)) return { books: GROUPS.wisdom, label: GROUP_NAMES.wisdom, testament: 'ot' };
    if (/\b(?:old testament|ot|hebrew bible)\b/.test(s)) return { testament: 'ot', label: 'the Old Testament' };
    if (/\b(?:new testament|nt)\b/.test(s)) return { testament: 'nt', label: 'the New Testament' };
    // "in James", "in 1 John 3", "in Romans 8"
    const m = s.match(/\bin ((?:[1-3]\s?)?[a-z]+(?: of [a-z]+)?)(?:\s+(\d{1,3}))?\s*$/);
    if (m) {
      const code = bookCode(m[1]);
      if (code) return { books: [code], chapter: m[2] || null, label: (window._rhemaBookName ? window._rhemaBookName(code) : code) + (m[2] ? ' ' + m[2] : ''), testament: isOT(code) ? 'ot' : 'nt' };
    }
    return null;
  }
  function bookCode(name) {
    const n = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!n) return null;
    if (typeof window._homeRhemaDirectRef === 'function') {
      const r = window._homeRhemaDirectRef(n + ' 1');
      if (r && r.book) return r.book;
    }
    const names = BOOK_NAMES();
    for (const [code, nm] of Object.entries(names)) if (String(nm).toLowerCase() === n) return code;
    return null;
  }
  const isOT = (code) => OT_ORDER().includes(code);

  // ── Words: G3056, H1254, Greek/Hebrew letters ─────────────────────────────
  const stripGk = (s) => (typeof window._stripGreekAccents === 'function' ? window._stripGreekAccents(s) : s).toLowerCase().replace(/ς/g, 'σ');
  const hebCons = (s) => (typeof window._rhemaHebConsonants === 'function' ? window._rhemaHebConsonants(s) : s);
  function wordFrom(q) {
    let m = q.match(/\b([GH])\s?(\d{1,4})\b/i);
    if (m) return { lang: m[1].toUpperCase() === 'H' ? 'hebrew' : 'greek', strongs: [Number(m[2])], typed: `${m[1].toUpperCase()}${m[2]}` };
    m = q.match(/[Ͱ-Ͽἀ-῿]+/);
    if (m) {
      const typed = m[0], t = stripGk(typed);
      const lex = window.RhemaLexicon || {};
      const hits = Object.keys(lex).filter(k => lex[k]?.lemma && stripGk(lex[k].lemma) === t).map(Number);
      return { lang: 'greek', strongs: hits, surface: hits.length ? null : typed, typed };
    }
    m = q.match(/[א-ת][֑-ׇא-ת]*/);
    if (m) {
      const typed = m[0], t = hebCons(typed);
      const lex = window.RhemaHebrewLexicon || {};
      const hits = Object.keys(lex).filter(k => lex[k]?.lemma && hebCons(lex[k].lemma) === t).map(Number);
      return { lang: 'hebrew', strongs: hits, surface: hits.length ? null : typed, typed };
    }
    return null;
  }

  // Turn a typed query into a search, or null if it isn't a word/grammar
  // search (then the normal search handles it).
  function parse(query) {
    const q = String(query || '').trim();
    if (!q || q.length > 140) return null;
    const s = q.toLowerCase();
    const word = wordFrom(q);
    const scope = scopeFrom(q);
    let lang = word?.lang || null;
    if (!lang) lang = HE_ONLY.test(s) ? 'hebrew' : GK_ONLY.test(s) ? 'greek' : scope?.testament === 'ot' ? 'hebrew' : null;
    const terms = (lang === 'hebrew' ? HE_TERMS : GK_TERMS);
    const want = {};
    let rest = s;
    for (const [k, v, re] of terms) {
      if (want[k]) continue;
      if (re.test(rest)) { want[k] = v; rest = rest.replace(re, ' '); }
    }
    // Everyday phrases stay normal searches ("perfect love", "present your
    // bodies", "the first", "future glory"): without a Greek/Hebrew word, it
    // takes a technical term or two grammar terms together.
    const n = Object.keys(want).length;
    if (!word && !n) return null;
    if (!word && !(TECHNICAL.test(s) || n >= 2)) return null;
    if (!word && Object.keys(want).every(k => k === 'pos')) return null;
    if (!lang) lang = 'greek';
    if (lang === 'greek' && scope?.testament === 'ot' && !word) return null;
    return {
      lang, want, strongs: word?.strongs || null, surface: word?.surface || null, typed: word?.typed || null,
      scope: scope && (lang === 'hebrew' ? scope.testament !== 'nt' : scope.testament !== 'ot') ? scope : null,
    };
  }

  // ── Run ───────────────────────────────────────────────────────────────────
  async function ensureData(spec) {
    const files = spec.lang === 'hebrew'
      ? ['rhema-ot-hebrew.js', 'rhema-hebrew-lexicon.js']
      : (TEXT_MODE() === 'critical' ? ['rhema-critical.js', 'rhema-lexicon.js'] : ['rhema-nt.js', 'rhema-lexicon.js']);
    if (typeof window._rhemaLoadDataFile === 'function') await Promise.all(files.map(f => window._rhemaLoadDataFile(f).catch(() => null)));
  }
  function run(spec) {
    const hebrew = spec.lang === 'hebrew';
    const T = hebrew ? (window.RhemaHebrewOT?.text || {}) : ((typeof window._rhemaTextForMode === 'function' ? window._rhemaTextForMode(TEXT_MODE()) : window.RhemaNT?.text) || {});
    const order = hebrew ? OT_ORDER() : NT_ORDER();
    const books = spec.scope?.books ? order.filter(b => spec.scope.books.includes(b)) : order;
    const strongs = spec.strongs && spec.strongs.length ? new Set(spec.strongs.map(String)) : null;
    const surface = spec.surface ? (hebrew ? hebCons(spec.surface) : stripGk(spec.surface).replace(/[^\p{L}]/gu, '')) : null;
    const want = spec.want || {};
    const feat = hebrew ? heFeatures : gkFeatures, match = hebrew ? heMatch : gkMatch;
    const hits = [];
    const byBook = {};
    const forms = new Map();
    for (const book of books) {
      const B = T[book]; if (!B) continue;
      for (const ch of Object.keys(B).sort((a, b) => a - b)) {
        if (spec.scope?.chapter && String(spec.scope.chapter) !== String(ch)) continue;
        for (const v of Object.keys(B[ch]).sort((a, b) => a - b)) {
          const words = B[ch][v];
          for (let i = 0; i < words.length; i++) {
            let w = words[i];
            if (!hebrew && typeof window._rhemaResolveWord === 'function' && (w[1] === '' || w[1] == null)) w = window._rhemaResolveWord(w, book, ch) || w;
            if (strongs && !strongs.has(String(w[1]))) continue;
            if (surface) {
              const sf = hebrew ? hebCons(w[0]) : stripGk(w[0]).replace(/[^\p{L}]/gu, '');
              if (sf !== surface) continue;
            }
            const f = feat(w[2]);
            if (!match(f, want)) continue;
            hits.push({ book, ch, v, idx: i, surface: w[0], strongs: w[1], morph: w[2] });
            byBook[book] = (byBook[book] || 0) + 1;
            const fk = String(w[2] || '');
            forms.set(fk, (forms.get(fk) || 0) + 1);
          }
        }
      }
    }
    return { hits, byBook, forms, verses: new Set(hits.map(h => `${h.book} ${h.ch}:${h.v}`)).size };
  }

  // ── Results UI (in Rhēma's search panel) ──────────────────────────────────
  let _spec = null, _res = null, _shown = 40;
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function title(spec) {
    const lang = spec.lang;
    const order = lang === 'hebrew' ? HE_ORDER : GK_ORDER;
    const parts = order.filter(k => spec.want[k] && k !== 'pos').map(k => label(lang, k, spec.want[k]));
    if (spec.want.pos && !parts.length) parts.push(label(lang, 'pos', spec.want.pos));
    const lex = lang === 'hebrew' ? (window.RhemaHebrewLexicon || {}) : (window.RhemaLexicon || {});
    const lemma = spec.strongs && spec.strongs.length ? (lex[spec.strongs[0]]?.lemma || spec.typed) : spec.surface;
    let t = parts.length ? parts.join(' ') : (lemma ? 'Every use' : '');
    if (lemma) t += (parts.length ? ' of ' : ' of ') + lemma;
    if (spec.scope?.label) t += ' in ' + spec.scope.label;
    return t || 'Search';
  }
  function chipsHtml(spec) {
    const lang = spec.lang;
    const order = lang === 'hebrew' ? HE_ORDER : GK_ORDER;
    const lex = lang === 'hebrew' ? (window.RhemaHebrewLexicon || {}) : (window.RhemaLexicon || {});
    const chips = [];
    if (spec.strongs && spec.strongs.length) {
      const e = lex[spec.strongs[0]] || {};
      chips.push(`<button type="button" class="rgs-chip rgs-chip-word" onclick="RhemaGrammarSearch.drop('word')"><b>${esc(e.lemma || spec.typed || '')}</b><small>${lang === 'hebrew' ? 'H' : 'G'}${esc(spec.strongs[0])}${e.brief ? ' · ' + esc(String(e.brief).split(/[,;]/)[0]) : ''}</small><span class="material-symbols-outlined">close</span></button>`);
    } else if (spec.surface) {
      chips.push(`<button type="button" class="rgs-chip rgs-chip-word" onclick="RhemaGrammarSearch.drop('word')"><b>${esc(spec.surface)}</b><small>this exact form</small><span class="material-symbols-outlined">close</span></button>`);
    }
    for (const k of order) if (spec.want[k]) chips.push(`<button type="button" class="rgs-chip" onclick="RhemaGrammarSearch.drop('${k}')">${esc(label(lang, k, spec.want[k]))}<span class="material-symbols-outlined">close</span></button>`);
    if (spec.scope) chips.push(`<button type="button" class="rgs-chip rgs-chip-scope" onclick="RhemaGrammarSearch.drop('scope')"><span class="material-symbols-outlined">menu_book</span>${esc(spec.scope.label)}<span class="material-symbols-outlined">close</span></button>`);
    return chips.join('');
  }
  function englishFor(hit) {
    const hebrew = _spec.lang === 'hebrew';
    let book = hit.book, ch = hit.ch, v = hit.v;
    if (hebrew && typeof window._rhemaHebEngRef === 'function') {
      const er = window._rhemaHebEngRef(book, ch, v);
      if (!er) return { ref: null, text: '', word: '' };
      [ch, v] = er;
    }
    const ver = window._rhemaEnglishVersion ? window._rhemaEnglishVersion() : 'MSB';
    const text = (window._rhemaEnglishText && window._rhemaEnglishText(book, ch, v, ver)) || '';
    let word = '';
    try {
      if (hebrew) word = window._rhemaHebILWord?.(hit.book, hit.ch, hit.v, hit.idx)?.en || '';
      else {
        const words = (window._rhemaTextForMode ? window._rhemaTextForMode(TEXT_MODE()) : window.RhemaNT.text)[hit.book][hit.ch][hit.v];
        word = (window._rhemaBsbEnglishForTokens?.(words, hit.book, hit.ch, hit.v) || [])[hit.idx] || '';
      }
    } catch (e) { word = ''; }
    word = String(word).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    return { ref: { book, ch, v }, text, word };
  }
  function boldWord(text, word) {
    const t = esc(text);
    if (!word || word.length < 2) return t;
    const words = word.split(' ').filter(w => w.length > 1 && !/^(the|a|an|of|to|and|in|he|his|they|it)$/i.test(w));
    const key = words.sort((a, b) => b.length - a.length)[0];
    if (!key) return t;
    const re = new RegExp(`\\b(${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
    return t.replace(re, '<mark>$1</mark>');
  }
  function formLabel(code, lang) {
    const hebrew = (lang || _spec?.lang) === 'hebrew';
    const f = hebrew ? heFeatures(code) : gkFeatures(code);
    const order = hebrew ? ['stem', 'form', 'person', 'gender', 'number'] : ['tense', 'voice', 'mood', 'person', 'case', 'number', 'gender'];
    const out = order.filter(k => f[k]).map(k => label(hebrew ? 'hebrew' : 'greek', k, f[k]).replace(/ \(.*\)$/, '').toLowerCase());
    return out.length ? out.join(' ') : (label(hebrew ? 'hebrew' : 'greek', 'pos', f.pos) || '').toLowerCase();
  }
  async function render() {
    const host = document.getElementById('rhemaSearchResults');
    const status = document.getElementById('rhemaSearchAiStatus');
    if (!host || !_spec) return;
    if (status) status.textContent = '';
    const r = _res;
    const top = Object.entries(r.byBook).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const hebrew = _spec.lang === 'hebrew';
    // In-context English for the rows on screen.
    const rows = r.hits.slice(0, _shown);
    if (hebrew && typeof window._rhemaLoadHebIL === 'function') await Promise.all([...new Set(rows.map(h => h.book))].map(b => window._rhemaLoadHebIL(b)));
    else if (typeof window._ensureRhemaBsbAlign === 'function') await window._ensureRhemaBsbAlign().catch(() => {});
    if (!_spec || _res !== r) return;
    const text = hebrew ? 'the Hebrew text (Westminster Leningrad, OSHB parsing)' : TEXT_MODE() === 'critical' ? 'the critical Greek text (SBLGNT)' : 'the Greek text (Byzantine majority)';
    host.innerHTML = `<div class="rgs">
      <div class="rgs-head">
        <span class="rgs-kicker"><span class="material-symbols-outlined">manage_search</span>Every form like this</span>
        <strong>${esc(title(_spec))}</strong>
        <small>${r.hits.length ? `${r.hits.length.toLocaleString()} use${r.hits.length === 1 ? '' : 's'} in ${r.verses.toLocaleString()} verse${r.verses === 1 ? '' : 's'}` : 'No uses found'} · exact, from ${text}${_spec.fromAi ? '. Smart search picked the word; check it in the chip below.' : ''}</small>
      </div>
      <div class="rgs-chips">${chipsHtml(_spec)}</div>
      ${top.length > 1 && !(_spec.scope?.books?.length === 1) ? `<div class="rgs-books">${top.map(([b, n]) => `<button type="button" onclick="RhemaGrammarSearch.book('${b}')"><b>${esc(window._rhemaBookName ? window._rhemaBookName(b) : b)}</b> ${n}</button>`).join('')}</div>` : ''}
      <div class="rgs-list">${rows.map((h, i) => {
        const e = englishFor(h);
        if (!e.ref) return '';
        const refLabel = `${window._rhemaBookName ? window._rhemaBookName(e.ref.book) : e.ref.book} ${e.ref.ch}:${e.ref.v}`;
        return `<button type="button" class="rgs-row" onclick="RhemaGrammarSearch.open(${i})">
          <span class="rgs-ref">${esc(refLabel)}</span>
          <span class="rgs-text">${boldWord(e.text, e.word)}</span>
          <span class="rgs-word"><b>${esc(h.surface)}</b> ${esc(formLabel(h.morph))}${e.word ? ` · “${esc(e.word)}”` : ''}</span>
        </button>`;
      }).join('')}</div>
      ${r.hits.length > _shown ? `<button type="button" class="rgs-more" onclick="RhemaGrammarSearch.more()">Show more (${(r.hits.length - _shown).toLocaleString()} left)</button>` : ''}
    </div>`;
  }
  async function show(spec, opts = {}) {
    _spec = spec; _shown = 40;
    const host = document.getElementById('rhemaSearchResults');
    const status = document.getElementById('rhemaSearchAiStatus');
    if (status) status.textContent = spec.lang === 'hebrew' && !window.RhemaHebrewOT ? 'Loading the Hebrew Old Testament…' : 'Searching every word…';
    if (host && !opts.keep) host.innerHTML = '';
    await ensureData(spec);
    if (_spec !== spec) return;
    // A typed Greek/Hebrew word only resolves once the lexicon is here.
    if (spec.typed && !spec.strongs?.length && !spec.surface) Object.assign(spec, parse(spec.typed) || {});
    else if (spec.typed && !spec.strongs?.length && spec.surface && /[^\x00-\x7f]/.test(spec.typed)) {
      const again = wordFrom(spec.typed);
      if (again?.strongs?.length) { spec.strongs = again.strongs; spec.surface = null; }
    }
    _res = run(spec);
    await render();
  }
  function open(i) {
    const h = _res?.hits?.[i];
    if (!h) return;
    let book = h.book, ch = h.ch, v = h.v;
    if (_spec.lang === 'hebrew' && typeof window._rhemaHebEngRef === 'function') { const er = window._rhemaHebEngRef(book, ch, v); if (er) [ch, v] = er; }
    try { window.closeRhemaSearch?.(); } catch (e) {}
    if (typeof window.jumpToRhemaVerse === 'function') window.jumpToRhemaVerse(book, ch, v, h.strongs);
  }
  function drop(what) {
    if (!_spec) return;
    if (what === 'word') { _spec.strongs = null; _spec.surface = null; _spec.typed = null; }
    else if (what === 'scope') _spec.scope = null;
    else delete _spec.want[what];
    if (!_spec.strongs && !_spec.surface && !Object.keys(_spec.want).filter(k => k !== 'pos').length) {
      const host = document.getElementById('rhemaSearchResults');
      if (host) host.innerHTML = '<div class="home-rhema-search-status">Add a word or a form to search for.</div>';
      _res = null;
      return;
    }
    show(_spec, { keep: true });
  }
  function book(code) {
    if (!_spec) return;
    _spec.scope = { books: [code], label: window._rhemaBookName ? window._rhemaBookName(code) : code };
    show(_spec, { keep: true });
  }
  function more() { _shown += 60; render(); }

  // From a word sheet: this word, in this exact form; drop chips to widen.
  function fromWord(surface, strongs, morph, layer) {
    const hebrew = layer === 'hebrew';
    const f = hebrew ? heFeatures(morph) : gkFeatures(morph);
    const want = {};
    for (const k of (hebrew ? HE_ORDER : GK_ORDER)) if (f[k] && k !== 'state') want[k] = f[k];
    if (!hebrew && want.voice) want.voice = (/[MDEN]/.test(want.voice) && !/[POEN]/.test(want.voice)) ? 'M' : /[POEN]/.test(want.voice) && want.voice !== 'E' && want.voice !== 'N' ? 'P' : want.voice === 'A' || want.voice === 'Q' ? 'A' : null;
    if (!want.voice) delete want.voice;
    if (hebrew && want.gender === 'c') delete want.gender;
    delete want.pos;
    const spec = { lang: hebrew ? 'hebrew' : 'greek', want, strongs: strongs ? [Number(strongs)] : null, surface: null, typed: null, scope: null };
    try { window._rhemaTakeSearchSheetSnap?.(); window.closeRhemaSheet?.(); } catch (e) {}
    const modal = document.getElementById('rhemaModal');
    if (modal && !modal.classList.contains('rhema-search-open') && typeof window.toggleRhemaSearch === 'function') window.toggleRhemaSearch();
    const input = document.getElementById('rhemaSearchInput');
    if (input) { input.value = title(spec); input.blur(); }
    window._syncHomeRhemaSearchClear?.(input?.value || '');
    show(spec);
  }

  // From the smart (AI) search: it names the word(s), form and books; the
  // count itself comes from the text here.
  function fromAi(ws) {
    if (!ws || (ws.language !== 'greek' && ws.language !== 'hebrew') || !Array.isArray(ws.strongs) || !ws.strongs.length) return null;
    const lang = ws.language;
    const lex = lang === 'hebrew' ? (window.RhemaHebrewLexicon || null) : (window.RhemaLexicon || null);
    const strongs = ws.strongs.map(Number).filter(n => n > 0 && (!lex || lex[n]));
    if (!strongs.length) return null;
    const want = {};
    const g = String(ws.grammar || '').toLowerCase();
    for (const [k, v, re] of (lang === 'hebrew' ? HE_TERMS : GK_TERMS)) if (!want[k] && re.test(g)) want[k] = v;
    delete want.pos;
    const codes = [...new Set((ws.books || []).map(bookCode).filter(Boolean))]
      .filter(c => (lang === 'hebrew' ? OT_ORDER() : NT_ORDER()).includes(c));
    let scope = null;
    if (codes.length) {
      const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
      const named = Object.keys(GROUPS).find(k => same(GROUPS[k], codes));
      scope = { books: codes, label: named ? GROUP_NAMES[named] : codes.length === 1 ? (window._rhemaBookName ? window._rhemaBookName(codes[0]) : codes[0]) : `${codes.length} books` };
    }
    return { lang, want, strongs, surface: null, typed: null, scope, fromAi: true };
  }

  window.RhemaGrammarSearch = { fromAi, parse, run, show, open, drop, book, more, fromWord, title, formLabel, gkFeatures, heFeatures, active: () => !!_spec, reset: () => { _spec = null; _res = null; } };
})();
