import Phaser from 'phaser';
import { pixelBox, UI } from '../ui/pixelUi';
import type { SpecialId } from '../../core/battle/types';
import { TUNING } from '../../core/battle/tuning';
import type { Insets } from '../../services/safeArea';
import { itemSprite } from '../items';
import { Button } from '../ui/Button';
import { FONT_TITLE, FONT_UI } from '../util';
import { ACTION_INFO, ARMOR_ABOUT, COLOR } from './actionInfo';

/**
 * The page shown once the angel's gift reaches the hero: the new armor piece, large, with its
 * name, what it does in battle and its energy cost.
 */
export class ArmorPage extends Phaser.GameObjects.Container {
  readonly continueButton: Button;

  constructor(
    scene: Phaser.Scene,
    unlock: SpecialId | 'ultimate',
    insets: Insets,
    onContinue: () => void,
  ) {
    const { width: W, height: H } = scene.scale.gameSize;
    super(scene, W / 2, H / 2);
    const info = ACTION_INFO[unlock];
    const about = ARMOR_ABOUT[unlock];

    const cw = Math.min(W - insets.left - insets.right - 48, 860);
    const ch = Math.min(H - insets.top - insets.bottom - 48, 400);
    const bg = pixelBox(scene, UI.panel, 0, 0, cw, ch);

    // The item on a soft glow on the left; the words on the right.
    const ix = -cw / 2 + 150;
    const glow = scene.add.circle(ix, -30, 110, 0xfff1b0, 0.7);
    const item = itemSprite(scene, unlock).setPosition(ix, -30).setScale(4);
    if (unlock === 'sword') item.setAngle(-45);

    const tx = -cw / 2 + 300;
    const tw = cw / 2 - tx - 36;
    const title = scene.add.text(tx, -ch / 2 + 48, info.name, {
      fontFamily: FONT_TITLE,
      fontSize: '38px',
      fontStyle: 'bold',
      color: '#8a5a00',
      wordWrap: { width: tw, useAdvancedWrap: true },
    });
    const text = scene.add.text(tx, title.y + title.height + 16, about, {
      fontFamily: FONT_UI,
      fontSize: '24px',
      color: COLOR.ink,
      lineSpacing: 6,
      wordWrap: { width: tw, useAdvancedWrap: true },
    });
    const how =
      unlock === 'ultimate'
        ? 'Ready when your Faith meter is full.'
        : `Costs ⚡${TUNING.energy.cost[unlock]} energy. Collect ⚡ orbs while the verse is read.`;
    const cost = scene.add.text(tx, text.y + text.height + 14, how, {
      fontFamily: FONT_UI,
      fontSize: '20px',
      color: '#6b5d84',
      wordWrap: { width: tw, useAdvancedWrap: true },
    });
    // Centred, away from the Receive button, so a quick double tap can't skip the page.
    this.continueButton = new Button(scene, tx + tw / 2, ch / 2 - 64, {
      width: 220,
      height: 76,
      radius: 38,
      label: 'Got it!',
      fontSize: 28,
      fill: COLOR.correct,
      onTap: onContinue,
    });

    this.add([bg, glow, item, title, text, cost, this.continueButton]);
    scene.add.existing(this);
  }
}
