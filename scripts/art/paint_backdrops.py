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
    sx, sy = 330, 100
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


# ── Environments that belong to a single passage ──────────────────────────────


def bird(cv: Canvas, x: float, y: float, s: int, c: Color) -> None:
    """A distant bird on the wing: a shallow V."""
    dot(cv, x + 0.5, y + 0.5, 0.5, c)
    for k in range(1, s + 1):
        lift = 1 if k < s else 0  # wings arch up and droop at the tips
        dot(cv, x + 0.5 - k, y + 0.5 - lift, 0.5, c)
        dot(cv, x + 0.5 + k, y + 0.5 - lift, 0.5, c)


def conifer(cv: Canvas, x: float, base: float, h: float, leaf_r: list[Color], bark_r: list[Color], seed: int) -> None:
    """A tall narrow cypress."""
    stroke(cv, [(x, base), (x, base - h * 0.3)], 1.6, 1.2, bark_r)
    n = max(4, int(h / 3.5))
    circles = [
        (x, base - h * 0.2 - h * 0.8 * i / (n - 1), max(1.0, h * 0.15 * (1 - i / (n - 1)) ** 0.8 + 0.9)) for i in range(n)
    ]
    blob(cv, circles, leaf_r, outline=leaf_r[0], seed=seed, tex=0.2, tex_cell=2)


def log_pile(cv: Canvas, x: float, base: float, rows: int, ln: float, wood_r: list[Color], cut_r: list[Color]) -> None:
    """Felled trunks stacked on their sides, cut ends showing."""
    for row in range(rows):
        y = base - 1.7 - row * 3.0
        x0, x1 = x + row * 1.7, x + ln - row * 1.7
        stroke(cv, [(x0, y), (x1, y)], 3.3, 3.3, wood_r, outline=wood_r[0])
        for ex in (x0, x1):
            dot(cv, ex, y, 1.35, cut_r[1])
            dot(cv, ex, y, 0.5, cut_r[0])


def stump(cv: Canvas, x: float, base: float, w: float, h: float, wood_r: list[Color], cut_r: list[Color]) -> None:
    for px, py in poly_pixels([(x - w / 2 - 0.9, base), (x - w / 2, base - h), (x + w / 2, base - h), (x + w / 2 + 0.9, base)]):
        rel = (native(px) - (x - w / 2)) / w
        cv.put(px, py, shade(wood_r, 0.25 + (rel if LIGHT[0] > 0 else 1 - rel) * 0.55, px, py))
    ball(cv, x, base - h, w / 2, 1.0, cut_r)


def sheaf(cv: Canvas, x: float, base: float, h: float, straw_r: list[Color]) -> None:
    """A stook of cut grain, bound at the waist."""
    for px, py in poly_pixels([(x - h * 0.42, base), (x - h * 0.14, base - h * 0.55), (x - h * 0.4, base - h), (x + h * 0.4, base - h),
                               (x + h * 0.14, base - h * 0.55), (x + h * 0.42, base)]):
        u, v = native(px), native(py)
        t = 0.55 + (vnoise(u, v, 0.8, 5, 311, T) - 0.5) * 0.7 + (-(u - x) / h if LIGHT[0] < 0 else (u - x) / h) * 0.5
        cv.put(px, py, shade(straw_r, t, px, py))
    stroke(cv, [(x - h * 0.16, base - h * 0.55), (x + h * 0.16, base - h * 0.55)], 1.0, 1.0, straw_r[:2])


def ark_frame(hull_r: list[Color], rib_r: list[Color], pole_r: list[Color], outline: Color) -> Canvas:
    """The ship half built: planked below, bare ribs above, propped up and wrapped in scaffolding."""
    cv = Canvas(152, 86)
    ox, oy, base = 14, 28, 86
    for x in range(ox + 16, ox + 112, 16):  # props under the hull
        stroke(cv, [(x - 6, base), (x, oy + 44)], 1.7, 1.3, pole_r)
        stroke(cv, [(x + 6, base), (x, oy + 44)], 1.7, 1.3, pole_r)
    hull = [(ox, oy + 18), (ox + 9, oy + 20), (ox + 115, oy + 20), (ox + 124, oy + 17), (ox + 118, oy + 33),
            (ox + 108, oy + 46), (ox + 16, oy + 46), (ox + 6, oy + 33)]

    def planked_from(u: float) -> float:
        """Top of the planking: it has climbed highest at the stern."""
        return oy + 20 + 4 * math.floor(max(0.0, u - ox - 14) / 24)

    for px, py in poly_pixels(hull):
        u, v = native(px), native(py)
        if v < planked_from(u):
            continue
        depth = (v - (oy + 22)) / 24
        mortar, tone = brick(u, v, 9, bw=14, bh=3)
        t = 0.76 - depth * 0.5 + (tone - 0.5) * 0.14 - (0.18 if mortar else 0)
        if v - planked_from(u) < 1.2:
            t = 0.95
        cv.put(px, py, shade(hull_r, t, px, py))
    # Ribs standing above the planking, tied together by a deck beam and a top rail.
    for x in range(ox + 6, ox + 122, 7):
        lean = (1 if x < ox + 62 else -1) * 0.9
        stroke(cv, [(x, planked_from(x) + 2), (x + lean, oy + 4)], 2.0, 1.5, rib_r)
    stroke(cv, [(ox + 3, oy + 4), (ox + 62, oy + 3), (ox + 96, oy + 4)], 2.2, 1.8, rib_r)
    stroke(cv, [(ox + 4, oy + 12), (ox + 62, oy + 11.5), (ox + 121, oy + 12)], 1.6, 1.6, rib_r)
    stroke(cv, [(ox + 3, oy + 21), (ox - 3, oy + 1)], 2.4, 1.6, hull_r[1:])  # stern post
    stroke(cv, [(ox + 121, oy + 19), (ox + 128, oy + 2)], 2.4, 1.6, hull_r[1:])  # bow post
    # Scaffolding: poles, two walkways and a ladder.
    for x, h in ((ox - 9, 66), (ox + 34, 78), (ox + 86, 74), (ox + 133, 62)):
        stroke(cv, [(x, base), (x, base - h)], 1.6, 1.2, pole_r)
    stroke(cv, [(ox - 11, oy - 6), (ox + 88, oy - 6)], 1.3, 1.3, pole_r)
    stroke(cv, [(ox + 32, oy - 16), (ox + 88, oy - 16)], 1.2, 1.2, pole_r)
    stroke(cv, [(ox + 84, oy + 26), (ox + 135, oy + 26)], 1.3, 1.3, pole_r)
    for dx in (0, 5):
        stroke(cv, [(ox + 96 + dx, base), (ox + 105 + dx, oy + 2)], 1.0, 1.0, pole_r)
    for k in range(9):
        f = (k + 0.5) / 9
        lx, ly = ox + 96 + 9 * f, base - (base - oy - 2) * f
        stroke(cv, [(lx, ly), (lx + 5, ly)], 0.8, 0.8, pole_r)
    outline_pass(cv, outline)
    return cv


