import { describe, expect, it } from 'vitest';
import { pickAction, simulateBattle, winRate } from '../../src/core/battle/simulate';
import { BattleEngine } from '../../src/core/battle/BattleEngine';
import type { SpecialId } from '../../src/core/battle/types';
import { createRng } from '../../src/core/rng';
import { oneWave, threeWaves } from './fixtures';
import { GEN_001 } from '../../src/content/genesis/gen-001';
import { HERO_BASE } from '../../src/core/battle/hero';

/**
 * Balance simulation (docs/DESIGN.md §8.4). Targets for a full 3-wave encounter:
 *   ~60% accuracy wins ≥ 80% of the time, 90% accuracy wins ~always,
 *   and struggling players (30%) still win sometimes. Specials must help, not be required.
 */
const RUNS = 2_000;
const ALL: SpecialId[] = ['sword', 'shield', 'breastplate', 'sandals'];

describe('balance: 3-wave encounter', () => {
  const report: Record<string, string> = {};

  for (const [label, specials] of [
    ['no orbs', [] as SpecialId[]],
    ['all orbs', ALL],
  ] as const) {
    it(`meets win-rate targets with ${label}`, () => {
      const config = threeWaves({ unlockedSpecials: specials });
      const r30 = winRate(config, 0.3, RUNS);
      const r60 = winRate(config, 0.6, RUNS);
      const r90 = winRate(config, 0.9, RUNS);
      report[label] = `30%: ${pct(r30)}  60%: ${pct(r60)}  90%: ${pct(r90)}`;
      console.info(`[balance] ${label.padEnd(8)} ${report[label]}`);

      expect(r60).toBeGreaterThanOrEqual(0.8);
      expect(r90).toBeGreaterThanOrEqual(0.98);
      expect(r30).toBeGreaterThan(0.05);
    });
  }

  it('collecting orbs makes the fight easier at every accuracy', () => {
    for (const acc of [0.3, 0.6]) {
      const without = winRate(threeWaves(), acc, RUNS);
      const withAll = winRate(threeWaves({ unlockedSpecials: ALL }), acc, RUNS);
      expect(withAll).toBeGreaterThan(without);
    }
  });

  it('fights stay short (median 6–14 hero turns at 60% accuracy)', () => {
    const turns = Array.from(
      { length: 501 },
      (_, i) => simulateBattle(threeWaves(), 0.6, i + 1).turns,
    ).sort((a, b) => a - b);
    const median = turns[250] as number;
    expect(median).toBeGreaterThanOrEqual(6);
    expect(median).toBeLessThanOrEqual(14);
  });
});

describe('balance: real encounters', () => {
  it('Genesis 1:1–2 meets the 60% / 90% targets with no orbs', () => {
    const config = { hero: HERO_BASE, waves: GEN_001.waves, unlockedSpecials: [] };
    expect(winRate(config, 0.6, RUNS)).toBeGreaterThanOrEqual(0.8);
    expect(winRate(config, 0.9, RUNS)).toBeGreaterThanOrEqual(0.98);
  });
});

describe('auto-play policy', () => {
  it('prefers ultimate, then heal when low, then shield, sword, sandals, attack', () => {
    const e = new BattleEngine(oneWave({ unlockedSpecials: ALL, startingFaith: 5 }), createRng(1));
    e.start();
    expect(pickAction(e)).toBe('ultimate');
    const f = new BattleEngine(oneWave({ unlockedSpecials: ['sword', 'sandals'] }), createRng(1));
    f.start();
    expect(pickAction(f)).toBe('sword');
    f.choose('sword');
    f.answer(true);
    f.enemyTurn();
    expect(pickAction(f)).toBe('sandals');
  });

  it('simulateBattle is deterministic for a seed', () => {
    expect(simulateBattle(threeWaves(), 0.6, 42)).toEqual(simulateBattle(threeWaves(), 0.6, 42));
  });
});

const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);
