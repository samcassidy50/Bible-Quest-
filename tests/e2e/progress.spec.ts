import { expect, test, type Page } from '@playwright/test';
import type { SaveData } from '../../src/core/progress/progress';
import { battle, heroTurn, state, tap, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

const KEY = 'bible-quest-save';
const base = (): SaveData => ({
  version: 1,
  completed: {},
  heard: [],
  upgrades: { health: 0, strength: 0, armor: 0, faith: 0 },
  settings: {
    sound: true,
    narration: true,
    readingSpeed: 'normal',
    autoCollect: false,
    timer: false,
  },
});

/** Puts a save in localStorage before the game first loads. */
async function seed(page: Page, save: SaveData): Promise<void> {
  // Only when empty, so later page loads keep what the game itself saved.
  await page.addInitScript(
    ([k, v]) => {
      if (window.localStorage.getItem(k!) === null) window.localStorage.setItem(k!, v!);
    },
    [KEY, JSON.stringify(save)],
  );
}

const stored = (page: Page) =>
  page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? 'null'), KEY);

test('new players see only the first passage open', async ({ page }) => {
  await page.goto('/?scene=map');
  await waitFor(page, "s.scene === 'map' && !!s.map");
  const map = (await state(page)).map!;
  expect(map.filter((m) => m.open).map((m) => m.id)).toEqual(['gen-001']);
  await tap(page, 'stage:gen-002'); // locked: nothing happens
  await page.waitForTimeout(400);
  expect((await state(page)).scene).toBe('map');
});

test('winning earns stars, saves them, and opens the next passage', async ({ page }) => {
  await page.goto('/?scene=battle&encounter=gen-001&seed=1&autoAnswer=correct&fast=1');
  await waitFor(page, "s.battle && s.battle.result === 'VICTORY' && !!s.targets.secondary", 60_000);
  expect((await state(page)).save!.completed['gen-001']!.stars).toBe(3);
  await expect.poll(() => stored(page)).toMatchObject({ completed: { 'gen-001': { stars: 3 } } });

  await tap(page, 'secondary'); // Passages
  await waitFor(page, "s.scene === 'map' && !!s.map");
  const map = (await state(page)).map!;
  expect(map.find((m) => m.id === 'gen-001')).toMatchObject({ open: true, stars: 3 });
  expect(map.find((m) => m.id === 'gen-002')!.open).toBe(true);

  // Survives a reload.
  await page.goto('/?scene=map');
  await waitFor(page, "s.scene === 'map' && !!s.map");
  expect((await state(page)).map!.find((m) => m.id === 'gen-002')!.open).toBe(true);
});

test('buying an upgrade spends stars and makes the hero stronger', async ({ page }) => {
  const save = base();
  save.completed = {
    'gen-001': { stars: 3, bestAccuracy: 1 },
    'gen-002': { stars: 2, bestAccuracy: 0.7 },
  };
  await seed(page, save);
  await page.goto('/?scene=upgrades');
  await waitFor(page, "s.scene === 'upgrades' && !!s.targets['buy:health']");
  await tap(page, 'buy:health');
  await waitFor(page, 's.save.upgrades.health === 1');
  await tap(page, 'buy:health');
  await waitFor(page, 's.save.upgrades.health === 2'); // 2 + 3 = 5 stars spent
  await tap(page, 'buy:health'); // needs 4, none left
  await page.waitForTimeout(300);
  expect((await state(page)).save!.upgrades.health).toBe(2);

  await page.goto('/?scene=battle&encounter=gen-001&seed=1&freeze=1');
  await heroTurn(page);
  expect((await battle(page)).heroMaxHp).toBe(130);
});

test('the Verse Journal shows completed passages', async ({ page }) => {
  const save = base();
  save.completed = {
    'gen-001': { stars: 3, bestAccuracy: 1 },
    'gen-003': { stars: 1, bestAccuracy: 0.4 },
  };
  await seed(page, save);
  await page.goto('/?scene=journal');
  await waitFor(page, "s.scene === 'journal' && s.journalOpen === 'gen-001'");
  expect(Object.keys((await state(page)).targets)).toEqual([
    'back',
    'entry:gen-001',
    'entry:gen-003',
  ]);
  await tap(page, 'entry:gen-003');
  await waitFor(page, "s.journalOpen === 'gen-003'");
});

test('settings are saved; reset needs two taps and keeps settings', async ({ page }) => {
  const save = base();
  save.completed = { 'gen-001': { stars: 3, bestAccuracy: 1 } };
  await seed(page, save);
  await page.goto('/?scene=settings');
  await waitFor(page, "s.scene === 'settings' && !!s.targets['setting:sound']");
  await tap(page, 'setting:sound');
  await waitFor(page, 's.save.settings.sound === false');
  await tap(page, 'setting:readingSpeed');
  await waitFor(page, "s.save.settings.readingSpeed === 'fast'");
  await tap(page, 'setting:timer');
  await waitFor(page, 's.save.settings.timer === true');

  await tap(page, 'reset');
  await page.waitForTimeout(300);
  expect(Object.keys((await state(page)).save!.completed)).toEqual(['gen-001']);
  await tap(page, 'reset');
  await waitFor(page, 'Object.keys(s.save.completed).length === 0');
  expect((await state(page)).save!.settings).toMatchObject({
    sound: false,
    readingSpeed: 'fast',
    timer: true,
  });
});

test('with the timer on, running out of time counts as wrong', async ({ page }) => {
  const save = base();
  save.settings.timer = true;
  await seed(page, save);
  await page.goto('/?scene=battle&encounter=gen-001&seed=2&fast=1');
  await heroTurn(page);
  await tap(page, 'action:attack');
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');
  await waitFor(page, "s.battle.feedback === 'wrong'", 10_000); // 20 s ÷ 10 in fast mode
  expect((await state(page)).sounds).toContain('wrong');
});