def great_tree(bark_r: list[Color], leaf_r: list[Color], fruit_r: list[Color], outline: Color) -> Canvas:
    """The tree in the middle of the garden: a mighty trunk, a broad crown, fruit that catches the eye."""
    cv = Canvas(176, 150)
    cx, base = 88, 150
    for side, ln in ((-1, 22), (1, 24), (-1, 12), (1, 13)):  # roots
        stroke(cv, [(cx + side * 3, base - 12), (cx + side * ln * 0.6, base - 4), (cx + side * ln, base)], 5.5, 1.6, bark_r, outline)
    stroke(cv, [(cx, base), (cx - 2, base - 26), (cx + 1, base - 54)], 15, 11, bark_r, outline)
    for pts, w0, w1 in (
        ([(cx + 1, base - 50), (cx - 18, base - 70), (cx - 42, base - 86)], 8.5, 3.5),
        ([(cx + 1, base - 50), (cx + 17, base - 72), (cx + 40, base - 90)], 8.5, 3.5),
        ([(cx, base - 52), (cx + 2, base - 78), (cx - 4, base - 100)], 7.5, 3.5),
        ([(cx - 12, base - 63), (cx - 30, base - 66), (cx - 52, base - 70)], 4.5, 2.0),
        ([(cx + 11, base - 64), (cx + 32, base - 68), (cx + 54, base - 72)], 4.5, 2.0),
    ):
        stroke(cv, pts, w0, w1, bark_r, outline)
    for k in range(5):  # bark ridges
        x = cx - 5 + k * 2.6
        stroke(cv, [(x, base - 6 - k % 2 * 3), (x - 0.6, base - 24), (x + 0.4, base - 44 + k % 2 * 4)], 0.7, 0.6, bark_r[:2])
    circles = [(cx + x, base + y, r) for (x, y, r) in (
        (-54, -92, 17), (-36, -108, 19), (-13, -119, 21), (12, -121, 21), (36, -111, 20), (56, -95, 17), (-64, -76, 13),
        (66, -79, 13), (-23, -92, 17), (21, -94, 18), (0, -102, 20), (-45, -76, 12), (45, -78, 13), (-28, -78, 9), (28, -80, 9),
    )]
    canopy = blob(cv, circles, leaf_r, outline=outline, seed=78, tex=0.26, tex_cell=2.5)
    pick = random.Random(79)
    pts = sorted(canopy)
    placed: list[tuple[float, float]] = []
    for _ in range(400):
        if len(placed) >= 26:
            break
        px, py = pick.choice(pts)
        u, v = native(px), native(py)
        if not pixel_set_ok(canopy, px, py, (-3, -1.5, 0, 1.5, 3), cv.w) or any(math.hypot(u - a, v - b) < 13 for a, b in placed):
            continue
        placed.append((u, v))
        dot(cv, u, v + 0.6, 2.7, leaf_r[0])  # a pocket of shade so the fruit stands out
        ball(cv, u, v, 2.0, 2.0, fruit_r)
        dot(cv, u + (0.6 if LIGHT[0] > 0 else -0.6), v - 0.7, 0.5, fruit_r[-1])
    return cv


