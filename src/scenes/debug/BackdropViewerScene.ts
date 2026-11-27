import Phaser from 'phaser';
import type { DebugParams } from '../../core/debugParams';
import { Backdrop, type Weather } from '../backdrop/Backdrop';
import type { Setting } from '../../core/content/schema';
import { HERO_SCALE, HeroSprite } from '../hero/HeroSprite';
import { updateTestState } from '../../services/testHooks';

/** Every environment variant, in story order. */
export const BACKDROP_VARIANTS: { id: string; setting: Setting; weather?: Weather }[] = [
  { id: 'deep', setting: 'deep' },
  { id: 'light', setting: 'light' },
  { id: 'shore', setting: 'shore' },
  { id: 'wilds', setting: 'wilds' },
  { id: 'garden', setting: 'garden' },
  { id: 'grove', setting: 'grove' },
  { id: 'wilderness', setting: 'wilderness' },
  { id: 'fields', setting: 'fields' },
  { id: 'shipyard', setting: 'shipyard' },
  { id: 'flood-storm', setting: 'flood', weather: 'storm' },
  { id: 'flood-clearing', setting: 'flood', weather: 'clearing' },
  { id: 'babel', setting: 'babel' },
  { id: 'sodom', setting: 'sodom' },
  { id: 'plain', setting: 'plain' },
  { id: 'brimstone', setting: 'brimstone' },
  { id: 'canaan', setting: 'canaan' },
  { id: 'dothan', setting: 'dothan' },
  { id: 'caravan', setting: 'caravan' },
  { id: 'estate', setting: 'estate' },
  { id: 'prison', setting: 'prison' },
  { id: 'nile', setting: 'nile' },
  { id: 'palace', setting: 'palace' },
  { id: 'granary', setting: 'granary' },
  { id: 'goshen', setting: 'goshen' },
];

/**
 * Backdrop viewer (dev builds, `?scene=backdrops`): one environment fills the screen with no
 * text or buttons, the hero runs through it with the layers scrolling. Tap (or press →) for the
 * next environment. `?env=garden` starts on a given one.
 */
export class BackdropViewerScene extends Phaser.Scene {
  private index = 0;
  private backdrop?: Backdrop;
  private hero?: HeroSprite;

  constructor() {
    super('backdrops');
  }

  create(): void {
    const debug = this.registry.get('debug') as DebugParams;
    const start = BACKDROP_VARIANTS.findIndex((v) => v.id === debug.env);
    this.index = start >= 0 ? start : 0;
    this.show();
    this.input.on('pointerdown', () => this.next());
    this.input.keyboard?.on('keydown-RIGHT', () => this.next());
    this.input.keyboard?.on('keydown-LEFT', () => this.next(-1));
  }

  private next(step = 1): void {
    this.index = (this.index + step + BACKDROP_VARIANTS.length) % BACKDROP_VARIANTS.length;
    this.show();
  }

  private show(): void {
    const debug = this.registry.get('debug') as DebugParams;
    const v = BACKDROP_VARIANTS[this.index]!;
    const { width: W, height: H } = this.scale.gameSize;
    const groundY = H * 0.78;
    this.backdrop?.destroy();
    this.hero?.destroy();
    this.backdrop = new Backdrop(this, v.setting, v.weather, debug.freeze);
    this.backdrop.layout(W, H, groundY);
    this.hero = new HeroSprite(this, W * 0.22, groundY).setScale(HERO_SCALE);
    this.hero.loop(debug.freeze ? 'idle' : 'run');
    updateTestState({
      ready: true,
      scene: 'backdrops',
      battle: null,
      scripture: null,
      backdrop: v.id,
      backdropPainted: this.backdrop.paintedLayers,
    });
  }

  update(_t: number, delta: number): void {
    const debug = this.registry.get('debug') as DebugParams;
    if (!debug.freeze) this.backdrop?.scroll(delta);
  }
}
