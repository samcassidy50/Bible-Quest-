import { expect, test } from '@playwright/test';
import { snap, state, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

/** Every environment and a passage set in it (flood twice: storm and clearing), in viewer order. */
const ENVIRONMENTS: [string, string][] = [
  ['deep', 'gen-001'],
  ['light', 'gen-003'],
  ['shore', 'gen-002'],
  ['wilds', 'gen-004'],
  ['garden', 'gen-007'],
  ['grove', 'gen-009'],
  ['wilderness', 'gen-011'],
  ['fields', 'gen-026'],
  ['shipyard', 'gen-019'],
  ['flood-storm', 'gen-022'],
  ['flood-clearing', 'gen-024'],
  ['babel', 'gen-031'],
  ['sodom', 'gen-052'],
  ['plain', 'gen-053'],
  ['brimstone', 'gen-054'],
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
  sodom: ['sky', 'far', 'mid', 'ground', 'landmark'],
  canaan: ['sky', 'far', 'mid', 'ground', 'landmark'],
  dothan: ['sky', 'far', 'mid', 'ground', 'landmark'],
  caravan: ['sky', 'far', 'mid', 'ground', 'landmark'],
  estate: ['sky', 'far', 'mid', 'ground', 'landmark'],
  palace: ['sky', 'far', 'mid', 'ground', 'landmark'],
  granary: ['sky', 'far', 'mid', 'ground', 'landmark'],
  goshen: ['sky', 'far', 'mid', 'ground', 'landmark'],
};

test('backdrop viewer shows every environment with no text, tap for the next', async ({ page }) => {
  await page.goto('/?scene=backdrops&freeze=1');
  // Environments with no passage yet (Joseph in Egypt) come last in the viewer.
  for (const name of [
    ...ENVIRONMENTS.map(([n]) => n),
    'canaan',
    'dothan',
    'caravan',
    'estate',
    'prison',
    'nile',
    'palace',
    'granary',
    'goshen',
  ]) {
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
