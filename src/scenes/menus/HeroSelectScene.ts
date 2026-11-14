import Phaser from 'phaser';
import type { DebugParams } from '../../core/debugParams';
import { updateSettings, type HeroKind } from '../../core/progress/progress';
import { progress } from '../../services/progress';
import { readSafeAreaInsets, toGameInsets } from '../../services/safeArea';
import { sfx } from '../../services/sfx';
import { updateTestState } from '../../services/testHooks';
import { Backdrop } from '../backdrop/Backdrop';
import { HERO_SCALE, HeroSprite } from '../hero/HeroSprite';
import { Button } from '../ui/Button';
import { pixelBox, UI } from '../ui/pixelUi';
import { FONT_TITLE, FONT_UI } from '../util';
import { COLOR } from '../battle/actionInfo';

const HEROES: HeroKind[] = ['boy', 'girl'];

/**
 * "Choose your hero": both heroes side by side on parchment cards. New players see it after the
 * title; Settings opens it again. Tapping a hero saves the choice and moves on.
 * Registry `heroSelectNext` names the scene to go to afterwards (default: the map).
 */
export class HeroSelectScene extends Phaser.Scene {
  private backdrop?: Backdrop;
  private frozen = false;
  private choosing = false;

  constructor() {
    super('heroSelect');
  }

  create(): void {
    const debug = this.registry.get('debug') as DebugParams;
    this.frozen = debug.freeze;
    this.choosing = false;
    const next = (this.registry.get('heroSelectNext') as string | undefined) ?? 'map';
    const { width: W, height: H } = this.scale.gameSize;
    const insets = toGameInsets(readSafeAreaInsets(), W, this.scale.displaySize.width);
    const current = progress.save.settings.hero;

    this.backdrop = new Backdrop(this, 'garden', undefined, this.frozen);
    this.backdrop.layout(W, H, H * 0.82);
    this.add.rectangle(0, 0, W, H, 0x05030d, 0.35).setOrigin(0).setDepth(-5);

    this.add
      .text(W / 2, insets.top + 56, 'Choose your hero', {
        fontFamily: FONT_TITLE,
        fontSize: '56px',
        fontStyle: 'bold',
        color: '#ffd76a',
        stroke: '#3a1d08',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    const targets: Record<string, { x: number; y: number }> = {};
    const cardW = 300;
    const cardH = 380;
    const cy = H / 2 + 50;
    HEROES.forEach((kind, i) => {
      const cx = W / 2 + (i === 0 ? -1 : 1) * (cardW / 2 + 40);
      const chosen = current === kind;
      if (chosen) this.add.circle(cx, cy, cardW * 0.62, COLOR.gold, 0.35);
      const card = pixelBox(this, UI.panel, cx, cy, cardW, cardH);
      const hero = new HeroSprite(this, cx, cy + 90, kind).setScale(HERO_SCALE * 1.25);
      hero.frozen = this.frozen;
      hero.loop('idle');
      if (chosen) {
        this.add
          .text(cx, cy + cardH / 2 - 52, '✔ Playing', {
            fontFamily: FONT_UI,
            fontSize: '24px',
            fontStyle: 'bold',
            color: '#2e7d32',
          })
          .setOrigin(0.5);
      }
      card.setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => void this.choose(kind, hero, next));
      targets[`hero:${kind}`] = { x: Math.round(cx), y: Math.round(cy) };
    });

    // Back only when opened from Settings (a new player must pick).
    if (current !== null) {
      const back = new Button(this, insets.left + 24 + 65, insets.top + 50, {
        width: 130,
        height: 60,
        radius: 30,
        label: '‹ Back',
        fontSize: 22,
        fill: 0x2a2350,
        onTap: () => this.scene.start(next),
      });
      targets['back'] = { x: Math.round(back.x), y: Math.round(back.y) };
    }

    this.events.once('shutdown', () => this.backdrop?.destroy());
    updateTestState({ ready: true, scene: 'heroSelect', targets, gameWidth: W, gameHeight: H });
  }

  update(_t: number, delta: number): void {
    if (!this.frozen) this.backdrop?.scroll(delta * 0.3);
  }

  private async choose(kind: HeroKind, hero: HeroSprite, next: string): Promise<void> {
    if (this.choosing) return;
    this.choosing = true;
    progress.update((s) => updateSettings(s, { hero: kind }));
    updateTestState({ save: progress.save });
    sfx.play('start');
    await hero.act('victory');
    this.cameras.main.fadeOut(200, 27, 21, 48);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(next));
  }
}
