"""Optional artwork maintenance: python scripts/extract-fusion-glyphs.py FONT.ttf.

The normal Node build reads the checked-in outlines and needs no font/Python.
Use DejaVu Sans Condensed Bold; retain assets/fusion/LICENSE-DejaVu.txt.
"""
import json
import sys
from pathlib import Path
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
font = TTFont(sys.argv[1])
glyphset, cmap = font.getGlyphSet(), font.getBestCmap()
glyphs = {}
for char in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-+":
    name = cmap[ord(char)]
    pen = SVGPathPen(glyphset)
    glyphset[name].draw(pen)
    glyphs[char] = {"advance": font["hmtx"][name][0], "path": pen.getCommands()}
glyphs[" "] = {"advance": font["hmtx"][cmap[32]][0], "path": ""}
(root / "src/fusion-glyphs.json").write_text(
    json.dumps({"unitsPerEm": font["head"].unitsPerEm, "glyphs": glyphs}, separators=(",", ":")) + "\n"
)
