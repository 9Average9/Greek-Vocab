# Repair Hebrew dictionary forms damaged by an earlier build step, from the
# Open Scriptures Strong's Hebrew dictionary (the original source):
#   - alef-with-dagesh (U+FB30) written where alef + hiriq belongs (אּישׁ → אִישׁ)
#   - "NONE" or empty lemmas
#   - a non-final letter at the end of a word (כָּסֶפ → כֶּסֶף)
#   - H853/H854 shown as אוֹת "sign" instead of אֵת
# Other differences from the source (pausal forms, Aramaic spellings) are left.
#   python3 scripts/fix-hebrew-lemmas.py path/to/strongs-hebrew-dictionary.js
import json, re, sys, os
src = open(sys.argv[1], encoding='utf-8').read()
H = json.loads(src[src.index('{'): src.rindex('}') + 1])
def bad(k, lemma):
    l = lemma or ''
    core = re.sub(r'[֑-ׇ]', '', l)
    return (not l or l == 'NONE' or 'אּ' in l or k in ('853', '854') or re.search(r'[כמנפצ]$', core) is not None)
def good(k):
    return (H.get('H' + k) or {}).get('lemma')
# 1) the lexicon
P = 'rhema-hebrew-lexicon.js'
s = open(P, encoding='utf-8').read()
a = s.index('window.RhemaHebrewLexicon = ') + len('window.RhemaHebrewLexicon = ')
lex, end = json.JSONDecoder().raw_decode(s[a:])
n = 0
for k, e in lex.items():
    if bad(k, e.get('lemma')) and good(k):
        e['lemma'] = good(k); n += 1
open(P, 'w', encoding='utf-8').write(s[:a] + json.dumps(lex, ensure_ascii=False, separators=(',', ':')) + s[a + end:])
# 2) the word studies
D = 'data/deep-hebrew-lexicon/'
m = 0
for sh in json.load(open(D + 'index.json'))['shards']:
    p = D + sh['file']; data = json.load(open(p, encoding='utf-8')); dirty = False
    for k, e in data.items():
        if isinstance(e, dict) and bad(k, e.get('lemma')) and good(k):
            e['lemma'] = good(k); m += 1; dirty = True
    if dirty: json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('lexicon lemmas fixed', n, '| study lemmas fixed', m)
