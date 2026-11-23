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

test('a fight is over within one passage’s questions, and asked questions are saved', async ({
  page,
}) => {
  await page.goto('/?scene=battle&seed=2&autoAnswer=correct&fast=1');
  await waitFor(page, "s.battle && s.battle.result === 'VICTORY'", 60_000);
  const b = await battle(page);
  const asked = (await state(page)).save!.asked;
  // gen-001 has 6 questions; a perfect fight needs fewer, so none repeats.
  expect(b.asked).toBeLessThanOrEqual(5);
  expect(asked).toHaveLength(b.asked);
  expect(new Set(asked).size).toBe(asked.length);
  expect(asked.every((id) => id.startsWith('gen-001-'))).toBe(true);
});

test('a fallen hero prays in the light, rises at full life and returns to the map', async ({
  page,
}) => {
  await page.goto('/?scene=battle&seed=1&autoAnswer=wrong&fast=1&specials=');
  await waitFor(page, 's.revive && s.revive.ready', 60_000);
  let b = await battle(page);
  expect(b.result).toBe('DEFEAT');
  expect(b.heroHp).toBe(0);
  await snap(page, test.info().outputPath('prayer.png'));

  await waitFor(page, 's.revive && s.revive.revived', 30_000);
  b = await battle(page);
  expect(b.heroHp).toBe(b.heroMaxHp);
  expect(b.heroAnims[b.heroAnims.length - 1]).toBe('victory');
  const s = await state(page);
  expect(s.revive!.prayed).toBe(s.revive!.phrases);
  await snap(page, test.info().outputPath('revived.png'));

  await waitFor(page, "s.scene === 'map' && s.revive === null", 30_000);
  expect((await state(page)).save!.completed).not.toHaveProperty('gen-001');
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

test('title → choose hero → passage select → chosen passage', async ({ page }) => {
  await page.goto('/?seed=1&narration=off&unlockAll=1');
  await waitFor(page, "s.ready && s.scene === 'title'");
  const box = (await page.locator('#game canvas').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  // A new player picks a hero first.
  await waitFor(page, "s.scene === 'heroSelect' && !!s.targets['hero:boy']");
  await tap(page, 'hero:boy');
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
  test.setTimeout(120_000); // two auto-played fights, with foes walking up to attack
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
  // Foes walk up to the hero, attack there, then walk back to their spot.
  await waitFor(page, "s.battle.foeAnims.join(' ').includes('move attack move')");
  await waitFor(page, "s.battle.result === 'VICTORY' && !!s.targets.primary", 60_000);
  expect((await battle(page)).foeAnims).toContain('death');
});

test('painted foes open the serpent, storm and flood passages', async ({ page }) => {
  const foes = [
    ['gen-005', 'hissling'],
    ['gen-008', 'gust'],
    ['gen-009', 'wave'],
    ['gen-010', 'squall'],
  ] as const;
  for (const [encounter, sprite] of foes) {
    await page.goto(`/?scene=battle&encounter=${encounter}&seed=1&specials=&freeze=1`);
    await heroTurn(page);
    expect((await battle(page)).foeSprite).toBe(sprite);
    await snap(page, test.info().outputPath(`${sprite}.png`));
  }
});

test('painted bosses arrive on the last wave and play their defeat frames', async ({ page }) => {
  test.setTimeout(120_000);
  const bosses = [
    ['gen-005', 'serpent'],
    ['gen-008', 'storm-cloud'],
    ['gen-009', 'flood-surge'],
    ['gen-010', 'tempest'],
  ] as const;
  for (const [encounter, boss] of bosses) {
    await page.goto(
      `/?scene=battle&encounter=${encounter}&seed=1&autoAnswer=correct&fast=1&oneShot=1`,
    );
    await waitFor(page, `s.battle && s.battle.wave === 2 && s.battle.foeSprite === '${boss}'`);
    if (encounter === 'gen-005') await snap(page, test.info().outputPath(`${boss}.png`));
    await waitFor(page, "s.battle.result === 'VICTORY' && !!s.targets.primary", 60_000);
    expect((await battle(page)).foeAnims).toContain('death');
  }
});

test('foe gallery shows every passage with sprite art for all of its foes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?scene=foes&freeze=1');
  for (let n = 1; n <= 11; n++) {
    const id = `gen-${String(n).padStart(3, '0')}`;
    await waitFor(page, `s.scene === 'foes' && s.foeGallery && s.foeGallery.encounter === '${id}'`);
    const foes = (await state(page)).foeGallery!.foes;
    expect(foes, `${id} foes`).toHaveLength(3);
    expect(
      foes.every((sprite) => !!sprite),
      `${id} sprites`,
    ).toBe(true);
    await snap(page, test.info().outputPath(`foes-${id}.png`));
    const box = (await page.locator('#game canvas').boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  await waitFor(page, "s.foeGallery.encounter === 'gen-001'"); // wraps around
  expect(errors).toEqual([]);
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

test('a pair wave: two foes on the field, and the back one steps up when the front falls', async ({
  page,
}) => {
  await page.goto('/?scene=battle&encounter=gen-009&seed=1&oneShot=1&fast=1');
  const hit = async () => {
    await heroTurn(page);
    await tap(page, 'action:attack');
    await waitFor(page, '!!s.targets["answer:0"]');
    await tap(page, `answer:${(await battle(page)).question!.answerIndex}`);
  };
  await hit(); // wave 1 falls in one hit
  await waitFor(page, "s.battle.wave === 1 && s.battle.backFoeId === 'wave-2b'", 30_000);
  await heroTurn(page);
  await snap(page, test.info().outputPath('pair.png'));
  expect((await battle(page)).foeId).toBe('wave-2a');

  await hit(); // the front wave falls; the back one steps up and the wave goes on
  await waitFor(page, "s.battle.foeId === 'wave-2b' && s.battle.backFoeId === null", 30_000);
  expect((await battle(page)).wave).toBe(1);
  await hit();
  await waitFor(page, "s.battle.wave === 2 && s.battle.foeId === 'surge'", 30_000);
});

test('tapping the back foe of a pair targets it, and the hit lands there', async ({ page }) => {
  await page.goto('/?scene=battle&encounter=gen-009&seed=1&oneShot=1&fast=1');
  const hit = async () => {
    await heroTurn(page);
    await tap(page, 'action:attack');
    await waitFor(page, '!!s.targets["answer:0"]');
    await tap(page, `answer:${(await battle(page)).question!.answerIndex}`);
  };
  await hit(); // wave 1
  await waitFor(page, "s.battle.backFoeId === 'wave-2b' && !!s.targets['foe:back']", 30_000);
  await heroTurn(page);
  expect((await battle(page)).target).toBe('front');
  await tap(page, 'foe:back');
  await waitFor(page, "s.battle.target === 'back'");
  await snap(page, test.info().outputPath('target-back.png'));

  await hit(); // the back foe falls; the front one is untouched and becomes the target again
  await waitFor(page, "s.battle.backFoeId === null && s.battle.foeId === 'wave-2a'", 30_000);
  const b = await battle(page);
  expect(b.foeHp).toBe(20);
  expect(b.target).toBe('front');
});

test('Leave asks first, Keep fighting resumes, Leave goes back to the map', async ({ page }) => {
  await page.goto('/?scene=battle&seed=1&freeze=1&fast=1');
  await heroTurn(page);
  await tap(page, 'leave');
  await waitFor(page, '!!s.targets["leave-confirm"]');
  await snap(page, test.info().outputPath('leave-confirm.png'));

  await tap(page, 'leave-stay');
  await waitFor(page, '!s.targets["leave-confirm"]');
  await tap(page, 'action:attack');
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');

  // Leaving mid-question works too.
  await tap(page, 'leave');
  await waitFor(page, '!!s.targets["leave-confirm"]');
  await tap(page, 'leave-confirm');
  await waitFor(page, "s.scene === 'map'");
});

test('a right answer drops the card and bursts POWER UP over the field', async ({ page }) => {
  await page.goto('/?scene=battle&seed=1&freeze=1');
  await heroTurn(page);
  await tap(page, 'action:attack');
  await waitFor(page, 's.battle.question && s.targets["answer:0"]');
  const q = (await battle(page)).question!;
  await tap(page, `answer:${q.answerIndex}`);
  await waitFor(page, 's.battle.powerUps === 1');
  await page.waitForTimeout(450);
  await snap(page, test.info().outputPath('power-up.png'));
  await heroTurn(page);
  expect((await battle(page)).powerUps).toBe(1);
});
