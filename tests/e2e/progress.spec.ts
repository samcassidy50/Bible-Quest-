import { expect, test, type Page } from '@playwright/test';
import type { SaveData } from '../../src/core/progress/progress';
import { battle, heroTurn, snap, state, tap, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

const KEY = 'bible-quest-save';
const base = (): SaveData => ({
  version: 1,
  completed: {},
  heard: [],
  asked: [],
  seenOnMap: [],
  runes: {
    sword: [null, null],
    shield: [null, null],
    breastplate: [null, null],
    sandals: [null, null],
  },
  settings: {
    sound: true,
    narration: true,
    readingSpeed: 'normal',
    autoCollect: false,
    timer: false,
    quickTest: false,
    hero: 'boy',
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
  // The first win awards the passage's rune, set straight into the sword.
  expect((await state(page)).save!.runes.sword).toEqual(['gen-001', null]);
  await snap(page, test.info().outputPath('victory-rune.png'));
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

test('runes: tap an item, then a rune to set it; swap when full; tap a set rune to take it out', async ({
  page,
}) => {
  const save = base();
  for (const id of ['gen-001', 'gen-002', 'gen-003', 'gen-004', 'gen-005'])
    save.completed[id] = { stars: 3, bestAccuracy: 1 };
  await seed(page, save);
  await page.goto('/?scene=map&fast=1');
  await waitFor(page, "s.scene === 'map' && !s.mapRevealing && !!s.targets.runes");
  await tap(page, 'runes');
  await waitFor(
    page,
    "s.scene === 'runes' && !!s.runes && s.runes.item === null && !!s.targets['item:sword']",
  );
  await snap(page, test.info().outputPath('runes-items.png'));

  // Each tap redraws the screen; wait on the redrawn state before the next tap.
  const drawn = (item: string | null, selected: string | null, extra = 'true') =>
    waitFor(
      page,
      `s.scene === 'runes' && !!s.runes && s.runes.item === ${JSON.stringify(item)} && ` +
        `s.runes.selected === ${JSON.stringify(selected)} && ${extra}`,
    );
  await tap(page, 'item:sword');
  await drawn('sword', null, "!!s.targets['rune:gen-001']");
  // Only the sword's runes are listed (Might, Zeal, Might), not the shield's Life.
  expect((await state(page)).runes!.bag).toEqual(['gen-001', 'gen-002', 'gen-003']);
  await snap(page, test.info().outputPath('runes-sword.png'));

  await tap(page, 'rune:gen-001'); // into the first free slot
  await drawn('sword', null, "!s.runes.bag.includes('gen-001')");
  expect((await state(page)).save!.runes.sword[0]).toBe('gen-001');
  await tap(page, 'rune:gen-002');
  await drawn('sword', null, "!s.runes.bag.includes('gen-002')");
  expect((await state(page)).save!.runes.sword).toEqual(['gen-001', 'gen-002']);

  await tap(page, 'rune:gen-003'); // both full: picked, waiting for a slot
  await drawn('sword', 'gen-003');
  await snap(page, test.info().outputPath('runes-swap.png'));
  await tap(page, 'slot:sword:0');
  await drawn('sword', null, "s.runes.bag.includes('gen-001')");
  expect((await state(page)).save!.runes.sword).toEqual(['gen-003', 'gen-002']);

  await tap(page, 'slot:sword:1'); // take the Zeal rune back out
  await drawn('sword', null, "s.runes.bag.includes('gen-002')");
  expect((await state(page)).save!.runes.sword[1]).toBeNull();

  await tap(page, 'back');
  await drawn(null, null, "!!s.targets['item:shield']");
  await tap(page, 'item:shield');
  await drawn('shield', null, "!!s.targets['rune:gen-004']"); // Rune of Life (shield from gen-005)
  await tap(page, 'rune:gen-004');
  await drawn('shield', null, "!s.runes.bag.includes('gen-004')");
  expect((await state(page)).save!.runes.shield[0]).toBe('gen-004');
  await snap(page, test.info().outputPath('runes-shield.png'));

  await page.goto('/?scene=battle&encounter=gen-001&seed=1&freeze=1');
  await heroTurn(page);
  expect((await battle(page)).heroMaxHp).toBe(120); // Rune of Life
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

test('a new player chooses a hero after the title; the choice is saved and used', async ({
  page,
}) => {
  await page.goto('/?seed=1&fast=1');
  await waitFor(page, "s.scene === 'title'");
  const box = (await page.locator('#game canvas').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await waitFor(page, "s.scene === 'heroSelect' && !!s.targets['hero:girl']", 30_000);
  expect((await state(page)).targets['back']).toBeUndefined(); // a new player must pick
  await snap(page, test.info().outputPath('hero-select.png'));
  await tap(page, 'hero:girl');
  await waitFor(page, "s.scene === 'map' && s.save.settings.hero === 'girl'", 30_000);

  // Later screens draw her, and Settings can change it back.
  await page.goto('/?scene=battle&encounter=gen-001&seed=1&fast=1');
  await heroTurn(page);
  expect((await state(page)).heroSkin).toBe('girl');
  await page.goto('/?scene=settings');
  await waitFor(page, "s.scene === 'settings' && !!s.targets.hero");
  await tap(page, 'hero');
  await waitFor(page, "s.scene === 'heroSelect' && !!s.targets['hero:boy'] && !!s.targets.back");
  await tap(page, 'hero:boy');
  await waitFor(page, "s.scene === 'settings' && s.save.settings.hero === 'boy'", 30_000);
});

test('the Hero button opens a character sheet with the hero, armor and stats', async ({ page }) => {
  const save = base();
  save.completed = {
    'gen-001': { stars: 3, bestAccuracy: 1 },
    'gen-002': { stars: 2, bestAccuracy: 0.8 },
  };
  save.completed['gen-004'] = { stars: 3, bestAccuracy: 1 };
  save.completed['gen-005'] = { stars: 3, bestAccuracy: 1 };
  save.runes.shield = ['gen-004', null]; // Rune of Life
  await seed(page, save);
  await page.goto('/?scene=map&fast=1');
  await waitFor(page, "s.scene === 'map' && !s.mapRevealing && !!s.targets.character");
  await tap(page, 'character');
  await waitFor(page, "s.scene === 'character' && !!s.character");
  const sheet = (await state(page)).character!;
  expect(sheet.hero).toBe('boy');
  expect(sheet.stats.find((s) => s.id === 'health')!.value).toBe('120 HP');
  expect(sheet.stats.map((s) => s.id)).toEqual([
    'health',
    'attack',
    'defence',
    'healing',
    'energy',
    'ultimate',
  ]);
  await snap(page, test.info().outputPath('character-sheet.png'));
  await tap(page, 'back');
  await waitFor(page, "s.scene === 'map'");
});
