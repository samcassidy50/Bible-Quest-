#!/usr/bin/env python3
"""
Turns AI-drafted foe sheets kept in art/foe-raw/ into game sheets (the foe counterpart of
process_hero.py).

    python3 scripts/art/process_generated_foes.py [name…] [--preview]

A raw sheet is one picture laid out as a grid, one row per state, each cell holding one frame
facing left. The generator paints a fake grey checkerboard where it should be transparent, so
this script floods in from the picture's edge through neutral grey/white to key it out, shrinks
each frame with a box filter to the native pixel size, drops specks and reduces every frame to one
shared palette so the art snaps back to crisp, flat pixels.

Writes src/assets/foes/<name>.png in the shared painted-foe layout (128px cells, 8 columns, rows
idle 8, attack 8, hurt 4, death 8; the ground line 8px above the bottom of the cell) so FoeSprite.ts
can treat it like the foes from paint_foes.py. Needs Pillow.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / 'art' / 'foe-raw'
OUT_DIR = ROOT / 'src' / 'assets' / 'foes'
PREVIEW_DIR = ROOT / 'art' / 'foe-previews'

CELL = 128
COLS = 8
STATES = ('idle', 'attack', 'hurt', 'death')


@dataclass
class Sheet:
    """Where each output frame comes from in the raw grid, as (row, column)."""

    cols: int
    rows: int
    idle: list[tuple[int, int]]
    attack: list[tuple[int, int]]
    hurt: list[tuple[int, int]]
    death: list[tuple[int, int]]
    # Source pixels per native pixel (the foe's height / the height it should have).
    shrink: float
    # Where the foe rests inside a source cell: x centre and y of its lowest point.
    anchor: tuple[int, int]
    # Where that point lands in the output cell.
    feet: tuple[int, int]
    colors: int = 24
    # Peel off pale grey halo pixels the checkerboard leaves on the edge (for dark-outlined, warm foes).
    defringe: bool = False
    # Stand every frame on its own base (the lowest part of the body) instead of a fixed anchor:
    # for sheets whose rows were not drawn on a steady grid. `base_from` borrows another frame's
    # base, for frames (a death burst) that have none of their own.
    base_align: bool = False
    # Grid rows (0-based) in which every light grey pixel is checkerboard, not just those reachable
    # from the border: bits of it get trapped between wisps of a ragged foe.
    clear_neutral_rows: tuple[int, ...] = ()
    base_from: dict[tuple[int, int], tuple[int, int]] | None = None


def row(r: int, n: int = 8) -> list[tuple[int, int]]:
    return [(r, c) for c in range(n)]


SHEETS: dict[str, Sheet] = {
    # Wind Wisp: a little cloud spirit with green eyes. Rows: idle, run (unused: the game has no
    # run row), attack, death. Its first death frames are the pained flinch, so hurt reuses them.
    # Flame Wisp: a fire spirit. Same rows, but its last row is 4 hurt frames then the burst, so
    # hurt takes those 4 and death runs on from the last flinch into the smoke (6 frames).
    'flame-wisp': Sheet(
        cols=8,
        rows=4,
        idle=row(0),
        attack=row(2),
        hurt=[(3, 0), (3, 1), (3, 2), (3, 3)],
        death=[(3, c) for c in range(2, 8)],
        shrink=3.5,
        anchor=(100, 228),
        feet=(64, 112),
        defringe=True,
    ),
    # Tide Wisp: a water spirit standing on a puddle. Real transparency, but its rows sit at
    # different heights in the grid, so each frame stands on its own base. 5 attack frames; the
    # last row is a 3-frame flinch then the splash, so hurt replays the flinch and death starts
    # from its last frame.
    'tide-wisp': Sheet(
        cols=8,
        rows=4,
        idle=row(0),
        attack=row(2, 5),
        hurt=[(3, 0), (3, 1), (3, 2), (3, 1)],
        death=[(3, c) for c in range(2, 8)],
        shrink=2.9,
        anchor=(0, 0),
        feet=(64, 120),
        base_align=True,
        base_from={(3, c): (3, 2) for c in range(3, 8)},
    ),
    # Storm Wisp: a thundercloud that hovers. Real transparency; rows idle, run (unused), attack,
    # then a flinch, a thunder crack and the burst, so hurt takes the flinch frames.
    'storm-wisp': Sheet(
        cols=8,
        rows=4,
        idle=row(0),
        attack=row(2),
        hurt=[(3, 0), (3, 1), (3, 2), (3, 1)],
        death=[(3, c) for c in range(2, 8)],
        shrink=2.6,
        anchor=(78, 174),
        feet=(64, 112),
    ),
    # Leaf Wisp: a leafy forest spirit that hovers. Real transparency. 4 attack frames (a green orb,
    # then it flies off); the last row opens with a hit flash, three poses, then the leaf burst.
    'leaf-wisp': Sheet(
        cols=8,
        rows=4,
        idle=row(0),
        attack=row(2, 4),
        hurt=[(3, 0), (3, 1), (3, 2), (3, 3)],
        death=[(3, c) for c in range(2, 8)],
        shrink=2.7,
        anchor=(78, 175),
        feet=(64, 112),
    ),
    # Shade Wisp: a violet shadow that hovers. Checkerboard background, 4 attack frames.
    'shade-wisp': Sheet(
        cols=8,
        rows=4,
        idle=row(0),
        attack=row(2, 4),
        hurt=[(3, 0), (3, 1), (3, 2), (3, 1)],
        death=[(3, c) for c in range(2, 8)],
        shrink=3.5,
        anchor=(100, 241),
        feet=(64, 112),
        defringe=True,
        clear_neutral_rows=(0, 1, 3),
    ),
    # Surf Wisp: a wave spirit standing on its splash. Real transparency, 8 attack frames (the blast
    # is out from frame 4); its rows sit at different heights, so each frame stands on its own base.
    'surf-wisp': Sheet(
        cols=8,
        rows=4,
        idle=row(0),
        attack=row(2),
        hurt=[(3, 0), (3, 1), (3, 2), (3, 3)],
        death=[(3, c) for c in range(2, 8)],
        shrink=2.8,
        anchor=(0, 0),
        feet=(64, 120),
        base_align=True,
        base_from={(3, c): (3, 2) for c in range(3, 8)},
    ),
    'wind-wisp': Sheet(
        cols=8,
        rows=4,
        idle=row(0),
        attack=row(2),
        hurt=[(3, 0), (3, 1), (3, 2), (3, 1)],
        death=row(3),
        shrink=3.5,
        anchor=(100, 236),
        feet=(64, 112),
    ),
}


def key_background(im: Image.Image) -> Image.Image:
    """RGBA copy where the grey/white checkerboard reachable from the border is transparent."""
    if im.mode == 'RGBA' and im.getpixel((0, 0))[3] < 255:
        # Already transparent: just harden the soft edge.
        out = im.copy()
        out.putalpha(im.getchannel('A').point(lambda a: 255 if a >= 140 else 0))
        return out
    rgb = im.convert('RGB')
    w, h = rgb.size
    px = rgb.load()

    def neutral(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        return max(r, g, b) - min(r, g, b) < 8 and min(r, g, b) > 190

    gone = bytearray(w * h)
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or gone[y * w + x] or not neutral(x, y):
            continue
        gone[y * w + x] = 1
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    out = rgb.convert('RGBA')
    op = out.load()
    for y in range(h):
        for x in range(w):
            if gone[y * w + x]:
                op[x, y] = (0, 0, 0, 0)
    return out


def clear_neutral(im: Image.Image, rows: tuple[int, ...], grid_rows: int) -> None:
    w, h = im.size
    px = im.load()
    for r in rows:
        for y in range(round(r * h / grid_rows), round((r + 1) * h / grid_rows)):
            for x in range(w):
                p = px[x, y]
                if p[3] and max(p[:3]) - min(p[:3]) < 8 and min(p[:3]) > 190:
                    px[x, y] = (0, 0, 0, 0)


def peel_halo(im: Image.Image, passes: int = 3) -> None:
    """Clears light, colourless pixels that touch transparency (checkerboard residue)."""
    w, h = im.size
    px = im.load()
    for _ in range(passes):
        kill = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if not a or max(r, g, b) - min(r, g, b) > 40 or min(r, g, b) < 150:
                    continue
                if any(
                    not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                ):
                    kill.append((x, y))
        for x, y in kill:
            px[x, y] = (0, 0, 0, 0)


def drop_specks(im: Image.Image, min_pixels: int = 3) -> None:
    """Removes opaque islands smaller than `min_pixels` (left over from the shrink)."""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy][3] == 0:
                continue
            blob, stack = [], [(sx, sy)]
            seen[sy * w + sx] = 1
            while stack:
                x, y = stack.pop()
                blob.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] > 0:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            if len(blob) < min_pixels:
                for x, y in blob:
                    px[x, y] = (0, 0, 0, 0)


MARGIN = 64


def split_cells(keyed: Image.Image, spec: Sheet) -> dict[tuple[int, int], Image.Image]:
    """One RGBA canvas per grid cell, MARGIN source pixels bigger on every side.

    A frame can spill over its cell's edge (a swoosh, a stray bubble), and its neighbour's spill
    can land in it, so pixels are grouped into connected blobs and each blob goes whole to the
    cell holding its centre.
    """
    w, h = keyed.size
    cw, ch = w / spec.cols, h / spec.rows
    px = keyed.load()
    seen = bytearray(w * h)
    cells: dict[tuple[int, int], Image.Image] = {}
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy][3] == 0:
                continue
            blob, stack = [], [(sx, sy)]
            seen[sy * w + sx] = 1
            while stack:
                x, y = stack.pop()
                blob.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] > 0:
                            seen[ny * w + nx] = 1
                            stack.append((nx, ny))
            cx = sum(x for x, _ in blob) // len(blob)
            cy = sum(y for _, y in blob) // len(blob)
            key = (min(spec.rows - 1, int(cy // ch)), min(spec.cols - 1, int(cx // cw)))
            if key not in cells:
                cells[key] = Image.new('RGBA', (int(cw) + 1 + 2 * MARGIN, int(ch) + 1 + 2 * MARGIN), (0, 0, 0, 0))
            canvas = cells[key].load()
            ox, oy = round(key[1] * cw) - MARGIN, round(key[0] * ch) - MARGIN
            for x, y in blob:
                canvas[x - ox, y - oy] = px[x, y]
    return cells


def base_of(cell: Image.Image) -> tuple[int, int]:
    """(x centre, lowest y) of a frame's base, in canvas coordinates."""
    box = cell.getchannel('A').getbbox()
    if not box:
        return (cell.width // 2, cell.height // 2)
    px = cell.load()
    top = box[3] - max(4, round((box[3] - box[1]) * 0.14))
    xs = [x for y in range(top, box[3]) for x in range(box[0], box[2]) if px[x, y][3]]
    return ((min(xs) + max(xs)) // 2, box[3])


def frame_from(cell: Image.Image, spec: Sheet, anchor: tuple[int, int]) -> Image.Image:
    k = spec.shrink
    # Paste the source cell into a window of CELL*k source pixels so its anchor lands on the feet.
    window = Image.new('RGBA', (round(CELL * k), round(CELL * k)), (0, 0, 0, 0))
    ox = round(spec.feet[0] * k - anchor[0])
    oy = round(spec.feet[1] * k - anchor[1])
    window.alpha_composite(cell, (max(ox, 0), max(oy, 0)), (max(-ox, 0), max(-oy, 0)))
    # Pillow premultiplies for the resize, so transparent black does not darken the edge colours.
    return window.resize((CELL, CELL), Image.BOX)


def snap(frames: list[Image.Image], colors: int) -> list[Image.Image]:
    """Hard alpha plus one shared palette over every frame."""
    for f in frames:
        px = f.load()
        for y in range(f.height):
            for x in range(f.width):
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 255) if a >= 110 else (0, 0, 0, 0)
        drop_specks(f)
    mosaic = Image.new('RGB', (CELL * len(frames), CELL), (0, 0, 0))
    opaque = []
    for i, f in enumerate(frames):
        px = f.load()
        for y in range(f.height):
            for x in range(f.width):
                if px[x, y][3]:
                    opaque.append(px[x, y][:3])
    strip = Image.new('RGB', (len(opaque), 1))
    strip.putdata(opaque)
    pal = strip.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)
    out = []
    for f in frames:
        q = f.convert('RGB').quantize(palette=pal, dither=Image.NONE).convert('RGB').convert('RGBA')
        alpha = f.getchannel('A')
        q.putalpha(alpha)
        out.append(q)
    del mosaic
    return out


