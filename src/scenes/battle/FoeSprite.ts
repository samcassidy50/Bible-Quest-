import Phaser from 'phaser';
import type { FoeSpriteId } from '../../core/content/schema';
import slimeBlueUrl from '../../assets/foes/slime-blue.png';
import slimeLavaUrl from '../../assets/foes/slime-lava.png';
import thornPlantUrl from '../../assets/foes/thorn-plant.png';
import fireSpiritUrl from '../../assets/foes/fire-spirit.png';
import shadowWolfUrl from '../../assets/foes/shadow-wolf.png';
import minotaurUrl from '../../assets/foes/minotaur.png';
import hisslingUrl from '../../assets/foes/hissling.png';
import serpentUrl from '../../assets/foes/serpent.png';
import gustUrl from '../../assets/foes/gust.png';
import stormCloudUrl from '../../assets/foes/storm-cloud.png';
import waveUrl from '../../assets/foes/wave.png';
import floodSurgeUrl from '../../assets/foes/flood-surge.png';
import squallUrl from '../../assets/foes/squall.png';
import tempestUrl from '../../assets/foes/tempest.png';

export type FoeAnim = 'idle' | 'attack' | 'hurt' | 'death';
const ROWS: FoeAnim[] = ['idle', 'attack', 'hurt', 'death'];

/**
 * How a foe crosses the field. No sheet has a run row, so moving replays the idle frames
 * quickly with a bounce (`hop`: slimes, beasts, the plant) or a gentle bob (`glide`: spirits,
 * winds, waves and serpents that float or slither).
 */
export type FoeGait = 'hop' | 'glide';

/**
 * Foe sheets: third-party packs cut by scripts/art/process_foes.py, original foes painted by
 * scripts/art/paint_foes.py, and drafted foes cut by scripts/art/process_drafted_foes.py (see
 * art/README.md). One row per state, facing left; keep cells, columns and frame counts in sync
 * with those scripts' output.
 */
interface Sheet {
  url: string;
  /** Square cell size in native pixels. */
  cell: number;
  cols: number;
  frames: Record<FoeAnim, number>;
  /** Where the foe touches the ground inside a cell. */
  feet: { x: number; y: number };
  /** Height of the resting foe in native pixels, for placing the HP bar. */
  bodyHeight: number;
  /** Screen pixels per native pixel (the hero is 3). Bosses are a step bigger. */
  scale: number;
  /** Width of the ground shadow in native pixels. */
  shadow: number;
  /** How far the foe (weapon included) sticks out toward the hero, in native pixels from its feet. */
  front?: number;
  /** How it moves when approaching the hero (default: hop). */
  gait?: FoeGait;
  /** Attack frame on which the blow lands (default: about 60% through the attack row). */
  impact?: number;
}

/**
 * The slimes are ChatGPT-drafted sheets cut by scripts/art/process_drafted_foes.py (it prints these
 * numbers), shown at the hero's pixel size.
 */
const SLIME = { scale: 3 };

/**
 * The 128px packs draw their feet flush with the bottom edge of the cell. Standing them one pixel
 * past that edge puts their soles on the same line as the hero's, instead of sunk into the
 * ground strip.
 */
const GROUNDED = 129;

/**
 * Original foes painted by scripts/art/paint_foes.py: every sheet has the same layout, with the
 * ground line eight pixels above the bottom of the cell.
 */
const PAINTED = {
  cell: 128,
  cols: 8,
  frames: { idle: 8, attack: 8, hurt: 4, death: 8 },
  feet: { x: 64, y: 120 },
  scale: 3,
};

const GLIDE = { gait: 'glide' as const };

