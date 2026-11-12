# Every English word the BSB uses for each Hebrew word across the Old Testament
# (from data/hebrew-word-stats), as a compact list the version matcher uses to
# recognise other versions' wording: יָשַׁב is "dwell" in the KJV list but
# "live", "settle", "sit" in the BSB, the same words the NIV and CSB use.
#
#   python3 scripts/build-hebrew-renderings.py
import json, glob, os, re
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
GRAMMAR = set('a an the and or but nor for of to in on at by with from into upon onto unto out off over under up down i me my mine myself you your yours yourself yourselves he him his himself she her hers herself it its itself we us our ours ourselves they them their theirs themselves this that these those who whom whose which what is are was were be been being am has have had having do does did done will would shall should may might can could must when while as if then than so not no there here also even just let thee thou thy thine ye'.split())
stats = {}
for p in glob.glob(R + 'data/hebrew-word-stats/s-*.json'):
    stats.update(json.load(open(p, encoding='utf-8')))
out = {}
for k, e in stats.items():
    words = {}
    for r, n in ((x[0], x[1]) for x in e.get('r', [])):
        for w in re.findall(r"[A-Za-z][A-Za-z'’-]*", re.sub(r'\[[^\]]*\]', ' ', r)):
            lw = w.lower().strip("'’-")
            if len(lw) < 3 or lw in GRAMMAR: continue
            words[lw] = words.get(lw, 0) + n
    tot = sum(words.values()) or 1
    # Words the BSB uses for it at least twice (or anything, for rare words).
    keep = [w for w, n in sorted(words.items(), key=lambda x: -x[1]) if n >= 2 or e.get('n', 0) < 6][:24]
    if keep: out[k] = ' '.join(keep)
json.dump(out, open(R + 'data/hebrew-renderings.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('words', len(out), 'bytes', os.path.getsize(R + 'data/hebrew-renderings.json'))
