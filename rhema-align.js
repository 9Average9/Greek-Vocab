/* Rhēma word alignment — pure functions, no DOM (unit-tested in Node by
   scripts/test-interlinear-align.js).

   Two jobs:

   1. alignGreekToRows(): map the app's Greek tokens (Byzantine RP2018 or
      SBLGNT) onto the Berean word table rows for the same verse
      (window.RhemaBSBAlign, keyed by Strong's in Greek order, made from a
      critical-style text in English versification). This is an ORDERED
      alignment (weighted LCS), so repeated words (αὐτῶν … αὐτοῖς, ὁ … ὁ) can
      no longer swap, it understands where the two sources number the same
      Greek word differently (εἶπον G2036 vs G3004, τίς G5101 vs G5100, …),
      and it looks into the neighbouring verse when the two texts divide
      verses differently (2 Cor 13:12–14, 3 John 14–15, Rev 12:17–18).

   2. bridgeToVersion(): find, inside a version's verse sentence (NIV, NASB,
      MSB, …), the English word(s) that render each Greek token, using the
      exact Berean rendering as the seed. Matches are anchored and ordered,
      multi-word renderings stay whole ("is looking for"), translator-supplied
      words never count, and every result carries a `kind` so the UI can say
      honestly how it was found:
        exact    – the Berean table itself (BSB only)
        match    – the same word(s) found in this version's sentence
        inferred – the only unclaimed words in the right slot (≈)
        none     – this version has no separate word for it (articles, …)
        ''       – no reliable match; show the literal meaning instead
*/
(function (root) {
  'use strict';

  // ── Strong's numbering conventions ─────────────────────────────────────────
  // Measured from the data (scripts/test-interlinear-align.js --equiv): pairs
  // that sit in the same slot of the same verse hundreds of times. Each group
  // is ONE Greek lexeme that the Berean tables and the app's texts number
  // differently (suppletive verbs, comparative forms, accent homographs).
  const STRONGS_GROUPS = [
    [3004, 2036, 2046, 4483],   // λέγω / εἶπον / ἐρῶ / ῥέω — "say"
    [3708, 2400, 2396, 1492],   // ὁράω / ἰδού / ἴδε / εἶδον — "see, behold"
    [5100, 5101],               // τις / τίς
    [1519, 1520],               // εἰς / εἷς (the app's tagging confuses them)
    [4183, 4119, 4118],         // πολύς / πλείων / πλεῖστος
    [1210, 1163],               // δέω / δεῖ
    [2068, 5315],               // ἐσθίω / φάγω — "eat"
    [757, 756],                 // ἄρχω / ἄρχομαι — "begin"
    [2413, 2411],               // ἱερός / ἱερόν — "temple"
    [3441, 3440],               // μόνος / μόνον
    [4413, 4412],               // πρῶτος / πρῶτον
    [2117, 2112],               // εὐθύς / εὐθέως
    [4225, 4226],               // που / ποῦ
    [681, 680],                 // ἅπτω / ἅπτομαι
    [685, 686, 687],            // ἀρά / ἄρα / ἆρα
    [302, 1437],                // ἄν / ἐάν
    [1438, 848, 846],           // ἑαυτοῦ / αὑτοῦ / αὐτός
    [4218, 4219],               // ποτέ / πότε
    [4055, 4053],               // περισσότερος / περισσός
    [4056, 4057],               // περισσοτέρως / περισσῶς
    [3375, 3376],               // μήν (particle) / μήν (month) — tagging overlap
    [5598, 5599],               // Ω / ὦ
    [2455, 2448],               // Ἰούδας / Ἰουδά
    [1622, 1623],               // ἐκτός / ἕκτος
    [3777, 3761],               // οὔτε / οὐδέ
    [5616, 5613],               // ὡσεί / ὡς
    [3062, 3063],               // λοιπός / λοιπόν
    [4387, 4386],               // πρότερος / πρότερον
    [3117, 3112],               // μακρός / μακράν
  ];
  const CANON = new Map();
  for (const g of STRONGS_GROUPS) for (const s of g) CANON.set(String(s), String(g[0]));
  const canon = (s) => CANON.get(String(s)) || String(s);

  // Weighted ordered alignment (LCS) of token Strong's against row Strong's.
  // Returns the matched pairs [tokenIdx, rowIdx] in order.
  function _orderedPairs(a, b, rowBonus) {
    const n = a.length, m = b.length;
    const score = (i, j) => {
      if (!a[i]) return 0;
      if (a[i] === b[j]) return 4 + (rowBonus ? rowBonus[j] : 0);
      if (canon(a[i]) === canon(b[j])) return 3 + (rowBonus ? rowBonus[j] : 0);
      return 0;
    };
    const d = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const s = score(i, j);
        d[i][j] = Math.max(d[i + 1][j], d[i][j + 1], s ? d[i + 1][j + 1] + s : 0);
      }
    }
    const pairs = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      const s = score(i, j);
      if (s && d[i][j] === d[i + 1][j + 1] + s) { pairs.push([i, j]); i++; j++; }
      else if (d[i + 1][j] >= d[i][j + 1]) i++;
      else j++;
    }
    return pairs;
  }

  // Fill what the ordered pass left: words that swapped places (Χριστὸς
  // Ἰησοῦς ↔ Ἰησοῦς Χριστός) and tokens with no Strong's number sitting alone
  // in a 1-for-1 gap.
  function _fillGaps(a, b, map) {
    const n = a.length, m = b.length;
    const usedRow = new Array(m).fill(false);
    map.forEach(j => { if (j >= 0) usedRow[j] = true; });
    // Anchor bounds for each token.
    const leftRow = new Array(n), rightRow = new Array(n);
    let last = -1;
    for (let i = 0; i < n; i++) { if (map[i] >= 0) last = map[i]; leftRow[i] = last; }
    last = m;
    for (let i = n - 1; i >= 0; i--) { if (map[i] >= 0) last = map[i]; rightRow[i] = last; }
    // Transpositions: nearest unused same-lexeme row within 3 slots of the gap.
    for (let i = 0; i < n; i++) {
      if (map[i] >= 0 || !a[i]) continue;
      const lo = Math.max(0, leftRow[i] - 3), hi = Math.min(m - 1, rightRow[i] + 3);
      let best = -1, bestD = Infinity;
      const mid = (leftRow[i] + rightRow[i]) / 2;
      for (let j = lo; j <= hi; j++) {
        if (usedRow[j] || canon(a[i]) !== canon(b[j])) continue;
        const dd = Math.abs(j - mid);
        if (dd < bestD) { bestD = dd; best = j; }
      }
      if (best >= 0) { map[i] = best; usedRow[best] = true; }
    }
    // Lone unnumbered token in a 1-for-1 gap (SBLGNT tokens the app couldn't
    // number, e.g. οὕτως): take the single unused row between the anchors.
    for (let i = 0; i < n; i++) {
      if (map[i] >= 0 || a[i]) continue;
      let li = i - 1; while (li >= 0 && map[li] < 0) li--;
      let ri = i + 1; while (ri < n && map[ri] < 0) ri++;
      if (li !== i - 1 || ri !== i + 1) continue; // only a truly isolated token
      const lr = li >= 0 ? map[li] : -1, rr = ri < n ? map[ri] : m;
      const free = [];
      for (let j = lr + 1; j < rr; j++) if (!usedRow[j]) free.push(j);
      if (free.length === 1) { map[i] = free[0]; usedRow[free[0]] = true; }
    }
    return map;
  }

  function _alignTo(a, rows, rowBonus) {
    const b = rows.map(r => String(r[0]));
    const map = new Array(a.length).fill(-1);
    for (const [i, j] of _orderedPairs(a, b, rowBonus)) map[i] = j;
    _fillGaps(a, b, map);
    const matched = map.filter(j => j >= 0).length;
    return { map, matched };
  }

  /**
   * @param {string[]} tokenStrongs  Strong's per Greek token ('' if unknown)
   * @param {Array} rows   Berean rows for the verse: [[strongs, english], …]
   * @param {object} [nb]  { prev: rows of v-1, next: rows of v+1 }
   * @returns {{english: string[], rowIdx: number[], ratio: number, region: string}}
   *   english[i] is the Berean rendering for token i ('' = no standalone word),
   *   or null when the token has no row (no reliable alignment).
   */
  function alignGreekToRows(tokenStrongs, rows, nb = {}) {
    const a = tokenStrongs.map(s => (s ? String(s) : ''));
    const numbered = a.filter(Boolean).length || 1;
    const empty = { english: a.map(() => null), rowIdx: a.map(() => -1), ratio: 0, region: 'none' };
    const candidates = [];
    if (rows && rows.length) candidates.push({ region: 'own', rows, bonus: null });
    // Different verse division: try this verse together with its neighbours.
    // Rows from the reader's own verse get a small bonus so a neighbour is
    // only used where the verse really continues there.
    const withBonus = (parts) => {
      const all = [], bonus = [];
      for (const [r, own] of parts) for (const row of (r || [])) { all.push(row); bonus.push(own ? 0.25 : 0); }
      return { rows: all, bonus };
    };
    if (nb.prev?.length) candidates.push({ region: 'prev+own', ...withBonus([[nb.prev, false], [rows, true]]) });
    if (nb.next?.length) candidates.push({ region: 'own+next', ...withBonus([[rows, true], [nb.next, false]]) });
    if (!candidates.length) return empty;
    let best = null;
    for (const c of candidates) {
      const r = _alignTo(a, c.rows, c.bonus);
      // A neighbour only wins with clearly more matches (≥2) than the own verse.
      if (!best || r.matched > best.r.matched + (best.c.region === 'own' ? 1 : 0)) best = { c, r };
    }
    const ratio = best.r.matched / Math.max(1, Math.min(numbered, best.c.rows.length));
    // Below this the "alignment" is mostly coincidental common words — say
    // nothing rather than put a wrong word under the Greek.
    if (ratio < 0.45) return { ...empty, ratio, region: best.c.region };
    return {
      english: best.r.map.map(j => (j >= 0 ? String(best.c.rows[j][1] || '') : null)),
      rowIdx: best.r.map,
      ratio,
      region: best.c.region,
    };
  }

  // ── Berean rendering text helpers ─────────────────────────────────────────
  // "[The people] were astonished" — [ ] marks words the translators supplied;
  // "{Do} not" — { } marks a word moved from elsewhere in the sentence.
  const bsbDirect = (s) => String(s || '').replace(/\[[^\]]*\]/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  const bsbFull = (s) => String(s || '').replace(/[\[\]{}]/g, '').replace(/\s+/g, ' ').trim();

  // ── English normalisation ─────────────────────────────────────────────────
  const IRREGULAR = {
    said: 'say', says: 'say', saith: 'say', went: 'go', gone: 'go', goes: 'go', going: 'go',
    came: 'come', comes: 'come', coming: 'come', heard: 'hear', saw: 'see', seen: 'see', sees: 'see',
    took: 'take', taken: 'take', gave: 'give', given: 'give', knew: 'know', known: 'know',
    spoke: 'speak', spoken: 'speak', spake: 'speak', began: 'begin', begun: 'begin', ate: 'eat', eaten: 'eat',
    drank: 'drink', drunk: 'drink', wrote: 'write', written: 'write', brought: 'bring', bought: 'buy',
    sought: 'seek', thought: 'think', taught: 'teach', caught: 'catch', found: 'find', stood: 'stand',
    sat: 'sit', led: 'lead', fled: 'flee', fell: 'fall', fallen: 'fall', rose: 'rise', risen: 'rise',
    arose: 'arise', arisen: 'arise', did: 'do', done: 'do', doth: 'do', made: 'make', men: 'man',
    women: 'woman', children: 'child', brethren: 'brother', feet: 'foot', teeth: 'tooth', kept: 'keep',
    slept: 'sleep', wept: 'weep', sent: 'send', built: 'build', felt: 'feel', met: 'meet', paid: 'pay',
    held: 'hold', told: 'tell', sold: 'sell', threw: 'throw', thrown: 'throw', grew: 'grow', grown: 'grow',
    drew: 'draw', drawn: 'draw', chose: 'choose', chosen: 'choose', hid: 'hide', hidden: 'hide',
    bore: 'bear', born: 'bear', borne: 'bear', broke: 'break', broken: 'break', forgave: 'forgive',
    forgiven: 'forgive', became: 'become', understood: 'understand', lay: 'lie', lain: 'lie', laid: 'lay',
    struck: 'strike', stricken: 'strike', fought: 'fight', sang: 'sing', sung: 'sing', ran: 'run',
    swore: 'swear', sworn: 'swear', shook: 'shake', shaken: 'shake', woke: 'wake', awoke: 'wake',
    hung: 'hang', bound: 'bind', wound: 'wind', lost: 'lose', meant: 'mean', dealt: 'deal', dwelt: 'dwell',
    lit: 'light', sprang: 'spring', sprung: 'spring', clothed: 'clothe', loosed: 'loose', lives: 'life',
    oxen: 'ox', wives: 'wife', knives: 'knife', leaves: 'leaf', loaves: 'loaf', sheaves: 'sheaf',
    are: 'be', is: 'be', was: 'be', were: 'be', been: 'be', being: 'be', am: 'be', art: 'be',
    has: 'have', had: 'have', hath: 'have', having: 'have', hast: 'have',
    thee: 'you', thou: 'you', ye: 'you', thy: 'your', thine: 'your',
  };
  function stem(word) {
    let w = String(word || '').toLowerCase().replace(/[’']s$/, '').replace(/[^a-z]/g, '');
    if (!w) return '';
    if (IRREGULAR[w]) w = IRREGULAR[w];
    for (let pass = 0; pass < 3; pass++) {
      const before = w;
      if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
      else if (w.length > 4 && w.endsWith('ied')) w = w.slice(0, -3) + 'y';
      else if (w.length > 5 && w.endsWith('ingly')) w = w.slice(0, -5);
      else if (w.length > 5 && w.endsWith('edly')) w = w.slice(0, -4);
      else if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3);
      else if (w.length > 4 && w.endsWith('eth')) w = w.slice(0, -3);
      else if (w.length > 3 && w.endsWith('ed')) w = w.slice(0, -2);
      else if (w.length > 4 && /(ss|sh|ch|x|z)es$/.test(w)) w = w.slice(0, -2);
      else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) w = w.slice(0, -1);
      else if (w.length > 4 && w.endsWith('ly')) w = w.slice(0, -2);
      else if (w.length > 5 && w.endsWith('ness')) w = w.slice(0, -4);
      else if (w.length > 4 && w.endsWith('er')) w = w.slice(0, -2);
      if (w === before) break;
    }
    // runn → run, sinn → sin; love/lov, believe/believ agree.
    if (w.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|ff|zz)$/.test(w)) w = w.slice(0, -1);
    if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
    return w;
  }

  // English words that translations supply as grammar: articles, prepositions,
  // pronouns, auxiliaries, conjunctions. A Greek CONTENT word must map to the
  // content word of its rendering, never to one of these.
  const GRAMMAR = new Set((
    'a an the and or but nor for of to in on at by with from into upon onto unto out off over under up down ' +
    'i me my mine myself you your yours yourself yourselves he him his himself she her hers herself it its itself ' +
    'we us our ours ourselves they them their theirs themselves this that these those who whom whose which what ' +
    'is are was were be been being am has have had having do does did done will would shall should may might can ' +
    'could must when while as if then than so not no there here also even just let thee thou thy thine ye unto'
  ).split(' '));
  const isGrammar = (w) => GRAMMAR.has(String(w || '').toLowerCase());

  function tokenizeEnglish(text) {
    const out = [];
    const re = /[A-Za-z][A-Za-z’'-]*[A-Za-z]|[A-Za-z]|\d[\d,]*/g;
    let m;
    while ((m = re.exec(String(text || '')))) {
      const raw = m[0];
      const low = raw.toLowerCase().replace(/[’']s$/, '');
      out.push({ raw, low, stem: /^\d/.test(raw) ? raw.replace(/,/g, '') : stem(low), grammar: isGrammar(low), start: m.index, end: m.index + raw.length });
    }
    return out;
  }
  function wordsOf(text) { return tokenizeEnglish(text).map(t => t); }

  // ── Bridge a version's sentence to the Greek tokens ───────────────────────
  /**
   * @param {Array<{bsb: (string|null), gloss?: string, meanings?: string[]}>} items
   *   One per Greek token, in Greek order. bsb = Berean rendering ('' = the
   *   Berean table says no standalone English; null = unknown).
   * @param {string} versionText  The version's verse sentence.
   * @returns {Array<{text: string, kind: string}>}
   */
  function bridgeToVersion(items, versionText) {
    const toks = tokenizeEnglish(versionText);
    const n = items.length;
    const out = items.map(() => ({ text: '', kind: '' }));
    if (!toks.length || !n) return out;
    const used = new Array(toks.length).fill(false);
    const span = new Array(n).fill(null); // [start, end] in toks

    const prep = items.map((it) => {
      const direct = it.bsb == null ? null : wordsOf(bsbDirect(it.bsb));
      const directContent = direct ? direct.filter(t => !t.grammar) : [];
      const glossAll = wordsOf(String(it.gloss || '').replace(/\//g, ' '));
      const gloss = glossAll.filter(t => !t.grammar);
      const meanings = new Set();
      for (const m of (it.meanings || [])) for (const t of wordsOf(m)) if (!t.grammar && t.stem.length >= 3) meanings.add(t.stem);
      return {
        none: it.bsb === '' || (direct && direct.length === 0 && it.bsb != null),
        phrase: direct && direct.length ? direct.map(t => t.stem) : null,
        content: new Set([...directContent, ...gloss].map(t => t.stem).filter(Boolean)),
        // Grammar-word renderings: the Berean wording, or — for a word the
        // Berean base text lacks (a Majority-text reading) — its literal gloss.
        func: new Set((direct && direct.length && !directContent.length ? direct
          : (it.bsb == null && !gloss.length ? glossAll : [])).map(t => t.stem)),
        meanings,
      };
    });

    // Where token i is expected in the English, from the anchors so far.
    const expectedAt = (i) => {
      let l = i - 1; while (l >= 0 && !span[l]) l--;
      let r = i + 1; while (r < n && !span[r]) r++;
      const ratio = toks.length / Math.max(1, n);
      if (l >= 0 && r < n) return span[l][1] + (i - l) * (span[r][0] - span[l][1]) / (r - l);
      if (l >= 0) return span[l][1] + (i - l) * ratio;
      if (r < n) return span[r][0] - (r - i) * ratio;
      return i * ratio;
    };
    const claim = (i, s, e, kind) => {
      for (let k = s; k <= e; k++) used[k] = true;
      span[i] = [s, e];
      // start/end: character range in versionText, for exact highlighting.
      out[i] = { text: toks.slice(s, e + 1).map(t => t.raw).join(' '), kind, start: toks[s].start, end: toks[e].end };
    };
    // All unused contiguous occurrences of a stem sequence.
    const findSeq = (seq) => {
      const hits = [];
      for (let s = 0; s + seq.length <= toks.length; s++) {
        let ok = true;
        for (let k = 0; k < seq.length; k++) { if (used[s + k] || toks[s + k].stem !== seq[k]) { ok = false; break; } }
        if (ok) hits.push(s);
      }
      return hits;
    };

    // Phase 1 — the whole Berean phrase appears verbatim (MSB, and most of
    // NASB/ESV/KJV). Longest, then rarest, first; unique hits become anchors.
    const order = [...Array(n).keys()].filter(i => prep[i].phrase && prep[i].content.size)
      .sort((x, y) => prep[y].phrase.length - prep[x].phrase.length);
    for (let pass = 0; pass < 2; pass++) {
      for (const i of order) {
        if (span[i]) continue;
        const seq = prep[i].phrase;
        const hits = findSeq(seq);
        if (!hits.length) continue;
        if (hits.length === 1 || pass === 1) {
          const exp = expectedAt(i);
          const s = hits.reduce((b, h) => (Math.abs(h - exp) < Math.abs(b - exp) ? h : b), hits[0]);
          claim(i, s, s + seq.length - 1, 'match');
        }
      }
    }

    // Nearest unused token whose stem is in `set`, optionally within `cap`.
    const nearest = (i, set, allowGrammar, cap) => {
      const exp = expectedAt(i);
      let best = -1, bestD = Infinity;
      for (let j = 0; j < toks.length; j++) {
        if (used[j] || !set.has(toks[j].stem)) continue;
        if (!allowGrammar && toks[j].grammar) continue;
        const dd = Math.abs(j - exp);
        if (dd < bestD && dd <= cap) { bestD = dd; best = j; }
      }
      return best;
    };
    // Grow a single matched word into its adjacent content words that are
    // also part of the rendering ("living water", "Holy Spirit").
    const grow = (i, j, set) => {
      let s = j, e = j;
      while (s - 1 >= 0 && !used[s - 1] && !toks[s - 1].grammar && set.has(toks[s - 1].stem)) s--;
      while (e + 1 < toks.length && !used[e + 1] && !toks[e + 1].grammar && set.has(toks[e + 1].stem)) e++;
      return [s, e];
    };

    // Phase 2 — content words of the rendering (distinctive, so a wide cap).
    const wide = Math.max(6, Math.ceil(toks.length * 0.6));
    for (let i = 0; i < n; i++) {
      if (span[i] || prep[i].none || !prep[i].content.size) continue;
      const j = nearest(i, prep[i].content, false, wide);
      if (j >= 0) { const [s, e] = grow(i, j, prep[i].content); claim(i, s, e, 'match'); }
    }
    // Phase 3 — wider lexicon meanings for content words still open.
    for (let i = 0; i < n; i++) {
      if (span[i] || prep[i].none || !prep[i].meanings.size) continue;
      const j = nearest(i, prep[i].meanings, false, wide);
      if (j >= 0) claim(i, j, j, 'match');
    }
    // Phase 3b — a grammar-word rendering ("His", "to them") that occurs only
    // once in the sentence is unambiguous even if it sits a few words away.
    for (let i = 0; i < n; i++) {
      if (span[i] || prep[i].none || !prep[i].func.size) continue;
      const seqs = prep[i].phrase ? [prep[i].phrase] : [...prep[i].func].map(x => [x]);
      const hits = [];
      for (const seq of seqs) for (const h of findSeq(seq)) hits.push([h, seq.length]);
      if (hits.length === 1 && Math.abs(hits[0][0] - expectedAt(i)) <= Math.max(6, toks.length * 0.4)) {
        claim(i, hits[0][0], hits[0][0] + hits[0][1] - 1, 'match');
      }
    }
    // Phase 4 — Greek function words whose rendering IS a grammar word (καί
    // "and", σε "you"): only very close to where they're expected, since
    // these words repeat all through a sentence.
    for (let i = 0; i < n; i++) {
      if (span[i] || prep[i].none || !prep[i].func.size) continue;
      const j = nearest(i, prep[i].func, true, 2.5);
      if (j >= 0) claim(i, j, j, 'match');
    }
    // Phase 5 — a content word with no lexical match, alone in its slot: if
    // the anchors on either side leave a short run of unclaimed English with
    // content in it, that run is this version's rendering (NIV "teachers of
    // the law" for γραμματεῖς). Marked as inferred.
    for (let i = 0; i < n; i++) {
      if (span[i] || prep[i].none || !prep[i].content.size) continue;
      let l = i - 1; while (l >= 0 && !span[l]) l--;
      let r = i + 1; while (r < n && !span[r]) r++;
      // Every other token between the anchors must be one with no English.
      let alone = true;
      for (let k = l + 1; k < r; k++) if (k !== i && !prep[k].none && (prep[k].content.size || prep[k].func.size)) alone = false;
      if (!alone) continue;
      const from = l >= 0 ? span[l][1] + 1 : 0, to = r < n ? span[r][0] - 1 : toks.length - 1;
      if (to < from) continue;
      let s = from, e = to;
      for (let k = from; k <= to; k++) if (used[k]) { s = -1; break; }
      if (s < 0) continue;
      while (s <= e && toks[s].grammar) s++;
      while (e >= s && toks[e].grammar) e--;
      if (s > e || e - s > 4) continue;
      claim(i, s, e, 'inferred');
    }
    for (let i = 0; i < n; i++) if (!span[i] && prep[i].none) out[i] = { text: '', kind: 'none' };
    return out;
  }

  // Exact Berean display for the BSB itself.
  function bsbRenderings(english) {
    return english.map((e) => {
      if (e == null) return { text: '', kind: '' };
      const d = bsbDirect(e);
      return d ? { text: d, kind: 'exact', full: bsbFull(e) } : { text: '', kind: 'none', full: bsbFull(e) };
    });
  }

  // ── Greek surface → SBL-style transliteration ─────────────────────────────
  // The interlinear shows the word as it stands in the verse (ἠγάπησεν →
  // ēgapēsen), not the dictionary form's transliteration.
  const GR = {
    α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'ē', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm',
    ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'ō',
  };
  const VOWELS = new Set(['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω']);
  function translitGreek(word) {
    const letters = [];
    for (const ch of String(word || '').normalize('NFD')) {
      const low = ch.toLowerCase();
      if (GR[low]) letters.push({ ch: low, upper: ch !== low, rough: false });
      else if (ch === '̔' && letters.length) letters[letters.length - 1].rough = true; // rough breathing
    }
    let out = '';
    for (let i = 0; i < letters.length; i++) {
      const L = letters[i], prev = letters[i - 1], next = letters[i + 1];
      let t = GR[L.ch];
      // υ in a diphthong (αυ, ευ, ηυ, ου, υι) is "u".
      if (L.ch === 'υ' && ((prev && ['α', 'ε', 'η', 'ο'].includes(prev.ch)) || (next && next.ch === 'ι'))) t = 'u';
      // γ before γ κ ξ χ is nasal: ἄγγελος → angelos.
      if (L.ch === 'γ' && next && ['γ', 'κ', 'ξ', 'χ'].includes(next.ch)) t = 'n';
      // Rough breathing sits on the second vowel of a diphthong but is said first.
      const takesNextRough = i === 0 && next && next.rough && VOWELS.has(L.ch) && VOWELS.has(next.ch);
      const roughHere = takesNextRough || (L.rough && !(i === 1 && prev && VOWELS.has(prev.ch)));
      if (L.ch === 'ρ' && L.rough) t = 'rh';
      else if (roughHere && VOWELS.has(L.ch)) t = 'h' + t;
      if (L.upper) t = t.charAt(0).toUpperCase() + t.slice(1);
      out += t;
    }
    return out;
  }

  // Display form of an SBLGNT surface: drop the text-critical sigla (⸀⸂⸃…).
  const cleanSurface = (s) => String(s || '').replace(/[⸀-⸏]/g, '').trim();

  // ── Lemma → Strong's (for SBLGNT tokens the critical text left unnumbered) ─
  // SBLGNT supplies a lemma for every word; ~500 tokens carry no Strong's
  // number (οὕτω(ς), ἕνεκεν, οἶδα, middle-voice lemmas like φοβέομαι). Look the
  // lemma up in the lexicon: exact → accent-free → middle -ομαι as active -ω →
  // a unique one-letter spelling variant (γρηγορέω/γρηγορεύω, Μωϋσῆς/Μωσῆς).
  const lemmaKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/ς/g, 'σ').replace(/[^α-ω]/g, '');
  const LEMMA_ALIASES = { οιδα: 'ειδω', ενεκεν: 'ενεκα', εινεκεν: 'ενεκα', εχθεσ: 'χθεσ', αχρισ: 'αχρι', μηγε: 'μη' };
  function buildLemmaIndex(lexicon) {
    const exact = new Map(), norm = new Map();
    for (const [s, e] of Object.entries(lexicon || {})) {
      if (!e || !e.lemma) continue;
      const l = String(e.lemma).normalize('NFC');
      if (!exact.has(l)) exact.set(l, []);
      exact.get(l).push(s);
      const k = lemmaKey(l);
      if (!norm.has(k)) norm.set(k, []);
      norm.get(k).push(s);
    }
    return { exact, norm };
  }
  // Spelling swaps that are the same word in different editions (Μαθθαῖος /
  // Ματθαῖος, σιρικός / σηρικός). Any other substituted letter can be a
  // different word (γαμίζω "marry" vs γεμίζω "fill"), so it never matches.
  const SAFE_SWAPS = new Set(['θτ', 'τθ', 'οω', 'ωο', 'ιη', 'ηι', 'υι', 'ιυ']);
  function _within1(a, b) {
    if (Math.abs(a.length - b.length) > 1 || a === b) return a === b;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { if (!SAFE_SWAPS.has(a[i] + b[j])) return false; i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }
  function strongsForLemma(index, lemma) {
    if (!index || !lemma) return '';
    const raw = String(lemma).normalize('NFC');
    const forms = [raw];
    if (/\(/.test(raw)) forms.push(raw.replace(/[()]/g, ''), raw.replace(/\([^)]*\)/g, ''));
    for (const f of forms) { const e = index.exact.get(f); if (e && e.length === 1) return e[0]; }
    const keys = [];
    for (const f of forms) {
      const k = lemmaKey(f);
      keys.push(LEMMA_ALIASES[k] || k);
      if (k.endsWith('ομαι')) keys.push(k.slice(0, -4) + 'ω');
    }
    for (const k of keys) { const e = index.norm.get(k); if (e && e.length === 1) return e[0]; }
    for (const f of forms) { const e = index.exact.get(f); if (e && e.length) return e[0]; }
    for (const k of keys) { const e = index.norm.get(k); if (e && e.length) return e[0]; }
    // One-letter spelling variant, only when it is unambiguous and long enough
    // that a different word is implausible.
    for (const k of keys) {
      if (k.length < 6) continue;
      let hit = '', count = 0;
      for (const [nk, list] of index.norm) {
        if (nk[0] === k[0] && _within1(nk, k)) { hit = list[0]; count += list.length; if (count > 1) break; }
      }
      if (count === 1) return hit;
    }
    return '';
  }

  // Moulton–Milligan entries are keyed by Strong's number, and a few are
  // filed under the wrong one (φάγω holds the φαίνω article, Βαραββᾶς holds
  // βάρβαρος). The entry's own headword ("φαίνω [page 664]") tells us: accept
  // it when any headword form is the lemma, contains it, or (for longer words)
  // differs by at most two letters — spelling variants like ἐνκαινίζω /
  // ἐγκαινίζω or Γερασηνός / Γεργεσηνός.
  function _dist(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 3;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function mmHeadwordMatches(text, lemma) {
    const head = (String(text || '').match(/^([^\[<]+?)\s*\[page/) || [])[1];
    if (!head || !lemma) return true; // no headword to judge by
    const mid = (k) => k.replace(/ομαι$/, 'ω');
    const lk = mid(lemmaKey(lemma));
    const words = head.split(/[\s,\/~]+/).filter(Boolean);
    const whole = head.split(/[,\/~]/)[0];
    const forms = [...words, whole.replace(/[()]/g, ''), whole.replace(/\([^)]*\)/g, '')]
      .map((f) => mid(lemmaKey(f))).filter(Boolean);
    return forms.some((k) => k === lk || (k.length >= 4 && lk.includes(k)) ||
      (lk.length >= 4 && k.length >= 4 && _dist(k, lk) <= (lk.length >= 6 ? 2 : 1)));
  }

  // LSJ entries are matched to Strong's numbers by spelling, and accents tell
  // homographs apart: φῶς "light" vs φώς "man", ἔλεος "mercy" vs ἐλεός
  // "kitchen table", αἰών vs ἀϊών "shore". Normalise LSJ's conventions (length
  // marks, hyphens, ρρ/ῤῥ, diaeresis, iota subscript, grave→acute, *), then
  // require the same letters, breathings and accents.
  function _lsjForm(w) {
    return String(w || '').normalize('NFD')
      .replace(/[\u0304\u0306\u0308\u0345\-‐*\[\]]/g, '')
      .replace(/\u0300/g, '\u0301')
      .replace(/ρ\u0313ρ\u0314|ρ\u0314ρ|ρρ\u0314|ρ\u0313ρ/g, 'ρρ')
      .normalize('NFC').toLowerCase().replace(/ς/g, 'σ');
  }
  function lsjHeadwordMatches(lsj, lemma) {
    const toks = String(lsj || '').replace(/^\s*\*\s*/, '').split(/[\s,]+/).filter(Boolean);
    if (!toks.length || !lemma) return true;
    const lk = _lsjForm(lemma);
    return _lsjForm(toks[0]) === lk || (toks[1] && _lsjForm(toks[0] + toks[1]) === lk);
  }

  const api = { lsjHeadwordMatches, mmHeadwordMatches, buildLemmaIndex, strongsForLemma, lemmaKey, translitGreek, cleanSurface, STRONGS_GROUPS, canon, alignGreekToRows, bridgeToVersion, bsbRenderings, bsbDirect, bsbFull, stem, tokenizeEnglish, isGrammar };
  root.RhemaAlign = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
