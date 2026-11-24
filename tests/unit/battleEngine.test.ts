import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../../src/core/battle/BattleEngine';
import { TUNING } from '../../src/core/battle/tuning';
import type { BattleConfig, SpecialId } from '../../src/core/battle/types';
import { createRng, type Rng } from '../../src/core/rng';
import { oneWave, threeWaves } from './fixtures';

/** next() = 0.5 ⇒ damage variance factor exactly 1, so damage numbers are exact. */
const flatRng: Rng = { ...createRng(1), next: () => 0.5 };

const ALL: SpecialId[] = ['sword', 'shield', 'breastplate', 'sandals'];

function started(config: BattleConfig = oneWave(), rng: Rng = flatRng): BattleEngine {
  const e = new BattleEngine(config, rng);
  e.start();
  return e;
}

/** Choose + answer in one step. */
function act(e: BattleEngine, action: Parameters<BattleEngine['choose']>[0], correct = true) {
  return e.choose(action) ?? e.answer(correct);
}

describe('BattleEngine setup', () => {
  it('starts in INTRO with full HP, wave 0, faith 0', () => {
    const e = new BattleEngine(oneWave(), flatRng);
    expect(e.phase).toBe('INTRO');
    expect(e.heroHp).toBe(100);
    expect(e.foeHp).toBe(60);
    expect(e.waveIndex).toBe(0);
    expect(e.waveCount).toBe(1);
    expect(e.faith).toBe(0);
    expect(e.availableActions()).toEqual([]);
  });

  it('start() moves to HERO_CHOOSE; only Attack without specials', () => {
    const e = started();
    expect(e.phase).toBe('HERO_CHOOSE');
    expect(e.availableActions()).toEqual(['attack']);
  });

  it('rejects invalid configs', () => {
    expect(() => new BattleEngine(oneWave({ waves: [] }), flatRng)).toThrow(/at least one wave/);
    expect(() => new BattleEngine(oneWave({ hero: { maxHp: 0, attack: 1 } }), flatRng)).toThrow();
    expect(
      () => new BattleEngine(oneWave({ unlockedSpecials: ['laser' as SpecialId] }), flatRng),
    ).toThrow(/Unknown special/);
  });

  it('clamps startingFaith to [0, max]', () => {
    expect(new BattleEngine(oneWave({ startingFaith: 99 }), flatRng).faith).toBe(TUNING.faith.max);
    expect(new BattleEngine(oneWave({ startingFaith: -3 }), flatRng).faith).toBe(0);
  });

  it('enforces phase order', () => {
    const e = new BattleEngine(oneWave(), flatRng);
    expect(() => e.choose('attack')).toThrow(/Expected phase HERO_CHOOSE but battle is in INTRO/);
    e.start();
    expect(() => e.start()).toThrow();
    expect(() => e.answer(true)).toThrow();
    expect(() => e.enemyTurn()).toThrow();
    e.choose('attack');
    expect(e.phase).toBe('HERO_QUESTION');
    expect(e.pendingAction).toBe('attack');
    expect(() => e.choose('attack')).toThrow();
  });
});

describe('Attack', () => {
  it('correct answer = powered (3×), wrong = base (1×)', () => {
    const e = started();
    expect(act(e, 'attack', true).damage).toBe(30);
    e.enemyTurn();
    expect(act(e, 'attack', false).damage).toBe(10);
    expect(e.foeHp).toBe(20);
    expect(e.turn).toBe(2);
  });

  it('damage varies within ±10% with a real RNG, never below 1', () => {
    const e = started(
      oneWave({ waves: [{ id: 'x', name: 'x', maxHp: 1e6, attack: 0 }] }),
      createRng(5),
    );
    for (let i = 0; i < 50; i++) {
      const r = act(e, 'attack', true);
      expect(r.damage).toBeGreaterThanOrEqual(27);
      expect(r.damage).toBeLessThanOrEqual(33);
      const enemy = e.enemyTurn();
      expect(enemy.damage).toBe(1); // attack 0 still rounds up to the 1-damage floor
    }
  });

  it('damage never exceeds the foe’s remaining HP', () => {
    const e = started(oneWave({ waves: [{ id: 'x', name: 'x', maxHp: 5, attack: 1 }] }));
    const r = act(e, 'attack');
    expect(r.damage).toBe(5);
    expect(r.victory).toBe(true);
  });
});

