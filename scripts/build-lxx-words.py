# Septuagint words that have no Strong's number (names and words that never
# appear in the New Testament: about 1 in 15 LXX words). Strong's numbers only
# cover New Testament vocabulary, so the app had nothing to show for them.
#
# For each such word, per book (data/lxx-words/<BOOK>.json):
#   - its dictionary form and a short English gloss (CenterBLC LXX, from the
#     Rahlfs 1935 text the app already uses), and how often it occurs;
#   - the Hebrew word it translates at that spot, from MACULA Hebrew's
#     word-by-word alignment of the Hebrew text with the Septuagint.
#
#   python3 scripts/build-lxx-words.py path/to/CenterBLC-LXX/tf/1935 path/to/macula-hebrew.tsv
#
# CenterBLC LXX: MIT. MACULA Hebrew: Clear Bible & Groves Center, CC BY 4.0.
import collections, csv, json, os, re, sys, unicodedata

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
TF, MACULA = sys.argv[1], sys.argv[2]
csv.field_size_limit(10 ** 9)

# Same book mapping as scripts/build-lxx.js (Ezra-Nehemiah is "2 Esdras").
BOOKS = [('GEN','Gen'),('EXO','Exod'),('LEV','Lev'),('NUM','Num'),('DEU','Deut'),('JOS','Josh'),('JDG','Judg'),('RUT','Ruth'),
  ('1SA','1Sam'),('2SA','2Sam'),('1KI','1Kgs'),('2KI','2Kgs'),('1CH','1Chr'),('2CH','2Chr'),('EZR','2Esdr',0,10),('NEH','2Esdr',10,13),
  ('EST','Esth'),('JOB','Job'),('PSA','Ps'),('PRO','Prov'),('ECC','Qoh'),('SNG','Cant'),('ISA','Isa'),('JER','Jer'),('LAM','Lam'),
  ('EZK','Ezek'),('DAN','Dan'),('HOS','Hos'),('JOL','Joel'),('AMO','Amos'),('OBA','Obad'),('JON','Jonah'),('MIC','Mic'),('NAM','Nah'),
  ('HAB','Hab'),('ZEP','Zeph'),('HAG','Hag'),('ZEC','Zech'),('MAL','Mal')]

def read_tf(name):
    out, node = {}, 0
    with open(os.path.join(TF, name + '.tf'), encoding='utf8') as f:
        lines = f.read().split('\n')
    i = 0
    while i < len(lines) and lines[i].strip() != '':
        i += 1
    for line in lines[i + 1:]:
        if line == '':
            node += 1
            continue
        if '\t' in line:
            spec, val = line.split('\t', 1)
            if '-' in spec:
                a, b = spec.split('-')
                for n in range(int(a), int(b) + 1):
                    out[n] = val
                node = int(b)
                continue
            node = int(spec) if spec else node + 1
            out[node] = val
        else:
            node += 1
            out[node] = line
    return out

def key(s):
    s = ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^α-ως]', '', s).replace('ς', 'σ')

def clean_en(s):
    s = re.sub(r'\[[^\]]*\]', '', s or '')
    s = re.sub(r'[.\s]+', ' ', s).strip()
    return s

F = {n: read_tf(n) for n in ['word', 'book', 'chapter', 'verse', 'strongs', 'gloss', 'lex_utf8', 'sp']}
lxx_src = open(R + 'rhema-lxx.js', encoding='utf8').read()
lxx = json.loads(lxx_src[lxx_src.index('window.RhemaLXX = ') + 18: lxx_src.index(';\nwindow.RhemaLXXOcc')])['text']

# Hebrew lexicon (lemma per Strong's number).
heb_src = open(R + 'rhema-hebrew-lexicon.js', encoding='utf8').read()
_a = heb_src.index('window.RhemaHebrewLexicon = ') + len('window.RhemaHebrewLexicon = ')
heb_lex = json.JSONDecoder().raw_decode(heb_src[_a:])[0]

