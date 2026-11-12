#!/usr/bin/env python3
"""
Paints the backdrop layers pixel by pixel. All art is original and deterministic.

    python3 scripts/art/paint_backdrops.py                  # every environment
    python3 scripts/art/paint_backdrops.py garden deep      # only these
    python3 scripts/art/paint_backdrops.py --preview        # also art/backdrop-previews/<env>.png
    python3 scripts/art/paint_backdrops.py --res 3 garden   # chunkier pixels (see --res)

Shapes are described in native units (a 512-wide strip, a 560x200 sky) and shown 3x larger in
the game. `--res` is how many screen pixels one painted pixel covers:
  3  chunky pixel art with ordered dithering, the same pixel size as the hero
  2  finer pixel art, painted 1.5x larger (default; the look chosen for the game)
  1  smooth: painted at full resolution, colours blended instead of dithered

Layers per environment (any may be missing; the game then draws that layer in code):
  <env>-sky.png       static, bottom anchored just below the ground line
  <env>-far.png       strip, tiles horizontally, transparent top (distant hills)
  <env>-mid.png       strip, tiles horizontally, transparent top (trees, buildings)
  <env>-ground.png    strip, tiles horizontally, top rows hold tufts on transparency
  <env>-landmark.png  optional, static, bottom-centre anchored (ship, tower)

Strips are painted with wrap-around (shapes that cross an edge reappear on the other side, noise
and ridge lines are periodic), and the script checks that the left and right edges match before
saving. The game works out each layer's scale from its width. Needs Pillow.
"""

from __future__ import annotations

import argparse
import math
import random
import sys
from pathlib import Path
from typing import Callable, Iterable, Optional

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'backdrops'
PREVIEW = ROOT / 'art' / 'backdrop-previews'

SCALE = 3  # native → screen
T = 512  # strip width, native
SKY_W, SKY_H = 560, 200
FAR_H, MID_H, GROUND_H = 104, 96, 112
PAD = 2  # transparent native rows under far and mid (no seam when the tile sprite wraps)

# Set by main() from --res.
K = 1.0  # image pixels per native pixel
SMOOTH = False  # blend colours instead of dithering

Color = tuple[int, int, int]
Px = Optional[Color]


def hexc(s: str) -> Color:
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def ramp(*cs: str) -> list[Color]:
    return [hexc(c) for c in cs]


def lerp_c(a: Color, b: Color, f: float) -> Color:
    return (round(a[0] + (b[0] - a[0]) * f), round(a[1] + (b[1] - a[1]) * f), round(a[2] + (b[2] - a[2]) * f))


# ── Canvas ────────────────────────────────────────────────────────────────────


class Canvas:
    """
    RGB pixels or None (transparent), sized native size x K. Painting helpers take native
    coordinates and loop over image pixels. `wrap` makes x wrap around (tileable strips).
    """

    def __init__(self, w: int, h: int, wrap: bool = False):
        self.nw, self.nh = w, h
        self.w, self.h, self.wrap = round(w * K), round(h * K), wrap
        self.px: list[Px] = [None] * (self.w * self.h)

    def _x(self, x: int) -> Optional[int]:
        if self.wrap:
            return x % self.w
        return x if 0 <= x < self.w else None

    def put(self, x: int, y: int, c: Px) -> None:
        xx = self._x(x)
        if xx is not None and 0 <= y < self.h:
            self.px[y * self.w + xx] = c

    def get(self, x: int, y: int) -> Px:
        xx = self._x(x)
        if xx is None or not 0 <= y < self.h:
            return None
        return self.px[y * self.w + xx]

    def image(self) -> Image.Image:
        img = Image.new('RGBA', (self.w, self.h))
        img.putdata([(c[0], c[1], c[2], 255) if c else (0, 0, 0, 0) for c in self.px])
        return img


def native(p: int) -> float:
    """Centre of image pixel p in native units."""
    return (p + 0.5) / K


def span(a: float, b: float) -> range:
    """Image pixels covering native [a, b]."""
    return range(math.floor(a * K), math.ceil(b * K) + 1)


# ── Colour picking: dithered or blended ───────────────────────────────────────

BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def bayer(x: int, y: int) -> float:
    return (BAYER4[y & 3][x & 3] + 0.5) / 16


def shade(r: list[Color], t: float, x: int, y: int) -> Color:
    """Colour from a ramp for t in [0, 1]: ordered dithering between neighbours, or blended."""
    t = min(max(t, 0.0), 1.0)
    v = t * (len(r) - 1)
    i = int(v)
    if i + 1 >= len(r):
        return r[-1]
    if SMOOTH:
        return lerp_c(r[i], r[i + 1], v - i)
    return r[i + 1] if v - i > bayer(x, y) else r[i]


def mix_put(cv: Canvas, x: int, y: int, c: Color, w: float) -> None:
    """Paints c with coverage w: dithered on/off, or blended over what is there."""
    if w <= 0:
        return
    if SMOOTH:
        base = cv.get(x, y)
        if base is None:
            if w >= 0.5:
                cv.put(x, y, c)
        else:
            cv.put(x, y, lerp_c(base, c, min(1.0, w)))
    elif w > bayer(x, y):
        cv.put(x, y, c)


# ── Noise ─────────────────────────────────────────────────────────────────────


def _hash(ix: int, iy: int, s: int) -> float:
    n = (ix * 374761393 + iy * 668265263 + s * 1442695041) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535


def vnoise(x: float, y: float, cx: float, cy: float, s: int, period: Optional[int]) -> float:
    """Smooth value noise in [0, 1]. With a period (a multiple of cx), it repeats in x."""
    gx, gy = x / cx, y / cy
    ix, iy = math.floor(gx), math.floor(gy)
    fx, fy = gx - ix, gy - iy
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    nx = max(1, round(period / cx)) if period else 1 << 20
    a = _hash(ix % nx, iy, s)
    b = _hash((ix + 1) % nx, iy, s)
    c = _hash(ix % nx, iy + 1, s)
    d = _hash((ix + 1) % nx, iy + 1, s)
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy


def fbm(x: float, y: float, s: int, period: Optional[int] = T, cells=(64, 32, 16, 8, 4), sy=1.0):
    """
    Fractal noise in about [0, 1], in native units; `sy` stretches cells vertically.
    At higher resolutions, finer octaves (down to one image pixel) add detail.
    """
    cells = list(cells)
    c = cells[-1] / 2
    while K > 1 and c >= 1 / K - 1e-9:
        cells.append(c)
        c /= 2
    total, amp, norm = 0.0, 1.0, 0.0
    for i, c in enumerate(cells):
        total += amp * vnoise(x, y, c, c * sy, s + i * 7919, period)
        norm += amp
        amp *= 0.55
    return total / norm


def wave(x: float, waves: Iterable[tuple[int, float, float]]) -> float:
    """Sum of sines whose periods divide the strip width (k cycles per strip), so it tiles."""
    return sum(a * math.sin(2 * math.pi * k * x / T + p) for k, a, p in waves)


# ── Shapes (all coordinates native) ───────────────────────────────────────────

LIGHT = (0.55, -0.83)  # towards the light (upper right)


