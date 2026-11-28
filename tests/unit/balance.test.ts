import { describe, expect, it } from 'vitest';
import { pickAction, simulateBattle, winRate } from '../../src/core/battle/simulate';
import { BattleEngine } from '../../src/core/battle/BattleEngine';
import type { SpecialId } from '../../src/core/battle/types';
import { createRng } from '../../src/core/rng';
import { oneWave, threeWaves } from './fixtures';
import { ENCOUNTERS } from '../../src/content';
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
    // Win rates are near 100% either way now fights are short, so compare HP left at the end.
    for (const acc of [0.3, 0.6]) {
      const without = avgHpLeft(threeWaves(), acc);
      const withAll = avgHpLeft(threeWaves({ unlockedSpecials: ALL }), acc);
      expect(withAll).toBeGreaterThan(without);
    }
  });

  // A passage has 6 questions; a fight at 60% should end before they run out.
  it('fights stay short (median 3–6 hero turns at 60% accuracy)', () => {
    const turns = Array.from(
      { length: 501 },
      (_, i) => simulateBattle(threeWaves(), 0.6, i + 1).turns,
    ).sort((a, b) => a - b);
    const median = turns[250] as number;
    expect(median).toBeGreaterThanOrEqual(3);
    expect(median).toBeLessThanOrEqual(6);
  });
});

describe('balance: real encounters (no orbs)', () => {
  it.each(ENCOUNTERS.map((e) => [e.id, e] as [string, typeof e]))(
    '%s meets the 60%% / 90%% targets',
    (_id, e) => {
      const config = { hero: HERO_BASE, waves: e.waves, unlockedSpecials: [] };
      const r60 = winRate(config, 0.6, RUNS);
      const r90 = winRate(config, 0.9, RUNS);
      console.info(`[balance] ${e.id} 60%: ${pct(r60)}  90%: ${pct(r90)}`);
      expect(r60).toBeGreaterThanOrEqual(0.8);
      expect(r90).toBeGreaterThanOrEqual(0.98);
    },
  );
});

describe('balance: foes take 2–3 hits', () => {
  // Answering every question right with a plain attack: minions fall to 2 hits, bosses to 3
  // (a pair of foes to 1 each), so a passage averages 2–3 hits per foe.
  it.each(ENCOUNTERS.map((e) => [e.id, e] as [string, typeof e]))('%s', (_id, e) => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = simulateBattle({ hero: HERO_BASE, waves: e.waves, unlockedSpecials: [] }, 1, seed);
      expect(r.victory).toBe(true);
      const perFoe = r.turns / e.waves.length;
      expect(perFoe).toBeGreaterThanOrEqual(2);
      expect(perFoe).toBeLessThanOrEqual(3);
    }
  });
});

describe('auto-play policy', () => {
  it('prefers ultimate, then heal when low, then shield, sword, sandals, attack', () => {
    const e = new BattleEngine(oneWave({ unlockedSpecials: ALL, startingFaith: 5 }), createRng(1));
    e.start();
    expect(pickAction(e)).toBe('ultimate');
    const f = new BattleEngine(
      oneWave({ unlockedSpecials: ['sword', 'sandals'], startingEnergy: 5 }),
      createRng(1),
    );
    f.start();
    expect(pickAction(f)).toBe('sword');
    f.choose('sword');
    f.answer(true);
    f.enemyTurn(); // 2 energy left: enough for sandals, not sword
    expect(pickAction(f)).toBe('sandals');
    f.choose('sandals');
    f.answer(true);
    f.enemyTurn(); // out of energy
    expect(pickAction(f)).toBe('attack');
  });

  it('simulateBattle is deterministic for a seed', () => {
    expect(simulateBattle(threeWaves(), 0.6, 42)).toEqual(simulateBattle(threeWaves(), 0.6, 42));
  });
});

function avgHpLeft(config: Parameters<typeof simulateBattle>[0], accuracy: number): number {
  let sum = 0;
  for (let i = 0; i < RUNS; i++) sum += simulateBattle(config, accuracy, i + 1).heroHpLeft;
  return sum / RUNS;
}

const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);
