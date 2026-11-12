#!/usr/bin/env python3
"""
Paints the original foes that appear in the game, pixel by pixel. Deterministic, needs Pillow.

    python3 scripts/art/paint_foes.py [name…]    # writes src/assets/foes/<name>.png
    python3 scripts/art/paint_foes.py --preview  # also art/foe-previews/<name>.png (4x)

  hissling     a little coiled viper (the whisper of temptation)
  serpent      the great hooded serpent of the garden

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
SMOKE_EDGE = hexc('3d3a5c')


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
        return c.image()
    c.outline()
    im = c.image()
    return flash(im, 0.55) if state == 'hurt' and f == 0 else im


# ══════════════════════════════════════════════════════════════════════════════════════════════

FOES = {
    'hissling': hissling_frame,
    'serpent': serpent_frame,
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
