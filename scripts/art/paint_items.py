#!/usr/bin/env python3
"""
Paints the armor items as pixel art, pixel by pixel. Original designs, deterministic.

    python3 scripts/art/paint_items.py            # writes src/assets/items/items.png
    python3 scripts/art/paint_items.py --preview  # also art/items-preview.png (4x, on a dark field)

Same style as the hero and the angel: warm dark outline, three-tone shading lit from the upper
left. One W x H cell per item, in ORDER, each centred in its cell. The game shows them at 3x.
Needs Pillow.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pixel_kit import Canvas, OUTLINE, ellipse, hexc, polygon, union  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'items' / 'items.png'
PREVIEW = ROOT / 'art' / 'items-preview.png'

W, H = 40, 44
ORDER = ['sword', 'shield', 'breastplate', 'sandals', 'ultimate']

STEEL = [hexc(c) for c in ('ffffff', 'dfe6ee', 'a9b4c2', '6e7a8a')]
GOLD = [hexc(c) for c in ('fff0a8', 'f4c95d', 'c9952e', '8a5e1a')]
LEATHER = [hexc(c) for c in ('d79b62', 'a86a3c', '7a4a26', '553118')]
BLUE = [hexc(c) for c in ('8fc3f2', '3b82d6', '275ea8', '1b3f75')]
RUBY = [hexc(c) for c in ('ffc2d6', 'e8517f', 'b22e5a', '7a1a3a')]


class ItemCanvas(Canvas):
    """Canvas sized to an item cell."""

    def image(self) -> Image.Image:  # type: ignore[override]
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            if 0 <= x < W and 0 <= y < H:
                im.putpixel((x, y), (*c, 255))
        return im

    def outline(self) -> None:  # type: ignore[override]
        add = {}
        for (x, y) in self.px:
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n not in self.px and 0 <= n[0] < W and 0 <= n[1] < H:
                    add[n] = OUTLINE
        self.px.update(add)


def sword() -> Image.Image:
    c = ItemCanvas()
    cx = 20
    blade = polygon([(cx - 3, 4), (cx + 3, 4), (cx + 3, 28), (cx - 3, 28)]) | polygon([(cx - 3, 5), (cx + 3, 5), (cx, 1)])
    c.paint(blade, STEEL)
    c.dot([(cx, y) for y in range(5, 27)], STEEL[0])  # fuller shine
    c.dot([(cx + 1, y) for y in range(6, 27)], STEEL[2])
    guard = polygon([(cx - 9, 28), (cx + 9, 28), (cx + 9, 31), (cx - 9, 31)]) | ellipse(cx - 9, 29.5, 2, 2) | ellipse(cx + 9, 29.5, 2, 2)
    c.paint(guard, GOLD)
    grip = polygon([(cx - 2, 31), (cx + 2, 31), (cx + 2, 38), (cx - 2, 38)])
    c.paint(grip, LEATHER)
    c.dot([(cx - 1, 33), (cx + 1, 35), (cx - 1, 37)], LEATHER[3])
    c.paint(ellipse(cx, 40, 3, 3), GOLD)
    c.outline()
    return c.image()


def shield() -> Image.Image:
    c = ItemCanvas()
    cx = 20
    body = polygon([(cx - 14, 6), (cx + 14, 6), (cx + 14, 20), (cx, 40), (cx - 14, 20)]) | ellipse(cx, 8, 14, 5)
    rim = body
    inner = polygon([(cx - 11, 9), (cx + 11, 9), (cx + 11, 20), (cx, 36), (cx - 11, 20)])
    c.paint(rim, GOLD)
    c.paint(inner, BLUE)
    # Emblem: a small golden sunburst.
    sun = ellipse(cx, 19, 4.5, 4.5)
    c.paint(sun, GOLD)
    for dx, dy in ((0, -7), (0, 7), (-7, 0), (7, 0), (-5, -5), (5, -5), (-5, 5), (5, 5)):
        c.dot([(cx + dx, 19 + dy)], GOLD[1])
    c.dot([(cx - 9, 11), (cx - 9, 12), (cx - 8, 11)], BLUE[0])  # shine
    c.outline()
    return c.image()


def breastplate() -> Image.Image:
    c = ItemCanvas()
    cx = 20
    plate = polygon([(cx - 13, 8), (cx - 6, 5), (cx + 6, 5), (cx + 13, 8), (cx + 12, 26), (cx + 6, 36), (cx - 6, 36), (cx - 12, 26)])
    c.paint(plate, STEEL)
    neck = ellipse(cx, 5, 6, 3)
    for p in neck:
        c.px.pop(p, None)
    # Gold trim along the neck and hem, and a centre ridge.
    trim = {(x, y) for (x, y) in plate if y in (6, 7) or y >= 34}
    c.paint(trim, GOLD, edge=False)
    c.dot([(cx, y) for y in range(9, 33)], STEEL[2])
    c.dot([(cx - 1, y) for y in range(9, 33)], STEEL[0])
    # Heart-shaped ruby at the centre.
    heart = union(ellipse(cx - 2.5, 19, 3, 3), ellipse(cx + 2.5, 19, 3, 3), polygon([(cx - 5, 20), (cx + 5, 20), (cx, 26)]))
    c.paint(heart, RUBY)
    c.outline()
    return c.image()


def sandals() -> Image.Image:
    """A pair of sandals seen from the side: a flat sole with a slightly raised toe, a strap
    arching over the foot, and laces climbing the ankle with a gold buckle."""
    c = ItemCanvas()
    for ox, oy in ((-2, -9), (2, 7)):
        x0, base = 6 + ox, 28 + oy
        # Sole: two tones, toe lifted.
        sole = polygon([(x0, base), (x0 + 27, base), (x0 + 29, base - 2), (x0 + 29, base + 3), (x0, base + 3)])
        c.paint(sole, LEATHER)
        c.dot([(x, base + 3) for x in range(x0, x0 + 29)], LEATHER[3])
        # Toe strap: an arch over the front of the foot.
        for x in range(x0 + 15, x0 + 25):
            t = (x - (x0 + 20)) / 5
            y = base - int(round(5 * (1 - t * t)))
            c.dot([(x, y), (x, y - 1)], LEATHER[1])
        # Ankle laces: criss-cross straps rising from the heel, and a heel loop.
        for k in range(3):
            y = base - 2 - k * 3
            c.dot([(x0 + 3 + d, y - d // 2) for d in range(8)], LEATHER[2])
            c.dot([(x0 + 3 + d, y - 3 + d // 2) for d in range(8)], LEATHER[2])
        c.dot([(x0 + 2, y) for y in range(base - 11, base)], LEATHER[1])
        c.dot([(x0 + 11, base - 9), (x0 + 11, base - 10)], GOLD[1])
    c.outline()
    return c.image()


def helmet() -> Image.Image:
    c = ItemCanvas()
    cx = 20
    dome = ellipse(cx, 22, 13, 13)
    dome = {p for p in dome if p[1] <= 30}
    c.paint(dome, GOLD)
    cheek = polygon([(cx - 13, 22), (cx - 6, 22), (cx - 6, 34), (cx - 11, 34)]) | polygon([(cx + 6, 22), (cx + 13, 22), (cx + 11, 34), (cx + 6, 34)])
    c.paint(cheek, GOLD)
    brow = polygon([(cx - 13, 21), (cx + 13, 21), (cx + 13, 24), (cx - 13, 24)])
    c.paint(brow, STEEL, edge=False)
    plume = union(ellipse(cx, 8, 4, 6), ellipse(cx + 4, 6, 3.5, 4.5), ellipse(cx - 4, 7, 3.5, 4.5))
    c.paint(plume, RUBY)
    c.dot([(cx - 6, 14), (cx - 5, 13), (cx - 7, 15)], GOLD[0])
    c.outline()
    return c.image()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true')
    args = ap.parse_args()
    painters = {'sword': sword, 'shield': shield, 'breastplate': breastplate, 'sandals': sandals, 'ultimate': helmet}
    sheet = Image.new('RGBA', (W * len(ORDER), H), (0, 0, 0, 0))
    for i, name in enumerate(ORDER):
        sheet.paste(painters[name](), (i * W, 0))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT, optimize=True)
    print(f'wrote {OUT.relative_to(ROOT)} ({sheet.width}x{sheet.height})')
    if args.preview:
        bg = Image.new('RGBA', sheet.size, (59, 51, 92, 255))
        bg.alpha_composite(sheet)
        bg.resize((sheet.width * 6, sheet.height * 6), Image.NEAREST).save(PREVIEW)
        print(f'wrote {PREVIEW.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
