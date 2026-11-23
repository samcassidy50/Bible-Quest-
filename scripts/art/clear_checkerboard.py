#!/usr/bin/env python3
"""
Removes a fake transparency checkerboard that an image generator painted into a sprite sheet,
and saves the sheet with a real transparent background.

    python3 scripts/art/clear_checkerboard.py <in.png> <out.png> [--preview <preview.png>]

ChatGPT sometimes "draws" transparency as grey and white squares in plain RGB. This clears every
light, colourless pixel reachable from the image edge without crossing a sprite's dark outline,
then clears enclosed pockets of the same checker greys (gaps between flames, inside splashes)
while keeping small white highlights. Last, it drops the pale anti-aliased halo left around the
outlines. Needs Pillow.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image

LIGHT = 170  # brightest channel at least this, ...
GREY = 40  # ... and channels at most this far apart: a checker square or its smudge
POCKET_MIN = 40  # enclosed checker-grey regions at least this big (source px) are background
HALO_MAX = 4  # halo passes: pale pixels touching the cleared background
DARK = 90  # outline colour: brightest channel below this
DARK_RIM = 0.6  # an enclosed grey patch mostly ringed by outline is trapped background


def is_checker(c: tuple[int, int, int]) -> bool:
    return max(c) >= LIGHT and max(c) - min(c) <= GREY


def is_pale(c: tuple[int, int, int]) -> bool:
    """Anti-aliased blend of the checker into a sprite: light and washed out."""
    return max(c) >= 150 and max(c) - min(c) <= 70 and sum(c) >= 420


def clear(img: Image.Image) -> Image.Image:
    rgb = img.convert('RGB')
    w, h = rgb.size
    px = rgb.load()
    bg = bytearray(w * h)

    def flood(seeds: list[tuple[int, int]]) -> None:
        """Clears checker pixels reachable from the seeds."""
        q: deque[tuple[int, int]] = deque(seeds)
        while q:
            x, y = q.popleft()
            i = y * w + x
            if bg[i] or not is_checker(px[x, y]):
                continue
            bg[i] = 1
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx]:
                    q.append((nx, ny))

    # 1. Flood from the edges over checker pixels.
    flood([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])

    # 2. Enclosed pockets: checker-grey regions big enough to hold both checker tones.
    seen = bytearray(w * h)
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if bg[i] or seen[i] or not is_checker(px[sx, sy]):
                continue
            region = []
            stack = [(sx, sy)]
            seen[i] = 1
            while stack:
                x, y = stack.pop()
                region.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    j = ny * w + nx
                    if 0 <= nx < w and 0 <= ny < h and not seen[j] and not bg[j] and is_checker(px[nx, ny]):
                        seen[j] = 1
                        stack.append((nx, ny))
            tones = {max(px[x, y]) >= 245 for x, y in region}
            # Small slivers of checker trapped between flames sit in dark outline; highlights sit
            # on bright colour.
            rim = [
                px[nx, ny]
                for x, y in region
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                if 0 <= nx < w and 0 <= ny < h and not is_checker(px[nx, ny])
            ]
            dark_rim = bool(rim) and sum(max(c) < DARK for c in rim) >= len(rim) * DARK_RIM
            if (len(region) >= POCKET_MIN and tones == {True, False}) or dark_rim:
                for x, y in region:
                    bg[y * w + x] = 1

    # 3. Pale halo hugging the cleared area. Clearing it can open a path to more checker behind
    #    it (white slivers between flames), so flood again after each pass.
    for _ in range(HALO_MAX):
        edge = [
            (x, y)
            for y in range(1, h - 1)
            for x in range(1, w - 1)
            if not bg[y * w + x]
            and is_pale(px[x, y])
            and (bg[y * w + x - 1] or bg[y * w + x + 1] or bg[(y - 1) * w + x] or bg[(y + 1) * w + x])
        ]
        if not edge:
            break
        for x, y in edge:
            bg[y * w + x] = 1
        flood([n for x, y in edge for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))])

    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if not bg[y * w + x]:
                op[x, y] = px[x, y] + (255,)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src', type=Path)
    ap.add_argument('dst', type=Path)
    ap.add_argument('--preview', type=Path, help='also write the result on a dark background')
    args = ap.parse_args()
    out = clear(Image.open(args.src))
    args.dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.dst, optimize=True)
    if args.preview:
        bg = Image.new('RGBA', out.size, (60, 52, 90, 255))
        bg.alpha_composite(out)
        bg.convert('RGB').save(args.preview)
    print(f'{args.src.name} -> {args.dst}')


if __name__ == '__main__':
    main()
