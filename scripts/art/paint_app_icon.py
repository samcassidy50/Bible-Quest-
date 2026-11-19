#!/usr/bin/env python3
"""
Paints app-icon candidates for Bible Quest as pixel art. Original designs, deterministic.

    python3 scripts/art/paint_app_icon.py            # writes art/app-icon/<name>.png (1024x1024)
                                                     # and art/app-icon/candidates.png (side by side)
    python3 scripts/art/paint_app_icon.py --install  # also writes the chosen icon (INSTALLED) into
                                                     # the iOS asset catalog and Android mipmaps

Each icon is painted on a 64x64 grid and scaled 16x with nearest neighbour, so it stays crisp.
Keep the subject inside the middle ~44px: iOS rounds the corners and Android's adaptive icon
crops to a circle or squircle. Needs Pillow.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pixel_kit import Canvas, OUTLINE, ellipse, hexc, polygon, union  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'art' / 'app-icon'
N = 64
SCALE = 16

GOLD = [hexc(c) for c in ('fff0a8', 'f4c95d', 'c9952e', '8a5e1a')]
STEEL = [hexc(c) for c in ('ffffff', 'dfe6ee', 'a9b4c2', '6e7a8a')]
BLUE = [hexc(c) for c in ('8fc3f2', '3b82d6', '275ea8', '1b3f75')]
RUBY = [hexc(c) for c in ('ffc2d6', 'e8517f', 'b22e5a', '7a1a3a')]
LEATHER = [hexc(c) for c in ('d79b62', 'a86a3c', '7a4a26', '553118')]
PAGE = [hexc(c) for c in ('fffdf2', 'f6ecd0', 'e2d1a6', 'b89f6e')]
INK = hexc('b59a6a')
SPARK = hexc('fff6c2')

Color = tuple[int, int, int]


# ---------------------------------------------------------------- backgrounds

def gradient(stops: list[Color], size: int = N) -> Image.Image:
    """Vertical bands of colour, with a checker dither row where two bands meet."""
    im = Image.new('RGB', (size, size))
    band = size / len(stops)
    for y in range(size):
        i = min(int(y / band), len(stops) - 1)
        edge = (y + 1) / band
        for x in range(size):
            c = stops[i]
            # dither the last row of each band into the next one
            if i + 1 < len(stops) and int(edge) != int(y / band) and (x + y) % 2 == 0:
                c = stops[i + 1]
            im.putpixel((x, y), c)
    return im


def rays(im: Image.Image, cx: float, cy: float, colour: Color, count: int = 12, width: float = 0.13) -> None:
    """Alternating wedges of light radiating from (cx, cy)."""
    for y in range(im.height):
        for x in range(im.width):
            a = math.atan2(y + 0.5 - cy, x + 0.5 - cx)
            if (a / (2 * math.pi) * count) % 1 < width * count / 2:
                r, g, b = im.getpixel((x, y))
                im.putpixel((x, y), tuple((p + q) // 2 for p, q in zip((r, g, b), colour)))


def glow(im: Image.Image, cx: float, cy: float, rings: list[tuple[float, Color]]) -> None:
    """Concentric stepped halos (largest first), blended half over what is there."""
    for radius, colour in rings:
        for x, y in ellipse(cx, cy, radius, radius):
            if 0 <= x < im.width and 0 <= y < im.height:
                r, g, b = im.getpixel((x, y))
                im.putpixel((x, y), tuple((p + q) // 2 for p, q in zip((r, g, b), colour)))


def stars(im: Image.Image, pts: list[tuple[int, int]], big: list[tuple[int, int]] = ()) -> None:
    for x, y in pts:
        im.putpixel((x, y), SPARK)
    for x, y in big:
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            im.putpixel((x + dx, y + dy), SPARK if (dx, dy) != (0, 0) else (255, 255, 255))


def stamp(im: Image.Image, c: Canvas, offset: int = 0) -> None:
    sprite = c.image().crop((0, 0, N, N))
    if im.mode == 'RGBA':
        im.alpha_composite(sprite, (offset, offset))
    else:
        im.paste(sprite, (offset, offset), sprite)


# ---------------------------------------------------------------- subjects

def open_book(c: Canvas, top: int = 36) -> None:
    """An open Bible seen from slightly above, red leather cover, cream pages, gold edges."""
    t = top
    cover = polygon([(9, t + 6), (32, t + 10), (55, t + 6), (55, t + 15), (32, t + 19), (9, t + 15)])
    c.paint(cover, RUBY)
    left = polygon([(11, t + 1), (19, t - 1), (31.5, t + 3), (31.5, t + 15), (19, t + 11), (11, t + 13)])
    right = polygon([(32.5, t + 3), (45, t - 1), (53, t + 1), (53, t + 13), (45, t + 11), (32.5, t + 15)])
    c.paint(left, PAGE, edge=False)
    c.paint(right, PAGE, edge=False)
    # gilt page edges along the bottom
    for x in range(11, 54):
        if x in (31, 32):
            continue
        col = [yy for (xx, yy) in (left | right) if xx == x]
        if col:
            c.px[(x, max(col) + 1)] = GOLD[1]
    # spine
    for y in range(t + 3, t + 17):
        c.px[(31, y)] = PAGE[3]
        c.px[(32, y)] = PAGE[2]
    # lines of text
    for row in range(3):
        for x in range(14, 30, 1):
            if (x + row) % 5 != 0:
                y = t + 3 + row * 3 + round((x - 14) * 0.15 - (0 if x < 20 else (x - 20) * 0.3))
                if (x, y) in left:
                    c.px[(x, y)] = INK
        for x in range(35, 51):
            if (x + row) % 5 != 2:
                y = t + 3 + row * 3 + round((50 - x) * 0.15 - (0 if x > 44 else (44 - x) * 0.3))
                if (x, y) in right:
                    c.px[(x, y)] = INK
    # ribbon bookmark
    c.dot([(36, t + 15), (36, t + 16), (36, t + 17), (37, t + 18), (36, t + 19), (35, t + 20)], RUBY[1])


def sword_up(c: Canvas, cx: int, tip: int, guard: int, pommel: int) -> None:
    """A gleaming sword, point up."""
    blade = polygon([(cx - 2, guard), (cx - 2, tip + 4), (cx, tip), (cx + 2, tip + 4), (cx + 2, guard)])
    c.paint(blade, STEEL)
    for y in range(tip + 4, guard - 1):
        c.px[(cx - 1, y)] = STEEL[0]
    c.paint(polygon([(cx - 8, guard), (cx + 8, guard), (cx + 8, guard + 3), (cx - 8, guard + 3)]), GOLD)
    c.paint(polygon([(cx - 1.5, guard + 3), (cx + 1.5, guard + 3), (cx + 1.5, pommel - 2), (cx - 1.5, pommel - 2)]),
            LEATHER)
    c.paint(ellipse(cx, pommel, 2.6, 2.6), GOLD)


def shield_of_faith(c: Canvas, k: float = 1.0, oy: float = 0.0) -> None:
    """Heater shield, blue field with gold rim and a gold cross; k scales it about (32, 9)."""
    def t(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
        return [(32 + (x - 32) * k, 9 + oy + (y - 9) * k) for x, y in pts]

    c.paint(polygon(t([(12, 13), (32, 9), (52, 13), (52, 30), (48, 42), (40, 50), (32, 55), (24, 50),
                       (16, 42), (12, 30)])), GOLD)
    c.paint(polygon(t([(15, 15.5), (32, 12), (49, 15.5), (49, 30), (45.5, 40.5), (38.5, 47.5), (32, 51.5),
                       (25.5, 47.5), (18.5, 40.5), (15, 30)])), BLUE)
    cross = union(polygon(t([(29.5, 16), (34.5, 16), (34.5, 47), (29.5, 47)])),
                  polygon(t([(20, 25), (44, 25), (44, 30), (20, 30)])))
    c.paint(cross, GOLD)
    gx, gy = t([(19, 18)])[0]
    c.dot([(round(gx), round(gy)), (round(gx) + 1, round(gy) - 1), (round(gx) - 1, round(gy) + 1)], BLUE[0])


# ---------------------------------------------------------------- title

# Bold 2px-stroke capitals, 7 rows tall (Q has a tail on an 8th row). Only the letters we need.
GLYPHS = {
    'B': ['####.', '##.##', '##.##', '####.', '##.##', '##.##', '####.'],
    'I': ['##'] * 7,
    'L': ['##..', '##..', '##..', '##..', '##..', '##..', '####'],
    'E': ['####', '##..', '##..', '###.', '##..', '##..', '####'],
    'Q': ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.', '...##'],
    'U': ['##.##'] * 6 + ['.###.'],
    'S': ['.####', '##...', '##...', '.###.', '...##', '...##', '####.'],
    'T': ['######'] + ['..##..'] * 6,
}
TITLE_FILL = [hexc(h) for h in ('fff6c8', 'ffe27a', 'f4c95d', 'f4c95d', 'e0a93e', 'c9952e', 'b07f22', 'b07f22')]
TITLE_EDGE = hexc('2a1608')


def word_mask(text: str) -> tuple[set[tuple[int, int]], int]:
    px: set[tuple[int, int]] = set()
    x = 0
    for ch in text:
        g = GLYPHS[ch]
        for y, row in enumerate(g):
            for i, v in enumerate(row):
                if v == '#':
                    px.add((x + i, y))
        x += len(g[0]) + 1
    return px, x - 1


def title(im: Image.Image, top: int, lines: tuple[str, ...] = ('BIBLE', 'QUEST'), gap: int = 3) -> None:
    """Gold lettering with a thick dark outline and a drop shadow, centred, one word per line."""
    w = im.width
    fill: dict[tuple[int, int], Color] = {}
    y0 = top
    for line in lines:
        mask, width = word_mask(line)
        x0 = (w - width) // 2
        for x, y in mask:
            fill[(x0 + x, y0 + y)] = TITLE_FILL[y]
        y0 += 7 + gap
    edge = {(x + dx, y + dy) for x, y in fill for dx in (-1, 0, 1) for dy in (-1, 0, 1)} - set(fill)
    shadow = {(x, y + 1) for x, y in edge} - edge - set(fill)
    for (x, y) in shadow:
        if 0 <= x < w and 0 <= y < im.height:
            if im.mode == 'RGBA':  # a transparent layer: lay down a translucent black
                im.alpha_composite(Image.new('RGBA', (1, 1), (0, 0, 0, 170)), (x, y))
            else:
                r, g, b = im.getpixel((x, y))
                im.putpixel((x, y), (r // 3, g // 3, b // 3))
    for p in edge:
        im.putpixel(p, TITLE_EDGE if im.mode == 'RGB' else (*TITLE_EDGE, 255))
    for p, c in fill.items():
        im.putpixel(p, c if im.mode == 'RGB' else (*c, 255))


# ---------------------------------------------------------------- icons

def word_layers(pad: int = 0) -> tuple[Image.Image, Image.Image]:
    """'The Word' as two layers: the night sky (opaque) and the Bible plus title (transparent).
    pad widens the sky around the 64px scene (Android adaptive icons need the extra bleed)."""
    size = N + 2 * pad
    bg = gradient([hexc(h) for h in ('141a3a', '1c2550', '27336a', '35407e', '4a4f8c', '6a5c94')], size)
    rays(bg, 32 + pad, 38 + pad, hexc('c9a86a'), count=14, width=0.035)
    glow(bg, 32 + pad, 38 + pad,
         [(20, hexc('8a6aa0')), (13, hexc('d9a860')), (8, hexc('ffe7a0')), (4, hexc('fffbe8'))])
    pts = [(5, 5), (58, 6), (60, 24), (4, 30), (9, 40), (55, 38)]
    big = [(7, 22), (56, 30)]
    if pad:
        pts += [(-14, 2), (-20, 20), (-10, 48), (70, -10), (78, 16), (74, 52), (20, -16), (44, -20),
                (-18, 70), (80, 72)]
        big += [(-12, -12), (76, 40)]
    stars(bg, [(x + pad, y + pad) for x, y in pts if 0 <= x + pad < size and 0 <= y + pad < size],
          big=[(x + pad, y + pad) for x, y in big if 1 <= x + pad < size - 1 and 1 <= y + pad < size - 1])
    fg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c = Canvas()
    open_book(c, top=42)
    c.outline()
    stamp(fg, c, pad)
    title(fg, 6 + pad)
    return bg, fg


def icon_word() -> Image.Image:
    """'The Word': an open Bible pouring light into a night sky."""
    bg, fg = word_layers()
    bg.paste(fg, (0, 0), fg)
    return bg


def icon_shield() -> Image.Image:
    """'Armor of God': shield of faith over a crossed sword, on a dawn sky."""
    im = gradient([hexc(h) for h in ('2a3d7a', '3d5aa0', '5d7cc0', 'e6a77a', 'f4c785', 'ffe2a6')])
    rays(im, 32, 42, hexc('fff0c8'), count=10, width=0.07)
    c = Canvas()
    blade = polygon([(13, 58), (16, 61), (51, 27), (53, 21), (47, 23)])
    c.paint(blade, STEEL)
    c.paint(polygon([(9, 53), (12, 50), (21, 59), (18, 62)]), GOLD)
    c.paint(ellipse(9, 61, 2.3, 2.3), GOLD)
    shield_of_faith(c, k=0.72, oy=16)
    c.outline()
    stamp(im, c)
    title(im, 4)
    return im


def icon_sword_book() -> Image.Image:
    """'Sword of the Spirit': a sword standing over an open Bible, light behind."""
    im = gradient([hexc(h) for h in ('1e5a8a', '2f78a8', '4d97c0', '7cb6d0', 'b4d6d8', 'e4ecd0')])
    glow(im, 32, 30, [(22, hexc('9cd0e8')), (15, hexc('d8ecf0')), (9, hexc('fff6d8'))])
    rays(im, 32, 30, hexc('ffffff'), count=12, width=0.05)
    c = Canvas()
    sword_up(c, 32, tip=22, guard=37, pommel=43)
    c.outline()
    b = Canvas()
    open_book(b, top=43)
    b.outline()
    stamp(im, c)
    stamp(im, b)
    title(im, 4)
    return im


def icon_hero() -> Image.Image:
    """The game's own hero, standing on a hill under a warm sky, the title above."""
    im = gradient([hexc(h) for h in ('3a2f6e', '6a4a8a', 'b0628a', 'e98a6a', 'f6b56c', 'ffd98a')])
    glow(im, 32, 40, [(22, hexc('f6b56c')), (15, hexc('ffe2a0')), (8, hexc('fff6d8'))])
    rays(im, 32, 40, hexc('fff0c8'), count=12, width=0.06)
    hill = Canvas()
    hill.paint(ellipse(32, 74, 44, 18), [hexc(h) for h in ('8fd06a', '5aa84a', '3f8a3c', '2a6430')], edge=False)
    stamp(im, hill)
    title(im, 4)
    # The hero is 64 native px tall, so this icon is the 64-grid scene doubled to 128 with the
    # hero pasted at native size (half the scale of the scene's pixels), never resampled.
    im = im.resize((N * 2, N * 2), Image.NEAREST)
    sheet = Image.open(ROOT / 'src' / 'assets' / 'hero' / 'hero.png').convert('RGBA')
    frame = sheet.crop((0, 0, 136, 102))  # idle_0: feet at (68, 101)
    hero = frame.crop(frame.getbbox())
    x, y = 64 - hero.width // 2, 116 - hero.height
    im.paste(hero, (x, y), hero)
    return im