def homestead(stone_r: list[Color], thatch_r: list[Color], wood_r: list[Color], dark: Color, outline: Color, smoke: Color) -> Canvas:
    """A low stone house with a dark open doorway, and an altar of piled stones still smoking."""
    cv = Canvas(136, 80)
    base = 80
    x0, w, h = 8, 56, 30
    for px, py in poly_pixels([(x0, base - h), (x0 + w, base - h), (x0 + w, base), (x0, base)]):
        u, v = native(px), native(py)
        f1, f2, ox, oy = worley(u, v, 5.5, 301)
        t = 0.52 + (ox * LIGHT[0] + oy * LIGHT[1]) / 5.5 * 0.55 + (_hash(round(u - ox), round(v - oy), 5) - 0.5) * 0.3
        if f2 - f1 < 0.7:
            t = 0.08
        if v < base - h + 3.5:
            t -= 0.3  # under the eaves
        cv.put(px, py, shade(stone_r, t, px, py))
    for px, py in poly_pixels([(x0 + 22, base - 21), (x0 + 34, base - 21), (x0 + 34, base), (x0 + 22, base)]):
        cv.put(px, py, dark)
    stroke(cv, [(x0 + 20, base - 22), (x0 + 36, base - 22)], 2.2, 2.2, wood_r)
    stroke(cv, [(x0 + 21.5, base - 21), (x0 + 21.5, base)], 1.6, 1.6, wood_r)
    stroke(cv, [(x0 + 34.5, base - 21), (x0 + 34.5, base)], 1.6, 1.6, wood_r)
    for px, py in poly_pixels([(x0 + 43, base - 19), (x0 + 49, base - 19), (x0 + 49, base - 13), (x0 + 43, base - 13)]):
        cv.put(px, py, dark)
    roof = [(x0 - 6, base - h + 2), (x0 + w + 6, base - h + 2), (x0 + w - 9, base - h - 19), (x0 + 9, base - h - 19)]
    for px, py in poly_pixels(roof):
        u, v = native(px), native(py)
        t = 0.74 - (v - (base - h - 19)) * 0.02 + (vnoise(u, v, 1.0, 7, 302, None) - 0.5) * 0.55
        if base - h + 2 - v < 1.6:
            t -= 0.35
        cv.put(px, py, shade(thatch_r, t, px, py))
    ax = 104
    for dx, dy, rx, ry in ((-9.5, -3.2, 5.2, 3.4), (0, -3.2, 5.6, 3.6), (9.5, -3.2, 5.2, 3.4), (-5, -9.4, 5.2, 3.2), (5, -9.4, 5.2, 3.2),
                           (0, -15, 6.4, 2.9)):
        ball(cv, ax + dx, base + dy, rx, ry, stone_r)
    dot(cv, ax - 1.5, base - 18.2, 1.1, hexc('#e8622a'))
    dot(cv, ax + 1.5, base - 18.6, 0.8, hexc('#ffc24a'))
    outline_pass(cv, outline)
    for k in range(30):  # a thread of smoke, thinning as it climbs
        y = base - 21 - k * 1.8
        x = ax + math.sin(k * 0.5) * (1.2 + k * 0.14) + k * 0.3
        rad = 1.1 + k * 0.05
        for py in span(y - rad, y + rad):
            for px in span(x - rad, x + rad):
                if math.hypot(native(px) - x, native(py) - y) <= rad:
                    mix_put(cv, px, py, smoke, 0.75 - k * 0.022)
    return cv


