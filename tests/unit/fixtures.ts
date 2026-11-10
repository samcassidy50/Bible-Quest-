import type { BattleConfig, FoeSpec } from '../../src/core/battle/types';

export const SHADE: FoeSpec = { id: 'shade', name: 'Shade of the Deep', maxHp: 60, attack: 12 };

export const oneWave = (overrides: Partial<BattleConfig> = {}): BattleConfig => ({
  hero: { maxHp: 100, attack: 10 },
  waves: [SHADE],
  unlockedSpecials: [],
  ...overrides,
});

/** A full 3-wave encounter used by the balance simulation. */
export const threeWaves = (overrides: Partial<BattleConfig> = {}): BattleConfig => ({
  hero: { maxHp: 100, attack: 10 },
  waves: [
    { id: 'shade-1', name: 'Shade', maxHp: 40, attack: 9 },
    { id: 'shade-2', name: 'Shade', maxHp: 50, attack: 10 },
    { id: 'shade-boss', name: 'Shade of the Deep', maxHp: 70, attack: 12 },
  ],
  unlockedSpecials: [],
  ...overrides,
});