const SHEETS: Record<FoeSpriteId, Sheet> = {
  'slime-blue': {
    ...SLIME,
    url: slimeBlueUrl,
    cell: 84,
    cols: 9,
    frames: { idle: 5, attack: 9, hurt: 5, death: 9 },
    feet: { x: 42, y: 71 },
    bodyHeight: 40,
    shadow: 36,
    front: 15,
    impact: 6, // the splash
  },
  'slime-lava': {
    ...SLIME,
    url: slimeLavaUrl,
    cell: 114,
    cols: 10,
    frames: { idle: 6, attack: 9, hurt: 5, death: 10 },
    feet: { x: 57, y: 101 },
    bodyHeight: 54,
    shadow: 40,
    front: 16,
    impact: 5, // the flames at their tallest
  },
  'thorn-plant': {
    url: thornPlantUrl,
    cell: 128,
    cols: 6,
    frames: { idle: 5, attack: 6, hurt: 3, death: 2 },
    feet: { x: 64, y: GROUNDED },
    bodyHeight: 58,
    scale: 3,
    shadow: 46,
  },
  'fire-spirit': {
    url: fireSpiritUrl,
    cell: 128,
    cols: 14,
    frames: { idle: 6, attack: 14, hurt: 3, death: 5 },
    feet: { x: 64, y: 101 }, // it hovers just above the ground
    bodyHeight: 52,
    scale: 4,
    shadow: 22,
    gait: 'glide',
  },
  'shadow-wolf': {
    url: shadowWolfUrl,
    cell: 128,
    cols: 8,
    frames: { idle: 8, attack: 6, hurt: 2, death: 2 },
    feet: { x: 54, y: GROUNDED },
    bodyHeight: 60,
    scale: 3,
    shadow: 64,
  },
  minotaur: {
    url: minotaurUrl,
    cell: 128,
    cols: 10,
    frames: { idle: 10, attack: 5, hurt: 3, death: 5 },
    feet: { x: 70, y: GROUNDED },
    bodyHeight: 93,
    scale: 3,
    shadow: 54,
    front: 30,
  },
  hissling: { ...PAINTED, url: hisslingUrl, bodyHeight: 54, shadow: 52, front: 26 },
  serpent: { ...PAINTED, ...GLIDE, url: serpentUrl, bodyHeight: 90, shadow: 84, front: 46 },
  gust: { ...PAINTED, ...GLIDE, url: gustUrl, bodyHeight: 60, shadow: 30 },
  'storm-cloud': {
    ...PAINTED,
    ...GLIDE,
    url: stormCloudUrl,
    bodyHeight: 92,
    shadow: 64,
    front: 36,
  },
  wave: { ...PAINTED, ...GLIDE, url: waveUrl, bodyHeight: 54, shadow: 60, front: 26 },
  'flood-surge': {
    ...PAINTED,
    ...GLIDE,
    url: floodSurgeUrl,
    bodyHeight: 78,
    shadow: 96,
    front: 46,
  },
  squall: { ...PAINTED, ...GLIDE, url: squallUrl, bodyHeight: 54, shadow: 40, front: 24 },
  tempest: { ...PAINTED, ...GLIDE, url: tempestUrl, bodyHeight: 96, shadow: 40, front: 34 },
};

const textureKey = (id: FoeSpriteId) => `foe-${id}`;

