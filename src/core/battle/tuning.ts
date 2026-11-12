/**
 * Battle numbers (docs/DESIGN.md §2.2, §2.6). Every value is a draft, tuned by the balance
 * simulation in tests/unit/balance.test.ts. Change numbers here, never inline in the engine.
 */
export const TUNING = {
  /** ±fraction of random variance applied to all damage. */
  damageVariance: 0.1,

  attack: { powered: 2, base: 1 },

  sword: { powered: 3, base: 1.5 },
  /** Shield also lands a normal (1×) hit when powered. */
  shield: { poweredBlocks: 2, baseBlocks: 1, poweredHit: 1 },
  /** Fractions of max HP. */
  breastplate: { poweredHeal: 0.35, baseHeal: 0.15 },
  /** Sandals stun the foe for one turn either way; powered also lands a normal hit. */
  sandals: { stunTurns: 1, poweredHit: 1 },

  ultimate: { damage: 5, heal: 0.2 },

  faith: { max: 5, perCorrect: 1, streakLength: 3, streakBonus: 1 },

  /** Energy from reading orbs; each special costs some (docs/DESIGN.md §2.6). */
  energy: { max: 10, cost: { sword: 3, shield: 2, breastplate: 3, sandals: 2 } },
} as const;

export type Tuning = typeof TUNING;
