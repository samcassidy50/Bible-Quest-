import { TEST_HOOKS_ENABLED } from '../config';

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
};

export function updateTestState(patch: Partial<TestState>): void {
  if (!TEST_HOOKS_ENABLED) return;
  state = { ...state, ...patch };
  window.__TEST__ = Object.freeze({ ...state });
}
