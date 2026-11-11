export const SPECIAL_IDS = ['sword', 'shield', 'breastplate', 'sandals'] as const;
export type SpecialId = (typeof SPECIAL_IDS)[number];

export type ActionId = 'attack' | SpecialId | 'ultimate';

export interface HeroStats {
  maxHp: number;
  attack: number;
}

export interface FoeSpec {
  id: string;
  name: string;
  maxHp: number;
  attack: number;
}

export interface BattleConfig {
  hero: HeroStats;
  /** One foe per wave, fought in order (1–3 waves). */
  waves: readonly FoeSpec[];
  /** Specials unlocked for this fight (by orbs, or `?specials=` in debug builds). */
  unlockedSpecials: readonly SpecialId[];
  /** Faith meter at the start of the fight (debug `?faith=`); defaults to 0. */
  startingFaith?: number;
  /** Upgrade: multiplier on special damage and healing (default 1). */
  specialPower?: number;
  /** Upgrade: extra ultimate damage multiplier (default 0). */
  ultimateBonus?: number;
}

export type BattlePhase =
  'INTRO' | 'HERO_CHOOSE' | 'HERO_QUESTION' | 'ENEMY_TURN' | 'VICTORY' | 'DEFEAT';

/** What happened on the hero's action, for the scene to animate. */
export interface HeroActionResult {
  action: ActionId;
  /** null for the ultimate, which needs no question. */
  correct: boolean | null;
  damage: number;
  healed: number;
  blocksAdded: number;
  stunned: boolean;
  faithGained: number;
  foeDefeated: boolean;
  /** Set when the defeated foe was followed by a new wave. */
  nextWave: number | null;
  victory: boolean;
}

export interface EnemyTurnResult {
  foeId: string;
  /** Damage dealt to the hero after blocks. */
  damage: number;
  blocked: boolean;
  skippedStunned: boolean;
  defeat: boolean;
}
