import Phaser from 'phaser';
import {
  resetProgress,
  updateSettings,
  type ReadingSpeed,
  type Settings,
} from '../../core/progress/progress';
import { progress } from '../../services/progress';
import { sfx } from '../../services/sfx';
import { updateTestState } from '../../services/testHooks';
import { TEST_HOOKS_ENABLED } from '../../config';
import { COLOR } from '../battle/actionInfo';
import { Button } from '../ui/Button';
import { pixelBox, UI } from '../ui/pixelUi';
import { FONT_UI } from '../util';
import { center, menuFrame } from './menuFrame';

const SPEEDS: ReadingSpeed[] = ['slow', 'normal', 'fast'];

interface Row {
  key: string;
  label: string;
  hint: string;
  value: (s: Settings) => string;
  next: (s: Settings) => Partial<Settings>;
}

const ROWS: Row[] = [
  {
    key: 'sound',
    label: 'Sound effects',
    hint: 'Hits, chimes and fanfares',
    value: (s) => (s.sound ? 'On' : 'Off'),
    next: (s) => ({ sound: !s.sound }),
  },
  {
    key: 'narration',
    label: 'Read verses aloud',
    hint: 'The verse is still shown on screen',
    value: (s) => (s.narration ? 'On' : 'Off'),
    next: (s) => ({ narration: !s.narration }),
  },
  {
    key: 'readQuestions',
    label: 'Read questions aloud',
    hint: 'Reads the question and each answer you tap; then tap Confirm',
    value: (s) => (s.readQuestions ? 'On' : 'Off'),
    next: (s) => ({ readQuestions: !s.readQuestions }),
  },
  {
    key: 'readingSpeed',
    label: 'Reading speed',
    hint: 'How fast the verse is read and scrolls',
    value: (s) => s.readingSpeed[0]!.toUpperCase() + s.readingSpeed.slice(1),
    next: (s) => ({ readingSpeed: SPEEDS[(SPEEDS.indexOf(s.readingSpeed) + 1) % SPEEDS.length]! }),
  },
  {
    key: 'autoCollect',
    label: 'Auto-collect orbs',
    hint: 'Orbs collect themselves (easier to play)',
    value: (s) => (s.autoCollect ? 'On' : 'Off'),
    next: (s) => ({ autoCollect: !s.autoCollect }),
  },
  {
    key: 'timer',
    label: 'Question timer',
    hint: '20 seconds per question; running out counts as wrong',
    value: (s) => (s.timer ? '20 s' : 'Off'),
    next: (s) => ({ timer: !s.timer }),
  },
  ...(TEST_HOOKS_ENABLED
    ? [
        {
          key: 'quickTest',
          label: 'Quick test mode',
          hint: 'Test builds only: one hit defeats a foe; Skip on every reading',
          value: (s: Settings) => (s.quickTest ? 'On' : 'Off'),
          next: (s: Settings) => ({ quickTest: !s.quickTest }),
        },
        {
          key: 'unlockAll',
          label: 'Unlock all passages',
          hint: 'Test builds only: every passage on the map is open',
          value: (s: Settings) => (s.unlockAll ? 'On' : 'Off'),
          next: (s: Settings) => ({ unlockAll: !s.unlockAll }),
        },
      ]
    : []),
];

/** Settings (docs/DESIGN.md §5): saved with the player's progress. */
export class SettingsScene extends Phaser.Scene {
  private confirmReset = false;

  constructor() {
    super('settings');
  }

  create(): void {
    const from = (this.registry.get('settingsBack') as string | undefined) ?? 'map';
    const { insets, back } = menuFrame(this, 'Settings', from);
    const { width: W, height: H } = this.scale.gameSize;
    const s = progress.save.settings;
    const targets: Record<string, { x: number; y: number }> = { back: center(back) };
    const rowW = Math.min(W - 80, 860);
    const left = (W - rowW) / 2;

    // Rows share the height between the title and the Reset button, so a short phone screen
    // (or an extra test row) never runs them into it.
    const top = insets.top + 100;
    const bottom = H - insets.bottom - 50 - 28 - 14;
    const step = Math.min(92, (bottom - top) / ROWS.length);
    const boxH = step - 4;
    ROWS.forEach((row, i) => {
      const y = top + i * step;
      pixelBox(this, UI.button, left + rowW / 2, y + boxH / 2, rowW, boxH).setTint(0x3a3166);
      this.add.text(left + 24, y + boxH * 0.12, row.label, {
        fontFamily: FONT_UI,
        fontSize: '25px',
        fontStyle: 'bold',
        color: '#fdf6e3',
      });
      this.add.text(left + 24, y + boxH * 0.56, row.hint, {
        fontFamily: FONT_UI,
        fontSize: '17px',
        color: '#b9a9d9',
      });
      const b = new Button(this, left + rowW - 100, y + boxH / 2, {
        width: 160,
        height: Math.min(60, boxH - 14),
        radius: 30,
        label: row.value(s),
        fontSize: 24,
        fill: row.value(s) === 'Off' ? 0x4a4560 : COLOR.correct,
        onTap: () => {
          progress.update((save) => updateSettings(save, row.next(save.settings)));
          this.scene.restart();
        },
      });
      targets[`setting:${row.key}`] = center(b);
    });

    // Choose hero: opens the same screen new players see after the title.
    const hero = progress.save.settings.hero ?? 'boy';
    const heroBtn = new Button(this, W - insets.right - 24 - 120, insets.top + 50, {
      width: 240,
      height: 60,
      radius: 30,
      label: `Hero: ${hero === 'girl' ? 'Girl' : 'Boy'} ›`,
      fontSize: 22,
      fill: 0x8e6bd8,
      onTap: () => {
        this.registry.set('heroSelectNext', 'settings');
        this.scene.start('heroSelect');
      },
    });
    targets['hero'] = center(heroBtn);

    const reset = new Button(this, W / 2, H - insets.bottom - 50, {
      width: 300,
      height: 56,
      radius: 28,
      label: this.confirmReset ? 'Tap again to erase' : 'Reset progress',
      fontSize: 21,
      fill: this.confirmReset ? COLOR.wrong : 0x3a3150,
      onTap: () => {
        if (!this.confirmReset) {
          this.confirmReset = true;
          this.scene.restart();
          return;
        }
        this.confirmReset = false;
        progress.update(resetProgress);
        sfx.play('foeDefeat');
        this.scene.restart();
      },
    });
    targets['reset'] = center(reset);
    updateTestState({ ready: true, scene: 'settings', targets, gameWidth: W, gameHeight: H });
  }
}
