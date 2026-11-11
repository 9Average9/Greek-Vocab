# Septuagint Greek equivalents for every Hebrew word, from MACULA Hebrew's
# word-by-word alignment of the Hebrew text with the Septuagint (the "greek" /
# "greekstrong" columns): for each Hebrew Strong's number, how often each Greek
# word stands in its place. Replaces the earlier computer-matched lxxGreek in
# data/deep-hebrew-lexicon (which kept only 4 Hebrew words per Greek word, so
# common Greek words like ποιέω fell out).
#
#   python3 scripts/build-hebrew-lxx-links.py path/to/macula-hebrew.tsv
#
# MACULA Hebrew: Clear Bible & Groves Center, CC BY 4.0.
import csv, collections, json, os, re, subprocess, sys
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
csv.field_size_limit(10 ** 9)
greek_lex = json.loads(subprocess.check_output(['node', '-e', '''
const vm=require('vm'),fs=require('fs');const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
const L=c.window.RhemaLexicon||{};const o={};for(const k in L)o[k]=L[k].lemma||'';process.stdout.write(JSON.stringify(o));''', R + 'rhema-lexicon.js']))
counts = collections.defaultdict(collections.Counter)
aligned = collections.Counter()
with open(sys.argv[1], encoding='utf-8') as f:
    for row in csv.DictReader(f, delimiter='\t'):
        sn = re.sub(r'\D', '', row.get('strongnumberx') or '')
        g = (row.get('greekstrong') or '').strip()
        if not sn or not re.fullmatch(r'\d+', g): continue
        counts[int(sn)][int(g)] += 1
        aligned[int(sn)] += 1
idx = json.load(open(R + 'data/deep-hebrew-lexicon/index.json'))
changed = 0
for sh in idx['shards']:
    p = R + 'data/deep-hebrew-lexicon/' + sh['file']
    data = json.load(open(p, encoding='utf-8'))
    for k, e in data.items():
        c = counts.get(int(k))
        if not c: continue  # MACULA numbers this word differently: keep what we had
        new = [{'g': g, 'lemma': greek_lex.get(str(g), ''), 'count': n} for g, n in c.most_common(8)]
        if new != e.get('lxxGreek'):
            e['lxxGreek'] = new
            e['lxxAligned'] = aligned.get(int(k), 0)
            changed += 1
    json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('updated', changed, 'entries', file=sys.stderr)
