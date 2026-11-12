#!/usr/bin/env python3
"""
Paints the armor-giving angel as pixel art, pixel by pixel. Original character, deterministic.

    python3 scripts/art/paint_angel.py            # writes src/assets/angel/angel.png
    python3 scripts/art/paint_angel.py --preview  # also art/angel-preview.png (4x, on a dark field)

Matches the hero's style (src/assets/hero/hero.png): chibi proportions, warm dark-brown outline,
three-tone shading lit from the upper left, small palette. Native size; the game shows it at 3x
like the hero. The sheet is FRAMES cells side by side (a gentle wing-flap loop). Each cell is
W x H with the robe hem centred at (ORIGIN_X, ORIGIN_Y); the hands meet at HANDS.
Needs Pillow.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'angel' / 'angel.png'
PREVIEW = ROOT / 'art' / 'angel-preview.png'

W, H = 112, 100
ORIGIN_X, ORIGIN_Y = 56, 98
HANDS = (56, 76)
FRAMES = 4
FLAP = [0, 2, 4, 2]  # wing lift per frame, native px

Color = tuple[int, int, int]


def hexc(s: str) -> Color:
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


OUTLINE = hexc('3b2414')
# Each material: highlight, base, shadow, inner edge (selective outline).
SKIN = [hexc(c) for c in ('fde6c8', 'f6c99a', 'dfa274', 'b5764c')]
HAIR = [hexc(c) for c in ('fbe9a6', 'efc95c', 'c99a3a', '9a6a28')]
ROBE = [hexc(c) for c in ('ffffff', 'f1ece0', 'd5cbb7', 'a8987e')]
GOLD = [hexc(c) for c in ('fff0a8', 'f4c95d', 'c9952e', '8a5e1a')]
WING = [hexc(c) for c in ('ffffff', 'f8f4e8', 'ddd4bf', 'b4a587')]
WING_TIP = hexc('ecd59a')
BLUSH = hexc('f2a3a0')

Mask = set[tuple[int, int]]


def ellipse(cx: float, cy: float, rx: float, ry: float) -> Mask:
    out: Mask = set()
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                out.add((x, y))
    return out


def polygon(pts: list[tuple[float, float]]) -> Mask:
    out: Mask = set()
    ys = [p[1] for p in pts]
    for y in range(int(min(ys)), int(max(ys)) + 1):
        yc = y + 0.5
        xs = []
        for i in range(len(pts)):
            (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % len(pts)]
            if (y1 <= yc < y2) or (y2 <= yc < y1):
                xs.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for a, b in zip(xs[::2], xs[1::2]):
            for x in range(int(round(a)), int(round(b))):
                out.add((x, y))
    return out


def union(*ms: Mask) -> Mask:
    out: Mask = set()
    for m in ms:
        out |= m
    return out


class Canvas:
    def __init__(self) -> None:
        self.px: dict[tuple[int, int], Color] = {}

    def paint(self, mask: Mask, tones: list[Color], edge: bool = True) -> None:
        """Three-tone shading lit from the upper left, plus a darker inner edge (selout)."""
        hi, base, sh, dark = tones
        for x, y in mask:
            if not (0 <= x < W and 0 <= y < H):
                continue
            c = base
            if (x + 1, y + 1) not in mask or (x + 2, y + 1) not in mask or (x + 1, y + 2) not in mask:
                c = sh
            if (x - 1, y - 1) not in mask or (x - 1, y) not in mask and (x, y - 1) not in mask:
                c = hi
            if edge and any(n not in mask for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))):
                c = dark if c != hi else sh
            self.px[(x, y)] = c

    def dot(self, pts: list[tuple[int, int]], c: Color) -> None:
        for p in pts:
            self.px[p] = c

    def outline(self) -> None:
        """1px warm dark outline around the whole silhouette."""
        add = {}
        for (x, y) in self.px:
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n not in self.px and 0 <= n[0] < W and 0 <= n[1] < H:
                    add[n] = OUTLINE
        self.px.update(add)

    def image(self) -> Image.Image:
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            if 0 <= x < W and 0 <= y < H:
                im.putpixel((x, y), (*c, 255))
        return im


def wing(side: int, lift: int) -> tuple[Mask, list[tuple[int, int]]]:
    """A feathered wing behind the shoulder: a rounded fan plus hanging primary feathers.
    Returns the wing mask and the pixels of feather lines to draw inside it."""
    sx = ORIGIN_X + side * 9
    sy = 62
    parts = [
        ellipse(sx + side * 10, sy - 4 - lift * 0.5, 13, 9),
        ellipse(sx + side * 21, sy - 13 - lift, 11, 9),
        ellipse(sx + side * 28, sy - 22 - lift * 1.4, 8, 7),
    ]
    # Primary feathers hanging from the lower edge.
    for k in range(5):
        fx = sx + side * (6 + k * 6)
        fy = sy + 5 - k * 3 - lift * (0.4 + k * 0.2)
        parts.append(ellipse(fx, fy, 3.2, 6.5))
    mask = union(*parts)
    lines: list[tuple[int, int]] = []
    # Gaps between the hanging primary feathers.
    for k in range(4):
        gx = sx + side * (9 + k * 6)
        for gy in range(int(sy + 2 - k * 3 - lift * (0.4 + k * 0.2)), int(sy + 10 - k * 3 - lift * (0.4 + k * 0.2))):
            if (gx, gy) in mask:
                lines.append((gx, gy))
    # Feather row lines: arcs across the wing.
    for r, (ox, oy, rad) in enumerate([(10, -2, 9), (19, -10, 8), (26, -18, 6)]):
        cx, cy = sx + side * ox, sy + oy - lift * (0.5 + r * 0.45)
        for a in range(0, 180, 12):
            t = math.radians(a)
            p = (int(round(cx + side * math.cos(t) * rad * 0.9)), int(round(cy + math.sin(t) * rad * 0.55)))
            if p in mask:
                lines.append(p)
    return mask, lines


def paint_frame(f: int) -> Image.Image:
    c = Canvas()
    lift = FLAP[f]

    # Wings (behind everything).
    for side in (-1, 1):
        m, lines = wing(side, lift)
        c.paint(m, WING)
        c.dot(lines, WING[2])
        tips = [(x, y) for (x, y) in m if (x, y + 1) not in m and (x, y + 2) not in m]
        c.dot(tips, WING_TIP)

    # Robe: a soft bell from shoulders to hem, with gold sash and hem trim.
    robe = polygon([(ORIGIN_X - 11, 62), (ORIGIN_X + 11, 62), (ORIGIN_X + 17, 97), (ORIGIN_X - 17, 97)])
    robe |= ellipse(ORIGIN_X, 63, 12, 4)
    c.paint(robe, ROBE)
    sash = {(x, y) for (x, y) in robe if 77 <= y <= 78}
    hem = {(x, y) for (x, y) in robe if 95 <= y <= 97}
    c.paint(sash, GOLD, edge=False)
    c.paint(hem, GOLD, edge=False)
    # Gold collar.
    collar = {(x, y) for (x, y) in ellipse(ORIGIN_X, 62, 7, 3) if y >= 62}
    c.paint(collar, GOLD, edge=False)
    # A few fold lines.
    c.dot([(ORIGIN_X - 5, y) for y in range(82, 94)] + [(ORIGIN_X + 6, y) for y in range(81, 94)], ROBE[2])

    # Sleeves and hands held forward together to present the gift.
    for side in (-1, 1):
        sleeve = union(ellipse(ORIGIN_X + side * 9, 68, 5, 6), ellipse(ORIGIN_X + side * 5, 73, 5, 4))
        c.paint(sleeve, ROBE)
    hands = union(ellipse(HANDS[0] - 3, HANDS[1], 3.2, 3), ellipse(HANDS[0] + 3, HANDS[1], 3.2, 3))
    c.paint(hands, SKIN)

    # Head: a big chibi head with golden wavy hair and a gentle smile.
    hair_back = union(ellipse(ORIGIN_X, 40, 17, 16), ellipse(ORIGIN_X - 14, 49, 6, 10), ellipse(ORIGIN_X + 14, 49, 6, 10))
    c.paint(hair_back, HAIR)
    face = ellipse(ORIGIN_X, 46, 13, 12)
    c.paint(face, SKIN)
    bangs = union(*(ellipse(ORIGIN_X - 12 + i * 5, 35 + (i % 2), 4.2, 4.5) for i in range(6)))
    bangs = {p for p in bangs if p[1] <= 39}
    c.paint(bangs, HAIR)
    # Strands: soft curved lines through the hair, and wavy ends on the side locks.
    for i, ox in enumerate((-11, -6, 0, 6, 11)):
        for t in range(6):
            x = ORIGIN_X + ox + int(round(math.sin(t * 0.9 + i) * 1.2))
            y = 27 + t * 2 + abs(ox) // 3
            if (x, y) in hair_back and (x, y) not in face:
                c.px[(x, y)] = HAIR[2]
    for side in (-1, 1):
        c.dot([(ORIGIN_X + side * 14, 57), (ORIGIN_X + side * 15, 58), (ORIGIN_X + side * 13, 58)], HAIR[2])
    # Curl highlights on top of the hair.
    c.dot([(ORIGIN_X - 6, 28), (ORIGIN_X - 5, 27), (ORIGIN_X - 4, 27), (ORIGIN_X + 4, 28), (ORIGIN_X + 5, 28)], HAIR[0])

    # Closed, smiling eyes (^ ^), small smile, rosy cheeks.
    for ex in (ORIGIN_X - 6, ORIGIN_X + 6):
        c.dot([(ex - 2, 46), (ex - 1, 45), (ex, 45), (ex + 1, 46)], OUTLINE)
    c.dot([(ORIGIN_X - 1, 51), (ORIGIN_X, 52), (ORIGIN_X + 1, 51)], SKIN[3])
    c.dot([(ORIGIN_X - 10, 49), (ORIGIN_X - 9, 49), (ORIGIN_X + 9, 49), (ORIGIN_X + 10, 49)], BLUSH)

    c.outline()

    # Halo floats above, with its own outline, after the silhouette outline so it stays separate.
    halo_ring = ellipse(ORIGIN_X, 18, 12, 3.6) - ellipse(ORIGIN_X, 18, 8.5, 1.8)
    for p in halo_ring:
        c.px[p] = GOLD[1]
    for (x, y) in list(halo_ring):
        if y < 18 and (x, y - 1) not in halo_ring:
            c.px[(x, y)] = GOLD[0]
        if y > 18 and (x, y + 1) not in halo_ring:
            c.px[(x, y)] = GOLD[2]
    for (x, y) in list(halo_ring):
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if n not in halo_ring and n not in c.px:
                c.px[n] = GOLD[3]
    return c.image()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true')
    args = ap.parse_args()
    sheet = Image.new('RGBA', (W * FRAMES, H), (0, 0, 0, 0))
    for f in range(FRAMES):
        sheet.paste(paint_frame(f), (f * W, 0))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT, optimize=True)
    colours = {c for c in sheet.getdata() if c[3] > 0}
    print(f'wrote {OUT.relative_to(ROOT)} ({sheet.width}x{sheet.height}, {len(colours)} colours)')
    if args.preview:
        bg = Image.new('RGBA', sheet.size, (59, 51, 92, 255))
        bg.alpha_composite(sheet)
        bg.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(PREVIEW)
        print(f'wrote {PREVIEW.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