def paint_shore() -> Layers:
    """Gen 1:26-27: the young earth on a bright morning, sea and sky and land all full of life."""
    global LIGHT
    LIGHT = (-0.55, -0.83)
    L = Layers()
    rng = random.Random(61)
    sky_r = ramp('#2f78c8', '#3f8ad4', '#54a0de', '#6fb4e6', '#8fc8ec', '#b2dcf0', '#d2ecf2', '#f0f8ec')
    sky_gradient(L.sky, sky_r, gamma=1.1)
    glow(L.sky, 150, 62, 13, 44, ramp('#bfe2f2', '#dff0ea', '#f6f6d6', '#fffbd8'))
    disc(L.sky, 150, 62, 11, hexc('#fffef2'), hexc('#fff2c0'))
    cloud_r = ramp('#9cc0e0', '#bcd8ee', '#dcecf8', '#f4fafe', '#ffffff')
    for i, (cx, base, w, h) in enumerate([(310, 72, 64, 24), (455, 108, 90, 32), (40, 124, 70, 26), (540, 52, 40, 16)]):
        cumulus(L.sky, rng, cx, base, w, h, cloud_r, seed=160 + i)
    for cx, y, w in [(220, 152, 110), (380, 166, 90), (90, 172, 80)]:
        streak_cloud(L.sky, rng, cx, y, w, hexc('#f2fafa'), hexc('#d8eef4'))
    for bx, by, s in [(246, 98, 3), (259, 91, 3), (271, 101, 2), (398, 58, 3), (411, 65, 3), (334, 132, 2), (108, 104, 3), (120, 110, 2)]:
        bird(L.sky, bx, by, s, hexc('#34588a'))

    far = L.far
    ridge_fill(
        far, lambda x: 66 - max(0.0, wave(x, [(1, 22, 0.4), (2, 9, 2.0), (5, 3, 1.0)])) - fbm(x, 0, 161, cells=(16, 8)) * 3,
        ramp('#7aa6cc', '#88b2d4', '#98bedc', '#aacce4', '#c0daec'), seed=162, bottom=FAR_H - PAD, base_t=0.55,
        slope_gain=0.4, fade=0.004, tex=0.1,
    )
    sea_r = ramp('#1c68a2', '#2478b0', '#2e8abc', '#3c9cc8', '#52aed2', '#72c2dc', '#a4dcea', '#ecfaf8')

    def glint(u: float, v: float, d: float) -> float:
        return 0.55 if fbm(u, v, 163, cells=(8, 4, 2), sy=0.2) > 0.77 else 0.0

    ridge_fill(
        far, lambda x: swells(x, 68, [(12, 0.4, 0.3), (19, 0.3, 1.0)]), sea_r, seed=164, bottom=FAR_H - PAD,
        base_t=0.72, sy=0.12, fade=0.013, tex=0.16, slope_gain=0.3, rim_t=0.3, extra=glint,
    )
    isle_r = ramp('#2c6a4c', '#3a7c52', '#4a8e58', '#5ea060', '#78b26a', '#96c478')
    for i, (x, w) in enumerate(((96.0, 30.0), (352.0, 20.0), (440.0, 12.0))):
        y = 72 + i * 2
        for px, py in poly_pixels([(x - w, y + 1), (x - w * 0.5, y - 5), (x + w * 0.4, y - 6), (x + w, y + 1)]):
            far.put(px, py, shade(isle_r, 0.62 - (native(py) - y + 6) * 0.04, px, py))
        for k in range(int(w / 6)):
            tx = x - w * 0.45 + k * 7
            blob(far, [(tx, y - 8, 3.2), (tx + 2, y - 7, 2.8)], isle_r, outline=isle_r[0], seed=165 + k, tex=0.2, tex_cell=2)

    mid = L.mid
    sand_r = ramp('#a88a56', '#bc9e66', '#ceb278', '#dec48c', '#ecd6a4', '#f8e8c2')
    ridge_fill(
        mid, lambda x: 70 - wave(x, [(2, 2, 0.2), (5, 1.2, 1.0)]), sand_r, seed=171, bottom=MID_H - PAD, base_t=0.72,
        fade=0.004, tex=0.12, slope_gain=0.3,
    )
    meadow_r = ramp('#2c7646', '#38884a', '#48994e', '#5cab54', '#76be5e', '#96d06c')
    mtops = ridge_fill(
        mid, lambda x: 78 - wave(x, [(3, 3.5, 0.9), (4, 2, 2.2), (9, 1, 0.4)]) - fbm(x, 2, 172, cells=(16, 8)) * 2,
        meadow_r, seed=173, bottom=MID_H - PAD, fade=0.012, tex=0.18, base_t=0.62,
    )
    bark_r = ramp('#4a3220', '#66482c', '#82603a', '#9e7a4c', '#b8945e')
    frond_r = ramp('#1f5a3c', '#2c7044', '#3c864a', '#52a052', '#74b85c')
    leaf_r = ramp('#24583e', '#2f6c42', '#3d8046', '#4f964c', '#68ab54', '#88c062', '#a9d47a')
    for i, x in enumerate(scatter_points(rng, 5, 0, T, 70)):
        palm(mid, x, mtops[int(x) % T] + 8, rng.uniform(36, 48), bark_r, frond_r, seed=174 + i)
    pick = random.Random(62)
    for i, x in enumerate(scatter_points(rng, 14, 0, T, 16)):
        base = round(mtops[int(x) % T]) + 8
        rad = rng.uniform(4, 7)
        bush = blob(
            mid, [(x - rad * 0.6, base - rad * 0.8, rad * 0.8), (x + rad * 0.5, base - rad, rad)],
            leaf_r, outline=leaf_r[0], seed=180 + i, tex=0.2, tex_cell=2, cut_below=base,
        )
        pc = [hexc('#ff8fb1'), hexc('#ffffff'), hexc('#ffd84a'), hexc('#ff7a4a')][i % 4]
        for _ in range(5):
            px, py = pick.choice(sorted(bush))
            if pixel_set_ok(bush, px, py, (-1, 0, 1), mid.w):
                dot(mid, native(px), native(py), 0.5, pc)

    g = L.ground
    grass_r = ramp('#2a6c40', '#347c44', '#408e48', '#4ea04c', '#62b252', '#7cc45a', '#9cd468')
    surface = 5

    def meadow(u: float, v: float, d: float, px: int, py: int) -> Color:
        n = fbm(u, v, 181, cells=(32, 16, 8))
        patch = fbm(u, v, 182, cells=(64, 32, 16), sy=0.35)
        if patch > 0.645 and d > 3:
            t = 0.5 + (patch - 0.645) * 2.2 + (n - 0.5) * 0.35 - (0.3 if patch < 0.665 else 0)
            return shade(sand_r, t, px, py)
        streak = vnoise(u, v, 2, 6, 183, T)
        if K > 1:
            streak = streak * 0.5 + vnoise(u, v, 2 / 3, 3, 184, T) * 0.5
        t = 0.7 - d * 0.0045 + (n - 0.5) * 0.5 + (streak - 0.5) * 0.25 - (0.22 if patch > 0.62 else 0)
        if d < 1:
            t = 0.95
        elif d < 2:
            t += 0.2
        return shade(grass_r, t, px, py)

    ground_fill(g, surface, meadow)
    tufts(g, rng, surface, grass_r, 150)
    shell_r = ramp('#b89a86', '#e6d2c0', '#fff6ea')
    for _ in range(18):
        x, y = rng.uniform(0, T), rng.uniform(surface + 8, GROUND_H - 4)
        ball(g, x, y, rng.uniform(1.0, 1.8), 0.9, shell_r)
    petals = [hexc('#ffffff'), hexc('#ffd84a'), hexc('#ff8fb1'), hexc('#8fd0ff'), hexc('#ff9a5a')]
    centers = [hexc('#ffd84a'), hexc('#e08a20'), hexc('#ffe9a0'), hexc('#ffffff'), hexc('#ffe9a0')]
    for _ in range(34):
        cx = rng.randrange(T)
        cy = surface + 4 + (GROUND_H - surface - 10) * rng.random() ** 0.9
        k = rng.randrange(len(petals))
        for _ in range(rng.randint(3, 6)):
            x, y = cx + rng.randint(-7, 7), int(cy + rng.randint(-3, 3))
            flower(g, x, y, petals[k], centers[k], grass_r[0], y > surface + 18 and rng.random() < 0.8)
    return L


