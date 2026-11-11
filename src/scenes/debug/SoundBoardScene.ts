import Phaser from 'phaser';
import { SFX_NAMES } from '../../core/audio/sfxRecipes';
import { sfx } from '../../services/sfx';
import { updateTestState } from '../../services/testHooks';
import { Button } from '../ui/Button';
import { FONT_TITLE } from '../util';

const COLS = 5;

/** Sound board (dev builds, `?scene=sounds`): tap a button to hear each synthesized effect. */
export class SoundBoardScene extends Phaser.Scene {
  constructor() {
    super('sounds');
  }

  create(): void {
    const { width: W, height: H } = this.scale.gameSize;
    this.add
      .graphics()
      .fillGradientStyle(0x1b1340, 0x1b1340, 0x3d2a5c, 0x3d2a5c, 1)
      .fillRect(0, 0, W, H);
    this.add
      .text(W / 2, 24, 'Sound effects', {
        fontFamily: FONT_TITLE,
        fontSize: '40px',
        color: '#f4c95d',
      })
      .setOrigin(0.5, 0);

    const bw = Math.min(220, (W - 80) / COLS - 16);
    const targets: Record<string, { x: number; y: number }> = {};
    SFX_NAMES.forEach((name, i) => {
      const x = 40 + bw / 2 + (i % COLS) * (bw + 16) + (W - 80 - COLS * (bw + 16) + 16) / 2;
      const y = 120 + Math.floor(i / COLS) * 96;
      // The board plays the cue itself, so skip the button's own tap sound.
      const b = new Button(this, x, y, {
        width: bw,
        height: 76,
        radius: 38,
        label: name,
        fontSize: 22,
        fill: 0x2e86de,
        onTap: () => {
          sfx.history.pop();
          sfx.play(name);
        },
      });
      targets[`sound:${name}`] = { x: Math.round(b.x), y: Math.round(b.y) };
    });
    updateTestState({
      ready: true,
      scene: 'sounds',
      battle: null,
      scripture: null,
      targets,
      gameWidth: W,
      gameHeight: H,
    });
  }
}
