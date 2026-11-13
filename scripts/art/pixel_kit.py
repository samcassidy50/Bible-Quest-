"""
Shared helpers for the hand-painted pixel art (paint_items.py, paint_icons.py): colours, masks
(ellipse, polygon, union) and a Canvas with three-tone shading lit from the upper left and a
warm dark outline. Needs Pillow.
"""

from __future__ import annotations

from PIL import Image

# Largest canvas a painter draws on; subclasses crop to their own cell size.
W, H = 112, 100



def hexc(s: str) -> Color:
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


OUTLINE = hexc('3b2414')

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


