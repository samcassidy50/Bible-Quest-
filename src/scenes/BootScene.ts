import Phaser from 'phaser';
import type { DebugParams } from '../core/debugParams';
import { loadBackdropImages, useNearestFilterForBackdrops } from './backdrop/Backdrop';
import { loadHeroSheet, useNearestFilter } from './hero/HeroSprite';
import { loadAngelSheet, useNearestFilterForAngel } from './angel/Angel';
import { loadItemsSheet, useNearestFilterForItems } from './items';
import { loadIconsSheet, useNearestFilterForIcons } from './icons';
import { loadFoeSheets, useNearestFilterForFoes } from './battle/FoeSprite';

/** Loads assets (the hero sprite sheet, painted backdrop layers) and routes to the first scene, honouring `?scene=`. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    loadHeroSheet(this.load);
    loadBackdropImages(this.load);
    loadAngelSheet(this.load);
    loadItemsSheet(this.load);
    loadIconsSheet(this.load);
    loadFoeSheets(this.load);
  }

  create(): void {
    useNearestFilter(this.textures);
    useNearestFilterForBackdrops(this.textures);
    useNearestFilterForAngel(this.textures);
    useNearestFilterForItems(this.textures);
    useNearestFilterForIcons(this.textures);
    useNearestFilterForFoes(this.textures);
    const debug = this.registry.get('debug') as DebugParams;
    const target = debug.scene && debug.scene !== 'boot' ? debug.scene : 'title';
    // Scenes not built yet (battle, scripture) fall back to the title placeholder.
    this.scene.start(this.scene.manager.keys[target] ? target : 'title');
  }
}
