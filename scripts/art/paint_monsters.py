#!/usr/bin/env python3
"""
Paints three more foes as pixel art in the same style as the demon (paint_demon.py), reusing
its lit-primitive engine. Original characters, deterministic.

    python3 scripts/art/paint_monsters.py [name…]    # writes src/assets/foes/<name>.png
    python3 scripts/art/paint_monsters.py --preview  # also art/foe-previews/<name>.png (4x)

  demon       (poses in paint_demon.py)

  serpent     a rearing, hooded snake on its coils (temptation)
  shade       a hovering bat-winged imp of shadow (darkness)
  thornbeast  a four-legged bramble beast bristling with thorns (the cursed ground)

Each sheet is a grid of W x H cells, COLS wide, one row per state: idle (4), attack (4: wind-up,
strike, follow-through, recover), hurt (2), defeat (4: the foe crumbles to dust). Foes face LEFT
with the ground contact centred at (ORIGIN_X, ORIGIN_Y). Needs Pillow.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image

from paint_demon import paint_frame as demon_frame
from paint_demon import (
    CLAW,
    H,
    HORN,
    ORIGIN_Y,
    W,
    Canvas,
    Color,
    Px,
    limb,
    noise,
    polyline,
    ramp,
)

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'src' / 'assets' / 'foes'
PREVIEW_DIR = ROOT / 'art' / 'foe-previews'
GROUND = ORIGIN_Y
CYCLE = [0.0, 1.0, 2.0, 1.0]


def polygon(pts: list[tuple[float, float]]) -> set[Px]:
    out: set[Px] = set()
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


def skin(c: Canvas, prims, tones: list[Color], gain: float = 1.0, power: float = 1.9) -> set[Px]:
    """Dark, high-contrast hide like the demon's."""
    return c.part(prims, tones, gain=gain * 1.1, ambient=0.04, power=power)


def spike(c: Canvas, base: tuple[float, float], tip: tuple[float, float], r: float, tones=HORN, gain=1.0) -> None:
    c.part(limb((*base, r), (*tip, 0.45)), tones, gain=gain, grain=0.15)


def warm(c: Canvas, body: set[Px], glow_px: list[Px], tones: list[Color], reach: int = 2) -> None:
    """Light from glowing pixels spilling onto the hide around them."""
    top = len(tones) - 1
    for (x, y) in glow_px:
        for dx in range(-reach, reach + 1):
            for dy in range(-reach, reach + 1):
                q = (x + dx, y + dy)
                d = abs(dx) + abs(dy)
                if d > reach or q not in body or c.px.get(q) not in tones:
                    continue
                want = top - 1 if d <= 1 else top - 2
                if tones.index(c.px[q]) < want and (d <= 1 or (q[0] + q[1]) % 2 == 0):
                    c.px[q] = tones[want]


def dust(c: Canvas, tones: list[Color], x0: int, x1: int, n: int = 30, salt: int = 1) -> None:
    for i in range(n):
        x = int(x0 + noise(i, 7, salt) * (x1 - x0))
        y = int(GROUND - 1 - noise(i, 11, salt + 2) ** 2 * 7)
        if (x, y) not in c.px and (x + y + i) % 2 == 0:
            c.px[(x, y)] = tones[1 + i % 3]


# --------------------------------------------------------------------------------------------
# Serpent
# --------------------------------------------------------------------------------------------

SCALE = ramp('07100c', '0c1a12', '11281a', '173b22', '1f552b', '2f7436', '4d9a45')
SCALE_FAR = ramp('060c0a', '0a140f', '0e1e15', '122b1b', '173a21')
BELLY = ramp('2a2412', '4a3f1c', '7a6a2c', 'a8964a', 'd2c47a')
VENOM = ramp('5a6a08', '9fb40c', 'd8e81e', 'f4ff6a', 'feffc8')
MOUTH = ramp('2a060c', '5a0c14', '8e1420')
TONGUE = ramp('8e1420', 'd02a38')
FANG = ramp('8a8676', 'f4f0dc')
STONE = ramp('0c0a0f', '17141b', '252129', '37323b', '4d4750')


