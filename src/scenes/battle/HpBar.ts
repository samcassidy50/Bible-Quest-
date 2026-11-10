import Phaser from 'phaser';
import { FONT_UI } from '../util';

/** Labelled health bar that animates between values. */
export class HpBar extends Phaser.GameObjects.Container {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly valueText: Phaser.GameObjects.Text;
  readonly nameText: Phaser.GameObjects.Text;
  private shown: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly widthPx: number,
    private readonly color: number,
    name: string,
    private max: number,
  ) {
    super(scene, x, y);
    this.shown = max;
    this.nameText = scene.add
      .text(-widthPx / 2, -14, name, {
        fontFamily: FONT_UI,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0, 1)
      .setShadow(2, 2, '#000000', 2);
    this.valueText = scene.add
      .text(widthPx / 2, -14, '', { fontFamily: FONT_UI, fontSize: '18px', color: '#ffffff' })
      .setOrigin(1, 1)
      .setShadow(2, 2, '#000000', 2);
    this.bar = scene.add.graphics();
    this.add([this.bar, this.nameText, this.valueText]);
    this.draw();
    scene.add.existing(this);
  }

  reset(name: string, max: number): void {
    this.max = max;
    this.shown = max;
    this.nameText.setText(name);
    this.draw();
  }

  setValue(value: number, animate = true): void {
    if (!animate) {
      this.shown = value;
      this.draw();
      return;
    }
    this.scene.tweens.addCounter({
      from: this.shown,
      to: value,
      duration: 350,
      onUpdate: (t) => {
        this.shown = t.getValue() ?? value;
        this.draw();
      },
    });
  }

  private draw(): void {
    const w = this.widthPx;
    const h = 18;
    const pct = Phaser.Math.Clamp(this.shown / this.max, 0, 1);
    this.bar.clear();
    this.bar.fillStyle(0x000000, 0.6).fillRoundedRect(-w / 2 - 3, -3, w + 6, h + 6, 8);
    this.bar.fillStyle(0x3a3150).fillRoundedRect(-w / 2, 0, w, h, 6);
    if (pct > 0)
      this.bar.fillStyle(this.color).fillRoundedRect(-w / 2, 0, Math.max(12, w * pct), h, 6);
    this.valueText.setText(`${Math.round(this.shown)} / ${this.max}`);
  }
}
