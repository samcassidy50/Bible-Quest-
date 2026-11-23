import Phaser from 'phaser';
import { ITEMS, RUNES, type ItemId, type RuneId } from '../core/battle/runes';
import runesSheetUrl from '../assets/items/runes.png';

/**
 * A blessing gem: a pixel-art crystal (src/assets/items/runes.png, built by
 * scripts/art/process_runes.py; keep ORDER in sync with that script). Colour and crystal shape both
 * show the item it fits, so they read without colour too, and a white mark on a dark badge shows
 * its kind. sword: ruby · shield: sapphire · breastplate: emerald · sandals: topaz.
 */
const ORDER: ItemId[] = ['sword', 'shield', 'breastplate', 'sandals'];
const CELL = 64;
/** Rough size of the crystals inside their cell (large row, small row). */
const CONTENT = { large: 50, small: 25 };
/** Below this display size the small crystal is used (crisper than shrinking the large one). */
const SMALL_BELOW = 34;
/** Smallest display size that still gets the kind mark. */
const MARK_FROM = 30;
export const RUNES_TEXTURE = 'runes';

export function loadRunesSheet(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(RUNES_TEXTURE, runesSheetUrl, { frameWidth: CELL, frameHeight: CELL });
}

export function useNearestFilterForRunes(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(RUNES_TEXTURE))
    textures.get(RUNES_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** The white mark for each blessing kind, as stroked segments in unit coordinates. */
const MARKS: Record<RuneId, [number, number, number, number][]> = {
  might: [
    [0, -0.45, 0, 0.45],
    [-0.25, 0.2, 0.25, 0.2],
  ],
  zeal: [
    [-0.3, 0.05, 0, -0.25],
    [0, -0.25, 0.3, 0.05],
    [-0.3, 0.35, 0, 0.05],
    [0, 0.05, 0.3, 0.35],
  ],
  life: [
    [0, -0.35, 0, 0.35],
    [-0.35, 0, 0.35, 0],
  ],
  guard: [
    [-0.35, -0.2, 0.35, -0.2],
    [-0.35, -0.2, 0, 0.35],
    [0.35, -0.2, 0, 0.35],
  ],
  mending: [
    [0, -0.35, 0, 0.35],
    [-0.3, -0.05, 0.3, -0.05],
    [-0.3, 0.35, 0.3, 0.35],
  ],
  renewal: [
    [-0.3, -0.3, 0.3, -0.3],
    [0.3, -0.3, 0.3, 0.3],
    [0.3, 0.3, -0.3, 0.3],
  ],
  haste: [
    [-0.35, -0.1, -0.05, 0.2],
    [-0.05, 0.2, -0.35, 0.5],
    [0.05, -0.1, 0.35, 0.2],
    [0.35, 0.2, 0.05, 0.5],
  ],
  peace: [
    [-0.4, 0.3, 0.4, 0.3],
    [-0.25, 0.05, 0.25, 0.05],
  ],
};

/**
 * Draws a gem at (x, y), about `size` px tall. Pass a blessing for a full gem with its mark, or only
 * an item for an empty slot: that item's crystal as a dim silhouette.
 */
export function runeIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  item: ItemId,
  rune?: RuneId,
): Phaser.GameObjects.Container {
  const box = scene.add.container(x, y);
  const small = size < SMALL_BELOW;
  const frame = ORDER.indexOf(item) + (small ? ORDER.length : 0);
  const scale = size / (small ? CONTENT.small : CONTENT.large);
  const gem = scene.add.sprite(0, 0, RUNES_TEXTURE, frame).setScale(scale);
  box.add(gem);
  if (!rune) {
    gem.setTintFill(0x000000).setAlpha(0.35);
    return box;
  }
  // Too small for a legible mark: the crystal alone (callers name the blessing beside it).
  if (size < MARK_FROM) return box;
  // The mark sits on a round badge at the lower right, so it stays clear on any crystal.
  const r = Math.max(7, size * 0.24);
  const bx = size * 0.32;
  const by = size * 0.3;
  const g = scene.add.graphics({ x: bx, y: by });
  g.fillStyle(0x1a120a, 0.85).fillCircle(0, 0, r);
  g.lineStyle(Math.max(1, r / 6), ITEMS[item].color, 1).strokeCircle(0, 0, r);
  g.lineStyle(Math.max(1.5, r / 4), 0xffffff, 0.95);
  const m = r * 1.15;
  for (const [x1, y1, x2, y2] of MARKS[rune]) g.lineBetween(x1 * m, y1 * m, x2 * m, y2 * m);
  box.add(g);
  return box;
}

/** "#rrggbb" for text in an item's blessing colour. */
export const runeHex = (item: ItemId): string =>
  `#${ITEMS[item].color.toString(16).padStart(6, '0')}`;

export const runeItem = (rune: RuneId): ItemId => RUNES[rune].item;
