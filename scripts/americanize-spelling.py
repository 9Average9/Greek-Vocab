#!/usr/bin/env python3
"""American spelling for the app's own text: colour → color, favourite →
favorite, recognise → recognize, labelled → labeled, centre → center, …

  python3 scripts/americanize-spelling.py --dry    # report only
  python3 scripts/americanize-spelling.py          # rewrite

Never touched: Bible text, lexicon quotations (Abbott-Smith, LSJ,
Moulton–Milligan, Strong's), the MSB/BSB footnotes, and quotations of the
King James Version (which really does say "Saviour"). Whole words only, so
code names such as eventCancelled are left alone.
"""
import json, glob, os, re, sys

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DRY = '--dry' in sys.argv

OUR = r'(col|fav|hon|behavi|lab|neighb|harb|sav|savi|splend|vig|arm|rum|hum|vap|clam|endeav|ferv|ard|od|parl|val|ranc|tum|flav|cand|rig)'
IZE = r'(recogn|real|organ|apolog|summar|memor|categor|visual|final|personal|custom|synchron|priorit|minim|maxim|util|critic|character|sympath|emphas|bapt|agon|author|civil|harmon|idol|evangel|scandal|stabil|normal|symbol|epitom|ideal|legitim|mobil|neutral|popular|rational|special|standard|terror|trivial|verbal|vocal|dramat|energ|familiar|general|modern|moral|natural|patron|satir|scrutin|social|spiritual|systemat|theor|total|hellen|juda|roman|christian|anglic|item|proselyt|catech|anathemat|dogmat|allegor|literal|contextual|particular|jeopard|sanit|capital|central|fertil|human|immortal|individual|internal|lexical|loc|marginal|maxim|mesmer|monopol|object|polar|public|radical|subsid|sensit|tantal|weapon|western|womanis)'
PRE = r'(mis|un|re|dis|pre|over|under|non|self-)?'
RULES = [
    (re.compile(r'^jewellery$'), lambda m: 'jewelry'),
    (re.compile(rf'^{PRE}{OUR}our(s|ed|ing|able|ably|ite|ites|ful|fully|less|hood|hoods|al|ally|er|ers|y|ies)?$'), lambda m: f"{m.group(1) or ''}{m.group(2)}or{m.group(3) or ''}"),
    (re.compile(rf'^{PRE}{IZE}is(e|ed|es|ing|ation|ations|er|ers|able)$'), lambda m: f"{m.group(1) or ''}{m.group(2)}iz{m.group(3)}"),
    (re.compile(r'^(ana|para|cata)lys(e|ed|ing)$'), lambda m: f"{m.group(1)}lyz{m.group(2)}"),
    (re.compile(rf'^{PRE}(trav|canc|mod|lab|sign|couns|marv|lev|quarr|fu|jew|dial|tunn|channel|equal|duel|initial|total|pan|rival|shov|snorkel|cudg|grov|hov|ref|sentin|shrivel|swivel|tow|trow|bev)ell(ed|ing|er|ers|or|ors|ous|ery)$'),
     lambda m: f"{m.group(1) or ''}{m.group(2)}el{m.group(3)}"),
    (re.compile(r'^(worship|kidnap)p(ed|ing|er|ers)$'), lambda m: f"{m.group(1)}{m.group(2)}"),
    (re.compile(r'^focuss(ed|es|ing)$'), lambda m: f"focus{m.group(1)}"),
    (re.compile(r'^(un)?fulfil(s|ment|ments)?$'), lambda m: f"{m.group(1) or ''}fulfill{m.group(2) or ''}"),
    (re.compile(r'^(enrol|instal)(ment|ments)$'), lambda m: f"{m.group(1)}l{m.group(2)}"),
    (re.compile(r'^(skil|wil)ful(ly|ness)?$'), lambda m: f"{m.group(1)}lful{m.group(2) or ''}"),
    (re.compile(r'^(mis)?judgement(s|al)?$'), lambda m: f"{m.group(1) or ''}judgment{m.group(2) or ''}"),
    (re.compile(r'^acknowledgement(s)?$'), lambda m: f"acknowledgment{m.group(1) or ''}"),
    (re.compile(r'^(cent|theat|fib|somb|meag|scept|spect|sab|lust|calib|lit|met)re(s|d)?$'), lambda m: f"{m.group(1)}er{m.group(2) or ''}"),
    (re.compile(r'^(off|def|pret)ence(s)?$'), lambda m: f"{m.group(1)}ense{m.group(2) or ''}"),
    (re.compile(r'^grey(s|ed|ish|ing|er|est|ness)?$'), lambda m: f"gray{m.group(1) or ''}"),
    (re.compile(r'^practis(e|ed|es|ing)$'), lambda m: f"practic{m.group(1)}"),
    (re.compile(r'^(whilst)$'), lambda m: 'while'),
    (re.compile(r'^learnt$'), lambda m: 'learned'),
    (re.compile(r'^catalogue(s|d)?$'), lambda m: {'': 'catalog', 's': 'catalogs', 'd': 'cataloged'}[m.group(1) or '']),
    (re.compile(r'^programme(s)?$'), lambda m: f"program{m.group(1) or ''}"),
    (re.compile(r'^scept(ic|ics|ical|ically|icism)$'), lambda m: f"skept{m.group(1)}"),
    (re.compile(r'^ageing$'), lambda m: 'aging'),
    (re.compile(r'^cos(y|ier|iest|ily)$'), lambda m: f"coz{m.group(1)}"),
    (re.compile(r'^manoeuvr(e|es|ed|ing)$'), lambda m: f"maneuver{ {'e': '', 'es': 's', 'ed': 'ed', 'ing': 'ing'}[m.group(1)] }"),
    (re.compile(r'^mould(s|ed|ing|y)?$'), lambda m: f"mold{m.group(1) or ''}"),
    (re.compile(r'^plough(s|ed|ing|man|men|share|shares)?$'), lambda m: f"plow{m.group(1) or ''}"),
]
# The KJV (and a few other old versions) quoted in their own spelling.
KJV_NEAR = re.compile(r"\(?\s*(KJV|AV|King James|Authori[sz]ed Version|Geneva|Tyndale|Douay|Wycliffe)\b")