def paint_serpent(f: int, fx: float | None = None, up: float | None = None, shut: bool = False) -> Image.Image:
    c = Canvas()
    s = CYCLE[f] if fx is None else fx  # how far the head pushes forward
    lift = s * 0.5 if up is None else up

    # Tail tip trailing off behind, then two stacked coils.
    skin(c, limb((108, 87, 0.8), (100, 84, 2.4), (90, 86, 4.4), (82, 86, 5.5)), SCALE_FAR, gain=1.2)
    low = skin(c, limb((44, 83, 6.2), (58, 84.5, 7), (88, 83.5, 7)), SCALE)
    mid = skin(c, limb((53, 72, 5.8), (66, 73, 6.6), (81, 72, 6)), SCALE)

    # Hood, spread behind the neck.
    hx, hy = 50 - s, 28 - lift
    hood = skin(c, [('ell', 68 - s * 0.4, 41 - lift, 12.5, 13)], SCALE_FAR, gain=1.5)
    # Neck: an S-curve rising from the coils to the head.
    neck_pts = [(75, 68, 6.2), (79, 58, 6), (75 - s * 0.15, 48 - lift * 0.5, 5.8), (65 - s * 0.5, 39 - lift, 5.6), (hx + 6, hy + 5, 5.2)]
    neck = skin(c, limb(*neck_pts), SCALE)
    # Belly plates down the front of the neck.
    plates = c.part(
        limb(*[(x - 3.2, y + 0.5, r * 0.5) for (x, y, r) in neck_pts]),
        BELLY, gain=1.05, grain=0.15, ambient=0.2,
    )
    for (x, y) in plates:
        if y % 3 == 0:
            c.px[(x, y)] = BELLY[0]
    # Hood markings: pale eye-spots either side of the neck.
    for ox in (-9, 8):
        spot = (int(68 - s * 0.4 + ox), int(40 - lift))
        for q in ((0, 0), (1, 0), (0, 1), (1, 1), (0, -1), (-1, 0)):
            p = (spot[0] + q[0], spot[1] + q[1])
            if p in hood and p not in neck:
                c.px[p] = BELLY[2] if q in ((0, 0), (1, 0)) else BELLY[1]

    # Diamond pattern along the back of the coils and neck.
    for mask, row, x0, x1 in ((low, 79, 44, 92), (mid, 68, 54, 84)):
        for x in range(x0, x1, 7):
            for dx, dy in ((0, -1), (-1, 0), (0, 0), (1, 0), (0, 1)):
                p = (x + dx, row + dy)
                if p in mask:
                    c.px[p] = SCALE[0] if (dx, dy) != (0, 0) else SCALE[5]
    # Scale glints.
    for mask in (low, mid, neck):
        for (x, y) in mask:
            if c.px[(x, y)] in SCALE[3:5] and (x * 2 + y) % 5 == 0 and y % 2 == 0:
                c.px[(x, y)] = SCALE[SCALE.index(c.px[(x, y)]) + 1]

    # Head: open jaws, fangs, forked tongue.
    skin(c, limb((hx + 4, hy + 5, 3.2), (hx - 8, hy + 10, 1.9)), SCALE, gain=0.8)
    gape = polygon([(hx + 4, hy + 3), (hx - 11, hy + 4), (hx - 8, hy + 9), (hx + 2, hy + 6)])
    for (x, y) in gape:
        c.px[(x, y)] = MOUTH[1] if (x + y) % 2 else MOUTH[0]
    skin(c, limb((hx + 4, hy + 5, 3.0), (hx - 8, hy + 10, 1.8)), SCALE, gain=0.8)
    tl = 7 + (f % 2) * 3
    tongue = polyline([(hx - 6, hy + 7), (hx - 6 - tl, hy + 9)])
    c.dot(tongue, TONGUE[1])
    tx, ty = hx - 6 - tl, hy + 9
    c.dot([(tx - 1, ty - 1), (tx - 2, ty - 2), (tx - 1, ty + 1), (tx - 2, ty + 2)], TONGUE[1])
    head = skin(c, [('ell', hx, hy, 8.5, 5.6)] + limb((hx - 2, hy, 5), (hx - 11, hy + 1.5, 3.4)), SCALE, gain=1.05)
    # Fangs.
    for fx, ln in ((hx - 10, 4), (hx - 6, 3)):
        c.dot([(fx, hy + 4 + k) for k in range(ln)], FANG[1])
        c.dot([(fx + 1, hy + 4 + k) for k in range(ln - 1)], FANG[0])
    # Brow and eye.
    c.dot(polyline([(hx - 7, hy - 2), (hx - 3, hy - 3), (hx + 1, hy - 4)]), SCALE[0])
    eye = [(int(hx - 5), int(hy - 1)), (int(hx - 4), int(hy - 1)), (int(hx - 3), int(hy - 2)), (int(hx - 2), int(hy - 2))]
    warm(c, head, eye, SCALE)
    c.dot(eye, VENOM[2 + (f == 2)])
    c.dot([eye[1]], VENOM[4])
    if shut:
        c.dot(eye, SCALE[0])
    c.dot([(int(hx - 12), int(hy + 1))], SCALE[0])  # nostril

    # Stones the coils rest on.
    for rx, ry, rw, rh in ((40, 89, 5, 2.6), (52, 89.5, 4, 2.2), (72, 89.5, 5, 2.4), (93, 89, 5.5, 2.8), (103, 89.6, 3.5, 2)):
        c.part([('ell', rx, ry, rw, rh)], STONE, gain=1.1, grain=0.45)

    c.outline()
    dust(c, STONE, 34, 108, 26, salt=4)
    # Venom dripping from the fangs.
    drip = int(hy + 9 + (f * 3) % 9)
    if (int(hx - 10), drip) not in c.px:
        c.px[(int(hx - 10), drip)] = VENOM[2]
    return c.image()


