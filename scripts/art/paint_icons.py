#!/usr/bin/env python3
"""
Paints the small battle icons (action buttons and the energy bolt) as pixel art. Original
designs, deterministic.

    python3 scripts/art/paint_icons.py            # writes src/assets/items/icons.png
    python3 scripts/art/paint_icons.py --preview  # also art/icons-preview.png (8x, on a dark field)

Same style as the armor items (paint_items.py): warm dark outline, three-tone shading lit from
the upper left. One S x S cell per icon, in ORDER (keep in sync with src/scenes/icons.ts). The
game shows them at whole-number scales. Needs Pillow.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paint_angel import Canvas, OUTLINE, ellipse, hexc, polygon, union  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'items' / 'icons.png'
PREVIEW = ROOT / 'art' / 'icons-preview.png'

S = 20
ORDER = ['attack', 'sword', 'shield', 'breastplate', 'sandals', 'ultimate', 'energy']

STEEL = [hexc(c) for c in ('ffffff', 'dfe6ee', 'a9b4c2', '6e7a8a')]
SPIRIT = [hexc(c) for c in ('ffffff', 'd4f1ff', '8fd0f5', '4a9bd6')]
GOLD = [hexc(c) for c in ('fff0a8', 'f4c95d', 'c9952e', '8a5e1a')]
LEATHER = [hexc(c) for c in ('d79b62', 'a86a3c', '7a4a26', '553118')]
BLUE = [hexc(c) for c in ('8fc3f2', '3b82d6', '275ea8', '1b3f75')]
RUBY = [hexc(c) for c in ('ffc2d6', 'e8517f', 'b22e5a', '7a1a3a')]
BOLT = [hexc(c) for c in ('fffbe0', 'ffd94a', 'f2a51e', 'c9780f')]
WING = [hexc(c) for c in ('ffffff', 'f8f4e8', 'ddd4bf', 'b4a587')]
SPARK = hexc('fff6c2')


class IconCanvas(Canvas):
    """Canvas sized to an icon cell."""

    def image(self) -> Image.Image:  # type: ignore[override]
        im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            if 0 <= x < S and 0 <= y < S:
                im.putpixel((x, y), (*c, 255))
        return im

    def outline(self) -> None:  # type: ignore[override]
        add = {}
        for (x, y) in self.px:
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n not in self.px and 0 <= n[0] < S and 0 <= n[1] < S:
                    add[n] = OUTLINE
        self.px.update(add)


def attack() -> Image.Image:
    """A plain steel sword held ready, point up and to the right."""
    c = IconCanvas()
    for i in range(10):  # blade, three pixels thick along the diagonal
        x, y = 8 + i, 11 - i
        c.dot([(x, y)], STEEL[1])
        c.dot([(x - 1, y)], STEEL[0])
        c.dot([(x, y + 1)], STEEL[2])
    c.dot([(17, 2), (17, 1), (18, 1)], STEEL[1])  # point
    c.dot([(18, 1)], STEEL[0])
    for i in range(7):  # guard, across the blade
        c.dot([(4 + i, 9 + i)], GOLD[1])
        c.dot([(5 + i, 9 + i)], GOLD[2])
    c.dot([(4, 9)], GOLD[0])
    for i in range(3):  # grip
        c.dot([(5 - i, 13 + i), (6 - i, 14 + i)], LEATHER[1])
        c.dot([(6 - i, 13 + i)], LEATHER[2])
    c.paint(ellipse(2.5, 17.5, 1.5, 1.5), GOLD, edge=False)  # pommel
    c.outline()
    return c.image()


def sword() -> Image.Image:
    """Sword of the Spirit: an upright blade of light, with sparks around it."""
    c = IconCanvas()
    cx = 10
    blade = polygon([(cx - 2, 4), (cx + 2, 4), (cx + 2, 13), (cx - 2, 13)]) | polygon([(cx - 2, 4), (cx + 2, 4), (cx, 1)])
    c.paint(blade, SPIRIT)
    c.dot([(cx - 1, y) for y in range(3, 13)], SPIRIT[0])
    c.dot([(cx, y) for y in range(2, 13)], SPIRIT[1])
    c.paint(polygon([(cx - 5, 13), (cx + 5, 13), (cx + 5, 15), (cx - 5, 15)]), GOLD, edge=False)
    c.dot([(cx - 5, 13), (cx - 4, 13)], GOLD[0])
    c.paint(polygon([(cx - 1, 15), (cx + 1, 15), (cx + 1, 17), (cx - 1, 17)]), LEATHER, edge=False)
    c.dot([(cx - 1, 17), (cx, 17), (cx - 1, 18), (cx, 18)], GOLD[1])
    c.outline()
    for sx, sy in ((3, 5), (16, 8)):  # sparks sit outside the outline
        c.dot([(sx, sy), (sx - 1, sy), (sx + 1, sy), (sx, sy - 1), (sx, sy + 1)], SPARK)
    c.dot([(15, 2), (4, 11)], SPARK)
    return c.image()


def shield() -> Image.Image:
    c = IconCanvas()
    cx = 10
    body = polygon([(cx - 8, 2), (cx + 8, 2), (cx + 8, 9), (cx, 19), (cx - 8, 9)])
    inner = polygon([(cx - 6, 4), (cx + 6, 4), (cx + 6, 9), (cx, 16), (cx - 6, 9)])
    c.paint(body, GOLD)
    c.paint(inner, BLUE)
    c.dot([(cx - 1, y) for y in range(5, 13)] + [(cx, y) for y in range(5, 13)], GOLD[1])  # cross
    c.dot([(x, 7) for x in range(cx - 4, cx + 4)] + [(x, 8) for x in range(cx - 4, cx + 4)], GOLD[1])
    c.dot([(cx - 1, 5), (cx - 4, 7)], GOLD[0])
    c.outline()
    return c.image()


def breastplate() -> Image.Image:
    c = IconCanvas()
    cx = 10
    plate = polygon([(cx - 8, 4), (cx - 4, 2), (cx + 4, 2), (cx + 8, 4), (cx + 7, 12), (cx + 4, 18), (cx - 4, 18), (cx - 7, 12)])
    plate -= ellipse(cx, 1.5, 3, 2)
    c.paint(plate, STEEL)
    c.paint({p for p in plate if p[1] >= 16}, GOLD, edge=False)
    heart = union(ellipse(cx - 2.5, 8.5, 2.5, 2.5), ellipse(cx + 2.5, 8.5, 2.5, 2.5), polygon([(cx - 5, 9), (cx + 5, 9), (cx, 15)]))
    heart -= {(cx - 1, 6), (cx, 6), (cx - 1, 7), (cx, 7)}  # the notch between the lobes
    c.paint(heart, RUBY, edge=False)
    c.dot([(cx - 4, 8), (cx - 3, 7)], RUBY[0])
    c.outline()
    return c.image()


def sandals() -> Image.Image:
    """Sandals of Peace: one winged sandal seen from the side."""
    c = IconCanvas()
    sole = polygon([(2, 14), (16, 14), (18, 13), (18, 17), (2, 17)])
    c.paint(sole, LEATHER)
    for x in range(10, 17):  # toe strap arching over the foot
        t = (x - 13) / 3.5
        y = 13 - int(round(3 * (1 - t * t)))
        c.dot([(x, y), (x, y + 1)], LEATHER[1])
    c.dot([(3, y) for y in range(8, 14)] + [(4, y) for y in range(8, 14)], LEATHER[1])  # heel strap
    c.dot([(x, 8) for x in range(3, 9)] + [(x, 9) for x in range(3, 9)], LEATHER[0])  # ankle strap
    c.dot([(8, 8), (8, 9)], GOLD[1])
    wing = union(polygon([(2, 8), (9, 2), (9, 5), (6, 8)]), polygon([(2, 8), (7, 1), (5, 6)]))
    c.paint(wing, WING, edge=False)
    c.outline()
    return c.image()


def helmet() -> Image.Image:
    """Full Armor of God: the golden helmet with its plume."""
    c = IconCanvas()
    cx = 10
    dome = {p for p in ellipse(cx, 12, 7, 7) if p[1] <= 13}
    c.paint(dome, GOLD)
    cheek = polygon([(cx - 7, 12), (cx - 3, 12), (cx - 3, 18), (cx - 6, 18)]) | polygon([(cx + 3, 12), (cx + 7, 12), (cx + 6, 18), (cx + 3, 18)])
    c.paint(cheek, GOLD)
    c.paint(polygon([(cx - 7, 11), (cx + 7, 11), (cx + 7, 13), (cx - 7, 13)]), STEEL, edge=False)
    plume = union(ellipse(cx, 4, 2.5, 3.5), ellipse(cx + 3, 3.5, 2, 2.5), ellipse(cx - 3, 4, 2, 2.5))
    c.paint(plume, RUBY)
    c.dot([(cx - 4, 8), (cx - 3, 7)], GOLD[0])
    c.outline()
    return c.image()


def energy() -> Image.Image:
    c = IconCanvas()
    bolt = polygon([(8, 1), (15, 1), (11, 8), (16, 8), (6, 19), (8, 11), (3, 11)])
    c.paint(bolt, BOLT)
    c.outline()
    return c.image()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true')
    args = ap.parse_args()
    painters = {'attack': attack, 'sword': sword, 'shield': shield, 'breastplate': breastplate,
                'sandals': sandals, 'ultimate': helmet, 'energy': energy}
    sheet = Image.new('RGBA', (S * len(ORDER), S), (0, 0, 0, 0))
    for i, name in enumerate(ORDER):
        sheet.paste(painters[name](), (i * S, 0))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT, optimize=True)
    print(f'wrote {OUT.relative_to(ROOT)} ({sheet.width}x{sheet.height})')
    if args.preview:
        bg = Image.new('RGBA', sheet.size, (59, 51, 92, 255))
        bg.alpha_composite(sheet)
        bg.resize((sheet.width * 8, sheet.height * 8), Image.NEAREST).save(PREVIEW)
        print(f'wrote {PREVIEW.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
