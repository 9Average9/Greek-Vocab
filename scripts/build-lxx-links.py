# Septuagint word links for "See the Hebrew" → Septuagint mode.
#
# For every Old Testament verse (English numbering), which Septuagint word
# stands for each part of each Hebrew word, from MACULA Hebrew's word-by-word
# alignment of the Hebrew with the Greek (its "greek" / "greekstrong" columns).
# MACULA gives the Greek *form*; this finds that form in the Rahlfs text the
# app shows (rhema-lxx.js), in the Septuagint verse the app pairs with the
# English verse. A Greek word that can't be found there is left unlinked —
# never guessed.
#
#   python3 scripts/build-lxx-links.py path/to/macula-hebrew.tsv path/to/vmap.json
#
# vmap.json: {BOOK: [[engCV, hebCV, lxxCV], …]} exported from the app's own
# versification (rhemaBuildVersification), so numbering matches the reader.
#
# Output data/lxx-links/<BOOK>.json: {"v": {"c:v": "LINKS"}} where LINKS is
# space-separated "<hebrew word index><role><lxx word index>", role p (prefix:
# and, the, in…), m (main word), s (suffix: his, my, them…) or x (main word,
# found by gap filling: the closest match, not MACULA's own link).
#
# MACULA Hebrew: Clear Bible & Groves Center, CC BY 4.0.
# Rahlfs LXX text: CenterBLC/LXX (MIT).
import csv, collections, json, os, re, subprocess, sys, unicodedata
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
csv.field_size_limit(10 ** 9)

def load_js(path, var):
    out = subprocess.check_output(['node', '-e', f'''
const vm=require('vm'),fs=require('fs');const c={{window:{{}}}};vm.createContext(c);
vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);process.stdout.write(JSON.stringify(c.window.{var}.text));''', path])
    return json.loads(out)

HEB = load_js(R + 'rhema-ot-hebrew.js', 'RhemaHebrewOT')
LXX = load_js(R + 'rhema-lxx.js', 'RhemaLXX')
VMAP = json.load(open(sys.argv[2]))

