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
  /**
   * A second foe fought in the same wave, standing behind this one. Hits land on the front foe
   * (the Sword and the ultimate sweep both); the two take turns attacking; when the front foe
   * falls, the other steps up.
   */
  partner?: FoeSpec;
}

export interface BattleConfig {
  hero: HeroStats;
  /** One foe per wave, fought in order (1–3 waves). */
  waves: readonly FoeSpec[];
  /** Armor the hero owns (earned along the map, or `?specials=` in debug builds). */
  unlockedSpecials: readonly SpecialId[];
  /** Energy collected from orbs during the reading; specials spend it. Defaults to 0. */
  startingEnergy?: number;
  /** Whether the Full Armor of God ultimate has been earned yet (default true). */
  ultimateUnlocked?: boolean;
  /** Faith meter at the start of the fight (debug `?faith=`); defaults to 0. */
  startingFaith?: number;
  /** Debug `?oneShot=1`: any hit that deals damage defeats the foe outright. */
  oneShot?: boolean;
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
  /** Damage the sweep dealt to the back foe of a pair (Sword, ultimate). */
  backDamage: number;
  /** The back foe of a pair fell (to a sweep) while the front one stands. */
  backDefeated: boolean;
  /** The front foe of a pair fell and the back one stepped up; the wave goes on. */
  steppedUp: boolean;
  /** Set when the defeated foe was followed by a new wave. */
  nextWave: number | null;
  victory: boolean;
}

export interface EnemyTurnResult {
  foeId: string;
  /** Which foe of a pair attacked (always 'front' for a single foe). */
  attacker: 'front' | 'back';
  /** Damage dealt to the hero after blocks. */
  damage: number;
  blocked: boolean;
  skippedStunned: boolean;
  defeat: boolean;
}
