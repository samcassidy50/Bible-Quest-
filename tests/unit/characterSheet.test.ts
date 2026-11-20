import { describe, expect, it } from 'vitest';
import { characterSheet } from '../../src/core/progress/characterSheet';
import { newSave, recordVictory } from '../../src/core/progress/progress';
import { heroLoadout, setRune } from '../../src/core/progress/runes';
import { HERO_BASE } from '../../src/core/battle/hero';
import { TUNING } from '../../src/core/battle/tuning';

const ENCOUNTERS = [
  { id: 'a', rune: 'might' as const },
  { id: 'b', unlocks: 'shield' as const, rune: 'guard' as const },
  { id: 'c', unlocks: 'ultimate' as const, rune: 'zeal' as const },
  { id: 'd', unlocks: 'breastplate' as const, rune: 'renewal' as const },
  { id: 'e', unlocks: 'sandals' as const, rune: 'haste' as const },
  { id: 'f', rune: 'peace' as const },
];
const stat = (sheet: ReturnType<typeof characterSheet>, id: string) =>
  sheet.stats.find((s) => s.id === id)!;

describe('characterSheet', () => {
  it('shows the starting hero', () => {
    const sheet = characterSheet(newSave(), ENCOUNTERS);
    expect(stat(sheet, 'health').value).toBe(`${HERO_BASE.maxHp} HP`);
    expect(stat(sheet, 'attack').value).toBe(`${HERO_BASE.attack * TUNING.attack.base}`);
    expect(stat(sheet, 'defence').value).toBe('—');
    expect(stat(sheet, 'healing').value).toBe('—');
    expect(stat(sheet, 'energy').value).toBe(`${TUNING.energy.max} max`);
    expect(stat(sheet, 'ultimate').value).toBe('—');
    expect(sheet.stats.every((s) => s.runes.length === 0)).toBe(true);
    expect(sheet.armor).toEqual([]);
    expect(sheet.stars).toBe(0);
    expect(sheet.passagesDone).toBe(0);
  });

  it('matches the numbers a battle uses after runes and armor', () => {
    let save = newSave();
    for (const e of ENCOUNTERS) save = recordVictory(save, e.id, 3, 3).save;
    save = setRune(save, ENCOUNTERS, 'a', 'sword', 0);
    save = setRune(save, ENCOUNTERS, 'c', 'sword', 1);
    save = setRune(save, ENCOUNTERS, 'b', 'shield', 0);
    save = setRune(save, ENCOUNTERS, 'd', 'breastplate', 0);
    save = setRune(save, ENCOUNTERS, 'e', 'sandals', 0);
    save = setRune(save, ENCOUNTERS, 'f', 'sandals', 1);
    const build = heroLoadout(save, ENCOUNTERS);
    const sheet = characterSheet(save, ENCOUNTERS);

    expect(stat(sheet, 'health').value).toBe(`${build.hero.maxHp} HP`);
    expect(stat(sheet, 'attack').value).toBe(`${build.hero.attack}`);
    expect(stat(sheet, 'attack').detail).toContain(
      `${Math.round(build.hero.attack * TUNING.attack.powered * 1.25)} when you answer right`,
    );
    expect(stat(sheet, 'defence').value).toBe('Shield');
    expect(stat(sheet, 'defence').detail).toContain('Starts each fight blocking 1 attack.');
    expect(stat(sheet, 'healing').value).toBe('35%');
    expect(stat(sheet, 'healing').detail).toContain('Heals 3 HP on each right answer.');
    expect(stat(sheet, 'energy').value).toBe('+2 start');
    expect(stat(sheet, 'attack').runes).toEqual(['might', 'zeal']);
    expect(stat(sheet, 'defence').runes).toEqual(['guard']);
    expect(stat(sheet, 'health').runes).toEqual([]);
    expect(stat(sheet, 'energy').runes).toEqual(['haste', 'peace']);
    expect(stat(sheet, 'energy').detail).toContain('Sandals stun for 2 turns.');
    expect(stat(sheet, 'ultimate').value).toBe(`×${TUNING.ultimate.damage}`);
    expect(sheet.armor).toEqual(['shield', 'breastplate', 'sandals']);
    expect(sheet.ultimate).toBe(true);
    expect(sheet.stars).toBe(18);
    expect(sheet.passagesDone).toBe(6);
  });
});
