import Phaser from 'phaser';
import { BattleEngine } from '../../core/battle/BattleEngine';
import { heroBuild, QUESTION_TIME_S, recordVictory } from '../../core/progress/progress';
import { progress } from '../../services/progress';
import { pickAction } from '../../core/battle/simulate';
import type {
  ActionId,
  EnemyTurnResult,
  HeroActionResult,
  SpecialId,
} from '../../core/battle/types';
import type { Encounter, EncounterFoe, Question } from '../../core/content/types';
import type { DebugParams } from '../../core/debugParams';
import { QuestionDeck } from '../../core/quiz/QuestionDeck';
import { createRng, type Rng } from '../../core/rng';
import { shuffleChoices } from '../../core/quiz/shuffleChoices';
import { ENCOUNTERS, getEncounter, nextEncounter } from '../../content';
import { ownedArmor } from '../../core/progress/progress';
import { readSafeAreaInsets, toGameInsets, type Insets } from '../../services/safeArea';
import { updateTestState } from '../../services/testHooks';
import { FONT_TITLE, FONT_UI, tweenAsync, wait } from '../util';
import { ActionBar } from './ActionBar';
import { ACTION_INFO, COLOR } from './actionInfo';
import { Fighter } from './Fighter';
import { HpBar } from './HpBar';
import { QuestionCard } from './QuestionCard';
import { ResultPanel } from './ResultPanel';
import { ArmorPage } from './ArmorPage';
import { pixelBox, UI } from '../ui/pixelUi';
import { quickTestOn } from '../quickTest';
import { Backdrop } from '../backdrop/Backdrop';
import { Angel, ANGEL_LINES } from '../angel/Angel';
import { itemSprite } from '../items';
import { EnergyCount } from '../icons';
import { Button } from '../ui/Button';
import { hapticTap } from '../../services/haptics';
import { sfx } from '../../services/sfx';
import type { SfxName } from '../../core/audio/sfxRecipes';
import type { HeroClipName } from '../../core/anim/heroClips';

/** The sound of each swing landing. */
type StrikeClip = Extract<HeroClipName, 'punch' | 'slash' | 'slashPowered'>;

const IMPACT_SOUND: Record<StrikeClip, SfxName> = {
  punch: 'punch',
  slash: 'swordHit',
  slashPowered: 'slam',
};

/** Which swing the hero uses for a damaging action. */
function strikeClip(action: ActionId, powered: boolean): StrikeClip {
  if (action === 'ultimate' || (action === 'sword' && powered)) return 'slashPowered';
  if (action === 'attack') return powered ? 'slash' : 'punch';
  if (action === 'sandals') return 'punch';
  return 'slash';
}

/**
 * Battle scene (docs/DESIGN.md §2.2). Renders and sequences only: every rule lives in
 * BattleEngine. Flow per hero turn: action bar → question card → animate → enemy turn.
 */
export class BattleScene extends Phaser.Scene {
  private debug!: DebugParams;
  private encounter!: Encounter;
  private engine!: BattleEngine;
  private deck!: QuestionDeck<Question>;
  private rng!: Rng;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  private backdrop!: Backdrop;
  private hero!: Fighter;
  private foe!: Fighter;
  private heroPanel!: Phaser.GameObjects.Container;
  private heroBar!: HpBar;
  private faithPips!: Phaser.GameObjects.Graphics;
  private energyText!: EnergyCount;
  private gift: string | null = null;
  private giftContinue?: Button;
  private armorPage?: ArmorPage;
  private foeBar!: HpBar;
  private wavePips!: Phaser.GameObjects.Graphics;
  private refText!: Phaser.GameObjects.Text;
  private actionBar!: ActionBar;
  private card?: QuestionCard;
  private result?: ResultPanel;

  private busy = true;
  private question: Question | null = null;
  private feedback: 'correct' | 'wrong' | null = null;
  private asked = 0;
  private correct = 0;

  constructor() {
    super('battle');
  }

