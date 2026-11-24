import { expect, type Page } from '@playwright/test';
import type { BattleTestState, TestState } from '../../src/services/testHooks';

export const state = (page: Page) => page.evaluate(() => window.__TEST__ as TestState);
export const battle = async (page: Page) => (await state(page)).battle as BattleTestState;

/** Waits until a predicate over the test state is true. */
export async function waitFor(page: Page, fn: string, timeout = 20_000): Promise<void> {
  await page.waitForFunction(
    `(() => { const s = window.__TEST__; return !!s && (${fn}); })()`,
    null,
    {
      timeout,
    },
  );
}

/**
 * Taps a named target at its on-screen position. Uses real touch events (both test devices are
 * touch phones), so this exercises the same input path as a finger on iOS/Android.
 */
export async function tap(page: Page, key: string): Promise<void> {
  const s = await state(page);
  const t = s.targets[key];
  expect(t, `target "${key}" should exist`).toBeTruthy();
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('canvas not visible');
  await page.touchscreen.tap(
    box.x + (t!.x * box.width) / s.gameWidth,
    box.y + (t!.y * box.height) / s.gameHeight,
  );
}

/** Waits for the hero's turn (action bar enabled). */
export const heroTurn = (page: Page) =>
  waitFor(page, "!s.busy && s.battle && s.battle.phase === 'HERO_CHOOSE'");

/** Picks an action, answers its question (if any) right or wrong, and waits for the turn to end. */
export async function playTurn(page: Page, action: string, correct = true): Promise<void> {
  await heroTurn(page);
  await tap(page, `action:${action}`);
  if (action === 'ultimate') return;
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');
  const b = await battle(page);
  const q = b.question!;
  const index = correct ? q.answerIndex : (q.answerIndex + 1) % q.choices;
  await tap(page, `answer:${index}`);
  if (!correct) {
    await waitFor(page, '!!s.targets["continue"]');
    await tap(page, 'continue');
  }
  // A foe's fall can lead straight into the next reading, where there is no battle state.
  await waitFor(page, '!s.battle || s.battle.question === null');
}

/** Screenshot after the canvas has drawn the latest state (state updates land a frame early). */
export async function snap(page: Page, path: string): Promise<void> {
  await page.waitForTimeout(150);
  await page.screenshot({ path });
}

/** Taps a target only if it still exists (for things that move or disappear, like orbs). */
export async function tapIfPresent(page: Page, key: string): Promise<boolean> {
  const s = await state(page);
  const t = s.targets[key];
  if (!t) return false;
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) return false;
  await page.touchscreen.tap(
    box.x + (t.x * box.width) / s.gameWidth,
    box.y + (t.y * box.height) / s.gameHeight,
  );
  return true;
}