describe('Special attacks', () => {
  const withAll = () =>
    started(
      oneWave({
        unlockedSpecials: ALL,
        waves: [{ id: 'big', name: 'Big', maxHp: 500, attack: 10 }],
      }),
    );

  it('only unlocked specials are offered, in a stable order', () => {
    const e = started(oneWave({ unlockedSpecials: ['sandals', 'sword'] }));
    expect(e.availableActions()).toEqual(['attack', 'sword', 'sandals']);
    expect(e.isUnlocked('shield')).toBe(false);
    expect(() => e.choose('shield')).toThrow(/not available/);
  });

  it('specials spend energy and can be used again while energy lasts', () => {
    const e = withAll(); // 10 energy
    expect(e.energy).toBe(10);
    expect(e.costOf('sword')).toBe(3);
    act(e, 'sword');
    expect(e.energy).toBe(7);
    e.enemyTurn();
    act(e, 'sword', false); // a wrong answer still spends the energy
    expect(e.energy).toBe(4);
    e.enemyTurn();
    act(e, 'sword');
    expect(e.energy).toBe(1);
    e.enemyTurn();
    expect(e.canAfford('sword')).toBe(false);
    expect(e.availableActions()).toEqual(['attack']);
    expect(() => e.choose('sword')).toThrow(/not available/);
  });

  it('starts with no energy by default and clamps to the maximum', () => {
    const none = started(oneWave({ unlockedSpecials: ALL, startingEnergy: undefined }));
    expect(none.energy).toBe(0);
    expect(none.availableActions()).toEqual(['attack']);
    expect(started(oneWave({ startingEnergy: 99 })).energy).toBe(10);
  });

  it('a reading between fights adds its orbs to the energy, up to the maximum', () => {
    const e = started(oneWave({ startingEnergy: 2 }));
    e.addEnergy(3);
    expect(e.energy).toBe(5);
    e.addEnergy(-4);
    expect(e.energy).toBe(5);
    e.addEnergy(99);
    expect(e.energy).toBe(10);
  });

  it('the ultimate stays locked until earned, even with a full Faith meter', () => {
    const e = started(oneWave({ startingFaith: 5, ultimateUnlocked: false }));
    expect(e.ultimateUnlocked).toBe(false);
    expect(e.ultimateReady).toBe(false);
    expect(e.availableActions()).not.toContain('ultimate');
  });

  it('Sword: 4× powered, 1.5× base', () => {
    expect(act(withAll(), 'sword', true).damage).toBe(40);
    expect(act(withAll(), 'sword', false).damage).toBe(15);
  });

  it('Shield powered: normal hit + blocks the next 2 enemy attacks', () => {
    const e = withAll();
    const r = act(e, 'shield', true);
    expect(r).toMatchObject({ damage: 10, blocksAdded: 2 });
    expect(e.enemyTurn()).toMatchObject({ blocked: true, damage: 0 });
    act(e, 'attack');
    expect(e.enemyTurn()).toMatchObject({ blocked: true, damage: 0 });
    act(e, 'attack');
    expect(e.enemyTurn()).toMatchObject({ blocked: false, damage: 10 });
    expect(e.heroHp).toBe(90);
  });

  it('Shield base: no hit, blocks 1 attack', () => {
    const e = withAll();
    expect(act(e, 'shield', false)).toMatchObject({ damage: 0, blocksAdded: 1 });
    expect(e.blocks).toBe(1);
  });

  it('Breastplate heals 35% powered / 15% base, capped at max HP', () => {
    const e = started(
      oneWave({ unlockedSpecials: ALL, waves: [{ id: 'b', name: 'b', maxHp: 500, attack: 50 }] }),
    );
    act(e, 'attack');
    e.enemyTurn(); // hero 100 → 50
    expect(act(e, 'breastplate', true).healed).toBe(35);
    expect(e.heroHp).toBe(85);

    const e2 = started(
      oneWave({ unlockedSpecials: ALL, waves: [{ id: 'b', name: 'b', maxHp: 500, attack: 10 }] }),
    );
    act(e2, 'attack');
    e2.enemyTurn(); // 100 → 90
    expect(act(e2, 'breastplate', false).healed).toBe(10); // 15 would overheal
    expect(e2.heroHp).toBe(100);
  });

  it('Sandals: foe skips its next turn; powered also hits', () => {
    const e = withAll();
    expect(act(e, 'sandals', true)).toMatchObject({ damage: 10, stunned: true });
    expect(e.foeStunned).toBe(true);
    expect(e.enemyTurn()).toMatchObject({ skippedStunned: true, damage: 0 });
    expect(e.foeStunned).toBe(false);
    act(e, 'attack');
    expect(e.enemyTurn().damage).toBe(10);

    const e2 = withAll();
    expect(act(e2, 'sandals', false)).toMatchObject({ damage: 0, stunned: true });
  });

  it('a stun is used before a shield block (the block is kept)', () => {
    const e = withAll();
    act(e, 'shield', true); // 2 blocks
    e.enemyTurn(); // 1 block left
    act(e, 'sandals');
    expect(e.enemyTurn()).toMatchObject({ skippedStunned: true, blocked: false });
    expect(e.blocks).toBe(1);
  });
});

