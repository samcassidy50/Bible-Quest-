import Phaser from 'phaser';
import type { ItemId } from '../core/battle/runes';
import itemArtUrl from '../assets/items/item-art.png';

/**
 * Large pixel-art pictures of the four items, built from an AI-drafted sheet by
 * scripts/art/process_item_art.py (keep ORDER and CELL in sync with that script). Used where an
 * item is shown big, such as the Runes screen; small UI keeps the 20 px icons (icons.ts).
 */
const ORDER: ItemId[] = ['sword', 'shield', 'breastplate', 'sandals'];
export const ITEM_ART_CELL = 56;
export const ITEM_ART_TEXTURE = 'item-art';

export function loadItemArt(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(ITEM_ART_TEXTURE, itemArtUrl, {
    frameWidth: ITEM_ART_CELL,
    frameHeight: ITEM_ART_CELL,
  });
}

export function useNearestFilterForItemArt(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(ITEM_ART_TEXTURE))
    textures.get(ITEM_ART_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** One item picture, centred, at a whole-number `scale` (56 px per step). */
export function itemArtSprite(
  scene: Phaser.Scene,
  item: ItemId,
  scale: number,
): Phaser.GameObjects.Sprite {
  return scene.add.sprite(0, 0, ITEM_ART_TEXTURE, ORDER.indexOf(item)).setScale(scale);
}
