import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../../src/core/battle/BattleEngine';
import { HERO_BASE } from '../../src/core/battle/hero';
import {
  ITEM_IDS,
  ITEMS,
  RUNE_IDS,
  RUNE_SLOTS,
  RUNE_TUNING,
  RUNES,
  runeLoadout,
} from '../../src/core/battle/runes';
import { simulateBattle } from '../../src/core/battle/simulate';
import { TUNING } from '../../src/core/battle/tuning';
import { createRng, type Rng } from '../../src/core/rng';
import { loadSave, newSave, recordVictory, type SaveData } from '../../src/core/progress/progress';
import {
  autoSetOnFirstWin,
  autoSetRune,
  clearSlot,
  heroLoadout,
  itemOpen,
  ownedRunes,
  runesToSet,
  setRune,
  setRuneKinds,
  validSlots,
} from '../../src/core/progress/runes';
import { ENCOUNTERS as REAL } from '../../src/content';
import { oneWave, threeWaves } from './fixtures';

const ENC = [
  { id: 'a', rune: 'might' as const },
  { id: 'b', rune: 'zeal' as const },
  { id: 'c', rune: 'might' as const, unlocks: 'sword' as const },
  { id: 'd', rune: 'life' as const },
  { id: 'e', rune: 'guard' as const, unlocks: 'shield' as const },
  { id: 'f' },
];
const win = (s: SaveData, ...ids: string[]) =>
  ids.reduce((acc, id) => recordVictory(acc, id, 1, 1).save, s);
const flat: Rng = { ...createRng(1), next: () => 0.5 };
const big = { waves: [{ id: 'b', name: 'b', maxHp: 1000, attack: 20 }] };

describe('rune catalog', () => {
  it('every rune fits exactly one item, and every item has runes in its own colour', () => {
    for (const id of RUNE_IDS) expect(ITEM_IDS).toContain(RUNES[id].item);
    for (const item of ITEM_IDS)
      expect(RUNE_IDS.filter((r) => RUNES[r].item === item).length).toBeGreaterThanOrEqual(2);
    expect(new Set(ITEM_IDS.map((i) => ITEMS[i].color)).size).toBe(ITEM_IDS.length);
    expect(RUNE_SLOTS).toBe(2);
  });

  it('adds up the set runes, stacking two of a kind', () => {
    const none = runeLoadout([]);
    expect(none).toEqual({
      hero: HERO_BASE,
      poweredBonus: 0,
      startingBlocks: 0,
      healPower: 1,
      healOnCorrect: 0,
      bonusEnergy: 0,
      stunBonus: 0,
    });
    const l = runeLoadout([
      'might',
      'might',
      'zeal',
      'life',
      'guard',
      'mending',
      'renewal',
      'haste',
    ]);
    expect(l.hero).toEqual({
      maxHp: HERO_BASE.maxHp + RUNE_TUNING.life.maxHp,
      attack: HERO_BASE.attack + 2 * RUNE_TUNING.might.attack,
    });
    expect(l.poweredBonus).toBe(RUNE_TUNING.zeal.poweredBonus);
    expect(l.startingBlocks).toBe(1);
    expect(l.healPower).toBeCloseTo(1 + RUNE_TUNING.mending.healPower);
    expect(l.healOnCorrect).toBe(RUNE_TUNING.renewal.healOnCorrect);
    expect(l.bonusEnergy).toBe(RUNE_TUNING.haste.bonusEnergy);
    expect(runeLoadout(['peace']).stunBonus).toBe(1);
  });
});

