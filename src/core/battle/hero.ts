import type { HeroStats } from './types';

/** Starting hero stats (blessings add to them: core/battle/runes.ts). Balance-tested in tests/unit/balance.test.ts. */
export const HERO_BASE: HeroStats = { maxHp: 100, attack: 10 };
