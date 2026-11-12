"""
A small pixel-art engine for the painted foes (paint_foes.py). Original, deterministic, needs Pillow.

Shapes are round primitives (balls, tapered capsules, tubes along a spline) with real surface
normals. Each part is lit from the upper left and quantised to a short colour ramp in clean bands
(no dithering, no noise), then every part gets a one-pixel outline in its own dark colour.
"""

from __future__ import annotations

import math
from typing import Callable, Iterable, Optional

from PIL import Image

W = H = 128  # one cell
GX, GY = 64, 120  # where the foe meets the ground

Color = tuple[int, int, int]
Px = tuple[int, int]


def hexc(s: str) -> Color:
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def ramp(*cs: str) -> list[Color]:
    return [hexc(c) for c in cs]


def mix(a: Color, b: Color, f: float) -> Color:
    return (
        int(round(a[0] + (b[0] - a[0]) * f)),
        int(round(a[1] + (b[1] - a[1]) * f)),
        int(round(a[2] + (b[2] - a[2]) * f)),
    )


def _norm(v: tuple[float, float, float]) -> tuple[float, float, float]:
    n = math.sqrt(sum(k * k for k in v))
    return (v[0] / n, v[1] / n, v[2] / n)


LIGHT = _norm((-0.55, -0.68, 0.5))
BANDS5 = (0.1, 0.36, 0.64, 0.9)  # lit thresholds between five tones


def noise(x: float, y: float, salt: int = 0) -> float:
    """Deterministic 0..1 hash."""
    n = (int(x) * 374761393 + int(y) * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def wave01(f: float, n: int, phase: float = 0.0) -> float:
    """A sine over an n-frame loop, -1..1."""
    return math.sin((f / n + phase) * math.tau)


# ── Shapes ─────────────────────────────────────────────────────────────────────────────────────

# A surface sample: (height, nx, ny, nz, s, u). `s` runs along a tube's spine and `u` across it
# (-1..1); both are 0 for balls.
Surf = dict[Px, tuple[float, float, float, float, float, float]]


def ball(cx: float, cy: float, rx: float, ry: Optional[float] = None, depth: float = 1.0) -> Surf:
    ry = rx if ry is None else ry
    out: Surf = {}
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            u, v = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            q = u * u + v * v
            if q > 1:
                continue
            nz = math.sqrt(1 - q)
            out[(x, y)] = (min(rx, ry) * nz * depth, u, v, nz, 0.0, 0.0)
    return out


def spline(pts: list[tuple[float, ...]], steps: int = 6) -> list[tuple[float, ...]]:
    """Catmull-Rom through the points (any number of coordinates per point)."""
    if len(pts) < 3:
        return list(pts)
    ext = [pts[0]] + list(pts) + [pts[-1]]
    out: list[tuple[float, ...]] = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(steps):
            t = k / steps
            t2, t3 = t * t, t * t * t
            out.append(
                tuple(
                    0.5
                    * (
                        2 * b
                        + (-a + c) * t
                        + (2 * a - 5 * b + 4 * c - d) * t2
                        + (-a + 3 * b - 3 * c + d) * t3
                    )
                    for a, b, c, d in zip(p0, p1, p2, p3)
                )
            )
    out.append(tuple(pts[-1]))
    return out


def tube(pts: list[tuple[float, float, float]], smooth: int = 6, depth: float = 1.0) -> Surf:
    """A tapered tube through (x, y, radius) points, smoothed with a spline."""
    path = spline(pts, smooth) if smooth else list(pts)
    out: Surf = {}
    acc = 0.0
    for (x1, y1, r1), (x2, y2, r2) in zip(path, path[1:]):
        dx, dy = x2 - x1, y2 - y1
        ll = dx * dx + dy * dy or 1e-9
        seg = math.sqrt(ll)
        rm = max(r1, r2)
        for y in range(int(min(y1, y2) - rm) - 1, int(max(y1, y2) + rm) + 2):
            for x in range(int(min(x1, x2) - rm) - 1, int(max(x1, x2) + rm) + 2):
                px, py = x + 0.5, y + 0.5
                t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / ll))
                r = r1 + t * (r2 - r1)
                if r <= 0:
                    continue
                ox, oy = px - (x1 + t * dx), py - (y1 + t * dy)
                d2 = ox * ox + oy * oy
                if d2 > r * r:
                    continue
                nz = math.sqrt(max(0.0, 1 - d2 / (r * r)))
                h = r * nz * depth
                if (x, y) not in out or h > out[(x, y)][0]:
                    u = (dx * oy - dy * ox) / (seg * r)
                    out[(x, y)] = (h, ox / r, oy / r, nz, acc + t * seg, u)
        acc += seg
    return out


def union(*surfs: Surf) -> Surf:
    """Several shapes as one part: the highest surface wins at each pixel."""
    out: Surf = {}
    for s in surfs:
        for p, v in s.items():
            if p not in out or v[0] > out[p][0]:
                out[p] = v
    return out


def poly(pts: list[tuple[float, float]]) -> set[Px]:
    out: set[Px] = set()
    ys = [p[1] for p in pts]
    for y in range(int(math.floor(min(ys))), int(math.ceil(max(ys))) + 1):
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