describe('owning and setting runes', () => {
  it('a passage gives its rune once it is won', () => {
    const s = win(newSave(), 'a', 'b', 'f');
    expect(ownedRunes(s, ENC).map((r) => [r.id, r.kind, r.item, r.slot])).toEqual([
      ['a', 'might', 'sword', null],
      ['b', 'zeal', 'sword', null],
    ]);
  });

  it('the sword is open from the start; other items open with their armor', () => {
    expect(itemOpen(newSave(), ENC, 'sword')).toBe(true);
    expect(itemOpen(newSave(), ENC, 'shield')).toBe(false);
    expect(itemOpen(win(newSave(), 'e'), ENC, 'shield')).toBe(true);
  });

  it('sets a rune only into a free-or-filled slot of its own, open item', () => {
    let s = win(newSave(), 'a', 'b', 'c', 'd');
    expect(setRune(s, ENC, 'a', 'shield', 0)).toBe(s); // wrong item
    expect(setRune(s, ENC, 'd', 'shield', 0)).toBe(s); // shield not earned yet
    expect(setRune(s, ENC, 'zzz', 'sword', 0)).toBe(s); // not owned
    expect(setRune(s, ENC, 'a', 'sword', 2)).toBe(s); // no such slot
    expect(setRune(s, ENC, 'a', 'sword', -1)).toBe(s);
    s = setRune(s, ENC, 'a', 'sword', 0);
    s = setRune(s, ENC, 'b', 'sword', 1);
    expect(s.runes.sword).toEqual(['a', 'b']);
    // Setting into a filled slot sends the old blessing back to the bag.
    s = setRune(s, ENC, 'c', 'sword', 0);
    expect(s.runes.sword).toEqual(['c', 'b']);
    expect(ownedRunes(s, ENC).find((r) => r.id === 'a')!.slot).toBeNull();
    // Moving a set blessing to the other slot takes it out of the first.
    s = setRune(s, ENC, 'c', 'sword', 1);
    expect(s.runes.sword).toEqual([null, 'c']);
    expect(setRuneKinds(s, ENC)).toEqual(['might']);
  });

  it('clears a slot back to the bag', () => {
    let s = setRune(win(newSave(), 'a'), ENC, 'a', 'sword', 1);
    expect(clearSlot(s, ENC, 'sword', 0)).toBe(s); // already empty
    s = clearSlot(s, ENC, 'sword', 1);
    expect(s.runes.sword).toEqual([null, null]);
  });

  it('ignores slots a save should not have (unearned, wrong item, locked, duplicate)', () => {
    const s = loadSave(
      JSON.stringify({
        ...win(newSave(), 'a', 'd'),
        runes: { sword: ['a', 'a'], shield: ['d', null], breastplate: ['zz', 'a'], sandals: [] },
      }),
    );
    expect(validSlots(s, ENC)).toEqual({
      sword: ['a', null],
      shield: [null, null], // the Shield is not earned yet
      breastplate: [null, null],
      sandals: [null, null],
    });
    expect(heroLoadout(s, ENC).hero.attack).toBe(HERO_BASE.attack + RUNE_TUNING.might.attack);
  });

  it('counts runes waiting that could be set now', () => {
    let s = win(newSave(), 'a', 'b', 'c', 'd');
    expect(runesToSet(s, ENC)).toBe(2); // three sword blessings, two slots; the Life blessing waits
    s = setRune(setRune(s, ENC, 'a', 'sword', 0), ENC, 'b', 'sword', 1);
    expect(runesToSet(s, ENC)).toBe(0);
    s = win(s, 'e');
    expect(runesToSet(s, ENC)).toBe(2); // the shield opened: Life and Guarding
  });

  it('a first win sets its rune, and runes waiting for an item it opens', () => {
    let s = autoSetOnFirstWin(win(newSave(), 'a'), ENC, 'a');
    expect(s.runes.sword).toEqual(['a', null]);
    s = autoSetOnFirstWin(win(s, 'b'), ENC, 'b');
    s = autoSetOnFirstWin(win(s, 'c'), ENC, 'c');
    expect(s.runes.sword).toEqual(['a', 'b']); // full: the second Might waits in the bag
    s = autoSetOnFirstWin(win(s, 'd'), ENC, 'd');
    expect(s.runes.shield).toEqual([null, null]); // no shield yet
    s = autoSetOnFirstWin(win(s, 'e'), ENC, 'e');
    expect(s.runes.shield).toEqual(['d', 'e']);
    expect(autoSetOnFirstWin(s, ENC, 'f')).toBe(s);
    expect(autoSetRune(s, ENC, 'a')).toBe(s); // already set
    expect(autoSetRune(s, ENC, 'zzz')).toBe(s);
  });
});

