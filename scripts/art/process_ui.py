#!/usr/bin/env python3
"""
Builds the pixel UI pieces from the CraftPix "Free Basic Pixel Art UI for RPG" pack
(https://craftpix.net, licence: https://craftpix.net/file-licenses/). The pack itself is not kept
in this repository, so pass its unzipped folder:

    python3 scripts/art/process_ui.py --pack <free-basic-pixel-art-ui-for-rpg> [--preview]

Only plain pieces are used (no baked-in words): the parchment panel, blank green buttons and the
stars. The panel and a grey button are saved as small source pieces; the game tiles their frame
edges (never stretching) to build any size, tints the button to any colour, and shows them at 3x
like the hero.

Outputs src/assets/ui/<name>.png and, with --preview, art/ui-preview.png. Needs Pillow.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'ui'
PREVIEW = ROOT / 'art' / 'ui-preview.png'



def crop(sheet: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    return sheet.crop(box)


def remove_close_button(panel: Image.Image) -> Image.Image:
    """The pack's panel has a close (x) button on its top-right corner; replace that corner with
    the mirrored top-left corner."""
    p = panel.copy()
    c = 16
    corner = p.crop((0, 0, c, c)).transpose(Image.FLIP_LEFT_RIGHT)
    p.paste(corner, (p.width - c, 0))
    return p


def largest_part(img: Image.Image) -> Image.Image:
    """Keeps the largest connected shape (drops specks of neighbouring sprites)."""
    w, h = img.size
    px = img.load()
    seen: set[tuple[int, int]] = set()
    best: list[tuple[int, int]] = []
    for sy in range(h):
        for sx in range(w):
            if px[sx, sy][3] == 0 or (sx, sy) in seen:
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
            if len(part) > len(best):
                best = part
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    for x, y in best:
        out.putpixel((x, y), px[x, y])
    return out


def saturation(img: Image.Image) -> float:
    px = [p for p in img.getdata() if p[3]]
    return sum(max(p[:3]) - min(p[:3]) for p in px) / max(1, len(px))


def greyscale_button(img: Image.Image) -> Image.Image:
    """The light green button as light grey, so the game can tint it to any colour."""
    px = [p for p in img.getdata() if p[3]]
    lum = [round(0.3 * r + 0.59 * g + 0.11 * b) for r, g, b, _ in px]
    top = max(lum)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    src = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = src[x, y]
            if a:
                v = min(255, round((0.3 * r + 0.59 * g + 0.11 * b) * 255 / top))
                out.putpixel((x, y), (v, v, v, a))
    return out


def build(pack: Path) -> dict[str, Image.Image]:
    png = pack / 'PNG'
    win = Image.open(png / 'Win_loose.png').convert('RGBA')
    buttons = Image.open(png / 'Buttons.png').convert('RGBA')

    # Source pieces; the game tiles them to any size (scenes/ui/pixelUi.ts, PIXEL_SLICES).
    out = {'panel': remove_close_button(crop(win, (11, 299, 101, 373)))}
    out['button'] = greyscale_button(crop(buttons, (308, 142, 350, 155)))

    # The four large stars: the two gold ones are the most saturated; keep the first gold one and
    # the first dull one.
    stars = [largest_part(crop(win, (x, 386, x + 29, 414))) for x in (25, 105, 161, 241)]
    ranked = sorted(stars, key=saturation, reverse=True)
    out['star'] = ranked[0]
    out['star-empty'] = ranked[-1]
    return out


def write_preview(pieces: dict[str, Image.Image]) -> None:
    zoom = 3
    w = sum(p.width for p in pieces.values()) + 10 * len(pieces)
    h = max(p.height for p in pieces.values())
    sheet = Image.new('RGBA', (w, h), (40, 34, 70, 255))
    x = 0
    for p in pieces.values():
        sheet.alpha_composite(p, (x, 0))
        x += p.width + 10
    sheet.resize((w * zoom, h * zoom), Image.NEAREST).save(PREVIEW)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--pack', type=Path, required=True, help='unzipped UI pack folder (has PNG/)')
    ap.add_argument('--preview', action='store_true')
    args = ap.parse_args()
    pieces = build(args.pack)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, img in pieces.items():
        img.save(OUT / f'{name}.png', optimize=True)
        print(f'wrote src/assets/ui/{name}.png {img.size}')
    if args.preview:
        write_preview(pieces)


if __name__ == '__main__':
    main()
