import { expect, test } from '@playwright/test';
import type { ScriptureTestState } from '../../src/services/testHooks';
import { battle, heroTurn, snap, state, tap, tapIfPresent, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

const scripture = async (page: Parameters<typeof state>[0]) =>
  (await state(page)).scripture as ScriptureTestState;

test('tapping the orb during the reading unlocks Sword for the fight', async ({ page }) => {
  await page.goto('/?scene=scripture&seed=1&narration=off');
  await waitFor(page, "s.scene === 'scripture' && !!s.scripture");
  const s0 = await scripture(page);
  expect(s0.canSkip).toBe(false); // first time hearing this verse
  expect(s0.orbs).toEqual([{ special: 'sword', status: 'pending', atMs: expect.any(Number) }]);

  // Like a real player: tap the orb as it drifts up; if it fades before the tap lands (a busy
  // test machine can be slow), press Replay — missed orbs come back — and try again.
  for (let reading = 0; reading < 3; reading++) {
    await waitFor(
      page,
      "s.scripture && (s.scripture.collected.includes('sword') || (s.scripture.orbs[0].status === 'active' && !!s.targets['orb:sword']))",
      45_000,
    );
    if (reading === 0) await snap(page, test.info().outputPath('reading-orb.png'));
    while (true) {
      const s = (await state(page)).scripture;
      if (!s || s.collected.includes('sword') || s.orbs[0]!.status !== 'active') break;
      await tapIfPresent(page, 'orb:sword');
      await page.waitForTimeout(150);
    }
    const s = (await state(page)).scripture;
    if (s?.collected.includes('sword')) break;
    if (s && !s.finishing) await tapIfPresent(page, 'replay');
  }
  await waitFor(page, "s.scripture && s.scripture.collected.includes('sword')", 45_000);

  await waitFor(page, "s.scene === 'battle' && !!s.battle", 60_000);
  await heroTurn(page);
  expect((await battle(page)).available).toEqual(['attack', 'sword']);
});

test('missing the orb means no specials in the fight', async ({ page }) => {
  await page.goto('/?scene=scripture&seed=1&fast=1');
  await waitFor(page, "s.scripture && s.scripture.orbs[0].status === 'missed'");
  await waitFor(page, "s.scene === 'battle' && !!s.battle");
  await heroTurn(page);
  expect((await battle(page)).available).toEqual(['attack']);
});

test('auto-collect setting collects orbs without a tap', async ({ page }) => {
  await page.goto('/?scene=scripture&seed=1&fast=1&autoCollect=1');
  await waitFor(page, "s.scene === 'battle' && !!s.battle");
  await heroTurn(page);
  expect((await battle(page)).available).toContain('sword');
});

test('Replay restarts the reading and brings back a missed orb', async ({ page }) => {
  await page.goto('/?scene=scripture&seed=1&narration=off');
  await waitFor(page, 's.scripture && s.scripture.elapsedMs > 1500');
  await tap(page, 'replay');
  await waitFor(page, 's.scripture.readings === 2');
  const s = await scripture(page);
  expect(s.elapsedMs).toBeLessThan(1500);
  expect(s.orbs[0]!.status).toBe('pending');
});

test('Full text panel opens and closes without stopping the reading', async ({ page }) => {
  await page.goto('/?scene=scripture&seed=1&narration=off&freeze=1');
  await waitFor(page, 's.scripture && !!s.targets.fulltext');
  await tap(page, 'fulltext');
  await waitFor(page, 's.scripture.fullTextOpen');
  const before = (await scripture(page)).elapsedMs;
  await page.waitForTimeout(600);
  expect((await scripture(page)).elapsedMs).toBeGreaterThan(before);
  await snap(page, test.info().outputPath('full-text.png'));
  await tap(page, 'fulltext');
  await waitFor(page, '!s.scripture.fullTextOpen');
});

test('Skip appears after the verse has been heard once, and forfeits orbs', async ({ page }) => {
  // First reading (fast, auto-win) marks the verse as heard; go back to it via Passages.
  await page.goto('/?scene=scripture&seed=1&fast=1&autoAnswer=correct');
  await waitFor(page, "s.battle && s.battle.result === 'VICTORY' && !!s.targets.secondary", 60_000);
  await tap(page, 'secondary');
  await waitFor(page, "s.scene === 'map' && !!s.targets['stage:gen-001']");
  await tap(page, 'stage:gen-001');
  await waitFor(
    page,
    "s.scene === 'scripture' && s.scripture && s.scripture.canSkip && !!s.targets.skip",
  );
  await tap(page, 'skip');
  await waitFor(page, "s.scene === 'battle' && !!s.battle");
  // Auto-play is still on from the first fight, so check the unlocked specials, not this turn's actions.
  expect((await battle(page)).unlocked).toEqual([]); // skipped orbs are forfeited
});

test('defeat offers Read again, which returns to the verse', async ({ page }) => {
  await page.goto('/?scene=battle&seed=1&fast=1&autoAnswer=wrong&specials=');
  await waitFor(page, "s.battle && s.battle.result === 'DEFEAT' && !!s.targets.secondary", 60_000);
  await tap(page, 'secondary');
  await waitFor(page, "s.scene === 'scripture' && !!s.scripture");
});
