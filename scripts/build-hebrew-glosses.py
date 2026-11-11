# Short English glosses for every Hebrew word (shown under each word in the
# reader, in the word sheet and the word library).
#
# The lexicon's old "brief"/"quick_def" was the FIRST item of Strong's KJV
# usage list, which is alphabetical, so water read "+ piss", God "angels",
# create "choose". This builds a real short meaning instead, in this order:
#   1. a small hand-checked table for the most common words and God's names
#   2. proper names straight from the KJV rendering (Jacob, Beth-Nimrah)
#   3. the verb or "meaning ..." phrase opening the Hebrew word study
#      definition ("To create ..." -> create)
#   4. the first sense label of the word study ("Water / bodies of water")
#   5. the first non-etymology part of Strong's definition
# Then it writes gloss, brief and quick_def into rhema-hebrew-lexicon.js. The
# full Strong's definition and KJV usage list are left as they are.
#
#   python3 scripts/build-hebrew-glosses.py
import json, os, re, subprocess, sys
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
idx = json.load(open(R + 'data/deep-hebrew-lexicon/index.json'))
deep = {}
for s in idx['shards']:
    deep.update(json.load(open(R + 'data/deep-hebrew-lexicon/' + s['file'])))
lex = json.loads(subprocess.check_output(['node', '-e', '''
const vm=require('vm'),fs=require('fs');const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
process.stdout.write(JSON.stringify(c.window.RhemaHebrewLexicon));''', R + 'rhema-hebrew-lexicon.js']))

OVERRIDE = {
  430: 'God', 3068: 'LORD', 3069: 'LORD', 136: 'Lord', 410: 'God', 433: 'God', 426: 'God', 113: 'lord',
  853: '(object)', 834: 'who / which', 3588: 'for / that', 3605: 'all', 413: 'to', 4480: 'from', 5921: 'on / over',
  854: 'with', 5973: 'with', 3808: 'not', 408: 'not', 369: 'there is not', 1571: 'also', 3651: 'so', 518: 'if',
  637: 'also', 3605: 'all', 2088: 'this', 1931: 'he / that', 589: 'I', 595: 'I', 859: 'you', 587: 'we', 1992: 'they',
  1957: 'they', 3651: 'so', 6258: 'now', 8033: 'there', 6311: 'here', 3541: 'thus', 3644: 'like', 3627: 'vessel',
  5704: 'until', 3117: 'day', 3027: 'hand', 376: 'man', 802: 'woman', 1: 'father', 517: 'mother', 1121: 'son',
  1323: 'daughter', 251: 'brother', 559: 'say', 1696: 'speak', 1961: 'be', 6213: 'do / make', 5414: 'give',
  935: 'come', 3212: 'go', 1980: 'go', 7200: 'see', 8085: 'hear', 3045: 'know', 3947: 'take', 7725: 'return',
  3318: 'go out', 5927: 'go up', 3381: 'go down', 3427: 'sit / dwell', 6965: 'arise', 7760: 'put', 7121: 'call',
  4325: 'water', 776: 'earth / land', 8064: 'heavens / sky', 1254: 'create', 6440: 'face / before', 7307: 'spirit / wind',
  1697: 'word / matter', 3820: 'heart', 3824: 'heart', 5315: 'soul / life', 1004: 'house', 5892: 'city', 4428: 'king',
  5971: 'people', 1471: 'nation', 3478: 'Israel', 3063: 'Judah', 4714: 'Egypt', 1732: 'David', 4872: 'Moses',
  2896: 'good', 7451: 'evil', 1419: 'great', 6662: 'righteous', 6944: 'holiness', 2617: 'steadfast love',
  571: 'truth / faithfulness', 7965: 'peace', 1285: 'covenant', 8451: 'law / instruction', 2403: 'sin',
  5650: 'servant', 3519: 'glory', 8034: 'name', 1870: 'way', 7218: 'head', 5869: 'eye', 6310: 'mouth', 7272: 'foot',
  3220: 'sea', 2022: 'mountain', 776: 'earth / land', 216: 'light', 2822: 'darkness', 3915: 'night', 1242: 'morning',
  6153: 'evening', 8141: 'year', 4994: 'please', 3050: 'Yah (the LORD)', 3069: 'GOD (Lord)', 2009: 'behold', 3588: 'for / that', 2416: 'living / life', 4191: 'die', 4194: 'death', 1818: 'blood', 1320: 'flesh',
}
ETYM = re.compile(r'^(?:a primitive root|from |dual of|plural of|feminine of|masculine of|(?:probably |perhaps )?(?:a )?(?:prolonged|contracted|shortened|apparent|denominative|corresponding)|of (?:uncertain|foreign) (?:derivation|origin)|by (?:implication|extension)|compare |the same as |intensive from|causative from|properly\b)', re.I)

def clean(x):
    x = re.sub(r'\([^)]*\)', '', x)
    x = re.sub(r'\s+', ' ', x).strip(' ,;:.-–—')
    return x

