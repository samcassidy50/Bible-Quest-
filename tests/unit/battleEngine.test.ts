import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../../src/core/battle/BattleEngine';
import { createRng } from '../../src/core/rng';

const newEngine = () => new BattleEngine(createRng(1));

describe('BattleEngine (Phase 0 state machine)', () => {
  it('starts in INTRO on turn 0', () => {
    const e = newEngine();
    expect(e.phase).toBe('INTRO');
    expect(e.turn).toBe(0);
    expect(e.isOver).toBe(false);
  });

  it('follows the question → attack → enemy loop and counts hero turns', () => {
    const e = newEngine();
    e.transition('HERO_QUESTION');
    e.transition('HERO_ATTACK');
    e.transition('ENEMY_ATTACK');
    expect(e.turn).toBe(1);
    e.transition('HERO_QUESTION');
    e.transition('HERO_ATTACK');
    e.transition('VICTORY');
    expect(e.turn).toBe(2);
    expect(e.isOver).toBe(true);
  });

  it('can end in DEFEAT after an enemy attack', () => {
    const e = newEngine();
    e.transition('HERO_QUESTION');
    e.transition('HERO_ATTACK');
    e.transition('ENEMY_ATTACK');
    e.transition('DEFEAT');
    expect(e.isOver).toBe(true);
  });

  it('rejects illegal transitions', () => {
    const e = newEngine();
    expect(e.canTransition('HERO_ATTACK')).toBe(false);
    expect(() => e.transition('HERO_ATTACK')).toThrow(
      /Illegal battle transition INTRO → HERO_ATTACK/,
    );
  });

  it('allows no transitions once the battle is over', () => {
    const e = newEngine();
    e.transition('HERO_QUESTION');
    e.transition('HERO_ATTACK');
    e.transition('VICTORY');
    expect(() => e.transition('HERO_QUESTION')).toThrow();
  });
});