export function loadFoeSheets(load: Phaser.Loader.LoaderPlugin): void {
  for (const id of Object.keys(SHEETS) as FoeSpriteId[])
    load.spritesheet(textureKey(id), SHEETS[id].url, {
      frameWidth: SHEETS[id].cell,
      frameHeight: SHEETS[id].cell,
    });
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
  /** States played so far, oldest first (for tests); `move` marks each walk across the field. */
  readonly history: (FoeAnim | 'move')[] = [];
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly sheet: Sheet;
  private readonly pixelScale: number;
  private stepper?: Phaser.Tweens.Tween;
  private bounce?: Phaser.Tweens.Tween;
  private looping = false;
  private dead = false;

  constructor(scene: Phaser.Scene, id: FoeSpriteId, size: number) {
    super(scene, 0, 0);
    this.sheet = SHEETS[id];
    // Whole-number scale keeps the pixels even; bosses (size > 1) are a step bigger.
    this.pixelScale = Math.round(this.sheet.scale * Math.max(1, size));
    const shadow = scene.add.ellipse(
      0,
      0,
      this.sheet.shadow * this.pixelScale,
      this.sheet.shadow * 0.2 * this.pixelScale,
      0x000000,
      0.3,
    );
    this.sprite = scene.add
      .sprite(0, 0, textureKey(id), 0)
      .setOrigin(this.sheet.feet.x / this.sheet.cell, this.sheet.feet.y / this.sheet.cell)
      .setScale(this.pixelScale);
    this.add([shadow, this.sprite]);
  }

  /** Screen distance from the feet to the foe's leading edge. */
  get frontReach(): number {
    return (this.sheet.front ?? 0) * this.pixelScale;
  }

  get bodyHeight(): number {
    return this.sheet.bodyHeight * this.pixelScale;
  }

  /** Starts the idle loop (and returns to it after other states). */
  idle(): void {
    this.looping = true;
    if (!this.dead) this.run('idle', 110, true);
  }

  /**
   * Moves across the field: idle frames played quickly with a hop or bob, until `stop()`.
   * `dir` is the way it walks (-1 toward the hero on the left, 1 back); walking back it turns round.
   */
  move(dir: 1 | -1): void {
    if (this.dead) return;
    this.history.push('move');
    this.face(dir);
    this.run('idle', 55, true);
    this.bounce?.remove();
    const hop = (this.sheet.gait ?? 'hop') === 'hop';
    this.bounce = this.scene.tweens.add({
      targets: this.sprite,
      y: -(hop ? 7 : 3) * this.pixelScale,
      duration: hop ? 150 : 260,
      yoyo: true,
      repeat: -1,
      ease: hop ? 'Quad.out' : 'Sine.inOut',
    });
  }

  /** Ends a `move`: lands, faces the hero again and returns to idle. */
  stop(): void {
    this.bounce?.remove();
    this.bounce = undefined;
    this.sprite.y = 0;
    this.face(-1);
    if (this.dead) return;
    if (this.looping) this.idle();
    else this.show('idle', 0);
  }

  /** Frame of the attack row on which the blow lands. */
  get impactFrame(): number {
    return this.sheet.impact ?? Math.round(this.sheet.frames.attack * 0.6);
  }

  /** Default length of a state played once. */
  naturalMs(anim: Exclude<FoeAnim, 'idle'>): number {
    return Math.max(400, this.sheet.frames[anim] * 70);
  }

  /** Plays a state once over `ms` (default: a natural pace). Resolves when it ends. */
  play(anim: Exclude<FoeAnim, 'idle'>, ms?: number, onFrame?: (k: number) => void): Promise<void> {
    if (this.dead) return Promise.resolve();
    if (anim === 'death') this.dead = true;
    this.history.push(anim);
    return new Promise((resolve) => {
      this.run(anim, (ms ?? this.naturalMs(anim)) / this.sheet.frames[anim], false, onFrame, () => {
        if (!this.dead) {
          if (this.looping) this.idle();
          else this.show('idle', 0);
        }
        resolve();
      });
    });
  }

  /** Sheets face left; facing right mirrors the cell about the feet so the foe stays put. */
  private face(dir: 1 | -1): void {
    const flip = dir === 1;
    if (this.sprite.flipX === flip) return;
    const fx = this.sheet.feet.x / this.sheet.cell;
    this.sprite.setFlipX(flip).setOrigin(flip ? 1 - fx : fx, this.sprite.originY);
  }

  private show(anim: FoeAnim, k: number): void {
    this.sprite.setFrame(ROWS.indexOf(anim) * this.sheet.cols + k);
  }

  private run(
    anim: FoeAnim,
    frameMs: number,
    loop: boolean,
    onFrame?: (k: number) => void,
    done?: () => void,
  ): void {
    this.stepper?.remove();
    const n = this.sheet.frames[anim];
    let shown = 0;
    this.show(anim, 0);
    onFrame?.(0);
    this.stepper = this.scene.tweens.addCounter({
      from: 0,
      to: n,
      duration: n * frameMs,
      repeat: loop ? -1 : 0,
      onUpdate: (tween) => {
        const k = Math.min(n - 1, Math.floor(tween.getValue() ?? 0));
        if (k === shown) return;
        // A big time step can skip frames; report each one so no event is missed.
        for (let j = shown + 1; j <= k; j++) onFrame?.(j);
        shown = k;
        this.show(anim, k);
      },
      onRepeat: () => {
        shown = 0;
      },
      onComplete: () => done?.(),
    });
  }

  destroy(fromScene?: boolean): void {
    this.stepper?.remove();
    this.bounce?.remove();
    super.destroy(fromScene);
  }
}
