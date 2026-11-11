import Phaser from 'phaser';
import type { SpecialId } from '../../core/battle/types';
import type { Encounter, EncounterFoe } from '../../core/content/types';
import type { DebugParams } from '../../core/debugParams';
import { OrbTracker, scheduleOrbs, type ScheduledOrb } from '../../core/scripture/orbs';
import { estimateNarrationMs, tickerX, wordAnchorFraction } from '../../core/scripture/timing';
import { getEncounter } from '../../content';
import { hapticTap } from '../../services/haptics';
import { createNarration, type Narration } from '../../services/narration';
import { readSafeAreaInsets, toGameInsets, type Insets } from '../../services/safeArea';
import { updateTestState } from '../../services/testHooks';
import { ACTION_INFO, COLOR } from '../battle/actionInfo';
import { Fighter } from '../battle/Fighter';
import { Button } from '../ui/Button';
import { FONT_TITLE, FONT_UI, tweenAsync, wait } from '../util';
import { Orb } from './Orb';

const BANNER_H = 118;
const REF_BOX_W = 250;
const TICKER_STYLE = { fontFamily: FONT_TITLE, fontSize: '42px', color: '#fdf6e3' };
/** Word-anchored orbs appear when their word reaches this fraction of the screen width. */
const ANCHOR_AT = 0.72;
/** How far an orb drifts upward over its lifetime (gentle, so small hands can catch it). */
const ORB_RISE = 150;

/**
 * Scripture intro (docs/DESIGN.md §2.1): the verse is read aloud and scrolls along the bottom
 * while the hero runs; Armor orbs float up and can be tapped to unlock specials for the fight.
 */
export class ScriptureScene extends Phaser.Scene {
  private debug!: DebugParams;
  private encounter!: Encounter;
  private narration!: Narration;
  private text = '';
  private durationMs = 0;
  private timeScale = 1;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private ground!: Phaser.GameObjects.TileSprite;
  private sky!: Phaser.GameObjects.Graphics;
  private hero!: Fighter;
  private banner!: Phaser.GameObjects.Graphics;
  private refLabel!: Phaser.GameObjects.Text;
  private ticker!: Phaser.GameObjects.Text;
  private tickerMask!: Phaser.GameObjects.Graphics;
  private wordGlows = new Map<SpecialId, Phaser.GameObjects.Text>();
  private wordOffsets = new Map<SpecialId, number>();
  private loadout!: Phaser.GameObjects.Container;
  private slots = new Map<SpecialId, Phaser.GameObjects.Container>();
  private skipBtn!: Button;
  private replayBtn!: Button;
  private fullTextBtn!: Button;
  private fullText?: Phaser.GameObjects.Container;

  private tracker!: OrbTracker;
  private schedule: ScheduledOrb[] = [];
  private active = new Map<SpecialId, Orb>();
  private elapsed = 0;
  private speedup = 1;
  private narrationDone = false;
  private finishing = false;
  private readings = 0;
  private readingId = 0;
  private sinceSync = 0;

  constructor() {
    super('scripture');
  }