describe('runes in battle', () => {
  it('Might and Life raise the hero; Zeal adds to every hit after a right answer', () => {
    const e = new BattleEngine(
      oneWave({ ...big, ...runeLoadout(['might', 'zeal', 'life']), unlockedSpecials: ['sword'] }),
      flat,
    );
    expect(e.heroMaxHp).toBe(120);
    e.start();
    e.choose('attack');
    expect(e.answer(true).damage).toBe(41); // 11 × 3 × 1.25 = 41.25
    e.enemyTurn();
    e.choose('attack');
    expect(e.answer(false).damage).toBe(11); // wrong answers get no Zeal
    e.enemyTurn();
    e.choose('sword');
    expect(e.answer(true).damage).toBe(55); // 11 × 4 × 1.25
  });

  it('Guarding starts the fight with a block; Haste adds energy (capped)', () => {
    const e = new BattleEngine(
      oneWave({ ...big, ...runeLoadout(['guard', 'haste']), startingEnergy: 3 }),
      flat,
    );
    expect(e.blocks).toBe(1);
    expect(e.energy).toBe(5);
    e.start();
    e.choose('attack');
    e.answer(true);
    expect(e.enemyTurn().blocked).toBe(true);
    const capped = new BattleEngine(oneWave({ bonusEnergy: 4, startingEnergy: 9 }), flat);
    expect(capped.energy).toBe(TUNING.energy.max);
  });

  it('Mending boosts the Breastplate; Renewal heals on right answers', () => {
    const e = new BattleEngine(
      oneWave({
        ...big,
        ...runeLoadout(['mending', 'renewal']),
        unlockedSpecials: ['breastplate'],
      }),
      flat,
    );
    e.start();
    e.choose('attack');
    expect(e.answer(true).healed).toBe(0); // already full
    e.enemyTurn(); // 100 → 80
    e.choose('attack');
    expect(e.answer(true).healed).toBe(3);
    e.enemyTurn(); // 83 → 63
    e.choose('breastplate');
    expect(e.answer(false).healed).toBe(21); // 15% × 1.4 of 100, no Renewal on a wrong answer
  });

  it('Peace makes the Sandals stun last longer', () => {
    const e = new BattleEngine(
      oneWave({ ...big, ...runeLoadout(['peace']), unlockedSpecials: ['sandals'] }),
      flat,
    );
    e.start();
    e.choose('sandals');
    e.answer(true);
    expect(e.enemyTurn().skippedStunned).toBe(true);
    e.choose('attack');
    e.answer(true);
    expect(e.enemyTurn().skippedStunned).toBe(true);
    e.choose('attack');
    e.answer(true);
    expect(e.enemyTurn().skippedStunned).toBe(false);
  });
});

describe('runes in the real content', () => {
  it('every passage awards a rune, and each item gets at least its two slots worth', () => {
    for (const e of REAL) expect(e.rune, e.id).toBeDefined();
    for (const item of ITEM_IDS)
      expect(
        REAL.filter((e) => e.rune && RUNES[e.rune].item === item).length,
      ).toBeGreaterThanOrEqual(RUNE_SLOTS);
  });

  it('winning every passage in order fills every slot automatically', () => {
    let s = newSave();
    for (const e of REAL) s = autoSetOnFirstWin(win(s, e.id), REAL, e.id);
    for (const item of ITEM_IDS) expect(validSlots(s, REAL)[item]).not.toContain(null);
  });

  it('a full rune loadout helps without making fights trivial (balance)', () => {
    const full = runeLoadout([
      'might',
      'zeal',
      'life',
      'guard',
      'mending',
      'renewal',
      'haste',
      'peace',
    ]);
    const all = ['sword', 'shield', 'breastplate', 'sandals'] as const;
    const base = threeWaves({ unlockedSpecials: [...all] });
    const runed = threeWaves({ ...full, unlockedSpecials: [...all] });
    expect(avgHpLeft(runed, 0.3)).toBeGreaterThan(avgHpLeft(base, 0.3));
    // Still a fight: at 60% accuracy the median win takes a few hero turns.
    const turns = Array.from(
      { length: 301 },
      (_, i) => simulateBattle(runed, 0.6, i + 1).turns,
    ).sort((a, b) => a - b);
    expect(turns[150]).toBeGreaterThanOrEqual(3);
  });
});

function avgHpLeft(config: Parameters<typeof simulateBattle>[0], accuracy: number): number {
  let sum = 0;
  for (let i = 0; i < 1000; i++) sum += simulateBattle(config, accuracy, i + 1).heroHpLeft;
  return sum / 1000;
}
