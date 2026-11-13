import { expect, test, type Page } from '@playwright/test';
import type { SaveData } from '../../src/core/progress/progress';
import { battle, heroTurn, snap, state, tap, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

const KEY = 'bible-quest-save';
const base = (): SaveData => ({
  version: 1,
  completed: {},
  heard: [],
  seenOnMap: [],
  upgrades: { health: 0, strength: 0, armor: 0, faith: 0 },
  settings: {
    sound: true,
    narration: true,
    readingSpeed: 'normal',
    autoCollect: false,
    timer: false,
    quickTest: false,
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

test('new players see only the first location on the map', async ({ page }) => {
  await page.goto('/?scene=map&fast=1');
  await waitFor(page, "s.scene === 'map' && !!s.map && !s.mapRevealing");
  const map = (await state(page)).map!;
  expect(map.filter((m) => m.open).map((m) => m.id)).toEqual(['gen-001']);
  const targets = Object.keys((await state(page)).targets);
  expect(targets).toContain('stage:gen-001');
  expect(targets).not.toContain('stage:gen-002');
});

test('tapping a location opens its card; Begin starts the reading', async ({ page }) => {
  await page.goto('/?scene=map&fast=1');
  await waitFor(page, "s.scene === 'map' && !s.mapRevealing && !!s.targets['stage:gen-001']");
  await snap(page, test.info().outputPath('map.png'));
  await tap(page, 'stage:gen-001');
  await waitFor(page, "s.mapCard === 'gen-001' && !!s.targets.begin");
  await snap(page, test.info().outputPath('map-card.png'));
  await tap(page, 'begin');
  await waitFor(
    page,
    "s.scene === 'scripture' && s.scripture && s.scripture.encounter === 'gen-001'",
  );
});

test('map buttons still work when the map is scrolled', async ({ page }) => {
  await page.goto('/?scene=map&unlockAll=1&fast=1'); // centred on the far end, so scrolled
  await waitFor(page, "s.scene === 'map' && !s.mapRevealing && !!s.targets.journal");
  await tap(page, 'journal');
  await waitFor(page, "s.scene === 'journal'");
});

test('winning earns stars and reveals the next location once', async ({ page }) => {
  await page.goto('/?scene=battle&encounter=gen-001&seed=1&autoAnswer=correct&fast=1');
  await waitFor(page, "s.battle && s.battle.result === 'VICTORY' && !!s.targets.secondary", 60_000);
  expect((await state(page)).save!.completed['gen-001']!.stars).toBe(3);
  await expect.poll(() => stored(page)).toMatchObject({ completed: { 'gen-001': { stars: 3 } } });

  await tap(page, 'secondary'); // Passages → map
  await waitFor(page, "s.scene === 'map' && s.mapRevealing === true");
  await waitFor(page, '!s.mapRevealing && !!s.targets["stage:gen-002"]', 30_000);
  await snap(page, test.info().outputPath('map-revealed.png'));
  const map = (await state(page)).map!;
  expect(map.find((m) => m.id === 'gen-001')).toMatchObject({ state: 'done', stars: 3 });
  expect(map.find((m) => m.id === 'gen-002')!.state).toBe('open');
  expect((await state(page)).save!.seenOnMap).toEqual(
    expect.arrayContaining(['gen-001', 'gen-002']),
  );

  // After a reload the new location is already there: no second reveal.
  await page.goto('/?scene=map&fast=1');
  await waitFor(page, "s.scene === 'map' && !!s.map");
  expect((await state(page)).mapRevealing).toBe(false);
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

test('quick test mode: Skip on a first reading, and one hit defeats a foe', async ({ page }) => {
  await seed(page, base());
  await page.goto('/?scene=settings');
  await waitFor(page, "s.scene === 'settings' && !!s.targets['setting:quickTest']");
  await snap(page, test.info().outputPath('settings-quick.png'));
  await tap(page, 'setting:quickTest');
  await waitFor(page, 's.save.settings.quickTest === true');

  // A passage never heard before can still be skipped.
  await page.goto('/?scene=scripture&encounter=gen-002&seed=1');
  await waitFor(page, "s.scene === 'scripture' && s.scripture.canSkip && !!s.targets.skip");
  await tap(page, 'skip');
  await waitFor(page, "s.scene === 'battle' && !!s.battle");

  await heroTurn(page);
  await tap(page, 'action:attack');
  await waitFor(page, 's.battle.question && !!s.targets["answer:0"]');
  await tap(page, `answer:${(await battle(page)).question!.answerIndex}`);
  // One answered Attack defeats the first foe.
  await waitFor(page, "s.sounds.includes('foeDefeat')", 30_000);
  expect((await state(page)).sounds.filter((x) => x === 'foeDefeat')).toHaveLength(1);
});
