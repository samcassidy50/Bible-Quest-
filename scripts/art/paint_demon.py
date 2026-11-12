#!/usr/bin/env python3
"""
Paints the crouching shadow demon foe as pixel art, pixel by pixel. Original character,
deterministic.

    python3 scripts/art/paint_demon.py            # writes src/assets/foes/demon.png
    python3 scripts/art/paint_demon.py --preview  # also art/foe-previews/demon.png (4x)

A hunched, horned brute of shadow and ember: near-black hide with dark-red form shading, a
furnace-bright face and chest cracks, one arm planted in the rubble and the other reaching for
the hero. It faces LEFT (foes stand on the right of the battlefield).

How it is built: every body part is a set of round primitives (tapered capsules and ellipsoids)
with real surface normals, lit from the upper left and quantised to a small colour ramp with a
checker dither, so the forms read as volumes rather than flat shapes. Parts are painted back to
front; glow, outline and embers go on last.

This file is the shared engine plus the demon's poses; paint_monsters.py lays out every foe's
sheet (rows: idle, attack, hurt, defeat). Each cell is W x H with the ground contact centred at
(ORIGIN_X, ORIGIN_Y). Needs Pillow.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'foes' / 'demon.png'

W, H = 120, 96
ORIGIN_X, ORIGIN_Y = 66, 90
GROUND = ORIGIN_Y
FRAMES = 4
BREATH = [0.0, 1.0, 2.0, 1.0]  # how far the chest sinks per frame, native px
GLOW = [0.0, 0.5, 1.0, 0.5]  # ember pulse per frame

Color = tuple[int, int, int]
Px = tuple[int, int]


def hexc(s: str) -> Color:
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def ramp(*cs: str) -> list[Color]:
    return [hexc(c) for c in cs]


OUTLINE = hexc('07050a')
# Dark to light. Hide: black through dried-blood red to a hot rust on the lit planes.
HIDE = ramp('0c080d', '150b11', '220e14', '381217', '551a1b', '7a2a21', 'a2452a')
HIDE_FAR = ramp('0a070c', '120a10', '1d0d13', '2c1016', '3d1418')
HORN = ramp('110c10', '241b20', '3f3338', '655a5c', '928786', 'bfb5ae')
CLAW = ramp('140e12', '2c2226', '554a4a', '857a76', 'b5aaa0')
ROCK = ramp('0c0a0f', '17141b', '252129', '37323b', '4d4750')
EMBER = ramp('7c1010', 'c2200f', 'f04a12', 'ff8a1f', 'ffc64a', 'fff0a6')

LIGHT = (-0.52, -0.66, 0.54)
_len = math.sqrt(sum(v * v for v in LIGHT))
LIGHT = tuple(v / _len for v in LIGHT)

# A primitive: ('cap', x1, y1, r1, x2, y2, r2) or ('ell', cx, cy, rx, ry).
Prim = tuple


def limb(*pts: tuple[float, float, float]) -> list[Prim]:
    """A chain of tapered capsules through (x, y, radius) points."""
    return [('cap', *a, *b) for a, b in zip(pts, pts[1:])]


def raster(prims: list[Prim]) -> dict[Px, tuple[float, float, float]]:
    """Pixel -> surface normal of the highest primitive covering it."""
    best: dict[Px, tuple[float, tuple[float, float, float]]] = {}
    for p in prims:
        if p[0] == 'cap':
            _, x1, y1, r1, x2, y2, r2 = p
            rm = max(r1, r2)
            x0, xe = int(min(x1, x2) - rm) - 1, int(max(x1, x2) + rm) + 2
            y0, ye = int(min(y1, y2) - rm) - 1, int(max(y1, y2) + rm) + 2
            dx, dy = x2 - x1, y2 - y1
            ll = dx * dx + dy * dy or 1e-9
            for y in range(y0, ye):
                for x in range(x0, xe):
                    px, py = x + 0.5, y + 0.5
                    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / ll))
                    r = r1 + t * (r2 - r1)
                    ox, oy = px - (x1 + t * dx), py - (y1 + t * dy)
                    d2 = ox * ox + oy * oy
                    if d2 > r * r:
                        continue
                    nz = math.sqrt(max(0.0, 1 - d2 / (r * r)))
                    h = r * nz
                    if (x, y) not in best or h > best[(x, y)][0]:
                        best[(x, y)] = (h, (ox / r, oy / r, nz))
        else:
            _, cx, cy, rx, ry = p
            for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
                for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                    u, v = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                    q = u * u + v * v
                    if q > 1:
                        continue
                    nz = math.sqrt(1 - q)
                    h = min(rx, ry) * nz
                    if (x, y) not in best or h > best[(x, y)][0]:
                        best[(x, y)] = (h, (u, v, nz))
    return {k: v[1] for k, v in best.items()}


def noise(x: int, y: int, salt: int = 0) -> float:
    """Deterministic 0..1 hash, for hide grain and scattered dust."""
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


class Canvas:
    def __init__(self) -> None:
        self.px: dict[Px, Color] = {}

    def part(
        self,
        prims: list[Prim],
        tones: list[Color],
        gain: float = 1.0,
        grain: float = 0.3,
        ambient: float = 0.1,
        power: float = 1.0,
    ) -> set[Px]:
        """Lights a part and paints it over what is there, with a dark seam where it overlaps."""
        normals = raster(prims)
        n = len(tones) - 1
        for (x, y), (nx, ny, nz) in normals.items():
            lit = max(0.0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2])
            t = (ambient + lit**power * (1 - ambient)) * gain * n
            t += (noise(x, y) - 0.5) * grain * 2
            i = int(math.floor(t))
            f = t - i
            if f > 0.68 or (f > 0.36 and (x + y) % 2 == 0):
                i += 1
            c = tones[max(0, min(n, i))]
            # Seam: where this part's edge sits on top of an earlier part, keep a dark line.
            edge_over = any(
                q not in normals and q in self.px
                for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
            )
            self.px[(x, y)] = tones[0] if edge_over else c
        return set(normals)

    def dot(self, pts, c: Color) -> None:
        for p in pts:
            self.px[(int(p[0]), int(p[1]))] = c

    def outline(self) -> None:
        add = {}
        for (x, y) in self.px:
            for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if q not in self.px:
                    add[q] = OUTLINE
        self.px.update(add)

    def image(self) -> Image.Image:
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            if 0 <= x < W and 0 <= y < H:
                im.putpixel((x, y), (*c, 255))
        return im


def hide(c: Canvas, prims: list[Prim], gain: float = 1.0, far: bool = False) -> set[Px]:
    """Demon hide: mostly black, with red only where the light lands squarely."""
    if far:
        return c.part(prims, HIDE_FAR, gain=gain, ambient=0.05, power=1.6)
    return c.part(prims, HIDE, gain=gain * 1.12, ambient=0.03, power=2.3)


def line(a: tuple[float, float], b: tuple[float, float]) -> list[Px]:
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) or 1
    return [
        (int(round(a[0] + (b[0] - a[0]) * i / n)), int(round(a[1] + (b[1] - a[1]) * i / n)))
        for i in range(n + 1)
    ]


def polyline(pts: list[tuple[float, float]]) -> list[Px]:
    out: list[Px] = []
    for a, b in zip(pts, pts[1:]):
        out += line(a, b)
    return out


def paint_frame(
    f: int, swipe: tuple[float, float] = (0, 0), hand_rot: float = 0, shut: bool = False
) -> Image.Image:
    """One cell. `swipe` moves the reaching hand, `hand_rot` turns it, `shut` closes the eyes."""
    c = Canvas()
    b = BREATH[f]  # chest sinks on the out-breath
    hb = b * 0.5  # hips and planted limbs move half as much
    glow = GLOW[f]

    # ---- Far (background) limbs: the arm planted in the rubble behind, and the far leg. ----
    hide(c, limb((80, 36 + b, 7.5), (95, 49 + hb, 6), (98, 66, 4.8), (96, 79, 5.5)), far=True)
    hide(c, [('ell', 96, 83, 6.5, 5)], far=True)  # fist on the ground
    hide(c, limb((77, 61 + hb, 7.5), (85, 71, 6), (82, 82, 4.5)), far=True)
    hide(c, limb((83, 85, 4), (74, 87, 3.2)), far=True)

    # ---- Back spines (behind the hump). ----
    for (bx, by), (tx, ty), r in (
        ((70, 26), (73, 11), 3.4),
        ((77, 28), (86, 15), 3.2),
        ((83, 34), (95, 26), 3.0),
        ((85, 43), (96, 40), 2.6),
    ):
        c.part(limb((bx, by + b, r), (tx, ty + b, 0.5)), HORN, gain=0.95, grain=0.15)

    # ---- Torso: pelvis rising forward into a heavy chest and a humped back. ----
    hide(
        c,
        limb((76, 59 + hb, 8), (70, 51 + b, 8.5), (63, 42 + b, 12.5))
        + [('ell', 73, 35 + b, 13, 11.5)],
        gain=0.9,
    )
    # Chest slab and stacked belly plates.
    hide(c, [('ell', 58, 43 + b, 8.5, 7.5)], gain=0.95)
    for k in range(3):
        hide(c, [('ell', 63 + k * 2.6, 52.5 + b + k * 3.6 - (b - hb) * k / 2, 4.6 - k * 0.4, 2.6)], gain=0.8)

    # ---- Near leg: crouched, clawed foot forward. ----
    hide(c, limb((69, 60 + hb, 8.5), (57, 69 + hb * 0.5, 6.5), (63, 81, 4.6)))
    hide(c, limb((64, 85, 4.2), (53, 87, 3.2)))
    for i, tx in enumerate((48, 51, 55)):
        c.part(limb((tx + 3, 87 - i * 0.3, 1.7), (tx - 1, 89, 0.5)), CLAW, grain=0.1)

    # ---- Head: low between the shoulders, heavy jaw, two swept horns. ----
    hx, hy = 45.0, 40.0 + b
    far_horn = limb(
        (hx - 4, hy - 6, 3.2), (hx - 9, hy - 13, 2.6), (hx - 9, hy - 20, 1.8), (hx - 5, hy - 26, 0.5)
    )
    c.part(far_horn, HORN, gain=0.75, grain=0.15)
    hide(c, [('ell', hx, hy, 10, 9)] + limb((hx - 1, hy + 4, 5.5), (hx - 8, hy + 7, 3.8)))
    near_horn = limb(
        (hx + 4, hy - 6, 3.8), (hx + 9, hy - 14, 3.2), (hx + 8, hy - 22, 2.2), (hx + 2, hy - 29, 0.5)
    )
    c.part(near_horn, HORN, gain=1.05, grain=0.15)
    # Ridges ringing the near horn.
    for k, (rx, ry) in enumerate(((hx + 6, hy - 10), (hx + 9, hy - 16), (hx + 8, hy - 21))):
        for dx in range(-3, 4):
            p = (int(rx + dx), int(ry + (dx + k) // 3))
            if c.px.get(p) in HORN[2:]:
                c.px[p] = HORN[1]
    # Brow ridge: a dark shelf that makes the eyes glare.
    c.dot(polyline([(hx - 8, hy - 2), (hx - 4, hy - 1), (hx - 1, hy - 3), (hx + 5, hy - 4)]), HIDE[0])

    # ---- Near shoulder and the reaching arm, in front of everything. ----
    sx, sy = 62.0, 37.0 + b
    hide(c, [('ell', sx + 2, sy - 2, 10, 9.5)], gain=1.08)
    # Shoulder spikes.
    for (bx, by), (tx, ty), r in (((sx + 1, sy - 9), (sx - 3, sy - 21), 2.8), ((sx + 7, sy - 8), (sx + 9, sy - 18), 2.4)):
        c.part(limb((bx, by, r), (tx, ty, 0.5)), HORN, grain=0.15)
    reach = hb * 0.6
    ex, ey = 51.0, 57.0 + b * 0.8
    wx, wy = 33.0 + swipe[0], 61.0 + reach + swipe[1]
    hide(c, limb((sx, sy + 2, 8), (ex, ey, 6.2), (wx, wy, 4.6)), gain=1.05)
    # Open hand and splayed talons.
    kx, ky = wx - 5, wy + 0.5
    fingers = ((-128, 9, 10, -40), (-158, 10, 11, -28), (176, 11, 11, 22), (148, 10, 10, 40), (118, 7, 8, 55))
    for ang, l1, l2, bend in fingers:
        a1 = math.radians(ang + hand_rot)
        a2 = math.radians(ang + hand_rot + bend)
        mx, my = kx + math.cos(a1) * l1, ky + math.sin(a1) * l1
        tx, ty = mx + math.cos(a2) * l2, my + math.sin(a2) * l2
        hide(c, limb((kx + math.cos(a1) * 3, ky + math.sin(a1) * 3, 2.4), (mx, my, 2.0)), gain=1.1)
        c.part(limb((mx, my, 1.8), (tx, ty, 0.45)), CLAW, gain=1.1, grain=0.1)
    hide(c, [('ell', kx, ky, 5.5, 5.2)], gain=1.1)

    # ---- Rubble the demon is breaking out of. ----
    for rx, ry, rw, rh in (
        (44, 88, 5, 3), (59, 89, 6, 3.2), (70, 88, 5, 3.6), (78, 89, 6, 3), (97, 87, 5.5, 4),
        (102, 89, 4, 2.4), (86, 89, 4, 2.6), (38, 89.5, 3.5, 2),
    ):
        c.part([('ell', rx, ry, rw, rh)], ROCK, gain=1.1, grain=0.45)

    body = set(c.px)

    # ---- Fire inside: eyes, jagged maw, cracks down the chest. ----
    hot = EMBER[3 + round(glow)]  # core colour pulses
    eyes = [(hx - 7, hy), (hx - 6, hy), (hx - 5, hy + 1)] + [
        (hx - 1, hy + 1), (hx, hy), (hx + 1, hy), (hx + 2, hy - 1), (hx + 3, hy - 1)
    ]
    maw = polyline(
        [(hx - 9, hy + 6), (hx - 7, hy + 5), (hx - 5, hy + 7), (hx - 3, hy + 5), (hx - 1, hy + 7),
         (hx + 1, hy + 5), (hx + 3, hy + 6)]
    )
    maw_low = [(x, y + 1) for (x, y) in maw if (x + y) % 2 == 0]
    cracks = (
        polyline([(55, 45 + b), (58, 49 + b), (56, 53 + b), (60, 57 + b), (59, 62 + hb)])
        + polyline([(59, 49 + b), (62, 47 + b)])
        + polyline([(61, 58 + b), (65, 60 + hb)])
    )
    glow_px = [(int(x), int(y)) for (x, y) in eyes + maw + maw_low + cracks]
    # Heat spilling onto the hide around the fire.
    for (x, y) in glow_px:
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                q = (x + dx, y + dy)
                d = abs(dx) + abs(dy)
                if q in body and c.px[q] in HIDE and d <= 2 + (glow > 0.6):
                    want = HIDE[5] if d <= 1 else HIDE[4]
                    if HIDE.index(c.px[q]) < HIDE.index(want) and (d <= 1 or (q[0] + q[1]) % 2 == 0):
                        c.px[q] = want
    c.dot([p for p in cracks], EMBER[1])
    c.dot([p for i, p in enumerate(cracks) if i % 3 == f % 3], EMBER[2 + round(glow)])
    c.dot(maw_low, EMBER[1])
    c.dot(maw, EMBER[2])
    c.dot([p for i, p in enumerate(maw) if i % 2 == 0], hot)
    c.dot(eyes, hot)
    c.dot([eyes[1], eyes[4], eyes[5]], EMBER[5])
    if shut:
        c.dot(eyes, HIDE[0])

    c.outline()

    # ---- Loose dust and rising embers (outside the outline, like grit in the air). ----
    for i in range(46):
        x = int(34 + noise(i, 7, 3) * 72)
        y = int(GROUND - 1 - noise(i, 11, 5) ** 2 * 9)
        if (x, y) not in c.px and (x + y + i) % 2 == 0:
            c.px[(x, y)] = ROCK[1 + i % 3]
    for i in range(7):
        x0 = 40 + noise(i, 3, 9) * 56
        rise = (noise(i, 5, 9) * 40 + f * 5 + i * 9) % 40
        x = int(x0 + math.sin(rise * 0.3 + i) * 2)
        y = int(GROUND - 6 - rise)
        if (x, y) not in c.px:
            c.px[(x, y)] = EMBER[4] if rise < 12 else EMBER[2] if rise < 26 else EMBER[0]
    return c.image()


def main() -> None:
    # The sheet (idle, attack, hurt, defeat rows) is assembled by paint_monsters.py.
    import sys

    import paint_monsters

    sys.argv.insert(1, 'demon')
    paint_monsters.main()


if __name__ == '__main__':
    main()