def line(a: tuple[float, float], b: tuple[float, float]) -> list[Px]:
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) or 1
    out: list[Px] = []
    for i in range(n + 1):
        p = (int(round(a[0] + (b[0] - a[0]) * i / n)), int(round(a[1] + (b[1] - a[1]) * i / n)))
        if not out or out[-1] != p:
            out.append(p)
    return out


def polyline(pts: Iterable[tuple[float, ...]]) -> list[Px]:
    pts = list(pts)
    out: list[Px] = []
    for a, b in zip(pts, pts[1:]):
        for p in line((a[0], a[1]), (b[0], b[1])):
            if not out or out[-1] != p:
                out.append(p)
    return out


def curve(pts: list[tuple[float, float]], steps: int = 8) -> list[Px]:
    """A smooth one-pixel line through the points."""
    return polyline(spline(pts, steps))


def disc(cx: float, cy: float, rx: float, ry: Optional[float] = None) -> set[Px]:
    return set(ball(cx, cy, rx, ry))


def block(x: float, y: float, w: int, h: int) -> list[Px]:
    return [(int(x) + i, int(y) + j) for j in range(h) for i in range(w)]


# ── Canvas ─────────────────────────────────────────────────────────────────────────────────────


class Canvas:
    """Pixels plus, for each, the outline colour it asks for (none: it gets no outline)."""

    def __init__(self) -> None:
        self.px: dict[Px, Color] = {}
        self.edge: dict[Px, Color] = {}

    def put(self, pts: Iterable[tuple[float, float]], color: Color, edge: Optional[Color] = None, only: Optional[set] = None) -> None:
        for p in pts:
            q = (int(p[0]), int(p[1]))
            if only is not None and q not in only:
                continue
            self.px[q] = color
            if edge is not None:
                self.edge[q] = edge
            else:
                self.edge.pop(q, None)

    def tint(self, pts: Iterable[Px], color: Color) -> None:
        """Recolours pixels that are already painted, keeping their outline colour."""
        for p in pts:
            q = (int(p[0]), int(p[1]))
            if q in self.px:
                self.px[q] = color

    def erase(self, pts: Iterable[Px]) -> None:
        for p in pts:
            self.px.pop(p, None)
            self.edge.pop(p, None)

    def solid(
        self,
        surf: Surf,
        tones: list[Color],
        edge: Optional[Color] = None,
        bands: tuple[float, ...] = BANDS5,
        gain: float = 1.0,
        lift: float = 0.0,
        seam: bool = True,
        light: tuple[float, float, float] = LIGHT,
        pick: Optional[Callable[[int, int, int, float, float], Optional[Color]]] = None,
    ) -> set[Px]:
        """
        Lights a part and paints it over what is there. `tones` runs dark to light and `bands`
        are the brightness steps between them. `pick(x, y, tone, s, u)` may return another colour
        for a pixel (patterns, bellies). With `seam`, the part keeps a dark line where its edge
        overlaps something painted earlier.
        """
        n = len(tones)
        for (x, y), (_, nx, ny, nz, s, u) in surf.items():
            lit = max(0.0, nx * light[0] + ny * light[1] + nz * light[2]) * gain + lift
            i = sum(1 for b in bands[: n - 1] if lit > b)
            c = tones[min(n - 1, i)]
            if pick:
                c = pick(x, y, min(n - 1, i), s, u) or c
            if seam and any(
                q not in surf and q in self.px for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
            ):
                c = edge if edge is not None else tones[0]
            self.px[(x, y)] = c
            if edge is not None:
                self.edge[(x, y)] = edge
            else:
                self.edge.pop((x, y), None)
        return set(surf)

    def outline(self) -> None:
        """One-pixel outline around every part, in the darkest colour its neighbours ask for."""
        add: dict[Px, Color] = {}
        for (x, y), c in self.edge.items():
            if (x, y) not in self.px:
                continue
            for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if q not in self.px and (q not in add or sum(c) < sum(add[q])):
                    add[q] = c
        self.px.update(add)

    def despeckle(self, tones: list[Color]) -> None:
        """Removes single stray pixels of one tone inside another (keeps clusters clean)."""
        tset = set(tones)
        for (x, y), c in list(self.px.items()):
            if c not in tset:
                continue
            around = [self.px.get(q) for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))]
            if all(a is not None and a != c and a in tset for a in around):
                # Take the most common neighbour.
                self.px[(x, y)] = max(set(around), key=around.count)  # type: ignore[arg-type]

    def shifted(self, dx: int, dy: int) -> 'Canvas':
        c = Canvas()
        c.px = {(x + dx, y + dy): v for (x, y), v in self.px.items()}
        c.edge = {(x + dx, y + dy): v for (x, y), v in self.edge.items()}
        return c

    def image(self) -> Image.Image:
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            if 0 <= x < W and 0 <= y < H:
                im.putpixel((x, y), (*c, 255))
        return im


def flash(im: Image.Image, amount: float) -> Image.Image:
    """A hit flash: every colour pushed toward white."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (
                    int(r + (255 - r) * amount),
                    int(g + (255 - g) * amount),
                    int(b + (255 - b) * amount),
                    a,
                )
    return out
