import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { FONT_PIXEL, tweenAsync } from '../util';
import { COLOR } from './actionInfo';
import { pixelBox, UI, UI_SCALE } from '../ui/pixelUi';

/** Dark brown ink for text on the parchment panel. */
const INK = '#4a2c12';

/** Victory / defeat overlay with Retry (no permanent loss; docs/DESIGN.md §2.2). */
export class ResultPanel extends Phaser.GameObjects.Container {
  readonly primaryButton: Button;
  readonly secondaryButton: Button;

  constructor(
    scene: Phaser.Scene,
    victory: boolean,
    stats: { correct: number; asked: number; stars?: number; newBest?: boolean },
    primary: { label: string; onTap: () => void },
    secondary: { label: string; onTap: () => void },
  ) {
    const { width: W, height: H } = scene.scale.gameSize;
    super(scene, W / 2, H / 2);
    // Pixel parchment panel and buttons (scenes/ui/pixelUi.ts), at the hero's 3x pixel size.
    const pw = 240 * UI_SCALE;
    const ph = 140 * UI_SCALE;

    const backdrop = scene.add.rectangle(0, 0, W * 2, H * 2, 0x05030d, 0.65).setInteractive();
    const panel = pixelBox(scene, UI.panel, 0, 0, pw, ph);

    const title = scene.add
      .text(0, -ph / 2 + 72, victory ? 'Victory!' : 'Try again!', {
        fontFamily: FONT_PIXEL,
        fontSize: '64px',
        fontStyle: 'bold',
        color: victory ? '#f4c95d' : '#c9a36b',
        stroke: '#4a2c12',
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    const detail = scene.add
      .text(
        0,
        -ph / 2 + 150,
        victory
          ? `You answered ${stats.correct} of ${stats.asked} questions correctly.`
          : `You answered ${stats.correct} of ${stats.asked} correctly.\nRead the verse again and give it another go!`,
        {
          fontFamily: FONT_PIXEL,
          fontSize: '26px',
          fontStyle: 'bold',
          color: INK,
          align: 'center',
          lineSpacing: 8,
        },
      )
      .setOrigin(0.5, 0);

    const button = (x: number, label: string, fill: number, onTap: () => void) =>
      new Button(scene, x, ph / 2 - 72, {
        width: 74 * UI_SCALE,
        height: 28 * UI_SCALE,
        label,
        fontSize: 28,
        fontFamily: FONT_PIXEL,
        fill,
        onTap,
      });
    this.primaryButton = button(135, primary.label, COLOR.correct, primary.onTap);
    this.secondaryButton = button(-135, secondary.label, 0x3f8f5f, secondary.onTap);
    for (const b of [this.primaryButton, this.secondaryButton]) b.label.setStroke('#1f5a36', 6);

    this.add([backdrop, panel, title, detail, this.primaryButton, this.secondaryButton]);

    if (victory && stats.stars) {
      // The pack's look: a big star in the middle, smaller ones either side.
      const y = -ph / 2 + 150;
      [-1, 0, 1].forEach((side, i) => {
        const star = scene.add
          .image(side * 92, y + (side ? 6 : 0), i < stats.stars! ? UI.star : UI.starEmpty)
          .setScale(side ? 2.4 : UI_SCALE);
        this.add(star);
      });
      detail.setY(-ph / 2 + 210);
      if (stats.newBest) {
        this.add(
          scene.add
            .text(pw / 2 - 36, -ph / 2 + 30, 'New best!', {
              fontFamily: FONT_PIXEL,
              fontSize: '22px',
              fontStyle: 'bold',
              color: '#2e8b57',
            })
            .setOrigin(1, 0),
        );
      }
    }
    this.setDepth(200).setScale(0.6).setAlpha(0);
    scene.add.existing(this);
  }

  async appear(): Promise<void> {
    await tweenAsync(this.scene, {
      targets: this,
      scale: 1,
      alpha: 1,
      duration: 300,
      ease: 'Back.out',
    });
  }
}
