import { describe, expect, it } from 'vitest';
import { characterSheet } from '../../src/core/progress/characterSheet';
import { buyUpgrade, newSave, recordVictory, heroBuild } from '../../src/core/progress/progress';
import { TUNING } from '../../src/core/battle/tuning';

const ENCOUNTERS = [
  { id: 'a' },
  { id: 'b', unlocks: 'shield' as const },
  { id: 'c', unlocks: 'ultimate' as const },
];
const stat = (sheet: ReturnType<typeof characterSheet>, id: string) =>
  sheet.stats.find((s) => s.id === id)!;

describe('characterSheet', () => {
  it('shows the starting hero', () => {
    const sheet = characterSheet(newSave(), ENCOUNTERS);
    const base = heroBuild(newSave().upgrades);
    expect(stat(sheet, 'health').value).toBe(`${base.hero.maxHp} HP`);
    expect(stat(sheet, 'attack').value).toBe(`${base.hero.attack * TUNING.attack.base}`);
    expect(stat(sheet, 'defence').value).toBe('—');
    expect(stat(sheet, 'ultimate').value).toBe('—');
    expect(stat(sheet, 'specials').value).toBe('100%');
    expect(sheet.armor).toEqual([]);
    expect(sheet.stars).toBe(0);
    expect(sheet.passagesDone).toBe(0);
  });

  it('matches the numbers a battle uses after upgrades and armor', () => {
    let save = newSave();
    for (const id of ['a', 'b', 'c']) save = recordVictory(save, id, 3, 3).save;
    save = buyUpgrade(save, 'health');
    save = buyUpgrade(save, 'strength');
    const build = heroBuild(save.upgrades);
    const sheet = characterSheet(save, ENCOUNTERS);

    expect(stat(sheet, 'health').value).toBe(`${build.hero.maxHp} HP`);
    expect(stat(sheet, 'health').upgrade).toEqual({ id: 'health', level: 1, max: 3 });
    expect(stat(sheet, 'attack').detail).toContain(
      `${build.hero.attack * TUNING.attack.powered} when you answer right`,
    );
    expect(stat(sheet, 'defence').value).toBe('Shield');
    expect(stat(sheet, 'ultimate').value).toBe(`×${TUNING.ultimate.damage}`);
    expect(sheet.armor).toEqual(['shield']);
    expect(sheet.ultimate).toBe(true);
    expect(sheet.stars).toBe(9);
    expect(sheet.passagesDone).toBe(3);
  });
});