def paint_grove() -> Layers:
    """Gen 3:1-6: deep in the garden as the day turns, and the tree whose fruit delights the eyes."""
    global LIGHT
    LIGHT = (0.55, -0.83)
    L = Layers()
    rng = random.Random(71)
    sky_r = ramp('#27356e', '#33488a', '#4560a2', '#5f7ab6', '#8494c4', '#b0a8c8', '#d8b8c0', '#f2ccae', '#fbe0a8')
    sky_gradient(L.sky, sky_r, gamma=1.05)
    glow(L.sky, 180, 168, 14, 74, ramp('#e2b8b4', '#f2ceac', '#fbe2ac', '#fff4cc'), power=1.5)
    disc(L.sky, 180, 168, 12, hexc('#fffbe6'), hexc('#ffe9b0'))
    cloud_field(L.sky, ramp('#46498a', '#6660a0', '#907eb0', '#c4a0b8', '#f2cab4'), 201, 14, 118, 0.4, sy=0.3, soft=3)
    for cx, y, w in ((110, 150, 170), (330, 166, 210), (500, 146, 150)):
        streak_cloud(L.sky, rng, cx, y, w, hexc('#f8d8b4'), hexc('#dcb0b4'))

    far = L.far

    def crowns(x: float, a: float, b: float) -> float:
        return abs(wave(x, [(29, a, 0.3)])) + abs(wave(x, [(43, b, 1.1)]))

    ridge_fill(
        far, lambda x: 38 - wave(x, [(1, 10, 0.9), (2, 6, 2.2), (5, 3, 0.4)]) - crowns(x, 1.2, 0.8),
        ramp('#5f6ea8', '#6c7cae', '#7a8ab4', '#8a9aba', '#9caac2'), seed=202, bottom=FAR_H - PAD, fade=0.006, tex=0.1,
        base_t=0.6, slope_gain=0.3,
    )
    ridge_fill(
        far, lambda x: 54 - wave(x, [(2, 7, 0.2), (3, 4, 1.6), (7, 2, 2.9)]) - crowns(x, 1.8, 1.2),
        ramp('#365a70', '#3f6878', '#4a7680', '#588488', '#689290'), seed=203, bottom=FAR_H - PAD, fade=0.008, tex=0.14,
        base_t=0.6, slope_gain=0.3,
    )
    mist(far, 62, 5, hexc('#b8b4c8'), 0.45, seed=204)
    ridge_fill(
        far, lambda x: 70 - wave(x, [(3, 5, 2.0), (5, 3, 0.5), (8, 1.5, 1.2)]) - crowns(x, 2.6, 1.8),
        ramp('#173f3c', '#1d4c42', '#255a48', '#2f6a4e', '#3c7a54', '#4c8a5a'), seed=205, bottom=FAR_H - PAD, fade=0.012,
        tex=0.2, base_t=0.6, slope_gain=0.25,
    )

    mid = L.mid
    meadow_r = ramp('#163e34', '#1c4c38', '#245c3c', '#2e6e42', '#3c8048', '#50944e')
    mtops = ridge_fill(
        mid, lambda x: 75 - wave(x, [(2, 3, 0.5), (4, 2, 1.7), (11, 0.8, 0.4)]),
        meadow_r, seed=211, bottom=MID_H - PAD, fade=0.012, tex=0.18, base_t=0.6,
    )
    bark_r = ramp('#24161a', '#3a2420', '#523428', '#6a4630', '#825a3a')
    leaf_r = ramp('#123a34', '#184838', '#20583c', '#2a6a40', '#388044', '#4c984c', '#6cb25a')
    pick = random.Random(72)
    for i, x in enumerate(scatter_points(rng, 4, 0, T, 90)):
        s = rng.uniform(0.75, 1.0)
        base = round(mtops[int(x) % T]) + 12
        top = base - round(26 * s)
        trunk(mid, x, base, top, 4.6 * s, bark_r, seed=212 + i)
        circles = [(x + math.cos(-math.pi / 2 + (k - 3) * 0.55) * 11 * s * (0.4 if k == 3 else 1.0) * 1.25,
                    top - 6 * s + math.sin(-math.pi / 2 + (k - 3) * 0.55) * 11 * s * (0.4 if k == 3 else 1.0), rng.uniform(9, 12) * s)
                   for k in range(7)] + [(x, top - 4 * s, 13 * s)]
        blob(mid, circles, leaf_r, outline=leaf_r[0], seed=220 + i, tex=0.22, tex_cell=2)
    berry = [hexc('#c46cff'), hexc('#ffffff'), hexc('#ff6a8a'), hexc('#8fe0ff')]
    for i, x in enumerate(scatter_points(rng, 18, 0, T, 12)):
        base = round(mtops[int(x) % T]) + 9
        rad = rng.uniform(5, 9)
        bush = blob(
            mid, [(x - rad * 0.7, base - rad * 0.7, rad * 0.8), (x + rad * 0.5, base - rad, rad), (x + rad * 1.3, base - rad * 0.6, rad * 0.7)],
            leaf_r, outline=leaf_r[0], seed=230 + i, tex=0.22, tex_cell=2, cut_below=base,
        )
        for _ in range(5):
            px, py = pick.choice(sorted(bush))
            if pixel_set_ok(bush, px, py, (-1, 0, 1), mid.w):
                dot(mid, native(px), native(py), 0.5, berry[i % 4])
    for x in scatter_points(rng, 22, 0, T, 8):  # ferns
        base = mtops[int(x) % T] + 10
        for a in (-1.1, -0.55, 0.0, 0.55, 1.1):
            ln = rng.uniform(5, 8)
            stroke(mid, [(x, base), (x + math.sin(a) * ln * 0.6, base - math.cos(a) * ln * 0.8), (x + math.sin(a) * ln, base - math.cos(a) * ln * 0.7)],
                   1.1, 0.5, leaf_r[2:])

    g = L.ground
    grass_r = ramp('#143a30', '#1a4834', '#22583a', '#2c6a40', '#3a7c46', '#4e904e', '#6aa65a')
    surface = 5

    def shaded_grass(u: float, v: float, d: float, px: int, py: int) -> Color:
        n = fbm(u, v, 241, cells=(32, 16, 8))
        streak = vnoise(u, v, 2, 6, 242, T)
        if K > 1:
            streak = streak * 0.5 + vnoise(u, v, 2 / 3, 3, 243, T) * 0.5
        sun = fbm(u, v, 244, cells=(40, 20, 10), sy=0.4)  # light falling through the leaves
        t = 0.52 - d * 0.003 + (n - 0.5) * 0.45 + (streak - 0.5) * 0.25 + max(0.0, sun - 0.56) * 2.2
        if d < 1:
            t = 0.9
        elif d < 2:
            t += 0.18
        return shade(grass_r, t, px, py)

    ground_fill(g, surface, shaded_grass)
    tufts(g, rng, surface, grass_r, 150)
    cap_r = ramp('#8a1c2a', '#d43a3a', '#ff8a6a')
    for _ in range(12):  # toadstools
        x, y = rng.uniform(0, T), rng.uniform(surface + 10, GROUND_H - 5)
        stroke(g, [(x, y + 2.2), (x, y)], 1.0, 1.0, ramp('#b8a890', '#f0e6d2'))
        ball(g, x, y, 2.0, 1.2, cap_r)
        dot(g, x - 0.6, y - 0.3, 0.4, hexc('#fff4e0'))
    petals = [hexc('#c49bff'), hexc('#ffffff'), hexc('#ff8fb1'), hexc('#9ae0ff')]
    centers = [hexc('#ffe9a0'), hexc('#ffd84a'), hexc('#ffe9a0'), hexc('#ffffff')]
    for _ in range(30):
        cx = rng.randrange(T)
        cy = surface + 4 + (GROUND_H - surface - 10) * rng.random() ** 0.9
        k = rng.randrange(len(petals))
        for _ in range(rng.randint(3, 6)):
            x, y = cx + rng.randint(-7, 7), int(cy + rng.randint(-3, 3))
            flower(g, x, y, petals[k], centers[k], grass_r[0], y > surface + 18 and rng.random() < 0.8)
    leaf_c = [hexc('#d8a03a'), hexc('#c8642a'), hexc('#e6c85a')]
    for _ in range(40):  # fallen leaves
        x, y = rng.uniform(0, T), rng.uniform(surface + 4, GROUND_H - 3)
        c = rng.choice(leaf_c)
        dot(g, x, y, 0.5, c)
        dot(g, x + 1, y + (0 if rng.random() < 0.5 else 1), 0.5, c)
    L.landmark = great_tree(
        ramp('#1c1216', '#30201c', '#483024', '#62422e', '#7e583a', '#9a704a'),
        ramp('#0f3230', '#154036', '#1c503a', '#266240', '#347846', '#48904e', '#66aa5c', '#8cc470'),
        ramp('#7a1420', '#c8242c', '#ff5a3c', '#ffc27a'), hexc('#0c1a20'),
    )
    return L