  create(): void {
    // Scene instances are reused on restart, so reset all per-fight state here.
    this.gift = null;
    this.giftContinue = undefined;
    this.armorPage = undefined;
    this.card = undefined;
    this.result = undefined;
    this.busy = true;
    this.question = null;
    this.feedback = null;
    this.asked = 0;
    this.correct = 0;

    this.debug = this.registry.get('debug') as DebugParams;
    this.encounter = getEncounter(
      (this.registry.get('encounterId') as string | undefined) ?? this.debug.encounter,
    );
    const attempt = (this.registry.get('attempt') as number | undefined) ?? 0;
    const seed = ((this.registry.get('seed') as number) + attempt) >>> 0;
    const rng = createRng(seed);
    this.rng = rng;

    const timeScale = (this.registry.get('timeScale') as number | undefined) ?? 1;
    this.tweens.timeScale = timeScale;
    this.time.timeScale = timeScale;

    this.engine = new BattleEngine(
      {
        ...heroBuild(progress.save.upgrades),
        waves: this.encounter.waves,
        unlockedSpecials: this.armor().specials,
        ultimateUnlocked: this.armor().ultimate,
        startingEnergy:
          this.debug.energy ?? (this.registry.get('collectedEnergy') as number | undefined) ?? 0,
        startingFaith: this.debug.faith,
        oneShot: this.debug.oneShot || quickTestOn(),
      },
      rng,
    );
    this.deck = new QuestionDeck(this.encounter.questions, rng);

    this.buildScene();
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.events.on('card-continue-ready', () => this.sync());

    this.engine.start();
    updateTestState({ ready: true, scene: 'battle', scripture: null });
    void this.intro();
  }

  /**
   * Armor the hero owns: earned by winning passages along the map (each passage's `unlocks`).
   * `?specials=` overrides it for testing and also unlocks the ultimate.
   */
  private armor(): { specials: SpecialId[]; ultimate: boolean } {
    if (this.debug.specials) return { specials: this.debug.specials, ultimate: true };
    return ownedArmor(progress.save, ENCOUNTERS);
  }

  // ── Build & layout ─────────────────────────────────────────────────────────

  private buildScene(): void {
    this.backdrop = new Backdrop(
      this,
      this.encounter.setting,
      this.encounter.weather,
      this.debug.freeze,
    );
    this.hero = new Fighter(this, 0, 0, 'hero');
    this.foe = this.makeFoe(this.engine.foe as EncounterFoe);

    this.foeBar = new HpBar(
      this,
      0,
      0,
      240,
      COLOR.foeHp,
      this.engine.foe.name,
      this.engine.foe.maxHp,
    );

    this.heroPanel = this.add.container(0, 0);
    const panelBg = pixelBox(this, UI.button, 180, 58, 366, 117).setTint(0x3a3166);
    this.heroBar = new HpBar(this, 180, 44, 320, COLOR.heroHp, 'Hero', this.engine.heroMaxHp);
    const faithLabel = this.add
      .text(20, 76, 'Faith', {
        fontFamily: FONT_UI,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#f4c95d',
      })
      .setShadow(2, 2, '#000', 2);
    this.faithPips = this.add.graphics();
    this.energyText = new EnergyCount(this, 322, 88, 22, FONT_UI);
    this.heroPanel.add([panelBg, this.heroBar, faithLabel, this.faithPips, this.energyText]);

    this.wavePips = this.add.graphics();
    this.refText = this.add
      .text(0, 0, `📖 ${this.encounter.reference}`, {
        fontFamily: FONT_UI,
        fontSize: '22px',
        color: '#fdf6e3',
      })
      .setShadow(2, 2, '#000', 3);

    this.actionBar = new ActionBar(this, (a) => void this.onAction(a));

    this.hero.setFrozen(this.debug.freeze);
    if (!this.debug.freeze) this.foe.idle();
    this.drawFaith();
    this.drawWaves();
  }

  private makeFoe(spec: EncounterFoe): Fighter {
    return new Fighter(this, 0, 0, 'foe', spec.color, spec.size, spec.sprite);
  }

  /** Lowest y that stays clear of the wave pips and passage title along the top. */
  private static readonly HUD_CLEAR_Y = 120;

  /** The foe's health bar sits above its head, or under its feet when the foe is too tall for that. */
  private placeFoeBar(): void {
    const above = this.groundY - this.foe.figureHeight - 40;
    const y = above >= BattleScene.HUD_CLEAR_Y ? above : this.groundY + 62;
    this.foeBar.setPosition(this.foe.x, y);
  }

  /** Where numbers float up from over the foe, kept below the top HUD for tall foes. */
  private get foeTextY(): number {
    return Math.max(BattleScene.HUD_CLEAR_Y + 30, this.foe.y - this.foe.figureHeight - 70);
  }

