import Phaser from 'phaser';
import type { DebugParams } from '../core/debugParams';

/** Loads assets (none yet in Phase 0) and routes to the first scene, honouring `?scene=`. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const debug = this.registry.get('debug') as DebugParams;
    const target = debug.scene && debug.scene !== 'boot' ? debug.scene : 'title';
    // Scenes not built yet (battle, scripture) fall back to the title placeholder.
    this.scene.start(this.scene.manager.keys[target] ? target : 'title');
  }
}
