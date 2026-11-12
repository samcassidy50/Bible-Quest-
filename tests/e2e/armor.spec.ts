import { expect, test } from '@playwright/test';
import { battle, heroTurn, snap, state, tap, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

test('a new player has only the basic attack', async ({ page }) => {
  await page.goto('/?scene=battle&encounter=gen-001&seed=1&energy=10&freeze=1');
  await heroTurn(page);
  const b = await battle(page);
  expect(b.available).toEqual(['attack']);
  expect(b.ultimateUnlocked).toBe(false);
});

test('winning passage 3 for the first time: the angel presents the Sword', async ({ page }) => {
  await page.goto('/?scene=battle&encounter=gen-003&seed=1&autoAnswer=correct&fast=1');
  await waitFor(page, "s.battle && s.battle.gift === 'sword'", 60_000);
  await waitFor(page, "!!s.targets['gift-continue']");
  await snap(page, test.info().outputPath('angel.png'));
  // Auto-play continues on its own; the win screen follows.
  await waitFor(
    page,
    "s.battle.gift === null && s.battle.result === 'VICTORY' && !!s.targets.primary",
    30_000,
  );

  // The Sword is now owned in later fights (with enough energy).
  await page.goto('/?scene=battle&encounter=gen-004&seed=1&energy=10&freeze=1');
  await heroTurn(page);
  expect((await battle(page)).available).toEqual(['attack', 'sword']);

  // Winning it again does not bring the angel back.
  await page.goto('/?scene=battle&encounter=gen-003&seed=1&autoAnswer=correct&fast=1');
  await waitFor(page, "s.battle && s.battle.result === 'VICTORY' && !!s.targets.primary", 60_000);
  expect((await state(page)).sounds.filter((x) => x === 'ultimate')).toHaveLength(0);
});

test('tapping Receive takes the gift', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?scene=battle&encounter=gen-003&seed=2&fast=1');
  // Win by tapping right answers.
  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline) {
    const s = await state(page);
    if (s.battle?.gift || s.battle?.result) break;
    if (!s.busy && s.battle?.phase === 'HERO_CHOOSE' && s.targets['action:attack']) {
      await tap(page, 'action:attack');
      await waitFor(page, '(s.battle.question && !!s.targets["answer:0"]) || !!s.battle.gift');
      const q = (await battle(page)).question;
      if (q) await tap(page, `answer:${q.answerIndex}`);
    }
    await page.waitForTimeout(150);
  }
  await waitFor(page, "s.battle.gift === 'sword' && !!s.targets['gift-continue']", 30_000);
  await tap(page, 'gift-continue');
  await waitFor(page, "s.battle.gift === null && s.battle.result === 'VICTORY'", 30_000);
  expect((await state(page)).sounds).toContain('poweredUp');
});

test('the map card shows which armor a passage awards', async ({ page }) => {
  await page.goto('/?scene=map&unlockAll=1&fast=1');
  await waitFor(page, "s.scene === 'map' && !s.mapRevealing && !!s.targets['stage:gen-010']");
  await tap(page, 'stage:gen-010');
  await waitFor(page, "s.mapCard === 'gen-010'");
  await snap(page, test.info().outputPath('map-card-reward.png'));
});
