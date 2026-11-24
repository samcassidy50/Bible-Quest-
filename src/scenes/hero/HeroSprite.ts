import Phaser from 'phaser';
import { eventsBetween, frameAt, localTime, type Clip } from '../../core/anim/clip';
import { HERO_CLIPS, type HeroClipName } from '../../core/anim/heroClips';
import { HERO_FRAMES, HERO_SHEET, type HeroFrame } from '../../core/anim/heroSheet';
import { HERO_GIRL_SHEET } from '../../core/anim/heroGirlSheet';
import type { DebugParams } from '../../core/debugParams';
import type { HeroKind } from '../../core/progress/progress';
import { progress } from '../../services/progress';
import { updateTestState } from '../../services/testHooks';
import heroSheetUrl from '../../assets/hero/hero.png';
import heroGirlSheetUrl from '../../assets/hero/hero-girl.png';

export const HERO_TEXTURE = 'hero';
export const HERO_GIRL_TEXTURE = 'hero-girl';

/** Each hero's sheet: same frames in the same order (HERO_FRAMES), own cell size and origin. */
interface SheetLayout {
  frameWidth: number;
  frameHeight: number;
  originX: number;
  originY: number;
}
const SHEETS: Record<HeroKind, { texture: string; url: string; layout: SheetLayout }> = {
  boy: { texture: HERO_TEXTURE, url: heroSheetUrl, layout: HERO_SHEET },
  girl: { texture: HERO_GIRL_TEXTURE, url: heroGirlSheetUrl, layout: HERO_GIRL_SHEET },
};

/** The hero to draw: `?hero=` (dev), else the player's choice, else the boy. */
export function currentHero(scene: Phaser.Scene): HeroKind {
  const debug = scene.registry.get('debug') as DebugParams | undefined;
  return debug?.hero ?? progress.save.settings.hero ?? 'boy';
}
/** Native pixels → design pixels. The standing hero is 64 px tall natively, 192 on screen. */
export const HERO_SCALE = 3;

const HALO_KEY = 'hero-power-halo';

/** A soft radial glow, painted once on a canvas texture. */
function haloTexture(textures: Phaser.Textures.TextureManager): string {
  if (textures.exists(HALO_KEY)) return HALO_KEY;
  const size = 160;
  const tex = textures.createCanvas(HALO_KEY, size, size);
  const ctx = tex!.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,211,107,0.7)');
  g.addColorStop(0.5, 'rgba(255,211,107,0.3)');
  g.addColorStop(1, 'rgba(255,211,107,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex!.refresh();
  return HALO_KEY;
}

/** Queues the hero sheet on a loader (call from a scene's preload). */
export function loadHeroSheet(load: Phaser.Loader.LoaderPlugin): void {
  for (const { texture, url, layout } of Object.values(SHEETS)) {
    load.spritesheet(texture, url, {
      frameWidth: layout.frameWidth,
      frameHeight: layout.frameHeight,
    });
  }
}

/** Keeps the pixel art crisp when scaled up (call once the sheet has loaded). */
export function useNearestFilter(textures: Phaser.Textures.TextureManager): void {
  for (const { texture } of Object.values(SHEETS))
    textures.get(texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
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
  /** Soft halo behind the hero during the powered attack (a plain game object, no FX pipeline). */
  private halo?: Phaser.GameObjects.Image;
  /** Loops stay on their first frame (?freeze=1 screenshots); one-shots still play. */
  frozen = false;
  /** Every clip started, oldest first (exposed to tests). */
  readonly history: string[] = [];

  /** Which hero this sprite draws. */
  readonly kind: HeroKind;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: HeroKind = currentHero(scene)) {
    const { texture, layout } = SHEETS[kind];
    super(scene, x, y, texture, HERO_FRAMES.idle_0);
    this.kind = kind;
    this.setOrigin(layout.originX / layout.frameWidth, (layout.originY + 1) / layout.frameHeight);
    updateTestState({ heroSkin: kind });
    this.setScale(HERO_SCALE);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
      this.setPowerGlow(false);
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

  /** A warm halo while the powered attack plays. Drawn as an additive circle, not a Phaser FX. */
  private setPowerGlow(on: boolean): void {
    if (on && !this.halo) {
      const halo = this.scene.add
        .image(0, 0, haloTexture(this.scene.textures))
        .setBlendMode(Phaser.BlendModes.ADD);
      // The sprite lives inside the fighter's containers; sit just behind it in the same one.
      const box = this.parentContainer;
      if (box) box.addAt(halo, Math.max(0, box.getIndex(this)));
      else this.scene.children.moveBelow(halo, this);
      this.halo = halo;
      this.followHalo();
    }
    if (!on && this.halo) {
      this.halo.destroy();
      this.halo = undefined;
    }
  }

  private followHalo(): void {
    this.halo?.setPosition(this.x, this.y - 32 * this.scaleY).setScale(this.scaleY / HERO_SCALE);
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
    this.followHalo();

    if (!clip.loop && localTime(clip, this.time) >= clip.duration) {
      const done = this.finish;
      this.finish = undefined;
      this.onEvent = undefined;
      if (!clip.hold) this.start(HERO_CLIPS[this.base]);
      done?.();
    }
  }
}
