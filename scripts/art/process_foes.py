#!/usr/bin/env python3
"""
Builds the third-party foe sheets from free sprite packs. The packs themselves are not kept in
this repository, so pass the unzipped folder of each pack you want to rebuild:

    python3 scripts/art/process_foes.py \
        --slimes   <free-slime-mobs-pixel-art-top-down-sprite-pack> \
        --enemies  <free-fantasy-enemies-pixel-art-sprite-pack> \
        --werewolf <free-werewolf-sprite-sheets-pixel-art> \
        --minotaur <free-minotaur-sprite-sheet-pixel-art-pack> \
        --galore   <enemy_galore_i>

The first four are CraftPix free packs (https://craftpix.net, licence:
https://craftpix.net/file-licenses/). `--galore` is Admurin's "Enemy Galore I"
(https://opengameart.org/content/enemy-galore-i, CC-BY 4.0 — credit Admurin).

Writes src/assets/foes/<id>.png: square cells, one row per state (idle, attack, hurt, death),
every foe facing LEFT toward the hero (right-facing packs are mirrored cell by cell). Cell size,
frame counts and the measurements FoeSprite.ts needs (feet, body height, shadow width) are
printed; keep them in sync with src/scenes/battle/FoeSprite.ts. Needs Pillow.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'src' / 'assets' / 'foes'


class Foe:
    """One sheet to build: where its four state strips live and how to read them.

    `row` picks one facing from packs that stack several (the slimes: down, up, left, right).
    `wrap` reads a strip that runs on over several rows (Enemy Galore) in reading order, dropping
    the empty cells that pad the last row. `mirror` flips a right-facing pack cell by cell.
    """

    def __init__(self, pack: str, files: list[str], *, row: int = 0, mirror: bool = False, wrap: bool = False):
        self.pack, self.files, self.row, self.mirror, self.wrap = pack, files, row, mirror, wrap


def craftpix(pack: str, folder: str, states: tuple[str, str, str, str], **kw: object) -> Foe:
    return Foe(pack, [f'{folder}/{s}.png' for s in states], **kw)  # type: ignore[arg-type]


FOES: dict[str, Foe] = {
    'slime-blue': Foe('slimes', [f'PNG/Slime2/Without_shadow/Slime2_{s}_without_shadow.png' for s in ('Idle', 'Attack', 'Hurt', 'Death')], row=2),
    'slime-lava': Foe('slimes', [f'PNG/Slime3/Without_shadow/Slime3_{s}_without_shadow.png' for s in ('Idle', 'Attack', 'Hurt', 'Death')], row=2),
    'thorn-plant': craftpix('enemies', 'Plent', ('Idle', 'Attack_1', 'Hurt', 'Dead'), mirror=True),
    'fire-spirit': craftpix('enemies', 'Fire_Spirit', ('Idle', 'Attack', 'Hurt', 'Dead'), mirror=True),
    'shadow-wolf': craftpix('werewolf', 'Black_Werewolf', ('Idle', 'Attack_1', 'Hurt', 'Dead'), mirror=True),
    'minotaur': craftpix('minotaur', 'Minotaur_1', ('Idle', 'Attack', 'Hurt', 'Dead'), mirror=True),
    # Enemy Galore I: already facing left, one file per state, strips wrapping over several rows.
    'dusk-hound': Foe('galore', [f'Canines/Canine_Black_{s}.png' for s in ('Idle', 'Attack', 'Hit', 'Death')], wrap=True),
    'night-bat': Foe('galore', [f'Bat/Bat_{s}.png' for s in ('Fly', 'Attack', 'Hit', 'Death')], wrap=True),
    'spiked-slime': Foe('galore', [f'Slime/Slime_Spiked_{s}.png' for s in ('Idle', 'Ability', 'Hit', 'Death')], wrap=True),
}

# Cell size per pack; a few Enemy Galore characters are drawn on a smaller grid than the rest.
CELL = {'slimes': 64, 'enemies': 128, 'werewolf': 128, 'minotaur': 128, 'galore': 64}
CELL_OVERRIDE = {'dusk-hound': 32}
STATES = ('idle', 'attack', 'hurt', 'death')


def read_frames(path: Path, cell: int, foe: Foe) -> list[Image.Image]:
    """The frames of one state strip, left to right, facing left."""
    src = Image.open(path).convert('RGBA')
    rows = range(src.height // cell) if foe.wrap else [foe.row]
    frames = []
    for r in rows:
        for c in range(src.width // cell):
            frame = src.crop((c * cell, r * cell, (c + 1) * cell, (r + 1) * cell))
            if foe.wrap and not frame.getbbox():
                continue  # padding at the end of a wrapped strip
            frames.append(ImageOps.mirror(frame) if foe.mirror else frame)
    return frames


def measure(frames: list[Image.Image], cell: int) -> str:
    """The numbers FoeSprite.ts needs, read off the resting (idle) frames."""
    boxes = [f.getbbox() for f in frames if f.getbbox()]
    left = min(b[0] for b in boxes)
    right = max(b[2] for b in boxes)
    top = min(b[1] for b in boxes)
    bottom = max(b[3] for b in boxes)
    return (
        f'feet {{ x: {round((left + right) / 2)}, y: {bottom} }}, '
        f'bodyHeight {bottom - top}, shadow {right - left} (cell {cell})'
    )


def build(name: str, pack: Path) -> None:
    foe = FOES[name]
    cell = CELL_OVERRIDE.get(name, CELL[foe.pack])
    rows = [read_frames(pack / f, cell, foe) for f in foe.files]
    cols = max(len(r) for r in rows)
    sheet = Image.new('RGBA', (cell * cols, cell * len(rows)), (0, 0, 0, 0))
    for i, frames in enumerate(rows):
        for k, frame in enumerate(frames):
            sheet.paste(frame, (k * cell, i * cell))
    out = OUT_DIR / f'{name}.png'
    sheet.save(out, optimize=True)
    counts = ', '.join(f'{s} {len(r)}' for s, r in zip(STATES, rows))
    print(f'wrote {out.relative_to(ROOT)} ({sheet.width}x{sheet.height}, {cell}px cells, {cols} cols; {counts})')
    print(f'       idle: {measure(rows[0], cell)}')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for kind in CELL:
        ap.add_argument(f'--{kind}', type=Path, help=f'unzipped "{kind}" pack folder')
    args = ap.parse_args()
    if not any(getattr(args, kind) for kind in CELL):
        ap.error('pass at least one pack folder')
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, foe in FOES.items():
        pack = getattr(args, foe.pack)
        if pack:
            build(name, pack.expanduser())


if __name__ == '__main__':
    main()
