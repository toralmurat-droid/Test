"""Builds the game's bitmap pixel fonts (client/public/fonts/*.woff2).

Every glyph is drawn from square pixels on a fixed grid, so text shown at 2x (or 3x) lines up with the
world's 2x2-screen-pixel art grid (pixelgrid.ts) and reads as part of the same pixel-art game.

- Oakvale Title: bold mono letters, the same shapes as the zone title ("Oakvale Outskirts", pixeltext.ts).
  Design em = 11 px. CSS 22px = 2x, 33px = 3x.
- Oakvale Text: bold proportional body text. Design em = 9 px. CSS 18px = 2x.
- Oakvale Tiny: 3x5 capitals and digits for key hints and slot numbers. Design em = 6 px. CSS 12px = 2x.

The Title and Text shapes are rasterised once from DejaVu Sans Mono Bold / DejaVu Sans Bold with no
anti-aliasing (Bitstream Vera licence: derived fonts must use another name, hence "Oakvale").
Needs: python3 with Pillow + fonttools + brotli, and the DejaVu fonts installed.
Run: python3 tools/font/build-fonts.py
"""
import os
from PIL import Image, ImageDraw, ImageFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "client", "public", "fonts")
DEJAVU = "/usr/share/fonts/truetype/dejavu/"
PX = 100  # font units per design pixel
TEXT_SRC = int(os.environ.get("TEXT_SRC", "9"))

CHARS = [chr(c) for c in range(0x20, 0x7F)] + [chr(c) for c in range(0xA0, 0x100)] + list("’‘“”…–—•·▲▼►◄←↑→↓×✓")

# Hand fixes after the raster (row strings top->bottom, '#' = pixel, baseline row given by base_row)
FIX_TEXT = {}
FIX_TITLE = {}


def raster(path, size, ch, mono_adv=None):
    """Returns (rows, top) where rows are lists of 0/1 from `top` (design px above baseline) downward, plus width."""
    f = ImageFont.truetype(path, size)
    W, H, BASE = size * 3, size * 3, size * 2
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    d.fontmode = "1"
    d.text((size // 2, BASE), ch, font=f, fill=255, anchor="ls")
    px = im.load()
    on = [[1 if px[x, y] > 127 else 0 for x in range(W)] for y in range(H)]
    ys = [y for y in range(H) if any(on[y])]
    xs = [x for x in range(W) if any(on[y][x] for y in range(H))]
    if not xs:
        return [], 0, 0, 0
    x0 = size // 2 if mono_adv else min(xs)
    x1 = max(xs)
    rows = [row[x0:x1 + 1] for row in on[min(ys):max(ys) + 1]]
    return rows, BASE - min(ys), x0 - size // 2, x1 - x0 + 1


TINY = {  # 3x5 (some 1..5 wide), top row first
    "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#", "##", ".#", ".#", ".#"], "2": ["###", "..#", "###", "#..", "###"],
    "3": ["###", "..#", ".##", "..#", "###"], "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"],
    "6": ["###", "#..", "###", "#.#", "###"], "7": ["###", "..#", "..#", ".#.", ".#."], "8": ["###", "#.#", "###", "#.#", "###"],
    "9": ["###", "#.#", "###", "..#", "###"],
    "A": [".#.", "#.#", "###", "#.#", "#.#"], "B": ["##.", "#.#", "##.", "#.#", "##."], "C": [".##", "#..", "#..", "#..", ".##"],
    "D": ["##.", "#.#", "#.#", "#.#", "##."], "E": ["###", "#..", "##.", "#..", "###"], "F": ["###", "#..", "##.", "#..", "#.."],
    "G": [".##", "#..", "#.#", "#.#", ".##"], "H": ["#.#", "#.#", "###", "#.#", "#.#"], "I": ["###", ".#.", ".#.", ".#.", "###"],
    "J": ["..#", "..#", "..#", "#.#", ".#."], "K": ["#.#", "#.#", "##.", "#.#", "#.#"], "L": ["#..", "#..", "#..", "#..", "###"],
    "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#"], "N": ["#..#", "##.#", "#.##", "#..#", "#..#"], "O": [".#.", "#.#", "#.#", "#.#", ".#."],
    "P": ["##.", "#.#", "##.", "#..", "#.."], "Q": [".#.", "#.#", "#.#", "##.", ".##"], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "S": [".##", "#..", ".#.", "..#", "##."], "T": ["###", ".#.", ".#.", ".#.", ".#."], "U": ["#.#", "#.#", "#.#", "#.#", "###"],
    "V": ["#.#", "#.#", "#.#", "#.#", ".#."], "W": ["#...#", "#...#", "#.#.#", "##.##", "#...#"], "X": ["#.#", "#.#", ".#.", "#.#", "#.#"],
    "Y": ["#.#", "#.#", ".#.", ".#.", ".#."], "Z": ["###", "..#", ".#.", "#..", "###"],
    "[": ["##", "#.", "#.", "#.", "##"], "]": ["##", ".#", ".#", ".#", "##"], "(": [".#", "#.", "#.", "#.", ".#"], ")": ["#.", ".#", ".#", ".#", "#."],
    ".": [".", ".", ".", ".", "#"], ",": [".", ".", ".", "#", "#"], ":": [".", "#", ".", "#", "."], "-": ["...", "...", "###", "...", "..."],
    "+": ["...", ".#.", "###", ".#.", "..."], "/": ["..#", "..#", ".#.", "#..", "#.."], "%": ["#.#", "..#", ".#.", "#..", "#.#"],
    "!": ["#", "#", "#", ".", "#"], "?": ["##.", "..#", ".#.", "...", ".#."], "'": ["#", "#", ".", ".", "."], "x": ["...", "#.#", ".#.", "#.#", "..."],
    "<": ["..#", ".#.", "#..", ".#.", "..#"], ">": ["#..", ".#.", "..#", ".#.", "#.."], "=": ["...", "###", "...", "###", "..."],
    "#": ["#.#", "###", "#.#", "###", "#.#"], "*": ["...", "#.#", ".#.", "#.#", "..."], "·": [".", ".", "#", ".", "."],
}


