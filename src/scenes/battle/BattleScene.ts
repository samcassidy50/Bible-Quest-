import Phaser from 'phaser';
import { BattleEngine } from '../../core/battle/BattleEngine';
import { QUESTION_TIME_S, recordAsked, recordVictory } from '../../core/progress/progress';
import { autoSetOnFirstWin, heroLoadout } from '../../core/progress/runes';
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
import { childrenOf } from '../../core/map/worldMap';
import { sectionQuestions } from '../../core/content/types';
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
import type { ReviveData } from './ReviveScene';
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
  /** The second foe of a pair (wave with a partner) and its bar, while it stands. */
  private back?: Fighter;
  private backBar?: HpBar;
  /** Tap areas over a pair's two foes and the marker over the targeted one. */
  private targetZones: Phaser.GameObjects.Zone[] = [];
  private targetMarker?: Phaser.GameObjects.Text;
  private wavePips!: Phaser.GameObjects.Graphics;
  private refText!: Phaser.GameObjects.Text;
  private actionBar!: ActionBar;
  private card?: QuestionCard;
  private result?: ResultPanel;
  /** Top-right button that leaves the fight for the map, and its confirm prompt while open. */
  private leaveButton!: Button;
  private leaveConfirm?: { root: Phaser.GameObjects.Container; leave: Button; stay: Button };

  private busy = true;
  /** The hero has fallen and the prayer overlay (ReviveScene) is running. */
  private reviving = false;
  private question: Question | null = null;
  private feedback: 'correct' | 'wrong' | null = null;
  private asked = 0;
  /** Question ids asked in this battle, so a later fight's review questions come after new ones. */
  private askedHere: string[] = [];
  private correct = 0;
  private powerUps = 0;

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
    this.leaveConfirm = undefined;
    this.busy = true;
    this.reviving = false;
    this.question = null;
    this.feedback = null;
    this.asked = 0;
    this.askedHere = [];
    this.correct = 0;
    this.powerUps = 0;

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
    // A fall zooms the camera onto the hero; start each fight from the full view.
    this.cameras.main.setZoom(1).setScroll(0, 0);

    this.engine = new BattleEngine(
      {
        ...heroLoadout(progress.save, ENCOUNTERS),
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

    this.buildScene();
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.events.on('card-continue-ready', () => this.sync());

    this.engine.start();
    this.dealDeck();
    updateTestState({ ready: true, scene: 'battle', scripture: null });
    void this.intro();
  }

  /**
   * Armor the hero owns: earned by winning passages along the map (each passage's `unlocks`).
   * `?specials=` overrides it for testing and also unlocks the ultimate.
   */
  /**
   * Questions for the current fight: those of the section just read first, then earlier sections'
   * as review. Never anything from a section not read yet.
   */
  private dealDeck(): void {
    const { pool, current } = sectionQuestions(this.encounter, this.engine.waveIndex + 1);
    const seen = [...progress.save.asked, ...this.askedHere];
    this.deck = new QuestionDeck(pool, this.rng, undefined, seen, current);
  }

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
    this.hero.setShield(this.engine.blocks); // a Blessing of Guarding starts the fight with blocks
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
    this.buildBack();

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

    this.leaveButton = new Button(this, 0, 0, {
      width: 130,
      height: 58,
      radius: 29,
      label: '✕ Leave',
      fontSize: 22,
      fill: 0x6b4a22,
      onTap: () => this.openLeaveConfirm(),
    }).setDepth(120);

    this.hero.setFrozen(this.debug.freeze);
    if (!this.debug.freeze) this.foe.idle();
    this.drawFaith();
    this.drawWaves();
  }

  private makeFoe(spec: EncounterFoe): Fighter {
    return new Fighter(this, 0, 0, 'foe', spec.color, spec.size, spec.sprite);
  }

  /** The back foe of a pair, if this wave has one (its bar is narrower so both fit). */
  private buildBack(): void {
    const spec = this.engine.backFoe as EncounterFoe | null;
    this.back?.destroy();
    this.backBar?.destroy();
    this.back = undefined;
    this.backBar = undefined;
    if (!spec) return;
    this.back = this.makeFoe(spec);
    this.backBar = new HpBar(this, 0, 0, 180, COLOR.foeHp, spec.name, spec.maxHp);
    if (!this.debug.freeze) this.back.idle();
  }

  /** Where the front foe stands: a little nearer the hero when a pair shares the field. */
  private get frontX(): number {
    return this.scale.gameSize.width * (this.back ? 0.54 : 0.58);
  }

  private get backX(): number {
    return this.scale.gameSize.width * 0.72;
  }

  /**
   * With a pair on the field, each foe can be tapped to target it, and a gold marker bobs over
   * the targeted one. With a single foe there is nothing to choose, so neither is shown.
   */
  private refreshTargeting(): void {
    for (const z of this.targetZones) z.destroy();
    this.targetZones = [];
    this.targetMarker?.destroy();
    this.targetMarker = undefined;
    if (!this.back || !this.backBar) return;
    const sides: ['front' | 'back', Fighter][] = [
      ['front', this.foe],
      ['back', this.back],
    ];
    for (const [side, f] of sides) {
      const h = f.figureHeight + 40;
      const zone = this.add
        .zone(f.x, f.y - h / 2, 200, h)
        .setInteractive({ useHandCursor: true })
        .setDepth(5);
      zone.on('pointerdown', () => this.chooseTarget(side));
      this.targetZones.push(zone);
    }
    const bar = this.engine.target === 'back' ? this.backBar : this.foeBar;
    this.targetMarker = this.add
      .text(bar.x, bar.y - 56, '▼', {
        fontFamily: FONT_UI,
        fontSize: '44px',
        color: '#ffd34d',
        stroke: '#3a1d08',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setVisible(!this.busy);
    if (!this.debug.freeze) {
      this.tweens.add({
        targets: this.targetMarker,
        y: bar.y - 46,
        duration: 450,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
  }

  private chooseTarget(side: 'front' | 'back'): void {
    if (this.busy || this.engine.phase !== 'HERO_CHOOSE' || this.engine.target === side) return;
    this.engine.setTarget(side);
    sfx.play('uiTap');
    this.refreshTargeting();
    this.sync();
  }

  /** Lowest y that stays clear of the wave pips and passage title along the top. */
  private static readonly HUD_CLEAR_Y = 120;

  /** The foe's health bar sits above its head, or under its feet when the foe is too tall for that. */
  private placeFoeBar(): void {
    const above = this.groundY - this.foe.figureHeight - 40;
    const y = above >= BattleScene.HUD_CLEAR_Y ? above : this.groundY + 62;
    this.foeBar.setPosition(this.foe.x, y);
    if (this.back && this.backBar) {
      const above2 = this.groundY - this.back.figureHeight - 40;
      this.backBar.setPosition(
        this.back.x,
        above2 >= BattleScene.HUD_CLEAR_Y ? above2 : this.groundY + 62,
      );
    }
    this.refreshTargeting();
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
    this.foe.setPosition(this.frontX, this.groundY);
    this.back?.setPosition(this.backX, this.groundY);
    this.placeFoeBar();
    this.heroPanel.setPosition(ins.left + 24, H - ins.bottom - 136);
    this.refText.setPosition(ins.left + 24, ins.top + 20);
    this.actionBar.setPosition(W - ins.right - 116, H - ins.bottom - 104);
    this.leaveButton.setPosition(W - ins.right - 24 - 65, ins.top + 41);
    this.leaveConfirm?.root.setPosition(W / 2, H / 2);
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

  // ── Leaving the fight ──────────────────────────────────────────────────────

  /** Asks before leaving; the fight is paused (timer, foes, turn flow) while the prompt is up. */
  private openLeaveConfirm(): void {
    if (this.leaveConfirm || this.result) return;
    this.tweens.pauseAll();
    this.time.paused = true;
    const { width: W, height: H } = this.scale.gameSize;
    // Full-screen blocker so nothing under the prompt can be tapped.
    const dim = this.add.rectangle(0, 0, W * 3, H * 3, 0x000000, 0.55).setInteractive();
    const panel = pixelBox(this, UI.panel, 0, 0, 520, 260);
    const title = this.add
      .text(0, -70, 'Leave this battle?', {
        fontFamily: FONT_TITLE,
        fontSize: '38px',
        color: '#fdf6e3',
        stroke: '#1d1838',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    const note = this.add
      .text(0, -20, 'You will go back to the map.', {
        fontFamily: FONT_UI,
        fontSize: '22px',
        color: '#fdf6e3',
        stroke: '#1d1838',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const stay = new Button(this, -120, 60, {
      width: 200,
      height: 64,
      label: 'Keep fighting',
      fontSize: 22,
      fill: 0x2e86de,
      onTap: () => this.closeLeaveConfirm(),
    });
    const leave = new Button(this, 120, 60, {
      width: 200,
      height: 64,
      label: 'Leave',
      fontSize: 24,
      fill: 0xc0392b,
      onTap: () => {
        this.tweens.resumeAll();
        this.time.paused = false;
        this.scene.start('map');
      },
    });
    const root = this.add
      .container(W / 2, H / 2, [dim, panel, title, note, stay, leave])
      .setDepth(300);
    this.leaveConfirm = { root, leave, stay };
    this.sync();
  }

  private closeLeaveConfirm(): void {
    if (!this.leaveConfirm) return;
    this.leaveConfirm.root.destroy();
    this.leaveConfirm = undefined;
    this.tweens.resumeAll();
    this.time.paused = false;
    this.sync();
  }

  // ── Turn flow ──────────────────────────────────────────────────────────────

  private async intro(): Promise<void> {
    sfx.play('wave');
    await this.banner(`Wave 1 · ${this.engine.foe.name}`);
    this.setBusy(false);
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.targetMarker?.setVisible(!busy);
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

    const drawn = this.deck.draw();
    this.askedHere.push(drawn.id);
    const passageIds = this.encounter.questions.map((x) => x.id);
    progress.update((s) => recordAsked(s, drawn.id, passageIds));
    const q = shuffleChoices(drawn, this.rng);
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
    // A right answer: the card drops away as POWER UP bursts over the field.
    await Promise.all([card.slideOut(), correct ? this.powerUpBurst() : Promise.resolve()]);
    this.card = undefined;
    this.question = null;
    this.feedback = null;

    const result = this.engine.answer(correct);
    this.sync();
    await this.playHero(result);
    await this.afterHero(result);
  }

  /**
   * Big gold "POWER UP!" that pops in over the battlefield while a beam of light falls on the
   * hero (like the angel's), then both fade.
   */
  private async powerUpBurst(): Promise<void> {
    this.powerUps++;
    this.sync();
    const { width: W, height: H } = this.scale.gameSize;

    // The beam sits behind the hero (fighters are at depth 0, the backdrop below -20).
    const hx = this.hero.x;
    const gy = this.groundY;
    // Stacked strips, widening and brightening toward the ground (no gradient seams).
    const beam = this.add.graphics().setDepth(-1).setAlpha(0);
    const step = 8;
    for (let y = 0; y < gy; y += step) {
      const k = y / gy;
      const half = 40 + 90 * k;
      beam.fillStyle(0xfff6d0, 0.12 + 0.43 * k).fillRect(hx - half, y, half * 2, step);
    }
    const pool = this.add.ellipse(hx, gy, 300, 56, 0xfff1b0, 0.35).setDepth(-1).setAlpha(0);
    void tweenAsync(this, { targets: [beam, pool], alpha: 1, duration: 300 });

    const text = this.add
      .text(0, 0, 'POWER UP!', {
        fontFamily: FONT_TITLE,
        fontSize: '96px',
        fontStyle: 'bold',
        color: '#ffd34d',
        stroke: '#5a2d00',
        strokeThickness: 12,
      })
      .setOrigin(0.5)
      .setShadow(0, 6, '#000000', 8, true, true);
    const sparks = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return {
        star: this.add.text(0, 0, '✦', { fontSize: '40px', color: '#fff3c4' }).setOrigin(0.5),
        x: Math.cos(a) * 300,
        y: Math.sin(a) * 160,
      };
    });
    const burst = this.add
      .container(W / 2, H * 0.4, [...sparks.map((s) => s.star), text])
      .setDepth(110)
      .setScale(0.2)
      .setAlpha(0);
    for (const s of sparks)
      void tweenAsync(this, {
        targets: s.star,
        x: s.x,
        y: s.y,
        alpha: 0,
        duration: 800,
        ease: 'Quad.out',
      });
    await tweenAsync(this, {
      targets: burst,
      scale: 1,
      alpha: 1,
      duration: 300,
      ease: 'Back.out',
    });
    await tweenAsync(this, {
      targets: text,
      scale: 1.08,
      duration: 180,
      yoyo: true,
      ease: 'Sine.inOut',
    });
    await wait(this, 250);
    await Promise.all([
      tweenAsync(this, { targets: burst, alpha: 0, scale: 1.3, duration: 250, ease: 'Quad.in' }),
      tweenAsync(this, { targets: [beam, pool], alpha: 0, duration: 400 }),
    ]);
    for (const o of [burst, beam, pool]) o.destroy();
  }

  private async afterHero(res: HeroActionResult): Promise<void> {
    if (res.backDefeated) await this.backDefeated();
    if (res.steppedUp) await this.stepUp();
    if (res.victory) {
      await Promise.all([this.foeDefeated(), this.backDefeated()]);
      this.drawWaves();
      await this.hero.act('victory');
      await this.showResult();
      return;
    }
    if (res.foeDefeated && res.nextWave !== null) {
      await Promise.all([this.foeDefeated(), this.backDefeated()]);
      await this.hero.act('victory');
      await this.readNextSection();
      await this.spawnNextFoe();
      this.setBusy(false);
      return;
    }
    await wait(this, 300);
    const enemy = this.engine.enemyTurn();
    await this.playEnemy(enemy);
    if (enemy.defeat) {
      await this.hero.act('die');
      await this.fallAndPray();
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
    if (res.damage > 0 || res.backDamage > 0) await this.heroStrike(res, powered);
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
      this.back?.setStunned(true);
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
      // A hit aimed only at the back foe of a pair runs to it; anything else to the front foe.
      x: (res.damage === 0 && this.back ? this.back : this.foe).x - this.foe.strikeDistance,
      duration: 260,
      ease: 'Quad.in',
    });

    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      if (powered) {
        this.cameras.main.shake(ultimate ? 400 : 180, ultimate ? 0.02 : 0.008);
        void hapticTap(true);
      }
      if (res.damage > 0) {
        this.foe.figure.setAlpha(0.4);
        this.time.delayedCall(90, () => this.foe.figure.setAlpha(1));
        void this.foe.foeAct('hurt');
        this.floatText(
          this.foe.x,
          this.foeTextY,
          `${res.damage}`,
          powered ? COLOR.powered : COLOR.damage,
          ultimate ? 84 : powered ? 60 : 44,
        );
        // After a finishing blow the engine already holds the next foe, so its HP is not this one's.
        this.foeBar.setValue(res.foeDefeated ? 0 : this.engine.foeHp);
      }
      if (res.backDamage > 0 && this.back && this.backBar) {
        const back = this.back;
        back.figure.setAlpha(0.4);
        this.time.delayedCall(90, () => back.figure.setAlpha(1));
        void back.foeAct('hurt');
        this.floatText(
          back.x,
          this.foeTextY,
          `${res.backDamage}`,
          powered ? COLOR.powered : COLOR.damage,
          powered ? 52 : 40,
        );
        // A stepped-up back foe is now the engine's front foe.
        const left = res.steppedUp ? this.engine.foeHp : this.engine.backFoeHp;
        this.backBar.setValue(res.backDefeated || (res.foeDefeated && !res.steppedUp) ? 0 : left);
      }
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
      this.back?.setStunned(false);
      this.sync();
      await wait(this, 700);
      return;
    }
    // The foe walks up to the hero, attacks there (the blow lands on the attack's impact frame),
    // then walks back to its spot.
    const attacker = res.attacker === 'back' && this.back ? this.back : this.foe;
    const startX = attacker.x;
    const reach = Math.max(150, (attacker.foeSprite?.frontReach ?? 0) + 70);
    const strikeX = Math.min(startX, this.hero.x + reach);
    attacker.foeMove(-1);
    await tweenAsync(this, {
      targets: attacker,
      x: strikeX,
      duration: Math.max(240, Math.abs(startX - strikeX) * 0.75),
      ease: 'Sine.inOut',
    });
    attacker.foeStop();
    sfx.play('foeAttack', { vary: true });
    await attacker.foeStrike(() => {
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
      this.sync();
    });
    attacker.foeMove(1);
    await tweenAsync(this, {
      targets: attacker,
      x: startX,
      duration: Math.max(260, Math.abs(startX - strikeX) * 0.85),
      ease: 'Sine.inOut',
    });
    attacker.foeStop();
    this.sync();
  }

  private async foeDefeated(foe: Fighter = this.foe): Promise<void> {
    sfx.play('foeDefeat');
    this.tweens.killTweensOf(foe.figure);
    if (foe.foeSprite) {
      // Sprite foes have their own defeat frames; just fade what is left.
      await foe.foeAct('death');
      await tweenAsync(this, { targets: foe, alpha: 0, duration: 200 });
      return;
    }
    await tweenAsync(this, { targets: foe, alpha: 0, y: foe.y - 40, duration: 450 });
  }

  /** The back foe of a pair falls (a sweep got it); its bar goes with it. */
  private async backDefeated(): Promise<void> {
    const back = this.back;
    if (!back) return;
    this.back = undefined;
    await this.foeDefeated(back);
    back.destroy();
    this.backBar?.destroy();
    this.backBar = undefined;
    this.refreshTargeting();
  }

  /** The front foe of a pair falls and the other one steps up to take its place. */
  private async stepUp(): Promise<void> {
    const next = this.back;
    const nextBar = this.backBar;
    if (!next || !nextBar) return;
    await this.foeDefeated();
    this.foe.destroy();
    this.foeBar.destroy();
    this.foe = next;
    this.foeBar = nextBar;
    this.back = undefined;
    this.backBar = undefined;
    this.foe.setStunned(false);
    await tweenAsync(this, {
      targets: [this.foe, this.foeBar],
      x: this.frontX,
      duration: 380,
      ease: 'Sine.inOut',
    });
    this.placeFoeBar();
    this.sync();
  }

  /**
   * Between fights the next part of the passage is read: the battle sleeps while the reading
   * scene runs, then wakes with the energy from that reading's orbs. Health and faith carry on.
   */
  private async readNextSection(): Promise<void> {
    const cam = this.cameras.main;
    cam.fadeOut(300, 5, 3, 13);
    await new Promise<void>((r) => cam.once('camerafadeoutcomplete', () => r()));
    const energy = await new Promise<number>((resolve) => {
      this.events.once('wake', (_sys: unknown, data?: { energy?: number }) =>
        resolve(data?.energy ?? 0),
      );
      this.registry.set('readingSection', this.engine.waveIndex);
      this.scene.run('scripture');
      this.scene.sleep();
    });
    updateTestState({ ready: true, scene: 'battle', scripture: null });
    if (!this.debug.freeze) this.hero.idle(); // out of the cheer from the last fight
    cam.fadeIn(300, 5, 3, 13);
    this.engine.addEnergy(energy);
    this.drawFaith();
    this.dealDeck();
    this.actionBar.refresh(this.engine, false);
  }

  private async spawnNextFoe(): Promise<void> {
    const spec = this.engine.foe as EncounterFoe;
    this.foe.destroy();
    this.foe = this.makeFoe(spec);
    this.buildBack();
    this.foe.setPosition(this.frontX, this.groundY).setAlpha(0);
    this.back?.setPosition(this.backX, this.groundY).setAlpha(0);
    this.children.moveBelow(this.foe, this.foeBar);
    this.foeBar.reset(spec.name, spec.maxHp);
    this.placeFoeBar();
    if (!this.debug.freeze) this.foe.idle();
    this.drawWaves();
    sfx.play('wave');
    const back = this.engine.backFoe;
    const who = !back
      ? spec.name
      : back.name === spec.name
        ? `${spec.name} ×2`
        : `${spec.name} & ${back.name}`;
    await this.banner(`Wave ${this.engine.waveIndex + 1} · ${who}`);
    await tweenAsync(this, {
      targets: [this.foe, this.back].filter(Boolean),
      alpha: 1,
      duration: 300,
    });
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

  /**
   * The hero has fallen (docs/DESIGN.md §2.2): the HUD fades, the camera zooms in on the hero, and
   * ReviveScene darkens everything but a beam of light from the sky while the player prays. The
   * hero rises at full life and the game returns to the map. Nothing is lost.
   */
  private async fallAndPray(): Promise<void> {
    this.reviving = true;
    // The next try at this passage rolls differently.
    this.registry.set('attempt', ((this.registry.get('attempt') as number | undefined) ?? 0) + 1);
    this.actionBar.refresh(this.engine, false);
    this.closeLeaveConfirm();
    this.leaveButton.setVisible(false);
    sfx.play('defeat');
    this.sync();

    const hud = [
      this.heroPanel,
      this.actionBar,
      this.foeBar,
      this.backBar,
      this.wavePips,
      this.refText,
      this.targetMarker,
    ].filter((o) => o !== undefined);
    void tweenAsync(this, { targets: hud, alpha: 0, duration: 400 });

    // The standing hero fills about half the screen height, a little left of centre, so the
    // prayer has room on the right.
    const { width: W, height: H } = this.scale.gameSize;
    const figure = this.hero.figureHeight;
    const zoom = Phaser.Math.Clamp((H * 0.5) / figure, 1.3, 3);
    const heroScreenX = W * 0.3;
    const focusX = this.hero.x + (W / 2 - heroScreenX) / zoom;
    const focusY = this.groundY - figure / 2;
    await tweenAsync(this, {
      targets: this.cameras.main,
      zoom,
      scrollX: focusX - W / 2,
      scrollY: focusY - H / 2,
      duration: 1400,
      ease: 'Sine.inOut',
    });

    const data: ReviveData = {
      heroX: heroScreenX,
      heroTop: H / 2 - (figure * zoom) / 2,
      heroFeet: H / 2 + (figure * zoom) / 2,
      autoPray: this.debug.autoAnswer !== undefined,
      onPrayed: async () => {
        this.engine.revive();
        this.heroBar.setValue(this.engine.heroHp);
        sfx.play('heal');
        this.sync();
        await this.hero.act('victory');
        this.sync();
      },
    };
    this.scene.launch('revive', data);
  }

  /** The win panel: stars, any new blessing, then on to the next passage or back to the map. */
  private async showResult(): Promise<void> {
    this.actionBar.refresh(this.engine, false);
    this.closeLeaveConfirm();
    this.leaveButton.setVisible(false);
    const next = nextEncounter(this.encounter.id);
    // Where paths split, the player picks the next one on the map.
    const atFork = childrenOf(this.encounter.id).length > 1;
    const firstWin = !(this.encounter.id in progress.save.completed);
    let result!: ReturnType<typeof recordVictory>;
    progress.update(
      (s) => (result = recordVictory(s, this.encounter.id, this.correct, this.asked)).save,
    );
    // A first win awards the passage's blessing; it goes straight into a free slot of its item.
    if (firstWin) progress.update((s) => autoSetOnFirstWin(s, ENCOUNTERS, this.encounter.id));
    const goNext = () => {
      if (next) {
        this.registry.set('encounterId', next.id);
        this.registry.remove('collectedEnergy');
      }
      this.scene.start('scripture');
    };
    // First win of a passage that awards armor: the angel presents it.
    if (firstWin && this.encounter.unlocks) await this.presentArmor(this.encounter.unlocks);
    sfx.play('victory');
    this.result = new ResultPanel(
      this,
      true,
      {
        correct: this.correct,
        asked: this.asked,
        stars: result.stars,
        newBest: result.newBest,
        rune: firstWin ? this.encounter.rune : undefined,
      },
      atFork
        ? { label: 'Choose your path', onTap: () => this.scene.start('map') }
        : { label: next ? 'Next passage' : 'Play again', onTap: goNext },
      { label: 'Passages', onTap: () => this.scene.start('map') },
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
    if (this.targetZones.length === 2) {
      targets['foe:front'] = {
        x: Math.round(this.targetZones[0]!.x),
        y: Math.round(this.targetZones[0]!.y),
      };
      targets['foe:back'] = {
        x: Math.round(this.targetZones[1]!.x),
        y: Math.round(this.targetZones[1]!.y),
      };
    }
    if (this.giftContinue) targets['gift-continue'] = center(this.giftContinue);
    if (this.armorPage) targets['armor-continue'] = center(this.armorPage.continueButton);
    if (this.leaveButton.visible) targets['leave'] = center(this.leaveButton);
    if (this.leaveConfirm) {
      targets['leave-confirm'] = center(this.leaveConfirm.leave);
      targets['leave-stay'] = center(this.leaveConfirm.stay);
    }
    if (this.result) {
      targets['primary'] = center(this.result.primaryButton);
      targets['secondary'] = center(this.result.secondaryButton);
    }

    const { width, height } = this.scale.gameSize;
    updateTestState({
      busy: this.busy,
      gameWidth: width,
      gameHeight: height,
      // While the prayer runs, its scene owns the tap targets.
      ...(this.reviving ? {} : { targets }),
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
        backFoeId: e.backFoe?.id ?? null,
        backFoeHp: e.backFoeHp,
        target: e.target,
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
        powerUps: this.powerUps,
      },
    });
  }
}
