#!/usr/bin/env python3
"""Verifies the self-hosted Material Symbols fonts cover every icon the app uses.

Extracts every icon name referenced in index.html and the JS bundles (inline
<span class="material-symbols-*">name</span> markup, data-driven `icon: '...'`
fields, and icon name arrays), then checks that each name has a ligature in all
three self-hosted font files — so an icon added in code without a glyph in the
fonts is caught before it ships as raw text.

Run: python3 scripts/test-icon-fonts.py   (needs fontTools: pip install fonttools)
"""
import glob
import os
import re
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
FONTS = ["ms-outlined-0.woff2", "ms-rounded-0.woff2", "ms-sharp-0.woff2"]


def referenced_icon_names():
    names = set()
    srcs = [os.path.join(ROOT, "index.html")] + glob.glob(os.path.join(ROOT, "*.js"))
    for path in srcs:
        try:
            s = open(path, encoding="utf-8").read()
        except OSError:
            continue
        for m in re.finditer(r'material-symbols-(?:outlined|rounded|sharp)[^>]*>\s*([a-z][a-z0-9_]*)\s*<', s):
            names.add(m.group(1))
        if os.path.basename(path) in ("bible-threads.js", "app.js"):
            for m in re.finditer(r"icon:\s*['\"]([a-z][a-z0-9_]*)['\"]", s):
                names.add(m.group(1))
    s = open(os.path.join(ROOT, "app.js"), encoding="utf-8").read()
    for m in re.finditer(r"(?:ICONS|_ICONS|Icons)\s*=\s*\[([^\]]+)\]", s):
        for w in re.findall(r"['\"]([a-z][a-z0-9_]{2,})['\"]", m.group(1)):
            names.add(w)
    return {n for n in names if n not in ("a", "span", "div")}


def ligature_words(path):
    font = TTFont(path)
    rev = {}
    # Prefer lowercase letters (higher codepoints) when several map to a glyph.
    for code, glyph in sorted(font.getBestCmap().items(), reverse=True):
        rev[glyph] = chr(code)
    words = set()

    def walk(sub):
        if hasattr(sub, "ExtSubTable"):
            walk(sub.ExtSubTable)
            return
        if hasattr(sub, "ligatures"):
            for first, rules in sub.ligatures.items():
                for rule in rules:
                    try:
                        words.add("".join(rev[g] for g in [first] + list(rule.Component)).lower())
                    except KeyError:
                        continue

    for lookup in font["GSUB"].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            walk(sub)
    return words


def main():
    names = referenced_icon_names()
    if len(names) < 50:
        print(f"extraction looks broken: only {len(names)} icon names found")
        return 1
    failed = False
    for fname in FONTS:
        ligs = ligature_words(os.path.join(ROOT, "assets", "fonts", fname))
        missing = sorted(n for n in names if n.lower() not in ligs)
        if missing:
            failed = True
            print(f"✗ {fname}: {len(missing)} missing: {missing[:20]}")
        else:
            print(f"✓ {fname}: all {len(names)} referenced icons covered")
    print("FAIL" if failed else "PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