def glyph_from_rows(rows, top, xoff):
    """Merges each row's pixel runs into rectangles (font units, baseline at y=0)."""
    pen = TTGlyphPen(None)
    for r, row in enumerate(rows):
        y1 = (top - r) * PX
        y0 = y1 - PX
        x = 0
        while x < len(row):
            if row[x]:
                s = x
                while x < len(row) and row[x]:
                    x += 1
                a, b = (xoff + s) * PX, (xoff + x) * PX
                pen.moveTo((a, y0)); pen.lineTo((a, y1)); pen.lineTo((b, y1)); pen.lineTo((b, y0)); pen.closePath()
            else:
                x += 1
    return pen.glyph()


def build(family, em, ascent, descent, glyphs, space_adv):
    """glyphs: {char: (rows, top, xoff, advance)}"""
    order = [".notdef", "space"]
    cmap = {32: "space", 0xA0: "space"}
    gl = {".notdef": TTGlyphPen(None).glyph(), "space": TTGlyphPen(None).glyph()}
    metrics = {".notdef": (space_adv * PX, 0), "space": (space_adv * PX, 0)}
    for ch, (rows, top, xoff, adv) in glyphs.items():
        if ch in (" ", "\xa0") or not rows:
            continue
        name = f"uni{ord(ch):04X}"
        order.append(name)
        cmap[ord(ch)] = name
        gl[name] = glyph_from_rows(rows, top, xoff)
        metrics[name] = (adv * PX, xoff * PX)
    fb = FontBuilder(em * PX, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(gl)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ascent * PX, descent=-descent * PX)
    fb.setupNameTable({"familyName": family, "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=ascent * PX, sTypoDescender=-descent * PX, sTypoLineGap=0,
                usWinAscent=ascent * PX, usWinDescent=descent * PX, fsType=0)
    fb.setupPost()
    fb.font["head"].flags |= 1 << 3  # integer ppem
    os.makedirs(OUT, exist_ok=True)
    fb.font.flavor = "woff2"
    path = os.path.join(OUT, family.lower().replace(" ", "-") + ".woff2")
    fb.save(path)
    print("wrote", path, len(order), "glyphs")


def rows_of(strs):
    return [[1 if c == "#" else 0 for c in s] for s in strs]


def main():
    # Title: mono, fixed advance 7
    title = {}
    for ch in CHARS:
        if ch in FIX_TITLE:
            rows, top = rows_of(FIX_TITLE[ch][0]), FIX_TITLE[ch][1]; title[ch] = (rows, top, 0, 7); continue
        rows, top, xoff, w = raster(DEJAVU + "DejaVuSansMono-Bold.ttf", 11, ch, mono_adv=7)
        if rows:
            title[ch] = (rows, top, xoff, 7)
    build("Oakvale Title", 11, 10, 3, title, 7)
    # Text: proportional, advance = ink width + 1
    text = {}
    for ch in CHARS:
        if ch in FIX_TEXT:
            rows, top = rows_of(FIX_TEXT[ch][0]), FIX_TEXT[ch][1]; text[ch] = (rows, top, 0, len(rows[0]) + 1); continue
        rows, top, xoff, w = raster(DEJAVU + "DejaVuSans-Bold.ttf", TEXT_SRC, ch)
        if rows:
            text[ch] = (rows, top, 0, w + 1)
    build("Oakvale Text", 9, 9, 3, text, 3)
    # Tiny: 3x5 caps, lowercase drawn as caps
    tiny = {}
    for ch, strs in TINY.items():
        tiny[ch] = (rows_of(strs), 5, 0, len(strs[0]) + 1)
        if ch.isalpha() and ch.isupper() and ch.lower() not in TINY:
            tiny[ch.lower()] = tiny[ch]
    build("Oakvale Tiny", 6, 6, 1, tiny, 2)


if __name__ == "__main__":
    main()
