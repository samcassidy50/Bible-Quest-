import { TEST_HOOKS_ENABLED } from '../config';
import type { SaveData } from '../core/progress/progress';

/** Read-only game state for Playwright/Maestro assertions (docs/DESIGN.md §8.2). */
export interface BattleTestState {
  encounter: string;
  phase: string;
  wave: number;
  waveCount: number;
  heroHp: number;
  heroMaxHp: number;
  foeId: string;
  foeHp: number;
  faith: number;
  blocks: number;
  foeStunned: boolean;
  available: string[];
  unlocked: string[];
  question: { id: string; answerIndex: number; choices: number } | null;
  feedback: 'correct' | 'wrong' | null;
  result: 'VICTORY' | 'DEFEAT' | null;
  asked: number;
  correct: number;
  /** Hero animation clips started this fight, oldest first. */
  heroAnims: string[];
}

export interface ScriptureTestState {
  encounter: string;
  durationMs: number;
  elapsedMs: number;
  narrationDone: boolean;
  orbs: { special: string; status: string; atMs: number }[];
  collected: string[];
  canSkip: boolean;
  fullTextOpen: boolean;
  finishing: boolean;
  readings: number;
}

export interface TestState {
  ready: boolean;
  scene: string | null;
  platform: string;
  seed: number;
  paused: boolean;
  /** True while an animation is playing and taps are ignored. */
  busy: boolean;
  gameWidth: number;
  gameHeight: number;
  /** Centres of tappable things, in game coordinates (convert with the canvas box). */
  targets: Record<string, { x: number; y: number }>;
  battle: BattleTestState | null;
  scripture: ScriptureTestState | null;
  /** Sound effect cues played, newest last. */
  sounds: string[];
  /** The player's save as currently held in memory. */
  save: SaveData | null;
  /** Passage select: each passage, whether it is open, and its best stars. */
  map: { id: string; open: boolean; state: string; stars: number }[] | null;
  /** Map: a reveal animation is playing. */
  mapRevealing: boolean;
  /** Map: the location whose card is open. */
  mapCard: string | null;
  /** Backdrop viewer: the environment on screen. */
  backdrop: string | null;
  /** Verse Journal: the passage currently shown. */
  journalOpen: string | null;
}

declare global {
  interface Window {
    __TEST__?: Readonly<TestState>;
  }
}

let state: TestState = {
  ready: false,
  scene: null,
  platform: 'web',
  seed: 0,
  paused: false,
  busy: false,
  gameWidth: 0,
  gameHeight: 0,
  targets: {},
  battle: null,
  scripture: null,
  sounds: [],
  save: null,
  map: null,
  mapRevealing: false,
  mapCard: null,
  backdrop: null,
  journalOpen: null,
};

export function updateTestState(patch: Partial<TestState>): void {
  if (!TEST_HOOKS_ENABLED) return;
  state = { ...state, ...patch };
  window.__TEST__ = Object.freeze({ ...state });
}