ICONS = {'word': icon_word, 'shield': icon_shield, 'sword-book': icon_sword_book, 'hero': icon_hero}


INSTALLED = 'word'
IOS_ICON = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'AppIcon-512@2x.png'
ANDROID_RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
# Android adaptive layers are 108dp; launchers mask to as little as a 66dp circle. The 64px scene is
# drawn into the middle 58dp so the title and the book's corners survive a circle mask.
ADAPTIVE_PAD = 28  # (64 * 108 / 58 - 64) / 2, rounded


def sized(im: Image.Image, px: int) -> Image.Image:
    """Nearest-neighbour up to a large master, then a smooth resample to the target size."""
    master = im.resize((im.width * 8, im.height * 8), Image.NEAREST)
    return master.resize((px, px), Image.LANCZOS)


def install(square: Image.Image) -> None:
    from PIL import ImageDraw

    square.convert('RGB').save(IOS_ICON)  # App Store icon: 1024, no alpha
    bg, fg = word_layers(ADAPTIVE_PAD)
    for name, k in DENSITIES.items():
        d = ANDROID_RES / f'mipmap-{name}'
        legacy = sized(square, round(48 * k))
        legacy.convert('RGBA').save(d / 'ic_launcher.png')
        mask = Image.new('L', legacy.size, 0)
        ImageDraw.Draw(mask).ellipse((0, 0, legacy.width - 1, legacy.height - 1), fill=255)
        round_icon = Image.new('RGBA', legacy.size, (0, 0, 0, 0))
        round_icon.paste(legacy, (0, 0), mask)
        round_icon.save(d / 'ic_launcher_round.png')
        sized(bg, round(108 * k)).convert('RGBA').save(d / 'ic_launcher_background.png')
        sized(fg, round(108 * k)).save(d / 'ic_launcher_foreground.png')
    print('installed', INSTALLED, 'into', IOS_ICON.relative_to(ROOT), 'and', ANDROID_RES.relative_to(ROOT))


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--install', action='store_true', help=f'write {INSTALLED!r} into the native projects')
    args = parser.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tiles = []
    for name, paint in ICONS.items():
        im = paint().convert('RGB')
        im = im.resize((N * SCALE, N * SCALE), Image.NEAREST)
        im.save(OUT_DIR / f'{name}.png')
        tiles.append(im)
    # contact sheet: each icon with rounded-corner mask (as iOS shows it) at 256px
    gap = 32
    t = 256
    sheet = Image.new('RGB', (len(tiles) * (t + gap) + gap, t + 2 * gap), hexc('20222a'))
    mask = Image.new('L', (t, t), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, t - 1, t - 1), radius=int(t * 0.2237), fill=255)
    for i, im in enumerate(tiles):
        sheet.paste(im.resize((t, t), Image.NEAREST), (gap + i * (t + gap), gap), mask)
    sheet.save(OUT_DIR / 'candidates.png')
    print('wrote', ', '.join(f'{n}.png' for n in ICONS), 'and candidates.png in', OUT_DIR.relative_to(ROOT))
    if args.install:
        install(ICONS[INSTALLED]())


if __name__ == '__main__':
    main()
