# Hebrew Old Testament word-by-word English, transliteration and parsing for
# every word of the app's Hebrew text (rhema-ot-hebrew.js, OSHB/WLC).
#
# Source: the Berean Bible translation tables (bereanbible.com/bsb_tables.xlsx,
# freely usable with attribution) — the same tables the Greek side uses. Each
# Hebrew word there carries the Berean Standard Bible's English for that exact
# spot ("In the beginning", "created", "the heavens"), a transliteration
# (bə·rê·šîṯ) and a parsing ("V-Qal-Perf-3ms").
#
# Both texts are the Westminster Leningrad Codex, so the words are lined up by
# their consonants, book by book, in Hebrew order (difflib alignment; anything
# that doesn't match stays empty rather than guessed).
#
# Output: data/hebrew-interlinear/<BOOK>.json
#   { "<chapter>": { "<verse>": [ [english, translit, parsing] | null, ... ] } }
# one entry per word of rhema-ot-hebrew.js in the same order (MT numbering).
#
#   1. python3 scripts/extract-bsb-tables.py bsb_tables.xlsx hebrew_rows.jsonl
#   2. python3 scripts/build-hebrew-interlinear.py hebrew_rows.jsonl
import json, os, re, subprocess, sys, difflib
from collections import defaultdict

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
rows_path = sys.argv[1]

BOOKS = {
  'Genesis': 'GEN', 'Exodus': 'EXO', 'Leviticus': 'LEV', 'Numbers': 'NUM', 'Deuteronomy': 'DEU', 'Joshua': 'JOS',
  'Judges': 'JDG', 'Ruth': 'RUT', '1 Samuel': '1SA', '2 Samuel': '2SA', '1 Kings': '1KI', '2 Kings': '2KI',
  '1 Chronicles': '1CH', '2 Chronicles': '2CH', 'Ezra': 'EZR', 'Nehemiah': 'NEH', 'Esther': 'EST', 'Job': 'JOB',
  'Psalm': 'PSA', 'Psalms': 'PSA', 'Proverbs': 'PRO', 'Ecclesiastes': 'ECC', 'Song of Solomon': 'SNG', 'Song of Songs': 'SNG',
  'Isaiah': 'ISA', 'Jeremiah': 'JER', 'Lamentations': 'LAM', 'Ezekiel': 'EZK', 'Daniel': 'DAN', 'Hosea': 'HOS',
  'Joel': 'JOL', 'Amos': 'AMO', 'Obadiah': 'OBA', 'Jonah': 'JON', 'Micah': 'MIC', 'Nahum': 'NAM', 'Habakkuk': 'HAB',
  'Zephaniah': 'ZEP', 'Haggai': 'HAG', 'Zechariah': 'ZEC', 'Malachi': 'MAL',
}
def cons(s):
    # consonants only (no vowels, accents, maqaf, sof pasuq), final forms folded
    s = re.sub(r'[^א-ת]', '', s or '')
    return s.translate(str.maketrans('ךםןףץ', 'כמנפצ'))

def clean_eng(e):
    # '-' = no separate English word; '. . .' = rendered with a neighboring
    # word; 'vvv' = a Berean placeholder. All three mean "no English here".
    e = re.sub(r'\s+', ' ', (e or '')).strip()
    return '' if e in ('-', '–', '—', '', '. . .', '...', '…', 'vvv') else e

# 1) Berean rows by book, in Hebrew order
by_book = defaultdict(list)
with open(rows_path, encoding='utf-8') as f:
    for line in f:
        heb_sort, verse, surface, translit, parse_s, parse_l, strongs, eng = json.loads(line)
        m = re.match(r'^(.*) (\d+):(\d+)$', verse or '')
        if not m or m.group(1) not in BOOKS: continue
        by_book[BOOKS[m.group(1)]].append((int(heb_sort or 0), cons(surface), clean_eng(eng), (translit or '').strip(), (parse_s or '').strip()))

# 2) the app's Hebrew text
heb = json.loads(subprocess.check_output(['node', '--max-old-space-size=4000', '-e', '''
const vm=require('vm'),fs=require('fs');const c={window:{}};vm.createContext(c);
vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);process.stdout.write(JSON.stringify(c.window.RhemaHebrewOT.text));
''', R + 'rhema-ot-hebrew.js']))

os.makedirs(R + 'data/hebrew-interlinear', exist_ok=True)
total = matched = 0
report = []
for book, chapters in heb.items():
    toks = []
    for c in sorted(chapters, key=int):
        for v in sorted(chapters[c], key=int):
            for i, w in enumerate(chapters[c][v]):
                toks.append((c, v, i, cons(w[0])))
    rows = sorted(by_book.get(book, []), key=lambda r: r[0])
    a = [t[3] for t in toks]
    b = [r[1] for r in rows]
    out = {}
    for c in chapters:
        out[c] = {v: [None] * len(chapters[c][v]) for v in chapters[c]}
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    m = 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal' or (tag == 'replace' and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                c, v, i, _ = toks[i1 + k]
                r = rows[j1 + k]
                out[c][v][i] = [r[2], r[3], r[4]]
                m += 1
    total += len(toks); matched += m
    report.append(f'{book} {m}/{len(toks)}')
    with open(R + f'data/hebrew-interlinear/{book}.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
print(' '.join(report), file=sys.stderr)
print(f'matched {matched}/{total} = {matched / max(total, 1):.4f}', file=sys.stderr)
