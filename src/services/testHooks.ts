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
  /** Which foe of a pair single-target hits land on. */
  target: 'front' | 'back';
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
  /** POWER UP bursts shown after right answers this fight. */
  powerUps: number;
}

export interface ScriptureTestState {
  encounter: string;
  /** Which reading section this is (0-based), and how many the passage has. */
  section: number;
  sectionCount: number;
  durationMs: number;
  elapsedMs: number;
  narrationDone: boolean;
  /** Every verse reference in the passage, in order. */
  verseRefs: string[];
  /** Verses the voice has finished reading in the current reading, in order. */
  spokenRefs: string[];
  /** Verses read from a recorded clip (the rest use the device voice, or silence when off). */
  recordedRefs: string[];
  /** Left edge of the scrolling verse text and its width (game px); the spoken word sits mid-screen. */
  tickerX: number;
  tickerWidth: number;
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
  /** True while the map shows the "Choose your path" sign at a fork. */
  mapChoosing: boolean;
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
  /**
   * Equipment screen as last drawn: the item opened (null on the item buttons), the blessing picked and
   * the blessings waiting in the bag (only that item's when one is open).
   */
  runes: { item: string | null; selected: string | null; bag: string[] } | null;
  /** Which hero sheet the last hero sprite drew ('boy' or 'girl'). */
  heroSkin: string | null;
  /**
   * After a defeat: phrases of the prayer prayed so far, whether a tap prays the next one, and
   * whether the hero has risen at full life.
   */
  revive: { prayed: number; phrases: number; ready: boolean; revived: boolean } | null;
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
  mapChoosing: false,
  backdrop: null,
  backdropPainted: [],
  journalOpen: null,
  foeGallery: null,
  heroSkin: null,
  character: null,
  runes: null,
  revive: null,
};

export function updateTestState(patch: Partial<TestState>): void {
  if (!TEST_HOOKS_ENABLED) return;
  state = { ...state, ...patch };
  window.__TEST__ = Object.freeze({ ...state });
}
