import Phaser from 'phaser';
import type { DebugParams } from '../../core/debugParams';
import type { EncounterFoe } from '../../core/content/types';
import { ENCOUNTERS } from '../../content';
import { Backdrop } from '../backdrop/Backdrop';
import { Fighter } from '../battle/Fighter';
import { FONT_TITLE, FONT_UI } from '../util';
import { updateTestState } from '../../services/testHooks';

/**
 * Foe gallery (dev builds, `?scene=foes`): one passage per screen, with its foes lined up in
 * that passage's backdrop and named. Tap (or press →) for the next passage;
 * `&encounter=gen-005` starts on a given one and `&freeze=1` holds still for screenshots.
 */
export class FoeGalleryScene extends Phaser.Scene {
  private index = 0;
  private backdrop?: Backdrop;
  private shown: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('foes');
  }

  create(): void {
    const debug = this.registry.get('debug') as DebugParams;
    const start = ENCOUNTERS.findIndex((e) => e.id === debug.encounter);
    this.index = start >= 0 ? start : 0;
    this.show();
    this.input.on('pointerdown', () => this.next());
    this.input.keyboard?.on('keydown-RIGHT', () => this.next());
    this.input.keyboard?.on('keydown-LEFT', () => this.next(-1));
    this.scale.on('resize', this.show, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.show, this));
  }

  private next(step = 1): void {
    this.index = (this.index + step + ENCOUNTERS.length) % ENCOUNTERS.length;
    this.show();
  }

  private show(): void {
    const debug = this.registry.get('debug') as DebugParams;
    const encounter = ENCOUNTERS[this.index]!;
    const { width: W, height: H } = this.scale.gameSize;
    const groundY = H * 0.7;
    this.backdrop?.destroy();
    this.shown.forEach((o) => o.destroy());
    this.shown = [];
    this.backdrop = new Backdrop(this, encounter.setting, encounter.weather, debug.freeze);
    this.backdrop.layout(W, H, groundY);

    const label = (x: number, y: number, text: string, size: number, font = FONT_UI) =>
      this.add
        .text(x, y, text, {
          fontFamily: font,
          fontSize: `${size}px`,
          fontStyle: 'bold',
          color: '#fdf6e3',
          stroke: '#0b0816',
          strokeThickness: Math.max(4, size / 5),
        })
        .setOrigin(0.5, 0);
    this.shown.push(
      label(W / 2, 22, `${encounter.reference} · ${encounter.title}`, 34, FONT_TITLE),
    );

    // Left to right in wave order, leaving the right of the screen to the passage's landmark.
    const waves = encounter.waves as EncounterFoe[];
    const slots =
      waves.length === 3 ? [0.13, 0.35, 0.6] : waves.map((_, i) => (i + 1) / (waves.length + 1));
    waves.forEach((spec, i) => {
      const x = W * slots[i]!;
      const foe = new Fighter(this, x, groundY, 'foe', spec.color, spec.size, spec.sprite);
      if (!debug.freeze) foe.idle();
      this.shown.push(
        foe,
        label(x, groundY + 24, spec.name, 26),
        label(x, groundY + 58, `Wave ${i + 1}`, 18),
      );
    });

    updateTestState({
      ready: true,
      scene: 'foes',
      battle: null,
      scripture: null,
      foeGallery: { encounter: encounter.id, foes: waves.map((w) => w.sprite ?? null) },
    });
  }
}