def convert_word(w):
    lw = w.lower()
    for rx, fn in RULES:
        m = rx.match(lw)
        if m:
            out = fn(m)
            if w.isupper() and len(w) > 1: return out.upper()
            if w[0].isupper(): return out[0].upper() + out[1:]
            return out
    return None

VERSION = re.compile(r"\b(KJV|AV|King James|Authori[sz]ed Version|Geneva|Tyndale|Douay|Wycliffe)\b")
Q_BEFORE = re.compile(r"(['‘“\"])([^'‘’“”\"\n]{1,160})(['’”\"])[\s,;]*\(?\s*$")
Q_AFTER = re.compile(r"^[’']?s?\s*(has|reads|says|renders|translates|translated (?:it )?as|text)?\s*[:,]?\s*(['‘“\"])([^'‘’“”\"\n]{1,160})(['’”\"])")
# "spelt" is also a grain (Exod 9:32): only the verb, in phrases like "also spelt".
SPELT = re.compile(r"\b(also|often|usually|sometimes|commonly|variously|differently|is|was|are|were|be|been|name)\s+spelt\b|\bspelt\s+(?=(as|with|in|out)\b)")
def convert_text(s, counts):
    s = SPELT.sub(lambda m: (m.group(1) + ' spelled') if m.group(1) else 'spelled ', s)
    # A quotation right before or after a mention of the KJV (or another old
    # version) keeps that version's own spelling.
    protected = []
    for v in VERSION.finditer(s):
        b = Q_BEFORE.search(s[max(0, v.start() - 200):v.start()])
        if b: protected.append((v.start() - (len(s[max(0, v.start() - 200):v.start()]) - b.start()), v.start()))
        a = Q_AFTER.match(s[v.end():v.end() + 200])
        if a: protected.append((v.end(), v.end() + a.end()))
    def sub(m):
        if any(a <= m.start() < b for a, b in protected): return m.group(0)
        new = convert_word(m.group(0))
        if new and new != m.group(0):
            counts[(m.group(0), new)] = counts.get((m.group(0), new), 0) + 1
            return new
        return m.group(0)
    return re.sub(r"(?<![\w$.#-])[A-Za-z]+(?:-[A-Za-z]+)?(?![\w$(])", sub, s)