  private get groundY(): number {
    return this.scale.gameSize.height * 0.7;
  }

  private layout(): void {
    const { width: W, height: H } = this.scale.gameSize;
    this.insets = toGameInsets(readSafeAreaInsets(), W, this.scale.displaySize.width);
    const ins = this.insets;

    this.backdrop.layout(W, H, this.groundY);
    this.hero.setPosition(ins.left + W * 0.22, this.groundY);
    this.foe.setPosition(W * 0.58, this.groundY);
    this.placeFoeBar();
    this.heroPanel.setPosition(ins.left + 24, H - ins.bottom - 136);
    this.refText.setPosition(ins.left + 24, ins.top + 20);
    this.actionBar.setPosition(W - ins.right - 116, H - ins.bottom - 104);
    this.card?.setPosition(W / 2, H / 2);
    this.result?.setPosition(W / 2, H / 2);
    this.drawWaves();
    this.sync();
  }

  /** Faith pips and the energy count in the hero panel. */
  private drawFaith(): void {
    this.energyText.setValue(this.engine.energy);
    const g = this.faithPips.clear();
    for (let i = 0; i < 5; i++) {
      const x = 100 + i * 44;
      g.fillStyle(0x000000, 0.5).fillCircle(x, 88, 15);
      g.fillStyle(i < this.engine.faith ? COLOR.faith : 0x3a3150).fillCircle(x, 88, 12);
    }
  }

  private drawWaves(): void {
    if (!this.wavePips) return;
    const { width: W } = this.scale.gameSize;
    const n = this.engine.waveCount;
    const g = this.wavePips.clear();
    const y = this.insets.top + 36;
    for (let i = 0; i < n; i++) {
      const x = W / 2 + (i - (n - 1) / 2) * 64;
      const done = i < this.engine.waveIndex || this.engine.phase === 'VICTORY';
      const current = i === this.engine.waveIndex && !done;
      g.fillStyle(0x000000, 0.5).fillCircle(x, y, 24);
      g.fillStyle(done ? 0x5c5470 : current ? 0xc0392b : 0x3a3150).fillCircle(x, y, 20);
      g.lineStyle(3, current ? COLOR.gold : 0x8e86a8).strokeCircle(x, y, 20);
      if (done)
        g.lineStyle(4, 0xffffff, 0.8)
          .lineBetween(x - 8, y, x - 2, y + 7)
          .lineBetween(x - 2, y + 7, x + 10, y - 8);
    }
  }

  // ── Turn flow ──────────────────────────────────────────────────────────────

  private async intro(): Promise<void> {
    sfx.play('wave');
    await this.banner(`Wave 1 · ${this.engine.foe.name}`);
    this.setBusy(false);
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.actionBar.refresh(this.engine, !busy && this.engine.phase === 'HERO_CHOOSE');
    this.sync();
    if (!busy && this.debug.autoAnswer && this.engine.phase === 'HERO_CHOOSE') {
      this.time.delayedCall(200, () => void this.onAction(pickAction(this.engine)));
    }
  }

  private async onAction(action: ActionId): Promise<void> {
    if (this.busy || !this.engine.availableActions().includes(action)) return;
    this.setBusy(true);

    const ultimate = this.engine.choose(action);
    if (ultimate) {
      await this.playHero(ultimate);
      await this.afterHero(ultimate);
      return;
    }

    const q = shuffleChoices(this.deck.draw(), this.rng);
    this.question = q;
    this.feedback = null;
    this.asked++;
    this.card = new QuestionCard(
      this,
      q,
      action,
      this.encounter.reference,
      (i) => void this.onAnswer(i),
    );
    await this.card.slideIn();
    if (progress.save.settings.timer && !this.debug.autoAnswer)
      this.card.startTimer(QUESTION_TIME_S * 1000);
    this.sync();

    if (this.debug.autoAnswer) {
      const wrong = (q.answerIndex + 1) % q.choices.length;
      this.time.delayedCall(250, () =>
        this.card?.choose(this.debug.autoAnswer === 'correct' ? q.answerIndex : wrong),
      );
    }
  }