describe('Faith meter and ultimate', () => {
  const big = () =>
    started(
      oneWave({ unlockedSpecials: ALL, waves: [{ id: 'b', name: 'b', maxHp: 1000, attack: 1 }] }),
    );

  it('+1 per correct answer, +1 bonus on every 3rd in a row, capped at 5', () => {
    const e = big();
    expect(act(e, 'attack', true).faithGained).toBe(1);
    e.enemyTurn();
    expect(act(e, 'attack', true).faithGained).toBe(1);
    e.enemyTurn();
    expect(act(e, 'attack', true).faithGained).toBe(2); // streak of 3
    expect(e.faith).toBe(4);
    e.enemyTurn();
    expect(act(e, 'attack', true).faithGained).toBe(1);
    expect(e.faith).toBe(5);
    e.enemyTurn();
    expect(act(e, 'attack', true).faithGained).toBe(0); // capped
  });

  it('a wrong answer resets the streak but does not drain faith', () => {
    const e = big();
    act(e, 'attack', true);
    e.enemyTurn();
    act(e, 'attack', true);
    e.enemyTurn();
    expect(act(e, 'attack', false).faithGained).toBe(0);
    expect(e.streak).toBe(0);
    expect(e.faith).toBe(2);
  });

  it('specials also earn faith on a correct answer', () => {
    const e = big();
    expect(act(e, 'sword', true).faithGained).toBe(1);
  });

  it('ultimate is offered only when the meter is full and needs no question', () => {
    const e = started(
      oneWave({ startingFaith: 4, waves: [{ id: 'b', name: 'b', maxHp: 1000, attack: 50 }] }),
    );
    expect(e.availableActions()).not.toContain('ultimate');
    act(e, 'attack');
    e.enemyTurn(); // hero 100 → 50
    expect(e.ultimateReady).toBe(true);
    expect(e.availableActions()).toContain('ultimate');

    const r = e.choose('ultimate');
    expect(r).not.toBeNull();
    expect(r).toMatchObject({ action: 'ultimate', correct: null, damage: 50, healed: 20 });
    expect(e.faith).toBe(0);
    expect(e.phase).toBe('ENEMY_TURN');
  });

  it('ultimate does not touch the answer streak', () => {
    const e = started(
      oneWave({ startingFaith: 4, waves: [{ id: 'b', name: 'b', maxHp: 1000, attack: 1 }] }),
    );
    act(e, 'attack', true); // streak 1, faith 5
    e.enemyTurn();
    e.choose('ultimate');
    expect(e.streak).toBe(1);
  });
});