# Lines left exactly as they are.
KEEP_LINE = [
    re.compile(r'"favor" vs\. "favour'),           # a lesson about spelling differences
    re.compile(r"'armour'|has\('armour'\)|\bploughs?:"),  # search terms that accept British spellings
    re.compile(r"KJV's"),                           # the KJV's own spelling
    re.compile(r"not colour|our Saviour"),          # the release note about this change
    re.compile(r"^\s*amongst:\s*\["),              # the English dictionary's entry for the word
    re.compile(r"\bgrey:\s*'#"),                    # a color-name lookup key
]

def convert_file(path, counts):
    src = open(path, encoding='utf8').read()
    out = []
    for line in src.split('\n'):
        out.append(line if any(k.search(line) for k in KEEP_LINE) else convert_text(line, counts))
    new = '\n'.join(out)
    if new != src and not DRY: open(path, 'w', encoding='utf8').write(new)
    return new != src

# App text: the pages and scripts people read.
APP_FILES = ['index.html', 'app.js', 'rhema-word-study.js', 'rhema-crossrefs-ui.js', 'sermon-notes.js',
             'verse-structure.js', 'vs-structure.js', 'bible-genealogy.js', 'bible-intros.js', 'bible-threads.js',
             'bible-quiz.js', 'bible-map.js', 'bible-regions.js', 'bible-atlas.js', 'vocab.js', 'greek-verbs.js',
             'rhema-syntax.js']
# Word-study data: only Rhēma's own prose, never quoted lexicons.
OWN_KEYS = {'study', 'prose', 'why'}

def convert_json_value(v, counts):
    if isinstance(v, str): return convert_text(v, counts)
    if isinstance(v, list): return [convert_json_value(x, counts) for x in v]
    if isinstance(v, dict): return {k: convert_json_value(x, counts) for k, x in v.items()}
    return v

def convert_shards(pattern, counts):
    changed = 0
    for f in sorted(glob.glob(os.path.join(R, pattern))):
        data = json.load(open(f, encoding='utf8'))
        before = json.dumps(data, ensure_ascii=False)
        for e in data.values():
            if not isinstance(e, dict): continue
            for k in OWN_KEYS & set(e):
                e[k] = convert_json_value(e[k], counts)
        after = json.dumps(data, ensure_ascii=False)
        if after != before:
            changed += 1
            if not DRY:
                raw = open(f, encoding='utf8').read()
                compact = not raw.lstrip().startswith('{\n')
                with open(f, 'w', encoding='utf8') as fh:
                    json.dump(data, fh, ensure_ascii=False, separators=(',', ':') if compact else None)
    return changed

def convert_hebrew_lexicon(counts):
    # Short glosses only; Strong's definitions and the KJV's renderings stay as quoted.
    p = os.path.join(R, 'rhema-hebrew-lexicon.js')
    src = open(p, encoding='utf8').read()
    a = src.index('window.RhemaHebrewLexicon = ') + len('window.RhemaHebrewLexicon = ')
    lex, end = json.JSONDecoder().raw_decode(src[a:])
    before = json.dumps(lex, ensure_ascii=False)
    for e in lex.values():
        if isinstance(e, dict):
            for k in ('gloss', 'brief', 'quick_def'):
                if isinstance(e.get(k), str): e[k] = convert_text(e[k], counts)
    if json.dumps(lex, ensure_ascii=False) != before:
        if not DRY: open(p, 'w', encoding='utf8').write(src[:a] + json.dumps(lex, ensure_ascii=False, separators=(',', ':')) + src[a + end:])
        return 1
    return 0

def convert_lxx_words(counts):
    changed = 0
    for f in sorted(glob.glob(os.path.join(R, 'data/lxx-words/*.json'))):
        d = json.load(open(f, encoding='utf8'))
        before = json.dumps(d, ensure_ascii=False)
        d = convert_json_value(d, counts)
        if json.dumps(d, ensure_ascii=False) != before:
            changed += 1
            if not DRY: open(f, 'w', encoding='utf8').write(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
    return changed

counts = {}
files = [f for f in APP_FILES if os.path.exists(os.path.join(R, f)) and convert_file(os.path.join(R, f), counts)]
shards = convert_shards('data/deep-lexicon/shard-*.json', counts) + convert_shards('data/deep-hebrew-lexicon/shard-*.json', counts) + convert_hebrew_lexicon(counts) + convert_lxx_words(counts)
print(('Would change' if DRY else 'Changed'), sum(counts.values()), 'words in', len(files), 'files and', shards, 'data shards')
for (a, b), n in sorted(counts.items(), key=lambda x: -x[1])[:80]: print(f'  {n:4d}  {a} → {b}')