def build(name: str, preview: bool) -> None:
    spec = SHEETS[name]
    keyed = key_background(Image.open(RAW_DIR / f'{name}.png'))
    if spec.clear_neutral_rows:
        clear_neutral(keyed, spec.clear_neutral_rows, spec.rows)
    if spec.defringe:
        peel_halo(keyed)
    lists = [getattr(spec, state) for state in STATES]
    picks = [rc for frames_ in lists for rc in frames_]
    cells = split_cells(keyed, spec)
    blank = Image.new('RGBA', next(iter(cells.values())).size, (0, 0, 0, 0))

    def anchor_for(rc: tuple[int, int]) -> tuple[int, int]:
        if not spec.base_align:
            return (spec.anchor[0] + MARGIN, spec.anchor[1] + MARGIN)
        return base_of(cells.get((spec.base_from or {}).get(rc, rc), blank))

    frames = snap([frame_from(cells.get(rc, blank), spec, anchor_for(rc)) for rc in picks], spec.colors)
    sheet = Image.new('RGBA', (CELL * COLS, CELL * len(STATES)), (0, 0, 0, 0))
    i = 0
    for ri, state_frames in enumerate(lists):
        for ci in range(len(state_frames)):
            sheet.paste(frames[i], (ci * CELL, ri * CELL))
            i += 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_DIR / f'{name}.png')
    counts = {state: len(fl) for state, fl in zip(STATES, lists)}
    print(f'{name}: wrote src/assets/foes/{name}.png, frames {counts}')
    # Measurements FoeSprite.ts needs (resting height, width).
    box = frames[0].getbbox()
    if box:
        print(f'  idle body height {box[3] - box[1]}px, width {box[2] - box[0]}px, feet {spec.feet}')
    if preview:
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        bg = Image.new('RGBA', sheet.size, (74, 90, 120, 255))
        bg.alpha_composite(sheet)
        bg.save(PREVIEW_DIR / f'{name}.png')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('names', nargs='*', help='sheets to build (default: all)')
    ap.add_argument('--preview', action='store_true', help='also write art/foe-previews/<name>.png')
    args = ap.parse_args()
    for name in args.names or SHEETS:
        build(name, args.preview)


if __name__ == '__main__':
    main()
