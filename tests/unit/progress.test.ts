import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../../src/core/battle/BattleEngine';
import { HERO_BASE } from '../../src/core/battle/hero';
import { createRng, type Rng } from '../../src/core/rng';
import {
  availableStars,
  buyUpgrade,
  canBuyUpgrade,
  heroBuild,
  isUnlocked,
  loadSave,
  markHeard,
  ownedArmor,
  MAX_UPGRADE_LEVEL,
  newSave,
  nextUpgradeCost,
  recordVictory,
  resetProgress,
  SAVE_VERSION,
  spentStars,
  starsFor,
  totalStars,
  updateSettings,
  type SaveData,
} from '../../src/core/progress/progress';
import { oneWave } from './fixtures';

const withStars = (n: number): SaveData => {
  let s = newSave();
  for (let i = 0; i < n; i++) s = recordVictory(s, `e${i}`, 1, 1).save;
  return s; // n passages × 3 stars
};

describe('stars', () => {
  it('1 for a win, 2 at 60%, 3 at 90%', () => {
    expect(starsFor(0, 5)).toBe(1);
    expect(starsFor(2, 5)).toBe(1);
    expect(starsFor(3, 5)).toBe(2);
    expect(starsFor(8, 9)).toBe(2);
    expect(starsFor(9, 10)).toBe(3);
    expect(starsFor(0, 0)).toBe(3);
  });

  it('keeps the best result and reports new bests', () => {
    let r = recordVictory(newSave(), 'gen-001', 1, 2);
    expect(r).toMatchObject({ stars: 1, newBest: true });
    r = recordVictory(r.save, 'gen-001', 5, 5);
    expect(r).toMatchObject({ stars: 3, newBest: true });
    r = recordVictory(r.save, 'gen-001', 0, 5);
    expect(r).toMatchObject({ stars: 1, newBest: false });
    expect(r.save.completed['gen-001']).toEqual({ stars: 3, bestAccuracy: 1 });
    expect(totalStars(r.save)).toBe(3);
  });
});

describe('unlocks', () => {
  const order = ['a', 'b', 'c'];
  it('opens passages in reading order', () => {
    let s = newSave();
    expect(order.map((id) => isUnlocked(s, order, id))).toEqual([true, false, false]);
    s = recordVictory(s, 'a', 1, 1).save;
    expect(order.map((id) => isUnlocked(s, order, id))).toEqual([true, true, false]);
    expect(isUnlocked(s, order, 'zzz')).toBe(false);
  });
});

describe('upgrades', () => {
  it('cost 2, 3, 4 stars and stop at the max level', () => {
    let s = withStars(4); // 12 stars
    expect(nextUpgradeCost(s, 'health')).toBe(2);
    s = buyUpgrade(s, 'health');
    s = buyUpgrade(s, 'health');
    s = buyUpgrade(s, 'health');
    expect(s.upgrades.health).toBe(MAX_UPGRADE_LEVEL);
    expect(nextUpgradeCost(s, 'health')).toBeNull();
    expect(canBuyUpgrade(s, 'health')).toBe(false);
    expect(buyUpgrade(s, 'health')).toBe(s);
    expect(spentStars(s)).toBe(9);
    expect(availableStars(s)).toBe(3);
  });

  it('cannot spend stars you do not have', () => {
    const s = withStars(0);
    expect(canBuyUpgrade(s, 'strength')).toBe(false);
    expect(buyUpgrade(s, 'strength')).toBe(s);
  });

  it('turns levels into hero stats and power', () => {
    expect(heroBuild({ health: 0, strength: 0, armor: 0, faith: 0 })).toEqual({
      hero: HERO_BASE,
      specialPower: 1,
      ultimateBonus: 0,
    });
    const b = heroBuild({ health: 2, strength: 3, armor: 1, faith: 2 });
    expect(b.hero).toEqual({ maxHp: HERO_BASE.maxHp + 30, attack: HERO_BASE.attack + 6 });
    expect(b.specialPower).toBeCloseTo(1.2);
    expect(b.ultimateBonus).toBe(2);
  });

  it('the battle engine applies special power and ultimate bonus', () => {
    const flat: Rng = { ...createRng(1), next: () => 0.5 };
    const big = { waves: [{ id: 'b', name: 'b', maxHp: 1000, attack: 50 }] };
    const sword = new BattleEngine(
      oneWave({ ...big, unlockedSpecials: ['sword'], specialPower: 1.2 }),
      flat,
    );
    sword.start();
    sword.choose('sword');
    expect(sword.answer(true).damage).toBe(36); // 10 × 3 × 1.2

    const heal = new BattleEngine(
      oneWave({ ...big, unlockedSpecials: ['breastplate'], specialPower: 1.2 }),
      flat,
    );
    heal.start();
    heal.choose('attack');
    heal.answer(true);
    heal.enemyTurn(); // 100 → 50
    heal.choose('breastplate');
    expect(heal.answer(true).healed).toBe(42); // 35% × 1.2 of 100

    const ult = new BattleEngine(oneWave({ ...big, startingFaith: 5, ultimateBonus: 2 }), flat);
    ult.start();
    expect(ult.choose('ultimate')!.damage).toBe(70); // (5 + 2) × 10
  });
});

