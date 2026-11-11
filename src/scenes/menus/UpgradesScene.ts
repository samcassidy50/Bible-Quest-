import Phaser from 'phaser';
import {
  availableStars,
  buyUpgrade,
  canBuyUpgrade,
  heroBuild,
  MAX_UPGRADE_LEVEL,
  nextUpgradeCost,
  UPGRADE_IDS,
  UPGRADES,
} from '../../core/progress/progress';
import { progress } from '../../services/progress';
import { sfx } from '../../services/sfx';
import { updateTestState } from '../../services/testHooks';
import { COLOR } from '../battle/actionInfo';
import { Button } from '../ui/Button';
import { FONT_UI } from '../util';
import { center, menuFrame } from './menuFrame';

/** Spend stars on hero upgrades (docs/DESIGN.md §2.5). */
export class UpgradesScene extends Phaser.Scene {
  constructor() {
    super('upgrades');
  }

  create(): void {
    const { insets, back } = menuFrame(this, 'Upgrades');
    const { width: W } = this.scale.gameSize;
    const save = progress.save;
    const build = heroBuild(save.upgrades);

    this.add
      .text(W - insets.right - 32, insets.top + 50, `★ ${availableStars(save)} to spend`, {
        fontFamily: FONT_UI,
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#f4c95d',
      })
      .setOrigin(1, 0.5);
    this.add
      .text(
        W / 2,
        insets.top + 92,
        `Hero: ${build.hero.maxHp} HP · ${build.hero.attack} attack · specials ×${build.specialPower.toFixed(1)} · ultimate +${build.ultimateBonus}×`,
        {
          fontFamily: FONT_UI,
          fontSize: '20px',
          color: '#b9a9d9',
        },
      )
      .setOrigin(0.5, 0);

    const targets: Record<string, { x: number; y: number }> = { back: center(back) };
    const rowW = Math.min(W - 80, 900);
    const left = (W - rowW) / 2;
    UPGRADE_IDS.forEach((id, i) => {
      const y = insets.top + 150 + i * 112;
      const info = UPGRADES[id];
      const level = save.upgrades[id];
      this.add.graphics().fillStyle(COLOR.panel, 0.95).fillRoundedRect(left, y, rowW, 96, 18);
      this.add.text(left + 24, y + 48, info.icon, { fontSize: '40px' }).setOrigin(0, 0.5);
      this.add.text(left + 84, y + 16, info.name, {
        fontFamily: FONT_UI,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#fdf6e3',
      });
      this.add.text(left + 84, y + 54, `${info.perLevel} per level`, {
        fontFamily: FONT_UI,
        fontSize: '19px',
        color: '#b9a9d9',
      });
      const pips = this.add.graphics();
      for (let p = 0; p < MAX_UPGRADE_LEVEL; p++) {
        pips
          .fillStyle(p < level ? COLOR.gold : 0x3a3150)
          .fillCircle(left + rowW - 300 + p * 34, y + 48, 12);
      }
      const cost = nextUpgradeCost(save, id);
      const b = new Button(this, left + rowW - 100, y + 48, {
        width: 160,
        height: 64,
        radius: 32,
        label: cost === null ? 'MAX' : `Buy ★${cost}`,
        fontSize: 24,
        fill: cost === null ? 0x4a4560 : COLOR.correct,
        onTap: () => {
          if (!canBuyUpgrade(progress.save, id)) return;
          progress.update((s) => buyUpgrade(s, id));
          sfx.play('poweredUp');
          this.scene.restart();
        },
      }).setEnabled(canBuyUpgrade(save, id));
      targets[`buy:${id}`] = center(b);
    });

    const { width, height } = this.scale.gameSize;
    updateTestState({
      ready: true,
      scene: 'upgrades',
      targets,
      gameWidth: width,
      gameHeight: height,
    });
  }
}
