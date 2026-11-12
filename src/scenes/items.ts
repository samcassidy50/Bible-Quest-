import Phaser from 'phaser';
import type { SpecialId } from '../core/battle/types';
import itemsSheetUrl from '../assets/items/items.png';

/**
 * Pixel-art armor items painted by scripts/art/paint_items.py (keep ORDER and the cell size in
 * sync with that script). Shown at the same 3x pixel size as the hero.
 */
const ORDER: (SpecialId | 'ultimate')[] = ['sword', 'shield', 'breastplate', 'sandals', 'ultimate'];
const CELL = { frameWidth: 40, frameHeight: 44 };
export const ITEMS_TEXTURE = 'items';
export const ITEM_SCALE = 3;

export function loadItemsSheet(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(ITEMS_TEXTURE, itemsSheetUrl, CELL);
}

export function useNearestFilterForItems(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(ITEMS_TEXTURE))
    textures.get(ITEMS_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/**
 * A sprite of one armor item as the angel presents it: the sword lies across the hands pointing
 * toward the hero; other items are held in front of the robe, below the face.
 */
export function itemSprite(
  scene: Phaser.Scene,
  item: SpecialId | 'ultimate',
): Phaser.GameObjects.Sprite {
  const sprite = scene.add.sprite(0, 0, ITEMS_TEXTURE, ORDER.indexOf(item)).setScale(ITEM_SCALE);
  if (item === 'sword') return sprite.setOrigin(0.5, 0.5).setAngle(-90);
  return sprite.setOrigin(0.5, 0.3);
}
