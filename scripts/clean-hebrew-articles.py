# Remove the Septuagint sentences from the Hebrew word-study articles.
#
# They were written from an earlier computer word-matching whose counts don't
# hold up against MACULA Hebrew's alignment, and many go on to interpret
# ("…confirming that ancient readers heard…", "the same word Jesus uses").
# The word study's own "In the Greek Old Testament" section now shows the
# aligned data itself (scripts/build-hebrew-lxx-links.py), so readers see the
# evidence and draw their own conclusions.
#
#   python3 scripts/clean-hebrew-articles.py
import json, os, re, sys
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
LXX = re.compile(r'\b(LXX|Septuagint)\b|\b(?:ancient )?Greek translators?\b|\btranslators? (?:of|into) (?:the )?Greek\b', re.I)
idx = json.load(open(R + 'data/deep-hebrew-lexicon/index.json'))
removed = touched = 0
for sh in idx['shards']:
    p = R + 'data/deep-hebrew-lexicon/' + sh['file']
    data = json.load(open(p, encoding='utf-8'))
    for k, e in data.items():
        pr = e.get('prose') or {}
        art = pr.get('article') or ''
        if not art: continue
        paras = art.split('\n')
        out = []
        for para in paras:
            sents = re.split(r'(?<=[.!?])\s+(?=[A-Z֐-׿\'"‘“(])', para)
            keep = [s for s in sents if not LXX.search(s)]
            removed += len(sents) - len(keep)
            if keep: out.append(' '.join(keep))
        new = '\n'.join(out)
        if new != art:
            pr['article'] = new; touched += 1
    json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('removed', removed, 'sentences from', touched, 'articles', file=sys.stderr)
