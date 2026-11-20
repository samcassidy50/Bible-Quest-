import Phaser from 'phaser';
import { ITEMS, RUNES, type ItemId, type RuneId } from '../core/battle/runes';

/**
 * A rune gem drawn in code: colour and cut both show the item it fits (so they read without
 * colour too), and a white mark shows its kind. sword: ruby diamond · shield: sapphire octagon ·
 * breastplate: emerald square · sandals: topaz triangle.
 */
const CUTS: Record<ItemId, [number, number][]> = {
  sword: [
    [0, -1],
    [0.72, 0],
    [0, 1],
    [-0.72, 0],
  ],
  shield: [
    [-0.4, -0.95],
    [0.4, -0.95],
    [0.95, -0.4],
    [0.95, 0.4],
    [0.4, 0.95],
    [-0.4, 0.95],
    [-0.95, 0.4],
    [-0.95, -0.4],
  ],
  breastplate: [
    [-0.55, -0.85],
    [0.55, -0.85],
    [0.8, -0.6],
    [0.8, 0.6],
    [0.55, 0.85],
    [-0.55, 0.85],
    [-0.8, 0.6],
    [-0.8, -0.6],
  ],
  sandals: [
    [0, -0.95],
    [0.95, 0.75],
    [-0.95, 0.75],
  ],
};

/** The white mark for each rune kind, as stroked segments in unit coordinates. */
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

const shade = (c: number, f: number) => {
  const ch = (s: number) => Math.min(255, Math.max(0, Math.round(((c >> s) & 0xff) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * Draws a gem at (x, y), `size` px tall. Pass a rune for a full gem, or only an item for an
 * empty slot's outline in that item's colour.
 */
export function runeIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  item: ItemId,
  rune?: RuneId,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  const r = size / 2;
  const color = ITEMS[item].color;
  const pts = CUTS[item].map(([px, py]) => new Phaser.Math.Vector2(px * r, py * r));
  if (!rune) {
    g.fillStyle(0x000000, 0.25).fillPoints(pts, true);
    g.lineStyle(Math.max(2, size / 16), color, 0.9).strokePoints(pts, true);
    return g;
  }
  // Body, a darker lower facet, a light upper facet, outline, then the mark.
  g.fillStyle(color).fillPoints(pts, true);
  const lower = pts.map((p) => new Phaser.Math.Vector2(p.x * 0.6, p.y * 0.6 + r * 0.25));
  g.fillStyle(shade(color, 0.72)).fillPoints(lower, true);
  const upper = pts.map((p) => new Phaser.Math.Vector2(p.x * 0.45 - r * 0.12, p.y * 0.4 - r * 0.3));
  g.fillStyle(shade(color, 1.45), 0.85).fillPoints(upper, true);
  g.lineStyle(Math.max(2, size / 14), shade(color, 0.4)).strokePoints(pts, true);
  g.lineStyle(Math.max(2, size / 12), 0xffffff, 0.95);
  for (const [x1, y1, x2, y2] of MARKS[rune]) g.lineBetween(x1 * r, y1 * r, x2 * r, y2 * r);
  return g;
}

/** "#rrggbb" for text in an item's rune colour. */
export const runeHex = (item: ItemId): string =>
  `#${ITEMS[item].color.toString(16).padStart(6, '0')}`;

export const runeItem = (rune: RuneId): ItemId => RUNES[rune].item;
