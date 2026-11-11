# Stream the Berean tables and keep the Hebrew rows: Hebrew order, English verse,
# surface, translit, parsing (short + long), Strong's, BSB English.
import sys, json, openpyxl
src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, read_only=True)
ws = wb['biblosinterlinear96']
ws.reset_dimensions()
verse = None
n = 0
with open(out, 'w', encoding='utf-8') as f:
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i == 0: continue
        if r[12]: verse = r[12]
        # Hebrew and the Aramaic sections (Daniel 2-7, Ezra 4-7, Jer 10:11, Gen 31:47)
        if r[4] not in ('Hebrew', 'Aramaic'):
            if r[4] == 'Greek': break
            continue
        if r[5] is None: continue
        f.write(json.dumps([r[0], verse, str(r[5]), r[7], r[8], r[9], r[10], str(r[18] if r[18] is not None else '').strip()], ensure_ascii=False) + '\n')
        n += 1
print('hebrew+aramaic rows', n, 'last verse', verse, file=sys.stderr)
