import { createRng } from '../rng';
import { BattleEngine } from './BattleEngine';
import type { ActionId, BattleConfig } from './types';

/**
 * Plays a battle automatically for the balance simulation (docs/DESIGN.md §8.4) and the
 * `?autoAnswer=` soak test. The policy is a reasonable player, not an optimal one.
 */
export function pickAction(engine: BattleEngine): ActionId {
  const actions = engine.availableActions();
  const has = (a: ActionId) => actions.includes(a);
  if (has('ultimate')) return 'ultimate';
  if (has('breastplate') && engine.heroHp < engine.heroMaxHp * 0.5) return 'breastplate';
  if (has('shield') && engine.blocks === 0) return 'shield';
  if (has('sword')) return 'sword';
  if (has('sandals')) return 'sandals';
  return 'attack';
}

export interface SimResult {
  victory: boolean;
  turns: number;
  heroHpLeft: number;
}

export function simulateBattle(config: BattleConfig, accuracy: number, seed: number): SimResult {
  const engine = new BattleEngine(config, createRng(seed));
  const answers = createRng(seed ^ 0x9e3779b9); // separate stream so answers don't shift damage rolls
  engine.start();
  for (let guard = 0; guard < 500 && !engine.isOver; guard++) {
    if (engine.phase === 'HERO_CHOOSE') {
      if (engine.choose(pickAction(engine)) === null) engine.answer(answers.next() < accuracy);
    } else {
      engine.enemyTurn();
    }
  }
  return { victory: engine.phase === 'VICTORY', turns: engine.turn, heroHpLeft: engine.heroHp };
}

export function winRate(config: BattleConfig, accuracy: number, runs: number): number {
  let wins = 0;
  for (let i = 0; i < runs; i++) if (simulateBattle(config, accuracy, i + 1).victory) wins++;
  return wins / runs;
}