  create(): void {
    this.debug = this.registry.get('debug') as DebugParams;
    this.encounter = getEncounter(this.debug.encounter);
    this.timeScale = (this.registry.get('timeScale') as number | undefined) ?? 1;
    this.tweens.timeScale = this.timeScale;
    this.time.timeScale = this.timeScale;

    this.text = this.encounter.verses.map((v) => v.text).join('  ');
    this.narration = createNarration({
      enabled: !this.debug.narrationOff && !this.debug.fast,
      wait: (ms) => wait(this, ms),
    });
    this.durationMs = estimateNarrationMs(this.text, this.narration.rate);

    this.active = new Map();
    this.wordGlows = new Map();
    this.wordOffsets = new Map();
    this.slots = new Map();
    this.fullText = undefined;
    this.finishing = false;
    this.readings = 0;
    this.tracker = new OrbTracker(this.encounter.orbs.map((o) => o.special));

    this.buildScene();
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      this.narration.stop();
    });

    updateTestState({ ready: true, scene: 'scripture', battle: null });
    this.startReading();
  }

  private get canSkip(): boolean {
    const heard = this.registry.get('heard') as string[] | undefined;
    return heard?.includes(this.encounter.id) ?? false;
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.makeTextures();
    const { width: W, height: H } = this.scale.gameSize;
    this.sky = this.add.graphics();
    this.far = this.add.tileSprite(0, 0, W, 220, 'px-far').setOrigin(0, 1);
    this.near = this.add.tileSprite(0, 0, W, 160, 'px-near').setOrigin(0, 1);
    this.ground = this.add.tileSprite(0, 0, W, H, 'px-ground').setOrigin(0, 0);

    this.hero = new Fighter(this, 0, 0, 'hero');
    this.hero.run();

    // Bottom banner: reference box on the left, ticker text scrolling behind a mask.
    this.banner = this.add.graphics().setDepth(20);
    this.refLabel = this.add
      .text(0, 0, `📖 ${this.encounter.reference}`, {
        fontFamily: FONT_UI,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#f4c95d',
        wordWrap: { width: REF_BOX_W - 30 },
      })
      .setOrigin(0, 0.5)
      .setDepth(22);
    this.ticker = this.add.text(0, 0, this.text, TICKER_STYLE).setOrigin(0, 0.5).setDepth(21);
    this.tickerMask = this.make.graphics({}, false);
    this.ticker.setMask(this.tickerMask.createGeometryMask());

    // Word offsets for anchored orbs, measured with the ticker's own font.
    const measure = this.add.text(0, 0, '', TICKER_STYLE).setVisible(false);
    for (const orb of this.encounter.orbs) {
      if (!orb.word) continue;
      const i = this.text.indexOf(orb.word);
      if (i < 0) continue;
      measure.setText(this.text.slice(0, i));
      this.wordOffsets.set(orb.special, measure.width);
      const glow = this.add
        .text(0, 0, orb.word, { ...TICKER_STYLE, color: '#ffd34d' })
        .setOrigin(0, 0.5)
        .setDepth(21)
        .setShadow(0, 0, '#ffb300', 16, true, true)
        .setVisible(false);
      glow.setMask(this.tickerMask.createGeometryMask());
      this.wordGlows.set(orb.special, glow);
    }
    measure.destroy();

    // Loadout: one slot per orb in this encounter, top right.
    this.loadout = this.add.container(0, 0).setDepth(30);
    const label = this.add
      .text(0, 0, 'Armor for this fight', {
        fontFamily: FONT_UI,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#fdf6e3',
      })
      .setOrigin(1, 0)
      .setShadow(2, 2, '#000', 3);
    this.loadout.add(label);
    this.encounter.orbs.forEach((orb, i) => {
      const slot = this.add.container(-34 - i * 76, 64);
      const ring = this.add
        .circle(0, 0, 32, 0x000000, 0.45)
        .setStrokeStyle(3, ACTION_INFO[orb.special].color, 0.9);
      const icon = this.add
        .text(0, 0, ACTION_INFO[orb.special].icon, { fontSize: '30px' })
        .setOrigin(0.5)
        .setAlpha(0.25);
      slot.add([ring, icon]);
      slot.setData('icon', icon).setData('ring', ring);
      this.slots.set(orb.special, slot);
      this.loadout.add(slot);
    });
    label.setPosition(0, 0);

    // Controls, top left.
    const pill = (label: string, onTap: () => void, w = 170) =>
      new Button(this, 0, 0, {
        width: w,
        height: 64,
        radius: 32,
        label,
        fontSize: 22,
        fill: 0x2a2350,
        onTap,
      }).setDepth(30);
    this.fullTextBtn = pill('📜 Full text', () => this.toggleFullText());
    this.replayBtn = pill('↻ Replay', () => this.replay(), 150);
    this.skipBtn = pill('Skip ⏭', () => this.skip(), 130).setVisible(this.canSkip);
  }

  /** Placeholder parallax art generated once (Phase 4 swaps in painted layers). */
  private makeTextures(): void {
    if (this.textures.exists('px-far')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0x2a1f4d).beginPath().moveTo(0, 220);
    for (let x = 0; x <= 512; x += 64) g.lineTo(x, 220 - 90 - ((x / 64) % 2 ? 70 : 0));
    g.lineTo(512, 220).closePath().fillPath();
    g.generateTexture('px-far', 512, 220).clear();

    g.fillStyle(0x3b2a52);
    g.fillEllipse(80, 160, 220, 150)
      .fillEllipse(300, 170, 280, 130)
      .fillEllipse(470, 160, 200, 140);
    g.generateTexture('px-near', 512, 160).clear();

    g.fillStyle(0x3a2a1f).fillRect(0, 0, 256, 512);
    g.fillStyle(0x4d3828).fillRect(0, 0, 256, 14);
    g.fillStyle(0x2f2219)
      .fillRect(40, 40, 30, 8)
      .fillRect(170, 90, 40, 8)
      .fillRect(100, 150, 26, 8);
    g.generateTexture('px-ground', 256, 512).destroy();
  }

  private get groundY(): number {
    return this.scale.gameSize.height - BANNER_H - 60;
  }

  private layout(): void {
    const { width: W, height: H } = this.scale.gameSize;
    this.insets = toGameInsets(readSafeAreaInsets(), W, this.scale.displaySize.width);
    const ins = this.insets;
    const gy = this.groundY;

    this.sky
      .clear()
      .fillGradientStyle(0x1b1340, 0x1b1340, 0x6b3a6b, 0x6b3a6b, 1)
      .fillRect(0, 0, W, gy);
    this.far.setPosition(0, gy).setSize(W, 220);
    this.near.setPosition(0, gy + 4).setSize(W, 160);
    this.ground.setPosition(0, gy - 6).setSize(W, H - gy + 6);

    const bannerY = H - BANNER_H;
    this.banner
      .clear()
      .fillStyle(0x0d0a1c, 0.82)
      .fillRect(0, bannerY, W, BANNER_H)
      .lineStyle(3, COLOR.gold, 0.7)
      .lineBetween(0, bannerY, W, bannerY)
      .fillStyle(0x2a2350, 1)
      .fillRect(0, bannerY + 2, ins.left + REF_BOX_W, BANNER_H - 2);
    this.refLabel.setPosition(ins.left + 20, bannerY + BANNER_H / 2 - ins.bottom / 2);
    this.tickerMask
      .clear()
      .fillStyle(0xffffff)
      .fillRect(ins.left + REF_BOX_W, bannerY, W, BANNER_H);
    this.ticker.setY(bannerY + BANNER_H / 2 - ins.bottom / 2);
    for (const glow of this.wordGlows.values()) glow.setY(this.ticker.y);

    this.loadout.setPosition(W - ins.right - 24, ins.top + 16);
    this.fullTextBtn.setPosition(ins.left + 24 + 85, ins.top + 48);
    this.replayBtn.setPosition(ins.left + 24 + 170 + 16 + 75, ins.top + 48);
    this.skipBtn.setPosition(ins.left + 24 + 170 + 16 + 150 + 16 + 65, ins.top + 48);
    this.fullText?.setPosition(W / 2, ins.top + 110);
    this.updateHero();
    this.updateTicker();
    this.sync();
  }

  // ── Reading loop ───────────────────────────────────────────────────────────

  private startReading(): void {
    this.readingId++;
    const id = this.readingId;
    this.readings++;
    this.elapsed = 0;
    this.speedup = 1;
    this.narrationDone = false;

    const { width: W } = this.scale.gameSize;
    const textW = this.ticker.width;
    const plans = this.encounter.orbs
      .filter((o) => this.tracker.pending.includes(o.special))
      .map((o) => {
        const offset = this.wordOffsets.get(o.special);
        return {
          special: o.special,
          anchorFraction:
            offset === undefined ? undefined : wordAnchorFraction(offset, W * ANCHOR_AT, W, textW),
        };
      });
    this.schedule = scheduleOrbs(plans, this.durationMs);

    void this.narration.speak(this.text).then(() => {
      if (id !== this.readingId) return; // a replay started a new reading
      this.narrationDone = true;
      // Voice finished early: let the ticker catch up quickly instead of lingering.
      const left = this.durationMs - this.elapsed;
      if (left > 0) this.speedup = Math.max(1, left / 900);
      this.sync();
    });
    this.sync();
  }

  update(_time: number, delta: number): void {
    if (this.finishing) {
      this.scrollParallax(delta * this.timeScale);
      return;
    }
    const dt = delta * this.timeScale;
    this.elapsed = Math.min(this.durationMs, this.elapsed + dt * this.speedup);
    this.scrollParallax(dt);
    this.updateTicker();
    this.updateHero();

    while (this.schedule.length > 0 && this.schedule[0]!.atMs <= this.elapsed) {
      this.spawnOrb(this.schedule.shift()!.special);
    }

    if (this.elapsed >= this.durationMs && this.narrationDone && this.active.size === 0) {
      void this.finish(true);
    }
    // Orbs move, so keep their tap targets fresh; otherwise publish progress a few times a second.
    this.sinceSync += delta;
    if (this.active.size > 0 || this.sinceSync > 200) this.sync();
  }

  private scrollParallax(dt: number): void {
    this.far.tilePositionX += dt * 0.02;
    this.near.tilePositionX += dt * 0.06;
    this.ground.tilePositionX += dt * 0.3;
  }

  private updateTicker(): void {
    const { width: W } = this.scale.gameSize;
    this.ticker.setX(tickerX(this.elapsed, this.durationMs, W, this.ticker.width));
    for (const [special, glow] of this.wordGlows)
      glow.setX(this.ticker.x + (this.wordOffsets.get(special) ?? 0));
  }

  private updateHero(): void {
    const { width: W } = this.scale.gameSize;
    const p = this.durationMs > 0 ? this.elapsed / this.durationMs : 1;
    const start = this.insets.left + W * 0.1;
    this.hero.setPosition(start + (W * 0.36 - start) * p, this.groundY);
  }

  // ── Orbs ───────────────────────────────────────────────────────────────────

  private spawnOrb(special: SpecialId): void {
    if (!this.tracker.spawn(special)) return;
    const { width: W } = this.scale.gameSize;
    const idx = this.encounter.orbs.findIndex((o) => o.special === special);
    const x = W * (0.52 + 0.1 * (idx % 3));
    const orb = new Orb(
      this,
      x,
      this.groundY - 60,
      special,
      (o) => void this.collect(o),
      (o) => {
        this.tracker.expire(o.special);
        this.active.delete(o.special);
        this.wordGlows.get(o.special)?.setVisible(false);
        this.sync();
      },
    );
    this.active.set(special, orb);
    orb.appear(ORB_RISE);
    this.wordGlows.get(special)?.setVisible(true);
    this.sync();
    if (this.debug.autoCollect) this.time.delayedCall(500, () => void this.collect(orb));
  }

  private async collect(orb: Orb): Promise<void> {
    if (!this.tracker.collect(orb.special)) return;
    this.active.delete(orb.special);
    this.wordGlows.get(orb.special)?.setVisible(false);
    void hapticTap();
    this.floatText(orb.x, orb.y - 80, `${ACTION_INFO[orb.special].name} unlocked!`);
    this.sync();
    const slot = this.slots.get(orb.special)!;
    const m = slot.getWorldTransformMatrix();
    await orb.collectTo(m.tx, m.ty);
    (slot.getData('icon') as Phaser.GameObjects.Text).setAlpha(1);
    (slot.getData('ring') as Phaser.GameObjects.Arc).setFillStyle(
      ACTION_INFO[orb.special].color,
      0.85,
    );
    this.tweens.add({ targets: slot, scale: 1.25, duration: 140, yoyo: true });
  }

  private clearActiveOrbs(): void {
    for (const orb of this.active.values()) orb.discard();
    this.active.clear();
    for (const glow of this.wordGlows.values()) glow.setVisible(false);
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  private skip(): void {
    if (this.finishing || !this.canSkip) return;
    this.narration.stop();
    this.clearActiveOrbs();
    this.schedule = [];
    this.tracker.forfeitRemaining();
    void this.finish(false);
  }

  private replay(): void {
    if (this.finishing) return;
    this.narration.stop();
    this.clearActiveOrbs();
    this.tracker.resetUncollected();
    this.startReading();
  }

  private toggleFullText(): void {
    if (this.fullText) {
      this.fullText.destroy();
      this.fullText = undefined;
      this.sync();
      return;
    }
    const { width: W } = this.scale.gameSize;
    const pw = Math.min(W - 80, 980);
    const body = this.encounter.verses.map((v) => `${v.ref}  ${v.text}`).join('\n\n');
    const text = this.add.text(-pw / 2 + 28, 60, body, {
      fontFamily: FONT_TITLE,
      fontSize: '28px',
      color: COLOR.ink,
      lineSpacing: 6,
      wordWrap: { width: pw - 56, useAdvancedWrap: true },
    });
    const title = this.add.text(
      -pw / 2 + 28,
      20,
      `${this.encounter.reference} (${this.encounter.translation})`,
      {
        fontFamily: FONT_UI,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#8a5a00',
      },
    );
    const ph = text.height + 90;
    const bg = this.add.graphics();
    bg.fillStyle(COLOR.card, 0.97).fillRoundedRect(-pw / 2, 0, pw, ph, 24);
    bg.lineStyle(4, COLOR.gold).strokeRoundedRect(-pw / 2, 0, pw, ph, 24);
    this.fullText = this.add
      .container(W / 2, this.insets.top + 110, [bg, title, text])
      .setDepth(35);
    this.sync();
  }

  // ── Finish ─────────────────────────────────────────────────────────────────

  private async finish(completed: boolean): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    this.schedule = [];
    if (completed) {
      const heard = new Set((this.registry.get('heard') as string[] | undefined) ?? []);
      heard.add(this.encounter.id);
      this.registry.set('heard', [...heard]);
    }
    for (const b of [this.skipBtn, this.replayBtn, this.fullTextBtn]) b.setVisible(false);
    this.fullText?.destroy();
    this.fullText = undefined;
    this.sync();

    // The first foe appears ahead and the hero runs up to it, then cut to battle.
    const { width: W } = this.scale.gameSize;
    const spec = this.encounter.waves[0] as EncounterFoe;
    const foe = new Fighter(this, W + 150, this.groundY, 'foe', spec.color, spec.size);
    await Promise.all([
      tweenAsync(this, { targets: foe, x: W * 0.68, duration: 700, ease: 'Quad.out' }),
      tweenAsync(this, { targets: this.hero, x: W * 0.45, duration: 700, ease: 'Quad.inOut' }),
    ]);
    this.hero.stopRun();
    this.registry.set('collectedOrbs', this.tracker.collected);
    this.cameras.main.fadeOut(300, 5, 3, 13);
    await new Promise<void>((r) => this.cameras.main.once('camerafadeoutcomplete', () => r()));
    this.scene.start('battle');
  }

  private floatText(x: number, y: number, text: string): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: FONT_UI,
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#ffd34d',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({
      targets: t,
      y: y - 60,
      alpha: 0,
      duration: 1400,
      onComplete: () => t.destroy(),
    });
  }

  // ── Test hooks ─────────────────────────────────────────────────────────────

  private sync(): void {
    if (!this.tracker) return;
    this.sinceSync = 0;
    const targets: Record<string, { x: number; y: number }> = {};
    const center = (o: Phaser.GameObjects.Container) => {
      const b = o.getBounds();
      return { x: Math.round(b.centerX), y: Math.round(b.centerY) };
    };
    // Only fully popped-in orbs are tappable targets (a tiny orb has a tiny hit area).
    for (const [special, orb] of this.active) {
      if (orb.scale >= 0.95)
        targets[`orb:${special}`] = { x: Math.round(orb.x), y: Math.round(orb.y) };
    }
    if (this.skipBtn?.visible) targets['skip'] = center(this.skipBtn);
    if (this.replayBtn?.visible) targets['replay'] = center(this.replayBtn);
    if (this.fullTextBtn?.visible) targets['fulltext'] = center(this.fullTextBtn);

    const scheduled = new Map(this.schedule.map((s) => [s.special, s.atMs]));
    const { width, height } = this.scale.gameSize;
    updateTestState({
      gameWidth: width,
      gameHeight: height,
      targets,
      busy: this.finishing,
      scripture: {
        encounter: this.encounter.id,
        durationMs: this.durationMs,
        elapsedMs: Math.round(this.elapsed),
        narrationDone: this.narrationDone,
        orbs: this.tracker.all.map((o) => ({ ...o, atMs: scheduled.get(o.special) ?? -1 })),
        collected: this.tracker.collected,
        canSkip: this.canSkip,
        fullTextOpen: !!this.fullText,
        finishing: this.finishing,
        readings: this.readings,
      },
    });
  }
}
