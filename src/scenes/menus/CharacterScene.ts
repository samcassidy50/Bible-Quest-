import Phaser from 'phaser';
import { ENCOUNTERS } from '../../content';
import { characterSheet } from '../../core/progress/characterSheet';
import { RUNES } from '../../core/battle/runes';
import { runeIcon } from '../runeIcon';
import { progress } from '../../services/progress';
import { updateTestState } from '../../services/testHooks';
import { ACTION_INFO } from '../battle/actionInfo';
import { HERO_SCALE, HeroSprite, currentHero } from '../hero/HeroSprite';
import { iconSprite } from '../icons';
import { Button } from '../ui/Button';
import { PIXEL_INK, pixelBox, UI, UI_SCALE } from '../ui/pixelUi';
import { FONT_UI } from '../util';
import type { DebugParams } from '../../core/debugParams';
import { center, menuFrame } from './menuFrame';

const SOFT_INK = '#7a5a3a';

/**
 * Character sheet: the chosen hero with the armor they have earned, and their battle stats
 * (core/progress/characterSheet.ts, the same numbers a fight uses). Pixel UI throughout.
 */
export class CharacterScene extends Phaser.Scene {
  constructor() {
    super('character');
  }

  create(): void {
    const debug = this.registry.get('debug') as DebugParams;
    const { insets, back } = menuFrame(this, 'Your Hero', 'map');
    const { width: W, height: H } = this.scale.gameSize;
    const sheet = characterSheet(progress.save, ENCOUNTERS);
    const targets: Record<string, { x: number; y: number }> = { back: center(back) };

    const top = insets.top + 96;
    const bottom = H - insets.bottom - 24;
    const ph = bottom - top;
    const gap = 24;
    const leftW = 330;
    const total = Math.min(W - insets.left - insets.right - 48, 1180);
    const x0 = (W - total) / 2;
    const rightW = total - leftW - gap;

    // ── Left: the hero, their armor, stars ──────────────────────────────────────
    const lx = x0 + leftW / 2;
    pixelBox(this, UI.panel, lx, top + ph / 2, leftW, ph);
    this.add.circle(lx, top + 168, 92, 0xfff1b0, 0.75);
    const hero = new HeroSprite(this, lx, top + 262).setScale(HERO_SCALE * 1.15);
    hero.frozen = debug.freeze;
    hero.loop('idle');

    const armorY = top + 318;
    this.add
      .text(lx, armorY, 'Armor', {
        fontFamily: FONT_UI,
        fontSize: '22px',
        fontStyle: 'bold',
        color: PIXEL_INK,
      })
      .setOrigin(0.5, 0);
    const pieces = [...sheet.armor, ...(sheet.ultimate ? (['ultimate'] as const) : [])];
    if (pieces.length === 0) {
      this.add
        .text(lx, armorY + 36, 'None yet: win passages\non the map to earn it.', {
          fontFamily: FONT_UI,
          fontSize: '17px',
          color: SOFT_INK,
          align: 'center',
        })
        .setOrigin(0.5, 0);
    } else {
      const step = 58;
      pieces.forEach((id, i) => {
        const x = lx + (i - (pieces.length - 1) / 2) * step;
        pixelBox(this, UI.button, x, armorY + 58, 52, 52).setTint(0x3a3166);
        iconSprite(this, id, 2).setPosition(x, armorY + 56);
      });
      const names = pieces.map((id) => ACTION_INFO[id].short).join(' · ');
      this.add
        .text(lx, armorY + 92, names, {
          fontFamily: FONT_UI,
          fontSize: '15px',
          color: SOFT_INK,
          align: 'center',
          wordWrap: { width: leftW - 60 },
        })
        .setOrigin(0.5, 0);
    }

    this.add
      .text(lx, bottom - 112, `★ ${sheet.stars} stars · ${sheet.passagesDone} passages`, {
        fontFamily: FONT_UI,
        fontSize: '19px',
        fontStyle: 'bold',
        color: '#b07d00',
      })
      .setOrigin(0.5);
    const change = new Button(this, lx, bottom - 62, {
      width: 220,
      height: 54,
      label: 'Change hero',
      fontSize: 20,
      fill: 0x8e6bd8,
      onTap: () => {
        this.registry.set('heroSelectNext', 'character');
        this.scene.start('heroSelect');
      },
    });
    targets['change-hero'] = center(change);

    // ── Right: the stats ────────────────────────────────────────────────────────
    const rx = x0 + leftW + gap;
    pixelBox(this, UI.panel, rx + rightW / 2, top + ph / 2, rightW, ph);
    const pad = 16 * UI_SCALE;
    const rowH = (ph - pad * 2) / sheet.stats.length;
    sheet.stats.forEach((stat, i) => {
      const y = top + pad + i * rowH;
      if (i > 0) this.add.rectangle(rx + pad, y, rightW - pad * 2, 3, 0xc9b27a).setOrigin(0, 0.5);
      const label = this.add.text(rx + pad, y + 10, stat.label, {
        fontFamily: FONT_UI,
        fontSize: '24px',
        fontStyle: 'bold',
        color: PIXEL_INK,
      });
      this.add
        .text(rx + rightW - pad, y + 8, stat.value, {
          fontFamily: FONT_UI,
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#8a5a00',
        })
        .setOrigin(1, 0);
      this.add.text(rx + pad, y + 40, stat.detail, {
        fontFamily: FONT_UI,
        fontSize: '16px',
        color: SOFT_INK,
        wordWrap: { width: rightW - pad * 2 - 150, useAdvancedWrap: true },
      });
      // The set blessings that change this stat, in their item's colour.
      stat.runes.forEach((kind, n) =>
        runeIcon(this, rx + pad + label.width + 22 + n * 30, y + 24, 24, RUNES[kind].item, kind),
      );
    });

    updateTestState({
      ready: true,
      scene: 'character',
      targets,
      gameWidth: W,
      gameHeight: H,
      character: {
        hero: currentHero(this),
        stats: sheet.stats.map((s) => ({ id: s.id, value: s.value })),
        armor: pieces,
      },
    });
  }
}