describe('Waves, victory and defeat', () => {
  it('defeating a foe advances to the next wave and the hero acts again', () => {
    const e = started(threeWaves());
    const r = act(e, 'attack', false); // 10 dmg
    expect(r.foeDefeated).toBe(false);
    e.enemyTurn();
    const kill = act(e, 'attack'); // 25 HP foe dead
    expect(kill).toMatchObject({ foeDefeated: true, nextWave: 1, victory: false });
    expect(e.phase).toBe('HERO_CHOOSE');
    expect(e.foe.id).toBe('shade-2');
    expect(e.foeHp).toBe(25);
  });

  const twoWaves = () =>
    started(
      oneWave({
        unlockedSpecials: ALL,
        waves: [
          { id: 'a', name: 'a', maxHp: 10, attack: 5 },
          { id: 'b', name: 'b', maxHp: 100, attack: 5 },
        ],
      }),
    );

  it('a stun does not carry over to the next foe', () => {
    const e = twoWaves();
    expect(act(e, 'sandals', true)).toMatchObject({
      stunned: true,
      foeDefeated: true,
      nextWave: 1,
    });
    expect(e.foeStunned).toBe(false);
    act(e, 'attack');
    expect(e.enemyTurn().skippedStunned).toBe(false);
  });

  it('shield blocks do carry over to the next foe', () => {
    const e = twoWaves();
    expect(act(e, 'shield', true)).toMatchObject({ blocksAdded: 2, foeDefeated: true });
    expect(e.blocks).toBe(2);
    act(e, 'attack');
    expect(e.enemyTurn().blocked).toBe(true);
  });

  it('beating the last foe is VICTORY and ends the battle', () => {
    const e = started(oneWave({ waves: [{ id: 'x', name: 'x', maxHp: 15, attack: 1 }] }));
    act(e, 'attack');
    expect(e.phase).toBe('VICTORY');
    expect(e.isOver).toBe(true);
    expect(e.availableActions()).toEqual([]);
  });

  it('hero at 0 HP is DEFEAT', () => {
    const e = started(oneWave({ hero: { maxHp: 20, attack: 1 } }));
    act(e, 'attack');
    expect(e.enemyTurn().defeat).toBe(false);
    act(e, 'attack');
    const r = e.enemyTurn();
    expect(r.defeat).toBe(true);
    expect(e.heroHp).toBe(0);
    expect(e.phase).toBe('DEFEAT');
    expect(e.isOver).toBe(true);
  });

  it('revive restores full HP after a defeat, and the fight stays lost', () => {
    const e = started(oneWave({ hero: { maxHp: 20, attack: 1 } }));
    expect(() => e.revive()).toThrow();
    act(e, 'attack');
    e.enemyTurn();
    act(e, 'attack');
    e.enemyTurn();
    e.revive();
    expect(e.heroHp).toBe(20);
    expect(e.phase).toBe('DEFEAT');
    expect(e.availableActions()).toEqual([]);
  });
});

describe('BattleEngine oneShot (debug)', () => {
  it('defeats each foe with a single plain attack, even on a wrong answer', () => {
    const e = started(threeWaves({ oneShot: true }));
    const first = act(e, 'attack', false);
    expect(first.damage).toBe(25);
    expect(first.nextWave).toBe(1);
    expect(act(e, 'attack').nextWave).toBe(2);
    expect(act(e, 'attack').victory).toBe(true);
  });

  it('does not defeat the foe with an action that deals no damage', () => {
    const e = started(oneWave({ oneShot: true, unlockedSpecials: ['breastplate'] }));
    expect(act(e, 'breastplate').foeDefeated).toBe(false);
    expect(e.foeHp).toBe(60);
  });
});

