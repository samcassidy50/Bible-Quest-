import { expect, test } from '@playwright/test';
import { snap, state, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

/** Every environment and the passage set in it (flood twice: storm and clearing), in story order. */
const ENVIRONMENTS: [string, string][] = [
  ['deep', 'gen-001'],
  ['light', 'gen-002'],
  ['shore', 'gen-003'],
  ['garden', 'gen-004'],
  ['grove', 'gen-005'],
  ['wilderness', 'gen-006'],
  ['fields', 'gen-007'],
  ['shipyard', 'gen-008'],
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

/** Painted pixel-art layers (scripts/art/paint_backdrops.py); the rest falls back to code. */
const PAINTED: Record<string, string[]> = {
  grove: ['sky', 'far', 'mid', 'ground', 'landmark'],
  fields: ['sky', 'far', 'mid', 'ground', 'landmark'],
  shipyard: ['sky', 'far', 'mid', 'ground', 'landmark'],
  'flood-storm': ['sky', 'far', 'mid', 'ground', 'landmark'],
  'flood-clearing': ['sky', 'far', 'mid', 'ground', 'landmark'],
  babel: ['sky', 'far', 'mid', 'ground', 'landmark'],
};

test('backdrop viewer shows every environment with no text, tap for the next', async ({ page }) => {
  await page.goto('/?scene=backdrops&freeze=1');
  for (const [name] of ENVIRONMENTS) {
    await waitFor(page, `s.scene === 'backdrops' && s.backdrop === '${name}'`);
    const painted = (await state(page)).backdropPainted;
    expect(painted, `${name} painted layers`).toEqual(
      PAINTED[name] ?? ['sky', 'far', 'mid', 'ground'],
    );
    await snap(page, test.info().outputPath(`clean-${name}.png`));
    const box = (await page.locator('#game canvas').boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  await waitFor(page, "s.backdrop === 'deep'"); // wraps around
});