# MACULA: for each Hebrew verse, the Greek word aligned to each Hebrew word.
by_ref = collections.defaultdict(list)       # 'NUM 4:27' -> [(greek key, strongs, english)]
glob = collections.defaultdict(collections.Counter)   # greek key -> Counter(strongs)
heb_en = collections.defaultdict(collections.Counter)  # strongs -> Counter(english)
for row in csv.DictReader(open(MACULA, encoding='utf-8'), delimiter='\t'):
    sn = re.sub(r'^0+', '', re.sub(r'[^\d]', '', row.get('strongnumberx') or ''))
    g = key(row.get('greek'))
    if not sn:
        continue
    en = clean_en(row.get('gloss') or row.get('english'))
    if en:
        heb_en[sn][en] += 1
    if g:
        ref = row['ref'].split('!')[0]
        by_ref[ref].append((g, sn, en))
        glob[g][sn] += 1

# LXX lemma counts (whole canonical LXX) for "appears N times".
lemma_count = collections.Counter()
nodes_by_book = collections.defaultdict(list)
src_to_codes = collections.defaultdict(list)
for b in BOOKS:
    src_to_codes[b[1]].append(b)
for n, w in F['word'].items():
    bk = F['book'].get(n)
    for b in src_to_codes.get(bk, []):
        off, lim = (b[2], b[3]) if len(b) > 2 else (0, 10 ** 6)
        ch = int(F['chapter'][n]) - off
        if 1 <= ch <= lim:
            nodes_by_book[b[0]].append((n, str(ch), F['verse'][n]))
            lemma_count[F['lex_utf8'].get(n, '')] += 1

# Known source mistag: in Num 4:27 τὰ ἀρτά ("what is carried, loads"; Hebrew
# מַשָּׂא) is tagged as ἄρτος "bread" (G740). Treated as an LXX-only word.
OVERRIDE = {('NUM', '4', '27', 'ἀρτὰ'): ('ἀρτός', 'loads, what is carried; plural of ἀρτός “lifted, carried”', '4853', 2)}

os.makedirs(R + 'data/lxx-words', exist_ok=True)
stats = collections.Counter()
for code, *_ in BOOKS:
    pos = collections.Counter()
    out = {'lemmas': {}, 'heb': {}, 'w': {}}
    for n, ch, v in nodes_by_book[code]:
        ref = f'{ch}:{v}'
        i = pos[ref]
        pos[ref] += 1
        arr = lxx.get(code, {}).get(ch, {}).get(v)
        if not arr or i >= len(arr):
            stats['missing-verse'] += 1
            continue
        w = arr[i]
        if w[0] != F['word'][n]:
            stats['surface-mismatch'] += 1
            continue
        ov = OVERRIDE.get((code, ch, v, w[0]))
        if w[1] is not None and not ov:
            continue
        stats['words'] += 1
        lemma = F['lex_utf8'].get(n) or w[0]
        gloss = (F['gloss'].get(n) or '').strip()
        name = lemma[:1].isupper()
        if ov:
            lemma, gloss = ov[0], ov[1]
        if name and ';' in gloss:
            gloss = gloss.split(';')[0].strip()  # "Gedsōn; Yethson": keep the scholarly spelling
        if lemma not in out['lemmas']:
            out['lemmas'][lemma] = [gloss, F['sp'].get(n, ''), ov[3] if ov else (lemma_count.get(F['lex_utf8'].get(n, ''), 0) or 1)]
        # The Hebrew word behind it: aligned in this verse, else the usual one.
        g = key(w[0])
        heb, en = None, ''
        for hg, sn, hen in by_ref.get(f'{code} {ch}:{v}', []):
            if hg == g:
                heb, en = sn, hen
                break
        if ov:
            heb, en = ov[2], 'load'
        if heb:
            stats['heb-here'] += 1
        else:
            c = glob.get(g)
            if c:
                top, cnt = c.most_common(1)[0]
                if cnt >= 2 and cnt / sum(c.values()) >= 0.6:
                    heb = top
                    stats['heb-usual'] += 1
        rec = [lemma]
        if heb and heb in heb_lex:
            rec += [heb, en] + (['hand'] if ov else [])
            if heb not in out['heb']:
                e = heb_lex[heb]
                usual = heb_en[heb].most_common(1)
                out['heb'][heb] = [e.get('lemma', ''), e.get('translit') or e.get('pronounce') or '', usual[0][0] if usual else '']
        out['w'].setdefault(ref, {})[str(i)] = rec
    with open(R + f'data/lxx-words/{code}.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
print(dict(stats), file=sys.stderr)