  private async onAnswer(index: number): Promise<void> {
    const q = this.question;
    const card = this.card;
    if (!q || !card) return;
    const correct = index === q.answerIndex;
    sfx.play(correct ? 'poweredUp' : 'wrong');
    if (correct) this.correct++;
    this.feedback = correct ? 'correct' : 'wrong';
    this.sync();

    await card.showFeedback(index, Boolean(this.debug.autoAnswer));
    await card.slideOut();
    this.card = undefined;
    this.question = null;
    this.feedback = null;

    const result = this.engine.answer(correct);
    this.sync();
    await this.playHero(result);
    await this.afterHero(result);
  }

  private async afterHero(res: HeroActionResult): Promise<void> {
    if (res.victory) {
      await this.foeDefeated();
      this.drawWaves();
      await this.hero.act('victory');
      await this.showResult(true);
      return;
    }
    if (res.foeDefeated && res.nextWave !== null) {
      await this.foeDefeated();
      await this.spawnNextFoe();
      this.setBusy(false);
      return;
    }
    await wait(this, 300);
    const enemy = this.engine.enemyTurn();
    await this.playEnemy(enemy);
    if (enemy.defeat) {
      await this.hero.act('die');
      await this.showResult(false);
      return;
    }
    this.setBusy(false);
  }

  // ── Animations ─────────────────────────────────────────────────────────────

  private async playHero(res: HeroActionResult): Promise<void> {
    const info = ACTION_INFO[res.action];
    const powered = res.correct !== false;
    if (res.action === 'ultimate') {
      this.cameras.main.flash(400, 244, 201, 93);
      void this.hero.act('cast');
      sfx.play('ultimate');
      await this.banner(`${info.icon} ${info.name}! ${info.icon}`, '#f4c95d');
    } else if (res.action !== 'attack') {
      void this.banner(`${info.icon} ${info.name}`, powered ? '#f4c95d' : '#ffffff', 700);
    }

    if (res.action === 'breastplate') {
      sfx.play('heal');
      await this.hero.act('cast');
    }
    if (res.damage > 0) await this.heroStrike(res, powered);
    if (res.blocksAdded > 0) {
      sfx.play('shield');
      void this.hero.act('block');
      this.hero.setShield(this.engine.blocks);
      this.floatText(
        this.hero.x,
        this.hero.y - 230,
        `🛡️ Shield ×${res.blocksAdded}`,
        '#85c1e9',
        30,
      );
    }
    if (res.healed > 0) {
      this.floatText(this.hero.x, this.hero.y - 220, `+${res.healed}`, COLOR.heal, 44);
      this.heroBar.setValue(this.engine.heroHp);
    }
    if (res.stunned) {
      sfx.play('calm');
      this.foe.setStunned(true);
    }
    this.drawFaith();
    this.sync();
    await wait(this, 350);
  }

  /**
   * Hero runs up, swings, and the hit lands on the clip's "impact" frame, then runs back.
   * Wrong-answer attacks are a punch; right answers swing the sword (docs/DESIGN.md §2.2).
   */
  private async heroStrike(res: HeroActionResult, powered: boolean): Promise<void> {
    const ultimate = res.action === 'ultimate';
    const startX = this.hero.x;
    this.hero.run();
    await tweenAsync(this, {
      targets: this.hero,
      x: this.foe.x - this.foe.strikeDistance,
      duration: 260,
      ease: 'Quad.in',
    });

    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      this.foe.figure.setAlpha(0.4);
      this.time.delayedCall(90, () => this.foe.figure.setAlpha(1));
      void this.foe.foeAct('hurt');
      if (powered) {
        this.cameras.main.shake(ultimate ? 400 : 180, ultimate ? 0.02 : 0.008);
        void hapticTap(true);
      }
      this.floatText(
        this.foe.x,
        this.foeTextY,
        `${res.damage}`,
        powered ? COLOR.powered : COLOR.damage,
        ultimate ? 84 : powered ? 60 : 44,
      );
      // After a finishing blow the engine already holds the next foe, so its HP is not this one's.
      this.foeBar.setValue(res.foeDefeated ? 0 : this.engine.foeHp);
      this.sync();
      void tweenAsync(this, { targets: this.foe, x: this.foe.x + 24, duration: 70, yoyo: true });
    };
    const clip = strikeClip(res.action, powered);
    await this.hero.act(clip, (e) => {
      if (e === 'swing') sfx.play(clip === 'punch' ? 'swingLight' : 'swing', { vary: true });
      if (e === 'impact') {
        sfx.play(IMPACT_SOUND[clip], { vary: true });
        land();
      }
    });
    land(); // in case the clip had no impact event

