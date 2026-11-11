import Phaser from 'phaser';
import { ENCOUNTERS } from '../../content';
import type { Encounter } from '../../core/content/types';
import type { DebugParams } from '../../core/debugParams';
import { availableStars, isUnlocked, totalStars } from '../../core/progress/progress';
import { progress } from '../../services/progress';
import { readSafeAreaInsets, toGameInsets } from '../../services/safeArea';
import { sfx } from '../../services/sfx';
import { updateTestState } from '../../services/testHooks';
import { COLOR } from '../battle/actionInfo';
import { Button } from '../ui/Button';
import { FONT_TITLE, FONT_UI } from '../util';

const COLS = 4;
const CARD_H = 150;
const GAP = 18;

interface Card {
  c: Phaser.GameObjects.Container;
  g: Phaser.GameObjects.Graphics;
  num: Phaser.GameObjects.Text;
  title: Phaser.GameObjects.Text;
  ref: Phaser.GameObjects.Text;
  stars: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
  open: boolean;
  done: boolean;
}

/**
 * Passage select (docs/DESIGN.md §2.5): passages in reading order with best stars; each opens
 * when the one before it is won. The last grid slot holds Upgrades, Verse Journal and Settings.
 */
export class MapScene extends Phaser.Scene {
  private cards = new Map<string, Card>();
  private heading!: Phaser.GameObjects.Text;
  private starCount!: Phaser.GameObjects.Text;
  private bg!: Phaser.GameObjects.Graphics;
  private back!: Button;
  private menu: Button[] = [];

  constructor() {
    super('map');
  }

  create(): void {
    const debug = this.registry.get('debug') as DebugParams;
    const save = progress.save;
    const order = ENCOUNTERS.map((e) => e.id);
    this.cards = new Map();
    this.bg = this.add.graphics();
    this.heading = this.add
      .text(0, 0, 'Genesis 1–11 · Beginnings', {
        fontFamily: FONT_TITLE,
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#f4c95d',
        stroke: '#3a2a10',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0);
    this.starCount = this.add
      .text(0, 0, `★ ${totalStars(save)}`, {
        fontFamily: FONT_UI,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#f4c95d',
      })
      .setOrigin(1, 0.5)
      .setShadow(2, 2, '#000', 3);
    this.back = new Button(this, 0, 0, {
      width: 130,
      height: 60,
      radius: 30,
      label: '‹ Title',
      fontSize: 22,
      fill: 0x2a2350,
      onTap: () => this.scene.start('title'),
    });

    ENCOUNTERS.forEach((e, i) => {
      const open = debug.unlockAll || isUnlocked(save, order, e.id);
      this.cards.set(e.id, this.makeCard(e, i + 1, open, save.completed[e.id]?.stars ?? 0));
    });

    const spend = availableStars(save);
    this.menu = [
      ['upgrades', spend > 0 ? `💪 Upgrades (★${spend})` : '💪 Upgrades', 0x8e44ad],
      ['journal', '📖 Verse Journal', 0x2e86de],
      ['settings', '⚙️ Settings', 0x4a4560],
    ].map(
      ([key, label, fill]) =>
        new Button(this, 0, 0, {
          width: 200,
          height: 44,
          radius: 22,
          label: label as string,
          fontSize: 19,
          fill: fill as number,
          onTap: () => this.scene.start(key as string),
        }),
    );

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    updateTestState({ ready: true, scene: 'map', battle: null, scripture: null });
  }

  private makeCard(e: Encounter, n: number, open: boolean, stars: number): Card {
    const c = this.add.container(0, 0).setAlpha(open ? 1 : 0.5);
    const g = this.add.graphics();
    const num = this.add.text(0, 0, open ? `${n}` : '🔒', {
      fontFamily: FONT_TITLE,
      fontSize: open ? '40px' : '30px',
      fontStyle: 'bold',
      color: '#f4c95d',
    });
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
    const starText = this.add.text(
      0,
      0,
      stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '',
      {
        fontFamily: FONT_UI,
        fontSize: '24px',
        color: '#f4c95d',
      },
    );
    const hit = this.add.rectangle(0, 0, 10, 10, 0, 0).setOrigin(0).setInteractive();
    hit.on('pointerdown', () => {
      if (!open) {
        this.tweens.add({ targets: c, x: c.x + 6, duration: 50, yoyo: true, repeat: 1 });
        return;
      }
      sfx.play('uiTap');
      this.registry.set('encounterId', e.id);
      this.registry.remove('collectedOrbs');
      this.cameras.main.fadeOut(200, 27, 21, 48);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('scripture'));
    });
    c.add([g, num, title, ref, starText, hit]);
    return { c, g, num, title, ref, stars: starText, hit, open, done: stars > 0 };
  }

  private layout(): void {
    const { width: W, height: H } = this.scale.gameSize;
    const ins = toGameInsets(readSafeAreaInsets(), W, this.scale.displaySize.width);
    this.bg
      .clear()
      .fillGradientStyle(0x1b1340, 0x1b1340, 0x3d2a5c, 0x3d2a5c, 1)
      .fillRect(0, 0, W, H);
    this.heading.setPosition(W / 2, ins.top + 22);
    this.back.setPosition(ins.left + 24 + 65, ins.top + 50);
    this.starCount.setPosition(W - ins.right - 32, ins.top + 50);

    const left = ins.left + 32;
    const usable = W - left - ins.right - 32;
    const cardW = (usable - GAP * (COLS - 1)) / COLS;
    const top = ins.top + 100;
    const slot = (i: number) => ({
      x: left + (i % COLS) * (cardW + GAP),
      y: top + Math.floor(i / COLS) * (CARD_H + GAP),
    });

    let i = 0;
    for (const card of this.cards.values()) {
      const { x, y } = slot(i++);
      card.c.setPosition(x, y);
      card.g
        .clear()
        .fillStyle(COLOR.panel, 0.95)
        .fillRoundedRect(0, 0, cardW, CARD_H, 18)
        .lineStyle(3, card.done ? 0x5ee08a : COLOR.gold, card.done ? 0.9 : 0.5)
        .strokeRoundedRect(0, 0, cardW, CARD_H, 18);
      card.num.setPosition(18, 12);
      card.title.setPosition(84, 18).setWordWrapWidth(cardW - 104);
      card.ref.setPosition(84, CARD_H - 36);
      card.stars.setPosition(cardW - 96, CARD_H - 40);
      card.hit.setSize(cardW, CARD_H);
    }

    // Menu buttons stacked in the next free slot.
    const m = slot(i);
    this.menu.forEach((b, k) =>
      b.setPosition(m.x + cardW / 2, m.y + 24 + k * 51).setScale(Math.min(1, cardW / 210)),
    );
    this.sync();
  }

  private sync(): void {
    const targets: Record<string, { x: number; y: number }> = {};
    const { width, height } = this.scale.gameSize;
    for (const [id, card] of this.cards) {
      targets[`stage:${id}`] = {
        x: Math.round(card.c.x + card.hit.width / 2),
        y: Math.round(card.c.y + CARD_H / 2),
      };
    }
    targets['back'] = { x: Math.round(this.back.x), y: Math.round(this.back.y) };
    ['upgrades', 'journal', 'settings'].forEach((k, i) => {
      const b = this.menu[i]!;
      targets[k] = { x: Math.round(b.x), y: Math.round(b.y) };
    });
    updateTestState({
      gameWidth: width,
      gameHeight: height,
      targets,
      busy: false,
      map: [...this.cards].map(([id, c]) => ({
        id,
        open: c.open,
        stars: progress.save.completed[id]?.stars ?? 0,
      })),
    });
  }
}
