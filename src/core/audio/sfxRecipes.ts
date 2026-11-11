import { note, type Layer, type Recipe } from './synth';

/**
 * Sound effects for Bible Quest, all synthesized (no audio files). Melodic cues are short
 * original arpeggios and chords. Feedback for wrong answers is deliberately soft — learning
 * comes first (docs/DESIGN.md §2.2).
 */

/** Notes played one after another, each `step` seconds apart. */
function arpeggio(notes: string[], step: number, layer: Omit<Layer, 'freq' | 'delay'>): Layer[] {
  return notes.map((n, i) => ({ ...layer, freq: note(n), delay: i * step }));
}

export const SFX = {
  uiTap: {
    layers: [{ wave: 'triangle', freq: 900, freqEnd: 700, dur: 0.06, release: 0.04, volume: 0.5 }],
  },
  start: {
    layers: arpeggio(['G5', 'C6'], 0.09, { wave: 'sine', dur: 0.25, release: 0.18, volume: 0.6 }),
  },

  // Hero attacks
  swing: {
    layers: [
      {
        wave: 'noise',
        dur: 0.22,
        attack: 0.05,
        release: 0.12,
        lowpass: 600,
        lowpassEnd: 3200,
        highpass: 300,
        volume: 0.7,
      },
    ],
  },
  swingLight: {
    layers: [
      {
        wave: 'noise',
        dur: 0.14,
        attack: 0.03,
        release: 0.08,
        lowpass: 800,
        lowpassEnd: 1800,
        highpass: 250,
        volume: 0.5,
      },
    ],
  },
  punch: {
    layers: [
      { wave: 'sine', freq: 180, freqEnd: 50, dur: 0.18, attack: 0.002, release: 0.14, volume: 1 },
      { wave: 'noise', dur: 0.04, attack: 0.001, release: 0.03, lowpass: 2000, volume: 0.5 },
    ],
  },
  swordHit: {
    layers: [
      { wave: 'noise', dur: 0.08, attack: 0.001, release: 0.06, highpass: 2000, volume: 0.5 },
      {
        wave: 'square',
        freq: 1320,
        freqEnd: 1250,
        dur: 0.35,
        attack: 0.001,
        decay: 0.3,
        sustain: 0,
        lowpass: 4000,
        volume: 0.22,
      },
      { wave: 'sine', freq: 2637, dur: 0.4, attack: 0.001, decay: 0.35, sustain: 0, volume: 0.2 },
      { wave: 'sine', freq: 180, freqEnd: 80, dur: 0.12, attack: 0.001, release: 0.1, volume: 0.6 },
    ],
  },
  slam: {
    gain: 0.9,
    layers: [
      { wave: 'sine', freq: 120, freqEnd: 35, dur: 0.45, attack: 0.002, release: 0.35, volume: 1 },
      {
        wave: 'noise',
        dur: 0.35,
        attack: 0.002,
        release: 0.3,
        lowpass: 1200,
        lowpassEnd: 200,
        volume: 0.7,
      },
      {
        wave: 'square',
        freq: 990,
        freqEnd: 940,
        dur: 0.3,
        attack: 0.001,
        decay: 0.28,
        sustain: 0,
        lowpass: 3500,
        volume: 0.15,
      },
    ],
  },

  // Getting hit and defending
  foeAttack: {
    layers: [
      {
        wave: 'saw',
        freq: 110,
        freqEnd: 70,
        dur: 0.25,
        attack: 0.03,
        release: 0.12,
        lowpass: 600,
        volume: 0.45,
      },
      {
        wave: 'noise',
        dur: 0.2,
        attack: 0.04,
        release: 0.1,
        lowpass: 500,
        lowpassEnd: 1200,
        volume: 0.35,
      },
    ],
  },
  hurt: {
    layers: [
      {
        wave: 'square',
        freq: 440,
        freqEnd: 220,
        dur: 0.18,
        release: 0.1,
        lowpass: 2000,
        volume: 0.35,
      },
      { wave: 'noise', dur: 0.08, attack: 0.001, release: 0.06, lowpass: 1500, volume: 0.3 },
    ],
  },
  block: {
    layers: [
      {
        wave: 'triangle',
        freq: 880,
        dur: 0.3,
        attack: 0.001,
        decay: 0.28,
        sustain: 0,
        volume: 0.35,
      },
      {
        wave: 'triangle',
        freq: 1320,
        dur: 0.25,
        attack: 0.001,
        decay: 0.22,
        sustain: 0,
        volume: 0.25,
      },
      { wave: 'noise', dur: 0.05, attack: 0.001, release: 0.04, highpass: 3000, volume: 0.3 },
    ],
  },

  // Specials
  shield: {
    layers: [
      ...arpeggio(['E5', 'G#5', 'B5'], 0.08, {
        wave: 'sine',
        dur: 0.35,
        release: 0.25,
        volume: 0.4,
      }),
      {
        wave: 'noise',
        delay: 0.05,
        dur: 0.4,
        attack: 0.1,
        release: 0.25,
        highpass: 5000,
        volume: 0.12,
      },
    ],
  },
  heal: {
    layers: [
      {
        wave: 'sine',
        freq: note('C5'),
        freqEnd: note('C6'),
        dur: 0.5,
        attack: 0.05,
        release: 0.25,
        volume: 0.45,
        vibrato: { rate: 6, depth: 0.01 },
      },
      {
        wave: 'sine',
        freq: note('G5'),
        freqEnd: note('G6'),
        delay: 0.1,
        dur: 0.45,
        attack: 0.05,
        release: 0.25,
        volume: 0.25,
      },
    ],
  },
  calm: {
    layers: arpeggio(['G5', 'D6', 'G6'], 0.12, {
      wave: 'sine',
      dur: 0.6,
      attack: 0.002,
      decay: 0.55,
      sustain: 0,
      volume: 0.35,
    }),
  },
  ultimate: {
    gain: 0.7,
    layers: [
      ...['C4', 'E4', 'G4'].map((n) => ({
        wave: 'saw' as const,
        freq: note(n),
        dur: 1.0,
        attack: 0.35,
        release: 0.35,
        lowpass: 400,
        lowpassEnd: 3000,
        volume: 0.25,
      })),
      ...arpeggio(['C6', 'E6', 'G6', 'C7'], 0.08, {
        wave: 'sine',
        dur: 0.4,
        release: 0.3,
        volume: 0.25,
      }),
    ],
  },

  // Answers
  poweredUp: {
    layers: arpeggio(['C5', 'E5', 'G5', 'C6'], 0.06, {
      wave: 'triangle',
      dur: 0.22,
      release: 0.15,
      volume: 0.45,
    }),
  },
  wrong: {
    layers: [
      {
        wave: 'triangle',
        freq: 330,
        freqEnd: 262,
        dur: 0.3,
        attack: 0.01,
        release: 0.18,
        lowpass: 1500,
        volume: 0.4,
      },
    ],
  },

  // Orbs
  orbSpawn: {
    layers: [
      {
        wave: 'sine',
        freq: 1568,
        freqEnd: 2093,
        dur: 0.3,
        attack: 0.04,
        release: 0.2,
        volume: 0.25,
      },
      {
        wave: 'sine',
        freq: 2637,
        delay: 0.05,
        dur: 0.25,
        attack: 0.02,
        release: 0.18,
        volume: 0.12,
      },
    ],
  },
  orbCollect: {
    layers: arpeggio(['C6', 'E6', 'G6', 'C7'], 0.05, {
      wave: 'sine',
      dur: 0.25,
      release: 0.18,
      volume: 0.4,
    }),
  },

  // Fight flow
  wave: {
    layers: arpeggio(['G4', 'D5'], 0.13, {
      wave: 'triangle',
      dur: 0.32,
      attack: 0.02,
      release: 0.15,
      lowpass: 2500,
      volume: 0.5,
    }),
  },
  foeDefeat: {
    layers: [
      {
        wave: 'noise',
        dur: 0.4,
        attack: 0.005,
        release: 0.3,
        lowpass: 3000,
        lowpassEnd: 300,
        volume: 0.5,
      },
      { wave: 'sine', freq: 600, freqEnd: 150, dur: 0.3, release: 0.2, volume: 0.3 },
    ],
  },
  victory: {
    layers: [
      ...arpeggio(['C5', 'E5', 'G5'], 0.12, {
        wave: 'triangle',
        dur: 0.16,
        release: 0.06,
        lowpass: 3000,
        volume: 0.45,
      }),
      {
        wave: 'triangle',
        freq: note('C6'),
        delay: 0.36,
        dur: 0.7,
        release: 0.35,
        lowpass: 3000,
        volume: 0.5,
      },
      {
        wave: 'triangle',
        freq: note('G5'),
        delay: 0.36,
        dur: 0.7,
        release: 0.35,
        lowpass: 2500,
        volume: 0.3,
      },
      {
        wave: 'triangle',
        freq: note('E5'),
        delay: 0.36,
        dur: 0.7,
        release: 0.35,
        lowpass: 2500,
        volume: 0.25,
      },
    ],
  },
  defeat: {
    layers: [
      ...arpeggio(['E5', 'D5'], 0.2, {
        wave: 'triangle',
        dur: 0.22,
        release: 0.1,
        lowpass: 2000,
        volume: 0.35,
      }),
      {
        wave: 'triangle',
        freq: note('C5'),
        delay: 0.4,
        dur: 0.7,
        release: 0.4,
        lowpass: 2000,
        volume: 0.35,
      },
    ],
  },
} satisfies Record<string, Recipe>;

export type SfxName = keyof typeof SFX;
export const SFX_NAMES = Object.keys(SFX) as SfxName[];
