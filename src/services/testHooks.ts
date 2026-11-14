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
  /** Sprite art the current foe uses (null = placeholder shape). */
  foeSprite: string | null;
  /** Sprite-foe states played by the current foe, oldest first. */
  foeAnims: string[];
  foeHp: number;
  /** HP the foe's bar is showing (lags `foeHp` until the hit lands). */
  foeBarHp: number;
  /** The second foe of a pair while it stands (null for a single foe), and its HP. */
  backFoeId: string | null;
  backFoeHp: number;
  faith: number;
  blocks: number;
  foeStunned: boolean;
  available: string[];
  /** Owned specials the hero can afford right now. */
  unlocked: string[];
  energy: number;
  ultimateUnlocked: boolean;
  /** Armor the angel is presenting right now. */
  gift: string | null;
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
  orbs: { id: string; status: string; atMs: number }[];
  /** Energy orbs collected in this reading. */
  energy: number;
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
  /** Backdrop viewer: layers of that environment drawn from painted images (sky, far, mid…). */
  backdropPainted: string[];
  /** Verse Journal: the passage currently shown. */
  journalOpen: string | null;
  /** Foe gallery: the passage on screen and the sprite each of its foes uses (null = placeholder). */
  foeGallery: { encounter: string; foes: (string | null)[] } | null;
  /** Character sheet: the hero shown, each stat's value, and the armor shown. */
  character: { hero: string; stats: { id: string; value: string }[]; armor: string[] } | null;
  /** Which hero sheet the last hero sprite drew ('boy' or 'girl'). */
  heroSkin: string | null;
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
  backdropPainted: [],
  journalOpen: null,
  foeGallery: null,
  heroSkin: null,
  character: null,
};

export function updateTestState(patch: Partial<TestState>): void {
  if (!TEST_HOOKS_ENABLED) return;
  state = { ...state, ...patch };
  window.__TEST__ = Object.freeze({ ...state });
}
