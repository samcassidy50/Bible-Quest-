#!/usr/bin/env python3
"""
Builds the slime foe sheets from the CraftPix "Free Slime Mobs Pixel Art Top-Down Sprite Pack"
(https://craftpix.net, licence: https://craftpix.net/file-licenses/). Third-party art: the pack
itself is not kept in this repository, so pass the unzipped pack folder.

    python3 scripts/art/process_slimes.py ~/Downloads/craftpix-net-788364-free-slime-mobs-pixel-art-top-down-sprite-pack

Writes src/assets/foes/slime-blue.png (the pack's Slime2) and slime-lava.png (Slime3). The pack's
sheets are 64x64 cells with one row per facing; we keep only the row facing LEFT (toward the
hero) and stack one row per state: idle, attack, hurt, death. Frame counts per state are printed;
keep them in sync with src/scenes/battle/FoeSprite.ts. Needs Pillow.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'src' / 'assets' / 'foes'
CELL = 64
LEFT_ROW = 2  # rows in the pack: down, up, left, right
STATES = ('Idle', 'Attack', 'Hurt', 'Death')
SLIMES = {'slime-blue': 'Slime2', 'slime-lava': 'Slime3'}


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pack = Path(sys.argv[1]).expanduser() / 'PNG'
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for out_name, slime in SLIMES.items():
        rows = []
        for state in STATES:
            src = Image.open(pack / slime / 'Without_shadow' / f'{slime}_{state}_without_shadow.png').convert('RGBA')
            rows.append(src.crop((0, LEFT_ROW * CELL, src.width, (LEFT_ROW + 1) * CELL)))
        sheet = Image.new('RGBA', (max(r.width for r in rows), CELL * len(rows)), (0, 0, 0, 0))
        for i, row in enumerate(rows):
            sheet.paste(row, (0, i * CELL))
        out = OUT_DIR / f'{out_name}.png'
        sheet.save(out, optimize=True)
        counts = ', '.join(f'{s.lower()} {r.width // CELL}' for s, r in zip(STATES, rows))
        print(f'wrote {out.relative_to(ROOT)} ({sheet.width}x{sheet.height}; {counts})')


if __name__ == '__main__':
    main()
