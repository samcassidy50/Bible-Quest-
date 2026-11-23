import Phaser from 'phaser';
import type { Encounter, EncounterFoe } from '../../core/content/types';
import type { DebugParams } from '../../core/debugParams';
import { OrbTracker, scheduleOrbs, type ScheduledOrb } from '../../core/scripture/orbs';
import {
  estimateNarrationMs,
  readingTimeline,
  tickerX,
  wordAnchorFraction,
  type ReadingKnot,
} from '../../core/scripture/timing';
import { getEncounter } from '../../content';
import { hapticTap } from '../../services/haptics';
import { sfx } from '../../services/sfx';
import { progress } from '../../services/progress';
import { markHeard, READING_SPEEDS } from '../../core/progress/progress';
import {
  createNarration,
  RecordedNarration,
  verseClip,
  type Narration,
  type VerseClip,
} from '../../services/narration';
import { readSafeAreaInsets, toGameInsets, type Insets } from '../../services/safeArea';
import { updateTestState } from '../../services/testHooks';
import { pixelBox, UI } from '../ui/pixelUi';
import { quickTestOn } from '../quickTest';
import { COLOR } from '../battle/actionInfo';
import { Fighter } from '../battle/Fighter';
import { Button } from '../ui/Button';
import { FONT_UI, FONT_VERSE, tweenAsync, wait } from '../util';
import { EnergyCount } from '../icons';
import { ENERGY_COLOR, Orb } from './Orb';
import { Backdrop } from '../backdrop/Backdrop';

const BANNER_H = 118;
const REF_BOX_W = 250;
const TICKER_STYLE = { fontFamily: FONT_VERSE, fontSize: '44px', color: '#fdf6e3' };
/** The word being read sits at this fraction of the screen width. */
const READ_AT = 0.5;
/** Word-anchored orbs appear when their word reaches this fraction of the screen width. */
const ANCHOR_AT = 0.72;
/** How far an orb drifts upward over its lifetime (gentle, so small hands can catch it). */
const ORB_RISE = 150;

/**
 * Scripture intro (docs/DESIGN.md §2.1): the verse is read aloud and scrolls along the bottom
 * while the hero runs; energy orbs float up and can be tapped to fill the hero's energy for the fight.
 */
export class ScriptureScene extends Phaser.Scene {
  private debug!: DebugParams;
  private encounter!: Encounter;
  private narration!: Narration;
  /** Recorded clip per verse (undefined where the device voice reads it). */
  private clips: (VerseClip | undefined)[] = [];
  /** Real per-verse reading time when every verse is recorded; otherwise estimated. */
  private verseMs?: number[];
  private text = '';
  private durationMs = 0;
  private timeScale = 1;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  private backdrop!: Backdrop;
  private hero!: Fighter;
  private banner!: Phaser.GameObjects.Graphics;
  private refLabel!: Phaser.GameObjects.Text;
  private ticker!: Phaser.GameObjects.Text;
  private tickerMask!: Phaser.GameObjects.Graphics;
  private wordGlows = new Map<string, Phaser.GameObjects.Text>();
  private wordOffsets = new Map<string, number>();
  private loadout!: Phaser.GameObjects.Container;
  private energyText!: EnergyCount;
  private skipBtn!: Button;
  private replayBtn!: Button;
  private fullTextBtn!: Button;
  private fullText?: Phaser.GameObjects.Container;

  private tracker!: OrbTracker;
  private schedule: ScheduledOrb[] = [];
  private active = new Map<string, Orb>();
  private elapsed = 0;
  private knots: ReadingKnot[] = [];
  private narrationDone = false;
  private spokenRefs: string[] = [];
  private finishing = false;
  private readings = 0;
  private readingId = 0;
  private sinceSync = 0;

  constructor() {
    super('scripture');
  }