describe('save data', () => {
  it('starts with sensible defaults', () => {
    const s = newSave();
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.settings).toEqual({
      sound: true,
      narration: true,
      readingSpeed: 'normal',
      autoCollect: false,
      timer: false,
      quickTest: false,
    });
    expect(s.upgrades).toEqual({ health: 0, strength: 0, armor: 0, faith: 0 });
  });

  it('round-trips through JSON', () => {
    let s = recordVictory(newSave(), 'gen-001', 3, 4).save;
    s = markHeard(s, 'gen-001');
    s = updateSettings(s, { timer: true, readingSpeed: 'slow' });
    expect(loadSave(JSON.stringify(s))).toEqual(s);
  });

  it('never crashes on missing, corrupt or foreign data', () => {
    expect(loadSave(null)).toEqual(newSave());
    expect(loadSave('')).toEqual(newSave());
    expect(loadSave('{not json')).toEqual(newSave());
    expect(loadSave(JSON.stringify({ version: 99 }))).toEqual(newSave());
  });

  it('repairs individual bad fields instead of wiping the save', () => {
    const raw = {
      version: SAVE_VERSION,
      completed: { 'gen-001': { stars: 3, bestAccuracy: 1 } },
      heard: 'oops',
      upgrades: { health: 9, strength: 1, armor: -1, faith: 'x' },
      settings: {
        sound: 'loud',
        narration: false,
        readingSpeed: 'warp',
        autoCollect: true,
        timer: false,
        quickTest: 'yes',
      },
    };
    const s = loadSave(JSON.stringify(raw));
    expect(s.completed['gen-001']!.stars).toBe(3);
    expect(s.heard).toEqual([]);
    expect(s.upgrades).toEqual({ health: 0, strength: 1, armor: 0, faith: 0 });
    expect(s.settings).toEqual({
      sound: true,
      narration: false,
      readingSpeed: 'normal',
      autoCollect: true,
      timer: false,
      quickTest: false,
    });
  });

  it('marks verses heard once, and reset keeps settings', () => {
    let s = markHeard(markHeard(newSave(), 'a'), 'a');
    expect(s.heard).toEqual(['a']);
    s = updateSettings(recordVictory(s, 'a', 1, 1).save, { sound: false });
    const r = resetProgress(s);
    expect(r.completed).toEqual({});
    expect(r.heard).toEqual([]);
    expect(r.settings.sound).toBe(false);
  });
});

const won = (...ids: string[]) => ids.reduce((s, id) => recordVictory(s, id, 1, 1).save, newSave());

describe('armor earned along the map', () => {
  const encounters = [
    { id: 'a' },
    { id: 'b', unlocks: 'sword' as const },
    { id: 'c', unlocks: 'shield' as const },
    { id: 'd', unlocks: 'ultimate' as const },
  ];

  it('starts with only the basic attack', () => {
    expect(ownedArmor(newSave(), encounters)).toEqual({ specials: [], ultimate: false });
  });

  it('awards each piece when its passage is won', () => {
    expect(ownedArmor(won('a', 'b'), encounters)).toEqual({ specials: ['sword'], ultimate: false });
    expect(ownedArmor(won('b', 'c', 'd'), encounters)).toEqual({
      specials: ['sword', 'shield'],
      ultimate: true,
    });
  });
});
