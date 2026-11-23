#!/usr/bin/env python3
"""
Turns ChatGPT-drafted foe sheets in art/foes-raw/ into game foe sheets in src/assets/foes/.

    python3 scripts/art/process_drafted_foes.py [name…] [--preview]

A drafted sheet has one row per state (idle, attack, hurt, death), frames left to right, facing
left. Steps: clear the background (a painted checkerboard, see clear_checkerboard.py), find the
four rows and the frames in each row (pieces split by narrow gaps, such as bubbles and embers,
join their frame), shrink by half, cut stray specks, and pack equal square cells with every frame's feet on one point (each frame stands on the
bottom of its own body). Prints the numbers FoeSprite.ts needs. Needs Pillow.

The drafts aren't drawn on an exact pixel grid, so snapping them to one (or shrinking further and
reducing the palette) blurs the outlines and dulls the colours. Shrinking by 2 and showing them at
3 screen px per pixel, like the hero, keeps them looking like the drafts.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import clear_checkerboard  # noqa: E402
import process_hero as hero  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'art' / 'foes-raw'
OUT = ROOT / 'src' / 'assets' / 'foes'
PREVIEWS = ROOT / 'art' / 'foe-previews'
STATES = ('idle', 'attack', 'hurt', 'death')
ROW_GAP = 12  # empty source rows that separate two state rows
MIN_SPECK = 4  # native px: keeps small bubbles and embers, drops stray dots


@dataclass
class Draft:
    file: str
    frames: tuple[int, int, int, int]  # idle, attack, hurt, death
    shrink: int  # source px per native px


DRAFTS = {
    'slime-blue': Draft('slime-blue.png', (5, 9, 5, 9), 2),
    'slime-lava': Draft('slime-lava.png', (6, 9, 5, 10), 2),
}


def spans(filled: list[bool], gap: int) -> list[tuple[int, int]]:
    """Runs of True, joining runs separated by fewer than `gap` False entries."""
    out: list[tuple[int, int]] = []
    start = None
    for i, f in enumerate(filled + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            if out and start - out[-1][1] < gap:
                out[-1] = (out[-1][0], i)
            else:
                out.append((start, i))
            start = None
    return out


def frames_in_row(band: Image.Image, count: int) -> list[tuple[int, int]]:
    """Column ranges of `count` frames: split at empty columns, then join the pieces with the
    narrowest gaps (bubbles, sparks, a splash drawn apart from its body) until `count` remain."""
    alpha = band.getchannel('A').load()
    w, h = band.size
    filled = [any(alpha[x, y] for y in range(h)) for x in range(w)]
    pieces = spans(filled, 1)
    while len(pieces) > count:
        k = min(range(len(pieces) - 1), key=lambda i: pieces[i + 1][0] - pieces[i][1])
        pieces[k : k + 2] = [(pieces[k][0], pieces[k + 1][1])]
    if len(pieces) != count:
        raise SystemExit(f'expected {count} frames in a row, found {len(pieces)}')
    return pieces


def shrink(img: Image.Image, factor: int) -> Image.Image:
    """Box-filter down by `factor` with premultiplied alpha, then make alpha on/off."""
    w, h = img.size
    small = img.convert('RGBa').resize((max(1, w // factor), max(1, h // factor)), Image.BOX).convert('RGBA')
    px = small.load()
    for y in range(small.height):
        for x in range(small.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return small


def body_bottom(img: Image.Image) -> int:
    """Row below the lowest pixel of the frame's biggest connected piece (the body)."""
    w, h = img.size
    px = img.load()
    seen = bytearray(w * h)
    best: list[tuple[int, int]] = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or not px[sx, sy][3]:
                continue
            part, stack = [], [(sx, sy)]
            seen[sy * w + sx] = 1
            while stack:
                x, y = stack.pop()
                part.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3]:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            if len(part) > len(best):
                best = part
    return max(y for _, y in best) + 1