def first_meaning_from_def(d):
    d = d.strip()
    m = re.match(r'^To ([a-z][a-z \-\']*?)(?:,| or | and |—| –| \(|\.|;| as | in | of | with | something| someone| oneself|$)', d)
    if m:
        verb = m.group(1).strip()
        verb = re.sub(r'\b(?:be|become|cause|make)\s*$', lambda mm: mm.group(0), verb)
        if 1 <= len(verb.split()) <= 3: return verb
    m = re.search(r'\b(?:preposition|conjunction|particle|adverb|interjection|pronoun)[^.]*?\bmeaning\s+[\'"‘“]?([a-z][a-z \-\']*?)[\'"’”]?(?:,|;| or |\.| —|$)', d)
    if m: return m.group(1).strip()
    return None

def from_label(lbl):
    x = lbl.split(' / ')[0]
    x = clean(x)
    x = re.sub(r'^(?:Literal|Physical|Biological|Individual|Generic|Specific|General|Proper|Actual|Ordinary|Common|Simple|Basic|The whole|The one true|The|A|An)\s+', '', x, flags=re.I)
    x = re.split(r' or |:', x)[0].strip()
    return x

def name_from_kjv(kjv):
    k = (kjv or '').strip()
    if re.fullmatch(r"[A-Z][a-z'\-]+(?:,\s*[A-Z][a-z'\-]+)*", k): return k.split(',')[0]
    return None

HEB = re.compile(r'[\u0590-\u05FF]')
NAMEY = re.compile(r'\bname\b|\bnamed? (?:place|person|man|woman|city|location)\b|^place name$|^(?:a )?(?:man|woman|person|place|city|town|region|location)$', re.I)

def name_from_strongs(sd):
    sd = re.sub(r'\s+,', ',', re.sub(r'\([^)]*\)', '', sd or ''))
    for m in re.finditer(r"([A-Z][a-z'\-]+(?:[ \-][A-Z][a-z'\-]+)*),\s+(?:a|an|the|two|three|several|one|probably|perhaps)\b", sd):
        return m.group(1)
    return None

def from_strongs(sd):
    parts = [clean(p) for p in re.split(r';(?![^()]*\))', sd or '')]
    for p in parts:
        if not p or ETYM.match(p) or HEB.search(p): continue
        p = re.split(r',? i\.e\.|, by |, figuratively|, especially|, also|,\s', p)[0]
        p = re.sub(r'^(?:\(.*?\)\s*)', '', p).strip()
        if p and len(p.split()) <= 4: return p
    return None

out = {}
src = {}
for k, e in lex.items():
    n = int(re.sub(r'\D', '', k) or 0)
    if not n: continue
    g = None
    if n in OVERRIDE: g, why = OVERRIDE[n], 'override'
    if not g:
        nm = name_from_kjv(e.get('kjv_def'))
        if nm: g, why = nm, 'name'
    d = deep.get(str(n)) or {}
    prose = d.get('prose') or {}
    if not g and prose.get('def'):
        g = first_meaning_from_def(prose['def']); why = 'def'
    if not g and prose.get('senseLabels'):
        g = from_label(prose['senseLabels'][0]); why = 'label'
        if g and NAMEY.search(prose['senseLabels'][0] + ' ' + g):
            g = name_from_strongs(e.get('strongs_def')) or (e.get('kjv_def') or '').split(',')[0].strip() or None; why = 'name2'
            if not g or g.lower() in ('place name', 'name'): g = None
    if not g:
        g = from_strongs(e.get('strongs_def')); why = 'strongs'
    if g:
        g = re.sub(r'\s+', ' ', g).strip()
        if HEB.search(g): g = None
        if not g: continue
        if g and g[0].isupper() and why not in ('name', 'name2', 'override') and not re.match(r'^(?:God|LORD|Lord|I)\b', g):
            g = g[0].lower() + g[1:]
        if len(g) > 28: g = g[:28].rsplit(' ', 1)[0]
        out[n] = g; src[n] = why
print('total', len(lex), 'glossed', len(out), {w: list(src.values()).count(w) for w in set(src.values())}, file=sys.stderr)
# Patch the lexicon file in place (same header, same occurrence data).
path = R + 'rhema-hebrew-lexicon.js'
text = open(path, encoding='utf-8').read()
head, rest = text.split('window.RhemaHebrewLexicon = ', 1)
body, tail = rest.split(';\nwindow.RhemaHebrewOcc', 1) if ';\nwindow.RhemaHebrewOcc' in rest else rest.split(';window.RhemaHebrewOcc', 1)
sep = ';\nwindow.RhemaHebrewOcc' if ';\nwindow.RhemaHebrewOcc' in rest else ';window.RhemaHebrewOcc'
data = json.loads(body)
for k, e in data.items():
    g = out.get(int(k))
    if g:
        e['gloss'] = g
        e['brief'] = g
        e['quick_def'] = g
open(path, 'w', encoding='utf-8').write(head + 'window.RhemaHebrewLexicon = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + sep + tail)
print('patched', path, file=sys.stderr)