describe('BattleEngine foe pairs', () => {
  const pair = (overrides: Partial<BattleConfig> = {}) =>
    oneWave({
      waves: [
        {
          id: 'front',
          name: 'Front',
          maxHp: 20,
          attack: 5,
          partner: { id: 'back', name: 'Back', maxHp: 30, attack: 8 },
        },
      ],
      unlockedSpecials: ['sword', 'sandals'],
      ...overrides,
    });

  it('starts with both foes; an Attack hits only the front one', () => {
    const e = started(pair());
    expect(e.foe.id).toBe('front');
    expect(e.backFoe?.id).toBe('back');
    expect(e.backFoeHp).toBe(30);
    const r = act(e, 'attack', false);
    expect(r.damage).toBe(10);
    expect(r.backDamage).toBe(0);
    expect(e.foeHp).toBe(10);
    expect(e.backFoeHp).toBe(30);
  });

  it('the two take turns attacking', () => {
    const e = started(pair());
    act(e, 'attack', false);
    const first = e.enemyTurn();
    act(e, 'attack', false); // the front foe falls on the second hit…
    expect(e.foe.id).toBe('back'); // …and the back foe steps up
    expect(e.foeHp).toBe(30);
    const second = e.enemyTurn();
    expect(first).toMatchObject({ attacker: 'front', foeId: 'front', damage: 5 });
    expect(second).toMatchObject({ attacker: 'front', foeId: 'back', damage: 8 });
  });

  it('alternates attackers while both stand', () => {
    const e = started(pair({ waves: [{ ...pair().waves[0]!, maxHp: 100 }] }));
    const attackers: string[] = [];
    for (let i = 0; i < 3; i++) {
      act(e, 'attack', false);
      attackers.push(e.enemyTurn().attacker);
    }
    expect(attackers).toEqual(['front', 'back', 'front']);
  });

  it('when the front foe falls the back one steps up and the wave goes on', () => {
    const e = started(pair());
    const r = act(e, 'attack', true); // 30 damage: front falls
    expect(r).toMatchObject({ foeDefeated: true, steppedUp: true, nextWave: null, victory: false });
    expect(e.foe.id).toBe('back');
    expect(e.foeHp).toBe(30);
    expect(e.backFoe).toBeNull();
    expect(e.phase).toBe('ENEMY_TURN');
  });

  it('the Sword sweeps both foes and can fell the back one first', () => {
    const e = started(pair({ waves: [{ ...pair().waves[0]!, maxHp: 100 }] }));
    const r = act(e, 'sword', true);
    const sweep = 10 * TUNING.sword.powered;
    expect(r.damage).toBe(sweep);
    expect(r.backDamage).toBe(30); // capped at the back foe's HP
    expect(r.backDefeated).toBe(true);
    expect(e.backFoe).toBeNull();
    expect(e.foeHp).toBe(100 - sweep);
  });

  it('a sweep that fells both clears the wave', () => {
    const e = started(pair({ startingFaith: TUNING.faith.max }));
    const r = act(e, 'ultimate');
    expect(r.victory).toBe(true);
    expect(e.phase).toBe('VICTORY');
  });

  it('a stun skips the whole pair once', () => {
    const e = started(pair({ waves: [{ ...pair().waves[0]!, maxHp: 100 }] }));
    act(e, 'sandals', false);
    expect(e.enemyTurn().skippedStunned).toBe(true);
    act(e, 'attack', false);
    expect(e.enemyTurn().skippedStunned).toBe(false);
  });
});

describe('BattleEngine targeting a pair', () => {
  const pair = () =>
    oneWave({
      waves: [
        {
          id: 'front',
          name: 'Front',
          maxHp: 50,
          attack: 5,
          partner: { id: 'back', name: 'Back', maxHp: 25, attack: 8 },
        },
      ],
      unlockedSpecials: ['sword'],
    });

  it('targets the front foe by default; a single foe cannot be retargeted', () => {
    expect(started(pair()).target).toBe('front');
    const single = started();
    expect(() => single.setTarget('back')).toThrow(/no back foe/);
  });

  it('only changes target on the hero’s turn', () => {
    const e = started(pair());
    e.choose('attack');
    expect(() => e.setTarget('back')).toThrow(/Expected phase HERO_CHOOSE/);
  });

  it('an Attack lands on the targeted back foe', () => {
    const e = started(pair());
    e.setTarget('back');
    const r = act(e, 'attack', false);
    expect(r.damage).toBe(0);
    expect(r.backDamage).toBe(10);
    expect(e.foeHp).toBe(50);
    expect(e.backFoeHp).toBe(15);
  });

  it('felling the targeted back foe sends the target back to the front', () => {
    const e = started(pair());
    e.setTarget('back');
    const r = act(e, 'attack', true); // 30 ≥ 25
    expect(r).toMatchObject({ backDefeated: true, foeDefeated: false });
    expect(e.backFoe).toBeNull();
    expect(e.target).toBe('front');
  });

  it('the Sword sweeps both whatever the target', () => {
    const e = started(pair());
    e.setTarget('back');
    const r = act(e, 'sword', false);
    expect(r.damage).toBe(10 * TUNING.sword.base);
    expect(r.backDamage).toBe(Math.min(25, 10 * TUNING.sword.base));
  });
});
