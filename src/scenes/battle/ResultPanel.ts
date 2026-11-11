import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { FONT_TITLE, FONT_UI, tweenAsync } from '../util';
import { COLOR } from './actionInfo';

/** Victory / defeat overlay with Retry (no permanent loss; docs/DESIGN.md §2.2). */
export class ResultPanel extends Phaser.GameObjects.Container {
  readonly primaryButton: Button;
  readonly secondaryButton: Button;

  constructor(
    scene: Phaser.Scene,
    victory: boolean,
    stats: { correct: number; asked: number },
    primary: { label: string; onTap: () => void },
    secondary: { label: string; onTap: () => void },
  ) {
    const { width: W, height: H } = scene.scale.gameSize;
    super(scene, W / 2, H / 2);
    const pw = Math.min(W - 64, 720);
    const ph = 420;

    const backdrop = scene.add.rectangle(0, 0, W * 2, H * 2, 0x05030d, 0.65).setInteractive();
    const panel = scene.add.graphics();
    panel.fillStyle(COLOR.panel).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 32);
    panel
      .lineStyle(6, victory ? COLOR.gold : 0x8e7cc3)
      .strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 32);

    const title = scene.add
      .text(0, -ph / 2 + 80, victory ? 'Victory!' : 'Try again!', {
        fontFamily: FONT_TITLE,
        fontSize: '72px',
        fontStyle: 'bold',
        color: victory ? '#f4c95d' : '#d7c8ff',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    const detail = scene.add
      .text(
        0,
        -ph / 2 + 175,
        victory
          ? `You answered ${stats.correct} of ${stats.asked} questions correctly.`
          : `You answered ${stats.correct} of ${stats.asked} correctly.\nRead the verse again and give it another go!`,
        {
          fontFamily: FONT_UI,
          fontSize: '26px',
          color: '#ffffff',
          align: 'center',
          lineSpacing: 8,
        },
      )
      .setOrigin(0.5, 0);

    this.primaryButton = new Button(scene, 130, ph / 2 - 80, {
      width: 220,
      height: 84,
      radius: 42,
      label: primary.label,
      fontSize: 28,
      fill: COLOR.correct,
      onTap: primary.onTap,
    });
    this.secondaryButton = new Button(scene, -130, ph / 2 - 80, {
      width: 220,
      height: 84,
      radius: 42,
      label: secondary.label,
      fontSize: 28,
      fill: 0x4a4560,
      onTap: secondary.onTap,
    });

    this.add([backdrop, panel, title, detail, this.primaryButton, this.secondaryButton]);
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