def gnorm(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(ch for ch in s if not unicodedata.combining(ch)).lower().replace('ς', 'σ')
    return re.sub(r'[^α-ω]', '', s)

def hcons(s):
    return re.sub(r'[^א-ת]', '', unicodedata.normalize('NFD', s or ''))

# MACULA rows grouped: (book, chapter, verse) -> word number -> [(text, greek, greekstrong)]
mac = collections.defaultdict(lambda: collections.defaultdict(list))
with open(sys.argv[1], encoding='utf-8') as f:
    for row in csv.DictReader(f, delimiter='\t'):
        m = re.match(r'^(\w+) (\d+):(\d+)!(\d+)$', row['ref'] or '')
        if not m: continue
        b, c, v, n = m.group(1), m.group(2), m.group(3), int(m.group(4))
        mac[(b, c, v)][n].append((row['text'], (row['greek'] or '').strip(), (row['greekstrong'] or '').strip()))

PREFIX = re.compile(r'^(C|R|Td|Ti|Tr)')
def roles(morph, count):
    segs = re.sub(r'^[HA]', '', morph or '').split('/')
    if len(segs) != count: return ['m'] * count
    out, main_seen = [], False
    for s in segs:
        if s.startswith('S'): out.append('s')
        elif not main_seen and PREFIX.match(s): out.append('p')
        else: out.append('m'); main_seen = True
    return out

stats = collections.Counter()
os.makedirs(R + 'data/lxx-links', exist_ok=True)
for book, rows in VMAP.items():
    out = {}
    for eng, hcv, xcv in rows:
        hc, hv = hcv.split(':'); xc, xv = xcv.split(':')
        hw = HEB.get(book, {}).get(hc, {}).get(hv) or []
        xw = LXX.get(book, {}).get(xc, {}).get(xv) or []
        mw = mac.get((book, hc, hv))
        if not hw or not xw or not mw: stats['verse-missing'] += 1; continue
        xn = [gnorm(w[0]) for w in xw]
        xs = [str(w[1] or '') for w in xw]
        used = set()
        links = []
        cursor = 0
        last_tok = None
        for i, w in enumerate(hw):
            parts = mw.get(i + 1)
            if not parts: stats['word-missing'] += 1; continue
            if hcons(''.join(p[0] for p in parts)) != hcons(w[0]):
                stats['word-mismatch'] += 1; continue
            rl = roles(w[2], len(parts))
            for (txt, greek, gstrong), role in zip(parts, rl):
                if not greek: continue
                for gi, piece in enumerate(greek.split()):
                    g = gnorm(piece)
                    if not g: continue
                    stats['greek-pieces'] += 1
                    cands = [k for k in range(len(xw)) if xn[k] == g and k not in used]
                    how = 'form'
                    if not cands and gstrong and gi == 0:
                        cands = [k for k in range(len(xw)) if xs[k] == gstrong and k not in used]
                        how = 'strong'
                    if not cands and last_tok is not None and xn[last_tok] == g:
                        cands = [last_tok]; how = 'repeat'   # two Hebrew words, one Greek word (Immanuel)
                    if not cands: stats['unfound'] += 1; continue
                    k = min(cands, key=lambda k: (k < cursor, abs(k - cursor)))
                    used.add(k); last_tok = k; cursor = k + 1
                    links.append(f'{i}{role}{k}')
                    stats['found-' + how] += 1
        # Gap filling (marked x, shown as ≈ closest match): a Hebrew word whose
        # own Greek MACULA doesn't give, with linked Hebrew words right before
        # and after it, takes the 1-3 unlinked Greek words that sit exactly
        # between its neighbors' Greek (σκιᾶς θανάτου for צַלְמָוֶת, Ps 23:4).
        byword = collections.defaultdict(list)
        for l in links:
            m = re.match(r'^(\d+)([pms])(\d+)$', l)
            byword[int(m.group(1))].append((m.group(2), int(m.group(3))))
        FUNC = re.compile(r'^(T|CONJ|PART|PREP|PRON|INJ)\b')
        CONTENT_HEB = re.compile(r'^[NVAD]')   # noun, verb, adjective, adverb
        def main_code(morph):
            segs = re.sub(r'^[HA]', '', morph or '').split('/')
            for sg in segs:
                if sg.startswith('S') or PREFIX.match(sg): continue
                return sg
            return ''
        def anchor(j):  # a neighbor counts only if its own word (not just "and"/"his") is linked
            ws = byword.get(j, [])
            return [k for r, k in ws] if any(r == 'm' for r, _ in ws) else []
        for i, w in enumerate(hw):
            own = byword.get(i, [])
            if any(r == 'm' for r, _ in own): continue
            parts = mw.get(i + 1)
            if not parts or not CONTENT_HEB.match(main_code(w[2])): continue   # never אֶת, לֹא, כִּי…
            left = anchor(i - 1) + [k for r, k in own if r == 'p']
            right = anchor(i + 1) + [k for r, k in own if r == 's']
            if not left or not right: continue
            lo, hi = max(left), min(right)
            gap = [k for k in range(lo + 1, hi)]
            # Small words at the end ("the", "and") belong to the next word.
            while gap and FUNC.match(str(xw[gap[-1]][2] or '')): gap.pop()
            content = [k for k in gap if not FUNC.match(str(xw[k][2] or ''))]
            if not gap or len(gap) > 3 or not (1 <= len(content) <= 2) or any(k in used for k in gap): continue
            for k in gap:
                used.add(k); links.append(f'{i}x{k}')
            stats['gap-filled-words'] += 1
            stats['gap-filled-greek'] += len(gap)
        if links:
            out[eng] = ' '.join(links)
            stats['verses'] += 1
            stats['lxx-words'] += len(xw)
            stats['lxx-linked'] += len({int(re.split('[pmsx]', l)[1]) for l in links})
    json.dump({'v': out}, open(R + f'data/lxx-links/{book}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

found = sum(v for k, v in stats.items() if k.startswith('found-'))
print(dict(stats), file=sys.stderr)
print(f"Greek words from MACULA found in the Septuagint verse: {found}/{stats['greek-pieces']} ({found / max(1, stats['greek-pieces']):.1%})", file=sys.stderr)
print(f"Septuagint words linked to a Hebrew word: {stats['lxx-linked']}/{stats['lxx-words']} ({stats['lxx-linked'] / max(1, stats['lxx-words']):.1%})", file=sys.stderr)
