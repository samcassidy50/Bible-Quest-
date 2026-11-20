import { describe, expect, it } from 'vitest';
import {
  isUnlocked,
  loadSave,
  markHeard,
  ownedArmor,
  newSave,
  recordVictory,
  resetProgress,
  SAVE_VERSION,
  starsFor,
  totalStars,
  updateSettings,
} from '../../src/core/progress/progress';

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
      hero: null,
    });
    expect(s.runes).toEqual({
      sword: [null, null],
      shield: [null, null],
      breastplate: [null, null],
      sandals: [null, null],
    });
  });

  it('drops upgrade levels from saves made before runes, keeping the rest', () => {
    const old = {
      version: SAVE_VERSION,
      completed: { 'gen-001': { stars: 2, bestAccuracy: 0.7 } },
      heard: ['gen-001'],
      seenOnMap: [],
      upgrades: { health: 2, strength: 1, armor: 0, faith: 3 },
      settings: { hero: 'girl' },
    };
    const s = loadSave(JSON.stringify(old));
    expect(s.completed['gen-001']!.stars).toBe(2);
    expect(s.settings.hero).toBe('girl');
    expect('upgrades' in s).toBe(false);
    expect(s.runes.sword).toEqual([null, null]);
  });

  it('remembers the chosen hero', () => {
    const s = updateSettings(newSave(), { hero: 'girl' });
    expect(loadSave(JSON.stringify(s)).settings.hero).toBe('girl');
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
      runes: { sword: ['gen-001', 7, 'x', 'y'], shield: 'nope' },
      settings: {
        sound: 'loud',
        narration: false,
        readingSpeed: 'warp',
        autoCollect: true,
        timer: false,
        quickTest: 'yes',
        hero: 'dragon',
      },
    };
    const s = loadSave(JSON.stringify(raw));
    expect(s.completed['gen-001']!.stars).toBe(3);
    expect(s.heard).toEqual([]);
    expect(s.runes).toEqual({
      sword: ['gen-001', null],
      shield: [null, null],
      breastplate: [null, null],
      sandals: [null, null],
    });
    expect(s.settings).toEqual({
      sound: true,
      narration: false,
      readingSpeed: 'normal',
      autoCollect: true,
      timer: false,
      quickTest: false,
      hero: null,
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