def paint_fields() -> Layers:
    """Gen 4:6-7: tilled ground east of Eden under a heavy evening sky, and a doorway standing dark."""
    global LIGHT
    LIGHT = (0.7, -0.7)
    L = Layers()
    rng = random.Random(81)
    sky_r = ramp('#1c1830', '#28203e', '#382a4e', '#4e365a', '#6a4660', '#8c5a60', '#b0745a', '#d0965a', '#eaba6a', '#f8d888')
    sky_gradient(L.sky, sky_r, gamma=0.9)
    cloud_field(L.sky, ramp('#1e1830', '#2e2240', '#463050', '#684258', '#945c5c', '#c8845e', '#f0b46e'), 251, -10, 120, 0.62, sy=0.3, soft=4, rim=3)
    glow(L.sky, 410, 186, 16, 84, ramp('#d48a56', '#e8a85e', '#f6c874', '#ffe49c'), power=1.6)
    disc(L.sky, 410, 186, 15, hexc('#fff0c0'), hexc('#ffd68a'))
    for cx, y, w in ((140, 156, 220), (360, 164, 260), (500, 146, 150), (250, 180, 280)):
        streak_cloud(L.sky, rng, cx, y, w, hexc('#8a4a58'), hexc('#6a3a52'))

    far = L.far
    ridge_fill(
        far, lambda x: 50 - wave(x, [(1, 12, 1.4), (2, 7, 0.2), (5, 3, 2.2)]) - fbm(x, 0, 252, cells=(32, 16, 8)) * 6,
        ramp('#3c2c50', '#4a3458', '#5a3e60', '#6e4a66', '#845a6a', '#9c6e6c'), seed=253, bottom=FAR_H - PAD, fade=0.004,
        tex=0.1, base_t=0.55, slope_gain=0.5,
    )

    def strips(u: float, v: float, d: float) -> float:
        """Patchwork of ploughed and standing plots."""
        plot = math.floor((u + v * 0.9) / 26) + math.floor(v / 9) * 7
        tone = (_hash(plot % 20, 0, 254) - 0.5) * 0.36
        hedge = -0.3 if ((u + v * 0.9) % 26) < 1.2 or (v % 9) < 1.0 else 0.0
        return tone + hedge

    ridge_fill(
        far, lambda x: 70 - wave(x, [(2, 6, 0.6), (3, 3.5, 2.0), (7, 1.5, 1.1)]) - fbm(x, 4, 255, cells=(16, 8)) * 3,
        ramp('#3a3026', '#4c3e2c', '#605032', '#76643a', '#8e7a44', '#a89250', '#c4ac60'), seed=256, bottom=FAR_H - PAD,
        fade=0.006, tex=0.12, base_t=0.55, slope_gain=0.4, extra=strips,
    )
    mist(far, 94, 6, hexc('#a8705a'), 0.4, seed=257)

    mid = L.mid
    soil_r = ramp('#1e1412', '#2c1c18', '#3e281e', '#523626', '#68462e', '#805838', '#9a6e46')
    mtops = ridge_fill(
        mid, lambda x: 76 - wave(x, [(2, 2.5, 0.3), (5, 1.5, 1.4), (11, 0.7, 2.0)]), soil_r, seed=261, bottom=MID_H - PAD,
        base_t=0.5, slope_gain=0.4, fade=0.01, tex=0.2,
    )
    straw_r = ramp('#5a4220', '#7e6028', '#a48434', '#c8a848', '#e6cc68', '#f8e894')
    wall_r = ramp('#2a2428', '#403a3c', '#5a5450', '#787066', '#989082')
    for x in scatter_points(rng, 3, 0, T, 120):  # runs of dry-stone wall
        for k in range(rng.randint(8, 13)):
            wx = x + k * 4.4
            ball(mid, wx, mtops[int(wx) % T] + 1.5, 2.6, 1.9, wall_r)
            if k % 2:
                ball(mid, wx + 2, mtops[int(wx) % T] - 1.3, 2.2, 1.6, wall_r)
    for x in scatter_points(rng, 11, 0, T, 26):
        sheaf(mid, x, mtops[int(x) % T] + 5, rng.uniform(8, 11), straw_r)
    wood_r = ramp('#160e10', '#24181a', '#34241e', '#463024', '#5a3e2c')
    for x in scatter_points(rng, 2, 0, T, 200):
        dead_tree(mid, rng, x, mtops[int(x) % T] + 3, rng.uniform(30, 38), wood_r, wood_r[0])

    g = L.ground
    surface = 5

    def furrows(u: float, v: float, d: float, px: int, py: int) -> Color:
        n = fbm(u, v, 271, cells=(32, 16, 8, 4))
        wob = fbm(u, 0, 272, cells=(64, 32, 16)) * 0.9
        phase = (math.sqrt(d + 8) * 2.0 + wob + n * 0.25) % 1.0  # furrows widen as they come nearer
        t = 0.5 + (0.2 if phase < 0.42 else -0.16 if phase > 0.78 else 0.0) + (n - 0.5) * 0.36 - d * 0.002
        if d < 1:
            t += 0.25
        return shade(soil_r, t, px, py)

    ground_fill(g, surface, furrows)
    rough_top(g, surface, soil_r, 273, 4)
    tufts(g, rng, surface, straw_r, 110, max_h=4)
    for _ in range(70):  # stubble left after the harvest
        x, y = rng.uniform(0, T), rng.uniform(surface + 3, GROUND_H - 4)
        h = rng.uniform(1.5, 3.2) * (0.7 + y / GROUND_H * 0.6)
        for dx in (-1, 0, 1):
            stroke(g, [(x + dx, y), (x + dx * 1.7, y - h)], 0.7, 0.5, straw_r[1:5])
    stone_r = ramp('#2a2428', '#4a4444', '#727068', '#a09a8c')
    for _ in range(18):
        x, y = rng.uniform(0, T), rng.uniform(surface + 3, GROUND_H - 6)
        w = rng.uniform(1.5, 3.0) * (0.7 + y / GROUND_H)
        ball(g, x, y, w, w * 0.65, stone_r)
    L.landmark = homestead(
        ramp('#1c181e', '#302a2e', '#484242', '#645c56', '#847a6c', '#a69a86'),
        ramp('#4a3418', '#6e5022', '#94722e', '#b8943e', '#d8b656'),
        ramp('#1a1210', '#2e2018', '#463224', '#5e4630'), hexc('#07050a'), hexc('#120c12'), hexc('#8a7a86'),
    )
    return L


