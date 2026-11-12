import { expect, test } from '@playwright/test';
import { battle, heroTurn, playTurn, snap, state, tap, waitFor } from './helpers';

const ALL = 'sword,shield,breastplate,sandals';

// Whole fights take a while, even with ?fast=1.
test.describe.configure({ timeout: 90_000 });

test('auto-play with correct answers wins all three waves', async ({ page }) => {
  await page.goto('/?scene=battle&seed=1&autoAnswer=correct&fast=1');
  await waitFor(page, "s.battle && s.battle.result === 'VICTORY' && !!s.targets.primary", 60_000);
  const b = await battle(page);
  expect(b.wave).toBe(2);
  expect(b.foeHp).toBe(0);
  expect(b.correct).toBe(b.asked);
  await snap(page, test.info().outputPath('victory.png'));
});

test('auto-play with wrong answers loses, and Retry restarts the fight', async ({ page }) => {
  await page.goto('/?scene=battle&seed=1&autoAnswer=wrong&fast=1&specials=');
  await waitFor(page, "s.battle && s.battle.result === 'DEFEAT' && !!s.targets.primary", 60_000);
  expect((await battle(page)).heroHp).toBe(0);
  await snap(page, test.info().outputPath('defeat.png'));

  await tap(page, 'primary');
  await waitFor(page, 's.battle.result === null && s.battle.heroHp === 100 && s.battle.wave === 0');
});

test('tapping through a fight: question card, specials and the ultimate', async ({ page }) => {
  await page.goto(`/?scene=battle&seed=3&specials=${ALL}&faith=5&energy=10&freeze=1&fast=1`);
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
  expect(b.energy).toBe(7); // Sword costs 3 energy

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
  expect(b.energy).toBe(5); // Shield costs 2, even with a wrong answer
  expect(b.faith).toBe(1); // wrong answers don't drain faith
});

test('one tap on a special opens exactly one question and nothing else happens', async ({
  page,
}) => {
  await page.goto('/?scene=battle&seed=4&specials=sword&energy=10&freeze=1');
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

test('specials not yet earned are hidden from the action bar', async ({ page }) => {
  await page.goto('/?scene=battle&seed=2&specials=sword&energy=10&freeze=1');
  await heroTurn(page);
  expect((await battle(page)).available).toEqual(['attack', 'sword']);
  const targets = Object.keys((await state(page)).targets);
  expect(targets).toContain('action:sword');
  for (const hidden of ['shield', 'breastplate', 'sandals']) {
    expect(targets).not.toContain(`action:${hidden}`);
  }
  const b = await battle(page);
  expect(b.question).toBeNull();
  expect(b.phase).toBe('HERO_CHOOSE');
});

test('title → passage select → chosen passage', async ({ page }) => {
  await page.goto('/?seed=1&narration=off&unlockAll=1');
  await waitFor(page, "s.ready && s.scene === 'title'");
  const box = (await page.locator('#game canvas').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await waitFor(page, "s.scene === 'map' && !s.mapRevealing && !!s.targets['stage:gen-011']");
  await snap(page, test.info().outputPath('map.png'));
  await tap(page, 'stage:gen-011'); // ?unlockAll centres the map on the last location
  await waitFor(page, '!!s.targets.begin');
  await tap(page, 'begin');
  await waitFor(page, "s.scene === 'scripture' && !!s.scripture");
  expect((await state(page)).scripture!.encounter).toBe('gen-011');
  expect((await state(page)).scripture!.orbs).toHaveLength(5);
});

test('victory → Next passage goes to the next reading', async ({ page }) => {
  await page.goto('/?scene=battle&encounter=gen-001&seed=1&autoAnswer=correct&fast=1');
  await waitFor(page, "s.battle && s.battle.result === 'VICTORY' && !!s.targets.primary", 60_000);
  await tap(page, 'primary');
  await waitFor(page, "s.scene === 'scripture' && !!s.scripture");
  expect((await state(page)).scripture!.encounter).toBe('gen-002');
});

test('answer choices are shuffled, not always first', async ({ page }) => {
  const positions = new Set<number>();
  for (const seed of [1, 2, 3, 4, 5]) {
    await page.goto(`/?scene=battle&encounter=gen-004&seed=${seed}&freeze=1&fast=1`);
    await heroTurn(page);
    await tap(page, 'action:attack');
    await waitFor(page, 's.battle.question && s.targets["answer:0"]');
    const q = (await battle(page)).question!;
    if (q.choices === 4) positions.add(q.answerIndex);
  }
  expect(positions.size).toBeGreaterThan(1);
});

test('sprite foes play their attack, hurt and death frames', async ({ page }) => {
  const foes = [
    ['gen-003', 'slime-lava'],
    ['gen-004', 'thorn-plant'],
    ['gen-007', 'shadow-wolf'],
    ['gen-011', 'fire-spirit'],
  ] as const;
  for (const [encounter, sprite] of foes) {
    await page.goto(`/?scene=battle&encounter=${encounter}&seed=1&specials=&freeze=1`);
    await heroTurn(page);
    expect((await battle(page)).foeSprite).toBe(sprite);
    await snap(page, test.info().outputPath(`${sprite}.png`));
  }

  // The Babel boss is the third wave.
  await page.goto('/?scene=battle&encounter=gen-011&seed=1&autoAnswer=correct&fast=1');
  await waitFor(
    page,
    "s.battle && s.battle.wave === 2 && s.battle.foeSprite === 'minotaur' && !s.busy",
    60_000,
  );
  await snap(page, test.info().outputPath('minotaur.png'));

  await page.goto('/?scene=battle&encounter=gen-001&seed=1&autoAnswer=correct&fast=1');
  await waitFor(page, "s.battle && s.battle.foeSprite === 'slime-blue'");
  await waitFor(page, "s.battle.foeAnims.includes('hurt') && s.battle.foeAnims.includes('attack')");
  await waitFor(page, "s.battle.result === 'VICTORY' && !!s.targets.primary", 60_000);
  expect((await battle(page)).foeAnims).toContain('death');
});

test('?oneShot=1 wins each wave in one hit, and the health bar empties before the next foe', async ({
  page,
}) => {
  await page.goto('/?scene=battle&encounter=gen-004&seed=1&oneShot=1&autoAnswer=wrong');
  // The engine is already on wave 2 while the first foe dies: its bar must read 0, not 50/50.
  await waitFor(page, 's.battle && s.battle.wave === 1 && s.battle.foeBarHp === 0');
  await waitFor(page, "s.battle.result === 'VICTORY'", 60_000);
  expect((await battle(page)).asked).toBe(3);
});
