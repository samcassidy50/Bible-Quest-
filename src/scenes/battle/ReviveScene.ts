import Phaser from 'phaser';
import { REVIVE_PRAYER } from '../../core/content/prayer';
import { updateTestState } from '../../services/testHooks';
import { sfx } from '../../services/sfx';
import { FONT_TITLE, FONT_VERSE, tweenAsync, wait } from '../util';

/** Where the fallen hero stands on screen once the battle camera has zoomed in. */
export interface ReviveData {
  heroX: number;
  /** Screen y of the standing hero's head and feet. */
  heroTop: number;
  heroFeet: number;
  /** The hero rises to full life (the battle scene plays it). */
  onPrayed: () => Promise<void>;
  /** Prays each phrase without a tap (debug `?autoAnswer`). */
  autoPray: boolean;
}

const DARK_KEY = 'revive-dark';
const GLOW_KEY = 'revive-glow';
const PRAYED = '#fff3c4';
const WAITING = '#b9ae95';

/**
 * Runs over the battle after the hero falls (docs/DESIGN.md §2.2): the screen goes black but for a
 * soft beam of light from the sky onto the hero, the player taps through the start of the Lord's
 * Prayer one phrase at a time, the hero rises at full life, and the game returns to the map.
 */
export class ReviveScene extends Phaser.Scene {
  private data_!: ReviveData;
  private lines: Phaser.GameObjects.Text[] = [];
  private prayed = 0;
  private ready = false;
  private revived = false;
  private pulse?: Phaser.Tweens.Tween;
  private hint?: Phaser.GameObjects.Text;

  constructor() {
    super('revive');
  }

