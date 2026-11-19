import { expect, test } from '@playwright/test';
import type { ScriptureTestState } from '../../src/services/testHooks';
import { battle, heroTurn, snap, state, tap, tapIfPresent, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

const scripture = async (page: Parameters<typeof state>[0]) =>
  (await state(page)).scripture as ScriptureTestState;

test('tapping an energy orb during the reading carries energy into the fight', async ({ page }) => {
  // Real-time reading plus a fight; software rendering in the slower browser profile needs headroom.
  test.setTimeout(150_000);
  await page.goto('/?scene=scripture&seed=1&narration=off');
  await waitFor(page, "s.scene === 'scripture' && !!s.scripture");
  const s0 = await scripture(page);
  expect(s0.canSkip).toBe(false); // first time hearing this verse
  expect(s0.orbs.map((o) => o.id)).toEqual(['orb-0', 'orb-1', 'orb-2']);
  expect(s0.energy).toBe(0);

  // Like a real player: tap an orb as it drifts up. If the busy test machine misses every orb,
  // press Replay (missed orbs come back) and try again.
  for (let reading = 0; reading < 3; reading++) {
    await waitFor(
      page,
      "s.scripture && (s.scripture.energy > 0 || s.scripture.finishing || Object.keys(s.targets).some((k) => k.startsWith('orb:')))",
      45_000,
    );
    if (reading === 0) await snap(page, test.info().outputPath('reading-orb.png'));
    while (true) {
      const st = await state(page);
      const s = st.scripture;
      if (!s || s.energy > 0 || s.finishing) break;
      const key = Object.keys(st.targets).find((k) => k.startsWith('orb:'));
      if (!key) break;
      await tapIfPresent(page, key);
      await page.waitForTimeout(150);
    }
    const s = (await state(page)).scripture;
    if (!s || s.energy > 0 || s.finishing) break;
    await tapIfPresent(page, 'replay');
  }
  await waitFor(page, 's.scene === "battle" || (s.scripture && s.scripture.energy > 0)', 45_000);

  await waitFor(page, "s.scene === 'battle' && !!s.battle", 60_000);
  await heroTurn(page);
  expect((await battle(page)).energy).toBeGreaterThan(0);
});

test('every verse of the passage is read before the battle starts', async ({ page }) => {
  // Genesis 3:1–6: the longest passage, six verses.
  await page.goto('/?scene=scripture&encounter=gen-005&seed=1&fast=1');
  await waitFor(page, "s.scripture && s.scripture.encounter === 'gen-005'");
  const s0 = await scripture(page);
  expect(s0.verseRefs).toHaveLength(6);
  expect(s0.spokenRefs.length).toBeLessThan(6);
  // The first word starts in the middle of the screen, where the spoken word stays.
  expect(Math.abs(s0.tickerX - (await state(page)).gameWidth / 2)).toBeLessThan(60);

  // The moment the hero heads into the fight, the whole passage has been read, in order.
  await waitFor(page, 's.scripture && s.scripture.finishing', 60_000);
  const s = await scripture(page);
  expect(s.narrationDone).toBe(true);
  expect(s.spokenRefs).toEqual(s.verseRefs);
  // The last word ends in the middle: no leftover text has to rush across after the voice stops.
  expect(Math.abs(s.tickerX + s.tickerWidth - (await state(page)).gameWidth / 2)).toBeLessThan(5);
  await waitFor(page, "s.scene === 'battle' && !!s.battle");
});

test('missing every orb means no energy in the fight', async ({ page }) => {
  await page.goto('/?scene=scripture&seed=1&fast=1');
  await waitFor(page, "s.scripture && s.scripture.orbs.every((o) => o.status === 'missed')");
  await waitFor(page, "s.scene === 'battle' && !!s.battle");
  await heroTurn(page);
  expect((await battle(page)).energy).toBe(0);
});

test('auto-collect setting collects every orb without a tap', async ({ page }) => {
  await page.goto('/?scene=scripture&seed=1&fast=1&autoCollect=1');
  await waitFor(page, "s.scene === 'battle' && !!s.battle");
  await heroTurn(page);
  expect((await battle(page)).energy).toBe(3); // Genesis 1:1–2 has 3 orbs
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
  await waitFor(
    page,
    "s.scene === 'map' && !s.mapRevealing && !!s.targets['stage:gen-001']",
    30_000,
  );
  await tap(page, 'stage:gen-001');
  await waitFor(page, '!!s.targets.begin');
  await tap(page, 'begin');
  await waitFor(
    page,
    "s.scene === 'scripture' && s.scripture && s.scripture.canSkip && !!s.targets.skip",
  );
  await tap(page, 'skip');
  await waitFor(page, "s.scene === 'battle' && !!s.battle");
  expect((await battle(page)).energy).toBe(0); // skipped orbs are forfeited
});

test('defeat offers Read again, which returns to the verse', async ({ page }) => {
  await page.goto('/?scene=battle&seed=1&fast=1&autoAnswer=wrong&specials=');
  await waitFor(page, "s.battle && s.battle.result === 'DEFEAT' && !!s.targets.secondary", 60_000);
  await tap(page, 'secondary');
  await waitFor(page, "s.scene === 'scripture' && !!s.scripture");
});