# --------------------------------------------------------------------------------------------
# Shade (winged imp)
# --------------------------------------------------------------------------------------------

GLOOM = ramp('08060f', '0f0b1c', '18112c', '241a42', '35265e', '4c387e', '6a52a0')
GLOOM_FAR = ramp('07050d', '0c0916', '120d21', '1a132f', '231a3f')
MEMBRANE = ramp('100a1c', '1c1030', '2c1646', '411c5a', '5a2670')
FROST = ramp('0e5a78', '18a0c0', '4ad8ee', 'a8f6ff', 'f0ffff')
TOOTH = ramp('7a7888', 'e8e6f0')


def wing(c: Canvas, root, wrist, tips, tail, far: bool) -> None:
    """A bat wing: scalloped membrane between finger bones."""
    tones = MEMBRANE[:4] if far else MEMBRANE
    outline_pts = [root, wrist, tips[0]]
    for a, b in zip(tips, tips[1:] + [tail]):
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        # Scallop: pull the midpoint toward the wrist.
        outline_pts += [(mx + (wrist[0] - mx) * 0.32, my + (wrist[1] - my) * 0.32), b]
    mask = polygon(outline_pts)
    n = len(tones) - 1
    for (x, y) in mask:
        d = math.hypot(x - wrist[0], y - wrist[1])
        t = 0.75 + (1 - min(1.0, d / 34)) * (n - 1.2) + (noise(x, y, 5) - 0.5) * 0.5
        i = int(t)
        if t - i > 0.5 and (x + y) % 2 == 0:
            i += 1
        c.px[(x, y)] = tones[max(0, min(n, i))]
    bone = GLOOM_FAR if far else GLOOM
    for tip in tips:
        # Fold shadow beside each finger bone, then the bone itself.
        for (x, y) in polyline([wrist, tip]):
            if (x + 1, y + 1) in mask:
                c.px[(x + 1, y + 1)] = tones[0]
        c.part(limb((*wrist, 1.5), (*tip, 0.6)), bone, gain=1.5, grain=0.1)
    c.part(limb((*root, 2.4), (*wrist, 1.8)), bone, gain=1.4, grain=0.1)
    spike(c, wrist, (wrist[0] + (2 if far else -2), wrist[1] - 6), 1.5, CLAW)  # thumb claw


