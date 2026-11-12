import Phaser from 'phaser';
import type { FoeSpriteId } from '../../core/content/schema';
import slimeBlueUrl from '../../assets/foes/slime-blue.png';
import slimeLavaUrl from '../../assets/foes/slime-lava.png';

export type FoeAnim = 'idle' | 'attack' | 'hurt' | 'death';
const ROWS: FoeAnim[] = ['idle', 'attack', 'hurt', 'death'];

/**
 * Foe sheets built by scripts/art/process_slimes.py from a third-party pack (see art/README.md).
 * One row per state, facing left; keep the frame counts in sync with that script's output.
 */
const CELL = 64;
/** Where the slime's feet are inside a cell. */
const FEET = { x: 33.5, y: 40 };
/** Height of the resting slime in native pixels, for placing the HP bar. */
const BODY_HEIGHT = 28;
/** Twice the hero's pixel size, so these small sprites read as foes. */
const BASE_SCALE = 6;

const SHEETS: Record<FoeSpriteId, { url: string; cols: number; frames: Record<FoeAnim, number> }> =
  {
    'slime-blue': {
      url: slimeBlueUrl,
      cols: 11,
      frames: { idle: 6, attack: 11, hurt: 5, death: 10 },
    },
    'slime-lava': {
      url: slimeLavaUrl,
      cols: 10,
      frames: { idle: 6, attack: 9, hurt: 5, death: 10 },
    },
  };

const textureKey = (id: FoeSpriteId) => `foe-${id}`;

export function loadFoeSheets(load: Phaser.Loader.LoaderPlugin): void {
  for (const id of Object.keys(SHEETS) as FoeSpriteId[])
    load.spritesheet(textureKey(id), SHEETS[id].url, { frameWidth: CELL, frameHeight: CELL });
}

export function useNearestFilterForFoes(textures: Phaser.Textures.TextureManager): void {
  for (const id of Object.keys(SHEETS) as FoeSpriteId[])
    if (textures.exists(textureKey(id)))
      textures.get(textureKey(id)).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/**
 * A sprite foe with its feet at the origin. Frames are stepped by tweens rather than Phaser
 * animations so they follow the scene's time scale (`?fast=1`) like everything else in battle.
 */
export class FoeSprite extends Phaser.GameObjects.Container {
  /** States played so far, oldest first (for tests). */
  readonly history: FoeAnim[] = [];
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly sheet: (typeof SHEETS)[FoeSpriteId];
  private readonly pixelScale: number;
  private stepper?: Phaser.Tweens.Tween;
  private looping = false;
  private dead = false;

  constructor(scene: Phaser.Scene, id: FoeSpriteId, size: number) {
    super(scene, 0, 0);
    this.sheet = SHEETS[id];
    // Whole-number scale keeps the pixels even; bosses (size > 1) are a step bigger.
    this.pixelScale = Math.round(BASE_SCALE * Math.max(1, size));
    const shadow = scene.add.ellipse(
      0,
      0,
      26 * this.pixelScale,
      5 * this.pixelScale,
      0x000000,
      0.3,
    );
    this.sprite = scene.add
      .sprite(0, 0, textureKey(id), 0)
      .setOrigin(FEET.x / CELL, FEET.y / CELL)
      .setScale(this.pixelScale);
    this.add([shadow, this.sprite]);
  }

  get bodyHeight(): number {
    return BODY_HEIGHT * this.pixelScale;
  }

  /** Starts the idle loop (and returns to it after other states). */
  idle(): void {
    this.looping = true;
    if (!this.dead) this.run('idle', 110, true);
  }

  /** Plays a state once over `ms` (default: a natural pace). Resolves when it ends. */
  play(anim: Exclude<FoeAnim, 'idle'>, ms?: number): Promise<void> {
    if (this.dead) return Promise.resolve();
    if (anim === 'death') this.dead = true;
    this.history.push(anim);
    return new Promise((resolve) => {
      this.run(anim, (ms ?? this.sheet.frames[anim] * 70) / this.sheet.frames[anim], false, () => {
        if (!this.dead) {
          if (this.looping) this.idle();
          else this.show('idle', 0);
        }
        resolve();
      });
    });
  }

  private show(anim: FoeAnim, k: number): void {
    this.sprite.setFrame(ROWS.indexOf(anim) * this.sheet.cols + k);
  }

  private run(anim: FoeAnim, frameMs: number, loop: boolean, done?: () => void): void {
    this.stepper?.remove();
    const n = this.sheet.frames[anim];
    this.show(anim, 0);
    this.stepper = this.scene.tweens.addCounter({
      from: 0,
      to: n,
      duration: n * frameMs,
      repeat: loop ? -1 : 0,
      onUpdate: (tween) => this.show(anim, Math.min(n - 1, Math.floor(tween.getValue() ?? 0))),
      onComplete: () => done?.(),
    });
  }

  destroy(fromScene?: boolean): void {
    this.stepper?.remove();
    super.destroy(fromScene);
  }
}
