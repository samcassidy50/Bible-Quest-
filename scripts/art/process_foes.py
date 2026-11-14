#!/usr/bin/env python3
"""
Builds the third-party foe sheets from CraftPix free packs (https://craftpix.net, licence:
https://craftpix.net/file-licenses/). The packs themselves are not kept in this repository, so
pass the unzipped folder of each pack you want to rebuild:

    python3 scripts/art/process_foes.py \
        --enemies  <free-fantasy-enemies-pixel-art-sprite-pack> \
        --werewolf <free-werewolf-sprite-sheets-pixel-art> \
        --minotaur <free-minotaur-sprite-sheet-pixel-art-pack>

Writes src/assets/foes/<id>.png: square cells, one row per state (idle, attack, hurt, death),
every foe facing LEFT toward the hero (right-facing packs are mirrored cell by cell). Cell size
and frame counts are printed; keep them in sync with src/scenes/battle/FoeSprite.ts.
Needs Pillow.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'src' / 'assets' / 'foes'

# id -> (pack argument, [idle, attack, hurt, death] files inside the pack, row, mirror)
# `row` picks one facing from sheets that stack several.
FOES: dict[str, tuple[str, list[str], int, bool]] = {
    'thorn-plant': ('enemies', [f'Plent/{s}.png' for s in ('Idle', 'Attack_1', 'Hurt', 'Dead')], 0, True),
    'fire-spirit': ('enemies', [f'Fire_Spirit/{s}.png' for s in ('Idle', 'Attack', 'Hurt', 'Dead')], 0, True),
    'shadow-wolf': ('werewolf', [f'Black_Werewolf/{s}.png' for s in ('Idle', 'Attack_1', 'Hurt', 'Dead')], 0, True),
    'minotaur': ('minotaur', [f'Minotaur_1/{s}.png' for s in ('Idle', 'Attack', 'Hurt', 'Dead')], 0, True),
}
CELL = {'enemies': 128, 'werewolf': 128, 'minotaur': 128}
STATES = ('idle', 'attack', 'hurt', 'death')


def build(name: str, pack: Path) -> None:
    kind, files, row, mirror = FOES[name]
    cell = CELL[kind]
    rows = []
    for f in files:
        src = Image.open(pack / f).convert('RGBA')
        strip = src.crop((0, row * cell, src.width, (row + 1) * cell))
        if mirror:
            flipped = Image.new('RGBA', strip.size, (0, 0, 0, 0))
            for k in range(strip.width // cell):
                flipped.paste(ImageOps.mirror(strip.crop((k * cell, 0, (k + 1) * cell, cell))), (k * cell, 0))
            strip = flipped
        rows.append(strip)
    sheet = Image.new('RGBA', (max(r.width for r in rows), cell * len(rows)), (0, 0, 0, 0))
    for i, strip in enumerate(rows):
        sheet.paste(strip, (0, i * cell))
    out = OUT_DIR / f'{name}.png'
    sheet.save(out, optimize=True)
    counts = ', '.join(f'{s} {r.width // cell}' for s, r in zip(STATES, rows))
    print(f'wrote {out.relative_to(ROOT)} ({sheet.width}x{sheet.height}, {cell}px cells, {sheet.width // cell} cols; {counts})')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for kind in CELL:
        ap.add_argument(f'--{kind}', type=Path, help=f'unzipped "{kind}" pack folder')
    args = ap.parse_args()
    if not any(getattr(args, kind) for kind in CELL):
        ap.error('pass at least one pack folder')
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, (kind, *_rest) in FOES.items():
        pack = getattr(args, kind)
        if pack:
            build(name, pack.expanduser())


if __name__ == '__main__':
    main()
