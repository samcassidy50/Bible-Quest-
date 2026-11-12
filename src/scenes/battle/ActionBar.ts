import Phaser from 'phaser';
import type { BattleEngine } from '../../core/battle/BattleEngine';
import { SPECIAL_IDS, type ActionId } from '../../core/battle/types';
import { Button } from '../ui/Button';
import { FONT_UI } from '../util';
import { ACTION_INFO, COLOR } from './actionInfo';

const LOCKED_FILL = 0x4a4560;

/**
 * Bottom-right action bar (docs/DESIGN.md §5): Attack in the thumb's resting spot, the four
 * specials on an arc around it, and the Faith Ultimate further left.
 * The container's origin is the centre of the Attack button.
 */
export class ActionBar extends Phaser.GameObjects.Container {
  readonly buttons = new Map<ActionId, Button>();
  private readonly captions = new Map<ActionId, Phaser.GameObjects.Text>();
  private readonly ultGlow: Phaser.GameObjects.Arc;
  private glowTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, onAction: (a: ActionId) => void) {
    super(scene, 0, 0);

    // Specials on a loose arc up and to the left of Attack, spaced so captions never overlap.
    const specialPos: Record<(typeof SPECIAL_IDS)[number], { x: number; y: number }> = {
      sword: { x: -178, y: 22 },
      shield: { x: -168, y: -112 },
      breastplate: { x: -66, y: -192 },
      sandals: { x: 54, y: -196 },
    };
    const ULT = { x: -322, y: 20 };

    this.ultGlow = scene.add.circle(ULT.x, ULT.y, 66, COLOR.gold, 0.35).setVisible(false);
    this.add(this.ultGlow);

    const make = (id: ActionId, x: number, y: number, diameter: number, iconSize: number) => {
      const info = ACTION_INFO[id];
      const b = new Button(scene, x, y, {
        width: diameter,
        height: diameter,
        radius: diameter / 2,
        label: info.icon,
        fontSize: iconSize,
        fill: info.color,
        onTap: () => onAction(id),
      });
      const caption = scene.add
        .text(x, y + diameter / 2 + 4, info.short, {
          fontFamily: FONT_UI,
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0)
        .setShadow(2, 2, '#000000', 3);
      this.add([b, caption]);
      this.buttons.set(id, b);
      this.captions.set(id, caption);
    };

    make('attack', 0, 0, 132, 52);
    SPECIAL_IDS.forEach((id) => make(id, specialPos[id].x, specialPos[id].y, 84, 34));
    make('ultimate', ULT.x, ULT.y, 104, 44);

    scene.add.existing(this);
  }

  /** Reflects the engine state: not yet earned / too little energy / ready, and whether input is allowed. */
  refresh(engine: BattleEngine, inputEnabled: boolean): void {
    const available = new Set(engine.availableActions());

    for (const id of SPECIAL_IDS) {
      const b = this.buttons.get(id)!;
      const caption = this.captions.get(id)!;
      const cost = `${ACTION_INFO[id].short} ⚡${engine.costOf(id)}`;
      if (!engine.isUnlocked(id)) {
        // Not earned yet on the map: hidden entirely.
        b.setEnabled(false).setVisible(false);
        caption.setVisible(false);
        continue;
      }
      b.setVisible(true);
      caption.setVisible(true);
      if (!engine.canAfford(id)) {
        b.setFill(ACTION_INFO[id].color).setText(ACTION_INFO[id].icon).setEnabled(false);
        caption.setText(cost).setAlpha(0.6);
      } else {
        b.setFill(ACTION_INFO[id].color)
          .setText(ACTION_INFO[id].icon)
          .setEnabled(inputEnabled && available.has(id));
        caption.setText(cost).setAlpha(1);
      }
    }

    this.buttons.get('attack')!.setEnabled(inputEnabled && available.has('attack'));

    const ult = this.buttons.get('ultimate')!;
    const ready = engine.ultimateReady;
    ult
      .setFill(ready ? ACTION_INFO.ultimate.color : LOCKED_FILL)
      .setText(ACTION_INFO.ultimate.icon)
      .setEnabled(inputEnabled && available.has('ultimate'))
      .setVisible(engine.ultimateUnlocked);
    this.captions
      .get('ultimate')!
      .setText(ready ? 'Ultimate!' : `Faith ${engine.faith}/5`)
      .setVisible(engine.ultimateUnlocked);
    this.setGlow(ready);
  }

  private setGlow(on: boolean): void {
    this.ultGlow.setVisible(on);
    if (on && !this.glowTween) {
      this.glowTween = this.scene.tweens.add({
        targets: this.ultGlow,
        scale: 1.25,
        alpha: 0.1,
        duration: 700,
        yoyo: true,
        repeat: -1,
      });
    } else if (!on && this.glowTween) {
      this.glowTween.stop();
      this.glowTween = undefined;
      this.ultGlow.setScale(1).setAlpha(0.35);
    }
  }
}
