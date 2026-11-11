import { expect, test } from '@playwright/test';
import { snap, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

/** One passage per environment (flood twice: storm and clearing). */
const ENVIRONMENTS: [string, string][] = [
  ['deep', 'gen-001'],
  ['light', 'gen-002'],
  ['garden', 'gen-004'],
  ['wilderness', 'gen-006'],
  ['flood-storm', 'gen-009'],
  ['flood-clearing', 'gen-010'],
  ['babel', 'gen-011'],
];

for (const [name, id] of ENVIRONMENTS) {
  test(`${name}: renders in the reading and the battle without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?scene=scripture&encounter=${id}&seed=1&fast=1&freeze=1`);
    await waitFor(page, "s.scene === 'scripture' && !!s.scripture && s.scripture.elapsedMs > 3000");
    await snap(page, test.info().outputPath(`${name}-reading.png`));
    await page.goto(`/?scene=battle&encounter=${id}&seed=1&freeze=1`);
    await waitFor(page, "s.scene === 'battle' && !!s.battle && !s.busy");
    await snap(page, test.info().outputPath(`${name}-battle.png`));
    expect(errors).toEqual([]);
  });
}

test('backdrop viewer shows every environment with no text, tap for the next', async ({ page }) => {
  await page.goto('/?scene=backdrops&freeze=1');
  for (const [name] of ENVIRONMENTS) {
    await waitFor(page, `s.scene === 'backdrops' && s.backdrop === '${name}'`);
    await snap(page, test.info().outputPath(`clean-${name}.png`));
    const box = (await page.locator('#game canvas').boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  await waitFor(page, "s.backdrop === 'deep'"); // wraps around
});