  create(data: ReviveData): void {
    this.data_ = data;
    this.lines = [];
    this.prayed = 0;
    this.ready = false;
    this.revived = false;
    const timeScale = (this.registry.get('timeScale') as number | undefined) ?? 1;
    this.tweens.timeScale = timeScale;
    this.time.timeScale = timeScale;

    const { width: W, height: H } = this.scale.gameSize;
    this.paintLight(W, H);
    const dark = this.add.image(0, 0, DARK_KEY).setOrigin(0).setAlpha(0);
    const glow = this.add
      .image(0, 0, GLOW_KEY)
      .setOrigin(0)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    // Taps anywhere pray the next phrase.
    this.add
      .zone(0, 0, W, H)
      .setOrigin(0)
      .setInteractive()
      .on('pointerdown', () => void this.pray(glow));

    // The prayer sits in the dark to the right of the hero, one phrase per line.
    const colX = (data.heroX + W) / 2 + 20;
    const step = 58;
    const top = H / 2 - ((REVIVE_PRAYER.phrases.length - 1) * step) / 2;
    const heading = this.add
      .text(colX, top - 86, '🙏 Pray', {
        fontFamily: FONT_TITLE,
        fontSize: '30px',
        color: '#f4c95d',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    REVIVE_PRAYER.phrases.forEach((phrase, i) => {
      const t = this.add
        .text(colX, top + i * step, phrase, {
          fontFamily: FONT_VERSE,
          fontSize: '36px',
          color: WAITING,
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.lines.push(t);
    });
    const ref = this.add
      .text(colX, top + REVIVE_PRAYER.phrases.length * step + 10, REVIVE_PRAYER.reference, {
        fontFamily: FONT_TITLE,
        fontSize: '20px',
        color: '#8f8570',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hint = this.add
      .text(colX, H - 48, 'Tap to pray each line', {
        fontFamily: FONT_TITLE,
        fontSize: '22px',
        color: '#8f8570',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.events.once('shutdown', () => updateTestState({ revive: null }));
    this.sync();
    void this.begin(dark, glow, [heading, ref, this.hint, ...this.lines]);
  }

  private async begin(
    dark: Phaser.GameObjects.Image,
    glow: Phaser.GameObjects.Image,
    words: Phaser.GameObjects.Text[],
  ): Promise<void> {
    // Darkness falls everywhere but the beam; then the prayer fades in.
    await Promise.all([
      tweenAsync(this, { targets: dark, alpha: 1, duration: 900 }),
      tweenAsync(this, { targets: glow, alpha: 0.25, duration: 1400, delay: 300 }),
    ]);
    await tweenAsync(this, { targets: words, alpha: 1, duration: 500 });
    for (const l of this.lines) l.setAlpha(0.45);
    this.ready = true;
    this.pulseNext();
    this.sync();
    if (this.data_.autoPray) this.autoPray(glow);
  }

  private autoPray(glow: Phaser.GameObjects.Image): void {
    this.time.delayedCall(500, () => {
      void this.pray(glow);
      if (this.prayed < this.lines.length) this.autoPray(glow);
    });
  }

  /** The next phrase lights up and the beam grows a little brighter. */
  private async pray(glow: Phaser.GameObjects.Image): Promise<void> {
    if (!this.ready || this.prayed >= this.lines.length) return;
    const line = this.lines[this.prayed]!;
    this.prayed++;
    this.pulse?.stop();
    this.hint?.setVisible(false);
    line.setColor(PRAYED).setAlpha(1).setScale(1);
    sfx.play('calm');
    const last = this.prayed === this.lines.length;
    void tweenAsync(this, {
      targets: glow,
      alpha: 0.25 + 0.12 * this.prayed,
      duration: 400,
    });
    this.sync();
    if (!last) {
      this.pulseNext();
      return;
    }
    this.ready = false;
    await wait(this, 500);
    await this.rise(glow);
  }

  private pulseNext(): void {
    const next = this.lines[this.prayed];
    if (!next) return;
    next.setAlpha(0.9);
    this.pulse = this.tweens.add({
      targets: next,
      alpha: 0.55,
      scale: 1.04,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  /** The light pours down, the hero gets up at full life, then the screen fades to the map. */
  private async rise(glow: Phaser.GameObjects.Image): Promise<void> {
    const { width: W } = this.scale.gameSize;
    void tweenAsync(this, { targets: glow, alpha: 1, duration: 600 });
    await this.data_.onPrayed();
    this.revived = true;
    this.sync();
    const words = this.add
      .text(this.data_.heroX, this.data_.heroTop - 40, 'Full of life again!', {
        fontFamily: FONT_TITLE,
        fontSize: '40px',
        color: '#f4c95d',
        stroke: '#3a1d08',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    // Keep it on screen however near the edge the hero stands.
    words.setX(Phaser.Math.Clamp(words.x, words.width / 2 + 20, W - words.width / 2 - 20));
    await tweenAsync(this, { targets: words, alpha: 1, y: words.y - 16, duration: 400 });
    await wait(this, 1400);
    this.cameras.main.fadeOut(700, 0, 0, 0);
    await wait(this, 800);
    this.scene.stop('battle');
    this.scene.start('map');
  }

  /**
   * Paints the darkness with a soft beam cut out of it, and the warm glow drawn on top of the beam.
   * Edges are softened by stacking faint layers (canvas blur filters don't work on iOS Safari).
   */
  private paintLight(W: number, H: number): void {
    const { heroX, heroTop, heroFeet } = this.data_;
    const figure = heroFeet - heroTop;
    const topHalf = Math.max(24, W * 0.03);
    const footHalf = figure * 0.45;
    const beam = (ctx: CanvasRenderingContext2D, k: number) => {
      ctx.beginPath();
      ctx.moveTo(heroX - topHalf * k, 0);
      ctx.lineTo(heroX + topHalf * k, 0);
      ctx.lineTo(heroX + footHalf * k, heroFeet + 8);
      ctx.lineTo(heroX - footHalf * k, heroFeet + 8);
      ctx.closePath();
      ctx.fill();
    };
    const pool = (ctx: CanvasRenderingContext2D, rgb: string, a: number) => {
      const rx = footHalf * 1.6;
      const ry = Math.max(14, figure * 0.09);
      ctx.save();
      ctx.translate(heroX, heroFeet + 4);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
      ctx.restore();
    };
    const LAYERS = 14;

    for (const key of [DARK_KEY, GLOW_KEY]) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }
    const dark = this.textures.createCanvas(DARK_KEY, W, H)!;
    const d = dark.getContext();
    d.fillStyle = '#000';
    d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    d.fillStyle = 'rgba(0,0,0,0.07)';
    for (let i = 0; i < LAYERS; i++) beam(d, 1.6 - (i / LAYERS) * 1.0);
    pool(d, '0,0,0', 0.55);
    dark.refresh();

    const glow = this.textures.createCanvas(GLOW_KEY, W, H)!;
    const g = glow.getContext();
    g.fillStyle = 'rgba(255,230,160,0.035)';
    for (let i = 0; i < LAYERS; i++) beam(g, 1.4 - (i / LAYERS) * 0.9);
    pool(g, '255,230,160', 0.35);
    glow.refresh();
  }

  private sync(): void {
    const targets: Record<string, { x: number; y: number }> = {};
    const next = this.lines[this.prayed];
    if (this.ready && next) targets['pray'] = { x: Math.round(next.x), y: Math.round(next.y) };
    updateTestState({
      targets,
      revive: {
        prayed: this.prayed,
        phrases: this.lines.length,
        ready: this.ready,
        revived: this.revived,
      },
    });
  }
}