def blob(
    cv: Canvas,
    circles: list[tuple[float, float, float]],
    r: list[Color],
    *,
    outline: Px = None,
    seed: int = 0,
    tex: float = 0.25,
    tex_cell: float = 3,
    light=None,
    bias: float = 0.0,
    cut_below: Optional[float] = None,
    under: Optional[float] = None,
) -> set:
    """
    Fills a union of circles with round shading lit from `light`, a leafy/puffy noise texture,
    and an optional outline one image pixel wide. `cut_below` gives a flat bottom; `under`
    darkens the last native rows above that line. Returns the filled image-pixel set.
    """
    lx, ly = light or LIGHT
    inside: dict[tuple[int, int], float] = {}
    for py in span(min(cy - rr for _, cy, rr in circles) - 1, max(cy + rr for _, cy, rr in circles) + 1):
        v = native(py)
        if cut_below is not None and v > cut_below + 1:
            continue
        for px in span(min(cx - rr for cx, _, rr in circles) - 1, max(cx + rr for cx, _, rr in circles) + 1):
            u = native(px)
            best, sh = -1.0, 0.0
            wsum, wsh = 0.0, 0.0
            for cx, cy, rr in circles:
                dx, dy = u - cx, v - cy
                d = math.hypot(dx, dy)
                k = 1 - d / rr
                nz = max(0.0, 1 - (d / rr) ** 2) ** 0.5
                s = (dx / rr * lx + dy / rr * ly) * 0.8 + nz * 0.35
                if k > best:
                    best, sh = k, s
                if SMOOTH and k > -0.2:  # blend overlapping puffs instead of hard seams
                    w = (k + 0.2) ** 3
                    wsum += w
                    wsh += w * s
            if SMOOTH and wsum > 0:
                sh = wsh / wsum
            if best >= 0:
                if under is not None and v > under - 2.5:
                    sh -= 0.35
                inside[(px, py)] = sh
    out: set = set()
    for (px, py), sh in inside.items():
        u, v = native(px), native(py)
        n = fbm(u, v, seed, T if cv.wrap else None, cells=(tex_cell * 2, tex_cell))
        t = 0.42 + sh * 0.55 + (n - 0.5) * 2 * tex + bias
        edge = any((px + dx, py + dy) not in inside for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if edge and outline is not None:
            # Selective outline: dark on the shadow side, a mid tone where the light hits.
            c = outline if sh < 0.25 else r[max(0, int((len(r) - 1) * 0.35))]
        else:
            c = shade(r, t, px, py)
        cv.put(px, py, c)
        out.add((px % cv.w if cv.wrap else px, py))
    return out


def dot(cv: Canvas, cx: float, cy: float, rad: float, c: Color) -> None:
    """A flat round dot (one pixel at native size when rad is 0.5 and the centre is x+0.5)."""
    for py in span(cy - rad, cy + rad):
        for px in span(cx - rad, cx + rad):
            if math.hypot(native(px) - cx, native(py) - cy) <= rad + 1e-6:
                cv.put(px, py, c)


def ball(cv: Canvas, cx: float, cy: float, rx: float, ry: float, r: list[Color]) -> None:
    """A small lit sphere/ellipse (fruit, pebble): dark lower left to highlight upper right."""
    for py in span(cy - ry, cy + ry):
        for px in span(cx - rx, cx + rx):
            dx, dy = (native(px) - cx) / rx, (native(py) - cy) / ry
            if dx * dx + dy * dy <= 1 + 1e-6:
                t = 0.5 + 0.6 * (dx * LIGHT[0] + dy * LIGHT[1])
                cv.put(px, py, shade(r, t, px, py) if SMOOTH else r[min(len(r) - 1, max(0, round(t * (len(r) - 1))))])


def pixel_set_ok(s: set, px: int, py: int, offsets: Iterable[float], w: int) -> bool:
    """True if every native offset around image pixel (px, py) is in the set."""
    return all(((px + round(dx * K)) % w, py + round(dy * K)) in s for dx in offsets for dy in offsets)


def scatter_points(rng: random.Random, n: int, x0: float, x1: float, min_gap: float) -> list[float]:
    """n x positions spread over [x0, x1) with jitter but no two closer than min_gap."""
    pts: list[float] = []
    step = (x1 - x0) / n
    for i in range(n):
        for _ in range(20):
            x = x0 + (i + rng.uniform(0.15, 0.85)) * step
            if all(min(abs(x - p), T - abs(x - p)) >= min_gap for p in pts):
                break
        pts.append(x)
    return pts


def ridge_fill(
    cv: Canvas,
    top: Callable[[float], float],
    r: list[Color],
    *,
    seed: int,
    bottom: Optional[float] = None,
    rim: float = 1,
    fade: float = 0.012,
    tex: float = 0.22,
    slope_gain: float = 0.12,
    base_t: float = 0.55,
    cells=(32, 16, 8, 4),
    sy: float = 1.0,
    rim_t: float = 0.35,
    extra: Optional[Callable[[float, float, float], float]] = None,
    slope_depth: Optional[float] = 10.0,
) -> list[float]:
    """
    Fills from a ridge line down: slope-lit, rim highlight, darkening with depth, textured.
    Returns the ridge height at each native column.
    """
    bottom = cv.nh if bottom is None else bottom
    for px in range(cv.w):
        u = native(px)
        y0 = top(u)
        facing = (top(u - 3) - top(u + 3)) / 6  # >0 rises to the right
        for py in range(max(0, round(y0 * K)), round(bottom * K)):
            v = native(py)
            d = v - y0
            n = fbm(u, v, seed, T if cv.wrap else None, cells=cells, sy=sy)
            lit = 1 if LIGHT[0] >= 0 else -1  # which slopes face the light
            # Slopes facing the light are brighter near the ridge line (all the way down for cliffs).
            reach = 1.0 if slope_depth is None else math.exp(-max(0.0, d) / slope_depth)
            t = base_t - facing * slope_gain * lit * reach - d * fade + (n - 0.5) * 2 * tex
            if d < rim:
                t += rim_t
            if extra is not None:
                t += extra(u, v, d)
            cv.put(px, py, shade(r, t, px, py))
    return [top(x + 0.5) for x in range(cv.nw)]


# ── Sky helpers ───────────────────────────────────────────────────────────────


def sky_gradient(cv: Canvas, r: list[Color], gamma: float = 1.0) -> None:
    for py in range(cv.h):
        t = (native(py) / cv.nh) ** gamma
        for px in range(cv.w):
            cv.put(px, py, shade(r, t, px, py))


def glow(cv: Canvas, cx: float, cy: float, r0: float, r1: float, r: list[Color], power: float = 1.6) -> None:
    """A halo: full r[-1] inside r0, fading back to the sky by r1."""
    for py in span(cy - r1, cy + r1):
        for px in span(cx - r1, cx + r1):
            d = math.hypot(native(px) - cx, native(py) - cy)
            if d > r1:
                continue
            k = 1.0 if d <= r0 else (1 - (d - r0) / (r1 - r0)) ** power
            mix_put(cv, px, py, shade(r, k, px, py), k * len(r))


def disc(cv: Canvas, cx: float, cy: float, rad: float, core: Color, rim: Color) -> None:
    for py in span(cy - rad, cy + rad):
        for px in span(cx - rad, cx + rad):
            d = math.hypot(native(px) - cx, native(py) - cy)
            if d <= rad:
                cv.put(px, py, rim if d > rad - 1.3 else core)


def cumulus(
    cv: Canvas, rng: random.Random, cx: float, base: float, width: float, height: float,
    r: list[Color], seed: int,
) -> None:
    """A flat-bottomed cumulus cloud made of puffs, lit from the upper right."""
    circles = []
    n = max(3, int(width / 9))
    for i in range(n):
        u = (i + 0.5) / n
        hump = math.sin(math.pi * u) ** 0.8
        rad = (height * 0.45) * (0.55 + 0.6 * hump) * rng.uniform(0.85, 1.15)
        x = cx - width / 2 + u * width + rng.uniform(-3, 3)
        y = base - rad * 0.55 - hump * height * 0.35
        circles.append((x, y, rad))
    blob(cv, circles, r, seed=seed, tex=0.12, tex_cell=4, cut_below=base, under=base, bias=0.05)


def streak_cloud(cv: Canvas, rng: random.Random, cx: float, y: float, w: float, c: Color, c2: Color):
    """Thin flat cloud bands near the horizon."""
    for row in range(3):
        half = w / 2 * (1 - row * 0.3) * rng.uniform(0.8, 1.0)
        mid = cx + rng.uniform(-w * 0.15, w * 0.15)
        for py in span(y + row, y + row + 1 - 1e-6):
            for px in span(mid - half, mid + half):
                edge = abs(native(px) - mid) / half
                if edge <= 1:
                    mix_put(cv, px, py, c if row < 2 else c2, 1 if edge < 0.8 else (1 - edge) * 5)


# ── Ground helpers ────────────────────────────────────────────────────────────


def tufts(cv: Canvas, rng: random.Random, surface: float, r: list[Color], count: int, max_h: int = 5) -> None:
    """Grass blades poking up above the ground's top edge (on transparency)."""

    def blade(x: float, h: float, lean: float) -> None:
        width = max(1, round(K * 0.7))
        for py in span(surface - h, surface - 1e-6):
            f = (surface - native(py)) / h  # 0 at the root, 1 at the tip
            if f > 1:
                continue
            xc = x + lean * f * f
            c = shade(r[-3:], f, 0, py) if SMOOTH else (r[-1] if f > 0.8 else r[-2] if f > 0.2 else r[-3])
            p0 = math.floor(xc * K)
            for k in range(width if f < 0.7 else max(1, width - 1)):
                cv.put(p0 + k, py, c)

    for _ in range(count):
        x = rng.randrange(T) + 0.5
        h = rng.randint(2, max_h)
        lean = rng.choice((-1, 0, 0, 1))
        blade(x, h, lean)
        if rng.random() < 0.5:  # a second blade
            blade(x + 1, max(1, h - rng.randint(1, 2)), -lean * 0.5)


def flower(cv: Canvas, x: int, y: int, petal: Color, center: Color, shadow: Color, big: bool):
    """At native size: a plus of petals with a centre (big) or a single dot, with a shadow."""
    cx, cy = x + 0.5, y + 0.5
    if big:
        for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
            dot(cv, cx + dx * 0.9, cy + dy * 0.9, 0.55, petal)
        dot(cv, cx, cy, 0.5, center)
        dot(cv, cx, cy + 2, 0.5, shadow)
        dot(cv, cx + 1, cy + 2, 0.5, shadow)
    else:
        dot(cv, cx, cy + 1, 0.5, shadow)
        dot(cv, cx, cy, 0.5, petal)


# ── Trees ─────────────────────────────────────────────────────────────────────


def trunk(cv: Canvas, x: float, base: float, top: float, w: float, r: list[Color], seed: int) -> None:
    """A tapering trunk with a root flare: lit on the right, shadowed on the left, outlined."""
    for py in span(top, base + 1 - 1e-6):
        u = min(1.0, (native(py) - top) / max(1, base - top))
        half = w / 2 * (0.75 + 0.25 * u) + (max(0, u - 0.85) / 0.15) ** 2 * w * 0.6
        lx, rx = round((x - half) * K), round((x + half) * K)
        for px in range(lx, rx + 1):
            if px in (lx, rx):
                c = r[0]
            else:
                p = (px - lx) / max(1, rx - lx)
                n = vnoise(native(px) * 3, native(py), 2, 5, seed, T * 3)
                c = shade(r[1:], p * 0.9 + (n - 0.5) * 0.5, px, py)
            cv.put(px, py, c)


def fruit(cv: Canvas, x: float, y: float, r: list[Color]) -> None:
    """A round fruit two native pixels across, centred at (x, y)."""
    ball(cv, x, y, 1.0, 1.0, r)


# ── More shapes: limbs, polygons, outlines ────────────────────────────────────


def stroke(cv: Canvas, pts: list[tuple[float, float]], w0: float, w1: float, r: list[Color], outline: Px = None):
    """A tapering limb along a polyline (branch, pole, stem), shaded across its width."""
    n = len(pts) - 1
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        wa, wb = w0 + (w1 - w0) * i / n, w0 + (w1 - w0) * (i + 1) / n
        m = max(wa, wb) / 2 + 1
        dx, dy = x1 - x0, y1 - y0
        l2 = dx * dx + dy * dy or 1e-9
        for py in span(min(y0, y1) - m, max(y0, y1) + m):
            v = native(py)
            for px in span(min(x0, x1) - m, max(x0, x1) + m):
                u = native(px)
                f = min(1.0, max(0.0, ((u - x0) * dx + (v - y0) * dy) / l2))
                ox, oy = u - (x0 + dx * f), v - (y0 + dy * f)
                hw = max((wa + (wb - wa) * f) / 2, 0.55 / K)
                d = math.hypot(ox, oy)
                if d > hw:
                    continue
                s = (ox * LIGHT[0] + oy * LIGHT[1]) / hw
                if outline is not None and d > hw - 1 / K and s < 0.1:
                    cv.put(px, py, outline)
                else:
                    cv.put(px, py, shade(r, 0.5 + s * 0.45, px, py))


def poly_pixels(pts: list[tuple[float, float]]) -> list[tuple[int, int]]:
    """Image pixels whose centres fall inside a polygon (native coordinates)."""
    out = []
    ys = [p[1] for p in pts]
    for py in span(min(ys), max(ys)):
        v = native(py)
        xs = []
        for i in range(len(pts)):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
            if (y0 <= v < y1) or (y1 <= v < y0):
                xs.append(x0 + (v - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            for px in span(a, b):
                if a <= native(px) <= b:
                    out.append((px, py))
    return out


def outline_pass(cv: Canvas, color: Color) -> None:
    """Darkens every opaque pixel that touches transparency (a 1px silhouette outline)."""
    edge = [
        (x, y)
        for y in range(cv.h)
        for x in range(cv.w)
        if cv.get(x, y) is not None
        and any(cv.get(x + dx, y + dy) is None for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    ]
    for x, y in edge:
        cv.put(x, y, color)


def worley(u: float, v: float, cell: float, seed: int, period: int = T) -> tuple[float, float, float, float]:
    """
    Cell noise (stones, cracked earth), tiling in x: distances to the nearest and second-nearest
    jittered points, and the offset (ox, oy) from the nearest one.
    """
    nx = max(1, round(period / cell))
    cell = period / nx  # a whole number of cells per strip, so it tiles
    gx, gy = math.floor(u / cell), math.floor(v / cell)
    f1 = f2 = 1e9
    ox = oy = 0.0
    for ix in range(gx - 1, gx + 2):
        for iy in range(gy - 1, gy + 2):
            jx, jy = _hash(ix % nx, iy, seed), _hash(ix % nx, iy, seed + 1)
            dx, dy = u - (ix + 0.15 + 0.7 * jx) * cell, v - (iy + 0.15 + 0.7 * jy) * cell
            d = math.hypot(dx, dy)
            if d < f1:
                f1, f2, ox, oy = d, f1, dx, dy
            elif d < f2:
                f2 = d
    return f1, f2, ox, oy


def cloud_field(
    cv: Canvas, r: list[Color], seed: int, y0: float, y1: float, coverage: float,
    *, sy: float = 0.45, cells=(96, 48, 24, 12, 6), soft: float = 6.0, rim: float = 2.5,
) -> None:
    """
    Layered cloud cover from noise: dense where the noise is high, lit along top edges, fading
    out towards y0 and y1. coverage 0..1 is how much of the band is cloud.
    """
    mid, half = (y0 + y1) / 2, (y1 - y0) / 2

    def density(u: float, v: float) -> float:
        env = max(0.0, 1 - abs(v - mid) / half) ** 0.6
        return (fbm(u, v, seed, None, cells=cells, sy=sy) - (1 - coverage) * 0.75 - 0.15) * env

    for py in span(y0, y1):
        v = native(py)
        for px in range(cv.w):
            u = native(px)
            d = density(u, v)
            if d <= 0:
                continue
            above = density(u - 1.5, v - rim)
            lit = max(0.0, d - above)
            t = 0.25 + d * 1.4 + lit * 3.0
            mix_put(cv, px, py, shade(r, t, px, py), d * soft)


def mist(cv: Canvas, y: float, h: float, c: Color, strength: float, seed: int) -> None:
    """A soft horizontal haze band (strongest in the middle row), broken up by noise."""
    for py in span(y - h, y + h):
        v = native(py)
        k = max(0.0, 1 - abs(v - y) / h)
        for px in range(cv.w):
            n = fbm(native(px), v, seed, T if cv.wrap else None, cells=(64, 32, 16), sy=0.3)
            mix_put(cv, px, py, c, k * strength * (0.5 + n))


def stars(cv: Canvas, rng: random.Random, n: int, weight: Callable[[float, float], float], colors: list[Color]):
    """Single-pixel stars, a few with a cross of light; weight(x, y) thins them out."""
    for _ in range(n):
        x, y = rng.uniform(0, cv.nw), rng.uniform(0, cv.nh)
        bright = rng.random() < 0.1
        if rng.random() > weight(x, y):
            continue
        cx, cy = math.floor(x) + 0.5, math.floor(y) + 0.5
        dot(cv, cx, cy, 0.5, colors[-1] if bright else rng.choice(colors))
        if bright:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                dot(cv, cx + dx, cy + dy, 0.5, colors[0])


def swells(x: float, base: float, waves: list[tuple[int, float, float]], peak: float = 0.0) -> float:
    """Water surface height: sines with optional cusped crests (peak > 0 sharpens the tops)."""
    y = base - wave(x, waves)
    if peak:
        y -= peak * sum((1 - abs(math.sin(math.pi * k * x / T + p))) ** 3 for k, _, p in waves[:2])
    return y


# ── Buildings and landmarks ───────────────────────────────────────────────────


def brick(u: float, v: float, seed: int, bw: float = 4, bh: float = 2) -> tuple[bool, float]:
    """(is mortar, brick tone 0..1) for a running-bond brick wall at (u, v)."""
    row = math.floor(v / bh)
    off = (row % 2) * bw / 2
    col = math.floor((u + off) / bw)
    fx, fy = (u + off) - col * bw, v - row * bh
    mortar = fx * K < 1 or fy * K < 1
    return mortar, _hash(col % max(1, round(T / bw)), row, seed)


def building(
    cv: Canvas, rng: random.Random, x: float, base: float, w: float, h: float, r: list[Color],
    dark: Color, seed: int,
) -> None:
    """A flat-roofed mud-brick house: lit front, shadowed side, parapet, small windows, a door."""
    side = max(2.0, w * 0.2)
    shadow_right = LIGHT[0] < 0
    for py in span(base - h, base):
        v = native(py)
        if not base - h <= v <= base:
            continue
        for px in span(x, x + w):
            u = native(px)
            if not x <= u <= x + w:
                continue
            rel = (u - x) / w
            in_side = rel > 1 - side / w if shadow_right else rel < side / w
            mortar, tone = brick(u, v, seed)
            t = 0.62 + (tone - 0.5) * 0.2 - (0.32 if in_side else 0) - (0.14 if mortar else 0)
            if v - (base - h) < 1.5:
                t = 0.95 if not in_side else 0.6
            edge = (u - x) * K < 1 or (x + w - u) * K < 1 or (v - (base - h)) * K < 1
            cv.put(px, py, r[0] if edge else shade(r, t, px, py))
    # Windows in a row, a door at the bottom.
    fx0, fx1 = (x + 2, x + w - side - 1) if shadow_right else (x + side + 1, x + w - 2)
    for wy in range(int(base - h + 4), int(base - 8), 7):
        for wx in range(int(fx0 + 1), int(fx1 - 2), 6):
            if rng.random() < 0.7:
                for (px, py) in poly_pixels([(wx, wy), (wx + 2, wy), (wx + 2, wy + 3), (wx, wy + 3)]):
                    cv.put(px, py, dark)
    dx = rng.uniform(fx0 + 1, max(fx0 + 1, fx1 - 4))
    for (px, py) in poly_pixels([(dx, base - 6), (dx + 3, base - 6), (dx + 3, base), (dx, base)]):
        cv.put(px, py, dark)


def palm(cv: Canvas, x: float, base: float, h: float, trunk_r: list[Color], leaf_r: list[Color], seed: int):
    """A date palm: a gently curved ringed trunk and a crown of drooping fronds."""
    top = (x + h * 0.12, base - h)
    stroke(cv, [(x, base), (x + h * 0.05, base - h * 0.5), top], 2.4, 1.6, trunk_r, outline=trunk_r[0])
    for a in (-2.7, -2.2, -1.6, -1.0, -0.45, 0.1, -3.1):
        ex, ey = top[0] + math.cos(a) * h * 0.42, top[1] + math.sin(a) * h * 0.22 + h * 0.14
        mx, my = (top[0] + ex) / 2, min(top[1], ey) - h * 0.08
        stroke(cv, [top, (mx, my), (ex, ey)], 2.2, 0.6, leaf_r, outline=leaf_r[0])


def ark(hull_r: list[Color], house_r: list[Color], roof_r: list[Color], dark: Color, outline: Color) -> Canvas:
    """The great wooden ship: planked hull with raised ends, a long house, a shingled roof."""
    cv = Canvas(124, 48)
    hull = [(0, 18), (9, 26), (115, 26), (124, 17), (118, 33), (108, 46), (16, 46), (6, 33)]
    for px, py in poly_pixels(hull):
        u, v = native(px), native(py)
        depth = (v - 22) / 24
        mortar, tone = brick(u, v, 9, bw=14, bh=3)
        t = 0.72 - depth * 0.55 + (tone - 0.5) * 0.12 - (0.18 if mortar else 0)
        if v < 27.5:
            t = 0.95  # top rail
        cv.put(px, py, shade(hull_r, t, px, py))
    roof = [(20, 11), (104, 11), (93, 2), (31, 2)]
    for px, py in poly_pixels([(26, 10), (98, 10), (98, 26), (26, 26)]):
        u, v = native(px), native(py)
        seam = (u % 3) * K < 1
        t = 0.6 + (vnoise(u, v, 3, 8, 5, None) - 0.5) * 0.3 - (0.2 if seam else 0) - (v - 10) * 0.012
        if v < 12:
            t -= 0.35  # shadow under the eaves
        cv.put(px, py, shade(house_r, t, px, py))
    for wx in range(32, 94, 8):
        for px, py in poly_pixels([(wx, 13), (wx + 3, 13), (wx + 3, 15.5), (wx, 15.5)]):
            cv.put(px, py, dark)
    for px, py in poly_pixels([(58, 17), (66, 17), (66, 26), (58, 26)]):
        cv.put(px, py, dark)
    for px, py in poly_pixels(roof):
        u, v = native(px), native(py)
        row = (v - 2) % 2.5
        t = 0.75 - (v - 2) * 0.03 + (_hash(math.floor(u / 3 + (math.floor(v / 2.5) % 2) * 0.5), math.floor(v / 2.5), 3) - 0.5) * 0.2
        if row * K < 1:
            t -= 0.25
        cv.put(px, py, shade(roof_r, t, px, py))
    outline_pass(cv, outline)
    return cv


def ziggurat(rng: random.Random, r: list[Color], dark: Color, wood_r: list[Color], outline: Color) -> Canvas:
    """A tall stepped tower of brick, unfinished: ramp, doorways, scaffolding on top."""
    cv = Canvas(136, 150)
    cx, base, tiers, th = 68, 150, 7, 16
    widths = [124 - i * 15 for i in range(tiers)]
    lit_left = LIGHT[0] < 0
    for i, w in enumerate(widths):
        x0, y0 = cx - w / 2, base - (i + 1) * th
        top_rows = 2.0
        for py in span(y0, y0 + th):
            v = native(py)
            if not y0 <= v < y0 + th:
                continue
            for px in span(x0, x0 + w):
                u = native(px)
                if not x0 <= u <= x0 + w:
                    continue
                rel = (u - x0) / w
                shadow = rel > 0.8 if lit_left else rel < 0.2
                mortar, tone = brick(u, v, 20 + i)
                t = 0.6 + (tone - 0.5) * 0.18 - (0.3 if shadow else 0) - (0.13 if mortar else 0)
                if v - y0 < top_rows:
                    t = 0.92 if not shadow else 0.62  # the ledge catches the light
                elif v - y0 < top_rows + 1.5 and i + 1 < tiers and abs(u - cx) < widths[i + 1] / 2 + 1:
                    t -= 0.35  # shadow cast by the tier above
                if i == tiers - 1 and v - y0 < 4 and _hash(math.floor(u / 4), math.floor(v / 2), 77) < 0.45:
                    continue  # ragged, unfinished top course
                cv.put(px, py, shade(r, t, px, py))
        if i < tiers - 1:
            dw = 4 if i < 3 else 3
            for px, py in poly_pixels([(cx - dw / 2, y0 + th - 7), (cx + dw / 2, y0 + th - 7), (cx + dw / 2, y0 + th), (cx - dw / 2, y0 + th)]):
                cv.put(px, py, dark)
            dot(cv, cx, y0 + th - 7, dw / 2, dark)
    # A ramp climbing the front from the lower left to the third tier.
    ramp_top = base - 3 * th
    ramp = [(6, base), (18, base), (cx - widths[3] / 2 + 6, ramp_top), (cx - widths[3] / 2 - 6, ramp_top)]
    for px, py in poly_pixels(ramp):
        u, v = native(px), native(py)
        step = (v % 2.5) * K < 1
        t = 0.8 - (0.25 if step else 0) + (u - 6) * 0.002
        cv.put(px, py, shade(r, t, px, py))
    # Scaffolding: poles, cross-beams and a ladder above the unfinished top.
    top = base - tiers * th
    for x, h in ((cx - 12, 20), (cx + 12, 16), (cx - 2, 24)):
        stroke(cv, [(x, top + 2), (x, top - h)], 1.4, 1.1, wood_r)
    stroke(cv, [(cx - 15, top - 12), (cx + 15, top - 10)], 1.0, 1.0, wood_r)
    stroke(cv, [(cx - 13, top - 5), (cx + 13, top - 5)], 1.0, 1.0, wood_r)
    for k in range(4):
        stroke(cv, [(cx + 3, top - 2 - k * 4), (cx + 7, top - 2 - k * 4)], 0.8, 0.8, wood_r)
    stroke(cv, [(cx + 3, top + 1), (cx + 3, top - 16)], 0.8, 0.8, wood_r)
    stroke(cv, [(cx + 7, top + 1), (cx + 7, top - 16)], 0.8, 0.8, wood_r)
    outline_pass(cv, outline)
    return cv


# ── Saving and checks ─────────────────────────────────────────────────────────


def edge_mismatch(cv: Canvas) -> float:
    """How much the wrap seam (last column → first) differs, relative to typical neighbours."""

    def diff(a: Px, b: Px) -> float:
        if a is None and b is None:
            return 0.0
        if a is None or b is None:
            return 255.0
        return sum(abs(p - q) for p, q in zip(a, b)) / 3

    def col_diff(x0: int, x1: int) -> float:
        return sum(diff(cv.get(x0, y), cv.get(x1, y)) for y in range(cv.h)) / cv.h

    # A continuous seam looks like any other pair of neighbouring columns; a broken one stands
    # out above nearly all of them (crisp textures such as cracked earth have a wide spread).
    inner = sorted(col_diff(x, x + 1) for x in range(cv.w - 1))
    typical = inner[int(len(inner) * 0.99)] + 1.0
    return col_diff(cv.w - 1, 0) / typical


def save(cv: Canvas, name: str, out: Path) -> Path:
    if cv.wrap:
        m = edge_mismatch(cv)
        if m > 1.0:
            raise SystemExit(f'{name}: left/right edges do not match (seam score {m:.2f})')
    out.mkdir(parents=True, exist_ok=True)
    path = out / f'{name}.png'
    colors = sorted({c for c in cv.px if c is not None})
    if len(colors) > 255:  # blended styles: full-colour PNG
        cv.image().save(path, optimize=True)
        return path
    index = {c: i + 1 for i, c in enumerate(colors)}
    img = Image.new('P', (cv.w, cv.h))
    pal = [0, 0, 0] + [v for c in colors for v in c]
    img.putpalette(pal + [0] * (768 - len(pal)))
    img.putdata([index[c] if c else 0 for c in cv.px])
    has_alpha = any(c is None for c in cv.px)
    img.save(path, optimize=True, **({'transparency': 0} if has_alpha else {}))
    return path


# ── Environments ──────────────────────────────────────────────────────────────


class Layers:
    def __init__(self) -> None:
        self.sky = Canvas(SKY_W, SKY_H)
        self.far = Canvas(T, FAR_H, wrap=True)
        self.mid = Canvas(T, MID_H, wrap=True)
        self.ground = Canvas(T, GROUND_H, wrap=True)
        self.landmark: Optional[Canvas] = None


def paint_garden() -> Layers:
    """Eden: a bright morning, misty blue hills, fruit trees in a meadow, flowers in the grass."""
    global LIGHT
    LIGHT = (0.55, -0.83)
    L = Layers()

    # Sky: blue to pale horizon, a soft sun upper right, puffy clouds.
    rng = random.Random(4)
    sky_r = ramp('#3b6fc4', '#4a82d2', '#5c96dc', '#73abe5', '#8fc0ec', '#addaf2', '#cdeaf6', '#e6f5f8')
    sky_gradient(L.sky, sky_r, gamma=1.15)
    glow(L.sky, 440, 72, 12, 36, ramp('#c3e6f4', '#ddf0ee', '#f2f6dc', '#fff8d2'))
    disc(L.sky, 440, 72, 10, hexc('#fffdf0'), hexc('#fff3c4'))
    cloud_r = ramp('#9cb8dc', '#bcd2ec', '#dce9f6', '#f4f9fd', '#ffffff')
    for i, (cx, base, w, h) in enumerate(
        [(70, 78, 70, 30), (210, 58, 52, 22), (330, 96, 84, 34), (530, 100, 60, 26), (590, 124, 50, 18)]
    ):
        cumulus(L.sky, rng, cx % SKY_W, base, w, h, cloud_r, seed=100 + i)
    for cx, y, w in [(140, 150, 90), (400, 158, 120), (270, 168, 70)]:
        streak_cloud(L.sky, rng, cx, y, w, hexc('#eef8fa'), hexc('#d6edf5'))

    # Far: two ranges of misty hills, then green hills dotted with distant trees.
    rng = random.Random(5)
    far = L.far
    haze_r = ramp('#8fb4c6', '#9cc0cf', '#aacbd6', '#b9d6dd', '#c8e0e3')
    ridge_fill(
        far,
        lambda x: 36 - wave(x, [(1, 12, 0.3), (2, 8, 1.9), (5, 4, 1.1), (11, 1.5, 2.0)])
        - fbm(x, 0, 11, cells=(32, 16, 8)) * 8,
        haze_r, seed=12, bottom=FAR_H - PAD, fade=0.006, tex=0.1, base_t=0.6, slope_gain=0.35,
    )
    haze2_r = ramp('#78a6a6', '#86b2ae', '#95bfb5', '#a6cbbd', '#b8d6c4')
    ridge_fill(
        far,
        lambda x: 56 - wave(x, [(2, 7, 2.6), (3, 5, 0.4), (8, 2, 1.3)]) - fbm(x, 3, 16, cells=(16, 8)) * 4,
        haze2_r, seed=17, bottom=FAR_H - PAD, fade=0.006, tex=0.12, base_t=0.6, slope_gain=0.3,
    )
    hill_r = ramp('#4f8f78', '#5d9e7e', '#6dad84', '#80bc8a', '#98ca94', '#b2d8a2')
    tops = ridge_fill(
        far,
        lambda x: 74 - wave(x, [(3, 6, 0.8), (5, 3.5, 0.2), (9, 1.5, 1.4)]) - fbm(x, 5, 13, cells=(16, 8)) * 3,
        hill_r, seed=14, bottom=FAR_H - PAD, fade=0.01, tex=0.15, base_t=0.6,
    )
    tree_r = ramp('#2f6152', '#3d7660', '#4f8a6a', '#66a074')
    for x in scatter_points(rng, 40, 0, T, 6):
        y = round(tops[int(x) % T]) + rng.randint(2, 12)
        rad = rng.uniform(1.8, 3.2)
        blob(far, [(x, y - rad, rad), (x + rad * 0.8, y - rad * 0.7, rad * 0.8)], tree_r, seed=15, tex=0.1)
        dot(far, round(x) + 0.5, y + 0.5, 0.5, tree_r[0])

    # Mid: a meadow ridge with fruit trees and flowering bushes.
    rng = random.Random(6)
    pick = random.Random(7)  # fruit and blossom spots (depends on resolution)
    mid = L.mid
    meadow_r = ramp('#2f7044', '#3c8148', '#4b934c', '#5ea552', '#76b85a', '#93ca66')
    mtops = ridge_fill(
        mid,
        lambda x: 74 - wave(x, [(2, 3, 0.5), (4, 2, 1.7), (11, 0.8, 0.4)]),
        meadow_r, seed=21, bottom=MID_H - PAD, fade=0.012, tex=0.18, base_t=0.62,
    )
    bark_r = ramp('#3a2418', '#5a3a22', '#74502c', '#8f6a3a', '#a8834c')
    leaf_r = ramp('#24583e', '#2f6c42', '#3d8046', '#4f964c', '#68ab54', '#88c062', '#a9d47a')
    blossom_r = ramp('#b65a7a', '#d87c98', '#f0a6ba', '#ffd2dc')
    red_r = ramp('#8e2a2a', '#d94a3a', '#ff9a7a')
    gold_r = ramp('#b07418', '#eab238', '#fff0a0')
    xs = scatter_points(rng, 7, 0, T, 56)
    for i, x in enumerate(xs):
        s = rng.uniform(0.8, 1.15) * (1.25 if i == 3 else 1.0)
        base = round(mtops[int(x) % T]) + 12
        top = base - round(30 * s)
        trunk(mid, x, base, top, 4.2 * s, bark_r, seed=30 + i)
        circles = []
        for k in range(7):
            a = -math.pi / 2 + (k - 3) * 0.55
            dist = 11 * s * (0.4 if k == 3 else 1.0)
            circles.append((x + math.cos(a) * dist * 1.25, top - 6 * s + math.sin(a) * dist, rng.uniform(9, 12) * s))
        circles.append((x, top - 4 * s, 13 * s))
        flowering = i % 3 == 2
        canopy = blob(mid, circles, leaf_r, outline=leaf_r[0], seed=40 + i, tex=0.22, tex_cell=2)
        pts = sorted(canopy)
        fr = gold_r if i % 2 else red_r
        for _ in range(int(len(pts) / K / K / (40 if flowering else 70))):
            px, py = pick.choice(pts)
            if pixel_set_ok(canopy, px, py, (-1, 0, 1, 2), mid.w):
                u, v = native(px), native(py)
                if flowering:
                    dot(mid, u, v, 0.5, pick.choice(blossom_r[1:]))
                    if pick.random() < 0.5:
                        dot(mid, u + 1, v, 0.5, blossom_r[3])
                else:
                    fruit(mid, u + 0.5, v + 0.5, fr)
    for i, x in enumerate(scatter_points(rng, 12, 0, T, 14)):
        base = round(mtops[int(x) % T]) + 9
        rad = rng.uniform(4, 6.5)
        bush = blob(
            mid, [(x - rad * 0.6, base - rad * 0.8, rad * 0.8), (x + rad * 0.5, base - rad, rad)],
            leaf_r, outline=leaf_r[0], seed=60 + i, tex=0.2, tex_cell=2, cut_below=base,
        )
        pc = [blossom_r[2], hexc('#ffffff'), gold_r[1]][i % 3]
        for _ in range(4):
            px, py = pick.choice(sorted(bush))
            if pixel_set_ok(bush, px, py, (-1, 0, 1), mid.w):
                dot(mid, native(px), native(py), 0.5, pc)

    # Ground: lush grass with streaky texture, tufts on the top edge, flowers and stones.
    rng = random.Random(8)
    g = L.ground
    grass_r = ramp('#2c6a3c', '#357a40', '#418c44', '#4f9e48', '#62b04e', '#7cc256', '#9ad264')
    surface = 5
    for py in range(round(surface * K), g.h):
        v = native(py)
        d = v - surface
        for px in range(g.w):
            u = native(px)
            n = fbm(u, v, 70, cells=(32, 16, 8))
            streak = vnoise(u, v, 2, 6, 71, T)
            if K > 1:  # individual blades
                streak = streak * 0.5 + vnoise(u, v, 2 / 3, 3, 73, T) * 0.5
            clump = fbm(u, v, 72, cells=(24, 12))
            t = 0.7 - d * 0.0045 + (n - 0.5) * 0.5 + (streak - 0.5) * 0.25 - max(0, clump - 0.64) * 0.7
            if d < 1:
                t = 0.95
            elif d < 2:
                t += 0.2
            g.put(px, py, shade(grass_r, t, px, py))
    tufts(g, rng, surface, grass_r, 150)
    stone_r = ramp('#5e6a62', '#87928a', '#b2bab0')
    for _ in range(14):
        x, y = rng.randrange(T), rng.randrange(surface + 8, GROUND_H - 4)
        w = rng.randint(2, 4)
        dot(g, x + w / 2, y + 2.2, w / 2 * 0.8, grass_r[0])
        ball(g, x + w / 2, y + 1, w / 2, 1.0, stone_r)
    petals = [hexc('#ff8fb1'), hexc('#ffffff'), hexc('#ffd84a'), hexc('#c49bff'), hexc('#ff6a5a')]
    centers = [hexc('#ffd84a'), hexc('#ffc23a'), hexc('#e08a20'), hexc('#ffe9a0'), hexc('#ffd84a')]
    for _ in range(46):  # clusters of one kind, bigger nearer the viewer
        cx = rng.randrange(T)
        cy = surface + 4 + (GROUND_H - surface - 10) * rng.random() ** 0.9
        k = rng.randrange(len(petals))
        for _ in range(rng.randint(3, 7)):
            x = cx + rng.randint(-7, 7)
            y = int(cy + rng.randint(-3, 3))
            big = y > surface + 18 and rng.random() < 0.8
            flower(g, x, y, petals[k], centers[k], grass_r[0], big)
    for _ in range(90):  # lone specks
        x, y = rng.randrange(T), rng.randrange(surface + 3, GROUND_H - 3)
        flower(g, x, y, petals[rng.randrange(len(petals))], grass_r[0], grass_r[0], False)
    return L


# ── Shared ground and plant helpers ───────────────────────────────────────────


def ground_fill(g: Canvas, surface: float, color: Callable[[float, float, float, int, int], Color]) -> None:
    """Fills from the surface line down with color(u, v, depth, px, py)."""
    for py in range(round(surface * K), g.h):
        v = native(py)
        for px in range(g.w):
            g.put(px, py, color(native(px), v, v - surface, px, py))


def rough_top(g: Canvas, surface: float, r: list[Color], seed: int, amp: float) -> None:
    """Lumps (stones, mud, sand) rising above the ground's top edge, on transparency."""
    for px in range(g.w):
        u = native(px)
        h = max(0.0, (fbm(u, 0, seed, cells=(16, 8, 4)) - 0.45) * amp)
        for py in span(surface - h, surface):
            v = native(py)
            if surface - h <= v < surface:
                g.put(px, py, shade(r, 0.8 if v - (surface - h) < 1 else 0.55, px, py))


def rainbow(cv: Canvas, cx: float, cy: float, radius: float, band: float, alpha: float) -> None:
    """A translucent rainbow arc (red outside), fading towards its feet."""
    cols = ramp('#e8504a', '#f39a3c', '#f2d24a', '#6cc46a', '#4a9ad8', '#5b5bc8', '#8e5ab8')
    for py in span(cy - radius - 1, cy):
        v = native(py)
        for px in span(cx - radius - 1, cx + radius + 1):
            k = (radius - math.hypot(native(px) - cx, v - cy)) / band
            if 0 <= k < 7:
                base = cv.get(px, py)
                if base is not None:
                    w = alpha * min(1.0, (cy - v) / 60) * min(1.0, k * 2, (7 - k) * 2)
                    cv.put(px, py, lerp_c(base, cols[int(k)], w))


def rain_curtain(cv: Canvas, y0: float, y1: float, c: Color, strength: float, seed: int) -> None:
    """Faint slanted streaks of distant rain."""
    mid, half = (y0 + y1) / 2, (y1 - y0) / 2
    for py in span(y0, y1):
        v = native(py)
        env = max(0.0, 1 - abs(v - mid) / half)
        for px in range(cv.w):
            u = native(px)
            sh = vnoise(u + v * 0.3, v, 1.2, 16, seed, None) * fbm(u, v, seed + 1, None, cells=(80, 40))
            if sh > 0.4:
                mix_put(cv, px, py, c, (sh - 0.4) * 5 * strength * env)


def dead_tree(cv: Canvas, rng: random.Random, x: float, base: float, h: float, r: list[Color], outline: Color):
    """A bare, crooked tree: tapering trunk, a few forked branches, short roots."""
    lean = rng.uniform(-0.15, 0.15)
    w = max(2.0, h / 11)
    top = (x + lean * h, base - h)
    stroke(cv, [(x, base), (x + lean * h * 0.4 + rng.uniform(-1, 1), base - h * 0.55), top], w, w * 0.35, r, outline)
    for side in (-1, 1):
        stroke(cv, [(x, base - 1), (x + side * w * 1.4, base)], w * 0.6, w * 0.3, r, outline)
    for k in range(5):
        f = rng.uniform(0.35, 0.92)
        sx, sy = x + lean * h * f, base - h * f
        side = -1 if k % 2 else 1
        ln = h * rng.uniform(0.25, 0.42) * (1.15 - f * 0.5)
        a = -math.pi / 2 + side * rng.uniform(0.55, 1.15)
        ex, ey = sx + math.cos(a) * ln, sy + math.sin(a) * ln
        mx, my = (sx + ex) / 2 + rng.uniform(-1.5, 1.5), (sy + ey) / 2 + rng.uniform(-1, 1)
        stroke(cv, [(sx, sy), (mx, my), (ex, ey)], w * 0.55, w * 0.2, r, outline)
        b = a - side * 0.7
        stroke(cv, [(mx, my), (mx + math.cos(b) * ln * 0.45, my + math.sin(b) * ln * 0.45)], w * 0.3, w * 0.15, r)


def thorn_bush(cv: Canvas, rng: random.Random, x: float, base: float, w: float, h: float, r: list[Color]):
    """A low tangle of thorny stems."""
    for _ in range(int(w * 1.3)):
        a = -math.pi / 2 + rng.uniform(-1.25, 1.25)
        ln = rng.uniform(0.5, 1.0)
        pts = [(x + rng.uniform(-1.5, 1.5), base)]
        for k in range(1, 4):
            f = k / 3 * ln
            pts.append((x + math.cos(a) * w / 2 * f + rng.uniform(-1, 1), base + math.sin(a) * h * f + rng.uniform(-0.8, 0.8)))
        stroke(cv, pts, 0.9, 0.5, r)
        for px_, py_ in pts[1:]:
            dot(cv, px_ + rng.choice((-0.8, 0.8)), py_ - 0.6, 0.45, r[0])


def thistle(cv: Canvas, rng: random.Random, x: float, base: float, h: float, stem_r: list[Color], head_r: list[Color]):
    """A thistle: a stem with spiky leaves and a purple tufted head."""
    hx, hy = x + rng.uniform(-1, 1), base - h
    stroke(cv, [(x, base), (hx, hy)], 0.9, 0.7, stem_r)
    for k in range(3):
        ly = base - h * (0.2 + 0.22 * k)
        lx = x + (hx - x) * (0.2 + 0.22 * k)
        for side in (-1, 1):
            stroke(cv, [(lx, ly), (lx + side * 2.2, ly - 1.6), (lx + side * 3.2, ly - 0.8)], 0.9, 0.5, stem_r)
    ball(cv, hx, hy + 0.4, 1.5, 1.3, stem_r)
    for dx in (-1.2, -0.4, 0.4, 1.2):
        stroke(cv, [(hx + dx * 0.6, hy - 0.6), (hx + dx * 1.3, hy - 3.2)], 0.8, 0.6, head_r)


# ── The other environments ────────────────────────────────────────────────────


def paint_deep() -> Layers:
    """Gen 1:1-2: darkness over the deep, mist on the waters, a soft light hovering above them."""
    global LIGHT
    LIGHT = (0.25, -0.97)
    L = Layers()
    sky_r = ramp('#020308', '#04070f', '#071019', '#0a1822', '#0e222c', '#143038', '#1c3e46', '#27504f')
    sky_gradient(L.sky, sky_r, gamma=1.7)
    cloud_field(L.sky, ramp('#081018', '#0e1a22', '#16262e', '#22363c'), 31, 10, 120, 0.5, soft=2.5)
    glow(L.sky, 306, 99, 4, 74, ramp('#1e3a3e', '#36544f', '#62806c', '#a8b88c', '#e8e4b4', '#fff8dc'), power=2.4)
    disc(L.sky, 306, 99, 3, hexc('#ffffff'), hexc('#fff6d0'))
    for y, h, a in ((150, 8, 0.3), (172, 10, 0.45), (190, 8, 0.55)):
        mist(L.sky, y, h, hexc('#3a5658'), a, seed=int(y))

    far = L.far
    water_far = ramp('#06111a', '#0a1a22', '#0f242c', '#163038', '#203e44', '#335856')
    ridge_fill(
        far, lambda x: swells(x, 64, [(6, 1.2, 0.3), (11, 0.8, 1.2), (17, 0.5, 2.0)]), water_far,
        seed=32, bottom=FAR_H - PAD, fade=0.004, tex=0.22, base_t=0.42, sy=0.15, cells=(64, 32, 16, 8),
        slope_gain=0.4, rim_t=0.3,
    )
    mist(far, 64, 5, hexc('#2c4648'), 0.55, seed=33)

    mid = L.mid
    wave_r = ramp('#040b10', '#08151b', '#0d2026', '#142c32', '#1d3a40', '#2c5052', '#4f7a72', '#93b8a4')

    def crest(u: float, v: float, d: float) -> float:
        n = fbm(u, v, 41, cells=(8, 4), sy=0.5)
        return 0.55 if d < 1.2 and n > 0.48 else (0.25 if d < 3 and n > 0.62 else 0.0)

    for base, waves, seed, bt in (
        (62, [(5, 3, 0.4), (9, 2, 1.4), (14, 1, 0.3)], 42, 0.42),
        (76, [(7, 2.5, 2.1), (12, 1.5, 0.7), (19, 0.7, 1.0)], 43, 0.32),
    ):
        ridge_fill(
            mid, lambda x, b=base, w=waves: swells(x, b, w, peak=2.5), wave_r, seed=seed, bottom=MID_H - PAD,
            fade=0.014, tex=0.2, base_t=bt, sy=0.2, slope_gain=0.6, rim_t=0.2, extra=crest,
        )
    mist(mid, 64, 5, hexc('#2c4a4c'), 0.3, seed=44)

    g = L.ground
    rng = random.Random(14)
    sand_r = ramp('#080c0e', '#0e1416', '#151d20', '#1c262a', '#243034', '#2e3c3e', '#3e4e50')
    sheen_r = ramp('#10222a', '#1a3038', '#2a4850', '#4a7070', '#8eb4a8')
    rock_r = ramp('#0a0e10', '#151c20', '#212c30', '#2f3c40', '#445456', '#66787a')
    surface = 5

    def shore(u: float, v: float, d: float, px: int, py: int) -> Color:
        n = fbm(u, v, 51, cells=(32, 16, 8, 4))
        sheen = fbm(u, v, 52, cells=(48, 24, 12), sy=0.25)
        if sheen > 0.64:  # wet patches catching the hovering light
            return shade(sheen_r, 0.3 + (sheen - 0.64) * 3 + (n - 0.5) * 0.4, px, py)
        t = 0.45 + (n - 0.5) * 0.45 - d * 0.003 - (0.12 if sheen > 0.6 else 0)
        if d < 1:
            t += 0.3
        return shade(sand_r, t, px, py)

    ground_fill(g, surface, shore)
    rough_top(g, surface, rock_r, 53, 6)
    for _ in range(46):  # wet stones, bigger nearer the viewer
        x, y = rng.uniform(0, T), rng.uniform(surface + 3, GROUND_H - 4)
        w = rng.uniform(1.2, 3.2) * (0.6 + y / GROUND_H)
        dot(g, x + 0.4, y + w * 0.45, w * 0.8, sand_r[0])
        ball(g, x, y, w, w * 0.6, rock_r)
    return L


def paint_light() -> Layers:
    """Gen 1:3-5: night to the west giving way to the first light; a sun rising in the east."""
    global LIGHT
    LIGHT = (0.85, -0.5)
    L = Layers()
    rng = random.Random(21)
    sky_r = ramp(
        '#05071a', '#0b102e', '#171b46', '#2b2458', '#47306a', '#6c3e72', '#9a4e6e', '#c86860',
        '#e88a56', '#f8b25c', '#ffd884', '#fff2c0',
    )
    sx, sy = 330, 150
    for py in range(L.sky.h):
        v = native(py)
        for px in range(L.sky.w):
            u = native(px)
            dist = math.hypot((u - sx) * 0.8, v - sy)
            t = 0.5 * (v / SKY_H) ** 1.5 + 0.45 * (u / SKY_W) ** 1.4 + 0.42 * math.exp(-dist / 75) - 0.05
            L.sky.put(px, py, shade(sky_r, t, px, py))
    stars(L.sky, rng, 420, lambda x, y: max(0.0, 1 - x / 300) * max(0.0, 1 - y / 150), ramp('#8a90c0', '#c8ccf0', '#ffffff'))
    for cx, y, w, c, c2 in (
        (90, 60, 110, '#1a1c40', '#141632'), (190, 92, 90, '#2e2452', '#251d44'),
        (360, 108, 150, '#f0a070', '#d07a64'), (470, 126, 110, '#ffc884', '#f0a070'), (300, 132, 80, '#ffd890', '#f6b070'),
    ):
        streak_cloud(L.sky, rng, cx, y, w, hexc(c), hexc(c2))
    glow(L.sky, sx, sy, 16, 58, ramp('#ffc46c', '#ffd88a', '#ffeab0', '#fff6d6'), power=1.8)
    disc(L.sky, sx, sy, 15, hexc('#fffbea'), hexc('#fff0b8'))

    far = L.far
    ridge_fill(
        far, lambda x: 40 - wave(x, [(2, 10, 0.4), (3, 7, 2.2), (7, 3, 1.0)]) - fbm(x, 0, 61, cells=(32, 16, 8)) * 6,
        ramp('#1c1640', '#251c4c', '#30225a', '#3e2a64', '#56346e', '#7c4a74', '#c47a6c', '#f2b070'),
        seed=62, bottom=FAR_H - PAD, base_t=0.32, slope_gain=0.7, rim=1, rim_t=0.5, fade=0.003, tex=0.14,
    )
    ridge_fill(
        far, lambda x: 62 - wave(x, [(3, 6, 1.4), (5, 4, 0.2), (11, 1.5, 2.4)]) - fbm(x, 5, 63, cells=(16, 8)) * 4,
        ramp('#120e2a', '#1a1434', '#231a40', '#2e204a', '#442c56', '#6a405e', '#b4705e', '#f2b26a'),
        seed=64, bottom=FAR_H - PAD, base_t=0.3, slope_gain=0.7, rim=1, rim_t=0.5, fade=0.004, tex=0.14,
    )

    mid = L.mid
    land_r = ramp('#120e16', '#1c161c', '#282020', '#362a26', '#4c3a2c', '#6c5232', '#a07c40', '#e8bc66')
    mtops = ridge_fill(
        mid, lambda x: 70 - wave(x, [(3, 7, 0.5), (6, 3, 1.7), (13, 1, 0.3)]) - fbm(x, 9, 65, cells=(16, 8)) * 3,
        land_r, seed=66, bottom=MID_H - PAD, base_t=0.28, slope_gain=0.6, rim=1.2, rim_t=0.6, fade=0.006, tex=0.16,
    )
    for i, x in enumerate(scatter_points(rng, 9, 0, T, 30)):
        rad = rng.uniform(3, 6)
        y = mtops[int(x) % T] + rad * 0.5
        blob(mid, [(x, y - rad * 0.6, rad), (x + rad * 0.7, y - rad * 0.3, rad * 0.7)], land_r,
             outline=land_r[0], seed=67 + i, tex=0.15, cut_below=y + 1, bias=-0.1)

    g = L.ground
    earth_r = ramp('#2a1e1c', '#3a2a24', '#4c382c', '#604634', '#76563c', '#8e6844', '#aa7e50', '#d0a066')
    surface = 5

    def earth(u: float, v: float, d: float, px: int, py: int) -> Color:
        n = fbm(u, v, 68, cells=(32, 16, 8, 4))
        streak = vnoise(u, v, 8, 1.5, 69, T)
        t = 0.52 + (n - 0.5) * 0.5 + (streak - 0.5) * 0.15 - d * 0.004
        if d < 1:
            t = 0.9
        elif d < 2:
            t += 0.15
        return shade(earth_r, t, px, py)

    ground_fill(g, surface, earth)
    stone_r = ramp('#2a2026', '#4a3a36', '#7a6250', '#c09a6a')
    for _ in range(40):
        x, y = rng.uniform(0, T), rng.uniform(surface + 4, GROUND_H - 4)
        w = rng.uniform(1.5, 3.5) * (0.6 + y / GROUND_H)
        for k in range(1, int(w * 3)):  # long shadow away from the low sun
            dot(g, x - w - k * 0.8, y + w * 0.35, w * 0.35, earth_r[1])
        ball(g, x, y, w, w * 0.6, stone_r)
    rough_top(g, surface, earth_r, 70, 5)
    tufts(g, rng, surface, ramp('#3a3020', '#5a4a28', '#8a7234', '#c8a450'), 70, max_h=4)
    return L


def paint_wilderness() -> Layers:
    """Gen 3:17-19: cursed ground with thorns and thistles, mesas, a dusty dusk."""
    global LIGHT
    LIGHT = (-0.8, -0.6)
    L = Layers()
    rng = random.Random(31)
    sky_r = ramp('#24162e', '#34203c', '#4c2844', '#6a3246', '#8a3e46', '#a85042', '#c46640', '#da8246', '#eaa254', '#f4c06c')
    sky_gradient(L.sky, sky_r, gamma=0.95)
    cloud_field(L.sky, ramp('#4a2a44', '#6a3448', '#8e4a4e', '#b8665a', '#e0946a'), 71, 10, 90, 0.35, sy=0.25, soft=3)
    glow(L.sky, 195, 174, 22, 80, ramp('#e48a4e', '#f0a45a', '#f8c070', '#ffd890'), power=1.7)
    disc(L.sky, 195, 174, 21, hexc('#ffe4a8'), hexc('#ffcc84'))
    for cx, y, w in ((120, 150, 200), (330, 160, 260), (520, 144, 160), (250, 178, 300), (450, 186, 240)):
        streak_cloud(L.sky, rng, cx, y, w, hexc('#9a4a4a'), hexc('#7e3c46'))

    far = L.far
    specs = [(40, 22, 46, 10), (150, 14, 30, 8), (262, 34, 52, 12), (392, 18, 38, 9), (472, 10, 24, 6)]

    def mesa_top(x: float) -> float:
        h = 0.0
        for cx, half, height, talus in specs:
            dx = min(abs(x - cx), T - abs(x - cx))
            if dx < half:
                hh = height
            elif dx < half + 2.5:
                hh = height * (1 - 0.4 * (dx - half) / 2.5)
            elif dx < half + 2.5 + talus:
                hh = height * 0.6 * (1 - (dx - half - 2.5) / talus) ** 1.4
            else:
                hh = 0.0
            h = max(h, hh)
        return 94 - h - fbm(x, 0, 72, cells=(8, 4)) * 1.5 - wave(x, [(4, 1.5, 0.3), (9, 0.8, 1.0)])

    def strata(u: float, v: float, d: float) -> float:
        return -0.16 if (v + fbm(u, v, 73, cells=(32, 16)) * 5) % 5 < 1.3 else 0.0

    ridge_fill(
        far, mesa_top, ramp('#3a2030', '#4c2832', '#623236', '#7a3e38', '#924c3c', '#ac5e42', '#c8784c', '#e09658'),
        seed=74, bottom=FAR_H - PAD, base_t=0.5, slope_gain=0.9, fade=0.002, tex=0.14, extra=strata, rim_t=0.3,
        slope_depth=None,
    )
    mist(far, 92, 7, hexc('#a65c4c'), 0.5, seed=75)

    mid = L.mid
    ridge_r = ramp('#24161a', '#341f1e', '#482a24', '#5e362a', '#764430', '#905438', '#ac6842')
    mtops = ridge_fill(
        mid, lambda x: 76 - wave(x, [(3, 4, 0.2), (7, 2, 1.1), (13, 1, 2.0)]) - fbm(x, 3, 81, cells=(16, 8)) * 2,
        ridge_r, seed=82, bottom=MID_H - PAD, base_t=0.45, slope_gain=0.5, fade=0.01, tex=0.2,
    )
    wood_r = ramp('#160e10', '#24181a', '#34241e', '#463024', '#5a3e2c')
    for x in scatter_points(rng, 5, 0, T, 70):
        dead_tree(mid, rng, x, mtops[int(x) % T] + 3, rng.uniform(34, 48), wood_r, wood_r[0])
    for x in scatter_points(rng, 16, 0, T, 16):
        thorn_bush(mid, rng, x, mtops[int(x) % T] + 3, rng.uniform(8, 14), rng.uniform(5, 8), wood_r)

    g = L.ground
    earth_r = ramp('#4a2c22', '#5c3828', '#70462e', '#865434', '#9c643c', '#b27646', '#c88c54', '#dca466')
    crack_c = hexc('#2a1612')
    surface = 5

    def cracked(u: float, v: float, d: float, px: int, py: int) -> Color:
        f1, f2, ox, oy = worley(u, v * 1.6, 13, 90)
        if f2 - f1 < 0.75:
            return crack_c
        n = fbm(u, v, 91, cells=(32, 16, 8, 4))
        t = 0.55 + (n - 0.5) * 0.45 - d * 0.003 + (ox * LIGHT[0] + oy * 1.6 * LIGHT[1]) / 13 * 0.3
        if f2 - f1 < 1.5:
            t -= 0.2
        if d < 1:
            t += 0.3
        return shade(earth_r, t, px, py)

    ground_fill(g, surface, cracked)
    rough_top(g, surface, earth_r, 92, 4)
    tufts(g, rng, surface, ramp('#4a3420', '#6a4a26', '#8a6430', '#b08440'), 90, max_h=4)
    stem_r = ramp('#2c3420', '#46502c', '#62703a', '#86924c')
    head_r = ramp('#5a2a6a', '#8a46a0', '#b46ccc', '#dca0ec')
    stone_r = ramp('#3a2a28', '#5e4840', '#8a7060', '#b89a80')
    for _ in range(16):
        x, y = rng.uniform(0, T), rng.uniform(surface + 3, GROUND_H - 6)
        w = rng.uniform(1.5, 3.2) * (0.7 + y / GROUND_H)
        ball(g, x, y, w, w * 0.65, stone_r)
    for _ in range(22):
        x = rng.uniform(0, T)
        y = surface + 2 + (GROUND_H - surface - 6) * rng.random() ** 1.3
        thistle(g, rng, x, y, rng.uniform(6, 9) * (0.7 + y / GROUND_H * 0.6), stem_r, head_r)
    return L


def paint_flood_storm() -> Layers:
    """Gen 7: rain and storm over the rising waters, the great ship riding the waves."""
    global LIGHT
    LIGHT = (0.2, -0.98)
    L = Layers()
    rng = random.Random(41)
    sky_r = ramp('#0c1018', '#121822', '#1a222e', '#232c3a', '#2e3846', '#3a4654', '#4a5664', '#5c6874')
    sky_gradient(L.sky, sky_r, gamma=0.8)
    cloud_field(L.sky, ramp('#080b10', '#0e1218', '#151b24', '#1e2630', '#2a3440', '#3c4856', '#56647a'), 101, -10, 130, 0.8, soft=4, rim=3)
    cloud_field(L.sky, ramp('#0e1219', '#161c26', '#202834', '#2c3644', '#3e4a5a'), 102, 80, 175, 0.55, sy=0.35, soft=3)
    rain_curtain(L.sky, 90, 200, hexc('#6a7a8c'), 0.5, 103)

    far = L.far
    ridge_fill(
        far, lambda x: 72 - abs(wave(x, [(3, 16, 0.6), (5, 8, 1.9)])) - fbm(x, 0, 104, cells=(16, 8, 4)) * 5,
        ramp('#10161c', '#161e24', '#1e282e', '#283438', '#344244', '#46564e'),
        seed=105, bottom=FAR_H - PAD, base_t=0.35, slope_gain=0.6, fade=0.004, tex=0.18,
    )
    water_r = ramp('#0e1a20', '#132228', '#1a2c32', '#22383e', '#2e484c', '#46625e', '#7a9890')
    ridge_fill(
        far, lambda x: swells(x, 80, [(9, 1.5, 0.3), (16, 1, 1.0)], peak=1), water_r, seed=106,
        bottom=FAR_H - PAD, base_t=0.4, sy=0.2, fade=0.004, tex=0.22, slope_gain=0.5,
    )
    mist(far, 76, 6, hexc('#4a5866'), 0.55, seed=107)

    mid = L.mid
    wave_r = ramp('#0a1418', '#0f1c22', '#15262c', '#1d3238', '#284044', '#36524f', '#5a7a70', '#a8c0b4', '#e4eeea')

    def foam(u: float, v: float, d: float) -> float:
        n = fbm(u, v, 111, cells=(8, 4, 2), sy=0.5)
        if d < 1.5 and n > 0.42:
            return 0.65
        if d < 5 and n > 0.6:
            return 0.4
        streak = fbm(u, v, 112, cells=(16, 8), sy=0.25)
        return 0.3 if streak > 0.68 else 0.0

    for base, waves, seed, bt in (
        (60, [(4, 5, 0.5), (7, 3, 1.9), (13, 1.5, 0.2)], 113, 0.42),
        (76, [(5, 4, 2.4), (9, 2.5, 0.9), (17, 1, 1.5)], 114, 0.34),
    ):
        ridge_fill(
            mid, lambda x, b=base, w=waves: swells(x, b, w, peak=5), wave_r, seed=seed, bottom=MID_H - PAD,
            fade=0.014, tex=0.2, base_t=bt, sy=0.25, slope_gain=0.5, rim_t=0.3, extra=foam,
        )

    g = L.ground
    mud_r = ramp('#14100e', '#1e1814', '#2a221a', '#362c20', '#443826', '#54462e', '#6a5838')
    pool_r = ramp('#10181e', '#18242c', '#22323a', '#344850', '#5a7078', '#9aacb0')
    surface = 5

    def mud(u: float, v: float, d: float, px: int, py: int) -> Color:
        n = fbm(u, v, 121, cells=(32, 16, 8, 4))
        pool = fbm(u, v, 122, cells=(48, 24, 12), sy=0.3)
        if pool > 0.66:
            ripple = math.sin(2 * math.pi * 16 * u / T + v * 2.2 + n * 6)
            return shade(pool_r, 0.35 + (pool - 0.66) * 1.2 + ripple * 0.12 + (0.4 if pool < 0.68 else 0), px, py)
        t = 0.5 + (n - 0.5) * 0.5 - d * 0.003 - (0.2 if pool > 0.62 else 0)
        if d < 1:
            t += 0.3
        return shade(mud_r, t, px, py)

    ground_fill(g, surface, mud)
    rough_top(g, surface, mud_r, 123, 5)
    reed_r = ramp('#1e2418', '#2e3820', '#46502c', '#606a38')
    for _ in range(30):  # broken reeds and twigs washed up
        x, y = rng.uniform(0, T), rng.uniform(surface + 2, GROUND_H - 4)
        a = rng.uniform(-0.5, 0.5)
        ln = rng.uniform(3, 7)
        stroke(g, [(x, y), (x + math.cos(a) * ln, y + math.sin(a) * ln * 0.3)], 0.9, 0.6, reed_r)
    L.landmark = ark(
        ramp('#1a100a', '#26180e', '#342214', '#442e1a', '#563c22', '#6a4c2c'),
        ramp('#22160e', '#302014', '#3e2a1a', '#4e3622', '#60442a'),
        ramp('#140e0a', '#1e1610', '#2a1e16', '#38281c', '#483424'),
        hexc('#0a0706'), hexc('#0a0706'),
    )
    return L


def paint_flood_clearing() -> Layers:
    """Gen 8-9: the waters calm, clouds part, a rainbow over the resting ship."""
    global LIGHT
    LIGHT = (-0.55, -0.83)
    L = Layers()
    rng = random.Random(51)
    sky_r = ramp('#4c74aa', '#5c84b6', '#7096c2', '#88a8cc', '#a2bad4', '#bccad6', '#d4d6d2', '#eadcc6', '#f6e2be')
    sky_gradient(L.sky, sky_r, gamma=1.0)
    glow(L.sky, 143, 70, 11, 48, ramp('#c8d6e0', '#e4e8e0', '#f6f0d8', '#fffae8'), power=1.6)
    disc(L.sky, 143, 70, 10, hexc('#fffef4'), hexc('#fff4cc'))
    cloud_field(L.sky, ramp('#8094b0', '#a2b4c8', '#c6d2de', '#e6ecf2', '#ffffff'), 131, 0, 115, 0.42, soft=5)
    rainbow(L.sky, 314, 209, 127, 3.4, 0.5)
    for cx, y, w in ((60, 160, 120), (430, 170, 140)):
        streak_cloud(L.sky, rng, cx, y, w, hexc('#f2e6d4'), hexc('#e2d6c6'))

    far = L.far

    def snow(u: float, v: float, d: float) -> float:
        return 0.55 if v < 44 and d < 5 - (v - 30) * 0.2 else 0.0

    ridge_fill(
        far, lambda x: 66 - max(0.0, wave(x, [(2, 26, 0.9), (3, 10, 2.4)])) - fbm(x, 0, 132, cells=(16, 8, 4)) * 4,
        ramp('#5a7a84', '#66868e', '#749298', '#849ea2', '#98aeb0', '#e8eef0'),
        seed=133, bottom=FAR_H - PAD, base_t=0.4, slope_gain=0.6, fade=0.003, tex=0.12, extra=snow,
    )
    water_r = ramp('#4a7488', '#56808f', '#648c98', '#7498a2', '#88a8ae', '#c8dadc')
    ridge_fill(
        far, lambda x: swells(x, 80, [(12, 0.5, 0.3), (19, 0.3, 1.0)]), water_r, seed=134,
        bottom=FAR_H - PAD, base_t=0.45, sy=0.12, fade=0.004, tex=0.2, slope_gain=0.3, rim_t=0.4,
    )

    mid = L.mid
    calm_r = ramp('#2e5a70', '#36647a', '#406e84', '#4c7a8e', '#5a8898', '#6e98a4', '#a8c8cc', '#f0f6f2')

    def glint(u: float, v: float, d: float) -> float:
        return 0.6 if fbm(u, v, 141, cells=(8, 4, 2), sy=0.2) > 0.79 else 0.0

    mtops = ridge_fill(
        mid, lambda x: swells(x, 66, [(9, 0.6, 0.3), (15, 0.4, 1.2)]), calm_r, seed=142, bottom=MID_H - PAD,
        base_t=0.5, sy=0.12, fade=0.006, tex=0.22, slope_gain=0.3, rim_t=0.3, extra=glint,
    )
    isle_r = ramp('#24402c', '#2e5032', '#3a6238', '#4a743e', '#62884a', '#80a05a')
    for i, x in enumerate((70.0, 300.0)):  # hilltops coming out of the water, with a few trees
        w = 26 if i == 0 else 18
        for px, py in poly_pixels([(x - w, mtops[int(x)] + 1), (x - w * 0.5, mtops[int(x)] - 5), (x + w * 0.4, mtops[int(x)] - 6), (x + w, mtops[int(x)] + 1)]):
            mid.put(px, py, shade(isle_r, 0.6 - (native(py) - mtops[int(x)] + 6) * 0.04, px, py))
        for k in range(3 if i == 0 else 2):
            tx = x - w * 0.3 + k * 7
            blob(mid, [(tx, mtops[int(x)] - 9, 3.5), (tx + 2, mtops[int(x)] - 8, 3)], isle_r, outline=isle_r[0], seed=143 + k, tex=0.2, tex_cell=2)

    g = L.ground
    grass_r = ramp('#2a4e30', '#335c34', '#3e6c38', '#4c7c3e', '#5e8e46', '#76a052', '#92b462')
    pool_r = ramp('#5a7c90', '#6e90a2', '#88a6b4', '#a8c0c8', '#dce8ea')
    surface = 5

    def wet_grass(u: float, v: float, d: float, px: int, py: int) -> Color:
        pool = fbm(u, v, 151, cells=(48, 24, 12), sy=0.3)
        n = fbm(u, v, 152, cells=(32, 16, 8))
        if pool > 0.66:
            return shade(pool_r, 0.35 + (pool - 0.66) * 1.5 + (n - 0.5) * 0.4 + (0.45 if pool < 0.68 else 0), px, py)
        streak = vnoise(u, v, 2, 6, 153, T)
        t = 0.62 - d * 0.004 + (n - 0.5) * 0.5 + (streak - 0.5) * 0.25 - (0.25 if pool > 0.62 else 0)
        if d < 1:
            t = 0.92
        return shade(grass_r, t, px, py)

    ground_fill(g, surface, wet_grass)
    tufts(g, rng, surface, grass_r, 140)
    sprout_r = ramp('#3a6a34', '#5a9a44', '#8ccc5a')
    for _ in range(60):  # new shoots
        x, y = rng.uniform(0, T), rng.uniform(surface + 3, GROUND_H - 3)
        dot(g, x - 0.6, y, 0.5, sprout_r[1])
        dot(g, x + 0.6, y - 0.6, 0.5, sprout_r[2])
        dot(g, x, y + 0.8, 0.5, sprout_r[0])
    L.landmark = ark(
        ramp('#3a2414', '#4e321c', '#644226', '#7c5430', '#94683c', '#b08250'),
        ramp('#4a3020', '#5e3e28', '#744e32', '#8c623e', '#a8784c'),
        ramp('#2e2018', '#40301f', '#544028', '#6a5232', '#82663e'),
        hexc('#1c120c'), hexc('#1c120c'),
    )
    return L


def paint_babel() -> Layers:
    """Gen 11: a plain in Shinar, a city of baked brick, a tower reaching for the sky."""
    global LIGHT
    LIGHT = (-0.55, -0.83)
    L = Layers()
    rng = random.Random(61)
    sky_r = ramp('#3a6cb2', '#4a7ebc', '#5e90c6', '#76a4ce', '#92b6d2', '#b0c6d0', '#ced4ca', '#e6dabc', '#f4e0ae')
    sky_gradient(L.sky, sky_r, gamma=1.05)
    glow(L.sky, 152, 68, 12, 50, ramp('#c2d4dc', '#e0e4d4', '#f6eecc', '#fffae0'), power=1.6)
    disc(L.sky, 152, 68, 11, hexc('#fffef2'), hexc('#fff2c4'))
    for cx, y, w in ((300, 50, 140), (470, 84, 110), (60, 110, 90), (380, 128, 160), (220, 150, 120)):
        streak_cloud(L.sky, rng, cx, y, w, hexc('#f4f2ea'), hexc('#dfe2e0'))

    far = L.far
    haze_r = ramp('#bfb3a4', '#c7bbaa', '#cfc3b0', '#d7cbb7', '#dfd3be')
    for x in scatter_points(rng, 14, 0, T, 24):  # a distant city in the haze
        w, h = rng.uniform(8, 20), rng.uniform(6, 16)
        blocks = [(w, 74 - h)] + ([(w * 0.55, 74 - h - 4)] if rng.random() < 0.35 else [])
        for ww, top in blocks:
            for px, py in poly_pixels([(x - ww / 2, top), (x + ww / 2, top), (x + ww / 2, 74), (x - ww / 2, 74)]):
                far.put(px, py, shade(haze_r, 0.65 if native(px) < x - ww / 2 + 1.5 else 0.4, px, py))
    ridge_fill(
        far, lambda x: 72 - wave(x, [(2, 3, 0.3), (5, 2, 1.2), (9, 1, 2.0)]) - fbm(x, 0, 161, cells=(32, 16)) * 2,
        ramp('#b89a74', '#c4a67e', '#d0b288', '#dcbe94', '#e6caa0', '#f0d8b0'),
        seed=162, bottom=FAR_H - PAD, base_t=0.5, slope_gain=0.8, fade=0.004, tex=0.12, sy=0.4,
    )

    mid = L.mid
    sand_r = ramp('#9a7650', '#ac865a', '#bc9664', '#caa46e', '#d6b27a', '#e2c088', '#eccc96')
    mtops = ridge_fill(
        mid, lambda x: 80 - wave(x, [(3, 2, 0.6), (7, 1, 1.9)]), sand_r, seed=171, bottom=MID_H - PAD,
        base_t=0.55, slope_gain=0.6, fade=0.008, tex=0.15, sy=0.4,
    )
    brick_r = ramp('#4a2a16', '#6a3c20', '#84502c', '#9c6438', '#b47a48', '#cc9258', '#e0aa6c')
    trunk_r = ramp('#3a2414', '#54361e', '#6e4a2a', '#8a6038')
    frond_r = ramp('#1e3a1c', '#2a5024', '#3a662c', '#4e7c34', '#6a9440')
    xs = scatter_points(rng, 9, 0, T, 44)
    for i, x in enumerate(xs):
        w, h = rng.uniform(16, 28), rng.uniform(14, 30)
        base = mtops[int(x) % T] + 4
        building(mid, rng, x - w / 2, base, w, h, brick_r, hexc('#2a160c'), seed=180 + i)
        if rng.random() < 0.5:  # a smaller upper storey
            building(mid, rng, x - w / 2 + 2, base - h, w * 0.55, h * 0.4, brick_r, hexc('#2a160c'), seed=190 + i)
    for x in scatter_points(rng, 6, 20, T + 20, 40):
        x = x % T
        if all(min(abs(x - b), T - abs(x - b)) > 16 for b in xs):
            palm(mid, x, mtops[int(x) % T] + 3, rng.uniform(22, 30), trunk_r, frond_r, 0)

    g = L.ground
    sand_g = ramp('#8a6a46', '#9c7a50', '#ae8a5a', '#be9a66', '#ccaa72', '#d8b880', '#e4c690', '#f0d6a4')
    surface = 5

    def sand(u: float, v: float, d: float, px: int, py: int) -> Color:
        n = fbm(u, v, 201, cells=(32, 16, 8, 4))
        ripple = math.sin(2 * math.pi * 29 * u / T + v * 1.6 + fbm(u, v, 202, cells=(32, 16)) * 9)
        t = 0.55 + (n - 0.5) * 0.4 + ripple * 0.1 - d * 0.003
        if d < 1:
            t = 0.9
        return shade(sand_g, t, px, py)

    ground_fill(g, surface, sand)
    rough_top(g, surface, sand_g, 203, 4)
    for i in range(30):  # baked bricks lying about, some in little stacks
        x, y = rng.uniform(0, T), rng.uniform(surface + 3, GROUND_H - 6)
        for k in range(rng.choice((1, 1, 2, 3))):
            bx, by = x + rng.uniform(-0.5, 0.5), y - k * 2
            for px, py in poly_pixels([(bx, by + 2.2), (bx + 4.4, by + 2.2), (bx + 4.4, by + 2.9), (bx, by + 2.9)]):
                g.put(px, py, sand_g[0])  # shadow
            for px, py in poly_pixels([(bx, by), (bx + 4, by), (bx + 4, by + 2), (bx, by + 2)]):
                v = native(py)
                g.put(px, py, brick_r[5] if v - by < 0.7 else brick_r[3])
    for _ in range(50):  # straw for the brick-makers
        x, y = rng.uniform(0, T), rng.uniform(surface + 2, GROUND_H - 3)
        a = rng.uniform(-0.6, 0.6)
        stroke(g, [(x, y), (x + math.cos(a) * 2.5, y + math.sin(a) * 0.8)], 0.6, 0.6, ramp('#b8944a', '#d8b460', '#f0d080'))
    L.landmark = ziggurat(rng, brick_r, hexc('#24120a'), trunk_r, hexc('#2a160c'))
    return L


# name → (painter, landmark position as in Backdrop.ts LANDMARK_AT: x fraction, dy design px)
ENVIRONMENTS: dict[str, tuple[Callable[[], Layers], tuple[float, int]]] = {
    'deep': (paint_deep, (0.75, 0)),
    'light': (paint_light, (0.75, 0)),
    'garden': (paint_garden, (0.75, 0)),
    'wilderness': (paint_wilderness, (0.75, 0)),
    'flood-storm': (paint_flood_storm, (0.78, -48)),
    'flood-clearing': (paint_flood_clearing, (0.78, -48)),
    'babel': (paint_babel, (0.72, -6)),
}


# ── Preview ───────────────────────────────────────────────────────────────────


def preview(name: str, L: Layers, landmark_at=(0.75, 0)) -> Path:
    """Composes the layers as the game does at 1280x720 with the battle ground line."""
    W, H, gy = 1280, 720, 504
    img = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    f = round(SCALE / K)

    def up(cv: Canvas) -> Image.Image:
        im = cv.image()
        return im.resize((im.width * f, im.height * f), Image.NEAREST) if f > 1 else im

    sky = up(L.sky)
    left = (sky.width - W) // 2
    sky_top = gy + 12 - sky.height
    img.alpha_composite(sky.crop((left, max(0, -sky_top), left + W, sky.height)), (0, max(0, sky_top)))

    def tile(cv: Canvas, y: int) -> None:
        im = up(cv)
        for x in range(0, W, im.width):
            img.alpha_composite(im, (x, y))

    tile(L.far, gy - 15 + PAD * SCALE - L.far.nh * SCALE)
    if L.landmark:
        lm = up(L.landmark)
        img.alpha_composite(lm, (int(W * landmark_at[0] - lm.width / 2), gy + landmark_at[1] - lm.height))
    tile(L.mid, gy + 15 + PAD * SCALE - L.mid.nh * SCALE)
    tile(L.ground, gy - 15)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    path = PREVIEW / f'{name}.png'
    img.convert('RGB').save(path)
    return path


def main() -> int:
    global K, SMOOTH
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('envs', nargs='*', help='environments to paint (default: all)')
    ap.add_argument('--res', type=int, choices=(1, 2, 3), default=2, help='screen pixels per painted pixel')
    ap.add_argument('--out', type=Path, default=OUT, help='output folder (default: src/assets/backdrops)')
    ap.add_argument('--preview', action='store_true', help='also write art/backdrop-previews/<env>.png')
    args = ap.parse_args()
    K = SCALE / args.res
    SMOOTH = args.res == 1
    names = args.envs or list(ENVIRONMENTS)
    for name in names:
        if name not in ENVIRONMENTS:
            print(f'unknown environment {name!r}; known: {", ".join(ENVIRONMENTS)}', file=sys.stderr)
            return 1
        painter, landmark_at = ENVIRONMENTS[name]
        L = painter()
        sizes = []
        for layer in ('sky', 'far', 'mid', 'ground', 'landmark'):
            cv = getattr(L, layer)
            if cv is not None:
                p = save(cv, f'{name}-{layer}', args.out)
                sizes.append(f'{layer} {p.stat().st_size // 1024}KB')
        line = f'{name}: ' + ', '.join(sizes)
        if args.preview:
            suffix = '' if args.res == 2 else f'-res{args.res}'
            line += f' → {preview(name + suffix, L, landmark_at).relative_to(ROOT)}'
        print(line)
    return 0


if __name__ == '__main__':
    sys.exit(main())
