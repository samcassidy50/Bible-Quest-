import type { HeroStats } from './types';

/** Starting hero stats (upgrades arrive in Phase 5). Balance-tested in tests/unit/balance.test.ts. */
export const HERO_BASE: HeroStats = { maxHp: 100, attack: 10 };
