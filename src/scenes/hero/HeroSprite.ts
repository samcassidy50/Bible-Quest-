import Phaser from 'phaser';
import { eventsBetween, frameAt, localTime, type Clip } from '../../core/anim/clip';
import { HERO_CLIPS, type HeroClipName } from '../../core/anim/heroClips';
import { HERO_FRAMES, HERO_SHEET, type HeroFrame } from '../../core/anim/heroSheet';
import heroSheetUrl from '../../assets/hero/hero.png';

export const HERO_TEXTURE = 'hero';
/** Native pixels → design pixels. The standing hero is 64 px tall natively, 192 on screen. */
export const HERO_SCALE = 3;
const POWER_GLOW = 0xffd36b;

/** Queues the hero sheet on a loader (call from a scene's preload). */
export function loadHeroSheet(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(HERO_TEXTURE, heroSheetUrl, {
    frameWidth: HERO_SHEET.frameWidth,
    frameHeight: HERO_SHEET.frameHeight,
  });
}

/** Keeps the pixel art crisp when scaled up (call once the sheet has loaded). */
export function useNearestFilter(textures: Phaser.Textures.TextureManager): void {
  textures.get(HERO_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/**
 * The hero: an original pixel-art shepherd drawn from AI-drafted strips (art/hero-raw/) and
 * played frame by frame from core/anim clips. Origin is at the feet; faces right.
 */
export class HeroSprite extends Phaser.GameObjects.Sprite {
  private clip: Clip<HeroFrame> = HERO_CLIPS.idle;
  private time = 0;
  private base: HeroClipName = 'idle';
  private finish?: () => void;
  private onEvent?: (name: string) => void;
  private glow?: Phaser.FX.Glow;
  /** Loops stay on their first frame (?freeze=1 screenshots); one-shots still play. */
  frozen = false;
  /** Every clip started, oldest first (exposed to tests). */
  readonly history: string[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, HERO_TEXTURE, HERO_FRAMES.idle_0);
    this.setOrigin(
      HERO_SHEET.originX / HERO_SHEET.frameWidth,
      (HERO_SHEET.originY + 1) / HERO_SHEET.frameHeight,
    );
    this.setScale(HERO_SCALE);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
      this.finish?.();
    });
    scene.add.existing(this);
  }

  get currentClip(): string {
    return this.clip.name;
  }

  /** Switches the looping base animation (idle or run) and starts it now. */
  loop(name: 'idle' | 'run'): void {
    this.base = name;
    if (this.clip.name !== name) this.start(HERO_CLIPS[name]);
  }

  /**
   * Plays a one-shot clip. `onEvent` receives events such as "impact". Resolves when the clip
   * ends (then returns to the base loop unless the clip holds its last frame).
   * Any events not reached are still delivered if the clip is interrupted, so hits always land.
   */
  act(name: HeroClipName, onEvent?: (name: string) => void): Promise<void> {
    const clip: Clip<HeroFrame> = HERO_CLIPS[name];
    if (clip.loop) {
      this.loop(name as 'idle' | 'run');
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.start(clip, onEvent, resolve);
    });
  }

  /** Shows one frame of a clip without ticking (animation viewer contact sheets). */
  showFrame(name: HeroClipName, t: number): void {
    this.clip = HERO_CLIPS[name];
    this.time = t;
    this.frozen = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.setFrame(HERO_FRAMES[frameAt(this.clip, t)]);
  }

  face(dir: 1 | -1): void {
    this.setScale(Math.abs(this.scaleX) * dir, this.scaleY);
  }

  private start(
    clip: Clip<HeroFrame>,
    onEvent?: (name: string) => void,
    finish?: () => void,
  ): void {
    this.flushPrevious();
    this.clip = clip;
    this.time = 0;
    this.onEvent = onEvent;
    this.finish = finish;
    this.setPowerGlow(clip.name === 'slashPowered');
    this.setFrame(HERO_FRAMES[frameAt(clip, 0)]);
    this.history.push(clip.name);
    if (this.history.length > 30) this.history.shift();
  }

  /** Delivers outstanding events and resolves the clip being replaced. */
  private flushPrevious(): void {
    if (!this.clip.loop) {
      for (const e of eventsBetween(this.clip, this.time, this.clip.duration)) this.onEvent?.(e);
    }
    const done = this.finish;
    this.finish = undefined;
    this.onEvent = undefined;
    done?.();
  }

  /** A warm halo while the powered attack plays (WebGL only; the art itself has no glow). */
  private setPowerGlow(on: boolean): void {
    const fx = this.preFX;
    if (!fx) return;
    if (on && !this.glow) this.glow = fx.addGlow(POWER_GLOW, 3, 0, false, 0.1, 12);
    if (!on && this.glow) {
      fx.remove(this.glow);
      this.glow = undefined;
    }
  }

  private onUpdate(_t: number, delta: number): void {
    const dt = delta * this.scene.time.timeScale;
    const clip = this.clip;
    const before = this.time;
    if (!(clip.loop && this.frozen)) this.time += dt;

    if (!clip.loop) {
      for (const e of eventsBetween(clip, before, this.time)) this.onEvent?.(e);
    }
    this.setFrame(HERO_FRAMES[frameAt(clip, this.time)]);

    if (!clip.loop && localTime(clip, this.time) >= clip.duration) {
      const done = this.finish;
      this.finish = undefined;
      this.onEvent = undefined;
      if (!clip.hold) this.start(HERO_CLIPS[this.base]);
      done?.();
    }
  }
}
