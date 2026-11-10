import { expect, test } from '@playwright/test';

import type {} from '../../src/services/testHooks'; // type-only: brings in window.__TEST__

test('game boots to the title scene in landscape', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?seed=42&freeze=1');
  await page.waitForFunction(() => window.__TEST__?.ready === true);

  const state = await page.evaluate(() => window.__TEST__);
  expect(state).toMatchObject({ scene: 'title', platform: 'web', seed: 42 });

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(box!.height);

  await page.screenshot({ path: test.info().outputPath('title.png') });
  expect(errors).toEqual([]);
});

test('unknown debug scene falls back to title', async ({ page }) => {
  await page.goto('/?scene=battle&seed=1');
  await page.waitForFunction(() => window.__TEST__?.ready === true);
  expect(await page.evaluate(() => window.__TEST__?.scene)).toBe('title');
});

test('game pauses when the page is hidden', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.waitForFunction(() => window.__TEST__?.ready === true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__TEST__?.paused)).toBe(true);
});
