#!/usr/bin/env python3
"""
Paints the original foes that appear in the game, pixel by pixel. Deterministic, needs Pillow.

    python3 scripts/art/paint_foes.py [name…]    # writes src/assets/foes/<name>.png
    python3 scripts/art/paint_foes.py --preview  # also art/foe-previews/<name>.png (4x)

  hissling     a little coiled viper (the whisper of temptation)
  serpent      the great hooded serpent of the garden
  gust         a small whirlwind
  storm-cloud  a thunderhead that throws lightning
  wave         a wave reared up to break
  flood-surge  a wall of floodwater with two crests
  squall       a racing raincloud that blows a gale
  tempest      a waterspout under a thunderhead

Every sheet is a grid of 128x128 cells, COLS wide, one row per state: idle, attack, hurt, death
(frame counts in FRAMES; src/scenes/battle/FoeSprite.ts mirrors them). Foes face LEFT and meet
the ground at (GX, GY). The engine is foe_engine.py.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image

from foe_engine import (
    GX,
    GY,
    H,
    W,
    Canvas,
    ball,
    block,
    curve,
    disc,
    ease,
    flash,
    hexc,
    lerp,
    line,
    noise,
    poly,
    polyline,
    ramp,
    tube,
    union,
    wave01,
)

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'src' / 'assets' / 'foes'
PREVIEW_DIR = ROOT / 'art' / 'foe-previews'

ROWS = ('idle', 'attack', 'hurt', 'death')
FRAMES = {'idle': 8, 'attack': 8, 'hurt': 4, 'death': 8}
COLS = 8

WHITE = hexc('ffffff')
INK = hexc('141222')

# Smoke for the "poof" when a creature is defeated.
SMOKE = ramp('6f6a8c', 'a9a6c4', 'dcdaf0', 'ffffff')
SMOKE_EDGE = hexc('4b4768')


def poof(c: Canvas, cx: float, cy: float, k: float, size: float = 1.0, salt: int = 0) -> None:
    """A burst of smoke puffs that spreads and thins (k = 0..1), with a few sparkles."""
    n = 7
    for i in range(n):
        a = i / n * math.tau + salt
        d = (4 + 15 * ease(k)) * size * (0.8 + 0.4 * noise(i, 3, salt))
        r = (6.5 * (1 - k) ** 0.8 + 0.6) * size * (0.75 + 0.5 * noise(i, 5, salt))
        if r < 1.2:
            continue
        x, y = cx + math.cos(a) * d * 1.25, cy + math.sin(a) * d * 0.8 - 7 * k * size
        c.solid(ball(x, y, r), SMOKE, SMOKE_EDGE, bands=(0.2, 0.5, 0.86), seam=False)
    if k < 0.45:
        c.solid(ball(cx, cy - 2, 8 * size * (1 - k * 1.6)), SMOKE, SMOKE_EDGE, bands=(0.1, 0.3, 0.6), seam=False)
    for i in range(6):
        a = i / 6 * math.tau + 0.5 + salt
        d = (8 + 22 * k) * size
        x, y = int(cx + math.cos(a) * d * 1.2), int(cy + math.sin(a) * d - 6 * k)
        if 0.15 < k < 0.9 and (x, y) not in c.px:
            c.put([(x, y)], WHITE)
            if k < 0.6:
                c.put([(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], SMOKE[2])


# ── Shared face and weather pieces ─────────────────────────────────────────────────────────────

GLOW_EYE = ramp('f08a1c', 'ffe14a', 'fffbd0')  # burning yellow, for dark bodies
DARK_EYE = ramp('0c1030', '1a2150', '8fd8ff')  # deep navy with a cold glint, for pale bodies
BOLT = ramp('b8560c', 'ffab1c', 'ffe85a', 'fffde0')
RAIN = ramp('6f9fd0', 'b4d6f2')


def glare(c: Canvas, x: float, y: float, w: int, h: int, tilt: int, pal: list, edge, shut: bool = False, pupil=None, brow: int = 2) -> None:
    """
    An angry eye with its top-left corner at (x, y). The top edge drops `tilt` pixels toward the
    right (the viewer's left eye); a negative tilt drops it toward the left (the right eye).
    """
    x, y = int(round(x)), int(round(y))
    if shut:
        mid = y + h // 2
        pts = [(x, mid - 2), (x + w - 1, mid), (x, mid + 2)] if tilt > 0 else [(x + w - 1, mid - 2), (x, mid), (x + w - 1, mid + 2)]
        c.put(polyline(pts), edge)
        c.put([(px, py + 1) for (px, py) in polyline(pts[:2])], edge)
        return
    tops = []
    for i in range(w):
        t = abs(tilt) * (i / (w - 1) if tilt > 0 else (w - 1 - i) / (w - 1))
        tops.append(y + int(round(t)))
    cells = [(x + i, j) for i in range(w) for j in range(tops[i], y + h) if not (j == y + h - 1 and i in (0, w - 1))]
    c.put(cells, pal[1])
    c.put([(px, py) for (px, py) in cells if py == y + h - 1], pal[0])
    inner = w - 2 if tilt > 0 else 1  # the tall, inner side of the eye
    c.put([(x + inner, j) for j in range(tops[inner] + 1, y + h - 2)], pal[2])
    c.put([(x + inner + (-1 if tilt > 0 else 1), j) for j in range(tops[inner] + 2, y + h - 2)], pal[2])
    if pupil is not None:
        pxl = x + (1 if w > 4 else 0)
        c.put([(pxl, y + h - 3), (pxl + 1, y + h - 3), (pxl, y + h - 2), (pxl + 1, y + h - 2)], pupil)
    for b in range(brow):
        c.put([(x + i, tops[i] - 1 - b) for i in range(-1, w + 1) if 0 <= i < w] + [(x - 1, tops[0] - 1 - b), (x + w, tops[-1] - 1 - b)], edge)


def zigzag(a: tuple[float, float], b: tuple[float, float], n: int, amp: float, salt: int = 0) -> list[tuple[float, float]]:
    """A jagged path from a to b."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(dx, dy) or 1
    px, py = -dy / ln, dx / ln
    pts = [a]
    for i in range(1, n):
        t = i / n
        off = amp * (1 if i % 2 else -1) * (0.6 + 0.8 * noise(i, salt, 7))
        pts.append((a[0] + dx * t + px * off, a[1] + dy * t + py * off))
    pts.append(b)
    return pts


def bolt(c: Canvas, pts: list[tuple[float, float]], w: float = 1.6, taper: float = 0.5) -> None:
    """A lightning bolt along the points: orange rim, yellow body, white-hot core."""
    path = polyline(pts)
    n = max(1, len(path) - 1)
    for layer, col in ((0.0, BOLT[1]), (0.75, BOLT[2]), (1.5, BOLT[3])):
        for i, (x, y) in enumerate(path):
            r = w * (1 - (1 - taper) * i / n) - layer
            if r > 0.3:
                c.put(disc(x + 0.5, y + 0.5, r), col, BOLT[0])
            elif layer == 0.0:
                c.put([(x, y)], col, BOLT[0])


def spark(c: Canvas, x: float, y: float, big: bool = False) -> None:
    x, y = int(x), int(y)
    c.put([(x, y)], BOLT[3])
    arms = [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]
    c.put([p for p in arms if p not in c.px], BOLT[2])
    if big:
        c.put([p for p in ((x - 2, y), (x + 2, y), (x, y - 2), (x, y + 2)) if p not in c.px], BOLT[1])


def rain(c: Canvas, x0: float, x1: float, y0: float, y1: float, f: float, count: int, slant: float = 0.35, salt: int = 0) -> None:
    """Short streaks falling between y0 and y1 (drawn only on empty pixels)."""
    span = max(1.0, y1 - y0)
    for i in range(count):
        x = x0 + (i + 0.5) / count * (x1 - x0) + (noise(i, 2, salt) - 0.5) * 3
        fall = (noise(i, 5, salt) * span + f * span / 4) % span
        y = y0 + fall
        ln = 3 if noise(i, 9, salt) > 0.4 else 2
        for k in range(ln):
            p = (int(x - (fall + k) * slant), int(y + k))
            if p not in c.px and p[1] < y1:
                c.put([p], RAIN[1 if k == ln - 1 else 0])


# ══════════════════════════════════════════════════════════════════════════════════════════════
# Snakes: the hissling and the serpent
# ══════════════════════════════════════════════════════════════════════════════════════════════

SNAKES = {
    'hissling': dict(
        skin=ramp('17504a', '1f7a58', '35a85c', '7ad25c', 'c8f07e'),
        band=ramp('0f3038', '134846', '19644e', '26864f', '4aa854'),
        edge=hexc('0d2530'),
        belly=ramp('a56f34', 'e0b04e', 'f8de86', 'fff5c2'),
        eye=ramp('e8801c', 'ffd83a', 'fff6a8'),
    ),
    'serpent': dict(
        skin=ramp('112f3c', '164f4a', '1f7a52', '49ab52', '9ad866'),
        band=ramp('2a1238', '43184e', '6a2262', '963a6e', 'c4628a'),
        edge=hexc('0a1622'),
        belly=ramp('8a5a2c', 'd29a40', 'f4cf6a', 'fff0b0'),
        eye=ramp('f0621c', 'ffc22e', 'fff39a'),
    ),
}
MOUTH = ramp('4a0c26', '8a1436', 'c42a48')
TONGUE = ramp('a81c3c', 'ee4058')
FANG = ramp('b8bcd0', 'ffffff')


def snake_part(c: Canvas, pal: dict, surf, back_sign: float, period: float = 9.0, phase: float = 0.0, belly_at: float = 0.42, saddles: bool = True):
    """One length of snake: banded back, plated belly. `back_sign` says which side of the tube is the back."""
    skin, band, belly = pal['skin'], pal['band'], pal['belly']
    length = max(v[4] for v in surf.values())

    def pick(x: int, y: int, tone: int, s: float, u: float):
        side = u * back_sign  # 1 at the back edge, -1 at the belly edge
        if side < -belly_at:
            if int(s + phase) % 4 == 0:
                return belly[0]
            return belly[min(len(belly) - 1, max(1, tone - 1))]
        if not saddles or s < 0.5 or s > length - 0.5:  # (the rounded ends stay plain)
            return None
        # Saddle bands across the back, narrowing toward the flanks.
        k = abs((s + phase) % period - period / 2)
        width = 6.0 * math.sqrt(max(0.0, (side + 0.3) / 1.3))
        if side > 0.2 and k < 0.8 and width > 3.4:
            return skin[min(len(skin) - 1, tone + 1)]  # pale scale in the middle of each saddle
        if k < width / 2 + 0.4:
            return band[tone]
        return None

    return c.solid(surf, skin, pal['edge'], pick=pick)


def paint_hissling(
    c: Canvas,
    head: tuple[float, float] = (0, 0),
    jaw: float = 0.0,
    tongue: float = 0.0,
    eye: str = 'open',
    tail: float = 0.0,
    squash: float = 0.0,
    lean: float = 0.0,
) -> None:
    """
    `head` moves the head (x negative = toward the hero), `jaw` opens the mouth 0..1, `tongue`
    flicks 0..1, `tail` wags the tip -1..1, `squash` flattens the coils 0..1, `lean` tips the neck.
    """
    pal = SNAKES['hissling']
    sq = squash * 3.0
    base = GY

    # Tail tip, curling up behind.
    tx = 86
    c_tail = tube(
        [(tx - 8, base - 6, 4.6), (tx + 4, base - 5.5, 3.6), (tx + 11, base - 8 - tail * 1.5, 2.4), (tx + 14 + tail * 2, base - 15 - tail * 2, 1.2)]
    )
    snake_part(c, pal, c_tail, back_sign=-1, phase=3)

    # Two stacked coils.
    low = tube([(43, base - 7, 6.6), (64, base - 7.4, 7.2), (86, base - 7, 6.4)], smooth=4)
    snake_part(c, pal, low, back_sign=-1, phase=0, belly_at=0.62)
    up_y = base - 18.5 + sq
    high = tube([(50, up_y, 6.0), (65, up_y - 0.6, 6.6), (80, up_y, 5.8)], smooth=4)
    snake_part(c, pal, high, back_sign=-1, phase=4.5, belly_at=0.7)

    # Neck: an S rising from the right of the coils to the head.
    hx, hy = 55 + head[0], 77 + head[1] + sq
    nx0, ny0 = 77, up_y - 3
    neck = tube(
        [
            (nx0, ny0 + 3, 5.6),
            (nx0 + 2.5 + lean, lerp(ny0, hy, 0.38), 5.4),
            (lerp(nx0, hx, 0.42) + 3 + lean, lerp(ny0, hy, 0.8) - 1, 5.2),
            (hx + 9, hy + 1.5, 5.2),
            (hx + 3, hy + 1.5, 5.4),
        ]
    )
    snake_part(c, pal, neck, back_sign=1, phase=2, belly_at=0.3)

    snake_head(c, pal, hx, hy, 1.12, jaw, tongue, eye)


def snake_head(c: Canvas, pal: dict, hx: float, hy: float, k: float, jaw: float, tongue: float, eye: str, fangs: bool = False, eye_size: int = 5) -> None:
    """A snake's head looking left; `k` scales it."""
    skin, belly, edge = pal['skin'], pal['belly'], pal['edge']
    drop = jaw * 5.5 * k

    # Lower jaw (belly-coloured), dropping open.
    jaw_surf = tube([(hx + 3 * k, hy + 4 * k, 3.6 * k), (hx - 5 * k, hy + 4.6 * k + drop * 0.6, 3.0 * k), (hx - 11 * k, hy + 4.4 * k + drop, 2.0 * k)], smooth=3)
    c.solid(jaw_surf, belly, edge, bands=(0.05, 0.4, 0.8))
    if jaw > 0.15:
        # Inside of the mouth, between the jaws.
        gape = poly([(hx + 2 * k, hy + 2 * k), (hx - 12.5 * k, hy + 2.5 * k), (hx - 11 * k, hy + 3.4 * k + drop), (hx + 1 * k, hy + 4.5 * k + drop * 0.4)])
        c.put(gape, MOUTH[0], edge)
        c.put([(x, y) for (x, y) in gape if y >= hy + 3.4 * k + drop * 0.55], MOUTH[1], edge)
    if tongue > 0:
        ty = hy + 3.2 * k + drop * 0.5
        tl = (5 + 6 * tongue) * k
        x0 = hx - 10 * k
        c.put(line((x0, ty), (x0 - tl, ty + 1)), TONGUE[1], TONGUE[0])
        fx, fy = int(x0 - tl), int(ty + 1)
        c.put([(fx - 1, fy - 1), (fx - 2, fy - 2), (fx - 1, fy + 1), (fx - 2, fy + 2)], TONGUE[1], TONGUE[0])

    # Skull and snout.
    skull = union(
        ball(hx, hy - 0.5 * k, 8.4 * k, 6.6 * k),
        tube([(hx - 2 * k, hy + 0.4 * k, 5.6 * k), (hx - 8 * k, hy + 1.0 * k, 4.6 * k), (hx - 12 * k, hy + 1.6 * k, 3.0 * k)], smooth=3),
    )
    head_px = c.solid(skull, skin, edge, lift=0.04)
    # Pale lip line along the upper jaw.
    for x in range(int(hx - 13 * k), int(hx + 2 * k)):
        ys = [y for (px, y) in head_px if px == x]
        if ys and (x, max(ys)) in c.px and x < hx - 1 * k:
            c.px[(x, max(ys))] = belly[1]
    if fangs or jaw > 0.4:
        for fx, ln in ((hx - 10.5 * k, 3.4 * k), (hx - 6.5 * k, 2.6 * k)):
            n = max(2, int(round(ln * max(0.6, jaw))))
            c.put([(fx, hy + 4.2 * k + i) for i in range(n)], FANG[1], edge)
            c.put([(fx + 1, hy + 4.2 * k + i) for i in range(n - 1)], FANG[0], edge)

    # Eye, with an angry brow sloping down toward the snout.
    ex, ey = int(round(hx - 5 * k)), int(round(hy - 3 * k))
    s = eye_size - 3
    e = pal['eye']
    if eye == 'shut':
        c.put(polyline([(ex - 1, ey + 2), (ex + 1, ey + 1 + s), (ex + 3 + s, ey + 2)]), edge)
    else:
        w, h = eye_size, eye_size
        eye_px = [(ex + i, ey + j) for j in range(h) for i in range(w) if not ((i in (0, w - 1)) and (j in (0, h - 1)))]
        c.put(eye_px, e[1])
        c.put([(ex + i, ey + h - 1) for i in range(1, w - 1)], e[0])
        c.put([(ex + w - 1, ey + j) for j in range(1, h - 1)], e[0])
        c.put([(ex + 1, ey + j) for j in range(1, h - 1 if eye == 'open' else h - 2)], INK)  # slit pupil
        c.put([(ex + 2, ey + 1)], e[2])
        if eye == 'half':
            c.put([(ex + i, ey) for i in range(w)], skin[1])
            c.put([(ex + i, ey + 1) for i in range(w)], edge)
        # Dark rim and brow.
        c.put([(ex - 1, ey + j) for j in range(1, h - 1)], edge)
        c.put(polyline([(ex - 2, ey + 1), (ex + 1, ey - 1), (ex + w + 1, ey - 2)]), edge)
        c.put(polyline([(ex - 1, ey), (ex + 1, ey - 2 + 1)]), edge)
    # Nostril.
    c.put([(int(hx - 12.5 * k), int(hy + 0.2 * k))], edge)


def hissling_frame(state: str, f: int) -> Image.Image:
    c = Canvas()
    n = FRAMES[state]
    if state == 'idle':
        paint_hissling(
            c,
            head=(wave01(f, n) * 1.6, wave01(f, n, 0.25) * 1.2),
            lean=wave01(f, n, 0.1) * 1.0,
            tongue=(0, 0, 0, 0, 0.5, 1, 0.6, 0)[f],
            eye='half' if f == 2 else 'open',
            tail=wave01(f, n, 0.4),
        )
    elif state == 'attack':
        # Rear back, strike, hold, recover.
        hx, hy, jw, ln = ((5, -3, 0.2, 2), (8, -5, 0.6, 3), (9, -6, 1, 3), (-20, 6, 1, -6), (-23, 8, 1, -7), (-17, 5, 0.8, -5), (-7, 1, 0.3, -2), (-1, 0, 0, 0))[f]
        paint_hissling(c, head=(hx, hy), jaw=jw, lean=ln, tail=(1, 1, 1, -1, -1, -0.5, 0, 0)[f], squash=(0, 0, 0, 0.5, 0.6, 0.4, 0.2, 0)[f])
    elif state == 'hurt':
        hx, hy = ((9, 3), (11, 4), (7, 3), (3, 1))[f]
        paint_hissling(c, head=(hx, hy), eye='shut', jaw=(0.5, 0.4, 0.2, 0)[f], lean=(4, 5, 3, 1)[f], squash=(0.8, 1, 0.6, 0.2)[f], tail=1)
    else:  # death
        if f < 3:
            paint_hissling(c, head=(8 + f * 2, 6 + f * 9), eye='shut', jaw=0.3, lean=4 + f, squash=1 + f * 1.4, tail=-1)
        c.outline()
        if f >= 2:
            poof(c, 64, GY - 16, (f - 2) / 5.5, 1.15, salt=1)
            c.outline()
        return c.image()
    c.outline()
    im = c.image()
    return flash(im, 0.55) if state == 'hurt' and f == 0 else im


def paint_serpent(
    c: Canvas,
    head: tuple[float, float] = (0, 0),
    jaw: float = 0.0,
    tongue: float = 0.0,
    eye: str = 'open',
    tail: float = 0.0,
    squash: float = 0.0,
    lean: float = 0.0,
    flare: float = 0.0,
) -> None:
    """The great serpent: three coils, a spread hood and bared fangs. Parameters as the hissling's; `flare` spreads the hood."""
    pal = SNAKES['serpent']
    skin, band, edge = pal['skin'], pal['band'], pal['edge']
    sq = squash * 3.0
    base = GY

    # Tail, curling up behind.
    c_tail = tube(
        [(92, base - 8, 6.4), (104, base - 7.5, 5.0), (112, base - 12 - tail * 1.5, 3.4), (115 + tail * 2, base - 22 - tail * 2, 2.0), (112 + tail * 4, base - 30 - tail, 1.0)]
    )
    snake_part(c, pal, c_tail, back_sign=-1, phase=3, period=11)

    # Three stacked coils.
    y1 = base - 9.6
    snake_part(c, pal, tube([(27, y1, 8.8), (62, y1 - 0.6, 9.8), (97, y1, 8.6)], smooth=4), back_sign=-1, period=11, belly_at=0.64)
    y2 = base - 25 + sq * 0.5
    snake_part(c, pal, tube([(36, y2, 8.2), (63, y2 - 0.6, 9.0), (91, y2, 8.0)], smooth=4), back_sign=-1, period=11, phase=5.5, belly_at=0.72)
    y3 = base - 39.5 + sq
    snake_part(c, pal, tube([(46, y3, 7.6), (65, y3 - 0.5, 8.2), (84, y3, 7.4)], smooth=4), back_sign=-1, period=11, phase=1, belly_at=0.76)

    hx, hy = 55 + head[0], 43 + head[1] + sq
    nx0, ny0 = 81, y3 - 4
    spine = [
        (nx0, ny0 + 4, 7.8),
        (nx0 + 5 + lean, lerp(ny0, hy, 0.36), 7.6),
        (lerp(nx0, hx, 0.3) + 6 + lean, lerp(ny0, hy, 0.74), 7.4),
        (hx + 15, hy + 2.5, 7.2),
        (hx + 5, hy + 2, 7.4),
    ]
    # Hood, spread behind the upper neck: green rim, purple lining with two pale eye-spots.
    kx, ky = lerp(nx0, hx, 0.3) + 4.5 + lean * 0.8, lerp(ny0, hy, 0.7)
    rx, ry = 18.5 + flare * 2.5, 17.5 + flare
    c.solid(ball(kx, ky, rx, ry), skin, edge, bands=(0.3, 0.62, 0.9, 2.0), lift=-0.08)
    lining = ball(kx - 0.5, ky + 0.5, rx - 3, ry - 3)
    c.solid(lining, band, None, bands=(0.24, 0.52, 0.8, 0.97), seam=False)
    for p in lining:
        c.edge[p] = edge
    for ox in (-rx + 7.5, rx - 7.5):
        spot = disc(kx + ox, ky - 1.5, 2.6, 3.4)
        c.put([p for p in spot if p in lining], pal['belly'][1], edge)
        c.put([p for p in disc(kx + ox, ky - 1.5, 1.2, 1.8) if p in lining], band[0], edge)

    neck = tube(spine)
    snake_part(c, pal, neck, back_sign=1, phase=2, period=11, belly_at=0.26, saddles=False)
    snake_head(c, pal, hx, hy, 1.5, jaw, tongue, eye, fangs=True, eye_size=6)


def serpent_frame(state: str, f: int) -> Image.Image:
    c = Canvas()
    n = FRAMES[state]
    if state == 'idle':
        paint_serpent(
            c,
            head=(wave01(f, n) * 2.2, wave01(f, n, 0.25) * 1.6),
            lean=wave01(f, n, 0.1) * 1.4,
            flare=wave01(f, n, 0.5) * 0.5 + 0.5,
            tongue=(0, 0, 0, 0.5, 1, 0.6, 0, 0)[f],
            eye='half' if f == 7 else 'open',
            tail=wave01(f, n, 0.4),
            jaw=0.12,
        )
    elif state == 'attack':
        hx, hy, jw, ln = ((6, -4, 0.3, 2), (10, -7, 0.7, 4), (11, -8, 1, 4), (-24, 14, 1, -8), (-28, 18, 1, -10), (-20, 12, 0.8, -7), (-8, 3, 0.4, -3), (-1, 0, 0.15, 0))[f]
        paint_serpent(c, head=(hx, hy), jaw=jw, lean=ln, flare=(0.6, 1, 1.3, 1.3, 1.2, 1, 0.7, 0.5)[f], tail=(1, 1, 1, -1, -1, -0.5, 0, 0)[f], squash=(0, 0, 0, 0.5, 0.6, 0.4, 0.2, 0)[f])
    elif state == 'hurt':
        hx, hy = ((11, 4), (14, 6), (9, 4), (4, 1))[f]
        paint_serpent(c, head=(hx, hy), eye='shut', jaw=(0.6, 0.5, 0.3, 0.15)[f], lean=(5, 6, 4, 1)[f], squash=(0.8, 1, 0.6, 0.2)[f], tail=1, flare=-0.6)
    else:  # death
        if f < 3:
            paint_serpent(c, head=(10 + f * 3, 8 + f * 14), eye='shut', jaw=0.4, lean=5 + f, squash=1 + f * 2.0, tail=-1, flare=-1)
        c.outline()
        if f >= 2:
            poof(c, 64, GY - 28, (f - 2) / 5.5, 2.0, salt=2)
            c.outline()
        return c.image()
    c.outline()
    im = c.image()
    return flash(im, 0.55) if state == 'hurt' and f == 0 else im


# ══════════════════════════════════════════════════════════════════════════════════════════════
# Clouds: the squall and the storm cloud
# ══════════════════════════════════════════════════════════════════════════════════════════════

STORM = dict(
    tones=ramp('1a1d3c', '2b3259', '455180', '6a79a8', 'a2b0d4'),
    back=ramp('141630', '1f2446', '303962', '485284', '6a79a8'),
    edge=hexc('0b0d20'),
    # (dx, dy, radius, breathing phase) around the cloud's centre
    front=[(-28, 9, 13, 0.0), (-13, 1, 15, 0.3), (6, -2, 17, 0.6), (23, 5, 14, 0.9), (34, 13, 10, 0.2), (-37, 15, 9, 0.7),
           (-25, 19, 8, 0.5), (-9, 21, 9, 0.1), (8, 21, 9, 0.8), (24, 20, 8, 0.4)],
    behind=[(-21, -9, 11, 0.4), (-4, -16, 13, 0.8), (15, -12, 12, 0.1), (29, -3, 9, 0.6)],
    base=27,
)
SQUALL = dict(
    tones=ramp('44547e', '6a7ea8', '95a9cc', 'c2d2e8', 'f2f7fd'),
    back=ramp('3a486e', '586a94', '7d92b8', 'a6b9d8', 'ccdaee'),
    edge=hexc('20284a'),
    front=[(-15, 5, 10, 0.0), (-4, -1, 12, 0.3), (10, 1, 11, 0.6), (19, 8, 8, 0.9), (-21, 10, 7, 0.5),
           (-12, 12, 7, 0.2), (0, 13, 8, 0.7), (11, 12, 7, 0.4)],
    behind=[(-9, -8, 8, 0.4), (5, -9, 9, 0.8), (17, -3, 7, 0.1)],
    base=18,
)


def cloud_body(c: Canvas, spec: dict, cx: float, cy: float, f: float, n: int, sx: float = 1.0, sy: float = 1.0,
               spread: float = 0.0, shrink: float = 0.0, lift: float = 0.0, glow: float = 0.0) -> set:
    """
    The puffs of a cloud, breathing over an n-frame loop. `spread` pushes them apart and `shrink`
    (0..1) thins them (for breaking up); `lift` brightens the whole cloud; `glow` lights its
    underside from below.
    """
    def puffs(items, salt):
        out = []
        for i, (dx, dy, r, ph) in enumerate(items):
            rr = (r + 0.7 * math.sin((f / n + ph) * math.tau)) * (1 - shrink * (0.7 + 0.5 * noise(i, salt, 3)))
            if rr < 1.3:
                continue
            d = math.hypot(dx, dy) or 1
            push = spread * (0.6 + 0.8 * noise(i, salt, 4))
            out.append(ball(cx + (dx + dx / d * push) * sx, cy + (dy + dy / d * push * 0.8) * sy - spread * 0.25, rr * sx, rr * sy))
        return out

    base = cy + spec['base'] * sy + (spread * 0.6 if spread else 0)
    behind = {p: v for p, v in union(*puffs(spec['behind'], 1)).items()} if puffs(spec['behind'], 1) else {}
    front_list = puffs(spec['front'], 2)
    front = union(*front_list) if front_list else {}
    if not spread:
        behind = {p: v for p, v in behind.items() if p[1] < base}
        front = {p: v for p, v in front.items() if p[1] < base}
    def underlit(x: int, y: int, tone: int, s_: float, u_: float):
        # Lightning inside: the undersides of the puffs catch a warm light.
        ny = front[(x, y)][2]
        if glow <= 0 or spread or y < base - 8 or ny < 0.62 - glow * 0.2:
            return None
        return BOLT[2] if ny > 0.9 and glow > 0.6 else BOLT[1] if ny > 0.78 else spec['tones'][3]

    body = c.solid(behind, spec['back'], spec['edge'], lift=lift - 0.04, seam=False) if behind else set()
    body |= c.solid(front, spec['tones'], spec['edge'], lift=lift, seam=bool(behind), pick=underlit) if front else set()
    return body


def paint_storm_cloud(c: Canvas, f: float, n: int, at: tuple[float, float] = (0, 0), sx: float = 1.0, sy: float = 1.0,
                      eyes: str = 'open', mouth: str = 'scowl', glow: float = 0.0, lift: float = 0.0, flicker: int = 0,
                      strike: float = 0.0, charge: float = 0.0, rain_f: float | None = None) -> None:
    cx, cy = GX + at[0], 58 + at[1]
    base = cy + STORM['base'] * sy
    cloud_body(c, STORM, cx, cy, f, n, sx, sy, lift=lift, glow=glow)

    # Face, low on the side turned toward the hero.
    fx, fy = cx - 12 * sx, cy + 6 * sy
    shut = eyes == 'shut'
    big = 1 if eyes == 'wide' else 0
    glare(c, fx - 12, fy - big, 7, 5 + big, 3, GLOW_EYE, STORM['edge'], shut, pupil=INK if not big else None)
    glare(c, fx + 3, fy - big, 8, 6 + big, -3, GLOW_EYE, STORM['edge'], shut, pupil=INK if not big else None)
    mx, my = fx, fy + 11
    if mouth == 'roar':
        maw = poly([(mx - 8, my - 1), (mx + 7, my - 2), (mx + 6, my + 5), (mx - 6, my + 5)])
        c.put(maw, STORM['edge'])
        c.put([(x, y) for (x, y) in maw if y >= my + 3 and mx - 5 <= x <= mx + 4], BOLT[1])
        c.put([(x, y) for (x, y) in maw if y == my + 4 and mx - 4 <= x <= mx + 3], BOLT[2])
        c.put([(mx - 6 + k * 3, my - 1 + (1 if k % 2 else 0)) for k in range(5)], STORM['tones'][4])
    else:
        frown = [(mx - 7, my + 3), (mx - 5, my + 1), (mx - 2, my), (mx + 2, my), (mx + 5, my + 1), (mx + 7, my + 3)]
        if mouth == 'wince':
            frown = [(mx - 6, my + 1), (mx - 3, my + 2), (mx, my), (mx + 3, my + 2), (mx + 6, my + 1)]
        pts = polyline(frown)
        c.put(pts + [(x, y + 1) for (x, y) in pts], STORM['edge'])

    # Rain under the base.
    rain(c, cx - 30 * sx, cx + 30 * sx, base + 1, GY - 1, f if rain_f is None else rain_f, 9, salt=4)

    # Small flickers of lightning under the cloud while it broods.
    if flicker:
        x0 = cx + (-18 if flicker == 1 else 14)
        bolt(c, zigzag((x0, base - 2), (x0 - 5, base + 13), 3, 2.6, salt=flicker), w=1.2, taper=0.4)
    for i in range(int(charge * 6)):
        a = i * 2.4 + f
        spark(c, cx + math.cos(a) * (40 + 4 * (i % 2)) * sx, cy + 6 + math.sin(a) * 26 * sy, big=i % 3 == 0)
    if strike > 0:
        # The bolt: from the cloud's belly down to the ground in front of it.
        end = (cx - 46, GY - 2)
        pts = zigzag((cx - 14, base - 4), end, 5, 5.5, salt=3)
        bolt(c, pts, w=2.6 * strike + 0.6, taper=0.55)
        if strike > 0.7:
            fork = zigzag(pts[2], (pts[2][0] - 15, pts[2][1] + 4), 3, 2.5, salt=5)
            bolt(c, fork, w=1.3, taper=0.3)
        for i in range(5):
            a = math.pi * (1.05 + 0.9 * i / 4)
            d = 5 + 5 * strike + (i % 2) * 3
            spark(c, end[0] + math.cos(a) * d, end[1] + math.sin(a) * d * 0.7, big=i % 2 == 0)


def storm_cloud_frame(state: str, f: int) -> Image.Image:
    c = Canvas()
    n = FRAMES[state]
    if state == 'idle':
        bob = wave01(f, n) * 1.6
        fl = (0, 0, 1, 0, 0, 0, 2, 0)[f]
        paint_storm_cloud(c, f, n, at=(0, bob), flicker=fl, glow=0.5 if fl else 0.0)
    elif state == 'attack':
        k = (0.3, 0.7, 1.0, 0, 0, 0, 0, 0)[f]
        strike = (0, 0, 0, 1.0, 0.8, 0.35, 0, 0)[f]
        s = (1.03, 1.07, 1.1, 1.02, 0.97, 0.98, 1.0, 1.0)[f]
        paint_storm_cloud(
            c, f, n, at=((2, 4, 5, -3, -4, -2, -1, 0)[f], (-2, -4, -5, 3, 4, 2, 1, 0)[f]), sx=s, sy=s,
            eyes='wide' if f in (1, 2, 3, 4) else 'open', mouth='roar' if 2 <= f <= 5 else 'scowl',
            charge=k, strike=strike, glow=(0.3, 0.6, 1, 1, 0.8, 0.4, 0, 0)[f], lift=(0, 0.03, 0.06, 0.2, 0.1, 0.03, 0, 0)[f],
        )
    elif state == 'hurt':
        sx, sy = ((1.1, 0.86), (1.13, 0.82), (1.06, 0.92), (1.02, 0.98))[f]
        paint_storm_cloud(c, f, n, at=((6, 3), (9, 4), (6, 2), (2, 1))[f], sx=sx, sy=sy, eyes='shut', mouth='wince')
    else:  # death: the cloud breaks into puffs that thin away
        k = f / (n - 1)
        if f < 2:
            paint_storm_cloud(c, f, n, at=(6 - f * 2, 3), sx=1.08, sy=0.9, eyes='shut', mouth='wince', lift=0.1 * f)
        else:
            kk = (f - 1) / (n - 2)
            cloud_body(c, STORM, GX, 58, f, n, spread=26 * ease(kk), shrink=kk ** 1.3, lift=0.12 + 0.2 * kk)
            if f == 2:
                spark(c, GX - 10, 62, big=True)
                spark(c, GX + 14, 52)
    c.outline()
    im = c.image()
    return flash(im, 0.5) if state == 'hurt' and f == 0 else im


def paint_squall(c: Canvas, f: float, n: int, at: tuple[float, float] = (0, 0), sx: float = 1.0, sy: float = 1.0,
                 eyes: str = 'open', blow: float = 0.0, puff: float = 0.0, lift: float = 0.0, tail: float = 1.0) -> None:
    """A racing little raincloud. `puff` swells its cheeks and `blow` (0..1) sends a gust out of its mouth."""
    cx, cy = GX + 2 + at[0], 80 + at[1]
    T, edge = SQUALL['tones'], SQUALL['edge']
    base = cy + SQUALL['base'] * sy

    # Streamers of cloud trailing behind (it is always rushing forward).
    if tail > 0:
        for i, (oy, ln, r) in enumerate(((-6, 26, 4.2), (3, 32, 4.8), (11, 22, 3.6))):
            w = math.sin((f / n + i * 0.33) * math.tau)
            x0, y0 = cx + 14 * sx, cy + oy * sy
            pts = [(x0, y0, r), (x0 + ln * 0.45 * tail, y0 + w * 1.5 - 1, r * 0.75), (x0 + ln * 0.8 * tail, y0 - w * 2, r * 0.45), (x0 + ln * tail, y0 - w * 3 - 1, 0.7)]
            c.solid(tube(pts), SQUALL['back'], edge, seam=False)

    cloud_body(c, SQUALL, cx, cy, f, n, sx * (1 + puff * 0.08), sy * (1 + puff * 0.1), lift=lift)

    # Face: narrowed eyes and a mouth pursed to blow.
    fx, fy = cx - 9 * sx, cy + 1 * sy
    shut = eyes == 'shut'
    glare(c, fx - 8, fy, 5, 4, 2, DARK_EYE, edge, shut, brow=1)
    glare(c, fx + 2, fy, 6, 5, -2, DARK_EYE, edge, shut, brow=1)
    if not shut:
        c.put([(fx - 7, fy + 2), (fx + 6, fy + 2)], DARK_EYE[2])
    mx, my = int(fx - 4), int(fy + 8 + puff)
    if blow > 0 or puff > 0.5:
        c.put([(mx + i, my + j) for i in range(-2, 2) for j in range(-2, 2) if not (i in (-2, 1) and j in (-2, 1))], edge)
        c.put([(mx - 1, my - 1), (mx, my - 1), (mx - 1, my), (mx, my)], DARK_EYE[1])
    else:
        c.put([(mx - 1, my - 1), (mx, my - 1), (mx - 2, my), (mx + 1, my), (mx - 1, my + 1), (mx, my + 1)], edge)
    # Cheeks.
    blush = hexc('e89ab4')
    c.put([(fx - 11, fy + 6), (fx - 10, fy + 6), (fx + 8, fy + 7), (fx + 9, fy + 7)], blush)

    rain(c, cx - 17 * sx, cx + 19 * sx, base + 1, GY - 1, f, 6, slant=0.6, salt=9)

    if blow > 0:
        # A cone of wind: curling white streamers and little puffs flying toward the hero.
        reach = 44 * blow
        for i, oy in enumerate((-8, 0, 8)):
            y0 = my + oy * 0.3
            ln = reach * (0.8 + 0.2 * noise(i, 1, 3))
            x1, y1 = mx - 5 - ln, y0 + oy * 1.0
            s_ = -1 if oy <= 0 else 1
            hook = [(x1 - 3, y1 + s_ * 2.5, 1.5), (x1 - 1, y1 + s_ * 5.5, 1.3), (x1 + 3, y1 + s_ * 4.5, 0.8)] if blow > 0.5 else []
            pts = [(mx - 4, y0, 0.9), (mx - 5 - ln * 0.5, y0 + oy * 0.45, 2.0), (x1, y1, 1.8)] + hook
            c.solid(tube(pts), T[3:], T[1], bands=(0.45,), seam=False)
        for i in range(3):
            d = reach * (0.4 + 0.3 * i)
            c.solid(ball(mx - 5 - d, my - 4 + (i % 2) * 8, 2.8 - i * 0.4), T[2:], T[1], bands=(0.3, 0.7), seam=False)


def spline_pts(pts: list[tuple[float, float]]) -> list:
    return curve(pts, 8)


def curl(x: float, y: float, r: float, up: bool = True) -> list:
    """A little hook at the end of a streak of wind."""
    s = -1 if up else 1
    return curve([(x, y), (x - r, y + s * r * 0.4), (x - r * 0.9, y + s * r * 1.5), (x + r * 0.2, y + s * r * 1.6), (x + r * 0.5, y + s * r * 0.9)], 6)


def squall_frame(state: str, f: int) -> Image.Image:
    c = Canvas()
    n = FRAMES[state]
    if state == 'idle':
        paint_squall(c, f, n, at=(wave01(f, n, 0.25) * 1.2, wave01(f, n) * 2.2), puff=max(0.0, wave01(f, n, 0.5)) * 0.4)
    elif state == 'attack':
        puff = (0.5, 1.0, 1.4, 0.2, 0, 0, 0, 0)[f]
        blow = (0, 0, 0, 0.6, 1.0, 0.8, 0.4, 0)[f]
        paint_squall(c, f, n, at=((3, 5, 6, -4, -5, -3, -1, 0)[f], (-1, -2, -3, 1, 2, 1, 0, 0)[f]), puff=puff, blow=blow,
                     sx=(1, 1, 1, 0.94, 0.92, 0.95, 0.98, 1)[f])
    elif state == 'hurt':
        sx, sy = ((1.1, 0.86), (1.14, 0.8), (1.07, 0.9), (1.02, 0.97))[f]
        paint_squall(c, f, n, at=((5, 2), (8, 3), (5, 2), (2, 0))[f], sx=sx, sy=sy, eyes='shut', tail=0.7)
    else:
        if f < 2:
            paint_squall(c, f, n, at=(5 - f, 2), sx=1.1, sy=0.86, eyes='shut', lift=0.1 * f, tail=0.5)
        else:
            kk = (f - 1) / (n - 2)
            cloud_body(c, SQUALL, GX + 2, 80, f, n, spread=20 * ease(kk), shrink=kk ** 1.3, lift=0.1 + 0.1 * kk)
    c.outline()
    im = c.image()
    return flash(im, 0.5) if state == 'hurt' and f == 0 else im


# ══════════════════════════════════════════════════════════════════════════════════════════════
# Whirlwinds: the gust and the tempest
# ══════════════════════════════════════════════════════════════════════════════════════════════

GUST = dict(tones=ramp('4c5f90', '7489b8', 'a4b9da', 'd3e3f3', 'ffffff'), edge=hexc('222a4c'))
TEMPEST = dict(tones=ramp('1c2048', '2f386c', '4a5994', '7584b8', 'acbadd'), edge=hexc('0b0d24'))
SPRAY = ramp('4f93bd', '9fd3ea', 'e4f6fc', 'ffffff')
LEAF = (hexc('6fc04e'), hexc('b0803c'), hexc('e0c060'))


def funnel(c: Canvas, pal: dict, f: float, n: int, cx: float = GX, levels: int = 7, bottom: float = GY - 4,
           spacing: float = 7.6, r0: float = 3.6, grow: float = 3.1, ry: float = 5.6, sway: float = 1.6,
           lean: float = 0.0, squeeze: float = 1.0, shrink: float = 0.0, scatter: float = 0.0, tails: float = 1.0,
           lift: float = 0.0) -> list:
    """
    A whirlwind: stacked rings of wind, widening upward. Returns each ring's (x, y, rx), or None
    where it has thinned away. `lean` bends the top toward the hero, `squeeze` packs the rings
    together, `shrink` (0..1) thins them and `scatter` knocks them out of line.
    """
    T, edge = pal['tones'], pal['edge']
    rings: list = []
    for i in range(levels):
        t = i / (levels - 1)
        y = bottom - i * spacing * squeeze - scatter * i * 0.9
        rx = (r0 + grow * i) * max(0.0, 1 - shrink * (1.25 - 0.45 * noise(i, 3, 6)))
        x = cx - lean * t ** 1.6 + sway * math.sin((f / n + i * 0.14) * math.tau) * (0.25 + 0.75 * t)
        x += scatter * (noise(i, 1, 5) - 0.5) * 9
        if rx < 1.4:
            rings.append(None)
            continue
        rings.append((x, y, rx))
        yy = min(ry, rx * 0.8 + 1.6)
        # A wisp flicking off the ring's end, on alternate sides.
        if tails > 0 and i > 0:
            side = 1 if i % 2 else -1
            w = math.sin((f / n + i * 0.31) * math.tau)
            ln = (3.5 + 2.5 * w + t * 3) * tails
            if ln > 1.5:
                wisp = tube([(x + side * (rx - 2), y + 0.5, min(2.6, yy * 0.6)), (x + side * (rx + ln * 0.6), y - 1 - w, 1.7), (x + side * (rx + ln), y - 3.5 - w * 1.5, 0.6)], smooth=3)
                c.solid(wisp, T, edge, seam=False, lift=lift)
        ring = c.solid(ball(x, y, rx, yy), T, edge, seam=T[0], lift=lift)
        # Streaks sliding round the ring show it turning.
        a = (f / n) * math.tau + i * 1.9
        for k, (off, tone, dy) in enumerate(((0.0, 4, -1), (2.6, 1, 1))):
            ang = a + off
            if math.sin(ang) < -0.25 or rx < 5:
                continue
            sx_ = x + math.cos(ang) * rx * 0.72
            ln = max(2, int(rx * 0.42 * (0.4 + 0.6 * abs(math.sin(ang)))))
            for q in range(ln):
                p_ = (int(sx_ - ln / 2 + q), int(y + dy + (1 if yy > 4.5 and k == 0 else 0) - 1))
                if p_ in ring and c.px.get(p_) in T[1:4]:
                    c.px[p_] = T[tone]
    # The open mouth of the funnel.
    top = rings[-1]
    if top and top[2] > 8:
        x, y, rx = top
        hole = disc(x, y - ry * 0.42, rx - 4.5, ry * 0.36)
        c.tint(hole, T[1])
        c.tint([(px, py) for (px, py) in hole if (px, py - 1) not in hole], T[0])
    return rings


def debris(c: Canvas, rings: list, f: float, n: int, colours, count: int = 3, salt: int = 0) -> None:
    """Leaves and chips carried round the whirlwind (only where they pass in front)."""
    live = [r for r in rings if r]
    if not live:
        return
    for k in range(count):
        ring = live[int((0.25 + 0.6 * noise(k, 2, salt)) * (len(live) - 1))]
        a = (f / n) * math.tau + k * 2.3
        if math.sin(a) < 0.1:
            continue
        x, y = int(ring[0] + math.cos(a) * (ring[2] + 3)), int(ring[1] + 2 - 3 * math.sin(a))
        c.put([(x, y), (x + 1, y)], colours[k % len(colours)], INK)


def ground_puffs(c: Canvas, x: float, f: float, tones: list, edge, spread: float = 9.0, size: float = 2.6) -> None:
    """Dust or spray kicked up where a whirlwind touches the ground."""
    for i, side in enumerate((-1, 1, -1, 1)):
        ph = ((f + i * 2) % 4) / 4
        d = spread * (0.5 + ph * 0.8) + i
        r = size * (1.15 - ph * 0.7)
        if r > 1.0:
            c.solid(ball(x + side * d, GY - 1.5 - ph * 3, r), tones, edge, bands=(0.25, 0.6, 0.9), seam=False)


def paint_gust(c: Canvas, f: float, n: int, at: float = 0.0, lean: float = 0.0, squeeze: float = 1.0, eyes: str = 'open',
               shrink: float = 0.0, scatter: float = 0.0, lift: float = 0.0, streaks: float = 0.0) -> None:
    T, edge = GUST['tones'], GUST['edge']
    cx = GX + at
    if not shrink:
        ground_puffs(c, cx, f, T[1:], edge)
    rings = funnel(c, GUST, f, n, cx=cx, lean=lean, squeeze=squeeze, shrink=shrink, scatter=scatter, lift=lift)
    if not shrink:
        debris(c, rings, f, n, LEAF, salt=1)
    face = rings[4]
    if face and shrink < 0.25:
        fx, fy = face[0] - 4 - lean * 0.12, face[1] - 5 * squeeze
        shut = eyes == 'shut'
        glare(c, fx - 8, fy, 5, 5, 2, DARK_EYE, edge, shut, brow=1)
        glare(c, fx + 2, fy, 6, 6, -2, DARK_EYE, edge, shut, brow=1)
        if not shut:
            c.put([(fx - 7, fy + 3), (fx + 6, fy + 3)], DARK_EYE[2])
    if streaks > 0:
        # Speed lines as it whips forward.
        for i, (oy, ln) in enumerate(((-44, 16), (-33, 22), (-21, 14))):
            x0 = cx - lean * 0.9 - 16 - i * 3
            c.put(line((x0, GY + oy), (x0 - ln * streaks, GY + oy + 2)), T[4], T[1])


def gust_frame(state: str, f: int) -> Image.Image:
    c = Canvas()
    n = FRAMES[state]
    if state == 'idle':
        paint_gust(c, f, n, lean=wave01(f, n, 0.2) * 1.5)
    elif state == 'attack':
        lean = (-5, -8, -10, 16, 22, 15, 6, 1)[f]
        paint_gust(c, f * 2, n, at=(2, 4, 5, -3, -5, -3, -1, 0)[f], lean=lean, squeeze=(0.94, 0.88, 0.84, 1.06, 1.08, 1.04, 1.0, 1.0)[f],
                   streaks=(0, 0, 0, 0.7, 1.0, 0.5, 0, 0)[f])
    elif state == 'hurt':
        paint_gust(c, f, n, at=(4, 6, 4, 1)[f], lean=(-6, -9, -5, -2)[f], squeeze=(0.8, 0.74, 0.85, 0.95)[f], scatter=(0.8, 1.0, 0.6, 0.2)[f], eyes='shut')
    else:
        k = f / (n - 1)
        paint_gust(c, f, n, at=4 - f * 0.5, lean=-6 + f, squeeze=0.8 + k * 0.5, scatter=1 + k * 2.5, shrink=max(0.0, (f - 1) / (n - 2)) ** 1.2, eyes='shut', lift=0.1 * k)
    c.outline()
    im = c.image()
    return flash(im, 0.5) if state == 'hurt' and f == 0 else im


TEMPEST_CAP = dict(
    tones=STORM['tones'], back=STORM['back'], edge=STORM['edge'],
    front=[(-25, 4, 10, 0.0), (-11, -2, 12.5, 0.3), (5, -4, 13.5, 0.6), (20, 0, 11.5, 0.9), (31, 6, 8, 0.2), (-34, 8, 7, 0.7),
           (-20, 10, 7, 0.5), (-5, 11, 8, 0.1), (10, 11, 8, 0.8), (23, 10, 7, 0.4)],
    behind=[(-15, -9, 9, 0.4), (0, -13, 10, 0.8), (16, -10, 9, 0.1)],
    base=15,
)


def paint_tempest(c: Canvas, f: float, n: int, at: float = 0.0, lean: float = 0.0, squeeze: float = 1.0, eyes: str = 'open',
                  mouth: str = 'scowl', shrink: float = 0.0, scatter: float = 0.0, lift: float = 0.0, strike: float = 0.0,
                  flicker: int = 0, glow: float = 0.0, cap: bool = True) -> None:
    """A waterspout under a thunderhead: the storm that will not let go."""
    T, edge = TEMPEST['tones'], TEMPEST['edge']
    cx = GX + 2 + at
    if not shrink:
        ground_puffs(c, cx, f, SPRAY, hexc('1f5a86'), spread=12, size=3.4)
    rings = funnel(c, TEMPEST, f, n, cx=cx, levels=8, bottom=GY - 4, spacing=7.4 , r0=4.6, grow=3.2, ry=5.8, sway=2.0,
                   lean=lean, squeeze=squeeze, shrink=shrink, scatter=scatter, lift=lift + 0.1)
    top = rings[-1]
    if not shrink:
        debris(c, rings, f, n, (SPRAY[2], SPRAY[1], SPRAY[3]), count=5, salt=4)
    face = rings[5]
    if face and shrink < 0.25:
        fx, fy = face[0] - 5 - lean * 0.1, face[1] - 5.5 * squeeze
        shut = eyes == 'shut'
        big = 1 if eyes == 'wide' else 0
        glare(c, fx - 10, fy - big, 6, 5 + big, 3, GLOW_EYE, edge, shut, pupil=None if big else INK)
        glare(c, fx + 3, fy - big, 7, 6 + big, -3, GLOW_EYE, edge, shut, pupil=None if big else INK)
        lower = rings[4]
        if lower:
            mx, my = int(lower[0] - 5 - lean * 0.08), int(lower[1] - 2)
            if mouth == 'roar':
                maw = poly([(mx - 6, my - 2), (mx + 6, my - 2), (mx + 4, my + 4), (mx - 4, my + 4)])
                c.put(maw, edge)
                c.put([(x, y) for (x, y) in maw if y >= my + 2 and mx - 3 <= x <= mx + 2], BOLT[1])
                c.put([(mx - 5 + k * 3, my - 2 + (k % 2)) for k in range(4)], T[4])
            else:
                pts = polyline([(mx - 6, my + 2), (mx - 3, my), (mx + 3, my), (mx + 6, my + 2)])
                c.put(pts + [(x, y + 1) for (x, y) in pts], edge)
    if cap and top:
        ccx, ccy = top[0] + 1, top[1] - 13 * squeeze
        cloud_body(c, TEMPEST_CAP, ccx, ccy, f, n, lift=lift, glow=glow, shrink=shrink * 0.9, spread=scatter * 3 if shrink else 0.0)
        if flicker and not shrink:
            x0 = ccx + (-24 if flicker == 1 else 22)
            bolt(c, zigzag((x0, ccy + 12), (x0 + (-6 if flicker == 1 else 5), ccy + 30), 3, 3.0, salt=flicker), w=1.3, taper=0.4)
        if strike > 0:
            end = (cx - 48, GY - 3)
            pts = zigzag((ccx - 22, ccy + 12), end, 6, 6.0, salt=8)
            bolt(c, pts, w=2.8 * strike + 0.6, taper=0.5)
            if strike > 0.7:
                bolt(c, zigzag(pts[3], (pts[3][0] - 14, pts[3][1] + 7), 3, 2.5, salt=6), w=1.3, taper=0.3)
            for i in range(5):
                a = math.pi * (1.05 + 0.9 * i / 4)
                d = 5 + 5 * strike + (i % 2) * 3
                spark(c, end[0] + math.cos(a) * d, end[1] + math.sin(a) * d * 0.7, big=i % 2 == 0)


def tempest_frame(state: str, f: int) -> Image.Image:
    c = Canvas()
    n = FRAMES[state]
    if state == 'idle':
        fl = (0, 1, 0, 0, 0, 2, 0, 0)[f]
        paint_tempest(c, f, n, lean=wave01(f, n, 0.2) * 2.0, flicker=fl, glow=0.5 if fl else 0.0)
    elif state == 'attack':
        paint_tempest(
            c, f * 2, n, at=(2, 4, 5, -2, -3, -2, -1, 0)[f], lean=(-4, -7, -9, 9, 12, 8, 3, 1)[f],
            squeeze=(0.96, 0.92, 0.9, 1.03, 1.04, 1.02, 1.0, 1.0)[f], eyes='wide' if 1 <= f <= 4 else 'open',
            mouth='roar' if 2 <= f <= 5 else 'scowl', strike=(0, 0, 0, 1.0, 0.8, 0.35, 0, 0)[f],
            glow=(0.3, 0.6, 1, 1, 0.8, 0.4, 0, 0)[f], lift=(0, 0.03, 0.06, 0.18, 0.1, 0.03, 0, 0)[f],
        )
    elif state == 'hurt':
        paint_tempest(c, f, n, at=(4, 6, 4, 1)[f], lean=(-6, -9, -5, -2)[f], squeeze=(0.84, 0.78, 0.88, 0.96)[f], scatter=(0.8, 1.0, 0.6, 0.2)[f], eyes='shut', mouth='scowl')
    else:
        k = f / (n - 1)
        paint_tempest(c, f, n, at=4 - f * 0.5, lean=-6 + f, squeeze=0.85 + k * 0.35, scatter=1 + k * 2.5, shrink=max(0.0, (f - 1) / (n - 2)) ** 1.2, eyes='shut', lift=0.1 * k)
    c.outline()
    im = c.image()
    return flash(im, 0.5) if state == 'hurt' and f == 0 else im


# ══════════════════════════════════════════════════════════════════════════════════════════════
# Waves: the rising wave and the flood surge
# ══════════════════════════════════════════════════════════════════════════════════════════════

SEA = dict(
    tones=ramp('123c66', '1b6294', '2c90c4', '5ec2e4', 'b0ecf8'),
    edge=hexc('0a1c3a'), deep=ramp('0b2748', '103660'),
    foam=ramp('6fa9d2', 'bfe2f3', 'ffffff'), foam_edge=hexc('1b5a8c'),
    eye=ramp('9fd0ea', 'ffffff', 'ffffff'),
)
SURGE = dict(
    tones=ramp('0e2a56', '15487f', '1f72b0', '46a4d8', '9adcf2'),
    edge=hexc('06122c'), deep=ramp('081c3c', '0c2a52'),
    foam=ramp('6fa9d2', 'bfe2f3', 'ffffff'), foam_edge=hexc('164a80'),
    eye=ramp('ffd23a', 'fff6a0', 'ffffff'),
)


def foam(c: Canvas, pal: dict, x: float, y: float, r: float) -> None:
    if r >= 1.2:
        c.solid(ball(x, y, r), pal['foam'], pal['foam_edge'], bands=(0.22, 0.6), seam=False)


def droplets(c: Canvas, pal: dict, pts: list) -> None:
    for (x, y, big) in pts:
        x, y = int(x), int(y)
        if (x, y) in c.px:
            continue
        c.put([(x, y)], pal['foam'][2], pal['foam_edge'])
        if big:
            c.put([(x + 1, y), (x, y + 1), (x + 1, y + 1)], pal['foam'][1], pal['foam_edge'])


def paint_wave(c: Canvas, pal: dict, f: float, n: int, k: float = 1.0, cx: float = GX + 5, rise: float = 1.0, reach: float = 0.0,
               dip: float = 0.0, eyes: str = 'open', flat: float = 0.0, second: bool = False, splash: float = 0.0,
               lift: float = 0.0) -> None:
    """
    A wave that has reared up to break. `k` is its size, `rise` stretches it taller, `reach`
    throws the crest toward the hero and `dip` drops its tip; `flat` (0..1) lets it sink back
    into a puddle; `splash` (0..1) bursts spray where the crest lands.
    """
    T, edge = pal['tones'], pal['edge']
    g = GY
    live = 1 - flat
    h = rise * live  # height factor
    bob = math.sin(f / n * math.tau)

    # The water it stands in.
    pool_r = (31 + 9 * flat) * k
    pool = {p: v for p, v in ball(cx + 2 * k, g - 1.2, pool_r, 3.4).items() if p[1] <= g}
    c.solid(pool, T, edge, bands=(0.3, 0.7, 0.93, 2.0), seam=False)
    if live < 0.12:
        # Only ripples are left.
        for i in range(3):
            rr = pool_r * (0.35 + 0.25 * i)
            c.tint([(int(cx + 2 * k - rr + q), g - 2 - (i % 2)) for q in range(int(rr * 0.5))], T[3])
        return

    def P(x: float, y: float, r: float) -> tuple[float, float, float]:
        return (cx + x * k, g + y * k * h, r * k * (0.55 + 0.45 * live))

    # A second, smaller crest behind (the flood surge is a whole wall of water).
    if second:
        back = tube([P(24, -14, 11), P(20, -27, 9.5), P(13 - reach * 0.2 / k, -37, 7.5), P(5 - reach * 0.4 / k, -40 + dip * 0.2 / k, 5.4),
                     P(-1 - reach * 0.5 / k, -36 + dip * 0.4 / k, 3.4), P(-2 - reach * 0.5 / k, -30 + dip * 0.5 / k, 1.8)])
        c.smooth(T, c.solid(back, T[:4], edge, lift=lift - 0.06, seam=False))
        for i, (bx, by, br) in enumerate(((14, -45, 3.0), (7, -47, 3.4), (0, -44, 3.0), (-4, -38, 2.4))):
            foam(c, pal, cx + (bx - reach * 0.4 / k) * k, g + (by + dip * 0.3 / k) * k * h + bob * (i % 2), br * k * 0.8)

    # The body: a mound of water with the crest rising out of it and curling over.
    mound = {p: v for p, v in ball(cx + 7 * k, g - 3 * k, 27 * k, 21 * k * max(0.2, h)).items() if p[1] <= g - 1}
    rk, dk = reach / k, dip / k
    spine = [P(3, -17, 12.6), P(-4, -30, 11.2), P(-12 - rk * 0.3, -40, 8.8), P(-21 - rk * 0.7, -43 + dk * 0.3, 6.4),
             P(-28 - rk, -38.5 + dk * 0.7, 4.4), P(-30.5 - rk, -31 + dk, 2.6)]
    crest = tube(spine)
    body_surf = union(mound, crest)
    # The hollow under the curl, dark as a mouth.
    tipx, tipy = spine[-1][0], spine[-1][1]
    hollow = poly([(spine[3][0] + 1 * k, spine[3][1] + 4 * k), (spine[2][0] + 6 * k, spine[2][1] + 8 * k), (cx - 6 * k, g - 16 * k * h),
                   (cx - 16 * k, g - 14 * k * h), (tipx + 3 * k, tipy + 3 * k)])
    body = c.solid(body_surf, T, edge, lift=lift, seam=False)
    c.smooth(T, body)
    c.put([p_ for p_ in hollow if p_ in body], pal['deep'][0], edge)
    c.put([p_ for p_ in hollow if p_ in body and (p_[0] + 1, p_[1]) in hollow and (p_[0], p_[1] - 1) in hollow and (p_[0], p_[1] - 2) in hollow], pal['deep'][1], edge)

    # Water streaming up the back into the crest: bright dashes that climb frame by frame.
    for j, (x0, y0, x1, y1, x2, y2) in enumerate(((27, -7, 16, -17, 5, -24), (22, -3, 9, -11, -1, -15), (30, -13, 20, -23, 9, -31))):
        path = curve([(cx + x0 * k, g + y0 * k * h), (cx + x1 * k, g + y1 * k * h), (cx + x2 * k, g + y2 * k * h)], 10)
        for i, p_ in enumerate(path):
            if p_ in body and c.px.get(p_) in T[:4] and (i - int(f * 2) + j * 3) % 9 < 5:
                c.px[p_] = T[min(4, T.index(c.px[p_]) + 1)]
    # A glint along the top of the crest.
    for p_ in curve([(spine[1][0] - 3 * k, spine[1][1] - 6 * k), (spine[2][0] - 1 * k, spine[2][1] - 5 * k), (spine[3][0], spine[3][1] - 3.5 * k)], 8):
        if p_ in body and c.px.get(p_) in T[2:4]:
            c.px[p_] = T[4]

    # Face on the front of the crest.
    if live > 0.5:
        ex, ey = spine[1][0] - 7 * k, spine[1][1] - 3 * k + (1 - live) * 6
        s = 1 if k > 1.3 else 0
        shut = eyes == 'shut'
        pupil = None if eyes == 'wide' else INK
        glare(c, ex - 5 - s, ey, 5 + s, 5 + s, 2, pal['eye'], edge, shut, pupil=pupil, brow=1 + s)
        glare(c, ex + 3 + s, ey - 1, 6 + s, 6 + s, -2, pal['eye'], edge, shut, pupil=pupil, brow=1 + s)

    # Foam: along the crest, dripping from its tip, and churning round the foot.
    for i, t in enumerate((1, 2, 3, 4)):
        sx_, sy_, sr = spine[t]
        ox, oy = ((-2, -9), (-1, -8.5), (1, -6.5), (-1, -4.5))[i]
        foam(c, pal, sx_ + ox * k * 0.9, sy_ + oy * k * 0.92 + bob * (i % 2) * 0.8, (3.9 - i * 0.35) * k ** 0.8 * (0.6 + 0.4 * live))
    foam(c, pal, tipx - 0.5 * k, tipy + 1.5 * k, 3.1 * k ** 0.8)
    foam(c, pal, tipx + 1.5 * k, tipy + 5 * k + bob, 2.0 * k ** 0.8)
    drip = (f * 1.7) % 6
    droplets(c, pal, [(tipx - 1 * k, tipy + (8 + drip) * k, False), (tipx + 3 * k, tipy + (10 + (drip + 3) % 6) * k, k > 1.3)])
    churn = (f % 4) / 4
    for i, (bx, br) in enumerate(((-22, 3.6), (-14, 2.8), (33, 3.2), (26, 2.4), (-29, 2.2))):
        foam(c, pal, cx + bx * k, g - 1.6 - br * 0.3 + math.sin((f / n + i * 0.3) * math.tau) * 0.8, br * k ** 0.6 * (0.8 + 0.3 * math.sin((churn + i * 0.37) * math.tau)))
    if splash > 0:
        sx0 = tipx - 2
        for i in range(6):
            a = math.pi * (1.0 + i / 5)
            d = (6 + 12 * splash) * k ** 0.7
            foam(c, pal, sx0 + math.cos(a) * d * 1.1, g - 3 + math.sin(a) * d * 0.9, (3.4 - splash * 1.6) * k ** 0.7 * (0.8 + 0.4 * noise(i, 2, 5)))
        droplets(c, pal, [(sx0 + math.cos(math.pi * (1.1 + i * 0.2)) * (12 + 14 * splash) * k ** 0.7,
                           g - 4 + math.sin(math.pi * (1.1 + i * 0.2)) * (12 + 16 * splash) * k ** 0.7, i % 2 == 0) for i in range(5)])


def wave_frames(pal: dict, k: float, cx: float, second: bool, reach_k: float):
    def frame(state: str, f: int) -> Image.Image:
        c = Canvas()
        n = FRAMES[state]
        kw = dict(k=k, cx=cx, second=second)
        if state == 'idle':
            paint_wave(c, pal, f, n, rise=1 + wave01(f, n) * 0.035, reach=wave01(f, n, 0.3) * 1.5, dip=wave01(f, n, 0.55) * 1.5, **kw)
        elif state == 'attack':
            rise = (1.06, 1.14, 1.2, 1.02, 0.9, 0.9, 0.96, 1.0)[f]
            reach = (-3, -6, -8, 10, 15, 12, 5, 1)[f] * reach_k
            dip = (-2, -4, -5, 9, 19, 17, 6, 1)[f] * reach_k
            paint_wave(c, pal, f, n, rise=rise, reach=reach, dip=dip, eyes='wide' if 2 <= f <= 4 else 'open',
                       splash=(0, 0, 0, 0, 0.5, 1.0, 0, 0)[f], **kw)
        elif state == 'hurt':
            paint_wave(c, pal, f, n, rise=(0.84, 0.78, 0.86, 0.95)[f], reach=(-6, -8, -5, -2)[f], dip=(3, 5, 3, 1)[f], eyes='shut', **kw)
            droplets(c, pal, [(cx + (10 + i * 9) * k, GY - (34 + (i % 2) * 8 + f * 3) * k, i % 2 == 0) for i in range(3)] if f < 3 else [])
        else:  # death: it loses its shape and falls back into the water
            flat = (0.1, 0.3, 0.55, 0.78, 0.92, 1.0, 1.0, 1.0)[f]
            paint_wave(c, pal, f, n, rise=1 - flat * 0.3, reach=-4 - f, dip=f * 2.5, eyes='shut', flat=flat if f < 7 else 1.0, **kw)
            if 2 <= f <= 6:
                t = (f - 2) / 4
                droplets(c, pal, [(cx + (i - 3) * 9 * k * (0.6 + t), GY - (6 + 26 * math.sin(math.pi * min(1.0, t * 0.9 + 0.1)) * (0.6 + 0.4 * noise(i, 1, 2))) * k, i % 2 == 0) for i in range(7)])
            if f == 7:
                c.px.clear()
                c.edge.clear()
                for i in range(2):
                    c.put([(int(cx - 10 * k + i * 12 * k + q), GY - 1 - i) for q in range(int(7 * k))], pal['tones'][3])
        c.outline()
        im = c.image()
        return flash(im, 0.5) if state == 'hurt' and f == 0 else im

    return frame


# ══════════════════════════════════════════════════════════════════════════════════════════════

FOES = {
    'hissling': hissling_frame,
    'serpent': serpent_frame,
    'storm-cloud': storm_cloud_frame,
    'squall': squall_frame,
    'gust': gust_frame,
    'tempest': tempest_frame,
    'wave': wave_frames(SEA, 1.0, GX + 5, False, 1.0),
    'flood-surge': wave_frames(SURGE, 1.5, GX - 2, True, 0.75),
}


def sheet_for(name: str) -> Image.Image:
    sheet = Image.new('RGBA', (W * COLS, H * len(ROWS)), (0, 0, 0, 0))
    for r, state in enumerate(ROWS):
        for f in range(FRAMES[state]):
            sheet.paste(FOES[name](state, f), (f * W, r * H))
    return sheet


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*', help=f'which to paint (default all): {", ".join(FOES)}')
    ap.add_argument('--preview', action='store_true')
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name in args.names or list(FOES):
        sheet = sheet_for(name)
        out = OUT_DIR / f'{name}.png'
        sheet.save(out, optimize=True)
        colours = {c for c in sheet.getdata() if c[3] > 0}
        print(f'wrote {out.relative_to(ROOT)} ({sheet.width}x{sheet.height}, {len(colours)} colours)')
        if args.preview:
            bg = Image.new('RGBA', sheet.size, (126, 134, 150, 255))
            bg.alpha_composite(sheet)
            PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
            pv = PREVIEW_DIR / f'{name}.png'
            bg.resize((bg.width * 4, bg.height * 4), Image.NEAREST).save(pv)
            print(f'wrote {pv.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
