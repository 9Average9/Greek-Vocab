# Hebrew word-study prose (data/deep-hebrew-lexicon) fixes from the accuracy audit:
#  1. stem counts in articles ("Piel (17×)") recounted from data/hebrew-word-stats
#     (the build had skipped verbs with a prefix);
#  2. verb stems described as "intensive" (an outdated label for the Piel and
#     friends) reworded, only in sentences about a stem;
#  3. articles cut off mid-sentence (an inner quote ended the generated text)
#     trimmed to their last complete sentence; "caution" fields that are really
#     a stray fragment of the article, or code junk, cleared.
import json, os, re
D = 'data/deep-hebrew-lexicon/'
st = {}
for f in os.listdir('data/hebrew-word-stats'):
    if f.startswith('s-'): st.update(json.load(open('data/hebrew-word-stats/' + f, encoding='utf-8')))
NAME2KEY = {'Qal': 'Qal', 'Niphal': 'Nifal', 'Piel': 'Piel', 'Pual': 'Pual', 'Hiphil': 'Hifil', 'Hophal': 'Hofal',
            'Hithpael': 'Hitpael', 'Hishtaphel': 'Hishtafel', 'Polel': 'Polel', 'Pilpel': 'Pilpel', 'Poel': 'Poel', 'Hithpolel': 'Hitpolel'}
STEMS = '|'.join(NAME2KEY)
C1 = re.compile(r'\b(' + STEMS + r')\b([^.()]{0,25})\((\d+)×\)')
C2 = re.compile(r'(\d+)(\s*(?:times|×)\s*(?:in|as)\s+(?:the\s+)?)(' + STEMS + r')\b')
C3 = re.compile(r'\b(' + STEMS + r')(\s*\()(\d+)(\s*(?:times|occurrences)\))')
stats = {'counts': 0, 'intensive': 0, 'trimmed': 0, 'cautions': 0}
def count(k, name):
    s = (st.get(k) or {}).get('st') or {}
    return s.get(NAME2KEY.get(name, name))
def fix_counts(k, t):
    def r1(m):
        n = count(k, m.group(1))
        if n and int(m.group(3)) != n: stats['counts'] += 1; return f'{m.group(1)}{m.group(2)}({n}×)'
        return m.group(0)
    def r2(m):
        n = count(k, m.group(3))
        if n and int(m.group(1)) != n: stats['counts'] += 1; return f'{n}{m.group(2)}{m.group(3)}'
        return m.group(0)
    def r3(m):
        n = count(k, m.group(1))
        if n and int(m.group(3)) != n: stats['counts'] += 1; return f'{m.group(1)}{m.group(2)}{n}{m.group(4)}'
        return m.group(0)
    return C3.sub(r3, C2.sub(r2, C1.sub(r1, t)))
INT = [
    (r', the intensive-active form,', ','),
    (r'\b(causative|reflexive|passive|active)[- ]or[- ]intensive\b', r'\1'),
    (r'\bintensive[- ]or[- ](causative|reflexive|active|sustained|deliberate|repeated|thoroughgoing|iterative)\b', r'\1'),
    (r'\b(causative|reflexive|passive|active)[- ]intensive\b', r'\1'),
    (r'\bintensive[- ](causative|reflexive|passive|active)\b', r'\1'),
    (r'\b(iterative|reflexive) or intensive\b', r'\1'),
    (r'\bintensive, (deliberate|active)\b', r'\1'),
    (r'\bthe intensive (Piel|Pual|Polel) stem', r'the \1 stem'),
    (r'\ban intensive force\b', 'a stronger force'),
    (r'\bthe intensive sense of\b', 'the sense of'),
    (r'\ban intensive form that heightens\b', 'a form that heightens'),
    (r'\bintensive flavor\b', 'flavor'),
]
def fix_intensive(t):
    out = []
    for s in re.split(r'(?<=[.!?])\s+', t):
        if re.search(r'\b(' + STEMS + r')\b|\bstem', s) and 'intensiv' in s:
            s2 = s
            for a, b in INT: s2 = re.sub(a, b, s2)
            s2 = re.sub(r'\ban (deliberate|sustained|repeated|thoroughgoing|causative|reflexive|passive)\b', r'a \1', s2)
            if s2 != s: stats['intensive'] += 1
            s = s2
        out.append(s)
    return ' '.join(out)
def trim(t):
    t2 = t.rstrip()
    if not t2 or re.search(r'[.!?)"”\']$', t2): return t
    i = max(t2.rfind('. '), t2.rfind('! '), t2.rfind('? '))
    if i < 40: return t
    stats['trimmed'] += 1
    return t2[:i + 1]
def walk(k, o):
    if isinstance(o, str): return fix_intensive(fix_counts(k, o))
    if isinstance(o, list): return [walk(k, x) for x in o]
    if isinstance(o, dict): return {a: walk(k, b) for a, b in o.items()}
    return o
for sh in json.load(open(D + 'index.json'))['shards']:
    p = D + sh['file']; data = json.load(open(p, encoding='utf-8')); dirty = False
    for k, e in data.items():
        pr = e.get('prose') if isinstance(e, dict) else None
        if not isinstance(pr, dict): continue
        new = walk(k, pr)
        for f in ('def', 'article'):
            if isinstance(new.get(f), str): new[f] = trim(new[f])
        c = new.get('caution')
        if isinstance(c, str) and (re.match(r'^\s*[a-z,;:)]', c) or 'null}' in c or c.strip().startswith('"') or c.strip().endswith('}')):
            new['caution'] = None; stats['cautions'] += 1
        if new != pr: e['prose'] = new; dirty = True
    if dirty: json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(stats)
