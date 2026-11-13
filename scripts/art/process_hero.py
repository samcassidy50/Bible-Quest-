#!/usr/bin/env python3
"""
Turns the AI-drafted hero strips in art/hero-raw/ into one pixel-art sprite sheet.

    python3 scripts/art/process_hero.py            # writes the sheet + metadata
    python3 scripts/art/process_hero.py --preview  # also writes art/hero-preview.png

Steps per strip: key out the magenta background, find each frame (splitting frames that
touch), shrink to the native pixel size with a box filter, cut stray specks, then reduce
every frame to one shared palette so the art snaps back to crisp, flat pixels.
All frames are packed into equal cells with the feet on one baseline, so the game can
anchor every frame at the same origin.

Needs Pillow (pip install pillow). Outputs:
  src/assets/hero/hero.png      sprite sheet (cells in a grid, row-major)
  src/core/anim/heroSheet.ts    frame names → indices, cell size and origin
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'art' / 'hero-raw'
OUT_PNG = ROOT / 'src' / 'assets' / 'hero' / 'hero.png'
OUT_TS = ROOT / 'src' / 'core' / 'anim' / 'heroSheet.ts'
PREVIEW = ROOT / 'art' / 'hero-preview.png'

# Height of the standing hero (idle frame) in native pixels.
NATIVE_HEIGHT = 64
# Idle strip: standing hero is this tall in source pixels; everything is scaled relative to it.
IDLE_SOURCE_HEIGHT = 516
PALETTE_SIZE = 32
MIN_SPECK = 6  # connected pieces smaller than this (native px) are dropped
COLUMNS = 8


@dataclass
class Strip:
    file: str
    # Frame names in order. None = present in the strip but not used by the game.
    names: list[str | None]
    # Hero size in this strip relative to the idle strip (measured from body and skin area).
    rel_scale: float


STRIPS = [
    Strip('idle.webp', ['idle_0', 'idle_1', 'idle_2', 'idle_3'], 1.0),
    Strip(
        'run.webp',
        ['run_0', 'run_1', 'run_2', 'run_3', 'run_4', 'run_5', 'run_6', 'run_7'],
        0.48,
    ),
    Strip(
        'slash.webp',
        ['slash_0', 'slash_1', 'slash_2', 'slash_3', 'slash_4', 'slash_5'],
        0.51,
    ),
    Strip(
        'slash-powered.webp',
        ['power_0', 'power_1', 'power_2', 'power_3', 'power_4', 'power_5'],
        0.74,
    ),
    Strip('poses.webp', [None, 'walk', 'thrust', None, None], 0.82),
    Strip('victory.webp', ['win_0', 'win_1', 'win_2', 'win_3', 'win_4'], 0.68),
    Strip('block.webp', ['block_0', 'block_1', 'block_2', 'block_3'], 0.70),
    Strip('cast.webp', ['cast_0', 'cast_1', 'cast_2', 'cast_3', 'cast_4'], 0.68),
    Strip('down.webp', ['down_0', 'down_1', 'down_2', 'down_3', 'down_4'], 0.68),
    Strip('hurt.webp', ['hurt_0', 'hurt_1', 'hurt_2'], 0.92),
]


def is_bg(p: tuple[int, int, int]) -> bool:
    r, g, b = p
    return r > 170 and b > 170 and g < 110 and abs(r - b) < 60


def components(img: Image.Image) -> tuple[list[list[int]], int, int]:
    """Labels connected non-background regions on a half-resolution grid.
    Returns per-label [x0, y0, x1, y1, area] boxes (full-res units) and the label grid size."""
    w, h = img.size
    gw, gh = w // 2, h // 2
    px = img.load()
    fg = [[not is_bg(px[x * 2, y * 2]) for x in range(gw)] for y in range(gh)]
    label = [[-1] * gw for _ in range(gh)]
    boxes: list[list[int]] = []
    for sy in range(gh):
        for sx in range(gw):
            if not fg[sy][sx] or label[sy][sx] >= 0:
                continue
            n = len(boxes)
            box = [sx, sy, sx, sy, 0]
            stack = [(sx, sy)]
            label[sy][sx] = n
            while stack:
                x, y = stack.pop()
                box[0], box[1] = min(box[0], x), min(box[1], y)
                box[2], box[3] = max(box[2], x), max(box[3], y)
                box[4] += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < gw and 0 <= ny < gh and fg[ny][nx] and label[ny][nx] < 0:
                        label[ny][nx] = n
                        stack.append((nx, ny))
            boxes.append(box)
    find_frames.label = label  # type: ignore[attr-defined]
    return [[b[0] * 2, b[1] * 2, b[2] * 2 + 2, b[3] * 2 + 2, b[4] * 4] for b in boxes], gw, gh


def find_frames(img: Image.Image, count: int) -> list[Image.Image]:
    """One full-size mask per frame, left to right. Large connected regions are frame bodies,
    small ones (motion lines, a sword tip drawn apart) join the nearest body. Bodies that
    really touch are split at the emptiest column near their middle."""
    boxes, gw, gh = components(img)
    label = find_frames.label  # type: ignore[attr-defined]
    biggest = max(b[4] for b in boxes)
    bodies = sorted((i for i, b in enumerate(boxes) if b[4] > biggest * 0.15), key=lambda i: boxes[i][0])
    groups: list[dict] = [{'labels': {i}, 'x0': boxes[i][0], 'x1': boxes[i][2], 'cut': None} for i in bodies]

    def split_widest() -> None:
        k = max(range(len(groups)), key=lambda j: groups[j]['x1'] - groups[j]['x0'])
        g = groups[k]
        a, b = g['x0'], g['x1']
        col = [sum(1 for y in range(gh) if label[y][x // 2] in g['labels']) for x in range(a, b, 2)]
        lo, hi = len(col) * 3 // 10, len(col) * 7 // 10
        cut = a + 2 * min(range(lo, hi), key=lambda i: col[i])
        groups[k : k + 1] = [
            {'labels': g['labels'], 'x0': a, 'x1': cut, 'cut': (None, cut)},
            {'labels': g['labels'], 'x0': cut, 'x1': b, 'cut': (cut, None)},
        ]

    while len(groups) < count:
        split_widest()
    if len(groups) != count:
        raise SystemExit(f'expected {count} frames, found {len(groups)}')

    # Attach small pieces (ignore pure noise) to the nearest body horizontally.
    for i, b in enumerate(boxes):
        if i in bodies or b[4] < 40:
            continue
        cx = (b[0] + b[2]) / 2
        g = min(groups, key=lambda g: 0 if g['x0'] <= cx <= g['x1'] else min(abs(cx - g['x0']), abs(cx - g['x1'])))
        g['labels'] = g['labels'] | {i}

    masks = []
    for g in groups:
        m = Image.new('L', (gw, gh), 0)
        mp = m.load()
        lo, hi = g['cut'] if g['cut'] else (None, None)
        for y in range(gh):
            row = label[y]
            for x in range(gw):
                if row[x] in g['labels'] and (lo is None or x * 2 >= lo) and (hi is None or x * 2 < hi):
                    mp[x, y] = 255
        masks.append(m.resize(img.size, Image.NEAREST))
    return masks


def shrink(img: Image.Image, mask: Image.Image, scale: float) -> Image.Image:
    """Box-filters one frame down to native size, averaging only the frame's own pixels."""
    box = mask.getbbox()
    x0, x1 = box[0], box[2]
    crop = img.crop((x0, 0, x1, img.height))
    mask = mask.crop((x0, 0, x1, img.height))
    # Drop background-coloured pixels inside the half-res mask edges.
    mp, cp = mask.load(), crop.load()
    w, h = crop.size
    for y in range(h):
        for x in range(w):
            if mp[x, y] and is_bg(cp[x, y]):
                mp[x, y] = 0
    # Premultiply so background magenta doesn't bleed into edge colours.
    black = Image.new('RGB', crop.size, (0, 0, 0))
    pre = Image.composite(crop, black, mask)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    pre_s = pre.resize((nw, nh), Image.BOX)
    mask_s = mask.resize((nw, nh), Image.BOX)
    out = Image.new('RGBA', (nw, nh), (0, 0, 0, 0))
    op, ps, ms = out.load(), pre_s.load(), mask_s.load()
    for y in range(nh):
        for x in range(nw):
            a = ms[x, y]
            if a >= 128:
                r, g, b = ps[x, y]
                k = 255 / a
                op[x, y] = (min(255, round(r * k)), min(255, round(g * k)), min(255, round(b * k)), 255)
    return drop_specks(out)


