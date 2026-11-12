import Phaser from 'phaser';
import { COLORS } from '../config';
import { readSafeAreaInsets, toGameInsets } from '../services/safeArea';
import { hideSplash, platformName } from '../services/platform';
import { updateTestState } from '../services/testHooks';
import { sfx } from '../services/sfx';
import type { DebugParams } from '../core/debugParams';

/** Phase 0 placeholder: proves rendering, scaling, safe areas and input work on every platform. */
export class TitleScene extends Phaser.Scene {
  private safeFrame?: Phaser.GameObjects.Graphics;
  private title?: Phaser.GameObjects.Text;
  private subtitle?: Phaser.GameObjects.Text;
  private tapHint?: Phaser.GameObjects.Text;

  constructor() {
    super('title');
  }

  create(): void {
    const debug = this.registry.get('debug') as DebugParams;

    this.safeFrame = this.add.graphics();
    this.title = this.add
      .text(0, 0, 'Bible Quest', {
        fontFamily: 'Georgia, serif',
        fontSize: '96px',
        color: '#f4c95d',
        stroke: '#3a2a10',
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.subtitle = this.add
      .text(
        0,
        0,
        '"In the beginning God created the heavens and the earth."  — Genesis 1:1 (BSB)',
        {
          fontFamily: 'Georgia, serif',
          fontSize: '26px',
          color: COLORS.text,
        },
      )
      .setOrigin(0.5);
    this.tapHint = this.add
      .text(0, 0, `Tap to begin · ${platformName()}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: COLORS.subtext,
      })
      .setOrigin(0.5);

    if (!debug.freeze) {
      this.tweens.add({
        targets: this.tapHint,
        alpha: 0.35,
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
    }

    this.input.once('pointerdown', () => {
      sfx.play('start');
      this.cameras.main.fadeOut(250, 27, 21, 48);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('map'));
    });

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    updateTestState({ ready: true, scene: 'title' });
    // Hide the native splash only once the first real frame is drawn (no black flash).
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => void hideSplash());
  }

  /** Re-positions everything for the current (expanded) game size and safe-area insets. */
  private layout(): void {
    const { width, height } = this.scale.gameSize;
    const insets = toGameInsets(readSafeAreaInsets(), width, this.scale.displaySize.width);
    const cx = (insets.left + width - insets.right) / 2;

    this.title?.setPosition(cx, height * 0.38);
    this.subtitle?.setPosition(cx, height * 0.56);
    this.tapHint?.setPosition(cx, height - insets.bottom - 48);

    // Debug outline of the safe area so it can be checked in screenshots.
    this.safeFrame?.clear();
    if (import.meta.env.DEV) {
      this.safeFrame
        ?.lineStyle(2, COLORS.gold, 0.25)
        .strokeRect(
          insets.left + 8,
          insets.top + 8,
          width - insets.left - insets.right - 16,
          height - insets.top - insets.bottom - 16,
        );
    }
  }
}
