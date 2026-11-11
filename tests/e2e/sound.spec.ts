import { expect, test } from '@playwright/test';
import { battle, heroTurn, state, tap, waitFor } from './helpers';

test.describe.configure({ timeout: 90_000 });

test('sound board plays every effect without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scene=sounds');
  await waitFor(page, "s.scene === 'sounds' && !!s.targets['sound:victory']");
  const names = Object.keys((await state(page)).targets).map((k) => k.replace('sound:', ''));
  for (const name of names) await tap(page, `sound:${name}`);
  expect((await state(page)).sounds).toEqual(names);
  expect(errors).toEqual([]);
});

test('a right answer chimes, swings and clangs; a wrong answer is soft and punches', async ({
  page,
}) => {
  await page.goto('/?scene=battle&encounter=gen-001&seed=3&specials=&fast=1');
  await heroTurn(page);
  await tap(page, 'action:attack');
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');
  let q = (await battle(page)).question!;
  await tap(page, `answer:${q.answerIndex}`);
  await heroTurn(page);
  let sounds = (await state(page)).sounds;
  for (const cue of ['wave', 'uiTap', 'poweredUp', 'swing', 'swordHit', 'foeAttack', 'hurt']) {
    expect(sounds, cue).toContain(cue);
  }
  expect(sounds.indexOf('swing')).toBeLessThan(sounds.indexOf('swordHit'));

  await tap(page, 'action:attack');
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');
  q = (await battle(page)).question!;
  await tap(page, `answer:${(q.answerIndex + 1) % q.choices}`);
  await waitFor(page, '!!s.targets["continue"]');
  await tap(page, 'continue');
  await heroTurn(page);
  sounds = (await state(page)).sounds;
  expect(sounds).toContain('wrong');
  expect(sounds).toContain('swingLight');
  expect(sounds).toContain('punch');
});

test('win and loss play their own cues', async ({ page }) => {
  await page.goto(
    '/?scene=battle&encounter=gen-001&seed=1&autoAnswer=correct&fast=1&specials=sword',
  );
  await waitFor(page, "s.battle && s.battle.result === 'VICTORY' && !!s.targets.primary", 60_000);
  let sounds = (await state(page)).sounds;
  expect(sounds).toContain('slam');
  expect(sounds).toContain('foeDefeat');
  expect(sounds[sounds.length - 1]).toBe('victory');

  await page.goto('/?scene=battle&encounter=gen-001&seed=1&autoAnswer=wrong&fast=1&specials=');
  await waitFor(page, "s.battle && s.battle.result === 'DEFEAT' && !!s.targets.primary", 60_000);
  sounds = (await state(page)).sounds;
  expect(sounds[sounds.length - 1]).toBe('defeat');
});

test('orbs sparkle when they appear and chime when collected', async ({ page }) => {
  await page.goto('/?scene=scripture&seed=1&fast=1&autoCollect=1');
  await waitFor(page, "s.scene === 'battle'");
  const sounds = (await state(page)).sounds;
  expect(sounds).toContain('orbSpawn');
  expect(sounds).toContain('orbCollect');
});
