import { expect, test } from '@playwright/test';
import { battle, heroTurn, snap, state, tap, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

const CLIPS = [
  'idle',
  'run',
  'punch',
  'slash',
  'slashPowered',
  'hurt',
  'die',
  'victory',
  'block',
  'cast',
];

test('animation viewer renders every hero clip as a contact sheet', async ({ page }) => {
  for (const clip of CLIPS) {
    await page.goto(`/?scene=rig&clip=${clip}`);
    await waitFor(page, "s.scene === 'rig'");
    await snap(page, test.info().outputPath(`${clip}.png`));
  }
});

test('animation viewer plays a clip when tapped', async ({ page }) => {
  await page.goto('/?scene=rig');
  await waitFor(page, "s.scene === 'rig' && !!s.targets['clip:slash']");
  await tap(page, 'clip:slash');
  await page.waitForTimeout(250);
  await snap(page, test.info().outputPath('viewer.png'));
  expect((await state(page)).scene).toBe('rig');
});

test('right answer swings the sword, wrong answer punches, getting hit flinches', async ({
  page,
}) => {
  await page.goto('/?scene=battle&encounter=gen-001&seed=3&specials=&fast=1');
  await heroTurn(page);
  await tap(page, 'action:attack');
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');
  let q = (await battle(page)).question!;
  await tap(page, `answer:${q.answerIndex}`);
  await heroTurn(page);
  let anims = (await battle(page)).heroAnims;
  expect(anims).toContain('slash');
  expect(anims).not.toContain('punch');
  expect(anims).toContain('hurt');

  await tap(page, 'action:attack');
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');
  q = (await battle(page)).question!;
  await tap(page, `answer:${(q.answerIndex + 1) % q.choices}`);
  await waitFor(page, '!!s.targets["continue"]');
  await tap(page, 'continue');
  await heroTurn(page);
  anims = (await battle(page)).heroAnims;
  expect(anims).toContain('punch');
});

test('powered Sword special slams, the hero celebrates a win and falls on a loss', async ({
  page,
}) => {
  await page.goto(
    '/?scene=battle&encounter=gen-001&seed=1&autoAnswer=correct&fast=1&specials=sword',
  );
  await waitFor(page, "s.battle && s.battle.result === 'VICTORY' && !!s.targets.primary", 60_000);
  let anims = (await battle(page)).heroAnims;
  expect(anims).toContain('slashPowered');
  expect(anims[anims.length - 1]).toBe('victory');
  await snap(page, test.info().outputPath('victory.png'));

  await page.goto('/?scene=battle&encounter=gen-001&seed=1&autoAnswer=wrong&fast=1&specials=');
  await waitFor(page, "s.battle && s.battle.result === 'DEFEAT' && !!s.targets.primary", 60_000);
  anims = (await battle(page)).heroAnims;
  expect(anims[anims.length - 1]).toBe('die');
  await snap(page, test.info().outputPath('defeat.png'));
});
