import type Phaser from 'phaser';
import { SFX, type SfxName } from '../core/audio/sfxRecipes';
import { renderRecipe } from '../core/audio/synth';
import { createRng } from '../core/rng';
import { updateTestState } from './testHooks';

/**
 * Plays the synthesized sound effects through the game's own Web Audio context, so Phaser's
 * mobile audio unlock (first tap) covers us. Buffers are rendered once on first use.
 * Safe to call before the game boots or when audio is unavailable: it just records the cue.
 */
class SfxService {
  private ctx?: AudioContext;
  private master?: GainNode;
  private readonly cache = new Map<SfxName, AudioBuffer>();
  private readonly rng = createRng(0x5f3759df);
  private _muted = false;
  /** Cues played, newest last (exposed to tests). */
  readonly history: string[] = [];

  attach(game: Phaser.Game): void {
    const sound = game.sound as Partial<Phaser.Sound.WebAudioSoundManager>;
    if (!sound.context) return;
    this.ctx = sound.context;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
  }

  get muted(): boolean {
    return this._muted;
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
  }

  /**
   * Plays a cue. `vary` adds a little random pitch so repeated hits don't sound robotic.
   */
  play(name: SfxName, opts: { volume?: number; vary?: boolean } = {}): void {
    this.history.push(name);
    if (this.history.length > 40) this.history.shift();
    updateTestState({ sounds: [...this.history] });

    const ctx = this.ctx;
    if (!ctx || !this.master || this._muted) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const src = ctx.createBufferSource();
    src.buffer = this.buffer(ctx, name);
    if (opts.vary) src.playbackRate.value = 0.94 + this.rng.next() * 0.12;
    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    src.connect(gain).connect(this.master);
    src.start();
  }

  private buffer(ctx: AudioContext, name: SfxName): AudioBuffer {
    let buf = this.cache.get(name);
    if (!buf) {
      const samples = renderRecipe(SFX[name], ctx.sampleRate);
      buf = ctx.createBuffer(1, Math.max(1, samples.length), ctx.sampleRate);
      buf.copyToChannel(samples, 0);
      this.cache.set(name, buf);
    }
    return buf;
  }
}

export const sfx = new SfxService();