  create(): void {
    this.debug = this.registry.get('debug') as DebugParams;
    this.encounter = getEncounter(
      (this.registry.get('encounterId') as string | undefined) ?? this.debug.encounter,
    );
    this.timeScale = (this.registry.get('timeScale') as number | undefined) ?? 1;
    this.tweens.timeScale = this.timeScale;
    this.time.timeScale = this.timeScale;

    this.text = this.encounter.verses.map((v) => v.text).join('  ');
    const settings = progress.save.settings;
    this.narration = createNarration({
      enabled: settings.narration && !this.debug.narrationOff && !this.debug.fast,
      wait: (ms) => wait(this, ms),
      rate: READING_SPEEDS[settings.readingSpeed],
    });
    this.clips = this.encounter.verses.map((v) => verseClip(this.encounter.book, v.ref, v.text));
    const recorded = this.narration instanceof RecordedNarration ? this.narration : undefined;
    this.verseMs =
      recorded && this.clips.every(Boolean)
        ? this.clips.map((c) => recorded.clipMs(c as VerseClip))
        : undefined;
    this.durationMs = this.verseMs
      ? this.verseMs.reduce((a, b) => a + b, 0)
      : estimateNarrationMs(this.text, this.narration.rate);

    this.active = new Map();
    this.wordGlows = new Map();
    this.wordOffsets = new Map();
    this.fullText = undefined;
    this.finishing = false;
    this.readings = 0;
    this.tracker = new OrbTracker(this.encounter.orbs.map((_, i) => orbId(i)));

    this.buildScene();
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      this.readingId++; // no further verses after leaving
      this.narration.stop();
    });

    updateTestState({ ready: true, scene: 'scripture', battle: null });
    this.startReading();
  }

  private get canSkip(): boolean {
    return quickTestOn() || progress.save.heard.includes(this.encounter.id);
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.backdrop = new Backdrop(
      this,
      this.encounter.setting,
      this.encounter.weather,
      this.debug.freeze,
    );

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
    this.ticker = this.add
      .text(0, 0, this.text, TICKER_STYLE)
      .setOrigin(0, 0.5)
      .setDepth(21)
      .setShadow(0, 3, '#0b0816', 4, false, true);
    this.tickerMask = this.make.graphics({}, false);
    this.ticker.setMask(this.tickerMask.createGeometryMask());

    // Word offsets for anchored orbs, measured with the ticker's own font.
    const measure = this.add.text(0, 0, '', TICKER_STYLE).setVisible(false);
    for (const [i, orb] of this.encounter.orbs.entries()) {
      if (!orb.word) continue;
      const at = this.text.indexOf(orb.word);
      if (at < 0) continue;
      measure.setText(this.text.slice(0, at));
      this.wordOffsets.set(orbId(i), measure.width);
      const glow = this.add
        .text(0, 0, orb.word, { ...TICKER_STYLE, color: '#ffd34d' })
        .setOrigin(0, 0.5)
        .setDepth(21)
        .setShadow(0, 0, '#ffb300', 16, true, true)
        .setVisible(false);
      glow.setMask(this.tickerMask.createGeometryMask());
      this.wordGlows.set(orbId(i), glow);
    }
    // Where each verse ends in the ticker, so the scroll re-syncs to the voice verse by verse.
    const verseEndPx: number[] = [];
    let end = 0;
    for (const [i, v] of this.encounter.verses.entries()) {
      end += (i > 0 ? 2 : 0) + v.text.length; // verses are joined with two spaces
      measure.setText(this.text.slice(0, end));
      verseEndPx.push(measure.width);
    }
    measure.destroy();
    this.knots = readingTimeline(
      this.encounter.verses.map((v) => v.text),
      verseEndPx,
      this.durationMs,
      this.narration.rate,
      this.verseMs,
    );

    // Energy collected so far, top right.
    this.loadout = this.add.container(0, 0).setDepth(30);
    const label = this.add
      .text(0, 0, 'Energy for this fight', {
        fontFamily: FONT_UI,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#fdf6e3',
      })
      .setOrigin(1, 0)
      .setShadow(2, 2, '#000', 3);
    const badge = this.add.circle(-40, 62, 34, 0x000000, 0.45).setStrokeStyle(3, ENERGY_COLOR, 0.9);
    this.energyText = new EnergyCount(this, -40, 62, 26, FONT_UI);
    this.loadout.add([label, badge, this.energyText]);

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

  private get groundY(): number {
    return this.scale.gameSize.height - BANNER_H - 60;
  }

  private layout(): void {
    const { width: W, height: H } = this.scale.gameSize;
    this.insets = toGameInsets(readSafeAreaInsets(), W, this.scale.displaySize.width);
    const ins = this.insets;
    const gy = this.groundY;

    this.backdrop.layout(W, H, gy);

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
    this.narrationDone = false;

    const { width: W } = this.scale.gameSize;
    const plans = this.encounter.orbs
      .map((_, i) => orbId(i))
      .filter((id) => this.tracker.pending.includes(id))
      .map((id) => {
        const offset = this.wordOffsets.get(id);
        return {
          id,
          anchorFraction:
            offset === undefined
              ? undefined
              : wordAnchorFraction(offset, W * ANCHOR_AT, W * READ_AT, this.knots, this.durationMs),
        };
      });
    this.schedule = scheduleOrbs(plans, this.durationMs);

    this.spokenRefs = [];
    void this.readAloud(id).then(() => {
      if (id !== this.readingId) return; // a replay started a new reading
      this.narrationDone = true;
      this.sync();
    });
    this.sync();
  }

  /**
   * Reads the passage one verse at a time. Short utterances keep every engine reading to the end
   * (Chrome's speech engine silently stops long ones), and the battle waits for the last verse.
   */
  private async readAloud(id: number): Promise<void> {
    const stale = () => id !== this.readingId || this.finishing;
    for (const [i, verse] of this.encounter.verses.entries()) {
      if (stale()) return;
      await this.narration.speak(verse.text, this.clips[i]);
      if (stale()) return;
      this.spokenRefs.push(verse.ref);
    }
  }

  update(_time: number, delta: number): void {
    if (this.finishing) {
      this.scrollParallax(delta * this.timeScale);
      return;
    }
    const dt = delta * this.timeScale;
    this.advanceReading(dt);
    this.scrollParallax(dt);
    this.updateTicker();
    this.updateHero();

    while (this.schedule.length > 0 && this.schedule[0]!.atMs <= this.elapsed) {
      this.spawnOrb(this.schedule.shift()!.id);
    }

    if (this.elapsed >= this.durationMs && this.narrationDone && this.active.size === 0) {
      void this.finish(true);
    }
    // Orbs move, so keep their tap targets fresh; otherwise publish progress a few times a second.
    this.sinceSync += delta;
    if (this.active.size > 0 || this.sinceSync > 200) this.sync();
  }

  /**
   * Moves the ticker along the estimated pace, but never past the verse the voice is still
   * reading, and catches up quickly when the voice finishes a verse early. This keeps the spoken
   * word near the middle of the screen even when the estimate is off.
   */
  private advanceReading(dt: number): void {
    const spoken = this.spokenRefs.length;
    const floor = this.narrationDone ? this.durationMs : (this.knots[spoken]?.t ?? 0);
    const cap = this.narrationDone
      ? this.durationMs
      : (this.knots[spoken + 1]?.t ?? this.durationMs);
    const catchUp = this.elapsed < floor ? Math.max(1, (floor - this.elapsed) / 400) : 1;
    this.elapsed = Math.min(cap, this.elapsed + dt * catchUp);
  }

  private scrollParallax(dt: number): void {
    this.backdrop.scroll(dt);
  }

  private updateTicker(): void {
    const { width: W } = this.scale.gameSize;
    this.ticker.setX(tickerX(this.elapsed, this.knots, W * READ_AT));
    for (const [id, glow] of this.wordGlows)
      glow.setX(this.ticker.x + (this.wordOffsets.get(id) ?? 0));
  }

  private updateHero(): void {
    const { width: W } = this.scale.gameSize;
    const p = this.durationMs > 0 ? this.elapsed / this.durationMs : 1;
    const start = this.insets.left + W * 0.1;
    this.hero.setPosition(start + (W * 0.36 - start) * p, this.groundY);
  }

  // ── Orbs ───────────────────────────────────────────────────────────────────

  private spawnOrb(id: string): void {
    if (!this.tracker.spawn(id)) return;
    const { width: W } = this.scale.gameSize;
    const idx = Number(id.slice(4));
    const x = W * (0.52 + 0.1 * (idx % 3));
    const orb = new Orb(
      this,
      x,
      this.groundY - 60,
      id,
      (o) => void this.collect(o),
      (o) => {
        this.tracker.expire(o.id);
        this.active.delete(o.id);
        this.wordGlows.get(o.id)?.setVisible(false);
        this.sync();
      },
    );
    this.active.set(id, orb);
    orb.appear(ORB_RISE);
    sfx.play('orbSpawn');
    this.wordGlows.get(id)?.setVisible(true);
    this.sync();
    if (this.debug.autoCollect || progress.save.settings.autoCollect) {
      this.time.delayedCall(500, () => void this.collect(orb));
    }
  }

  private async collect(orb: Orb): Promise<void> {
    if (!this.tracker.collect(orb.id)) return;
    this.active.delete(orb.id);
    this.wordGlows.get(orb.id)?.setVisible(false);
    void hapticTap();
    sfx.play('orbCollect');
    this.floatText(orb.x, orb.y - 80, '+1 Energy');
    this.sync();
    const m = this.energyText.getWorldTransformMatrix();
    await orb.collectTo(m.tx, m.ty);
    this.energyText.setValue(this.tracker.collected.length);
    this.tweens.add({ targets: this.energyText, scale: 1.4, duration: 140, yoyo: true });
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
    const text = this.add.text(-pw / 2 + 36, 66, body, {
      fontFamily: FONT_VERSE,
      fontSize: '28px',
      color: COLOR.ink,
      lineSpacing: 6,
      wordWrap: { width: pw - 72, useAdvancedWrap: true },
    });
    const title = this.add.text(-pw / 2 + 36, 26, this.encounter.reference, {
      fontFamily: FONT_UI,
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#8a5a00',
    });
    const ph = text.height + 100;
    const bg = pixelBox(this, UI.panel, 0, ph / 2, pw, ph);
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
      progress.update((s) => markHeard(s, this.encounter.id));
    }
    for (const b of [this.skipBtn, this.replayBtn, this.fullTextBtn]) b.setVisible(false);
    this.fullText?.destroy();
    this.fullText = undefined;
    this.sync();

    // The first foe appears ahead and the hero runs up to it, then cut to battle.
    const { width: W } = this.scale.gameSize;
    const spec = this.encounter.waves[0] as EncounterFoe;
    const foe = new Fighter(this, W + 150, this.groundY, 'foe', spec.color, spec.size, spec.sprite);
    await Promise.all([
      tweenAsync(this, { targets: foe, x: W * 0.68, duration: 700, ease: 'Quad.out' }),
      tweenAsync(this, { targets: this.hero, x: W * 0.45, duration: 700, ease: 'Quad.inOut' }),
    ]);
    this.hero.stopRun();
    this.registry.set('collectedEnergy', this.tracker.collected.length);
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
    for (const [id, orb] of this.active) {
      if (orb.scale >= 0.95) targets[`orb:${id}`] = { x: Math.round(orb.x), y: Math.round(orb.y) };
    }
    if (this.skipBtn?.visible) targets['skip'] = center(this.skipBtn);
    if (this.replayBtn?.visible) targets['replay'] = center(this.replayBtn);
    if (this.fullTextBtn?.visible) targets['fulltext'] = center(this.fullTextBtn);

    const scheduled = new Map(this.schedule.map((s) => [s.id, s.atMs]));
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
        verseRefs: this.encounter.verses.map((v) => v.ref),
        spokenRefs: [...this.spokenRefs],
        recordedRefs:
          this.narration instanceof RecordedNarration
            ? this.encounter.verses.filter((_, i) => this.clips[i]).map((v) => v.ref)
            : [],
        tickerX: Math.round(this.ticker.x),
        tickerWidth: Math.round(this.ticker.width),
        orbs: this.tracker.all.map((o) => ({ ...o, atMs: scheduled.get(o.id) ?? -1 })),
        energy: this.tracker.collected.length,
        collected: this.tracker.collected,
        canSkip: this.canSkip,
        fullTextOpen: !!this.fullText,
        finishing: this.finishing,
        readings: this.readings,
      },
    });
  }
}

/** Orb ids are their index in the passage's orb list. */
function orbId(i: number): string {
  return `orb-${i}`;
}
