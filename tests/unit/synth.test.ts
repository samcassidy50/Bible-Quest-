import { describe, expect, it } from 'vitest';
import { SFX, SFX_NAMES } from '../../src/core/audio/sfxRecipes';
import {
  envelope,
  note,
  recipeDuration,
  renderLayer,
  renderRecipe,
  type Layer,
} from '../../src/core/audio/synth';

const SR = 8000;
const peak = (a: Float32Array) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
/** Sum of sample-to-sample changes: a rough measure of high-frequency content. */
const roughness = (a: Float32Array) =>
  a.reduce((s, x, i) => (i ? s + Math.abs(x - a[i - 1]!) : 0), 0);

describe('note()', () => {
  it('maps note names to Hz', () => {
    expect(note('A4')).toBeCloseTo(440);
    expect(note('A5')).toBeCloseTo(880);
    expect(note('C4')).toBeCloseTo(261.63, 1);
    expect(note('C#4')).toBeCloseTo(277.18, 1);
    expect(note('Bb3')).toBeCloseTo(233.08, 1);
    expect(() => note('H2')).toThrow(/Bad note/);
  });
});

describe('envelope()', () => {
  const l: Layer = { wave: 'sine', dur: 1, attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.2 };

  it('attacks, decays, sustains, releases, and ends at silence', () => {
    expect(envelope(l, 0)).toBe(0);
    expect(envelope(l, 0.05)).toBeCloseTo(0.5);
    expect(envelope(l, 0.1)).toBeCloseTo(1);
    expect(envelope(l, 0.15)).toBeCloseTo(0.75);
    expect(envelope(l, 0.5)).toBeCloseTo(0.5);
    expect(envelope(l, 0.9)).toBeCloseTo(0.25);
    expect(envelope(l, 1)).toBe(0);
    expect(envelope(l, -1)).toBe(0);
  });

  it('uses sensible defaults', () => {
    expect(envelope({ wave: 'sine', dur: 1 }, 0.5)).toBe(1);
  });
});

describe('rendering', () => {
  it('covers the longest layer including its delay', () => {
    const r = {
      layers: [
        { wave: 'sine' as const, dur: 0.2 },
        { wave: 'sine' as const, dur: 0.1, delay: 0.3 },
      ],
    };
    expect(recipeDuration(r)).toBeCloseTo(0.4);
    expect(renderRecipe(r, SR)).toHaveLength(Math.ceil(0.4 * SR));
    expect(recipeDuration({ layers: [] })).toBe(0);
  });

  it.each(['sine', 'square', 'triangle', 'saw', 'noise'] as const)(
    '%s stays within [-1, 1]',
    (wave) => {
      const out = renderRecipe({ layers: [{ wave, freq: 300, dur: 0.1, volume: 3 }] }, SR);
      expect(peak(out)).toBeLessThanOrEqual(1);
      expect(peak(out)).toBeGreaterThan(0.1);
    },
  );

  it('is deterministic for a seed, and noise changes with the seed', () => {
    const r = { layers: [{ wave: 'noise' as const, dur: 0.05 }] };
    expect(renderRecipe(r, SR, 1)).toEqual(renderRecipe(r, SR, 1));
    expect(renderRecipe(r, SR, 1)).not.toEqual(renderRecipe(r, SR, 2));
  });

  it('low-pass smooths and high-pass removes low rumble', () => {
    const noise = (extra: Partial<Layer>) => {
      const out = new Float32Array(SR / 10);
      renderLayer({ wave: 'noise', dur: 0.1, attack: 0, release: 0, ...extra }, SR, out, 3);
      return out;
    };
    expect(roughness(noise({ lowpass: 200 }))).toBeLessThan(roughness(noise({})) / 3);
    const lowSine = new Float32Array(SR / 10);
    renderLayer(
      { wave: 'sine', freq: 30, dur: 0.1, attack: 0, release: 0, highpass: 2000 },
      SR,
      lowSine,
      1,
    );
    expect(peak(lowSine)).toBeLessThan(0.2);
  });

  it('sweeps pitch and applies vibrato without blowing up', () => {
    const out = renderRecipe(
      {
        layers: [
          {
            wave: 'sine',
            freq: 200,
            freqEnd: 800,
            dur: 0.1,
            lowpass: 3000,
            lowpassEnd: 500,
            vibrato: { rate: 6, depth: 0.05 },
          },
        ],
      },
      SR,
    );
    expect(out.every(Number.isFinite)).toBe(true);
  });

  it('stops writing at the end of the buffer', () => {
    const out = new Float32Array(10);
    renderLayer({ wave: 'sine', dur: 1, delay: 0 }, SR, out, 1);
    expect(out).toHaveLength(10);
  });
});

describe('game sound effects', () => {
  it('has every cue the game plays', () => {
    expect(SFX_NAMES).toEqual(
      expect.arrayContaining([
        'uiTap',
        'start',
        'swing',
        'swingLight',
        'punch',
        'swordHit',
        'slam',
        'foeAttack',
        'hurt',
        'block',
        'shield',
        'heal',
        'calm',
        'ultimate',
        'poweredUp',
        'wrong',
        'orbSpawn',
        'orbCollect',
        'wave',
        'foeDefeat',
        'victory',
        'defeat',
      ]),
    );
  });

  it.each(SFX_NAMES)('%s is short, audible, clean and ends in silence', (name) => {
    const out = renderRecipe(SFX[name], 22050);
    expect(recipeDuration(SFX[name])).toBeLessThanOrEqual(1.5);
    expect(out.every(Number.isFinite)).toBe(true);
    expect(peak(out)).toBeGreaterThan(0.05);
    expect(peak(out)).toBeLessThanOrEqual(1);
    expect(Math.abs(out[out.length - 1]!)).toBeLessThan(0.02);
  });

  it('keeps the wrong-answer cue gentler than the powered-up cue', () => {
    const wrong = renderRecipe(SFX.wrong, 22050);
    const right = renderRecipe(SFX.poweredUp, 22050);
    expect(peak(wrong)).toBeLessThan(peak(right));
  });
});