def drop_specks(img: Image.Image) -> Image.Image:
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or px[sx, sy][3] == 0:
                continue
            stack, part = [(sx, sy)], []
            seen[sy][sx] = True
            while stack:
                x, y = stack.pop()
                part.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(part) < MIN_SPECK:
                for x, y in part:
                    px[x, y] = (0, 0, 0, 0)
    return img


def opaque_bounds(img: Image.Image) -> tuple[int, int, int, int]:
    box = img.getbbox()
    if not box:
        raise SystemExit('empty frame')
    return box


def feet_anchor_x(img: Image.Image) -> int:
    """Horizontal centre of the lowest rows (the feet), used to line frames up."""
    w, h = img.size
    px = img.load()
    _, _, _, bottom = opaque_bounds(img)
    band = max(3, NATIVE_HEIGHT // 10)
    xs = [x for y in range(bottom - band, bottom) for x in range(w) if px[x, y][3]]
    return round((min(xs) + max(xs)) / 2)


@dataclass
class Frame:
    name: str
    img: Image.Image
    anchor_x: int
    ground_y: int  # baseline row inside img (feet of a standing frame)


def load_frames() -> list[Frame]:
    base = NATIVE_HEIGHT / IDLE_SOURCE_HEIGHT
    frames: list[Frame] = []
    for strip in STRIPS:
        src = Image.open(RAW / strip.file).convert('RGB')
        scale = base / strip.rel_scale
        masks = find_frames(src, len(strip.names))
        # Ground line of the strip = lowest opaque row of any frame, so jumps keep their height.
        shrunk = [shrink(src, m, scale) for m in masks]
        ground = max(opaque_bounds(s)[3] for s in shrunk)
        for name, img in zip(strip.names, shrunk):
            if name:
                frames.append(Frame(name, img, feet_anchor_x(img), ground))
    return frames


def shared_palette(frames: list[Frame]) -> Image.Image:
    """Median-cut palette over all opaque pixels of every frame."""
    pixels = [p[:3] for f in frames for p in f.img.getdata() if p[3]]
    side = int(len(pixels) ** 0.5) + 1
    sample = Image.new('RGB', (side, side))
    sample.putdata(pixels + [pixels[0]] * (side * side - len(pixels)))
    return sample.quantize(colors=PALETTE_SIZE, method=Image.Quantize.MEDIANCUT)


def snap_to_palette(img: Image.Image, pal: Image.Image) -> Image.Image:
    alpha = img.getchannel('A')
    rgb = img.convert('RGB').quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB')
    rgb.putalpha(alpha.point(lambda a: 255 if a else 0))
    return rgb


def pack(frames: list[Frame]) -> tuple[Image.Image, int, int, int, int]:
    left = max(f.anchor_x - opaque_bounds(f.img)[0] for f in frames)
    right = max(opaque_bounds(f.img)[2] - f.anchor_x for f in frames)
    up = max(f.ground_y - opaque_bounds(f.img)[1] for f in frames)
    down = max(opaque_bounds(f.img)[3] - f.ground_y for f in frames)
    half = max(left, right) + 1
    cell_w, cell_h = half * 2, up + max(0, down) + 1
    origin_x, origin_y = half, up
    rows = (len(frames) + COLUMNS - 1) // COLUMNS
    sheet = Image.new('RGBA', (cell_w * COLUMNS, cell_h * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        cx, cy = (i % COLUMNS) * cell_w, (i // COLUMNS) * cell_h
        sheet.alpha_composite(f.img, (cx + origin_x - f.anchor_x, cy + origin_y - f.ground_y))
    return sheet, cell_w, cell_h, origin_x, origin_y


def write_ts(frames: list[Frame], cell_w: int, cell_h: int, ox: int, oy: int) -> None:
    names = '\n'.join(f'  {f.name}: {i},' for i, f in enumerate(frames))
    OUT_TS.write_text(
        f"""// Generated by scripts/art/process_hero.py from art/hero-raw/. Do not edit by hand.

/** Hero sprite sheet layout: equal cells, row-major, feet of every frame at (originX, originY). */
export const HERO_SHEET = {{
  frameWidth: {cell_w},
  frameHeight: {cell_h},
  originX: {ox},
  originY: {oy},
  /** Height of the standing hero in native pixels. */
  standingHeight: {NATIVE_HEIGHT},
}} as const;

export const HERO_FRAMES = {{
{names}
}} as const;

export type HeroFrame = keyof typeof HERO_FRAMES;
"""
    )


def write_preview(sheet: Image.Image, cell_w: int, cell_h: int, oy: int, n: int) -> None:
    zoom = 4
    bg = Image.new('RGBA', sheet.size, (60, 52, 90, 255))
    rows = (n + COLUMNS - 1) // COLUMNS
    line = bg.load()
    for r in range(rows):
        for x in range(sheet.width):
            line[x, r * cell_h + oy] = (120, 90, 60, 255)
    bg.alpha_composite(sheet)
    bg.resize((sheet.width * zoom, sheet.height * zoom), Image.NEAREST).save(PREVIEW)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true')
    args = ap.parse_args()
    frames = load_frames()
    pal = shared_palette(frames)
    for f in frames:
        f.img = snap_to_palette(f.img, pal)
    sheet, cw, ch, ox, oy = pack(frames)
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_PNG, optimize=True)
    write_ts(frames, cw, ch, ox, oy)
    if args.preview:
        write_preview(sheet, cw, ch, oy, len(frames))
    print(f'{len(frames)} frames, cell {cw}x{ch}, sheet {sheet.width}x{sheet.height}', file=sys.stderr)


if __name__ == '__main__':
    main()