def cut(name: str, draft: Draft) -> tuple[list[list[Image.Image]], list[list[int]]]:
    """Native frames per state, and each frame's ground row (the bottom of its body)."""
    clean = clear_checkerboard.clear(Image.open(RAW / draft.file))
    alpha = clean.getchannel('A').load()
    w, h = clean.size
    bands = spans([any(alpha[x, y] for x in range(w)) for y in range(h)], ROW_GAP)
    if len(bands) != len(STATES):
        raise SystemExit(f'{name}: expected {len(STATES)} rows, found {len(bands)}')
    hero.MIN_SPECK = MIN_SPECK
    rows, grounds = [], []
    for (y0, y1), count in zip(bands, draft.frames):
        band = clean.crop((0, y0, w, y1))
        frames = []
        for x0, x1 in frames_in_row(band, count):
            frames.append(hero.drop_specks(shrink(band.crop((x0, 0, x1, y1 - y0)), draft.shrink)))
        # Drafted rows don't share a baseline (each frame sits wherever it was drawn in its slot),
        # so every frame stands on the bottom of its own body; loose drops and embers below the
        # body don't lift it off the ground.
        rows.append(frames)
        grounds.append([body_bottom(f) for f in frames])
    return rows, grounds


def build(name: str, draft: Draft, preview: bool) -> None:
    rows, grounds = cut(name, draft)
    flat = [hero.Frame('', f, hero.feet_anchor_x(f), g) for fr, gr in zip(rows, grounds) for f, g in zip(fr, gr)]
    left = max(f.anchor_x - hero.opaque_bounds(f.img)[0] for f in flat)
    right = max(hero.opaque_bounds(f.img)[2] - f.anchor_x for f in flat)
    up = max(f.ground_y - hero.opaque_bounds(f.img)[1] for f in flat)
    down = max(hero.opaque_bounds(f.img)[3] - f.ground_y for f in flat)
    cell = max(2 * max(left, right) + 2, up + down + 2)
    cell += cell % 2
    feet_x, feet_y = cell // 2, cell - 1 - down
    cols = max(draft.frames)
    sheet = Image.new('RGBA', (cell * cols, cell * len(STATES)), (0, 0, 0, 0))
    k = 0
    for r, count in enumerate(draft.frames):
        for c in range(count):
            f = flat[k]
            k += 1
            sheet.alpha_composite(f.img, (c * cell + feet_x - f.anchor_x, r * cell + feet_y - f.ground_y))
    out = OUT / f'{name}.png'
    sheet.save(out, optimize=True)

    idle = flat[0]
    box = hero.opaque_bounds(idle.img)
    body = idle.ground_y - box[1]
    width = box[2] - box[0]
    front = idle.anchor_x - box[0]
    frames = dict(zip(STATES, draft.frames))
    print(f'{name}: {out.relative_to(ROOT)} cell {cell}, cols {cols}, frames {frames}')
    print(f'  feet {{ x: {feet_x}, y: {feet_y} }}, bodyHeight {body}, idle width {width}, front {front}')
    if preview:
        PREVIEWS.mkdir(parents=True, exist_ok=True)
        bg = Image.new('RGBA', sheet.size, (60, 52, 90, 255))
        line = bg.load()
        for r in range(len(STATES)):
            for x in range(sheet.width):
                line[x, r * cell + feet_y] = (120, 90, 60, 255)
        bg.alpha_composite(sheet)
        bg.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(PREVIEWS / f'{name}.png')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('names', nargs='*', help=f'which sheets (default all: {", ".join(DRAFTS)})')
    ap.add_argument('--preview', action='store_true', help='also write art/foe-previews/<name>.png')
    args = ap.parse_args()
    for name in args.names or DRAFTS:
        if name not in DRAFTS:
            raise SystemExit(f'unknown sheet {name}; known: {", ".join(DRAFTS)}')
        build(name, DRAFTS[name], args.preview)


if __name__ == '__main__':
    main()
