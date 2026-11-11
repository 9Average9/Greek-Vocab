# "Who does what" data for the Hebrew Old Testament, from MACULA Hebrew
# (Clear Bible, Inc. & the Groves Center, CC BY 4.0,
#  github.com/Clear-Bible/macula-hebrew — WLC/tsv/macula-hebrew.tsv).
#
# MACULA numbers words exactly like rhema-ot-hebrew.js (Westminster Leningrad
# Codex + OSHB morphology, Hebrew chapter:verse), so its word N of a verse is
# our word N-1. For each of our words it keeps:
#   f: semantic roles of a verb — [[role, chapter, verse, wordIndex, english]...]
#      A0 = who does it, A1 = what/whom it's done to, A2 = to/for whom,
#      AA = who causes it (causative verbs: "the earth brought forth plants")
#   s: who the verb's built-in subject is — [chapter, verse, wordIndex, english]
#   p: who a pronoun or pronoun ending ("his", "it") refers to — same shape
#   g: the Greek word (Strong's) the Septuagint uses at this spot
# Output: data/hebrew-roles/<BOOK>.json  { "<ch>": { "<v>": [ entry|0, ... ] } }
#
#   python3 scripts/build-hebrew-roles.py macula-hebrew.tsv
import csv, json, os, re, sys
from collections import defaultdict

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
csv.field_size_limit(10_000_000)
rows = list(csv.DictReader(open(sys.argv[1], encoding='utf-8'), delimiter='\t'))
num_to_book = {}
byid = {}
for r in rows:
    rid = r['xml:id'][1:]
    num_to_book.setdefault(rid[:2], r['ref'].split(' ')[0])
    byid[rid] = r

def where(rid):
    # 010010010031 → book 01, chapter 001, verse 001, word 003, part 1
    r = byid.get(rid)
    if not r: return None
    book, rest = r['ref'].split(' ')
    cv, w = rest.split('!')
    c, v = cv.split(':')
    eng = re.sub(r'\s+', ' ', (r['english'] or r['gloss'] or '').replace('.', ' ')).strip()
    return book, int(c), int(v), int(w) - 1, eng

out = defaultdict(lambda: defaultdict(dict))
for r in rows:
    book, rest = r['ref'].split(' ')
    cv, w = rest.split('!')
    c, v = cv.split(':')
    idx = int(w) - 1
    slot = out[book][c].setdefault(v, {})
    e = slot.setdefault(idx, {})
    if r['frame']:
        args, cur = [], None
        for part in r['frame'].split(';'):
            part = part.strip()
            if not part: continue
            if ':' in part:
                cur, rid = part.split(':', 1)
            else:
                rid = part
            loc = where(rid.strip())
            if loc and loc[0] == book:
                args.append([cur, loc[1], loc[2], loc[3], loc[4]])
        if args: e['f'] = args
    if r['subjref']:
        ids = re.findall(r'\d{12}', r['subjref'])
        loc = where(ids[0]) if ids else None
        if loc and loc[0] == book: e['s'] = [loc[1], loc[2], loc[3], loc[4]]
    if r['participantref']:
        ids = re.findall(r'\d{12}', r['participantref'])
        loc = where(ids[0]) if ids else None
        if loc and loc[0] == book: e.setdefault('p', [loc[1], loc[2], loc[3], loc[4]])
    if r['greekstrong'] and r['class'] in ('noun', 'verb', 'adj', 'adv', 'pron', 'cj', 'prep', 'ptcl', 'om', 'intj', 'num'):
        try:
            g = int(re.sub(r'\D', '', r['greekstrong']) or 0)
            if g and ('g' not in e or r['class'] in ('noun', 'verb', 'adj')): e['g'] = g
        except ValueError: pass

os.makedirs(R + 'data/hebrew-roles', exist_ok=True)
for book, chapters in out.items():
    data = {}
    for c, verses in chapters.items():
        data[c] = {}
        for v, words in verses.items():
            n = max(words) + 1 if words else 0
            data[c][v] = [words.get(i) or 0 for i in range(n)]
    with open(R + f'data/hebrew-roles/{book}.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print('books', len(out), file=sys.stderr)
