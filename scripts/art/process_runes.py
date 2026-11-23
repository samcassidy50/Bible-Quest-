#!/usr/bin/env python3
"""
Builds the blessing gem sheet from the CraftPix "Top-Down Crystals Pixel Art" pack
(https://craftpix.net, licence: https://craftpix.net/file-licenses/). The pack itself is not kept
in this repository, so pass its unzipped folder:

    python3 scripts/art/process_runes.py --pack <top-down-crystals-pixel-art> [--preview]

Each item's blessings use one crystal, recoloured to that item's gem colour (keep ITEMS in
src/core/battle/runes.ts and ORDER in src/scenes/runeIcon.ts in sync). The crystals have
different shapes, so a blessing reads without colour too.

Output: src/assets/items/runes.png, a grid of CELL px cells. Row 0 is the large crystal of each
item (pack size 1), row 1 the small one (pack size 3, sharper at small sizes), both centred in
their cell. With --preview, also art/runes-preview.png. Needs Pillow.
"""

from __future__ import annotations

import argparse
import colorsys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'items' / 'runes.png'
PREVIEW = ROOT / 'art' / 'runes-preview.png'
CELL = 64

# item -> (crystal file stem, target hue in degrees or None to keep, saturation x, value x)
ITEMS: list[tuple[str, str, float | None, float, float]] = [
    ('sword', 'Red_crystal', 356, 1.05, 1.0),
    ('shield', 'Blue_crystal', None, 1.1, 1.05),
    ('breastplate', 'Green_crystal', 140, 1.0, 1.55),
    ('sandals', 'Yellow_crystal', None, 1.0, 1.0),
]


def recolour(img: Image.Image, hue: float | None, sat: float, val: float) -> Image.Image:
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if hue is not None:
                h = hue / 360
            s = min(1.0, s * sat)
            v = min(1.0, v * val)
            nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


def trimmed(img: Image.Image) -> Image.Image:
    box = img.getbbox()
    return img.crop(box) if box else img


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument('--pack', required=True, type=Path, help='unzipped crystals pack folder')
    ap.add_argument('--preview', action='store_true')
    args = ap.parse_args()
    src = args.pack / 'PNG' / 'Assets'
    if not src.is_dir():
        raise SystemExit(f'not found: {src}')

    sheet = Image.new('RGBA', (CELL * len(ITEMS), CELL * 2), (0, 0, 0, 0))
    for col, (item, stem, hue, sat, val) in enumerate(ITEMS):
        for row, size in enumerate(('1', '3')):
            gem = trimmed(Image.open(src / f'{stem}{size}.png').convert('RGBA'))
            gem = recolour(gem, hue, sat, val)
            x = col * CELL + (CELL - gem.width) // 2
            y = row * CELL + (CELL - gem.height) // 2
            sheet.alpha_composite(gem, (x, y))
            print(f'{item:12} size {size}: {gem.width}x{gem.height}')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    print(f'wrote {OUT.relative_to(ROOT)}')

    if args.preview:
        bg = Image.new('RGBA', sheet.size, (42, 29, 16, 255))
        bg.alpha_composite(sheet)
        bg.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(PREVIEW)
        print(f'wrote {PREVIEW.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
