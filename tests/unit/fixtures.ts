import type { BattleConfig, FoeSpec } from '../../src/core/battle/types';

export const SHADE: FoeSpec = { id: 'shade', name: 'Shade of the Deep', maxHp: 60, attack: 12 };

export const oneWave = (overrides: Partial<BattleConfig> = {}): BattleConfig => ({
  hero: { maxHp: 100, attack: 10 },
  waves: [SHADE],
  unlockedSpecials: [],
  startingEnergy: 10,
  ...overrides,
});

/** A full 3-wave encounter used by the balance simulation. */
export const threeWaves = (overrides: Partial<BattleConfig> = {}): BattleConfig => ({
  hero: { maxHp: 100, attack: 10 },
  waves: [
    { id: 'shade-1', name: 'Shade', maxHp: 25, attack: 15 },
    { id: 'shade-2', name: 'Shade', maxHp: 25, attack: 17 },
    { id: 'shade-boss', name: 'Shade of the Deep', maxHp: 45, attack: 20 },
  ],
  unlockedSpecials: [],
  startingEnergy: 10,
  ...overrides,
});
