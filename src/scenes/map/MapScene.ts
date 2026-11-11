import Phaser from 'phaser';
import { ENCOUNTERS } from '../../content';
import type { Encounter } from '../../core/content/types';
import { readSafeAreaInsets, toGameInsets } from '../../services/safeArea';
import { updateTestState } from '../../services/testHooks';
import { sfx } from '../../services/sfx';
import { COLOR } from '../battle/actionInfo';
import { Button } from '../ui/Button';
import { FONT_TITLE, FONT_UI } from '../util';

const COLS = 4;
const CARD_H = 150;
const GAP = 18;

/**
 * Passage select (docs/DESIGN.md §7 Phase 3): a simple grid of the encounters in reading order.
 * Everything is open for now; locking and stars arrive with saves in Phase 5.
 */
export class MapScene extends Phaser.Scene {
  private cards = new Map<string, Phaser.GameObjects.Container>();
  private title!: Phaser.GameObjects.Text;
  private bg!: Phaser.GameObjects.Graphics;
  private back!: Button;

  constructor() {
    super('map');
  }

  create(): void {
    this.cards = new Map();
    this.bg = this.add.graphics();
    this.title = this.add
      .text(0, 0, 'Genesis 1–11 · Beginnings', {
        fontFamily: FONT_TITLE,
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#f4c95d',
        stroke: '#3a2a10',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0);
    this.back = new Button(this, 0, 0, {
      width: 130,
      height: 60,
      radius: 30,
      label: '‹ Title',
      fontSize: 22,
      fill: 0x2a2350,
      onTap: () => this.scene.start('title'),
    });

    const completed = new Set((this.registry.get('completed') as string[] | undefined) ?? []);
    ENCOUNTERS.forEach((e, i) =>
      this.cards.set(e.id, this.makeCard(e, i + 1, completed.has(e.id))),
    );

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    updateTestState({ ready: true, scene: 'map', battle: null, scripture: null });
  }

  private makeCard(e: Encounter, n: number, done: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    const num = this.add
      .text(0, 0, `${n}`, {
        fontFamily: FONT_TITLE,
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#f4c95d',
      })
      .setOrigin(0, 0);
    const title = this.add.text(0, 0, e.title, {
      fontFamily: FONT_UI,
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#fdf6e3',
      wordWrap: { width: 200, useAdvancedWrap: true },
    });
    const ref = this.add.text(0, 0, e.reference, {
      fontFamily: FONT_UI,
      fontSize: '18px',
      color: '#b9a9d9',
    });
    const check = this.add.text(0, 0, done ? '✔' : '', {
      fontFamily: FONT_UI,
      fontSize: '30px',
      color: '#5ee08a',
    });
    const hit = this.add.rectangle(0, 0, 10, 10, 0, 0).setOrigin(0).setInteractive();
    hit.on('pointerdown', () => {
      sfx.play('uiTap');
      this.registry.set('encounterId', e.id);
      this.registry.remove('collectedOrbs');
      this.cameras.main.fadeOut(200, 27, 21, 48);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('scripture'));
    });
    c.add([g, num, title, ref, check, hit]);
    c.setData({ g, num, title, ref, check, hit, done });
    return c;
  }

  private layout(): void {
    const { width: W, height: H } = this.scale.gameSize;
    const ins = toGameInsets(readSafeAreaInsets(), W, this.scale.displaySize.width);
    this.bg
      .clear()
      .fillGradientStyle(0x1b1340, 0x1b1340, 0x3d2a5c, 0x3d2a5c, 1)
      .fillRect(0, 0, W, H);
    this.title.setPosition(W / 2, ins.top + 20);
    this.back.setPosition(ins.left + 24 + 65, ins.top + 50);

    const left = ins.left + 32;
    const usable = W - left - ins.right - 32;
    const cardW = (usable - GAP * (COLS - 1)) / COLS;
    const top = ins.top + 100;
    let i = 0;
    for (const c of this.cards.values()) {
      const x = left + (i % COLS) * (cardW + GAP);
      const y = top + Math.floor(i / COLS) * (CARD_H + GAP);
      c.setPosition(x, y);
      const d = c.data.values as Record<
        string,
        Phaser.GameObjects.GameObject & { setPosition: (x: number, y: number) => unknown }
      >;
      const g = d.g as unknown as Phaser.GameObjects.Graphics;
      g.clear()
        .fillStyle(COLOR.panel, 0.95)
        .fillRoundedRect(0, 0, cardW, CARD_H, 18)
        .lineStyle(3, d.done ? 0x5ee08a : COLOR.gold, d.done ? 0.9 : 0.5)
        .strokeRoundedRect(0, 0, cardW, CARD_H, 18);
      d.num!.setPosition(18, 12);
      (d.title as unknown as Phaser.GameObjects.Text)
        .setPosition(84, 18)
        .setWordWrapWidth(cardW - 104);
      d.ref!.setPosition(84, CARD_H - 36);
      d.check!.setPosition(cardW - 42, 12);
      (d.hit as unknown as Phaser.GameObjects.Rectangle).setSize(cardW, CARD_H);
      i++;
    }
    this.sync();
  }

  private sync(): void {
    const targets: Record<string, { x: number; y: number }> = {};
    const { width, height } = this.scale.gameSize;
    for (const [id, c] of this.cards) {
      const hit = c.getData('hit') as Phaser.GameObjects.Rectangle;
      targets[`stage:${id}`] = {
        x: Math.round(c.x + hit.width / 2),
        y: Math.round(c.y + hit.height / 2),
      };
    }
    targets['back'] = { x: Math.round(this.back.x), y: Math.round(this.back.y) };
    updateTestState({ gameWidth: width, gameHeight: height, targets, busy: false });
  }
}
