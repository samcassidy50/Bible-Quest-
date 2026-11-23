#!/usr/bin/env python3
"""
Turns the AI-drafted armor sheet in art/items-raw/ into crisp pixel-art item pictures.

    python3 scripts/art/process_item_art.py [--preview]

The source (art/items-raw/armor-of-god.webp, drafted in ChatGPT) is pixel art drawn about 12x
large on a flat magenta background, with blur and compression noise. Steps: measure the art's
pixel grid (block size and offset) from where colour edges line up, read one colour per block
(the median of its middle, so edges and noise don't leak in), key out the magenta, split the
row into its items at empty columns, drop stray specks, and snap every colour to one shared
palette so the art is flat and clean again.

Output: src/assets/items/item-art.png, one CELL x CELL cell per item in ORDER (keep in sync with
src/scenes/itemArt.ts), each item centred with its bottom on the same line. With --preview,
also art/item-art-preview.png. Needs Pillow.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art' / 'items-raw' / 'armor-of-god.webp'
OUT = ROOT / 'src' / 'assets' / 'items' / 'item-art.png'
PREVIEW = ROOT / 'art' / 'item-art-preview.png'
ORDER = ['sword', 'shield', 'breastplate', 'sandals']
CELL = 56
PALETTE_SIZE = 64
MIN_SPECK = 4


def is_bg(p: tuple[int, int, int]) -> bool:
    r, g, b = p
    return r > 170 and b > 170 and g < 110 and abs(r - b) < 70


def edge_profile(img: Image.Image, axis: int) -> list[float]:
    """Summed colour change between neighbouring columns (axis 0) or rows (axis 1)."""
    w, h = img.size
    px = img.load()
    n = w if axis == 0 else h
    across = range(0, h if axis == 0 else w, 3)
    out = [0.0] * n
    for i in range(1, n):
        s = 0
        for j in across:
            a = px[i, j] if axis == 0 else px[j, i]
            b = px[i - 1, j] if axis == 0 else px[j, i - 1]
            s += abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])
        out[i] = s
    return out


def best_grid(profile: list[float], lo: float = 8.0, hi: float = 16.0) -> tuple[float, float]:
    """The block size and offset whose grid lines fall on the strongest edges."""
    best = (0.0, lo, 0.0)
    b = lo
    while b <= hi:
        ph = 0.0
        while ph < b:
            idx = [round(ph + k * b) for k in range(int((len(profile) - ph) / b))]
            idx = [i for i in idx if 0 < i < len(profile)]
            score = sum(profile[i] for i in idx) / max(1, len(idx))
            if score > best[0]:
                best = (score, b, ph)
            ph += 0.25
        b += 0.02
    return best[1], best[2]


def sample(img: Image.Image, bx: float, px0: float, by: float, py0: float) -> Image.Image:
    """One colour per art pixel: the per-channel median of the middle of its block."""
    w, h = img.size
    src = img.load()
    nw, nh = int((w - px0) / bx), int((h - py0) / by)
    out = Image.new('RGBA', (nw, nh), (0, 0, 0, 0))
    op = out.load()
    for gy in range(nh):
        for gx in range(nw):
            x0, y0 = px0 + gx * bx, py0 + gy * by
            xs = range(int(x0 + bx * 0.3), int(x0 + bx * 0.7) + 1)
            ys = range(int(y0 + by * 0.3), int(y0 + by * 0.7) + 1)
            cols = [src[x, y] for y in ys for x in xs if x < w and y < h]
            if not cols:
                continue
            bg = sum(1 for c in cols if is_bg(c))
            if bg * 2 >= len(cols):
                continue
            cols = [c for c in cols if not is_bg(c)]
            med = tuple(sorted(c[i] for c in cols)[len(cols) // 2] for i in range(3))
            op[gx, gy] = (*med, 255)
    return out


def drop_specks(img: Image.Image) -> Image.Image:
    w, h = img.size
    px = img.load()
    seen: set[tuple[int, int]] = set()
    for sy in range(h):
        for sx in range(w):
            if (sx, sy) in seen or px[sx, sy][3] == 0:
                continue
            stack, part = [(sx, sy)], []
            seen.add((sx, sy))
            while stack:
                x, y = stack.pop()
                part.append((x, y))
                for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= n[0] < w and 0 <= n[1] < h and n not in seen and px[n][3]:
                        seen.add(n)
                        stack.append(n)
            if len(part) < MIN_SPECK:
                for x, y in part:
                    px[x, y] = (0, 0, 0, 0)
    return img


def split_items(img: Image.Image, count: int) -> list[Image.Image]:
    """Cuts the row at its widest empty column runs into `count` items, left to right."""
    w, h = img.size
    px = img.load()
    filled = [any(px[x, y][3] for y in range(h)) for x in range(w)]
    gaps: list[tuple[int, int]] = []
    x = 0
    while x < w:
        if not filled[x]:
            s = x
            while x < w and not filled[x]:
                x += 1
            if s > 0 and x < w:
                gaps.append((x - s, (s + x) // 2))
        else:
            x += 1
    cuts = sorted(c for _, c in sorted(gaps, reverse=True)[: count - 1])
    if len(cuts) != count - 1:
        raise SystemExit(f'expected {count} items, found {len(cuts) + 1}')
    edges = [0, *cuts, w]
    items = []
    for a, b in zip(edges, edges[1:]):
        part = img.crop((a, 0, b, h))
        items.append(part.crop(part.getbbox()))
    return items


def snap(items: list[Image.Image]) -> list[Image.Image]:
    pixels = [p[:3] for im in items for p in im.getdata() if p[3]]
    side = int(len(pixels) ** 0.5) + 1
    sample_img = Image.new('RGB', (side, side))
    sample_img.putdata(pixels + [pixels[0]] * (side * side - len(pixels)))
    pal = sample_img.quantize(colors=PALETTE_SIZE, method=Image.Quantize.MEDIANCUT)
    out = []
    for im in items:
        rgb = im.convert('RGB').quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB')
        rgb.putalpha(im.getchannel('A'))
        out.append(rgb)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument('--preview', action='store_true')
    args = ap.parse_args()

    src = Image.open(SRC).convert('RGB')
    bx, px0 = best_grid(edge_profile(src, 0))
    by, py0 = best_grid(edge_profile(src, 1))
    print(f'grid: {bx:.2f} x {by:.2f} px per art pixel, offset ({px0:.2f}, {py0:.2f})')
    art = drop_specks(sample(src, bx, px0, by, py0))
    items = snap(split_items(art, len(ORDER)))

    sheet = Image.new('RGBA', (CELL * len(ORDER), CELL), (0, 0, 0, 0))
    for i, (name, im) in enumerate(zip(ORDER, items)):
        print(f'{name:12} {im.width}x{im.height}')
        if im.width > CELL or im.height > CELL:
            raise SystemExit(f'{name} is larger than the {CELL}px cell')
        x = i * CELL + (CELL - im.width) // 2
        y = CELL - im.height - (CELL - max(it.height for it in items)) // 2
        sheet.alpha_composite(im, (x, y))
    sheet.save(OUT)
    print(f'wrote {OUT.relative_to(ROOT)}')

    if args.preview:
        bg = Image.new('RGBA', sheet.size, (40, 30, 70, 255))
        bg.alpha_composite(sheet)
        bg.resize((sheet.width * 6, sheet.height * 6), Image.NEAREST).save(PREVIEW)
        print(f'wrote {PREVIEW.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