    this.hero.face(-1);
    this.hero.run();
    await tweenAsync(this, { targets: this.hero, x: startX, duration: 300, ease: 'Quad.out' });
    this.hero.face(1);
    this.hero.idle();
  }

  private async playEnemy(res: EnemyTurnResult): Promise<void> {
    if (res.skippedStunned) {
      sfx.play('calm');
      this.floatText(this.foe.x, this.foeTextY, 'Calmed… skips its turn', '#d7c8ff', 28);
      this.foe.setStunned(false);
      this.sync();
      await wait(this, 700);
      return;
    }
    const startX = this.foe.x;
    sfx.play('foeAttack', { vary: true });
    void this.foe.foeAct('attack', 560); // spans the lunge and the return
    await tweenAsync(this, {
      targets: this.foe,
      x: this.hero.x + 170,
      duration: 260,
      ease: 'Quad.in',
    });
    if (res.blocked) {
      this.floatText(this.hero.x, this.hero.y - 230, 'Blocked!', '#85c1e9', 40);
      this.hero.setShield(this.engine.blocks);
      sfx.play('block');
      void this.hero.act('block');
    } else {
      sfx.play('hurt', { vary: true });
      void this.hero.act('hurt');
      this.cameras.main.shake(150, 0.006);
      this.floatText(this.hero.x, this.hero.y - 220, `-${res.damage}`, '#ff6b6b', 48);
      this.heroBar.setValue(this.engine.heroHp);
    }
    await tweenAsync(this, { targets: this.foe, x: startX, duration: 300, ease: 'Quad.out' });
    this.sync();
  }

  private async foeDefeated(): Promise<void> {
    sfx.play('foeDefeat');
    this.tweens.killTweensOf(this.foe.figure);
    if (this.foe.foeSprite) {
      // Sprite foes have their own defeat frames; just fade what is left.
      await this.foe.foeAct('death');
      await tweenAsync(this, { targets: this.foe, alpha: 0, duration: 200 });
      return;
    }
    await tweenAsync(this, { targets: this.foe, alpha: 0, y: this.foe.y - 40, duration: 450 });
  }

  private async spawnNextFoe(): Promise<void> {
    const spec = this.engine.foe as EncounterFoe;
    this.foe.destroy();
    this.foe = this.makeFoe(spec);
    this.foe.setPosition(this.scale.gameSize.width * 0.58, this.groundY).setAlpha(0);
    this.children.moveBelow(this.foe, this.foeBar);
    this.foeBar.reset(spec.name, spec.maxHp);
    this.placeFoeBar();
    if (!this.debug.freeze) this.foe.idle();
    this.drawWaves();
    sfx.play('wave');
    await this.banner(`Wave ${this.engine.waveIndex + 1} · ${spec.name}`);
    await tweenAsync(this, { targets: this.foe, alpha: 1, duration: 300 });
  }

  /**
   * The angel descends, presents newly earned armor with a short word, and the item flies to the
   * hero. Tap Continue (auto-continues under ?autoAnswer).
   */
  private async presentArmor(unlock: SpecialId | 'ultimate'): Promise<void> {
    const { width: W, height: H } = this.scale.gameSize;
    this.gift = unlock;
    sfx.play('ultimate');

    const dim = this.add
      .rectangle(0, 0, W, H, 0x05030d, 0)
      .setOrigin(0)
      .setDepth(150)
      .setInteractive();
    const beam = this.add.graphics().setDepth(151).setAlpha(0);
    beam.fillGradientStyle(0xfff6d0, 0xfff6d0, 0xfff6d0, 0xfff6d0, 0.55, 0.55, 0, 0);
    beam
      .fillTriangle(W * 0.5 - 70, 0, W * 0.5 + 70, 0, W * 0.5 + 230, H)
      .fillTriangle(W * 0.5 - 70, 0, W * 0.5 + 230, H, W * 0.5 - 230, H);
    const angel = new Angel(this, W * 0.5, -260, !this.debug.freeze).setDepth(152);
    // The angel holds the real item (pixel art, smaller than life) with a soft glow behind it.
    const glow = this.add.circle(0, 6, 46, 0xfff1b0, 0.45);
    const item = this.add.container(0, 4, [glow, itemSprite(this, unlock)]).setScale(0.55);
    angel.hands.add(item);
    if (!this.debug.freeze) {
      this.tweens.add({
        targets: glow,
        scale: 1.25,
        alpha: 0.15,
        duration: 700,
        yoyo: true,
        repeat: -1,
      });
    }

    await Promise.all([
      tweenAsync(this, { targets: dim, fillAlpha: 0.55, duration: 400 }),
      tweenAsync(this, { targets: beam, alpha: 1, duration: 500 }),
      tweenAsync(this, { targets: angel, y: H * 0.66, duration: 900, ease: 'Sine.out' }),
    ]);
    sfx.play('shield');

    // Speech bubble with the angel's word; the page after the gift explains the armor.
    const bw = Math.min(W - 80, 620);
    const line = this.add
      .text(0, 0, `“${ANGEL_LINES[unlock]}”`, {
        fontFamily: FONT_TITLE,
        fontSize: '26px',
        fontStyle: 'italic',
        color: COLOR.ink,
        align: 'center',
        wordWrap: { width: bw - 100, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    const bh = line.height + 64;
    const bubbleBg = pixelBox(this, UI.panel, 0, bh / 2 - 32, bw, bh);
    const bubble = this.add
      .container(W / 2, this.insets.top + 48, [bubbleBg, line])
      .setDepth(153)
      .setAlpha(0);
    await tweenAsync(this, { targets: bubble, alpha: 1, duration: 300 });

    await new Promise<void>((resolve) => {
      this.giftContinue = new Button(
        this,
        W - this.insets.right - 140,
        H - this.insets.bottom - 70,
        {
          width: 220,
          height: 80,
          radius: 40,
          label: 'Receive',
          fontSize: 28,
          fill: COLOR.correct,
          onTap: () => resolve(),
        },
      ).setDepth(154);
      this.sync();
      if (this.debug.autoAnswer) this.time.delayedCall(900, resolve);
    });
    this.giftContinue?.destroy();
    this.giftContinue = undefined;

    // The gift flies to the hero; the angel rises away.
    const m = item.getWorldTransformMatrix();
    angel.hands.remove(item);
    item.setPosition(m.tx, m.ty).setDepth(155);
    this.add.existing(item);
    sfx.play('poweredUp');
    void this.hero.act('cast');
    await tweenAsync(this, {
      targets: item,
      x: this.hero.x,
      y: this.hero.y - 120,
      scale: 0.2,
      duration: 600,
      ease: 'Cubic.in',
    });
    item.destroy();
    await Promise.all([
      tweenAsync(this, { targets: angel, y: -300, duration: 800, ease: 'Sine.in' }),
      tweenAsync(this, { targets: [bubble, beam], alpha: 0, duration: 500 }),
    ]);
    for (const o of [angel, bubble, beam]) o.destroy();

    // A page about the new armor, then back to the battle's end.
    const page = this.add.container(0, 0).setDepth(156).setAlpha(0);
    await new Promise<void>((resolve) => {
      this.armorPage = new ArmorPage(this, unlock, this.insets, () => resolve());
      page.add(this.armorPage);
      // Taps count only once the page has faded in (the Receive tap must not skip it).
      const button = this.armorPage.continueButton.setEnabled(false);
      void tweenAsync(this, { targets: page, alpha: 1, duration: 400 }).then(() =>
        button.setEnabled(true),
      );
      sfx.play('shield');
      this.sync();
      if (this.debug.autoAnswer) this.time.delayedCall(1500, resolve);
    });
    this.armorPage = undefined;
    await Promise.all([
      tweenAsync(this, { targets: page, alpha: 0, duration: 250 }),
      tweenAsync(this, { targets: dim, fillAlpha: 0, duration: 400 }),
    ]);
    for (const o of [page, dim]) o.destroy();
    this.gift = null;
    this.sync();
  }

  private async showResult(victory: boolean): Promise<void> {
    this.actionBar.refresh(this.engine, false);
    const retry = () => {
      // Same orbs, new rolls: the collected specials stay in the registry.
      this.registry.set('attempt', ((this.registry.get('attempt') as number | undefined) ?? 0) + 1);
      this.scene.restart();
    };
    const readAgain = () => this.scene.start('scripture');
    const next = nextEncounter(this.encounter.id);
    let stars: number | undefined;
    let newBest = false;
    const firstWin = victory && !(this.encounter.id in progress.save.completed);
    if (victory) {
      let result!: ReturnType<typeof recordVictory>;
      progress.update(
        (s) => (result = recordVictory(s, this.encounter.id, this.correct, this.asked)).save,
      );
      stars = result.stars;
      newBest = result.newBest;
    }
    const goNext = () => {
      if (!next) return readAgain();
      this.registry.set('encounterId', next.id);
      this.registry.remove('collectedEnergy');
      this.scene.start('scripture');
    };
    // First win of a passage that awards armor: the angel presents it.
    if (firstWin && this.encounter.unlocks) await this.presentArmor(this.encounter.unlocks);
    sfx.play(victory ? 'victory' : 'defeat');
    this.result = new ResultPanel(
      this,
      victory,
      { correct: this.correct, asked: this.asked, stars, newBest },
      victory
        ? { label: next ? 'Next passage' : 'Play again', onTap: goNext }
        : { label: 'Retry', onTap: retry },
      victory
        ? { label: 'Passages', onTap: () => this.scene.start('map') }
        : { label: 'Read again', onTap: readAgain },
    );
    await this.result.appear();
    this.sync();
  }

  private async banner(text: string, color = '#ffffff', hold = 600): Promise<void> {
    const { width: W, height: H } = this.scale.gameSize;
    const t = this.add
      .text(W / 2, H * 0.3, text, {
        fontFamily: FONT_TITLE,
        fontSize: '52px',
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setAlpha(0)
      .setScale(0.7);
    await tweenAsync(this, { targets: t, alpha: 1, scale: 1, duration: 220, ease: 'Back.out' });
    await wait(this, hold);
    await tweenAsync(this, { targets: t, alpha: 0, duration: 200 });
    t.destroy();
  }

  private floatText(x: number, y: number, text: string, color: string, size: number): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: FONT_UI,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({
      targets: t,
      y: y - 70,
      alpha: 0,
      duration: 1100,
      ease: 'Quad.out',
      onComplete: () => t.destroy(),
    });
  }

  // ── Test hooks ─────────────────────────────────────────────────────────────

  private sync(): void {
    const e = this.engine;
    if (!e) return;
    const targets: Record<string, { x: number; y: number }> = {};
    const center = (o: Phaser.GameObjects.Container) => {
      const b = o.getBounds();
      return { x: Math.round(b.centerX), y: Math.round(b.centerY) };
    };
    for (const [id, b] of this.actionBar.buttons) {
      if (b.visible) targets[`action:${id}`] = center(b);
    }
    this.card?.answerButtons.forEach((b, i) => (targets[`answer:${i}`] = center(b)));
    if (this.card?.continueButton) targets['continue'] = center(this.card.continueButton);
    if (this.giftContinue) targets['gift-continue'] = center(this.giftContinue);
    if (this.armorPage) targets['armor-continue'] = center(this.armorPage.continueButton);
    if (this.result) {
      targets['primary'] = center(this.result.primaryButton);
      targets['secondary'] = center(this.result.secondaryButton);
    }

    const { width, height } = this.scale.gameSize;
    updateTestState({
      busy: this.busy,
      gameWidth: width,
      gameHeight: height,
      targets,
      battle: {
        encounter: this.encounter.id,
        phase: e.phase,
        wave: e.waveIndex,
        waveCount: e.waveCount,
        heroHp: e.heroHp,
        heroMaxHp: e.heroMaxHp,
        foeId: e.foe.id,
        foeSprite: (e.foe as EncounterFoe).sprite ?? null,
        foeAnims: this.foe.foeAnimHistory,
        foeHp: e.foeHp,
        foeBarHp: this.foeBar.value,
        faith: e.faith,
        blocks: e.blocks,
        foeStunned: e.foeStunned,
        available: this.busy ? [] : e.availableActions(),
        unlocked: e.specialsAvailable.concat(),
        energy: e.energy,
        gift: this.gift,
        ultimateUnlocked: e.ultimateUnlocked,
        question: this.question
          ? {
              id: this.question.id,
              answerIndex: this.question.answerIndex,
              choices: this.question.choices.length,
            }
          : null,
        feedback: this.feedback,
        result: e.phase === 'VICTORY' || e.phase === 'DEFEAT' ? e.phase : null,
        asked: this.asked,
        correct: this.correct,
        heroAnims: this.hero.animHistory,
      },
    });
  }
}
