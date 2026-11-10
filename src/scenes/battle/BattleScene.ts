import Phaser from 'phaser';
import { BattleEngine } from '../../core/battle/BattleEngine';
import { HERO_BASE } from '../../core/battle/hero';
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
import { createRng } from '../../core/rng';
import { getEncounter } from '../../content';
import { readSafeAreaInsets, toGameInsets, type Insets } from '../../services/safeArea';
import { updateTestState } from '../../services/testHooks';
import { FONT_TITLE, FONT_UI, tweenAsync, wait } from '../util';
import { ActionBar } from './ActionBar';
import { ACTION_INFO, COLOR } from './actionInfo';
import { Fighter } from './Fighter';
import { HpBar } from './HpBar';
import { QuestionCard } from './QuestionCard';
import { ResultPanel } from './ResultPanel';

/**
 * Battle scene (docs/DESIGN.md §2.2). Renders and sequences only: every rule lives in
 * BattleEngine. Flow per hero turn: action bar → question card → animate → enemy turn.
 */
export class BattleScene extends Phaser.Scene {
  private debug!: DebugParams;
  private encounter!: Encounter;
  private engine!: BattleEngine;
  private deck!: QuestionDeck<Question>;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  private bg!: Phaser.GameObjects.Graphics;
  private hero!: Fighter;
  private foe!: Fighter;
  private heroPanel!: Phaser.GameObjects.Container;
  private heroBar!: HpBar;
  private faithPips!: Phaser.GameObjects.Graphics;
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
    this.card = undefined;
    this.result = undefined;
    this.busy = true;
    this.question = null;
    this.feedback = null;
    this.asked = 0;
    this.correct = 0;

    this.debug = this.registry.get('debug') as DebugParams;
    this.encounter = getEncounter(this.debug.encounter);
    const attempt = (this.registry.get('attempt') as number | undefined) ?? 0;
    const seed = ((this.registry.get('seed') as number) + attempt) >>> 0;
    const rng = createRng(seed);

    const timeScale = (this.registry.get('timeScale') as number | undefined) ?? 1;
    this.tweens.timeScale = timeScale;
    this.time.timeScale = timeScale;

