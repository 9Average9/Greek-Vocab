# Per-word statistics for the Hebrew Word Study, from the Berean translation
# tables (see scripts/extract-bsb-tables.py):
#   - how the BSB translates the word across the Old Testament, with counts and
#     a few example verses for each rendering
#   - which verb stems and forms it takes (Qal, Niphal… / perfect, imperfect…)
#   - where it appears, by book
# Output: data/hebrew-word-stats/s-<NNNN>.json, 100 Strong's numbers per file
#   { "<strongs>": { "n": total, "u": times with no English of its own,
#                    "r": [[english, count, [refs]]...],
#                    "st": {stem: count}, "fm": {form: count}, "b": {BOOK: count} } }
#
#   python3 scripts/build-hebrew-word-stats.py hebrew_rows.jsonl
import json, os, re, sys
from collections import defaultdict, Counter

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
BOOKS = {
  'Genesis': 'GEN', 'Exodus': 'EXO', 'Leviticus': 'LEV', 'Numbers': 'NUM', 'Deuteronomy': 'DEU', 'Joshua': 'JOS',
  'Judges': 'JDG', 'Ruth': 'RUT', '1 Samuel': '1SA', '2 Samuel': '2SA', '1 Kings': '1KI', '2 Kings': '2KI',
  '1 Chronicles': '1CH', '2 Chronicles': '2CH', 'Ezra': 'EZR', 'Nehemiah': 'NEH', 'Esther': 'EST', 'Job': 'JOB',
  'Psalm': 'PSA', 'Psalms': 'PSA', 'Proverbs': 'PRO', 'Ecclesiastes': 'ECC', 'Song of Solomon': 'SNG', 'Song of Songs': 'SNG',
  'Isaiah': 'ISA', 'Jeremiah': 'JER', 'Lamentations': 'LAM', 'Ezekiel': 'EZK', 'Daniel': 'DAN', 'Hosea': 'HOS',
  'Joel': 'JOL', 'Amos': 'AMO', 'Obadiah': 'OBA', 'Jonah': 'JON', 'Micah': 'MIC', 'Nahum': 'NAM', 'Habakkuk': 'HAB',
  'Zephaniah': 'ZEP', 'Haggai': 'HAG', 'Zechariah': 'ZEC', 'Malachi': 'MAL',
}
# Words around the rendering that belong to the sentence, not to this Hebrew
# word: joining words, "the", prepositions, possessives (my/your/his…),
# subject pronouns and helpers ("may", "will", "surely as").
LEAD = re.compile(r"^(?:and|then|now|so|but|or|yet|for|the|a|an|of|in|into|to|from|with|by|on|upon|at|as|like|that|which|who|O|"
                  r"my|your|his|her|its|our|their|he|she|it|they|we|you|I|may|will|shall|surely|am|out|against|before|over|"
                  r"under|all|every|even|also|not|let|because|when|if|about|through)\s+", re.I)
KEEP_CASE = re.compile(r"^(?:God|LORD|Lord|I)\b")

def norm(e, proper, gloss=''):
    e = re.sub(r'\[[^\]]*\]', ' ', e or '')           # words the translators supplied
    e = re.sub(r"['’]s\b", '', e)                       # LORD's → LORD
    e = re.sub(r"[“”\"‘’'.,;:!?()]", ' ', e)
    e = re.sub(r'\s+', ' ', e).strip()
    prev = None
    while prev != e:
        prev = e
        e = LEAD.sub('', e).strip()
    if not e or e in ('-', 'vvv'): return ''
    # A long phrase that contains the word's own meaning ("surely as the
    # LORD lives", "out of the land") counts as that meaning.
    words = e.split()
    stem = re.sub(r'[^a-z]', '', (gloss or '').split('/')[0].strip().lower())[:4]
    if len(words) > 2 and len(stem) >= 3:
        for i, w in enumerate(words):
            if w.lower().startswith(stem):
                aux = words[i - 1] if i and words[i - 1].lower() in ('was', 'were', 'be', 'been', 'is', 'are') else ''
                e = (aux + ' ' + w).strip()
                break
    if not proper and not KEEP_CASE.match(e) and not e.split()[0].isupper(): e = e[0].lower() + e[1:]
    return e

FILLER = {'and', 'he', 'him', 'his', 'she', 'her', 'it', 'they', 'them', 'their', 'that', 'this', 'I', 'me', 'my',
          'you', 'your', 'we', 'us', 'our', 'the', 'a', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'be'}

lex = json.loads(__import__('subprocess').check_output(['node', '-e', '''
const vm=require('vm'),fs=require('fs');const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
const L=c.window.RhemaHebrewLexicon;const o={};for(const k in L)o[k]=(L[k].gloss||'');process.stdout.write(JSON.stringify(o));''', R + 'rhema-hebrew-lexicon.js']))

renders = defaultdict(Counter)
examples = defaultdict(lambda: defaultdict(list))
stems = defaultdict(Counter)
forms = defaultdict(Counter)
books = defaultdict(Counter)
total = Counter()
untranslated = Counter()
with open(sys.argv[1], encoding='utf-8') as f:
    for line in f:
        _, verse, _, _, parse, _, strongs, eng = json.loads(line)
        if not strongs: continue
        m = re.match(r'^(.*) (\d+):(\d+)$', verse or '')
        if not m or m.group(1) not in BOOKS: continue
        s = int(strongs)
        book = BOOKS[m.group(1)]
        ref = f'{book} {m.group(2)}:{m.group(3)}'
        total[s] += 1
        books[s][book] += 1
        g = lex.get(str(s), '')
        proper = bool(g) and g[0].isupper() and not KEEP_CASE.match(g)
        e = norm(eng, proper, g)
        if not e: untranslated[s] += 1
        if e:
            renders[s][e] += 1
            if len(examples[s][e]) < 4 and ref not in examples[s][e]: examples[s][e].append(ref)
        for seg in (parse or '').split(' | '):
            vm = re.match(r'^V-([A-Za-z]+)-([A-Za-z]+)', seg)
            if vm:
                stems[s][vm.group(1)] += 1
                forms[s][vm.group(2)] += 1

out = defaultdict(dict)
for s, n in total.items():
    # Drop stray filler words (the BSB said "he" instead of repeating a name)
    # unless they're a real share of the renderings.
    r = [[e, c, examples[s][e]] for e, c in renders[s].most_common(14)
         if e not in FILLER or c >= 0.1 * n][:8]
    out[(s - 1) // 100][str(s)] = {'n': n, 'u': untranslated[s], 'r': r, 'st': dict(stems[s].most_common()), 'fm': dict(forms[s].most_common()), 'b': dict(books[s].most_common())}
os.makedirs(R + 'data/hebrew-word-stats', exist_ok=True)
for shard, data in out.items():
    with open(R + f'data/hebrew-word-stats/s-{shard * 100 + 1:04d}.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print('words', len(total), 'shards', len(out), file=sys.stderr)