def paint_shipyard() -> Layers:
    """Gen 6:13-14: the ark taking shape on dry ground while the sky darkens overhead."""
    global LIGHT
    LIGHT = (-0.5, -0.86)
    L = Layers()
    rng = random.Random(91)
    sky_r = ramp('#1a202e', '#252d3e', '#333d50', '#455064', '#5a6676', '#748086', '#959a90', '#bcb694', '#e0d09a', '#f6e6ae')
    sky_gradient(L.sky, sky_r, gamma=0.85)
    glow(L.sky, 130, 196, 10, 110, ramp('#b8b08e', '#d4c494', '#eedca0', '#fff2bc'), power=1.4)
    cloud_field(L.sky, ramp('#10141e', '#1a202c', '#262e3c', '#36404e', '#4c5866', '#6c7884', '#98a0a2'), 281, -10, 128, 0.74, soft=4, rim=3)
    cloud_field(L.sky, ramp('#1c222e', '#2a3240', '#3c4654', '#56606c', '#7c8488'), 282, 84, 168, 0.42, sy=0.35, soft=3)
    for cx, y, w in ((300, 176, 240), (480, 184, 180)):
        streak_cloud(L.sky, rng, cx, y, w, hexc('#8a8a82'), hexc('#6e7074'))

    far = L.far
    ridge_fill(
        far, lambda x: 46 - wave(x, [(1, 12, 2.2), (2, 6, 0.8), (5, 3, 0.2)]) - fbm(x, 0, 283, cells=(32, 16, 8)) * 6,
        ramp('#3c4654', '#48525e', '#566068', '#687072', '#7c827c', '#94968a'), seed=284, bottom=FAR_H - PAD, fade=0.004,
        tex=0.1, base_t=0.55, slope_gain=0.5,
    )
    hill_r = ramp('#2e3428', '#3c422e', '#4c5234', '#5e643c', '#727846', '#8a8e52', '#a4a660')
    tops = ridge_fill(
        far, lambda x: 68 - wave(x, [(2, 6, 1.9), (3, 4, 0.4), (7, 1.5, 2.6)]) - fbm(x, 3, 285, cells=(16, 8)) * 3,
        hill_r, seed=286, bottom=FAR_H - PAD, fade=0.008, tex=0.16, base_t=0.55, slope_gain=0.4,
    )
    pine_r = ramp('#141e1c', '#1c2a24', '#26382c', '#324836', '#425a40')
    pine_bark = ramp('#1a1412', '#2c2018', '#3e2e20')
    for i, x in enumerate(scatter_points(rng, 30, 0, T, 9)):  # the forest the timber comes from
        if 150 < x < 300:
            continue  # a cleared slope
        conifer(far, x, tops[int(x) % T] + rng.uniform(3, 12), rng.uniform(9, 15), pine_r, pine_bark, seed=287 + i)
    for i, x in enumerate(scatter_points(rng, 9, 160, 290, 10)):
        y = tops[int(x) % T] + rng.uniform(4, 12)
        dot(far, x, y, 1.0, hexc('#8a7a52'))
        dot(far, x, y - 0.6, 0.6, hexc('#b8a670'))
    mist(far, 96, 6, hexc('#6a6a5e'), 0.35, seed=288)

    mid = L.mid
    earth_r = ramp('#201812', '#2e2218', '#3e2e20', '#503c28', '#644c32', '#7a5e3e', '#92744c')
    mtops = ridge_fill(
        mid, lambda x: 77 - wave(x, [(2, 2.5, 1.2), (5, 1.5, 0.3), (9, 0.8, 2.2)]), earth_r, seed=291, bottom=MID_H - PAD,
        base_t=0.5, slope_gain=0.4, fade=0.01, tex=0.2,
    )
    wood_r = ramp('#24160e', '#382414', '#4e341c', '#664626', '#805a32', '#9a7040')
    cut_r = ramp('#8a6a3c', '#c8a468', '#ecd09a')
    green_r = ramp('#12201c', '#1a2e24', '#243e2c', '#305036', '#406442', '#547a4e')
    for i, x in enumerate(scatter_points(rng, 2, 0, T, 200)):
        conifer(mid, x, mtops[int(x) % T] + 8, rng.uniform(36, 48), green_r, wood_r, seed=292 + i)
    for x in scatter_points(rng, 7, 0, T, 44):
        log_pile(mid, x, mtops[int(x) % T] + 6, rng.randint(2, 3), rng.uniform(15, 21), wood_r, cut_r)
    for x in scatter_points(rng, 9, 0, T, 30):
        stump(mid, x, mtops[int(x) % T] + 5, rng.uniform(3.5, 5), rng.uniform(2.5, 4), wood_r, cut_r)

    g = L.ground
    surface = 5

    def trodden(u: float, v: float, d: float, px: int, py: int) -> Color:
        n = fbm(u, v, 301, cells=(32, 16, 8, 4))
        rut = fbm(u, v, 302, cells=(64, 32), sy=0.18)
        t = 0.52 + (n - 0.5) * 0.5 - d * 0.003 - (0.18 if 0.5 < rut < 0.54 else 0.0)
        if d < 1:
            t += 0.3
        return shade(earth_r, t, px, py)

    ground_fill(g, surface, trodden)
    rough_top(g, surface, earth_r, 303, 4)
    tufts(g, rng, surface, ramp('#3a3a22', '#56522a', '#767034', '#9a9444'), 60, max_h=4)
    for _ in range(26):  # offcuts and planks
        x, y = rng.uniform(0, T), rng.uniform(surface + 4, GROUND_H - 5)
        a = rng.uniform(-0.4, 0.4)
        ln = rng.uniform(5, 12) * (0.7 + y / GROUND_H * 0.6)
        stroke(g, [(x, y), (x + math.cos(a) * ln, y + math.sin(a) * ln * 0.35)], 1.5, 1.5, wood_r[2:], outline=wood_r[0])
    for _ in range(150):  # wood chips and shavings
        x, y = rng.uniform(0, T), rng.uniform(surface + 2, GROUND_H - 3)
        dot(g, x, y, 0.5, cut_r[rng.randrange(1, 3)])
        if rng.random() < 0.4:
            dot(g, x + 1, y, 0.5, cut_r[1])
    stone_r = ramp('#2a2624', '#4c4640', '#746c60', '#a09684')
    for _ in range(12):
        x, y = rng.uniform(0, T), rng.uniform(surface + 3, GROUND_H - 6)
        w = rng.uniform(1.5, 3.0) * (0.7 + y / GROUND_H)
        ball(g, x, y, w, w * 0.65, stone_r)
    L.landmark = ark_frame(
        ramp('#2a1a10', '#3e2816', '#54381e', '#6c4a28', '#866034', '#a27a44'),
        ramp('#5a3e22', '#7a5830', '#9c7642', '#bc9458', '#d8b272'),
        ramp('#3a2616', '#5a4026', '#7a5a36', '#9a7848'), hexc('#120b08'),
    )
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
    'shore': (paint_shore, (0.75, 0)),
    'grove': (paint_grove, (0.76, -27)),
    'fields': (paint_fields, (0.8, -30)),
    'shipyard': (paint_shipyard, (0.78, -30)),
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