def paint_shade(
    f: int, reach: tuple[float, float] = (0, 0), beat: float | None = None, shut: bool = False
) -> Image.Image:
    c = Canvas()
    bob = -CYCLE[f]  # hovers: rises as the wings beat down
    lift = (CYCLE[f] - 1) * 5 if beat is None else beat  # wing tips: +5 up, -5 down
    ax, ay = 49 + reach[0], 56 + 4 + bob - bob + reach[1]  # near hand
    oy = 4 + bob

    # Far wing (toward the hero), then tail, far limbs.
    wing(
        c, (61, 50 + oy), (45, 31 + oy - lift * 0.5),
        [(25, 19 + oy - lift * 1.5), (19, 40 + oy - lift), (32, 57 + oy - lift * 0.4)],
        (59, 58 + oy), far=True,
    )
    tail = limb((72, 64 + oy, 2.6), (84, 71 + oy, 2), (94, 67 + oy, 1.6), (99, 57 + oy - bob, 1.2))
    skin(c, tail, GLOOM_FAR, gain=1.5)
    barb = polygon([(99, 58 + oy - bob), (95, 52 + oy - bob), (100, 46 + oy - bob), (104, 53 + oy - bob)])
    for p in barb:
        c.px[p] = GLOOM[3] if p[0] < 100 else GLOOM[1]
    skin(c, limb((70, 64 + oy, 3.4), (72, 73 + oy, 2.8), (76, 79 + oy, 2)), GLOOM_FAR, gain=1.4)
    skin(c, limb((60, 51 + oy, 2.8), (52, 55 + oy, 2.3), (45, 51 + oy, 1.9)), GLOOM_FAR, gain=1.4)
    for k in (-2, 0, 2):
        spike(c, (45, 51 + oy), (40, 49 + oy + k), 1.0, CLAW, gain=0.8)

    # Near wing (behind the body, sweeping back).
    wing(
        c, (69, 49 + oy), (86, 30 + oy - lift * 0.5),
        [(106, 20 + oy - lift * 1.5), (110, 42 + oy - lift), (98, 58 + oy - lift * 0.4)],
        (72, 60 + oy), far=False,
    )

    # Body: a pot-bellied little torso.
    torso = skin(c, limb((68, 63 + oy, 6), (65, 53 + oy, 7.2)), GLOOM)
    for k in range(3):  # ribs
        for x in range(60, 66):
            p = (x, int(53 + oy + k * 3 + (x - 60) // 3))
            if p in torso and c.px[p] in GLOOM[3:]:
                c.px[p] = GLOOM[2]

    # Near leg and clawed foot.
    skin(c, limb((66, 65 + oy, 3.8), (61, 73 + oy, 3), (64, 80 + oy, 2.2)), GLOOM)
    for k in (-2, 0, 2):
        spike(c, (63, 81 + oy), (59 + k, 85 + oy), 1.0, CLAW)

    # Ears and horns, then the big head.
    hx, hy = 57.0, 41.0 + oy
    skin(c, limb((hx - 5, hy - 5, 2.4), (hx - 11, hy - 13, 0.5)), GLOOM_FAR, gain=1.5)
    head = skin(c, [('ell', hx, hy, 9.5, 8.6)] + limb((hx - 2, hy + 4, 5), (hx - 7, hy + 6, 3.6)), GLOOM)
    skin(c, limb((hx + 6, hy - 4, 2.8), (hx + 15, hy - 11, 0.5)), GLOOM)
    spike(c, (hx - 2, hy - 7), (hx - 5, hy - 14), 1.8)
    spike(c, (hx + 3, hy - 8), (hx + 4, hy - 16), 2.0)

    # Near arm reaching, claws out.
    skin(c, limb((66, 52 + oy, 3.2), (57 + reach[0] * 0.3, 58 + oy + reach[1] * 0.2, 2.6), (ax, ay, 2.2)), GLOOM)
    for k in (-3, 0, 3):
        spike(c, (ax, ay), (ax - 6 - abs(reach[0]) * 0.3, ay - 1 + k * 1.2), 1.2, CLAW)

    # Face: big cold eyes and a jagged grin.
    def block(x0: float, y0: float, w: int, h: int) -> list[Px]:
        return [(int(x0) + i, int(y0) + j) for j in range(h) for i in range(w)]

    near_eye = block(hx - 3, hy - 2, 4, 3) + [(int(hx + 1), int(hy - 3)), (int(hx), int(hy - 3))]
    far_eye = block(hx - 8, hy - 1, 2, 2) + [(int(hx - 8), int(hy - 2))]
    warm(c, head, near_eye + far_eye, GLOOM)
    c.dot(near_eye + far_eye, FROST[2])
    c.dot([(int(hx - 3), int(hy)), (int(hx - 2), int(hy)), (int(hx - 8), int(hy))], FROST[1])
    c.dot([(int(hx - 1), int(hy - 2)), (int(hx), int(hy - 2)), (int(hx - 7), int(hy - 1))], FROST[4 if f != 2 else 3])
    c.dot(polyline([(hx - 9, hy - 3), (hx - 6, hy - 2)]) + polyline([(hx - 4, hy - 3), (hx + 2, hy - 5)]), GLOOM[0])
    if shut:
        c.dot(near_eye + far_eye, GLOOM[1])
        c.dot(polyline([(hx - 3, hy - 1), (hx + 1, hy - 2)]) + [(int(hx - 8), int(hy)), (int(hx - 7), int(hy))], GLOOM[0])
    grin = polyline([(hx - 8, hy + 5), (hx - 6, hy + 6), (hx - 4, hy + 5), (hx - 2, hy + 6), (hx, hy + 5), (hx + 2, hy + 4)])
    c.dot([(x, y + 1) for (x, y) in grin], GLOOM[0])
    c.dot(grin, TOOTH[1])
    c.dot([p for i, p in enumerate(grin) if i % 2], TOOTH[0])

    c.outline()

    # Wisps of shadow trailing below, and a faint shadow on the ground.
    for i in range(12):
        x = int(58 + noise(i, 2, 8) * 22)
        y = int(84 + oy + ((noise(i, 4, 8) * 9 + f * 2) % 9)) - 3
        if (x, y) not in c.px and y < GROUND - 1 and (x + y) % 2 == 0:
            c.px[(x, y)] = GLOOM[2 + i % 2]
    for x in range(52, 82):
        if (x + f) % 2 == 0 or 58 < x < 76:
            if (x, GROUND) not in c.px:
                c.px[(x, GROUND)] = GLOOM[0]
    return c.image()


# --------------------------------------------------------------------------------------------
# Thornbeast
# --------------------------------------------------------------------------------------------

BARK = ramp('0b0907', '15100b', '241a10', '382816', '52391c', '6e4f25', '8c6a32')
BARK_FAR = ramp('090706', '100c08', '1a130c', '271c11', '352716')
MOSS = ramp('16260e', '274214', '3d641c', '5a8a28', '82b33c')
THORN = ramp('17110c', '3a2c1c', '6a5634', '9c8656', 'cbb988')
AMBER = ramp('7a3a06', 'c46a0a', 'f49a16', 'ffc94a', 'fff2b0')
EARTH = ramp('0c0a08', '18130e', '261f16', '383022', '4c4230')


def paint_thornbeast(f: int, head_at: tuple[float, float] = (0, 0), shut: bool = False) -> Image.Image:
    c = Canvas()
    b = CYCLE[f]  # shoulders heave
    hb = b * 0.5

    # Vine tail, curling up with thorns and a leaf.
    tail_pts = [(96, 60 + hb, 2.6), (105, 55, 2.1), (110, 45 - hb, 1.7), (106, 36 - hb, 1.3), (100, 35 - hb, 0.9)]
    c.part(limb(*tail_pts), MOSS, gain=1.0, grain=0.2, power=1.3)
    for (x, y, _), (dx, dy) in zip(tail_pts[1:4], ((5, 2), (5, -2), (2, -5))):
        spike(c, (x, y), (x + dx, y + dy), 1.3, THORN)
    leaf = polygon([(100, 35 - hb), (95, 31 - hb), (91, 35 - hb), (96, 38 - hb)])
    for p in leaf:
        c.px[p] = MOSS[3] if p[1] < 35 - hb else MOSS[2]

    # Far legs.
    skin(c, limb((70, 68 + hb, 6), (73, 79, 4.4), (71, 86, 4)), BARK_FAR, gain=1.3)
    skin(c, [('ell', 69, 87.5, 5, 2.8)], BARK_FAR, gain=1.3)
    skin(c, limb((98, 66 + hb, 6.5), (105, 77, 4.2), (103, 86, 3.8)), BARK_FAR, gain=1.3)
    skin(c, [('ell', 101, 87.5, 5, 2.8)], BARK_FAR, gain=1.3)

    # Thorns bristling along the back (behind the body so only the tips stand proud).
    spine = [(54, 46), (60, 43), (66, 42), (72, 43), (78, 45), (84, 48), (90, 51), (95, 55)]
    lens = [15, 18, 16, 14, 13, 11, 10, 8]
    for i, ((x, y), ln) in enumerate(zip(spine, lens)):
        ang = math.radians(-112 + i * 9)
        yy = y + b * (1 - i / 8)
        spike(c, (x, yy + 4), (x + math.cos(ang) * ln, yy + 4 + math.sin(ang) * ln), 3.0 - i * 0.12, THORN)

    # Body: a great shoulder hump sloping back to the haunches.
    body = skin(c, limb((91, 64 + hb, 9.5), (77, 60 + b * 0.7, 11), (63, 58 + b, 13.5)), BARK, gain=0.95)
    # Moss along the top of the back.
    for x in range(48, 102):
        ys = [y for (px, y) in body if px == x]
        if not ys:
            continue
        top = min(ys)
        depth = 2 + int(noise(x, 0, 6) * 3)
        for k in range(depth):
            if (x, top + k) in body and (k < depth - 1 or (x + k) % 2 == 0):
                c.px[(x, top + k)] = MOSS[max(0, 3 - k - int(noise(x, k, 2) * 1.6))]
    # Bark grooves down the flank.
    for gx in (70, 78, 86):
        for k in range(9):
            p = (gx + (k // 3), int(58 + hb) + k)
            if p in body and c.px[p] in BARK[2:]:
                c.px[p] = BARK[1]
    # A second, shorter row of thorns in front of the hump.
    for i, (x, y) in enumerate(((58, 50), (67, 48), (76, 50), (85, 53))):
        ang = math.radians(-105 + i * 12)
        yy = y + b * (1 - i / 5)
        spike(c, (x, yy + 3), (x + math.cos(ang) * 9, yy + 3 + math.sin(ang) * 9), 2.3, THORN, gain=1.1)

    # Near hind leg.
    skin(c, limb((90, 66 + hb, 8), (97, 77, 4.8), (93, 86, 4.2)), BARK)
    skin(c, [('ell', 91, 87.5, 5.6, 2.9)], BARK)
    # Near foreleg: thick and braced.
    skin(c, limb((61, 66 + b, 7.5), (58, 78 + hb * 0.5, 5.2), (57, 86, 4.4)), BARK)
    skin(c, [('ell', 55, 87.5, 6, 2.9)], BARK)
    for px0 in (51, 87):
        for k in range(3):
            spike(c, (px0 + k * 3, 88), (px0 - 3 + k * 3, 90), 1.2, THORN)
    spike(c, (64, 72 + hb), (70, 78 + hb), 1.8, THORN)  # elbow thorn

    # Head: carried low, heavy snout, tusks, a crown of thorns.
    hx, hy = 46.0 + head_at[0], 64.0 + b + head_at[1]
    skin(c, limb((61, 60 + b, 10), (hx + 4, hy, 8)), BARK)  # neck
    spike(c, (hx + 5, hy - 6), (hx + 12, hy - 16), 2.4, THORN, gain=0.8)
    jaw = skin(c, limb((hx + 1, hy + 8, 3.6), (hx - 10, hy + 11, 2.4)), BARK, gain=0.8)
    head = skin(c, [('ell', hx, hy, 9.5, 8)] + limb((hx - 2, hy + 3, 6), (hx - 13, hy + 5.5, 4.2)), BARK)
    spike(c, (hx - 1, hy - 6), (hx - 3, hy - 16), 2.2, THORN)
    spike(c, (hx - 6, hy - 4), (hx - 12, hy - 11), 1.9, THORN)
    # Tusks curving up from the lower jaw.
    for tx in (hx - 9, hx - 4):
        c.part(limb((tx, hy + 10, 2.3), (tx - 3, hy + 5, 1.9), (tx - 3, hy - 3, 0.45)), THORN, gain=1.3, grain=0.1)
    # Fire in the eye and between the teeth.
    eye = [(int(hx - 6), int(hy)), (int(hx - 5), int(hy)), (int(hx - 4), int(hy - 1)), (int(hx - 3), int(hy - 1))]
    teeth = [(int(hx - 12 + k), int(hy + 9 + (k % 2))) for k in range(1, 11) if k not in (3, 4, 8)]
    c.dot(polyline([(hx - 8, hy - 2), (hx - 5, hy - 2), (hx - 1, hy - 4)]), BARK[0])
    warm(c, head | jaw, eye + teeth, BARK)
    c.dot(teeth, AMBER[1])
    c.dot(teeth[::2], AMBER[2 + (f == 2)])
    c.dot(eye, AMBER[3])
    c.dot([eye[1]], AMBER[4])
    if shut:
        c.dot(eye, BARK[0])
    c.dot([(int(hx - 15), int(hy + 4)), (int(hx - 14), int(hy + 4))], BARK[0])  # nostril

    # Torn earth and roots underfoot.
    for rx, ry, rw, rh in ((44, 89.3, 4.5, 2.2), (63, 89.5, 4, 2.2), (79, 89.2, 5.5, 2.6), (97, 89.6, 4, 2), (108, 89.4, 4, 2.2)):
        c.part([('ell', rx, ry, rw, rh)], EARTH, gain=1.1, grain=0.45)

    c.outline()
    dust(c, EARTH, 36, 112, 28, salt=9)
    # A few leaves shaken loose.
    for i in range(4):
        fall = (noise(i, 1, 12) * 30 + f * 4) % 30
        x = int(62 + noise(i, 3, 12) * 44 + math.sin(fall * 0.4 + i) * 2)
        y = int(30 + fall + i * 3)
        if (x, y) not in c.px and (x + 1, y) not in c.px:
            c.px[(x, y)] = MOSS[3]
            c.px[(x + 1, y)] = MOSS[2]
    return c.image()


# --------------------------------------------------------------------------------------------
# States: every foe gets the same rows.
# --------------------------------------------------------------------------------------------

ROWS = ('idle', 'attack', 'hurt', 'defeat')
COLS = 4  # idle 4, attack 4 (wind-up, strike, follow-through, recover), hurt 2, defeat 4
ROW_FRAMES = {'idle': 4, 'attack': 4, 'hurt': 2, 'defeat': 4}
DUST = ramp('17141b', '252129', '37323b')


def shift(im: Image.Image, dx: int) -> Image.Image:
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (dx, 0))
    return out


def crumble(im: Image.Image, k: int) -> Image.Image:
    """Defeat: the foe sags and blows away as dust (k = 0..3). No body is left behind."""
    p = (k + 1) / 4.6
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    src = im.load()
    dst = out.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = src[x, y]
            if not a:
                continue
            height = max(0.0, (GROUND - y) / GROUND)  # 0 at the ground, 1 at the top
            if noise(x // 2, y // 2, 21) < p * 1.25 * (0.35 + height) - 0.08:
                # This bit has blown away; leave the odd mote drifting up and back.
                if noise(x, y, 22) < 0.16 - p * 0.08:
                    mx, my = x + int(p * 10 * noise(x, y, 23)) + 2, y - int(p * 12 * noise(x, y, 24))
                    if 0 <= mx < W and 0 <= my < H:
                        dst[mx, my] = (*DUST[(x + y) % 3], 255)
                continue
            ny = int(round(GROUND - (GROUND - y) * (1 - p * 0.42)))
            fade = 1 - p * 0.45
            dst[x, min(H - 1, ny)] = (int(r * fade), int(g * fade), int(b * fade), 255)
    return out


def demon_cell(state: str, k: int) -> Image.Image:
    if state == 'idle':
        return demon_frame(k)
    if state == 'attack':
        swipe, rot, dx = (((10, -19), 45, 3), ((-2, 5), -20, -9), ((0, 7), -28, -6), ((0, 1), 0, -2))[k]
        return shift(demon_frame(1, swipe, rot), dx)
    return shift(demon_frame(0, (5, -7), 25, shut=True), (6, 3)[k])


def serpent_cell(state: str, k: int) -> Image.Image:
    if state == 'idle':
        return paint_serpent(k)
    if state == 'attack':
        fx, up = ((-8, 3), (14, -7), (12, -6), (4, -1))[k]
        return paint_serpent(k, fx, up)
    return paint_serpent(0, (-10, -6)[k], (3, 2)[k], shut=True)


def shade_cell(state: str, k: int) -> Image.Image:
    if state == 'idle':
        return paint_shade(k)
    if state == 'attack':
        reach, beat, dx = (((7, -12), 6, 3), ((-8, 2), -6, -8), ((-7, 5), -4, -6), ((-2, 0), 0, -2))[k]
        return shift(paint_shade(1, reach, beat), dx)
    return shift(paint_shade(0, (5, -6), 4, shut=True), (6, 3)[k])


def thornbeast_cell(state: str, k: int) -> Image.Image:
    if state == 'idle':
        return paint_thornbeast(k)
    if state == 'attack':
        head_at, dx = (((4, -7), 3), ((-8, 3), -7), ((-7, 5), -5), ((-2, 0), -1))[k]
        return shift(paint_thornbeast(1, head_at), dx)
    return shift(paint_thornbeast(0, (5, -5), shut=True), (5, 2)[k])


MONSTERS = {'demon': demon_cell, 'serpent': serpent_cell, 'shade': shade_cell, 'thornbeast': thornbeast_cell}


def sheet_for(name: str) -> Image.Image:
    cell = MONSTERS[name]
    sheet = Image.new('RGBA', (W * COLS, H * len(ROWS)), (0, 0, 0, 0))
    for r, state in enumerate(ROWS):
        for k in range(ROW_FRAMES[state]):
            im = crumble(cell('hurt', 1), k) if state == 'defeat' else cell(state, k)
            sheet.paste(im, (k * W, r * H))
    return sheet


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*', help=f'which to paint (default all): {", ".join(MONSTERS)}')
    ap.add_argument('--preview', action='store_true')
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name in args.names or list(MONSTERS):
        sheet = sheet_for(name)
        out = OUT_DIR / f'{name}.png'
        sheet.save(out, optimize=True)
        colours = {c for c in sheet.getdata() if c[3] > 0}
        print(f'wrote {out.relative_to(ROOT)} ({sheet.width}x{sheet.height}, {len(colours)} colours)')
        if args.preview:
            bg = Image.new('RGBA', sheet.size, (160, 160, 160, 255))
            bg.alpha_composite(sheet)
            PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
            pv = PREVIEW_DIR / f'{name}.png'
            bg.resize((bg.width * 4, bg.height * 4), Image.NEAREST).save(pv)
            print(f'wrote {pv.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
