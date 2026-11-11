import Phaser from 'phaser';
import { ENCOUNTERS } from '../../content';
import { progress } from '../../services/progress';
import { updateTestState } from '../../services/testHooks';
import { COLOR } from '../battle/actionInfo';
import { Button } from '../ui/Button';
import { FONT_TITLE, FONT_UI } from '../util';
import { center, menuFrame } from './menuFrame';

/** Verse Journal (docs/DESIGN.md §2.5): reread every passage you have completed. */
export class JournalScene extends Phaser.Scene {
  private page?: Phaser.GameObjects.Container;

  constructor() {
    super('journal');
  }

  create(): void {
    const { insets, back } = menuFrame(this, 'Verse Journal');
    const { width: W, height: H } = this.scale.gameSize;
    const done = ENCOUNTERS.filter((e) => e.id in progress.save.completed);
    const targets: Record<string, { x: number; y: number }> = { back: center(back) };
    this.page = undefined;

    if (done.length === 0) {
      this.add
        .text(W / 2, H / 2, 'Win a passage to add it to your journal.', {
          fontFamily: FONT_UI,
          fontSize: '28px',
          color: '#fdf6e3',
        })
        .setOrigin(0.5);
      this.publish(targets, null);
      return;
    }

    // Passage list on the left, the chosen passage on a parchment page on the right.
    const listX = insets.left + 32 + 140;
    const rows = Math.max(1, Math.floor((H - insets.top - 140) / 52));
    done.slice(0, rows).forEach((e, i) => {
      const b = new Button(this, listX, insets.top + 130 + i * 52, {
        width: 280,
        height: 44,
        radius: 22,
        label: e.title,
        fontSize: 19,
        fill: 0x2a2350,
        onTap: () => this.show(e.id),
      });
      targets[`entry:${e.id}`] = center(b);
    });
    this.show(done[0]!.id);
    this.publish(targets, done[0]!.id);
  }

  private show(id: string): void {
    const e = ENCOUNTERS.find((x) => x.id === id)!;
    const { width: W, height: H } = this.scale.gameSize;
    const x = 340;
    const w = W - x - 40;
    const h = H - 140;
    this.page?.destroy();
    const bg = this.add.graphics();
    bg.fillStyle(COLOR.card, 1)
      .fillRoundedRect(0, 0, w, h, 24)
      .lineStyle(4, COLOR.gold)
      .strokeRoundedRect(0, 0, w, h, 24);
    const head = this.add.text(28, 22, `${e.title} · ${e.reference} (${e.translation})`, {
      fontFamily: FONT_UI,
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#8a5a00',
    });
    const body = this.add.text(28, 66, e.verses.map((v) => `${v.ref}  ${v.text}`).join('\n\n'), {
      fontFamily: FONT_TITLE,
      fontSize: '26px',
      color: COLOR.ink,
      lineSpacing: 6,
      wordWrap: { width: w - 56, useAdvancedWrap: true },
    });
    const stars = progress.save.completed[id]?.stars ?? 0;
    const starText = this.add
      .text(w - 28, 22, '★'.repeat(stars) + '☆'.repeat(3 - stars), {
        fontFamily: FONT_UI,
        fontSize: '26px',
        color: '#b07d00',
      })
      .setOrigin(1, 0);
    this.page = this.add.container(x, 110, [bg, head, body, starText]);
    updateTestState({ journalOpen: id });
  }

  private publish(targets: Record<string, { x: number; y: number }>, open: string | null): void {
    const { width, height } = this.scale.gameSize;
    updateTestState({
      ready: true,
      scene: 'journal',
      targets,
      gameWidth: width,
      gameHeight: height,
      journalOpen: open,
    });
  }
}