    this.engine = new BattleEngine(
      {
        hero: HERO_BASE,
        waves: this.encounter.waves,
        unlockedSpecials: this.unlockedSpecials(),
        startingFaith: this.debug.faith,
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
    updateTestState({ ready: true, scene: 'battle' });
    void this.intro();
  }

  /**
   * Specials for this fight. Phase 2 passes the orbs collected during the verse via the registry;
   * until then the encounter's orbs count as collected. `?specials=` overrides both.
   */
  private unlockedSpecials(): SpecialId[] {
    if (this.debug.specials) return this.debug.specials;
    const collected = this.registry.get('collectedOrbs') as SpecialId[] | undefined;
    return collected ?? this.encounter.orbs.map((o) => o.special);
  }

  // ── Build & layout ─────────────────────────────────────────────────────────

  private buildScene(): void {
    this.bg = this.add.graphics();
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
    const panelBg = this.add.graphics();
    panelBg.fillStyle(COLOR.panel, 0.85).fillRoundedRect(0, 0, 360, 116, 20);
    panelBg.lineStyle(3, COLOR.gold, 0.6).strokeRoundedRect(0, 0, 360, 116, 20);
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
    this.heroPanel.add([panelBg, this.heroBar, faithLabel, this.faithPips]);

    this.wavePips = this.add.graphics();
    this.refText = this.add
      .text(0, 0, `📖 ${this.encounter.reference}`, {
        fontFamily: FONT_UI,
        fontSize: '22px',
        color: '#fdf6e3',
      })
      .setShadow(2, 2, '#000', 3);

    this.actionBar = new ActionBar(this, (a) => void this.onAction(a));

    if (!this.debug.freeze) {
      this.hero.idle();
      this.foe.idle();
    }
    this.drawFaith();
    this.drawWaves();
  }

  private makeFoe(spec: EncounterFoe): Fighter {
    return new Fighter(this, 0, 0, 'foe', spec.color, spec.size);
  }

  private get groundY(): number {
    return this.scale.gameSize.height * 0.7;
  }

  private layout(): void {
    const { width: W, height: H } = this.scale.gameSize;
    this.insets = toGameInsets(readSafeAreaInsets(), W, this.scale.displaySize.width);
    const ins = this.insets;

    this.drawBackground(W, H);
    this.hero.setPosition(ins.left + W * 0.22, this.groundY);
    this.foe.setPosition(W * 0.58, this.groundY);
    this.foeBar.setPosition(this.foe.x, this.groundY - this.foe.figureHeight - 40);
    this.heroPanel.setPosition(ins.left + 24, H - ins.bottom - 136);
    this.refText.setPosition(ins.left + 24, ins.top + 20);
    this.actionBar.setPosition(W - ins.right - 116, H - ins.bottom - 104);
    this.card?.setPosition(W / 2, H / 2);
    this.result?.setPosition(W / 2, H / 2);
    this.drawWaves();
    this.sync();
  }

  private drawBackground(W: number, H: number): void {
    const g = this.bg.clear();
    const ground = H * 0.7;
    g.fillGradientStyle(0x1b1340, 0x1b1340, 0x6b3a6b, 0x6b3a6b, 1).fillRect(0, 0, W, ground);
    g.fillStyle(0x2a1f4d, 1);
    for (let x = -100; x < W + 200; x += 260)
      g.fillTriangle(x, ground, x + 160, ground - 150, x + 320, ground);
    g.fillStyle(0x3a2a1f).fillRect(0, ground - 6, W, H - ground + 6);
    g.fillStyle(0x4d3828).fillRect(0, ground - 6, W, 14);
  }

  private drawFaith(): void {
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

    const q = this.deck.draw();
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
      await this.banner(`${info.icon} ${info.name}! ${info.icon}`, '#f4c95d');
    } else if (res.action !== 'attack') {
      void this.banner(`${info.icon} ${info.name}`, powered ? '#f4c95d' : '#ffffff', 700);
    }

    if (res.damage > 0) await this.heroStrike(res.damage, powered, res.action === 'ultimate');
    if (res.blocksAdded > 0) {
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
    if (res.stunned) this.foe.setStunned(true);
    if (res.faithGained > 0 || res.action === 'ultimate') this.drawFaith();
    this.sync();
    await wait(this, 350);
  }

  private async heroStrike(damage: number, powered: boolean, ultimate: boolean): Promise<void> {
    const startX = this.hero.x;
    await tweenAsync(this, {
      targets: this.hero,
      x: this.foe.x - 170,
      duration: 220,
      ease: 'Quad.in',
    });
    this.foe.figure.setAlpha(0.4);
    this.time.delayedCall(90, () => this.foe.figure.setAlpha(1));
    if (powered) this.cameras.main.shake(ultimate ? 400 : 180, ultimate ? 0.02 : 0.008);
    this.floatText(
      this.foe.x,
      this.foe.y - this.foe.figureHeight - 70,
      `${damage}`,
      powered ? COLOR.powered : COLOR.damage,
      ultimate ? 84 : powered ? 60 : 44,
    );
    this.foeBar.setValue(this.engine.foeHp);
    void tweenAsync(this, { targets: this.foe, x: this.foe.x + 24, duration: 70, yoyo: true });
    await tweenAsync(this, { targets: this.hero, x: startX, duration: 260, ease: 'Quad.out' });
  }

  private async playEnemy(res: EnemyTurnResult): Promise<void> {
    if (res.skippedStunned) {
      this.floatText(
        this.foe.x,
        this.foe.y - this.foe.figureHeight - 70,
        'Calmed… skips its turn',
        '#d7c8ff',
        28,
      );
      this.foe.setStunned(false);
      this.sync();
      await wait(this, 700);
      return;
    }
    const startX = this.foe.x;
    await tweenAsync(this, {
      targets: this.foe,
      x: this.hero.x + 170,
      duration: 260,
      ease: 'Quad.in',
    });
    if (res.blocked) {
      this.floatText(this.hero.x, this.hero.y - 230, 'Blocked!', '#85c1e9', 40);
      this.hero.setShield(this.engine.blocks);
    } else {
      this.hero.figure.setAlpha(0.4);
      this.time.delayedCall(90, () => this.hero.figure.setAlpha(1));
      this.cameras.main.shake(150, 0.006);
      this.floatText(this.hero.x, this.hero.y - 220, `-${res.damage}`, '#ff6b6b', 48);
      this.heroBar.setValue(this.engine.heroHp);
    }
    await tweenAsync(this, { targets: this.foe, x: startX, duration: 300, ease: 'Quad.out' });
    this.sync();
  }

  private async foeDefeated(): Promise<void> {
    this.tweens.killTweensOf(this.foe.figure);
    await tweenAsync(this, { targets: this.foe, alpha: 0, y: this.foe.y - 40, duration: 450 });
  }

  private async spawnNextFoe(): Promise<void> {
    const spec = this.engine.foe as EncounterFoe;
    this.foe.destroy();
    this.foe = this.makeFoe(spec);
    this.foe.setPosition(this.scale.gameSize.width * 0.58, this.groundY).setAlpha(0);
    this.children.moveBelow(this.foe, this.foeBar);
    this.foeBar.reset(spec.name, spec.maxHp);
    this.foeBar.setPosition(this.foe.x, this.groundY - this.foe.figureHeight - 40);
    if (!this.debug.freeze) this.foe.idle();
    this.drawWaves();
    await this.banner(`Wave ${this.engine.waveIndex + 1} · ${spec.name}`);
    await tweenAsync(this, { targets: this.foe, alpha: 1, duration: 300 });
  }

  private async showResult(victory: boolean): Promise<void> {
    this.actionBar.refresh(this.engine, false);
    this.result = new ResultPanel(
      this,
      victory,
      { correct: this.correct, asked: this.asked },
      () => {
        this.registry.set(
          'attempt',
          ((this.registry.get('attempt') as number | undefined) ?? 0) + 1,
        );
        this.scene.restart();
      },
      () => this.scene.start('title'),
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
    for (const [id, b] of this.actionBar.buttons) targets[`action:${id}`] = center(b);
    this.card?.answerButtons.forEach((b, i) => (targets[`answer:${i}`] = center(b)));
    if (this.card?.continueButton) targets['continue'] = center(this.card.continueButton);
    if (this.result) {
      targets['retry'] = center(this.result.retryButton);
      targets['title'] = center(this.result.titleButton);
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
        foeHp: e.foeHp,
        faith: e.faith,
        blocks: e.blocks,
        foeStunned: e.foeStunned,
        available: this.busy ? [] : e.availableActions(),
        unlocked: e.specialsAvailable.concat(),
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
      },
    });
  }
}
