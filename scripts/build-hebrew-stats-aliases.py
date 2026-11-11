# Some Hebrew words carry a different Strong's number in the app's Hebrew text
# than in the Berean tables (יָלַךְ "go" is 3212 in the app, 1980 "halak" in the
# Berean; 7125 vs 7122 …), so their Word Study found no statistics. This lines
# the two texts up word by word (as build-hebrew-interlinear.py does), finds the
# Berean number each such app number stands for, and stores the Berean entry
# under the app's number too, marked {"alias": <Berean number>}.
#
#   python3 scripts/build-hebrew-stats-aliases.py hebrew_rows.jsonl
import json, os, re, subprocess, sys, difflib, glob
from collections import defaultdict, Counter
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
src = open(R + 'scripts/build-hebrew-interlinear.py', encoding='utf-8').read()
BOOKS = eval(re.search(r'^BOOKS = (\{.*?\})$', src, re.S | re.M).group(1)) if re.search(r'^BOOKS = ', src, re.M) else None
exec(re.search(r'(def cons\(s\):.*?)\n\n', src, re.S).group(1))
if BOOKS is None:
    exec(re.search(r'(BOOKS = .*?)\n(?=\S)', src, re.S).group(1))
by_book = defaultdict(list)
with open(sys.argv[1], encoding='utf-8') as f:
    for line in f:
        heb_sort, verse, surface, translit, parse_s, parse_l, strongs, eng = json.loads(line)
        m = re.match(r'^(.*) (\d+):(\d+)$', verse or '')
        if not m or m.group(1) not in BOOKS: continue
        by_book[BOOKS[m.group(1)]].append((int(heb_sort or 0), cons(surface), re.sub(r'\D', '', str(strongs or ''))))
heb = json.loads(subprocess.check_output(['node', '--max-old-space-size=4000', '-e', '''
const vm=require('vm'),fs=require('fs');const c={window:{}};vm.createContext(c);
vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);process.stdout.write(JSON.stringify(c.window.RhemaHebrewOT.text));
''', R + 'rhema-ot-hebrew.js']))
stats = {}
for p in glob.glob(R + 'data/hebrew-word-stats/s-*.json'):
    stats.update(json.load(open(p, encoding='utf-8')))
pairs = defaultdict(Counter)
for book, chapters in heb.items():
    toks = [(cons(w[0]), str(w[1])) for c in sorted(chapters, key=int) for v in sorted(chapters[c], key=int) for w in chapters[c][v]]
    rows = sorted(by_book.get(book, []), key=lambda r: r[0])
    sm = difflib.SequenceMatcher(None, [t[0] for t in toks], [r[1] for r in rows], autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal' or (tag == 'replace' and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                a, b = toks[i1 + k][1], rows[j1 + k][2]
                if a and b and a not in stats and b in stats: pairs[a][b] += 1
alias = {}
for a, c in pairs.items():
    b, n = c.most_common(1)[0]
    if n >= 2 and n >= 0.6 * sum(c.values()): alias[a] = b
print('aliases', len(alias), sorted(alias.items(), key=lambda x: -pairs[x[0]][x[1]])[:20], file=sys.stderr)
for a, b in alias.items():
    shard = R + 'data/hebrew-word-stats/s-%04d.json' % ((int(a) - 1) // 100 * 100 + 1)
    d = json.load(open(shard, encoding='utf-8')) if os.path.exists(shard) else {}
    e = dict(stats[b]); e['alias'] = int(b)
    d[a] = e
    json.dump(d, open(shard, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
