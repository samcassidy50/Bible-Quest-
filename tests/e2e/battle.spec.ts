import { expect, test } from '@playwright/test';
import { battle, heroTurn, playTurn, snap, state, tap, waitFor } from './helpers';

const ALL = 'sword,shield,breastplate,sandals';

// Whole fights take a while, even with ?fast=1.
test.describe.configure({ timeout: 90_000 });

test('auto-play with correct answers wins all three waves', async ({ page }) => {
  await page.goto('/?scene=battle&seed=1&autoAnswer=correct&fast=1');
  await waitFor(page, "s.battle && s.battle.result === 'VICTORY' && !!s.targets.retry", 60_000);
  const b = await battle(page);
  expect(b.wave).toBe(2);
  expect(b.foeHp).toBe(0);
  expect(b.correct).toBe(b.asked);
  await snap(page, test.info().outputPath('victory.png'));
});

test('auto-play with wrong answers loses, and Retry restarts the fight', async ({ page }) => {
  await page.goto('/?scene=battle&seed=1&autoAnswer=wrong&fast=1&specials=');
  await waitFor(page, "s.battle && s.battle.result === 'DEFEAT' && !!s.targets.retry", 60_000);
  expect((await battle(page)).heroHp).toBe(0);
  await snap(page, test.info().outputPath('defeat.png'));

  await tap(page, 'retry');
  await waitFor(page, 's.battle.result === null && s.battle.heroHp === 100 && s.battle.wave === 0');
});

test('tapping through a fight: question card, specials and the ultimate', async ({ page }) => {
  await page.goto(`/?scene=battle&seed=3&specials=${ALL}&faith=5&freeze=1&fast=1`);
  await heroTurn(page);
  let b = await battle(page);
  expect(b.available).toEqual(['attack', 'sword', 'shield', 'breastplate', 'sandals', 'ultimate']);
  await snap(page, test.info().outputPath('battle.png'));

  // Ultimate: no question, big hit, Faith resets.
  const foeHp = b.foeHp;
  await playTurn(page, 'ultimate');
  await heroTurn(page);
  b = await battle(page);
  expect(b.faith).toBe(0);
  expect(b.foeHp < foeHp || b.wave > 0).toBe(true);

  // Sword with a correct answer: question card appears first.
  await tap(page, 'action:sword');
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');
  await snap(page, test.info().outputPath('question.png'));
  const q = (await battle(page)).question!;
  await tap(page, `answer:${q.answerIndex}`);
  await waitFor(page, 's.battle.question === null');
  await heroTurn(page);
  b = await battle(page);
  expect(b.faith).toBe(1);
  expect(b.available).not.toContain('sword');

  // Shield with a wrong answer: shows the verse and Continue, still adds a block.
  await tap(page, 'action:shield');
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');
  const q2 = (await battle(page)).question!;
  await tap(page, `answer:${(q2.answerIndex + 1) % q2.choices}`);
  await waitFor(page, '!!s.targets["continue"]');
  await snap(page, test.info().outputPath('wrong-answer.png'));
  await tap(page, 'continue');
  await heroTurn(page);
  b = await battle(page);
  expect(b.available).not.toContain('shield');
  expect(b.faith).toBe(1); // wrong answers don't drain faith
});

test('one tap on a special opens exactly one question and nothing else happens', async ({
  page,
}) => {
  await page.goto('/?scene=battle&seed=4&specials=sword&freeze=1');
  await heroTurn(page);
  const before = await battle(page);
  await tap(page, 'action:sword');
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');
  await page.waitForTimeout(1500); // a stray second event would have answered by now
  const b = await battle(page);
  expect(b.phase).toBe('HERO_QUESTION');
  expect(b.feedback).toBeNull();
  expect(b.asked).toBe(1);
  expect(b.foeHp).toBe(before.foeHp);
  expect(b.faith).toBe(before.faith);
});

test('locked specials do nothing when tapped', async ({ page }) => {
  await page.goto('/?scene=battle&seed=2&specials=sword&freeze=1');
  await heroTurn(page);
  expect((await battle(page)).available).toEqual(['attack', 'sword']);
  await tap(page, 'action:shield');
  await page.waitForTimeout(400);
  const b = await battle(page);
  expect(b.question).toBeNull();
  expect(b.phase).toBe('HERO_CHOOSE');
});

test('title screen tap starts the battle', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitFor(page, "s.ready && s.scene === 'title'");
  const box = (await page.locator('#game canvas').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await waitFor(page, "s.scene === 'battle' && !!s.battle");
  expect((await state(page)).battle!.encounter).toBe('gen-001');
});
