import Phaser from 'phaser';
import { FONT_UI } from '../util';
import { sfx } from '../../services/sfx';
import { pixelBox, UI } from './pixelUi';

export interface ButtonOptions {
  width: number;
  height: number;
  /** Corner radius; use height / 2 for a pill or width / 2 for a circle. */
  radius?: number;
  label: string;
  /** A sprite shown in place of the label (texture key, frame and whole-number scale). */
  icon?: { texture: string; frame: number; scale: number };
  fontSize?: number;
  /** Label font (default FONT_UI). */
  fontFamily?: string;
  fill: number;
  textColor?: string;
  stroke?: number;
  /** Opacity of the outline (default: a faint 0.35). */
  strokeAlpha?: number;
  onTap: () => void;
}

/**
 * Button with a generous transparent hit area and press feedback. Round buttons (radius =
 * width / 2, the battle actions) are drawn as vector circles; every other button is the pixel-art
 * button (scenes/ui/pixelUi.ts) tinted to its fill colour.
 * The hit area is a child rectangle, which avoids Container hit-area offset quirks.
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  /** The pixel-art body (null for round buttons). */
  private readonly pixel: Phaser.GameObjects.Image | null;
  readonly label: Phaser.GameObjects.Text;
  private readonly hit: Phaser.GameObjects.Rectangle;
  private fill: number;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly opts: ButtonOptions,
  ) {
    super(scene, x, y);
    this.fill = opts.fill;
    this.bg = scene.add.graphics();
    const round = opts.width === opts.height && (opts.radius ?? 0) >= opts.width / 2;
    this.pixel = round ? null : pixelBox(scene, UI.button, 0, 0, opts.width, opts.height);
    this.label = scene.add
      .text(0, 0, opts.label, {
        fontFamily: opts.fontFamily ?? FONT_UI,
        fontSize: `${opts.fontSize ?? 26}px`,
        fontStyle: 'bold',
        color: opts.textColor ?? '#ffffff',
        align: 'center',
        wordWrap: { width: opts.width - 24, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    if (this.pixel) this.label.setStroke('#1d1838', 5);
    const icon = opts.icon
      ? scene.add.sprite(0, 0, opts.icon.texture, opts.icon.frame).setScale(opts.icon.scale)
      : null;
    this.label.setVisible(!icon);
    this.hit = scene.add
      .rectangle(0, 0, opts.width + 8, opts.height + 8, 0x000000, 0)
      .setInteractive();
    this.hit.on('pointerdown', () => {
      if (!this.enabled) return;
      this.setScale(0.95);
      sfx.play('uiTap');
      opts.onTap();
    });
    this.hit.on('pointerup', () => this.setScale(1));
    this.hit.on('pointerout', () => this.setScale(1));
    const parts: Phaser.GameObjects.GameObject[] = [this.bg];
    if (this.pixel) parts.push(this.pixel);
    parts.push(this.label);
    if (icon) parts.push(icon);
    parts.push(this.hit);
    this.add(parts);
    this.setSize(opts.width, opts.height);
    this.draw();
    scene.add.existing(this);
  }

  setFill(fill: number): this {
    this.fill = fill;
    this.draw();
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.45);
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  private draw(): void {
    if (this.pixel) {
      this.pixel.setTint(lighten(this.fill));
      return;
    }
    const { width: w, height: h } = this.opts;
    const r = this.opts.radius ?? 18;
    this.bg.clear();
    this.bg.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, r);
    this.bg.fillStyle(this.fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    this.bg
      .lineStyle(3, this.opts.stroke ?? 0xffffff, this.opts.strokeAlpha ?? 0.35)
      .strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  }
}

/** The grey pixel button is darker than white, so lift the tint a little to keep the colour true. */
function lighten(color: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const k = 1.15;
  return Phaser.Display.Color.GetColor(
    Math.min(255, c.red * k),
    Math.min(255, c.green * k),
    Math.min(255, c.blue * k),
  );
}
