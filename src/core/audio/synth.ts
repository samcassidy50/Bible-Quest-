import { createRng } from '../rng';

/**
 * Tiny sound-effect synthesizer (no audio files, no licensing). A recipe is a list of layers;
 * each layer is an oscillator or noise with a pitch sweep, an ADSR envelope and optional
 * filters. Rendering is pure: same recipe + sample rate + seed → same samples.
 */
export type Wave = 'sine' | 'square' | 'triangle' | 'saw' | 'noise';

export interface Layer {
  wave: Wave;
  /** Start pitch in Hz (ignored by noise). */
  freq?: number;
  /** End pitch in Hz; the sweep is exponential. Defaults to `freq`. */
  freqEnd?: number;
  /** Seconds before the layer starts. */
  delay?: number;
  /** Seconds the layer lasts, including its release. */
  dur: number;
  attack?: number;
  decay?: number;
  /** Level held after the decay (0..1). Defaults to 1. */
  sustain?: number;
  release?: number;
  volume?: number;
  /** One-pole low-pass cutoff in Hz, optionally sweeping to `lowpassEnd`. */
  lowpass?: number;
  lowpassEnd?: number;
  /** One-pole high-pass cutoff in Hz. */
  highpass?: number;
  /** Pitch wobble: rate in Hz, depth as a fraction of the pitch (0.02 = 2%). */
  vibrato?: { rate: number; depth: number };
}

export interface Recipe {
  layers: readonly Layer[];
  /** Overall level after mixing (default 0.8). */
  gain?: number;
}

const NOTE_INDEX: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** Note name → Hz, e.g. "A4" = 440, "C#5", "Bb3". */
export function note(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  const [, letter, accidental, octave] = m as unknown as [string, string, string, string];
  const semis =
    NOTE_INDEX[letter]! +
    (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) +
    (Number(octave) - 4) * 12;
  return 440 * 2 ** (semis / 12);
}

/** Total length of a recipe in seconds. */
export function recipeDuration(r: Recipe): number {
  return Math.max(0, ...r.layers.map((l) => (l.delay ?? 0) + l.dur));
}

/** ADSR level at time t (seconds) within a layer of length dur; always 0 at the end. */
export function envelope(l: Layer, t: number): number {
  const a = l.attack ?? 0.005;
  const d = l.decay ?? 0;
  const s = l.sustain ?? 1;
  const r = Math.min(l.release ?? 0.05, l.dur);
  if (t < 0 || t >= l.dur) return 0;
  let level: number;
  if (t < a) level = t / a;
  else if (t < a + d) level = 1 - (1 - s) * ((t - a) / d);
  else level = s;
  const releaseStart = l.dur - r;
  if (t > releaseStart && r > 0) level *= 1 - (t - releaseStart) / r;
  return level;
}

function oscillator(wave: Wave, phase: number, noise: () => number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'triangle':
      return 1 - 4 * Math.abs(p - 0.5);
    case 'saw':
      return 2 * p - 1;
    case 'noise':
      return noise();
  }
}

export function renderLayer(l: Layer, sampleRate: number, out: Float32Array, seed: number): void {
  const rng = createRng(seed);
  const noise = () => rng.next() * 2 - 1;
  const start = Math.round((l.delay ?? 0) * sampleRate);
  const n = Math.round(l.dur * sampleRate);
  const f0 = l.freq ?? 440;
  const f1 = l.freqEnd ?? f0;
  const lp0 = l.lowpass;
  const lp1 = l.lowpassEnd ?? lp0;
  const vol = l.volume ?? 1;
  let phase = 0;
  let lpState = 0;
  let hpState = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / sampleRate;
    const k = n > 1 ? i / (n - 1) : 0;
    let freq = f0 * (f1 / f0) ** k;
    if (l.vibrato) freq *= 1 + l.vibrato.depth * Math.sin(2 * Math.PI * l.vibrato.rate * t);
    phase += freq / sampleRate;
    let x = oscillator(l.wave, phase, noise);
    if (lp0 !== undefined && lp1 !== undefined) {
      const fc = lp0 * (lp1 / lp0) ** k;
      lpState += (1 - Math.exp((-2 * Math.PI * fc) / sampleRate)) * (x - lpState);
      x = lpState;
    }
    if (l.highpass !== undefined) {
      hpState += (1 - Math.exp((-2 * Math.PI * l.highpass) / sampleRate)) * (x - hpState);
      x -= hpState;
    }
    out[start + i]! += x * envelope(l, t) * vol;
  }
}

/** Renders a recipe to mono samples in [-1, 1]. Peaks are soft-limited, never clipped. */
export function renderRecipe(r: Recipe, sampleRate: number, seed = 1): Float32Array {
  const out = new Float32Array(Math.ceil(recipeDuration(r) * sampleRate));
  r.layers.forEach((l, i) => renderLayer(l, sampleRate, out, seed + i * 7919));
  const gain = r.gain ?? 0.8;
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]! * gain);
  return out;
}
