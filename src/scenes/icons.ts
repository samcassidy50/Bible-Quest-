import Phaser from 'phaser';
import type { ActionId } from '../core/battle/types';
import iconsSheetUrl from '../assets/items/icons.png';

/**
 * Small pixel-art icons painted by scripts/art/paint_icons.py (keep ORDER and the cell size in
 * sync with that script): one per hero action, plus the energy bolt.
 */
export type IconId = ActionId | 'energy';
const ORDER: IconId[] = [
  'attack',
  'sword',
  'shield',
  'breastplate',
  'sandals',
  'ultimate',
  'energy',
];
const CELL = 20;
export const ICONS_TEXTURE = 'icons';

export function loadIconsSheet(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(ICONS_TEXTURE, iconsSheetUrl, { frameWidth: CELL, frameHeight: CELL });
}

export function useNearestFilterForIcons(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(ICONS_TEXTURE))
    textures.get(ICONS_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export const iconFrame = (id: IconId): number => ORDER.indexOf(id);

/** One icon, centred, at a whole-number `scale` (20 px per step). */
export function iconSprite(
  scene: Phaser.Scene,
  id: IconId,
  scale: number,
): Phaser.GameObjects.Sprite {
  return scene.add.sprite(0, 0, ICONS_TEXTURE, iconFrame(id)).setScale(scale);
}

/** The energy bolt followed by a number, centred on the container's origin. */
export class EnergyCount extends Phaser.GameObjects.Container {
  private readonly bolt: Phaser.GameObjects.Sprite;
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, fontSize: number, fontFamily: string) {
    super(scene, x, y);
    this.bolt = iconSprite(scene, 'energy', fontSize >= 22 ? 2 : 1);
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily,
        fontSize: `${fontSize}px`,
        fontStyle: 'bold',
        color: '#ffd34d',
      })
      .setOrigin(0, 0.5)
      .setShadow(2, 2, '#000', 3);
    this.add([this.bolt, this.text]);
    this.setValue(0);
    scene.add.existing(this);
  }

  setValue(n: number): this {
    this.text.setText(`${n}`);
    const gap = 2;
    const total = this.bolt.displayWidth + gap + this.text.width;
    this.bolt.setX(-total / 2 + this.bolt.displayWidth / 2);
    this.text.setX(-total / 2 + this.bolt.displayWidth + gap);
    return this;
  }
}
