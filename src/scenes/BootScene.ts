import Phaser from 'phaser';
import type { DebugParams } from '../core/debugParams';
import { loadHeroSheet, useNearestFilter } from './hero/HeroSprite';

/** Loads assets (the hero sprite sheet) and routes to the first scene, honouring `?scene=`. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    loadHeroSheet(this.load);
  }

  create(): void {
    useNearestFilter(this.textures);
    const debug = this.registry.get('debug') as DebugParams;
    const target = debug.scene && debug.scene !== 'boot' ? debug.scene : 'title';
    // Scenes not built yet (battle, scripture) fall back to the title placeholder.
    this.scene.start(this.scene.manager.keys[target] ? target : 'title');
  }
}
