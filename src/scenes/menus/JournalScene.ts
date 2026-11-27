import Phaser from 'phaser';
import { ENCOUNTERS } from '../../content';
import { progress } from '../../services/progress';
import { updateTestState } from '../../services/testHooks';
import { COLOR } from '../battle/actionInfo';
import { Button } from '../ui/Button';
import { FONT_TITLE, FONT_UI } from '../util';
import { center, menuFrame } from './menuFrame';

const ROW = 52;

/**
 * Verse Journal (docs/DESIGN.md §2.5): reread every passage you have completed. The list pages
 * when there are more passages than fit on the screen, and a long passage scrolls inside its page
 * (drag or mouse wheel).
 */
export class JournalScene extends Phaser.Scene {
  private page?: Phaser.GameObjects.Container;
  /** Which page of the passage list is shown (0-based), kept across restarts. */
  private listPage = 0;
  private open: string | null = null;
  private body?: Phaser.GameObjects.Text;
  private bodyTop = 0;
  private bodyRoom = 0;
  private drag: { y: number; start: number } | null = null;
  /** Left edge of the passage page: just right of the list (which starts after the safe area). */
  private pageX = 340;
  private rightInset = 0;

  constructor() {
    super('journal');
  }

  init(data: { listPage?: number; open?: string | null }): void {
    this.listPage = data.listPage ?? 0;
    this.open = data.open ?? null;
  }

  create(): void {
    const { insets, back } = menuFrame(this, 'Verse Journal');
    const { width: W, height: H } = this.scale.gameSize;
    const done = ENCOUNTERS.filter((e) => e.id in progress.save.completed);
    const targets: Record<string, { x: number; y: number }> = { back: center(back) };
    this.page = undefined;
    this.body = undefined;

    if (done.length === 0) {
      this.add
        .text(W / 2, H / 2, 'Win a passage to add it to your journal.', {
          fontFamily: FONT_UI,
          fontSize: '28px',
          color: '#fdf6e3',
        })
        .setOrigin(0.5);
      this.publish(targets, null, 0, 0);
      return;
    }

    // Passage list on the left, a page of it at a time; the chosen passage on the right.
    const listX = insets.left + 32 + 140;
    this.pageX = listX + 140 + 28;
    this.rightInset = insets.right;
    const fit = Math.max(2, Math.floor((H - insets.top - 140) / ROW));
    const paged = done.length > fit;
    const perPage = paged ? fit - 1 : fit; // the last row holds the page buttons
    const pages = Math.ceil(done.length / perPage);
    this.listPage = Phaser.Math.Clamp(this.listPage, 0, pages - 1);
    const shown = done.slice(this.listPage * perPage, (this.listPage + 1) * perPage);
    shown.forEach((e, i) => {
      const b = new Button(this, listX, insets.top + 130 + i * ROW, {
        width: 280,
        height: 44,
        radius: 22,
        label: e.title,
        fontSize: 19,
        fill: e.id === this.open ? 0x4a3d8a : 0x2a2350,
        onTap: () => this.show(e.id),
      });
      targets[`entry:${e.id}`] = center(b);
    });
    if (paged) {
      const y = insets.top + 130 + perPage * ROW;
      const turn = (d: number) => this.scene.restart({ listPage: this.listPage + d, open: null });
      const prev = new Button(this, listX - 100, y, {
        width: 72,
        height: 44,
        radius: 22,
        label: '◀',
        fontSize: 20,
        fill: 0x2a2350,
        onTap: () => this.listPage > 0 && turn(-1),
      }).setAlpha(this.listPage > 0 ? 1 : 0.35);
      const next = new Button(this, listX + 100, y, {
        width: 72,
        height: 44,
        radius: 22,
        label: '▶',
        fontSize: 20,
        fill: 0x2a2350,
        onTap: () => this.listPage < pages - 1 && turn(1),
      }).setAlpha(this.listPage < pages - 1 ? 1 : 0.35);
      this.add
        .text(listX, y, `${this.listPage + 1} / ${pages}`, {
          fontFamily: FONT_UI,
          fontSize: '20px',
          color: '#fdf6e3',
        })
        .setOrigin(0.5);
      targets['journal:prev'] = center(prev);
      targets['journal:next'] = center(next);
    }

    this.setupScroll();
    const first = this.open && done.some((e) => e.id === this.open) ? this.open : shown[0]!.id;
    this.show(first);
    this.publish(targets, first, this.listPage, pages);
  }

  private show(id: string): void {
    const e = ENCOUNTERS.find((x) => x.id === id)!;
    const { width: W, height: H } = this.scale.gameSize;
    const x = this.pageX;
    const w = W - x - 40 - this.rightInset;
    const h = H - 140;
    this.open = id;
    this.page?.destroy();
    const bg = this.add.graphics();
    bg.fillStyle(COLOR.card, 1)
      .fillRoundedRect(0, 0, w, h, 24)
      .lineStyle(4, COLOR.gold)
      .strokeRoundedRect(0, 0, w, h, 24);
    const head = this.add.text(28, 22, `${e.title} · ${e.reference}`, {
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

    // A long passage scrolls inside the page: clip the text to the page below the heading.
    const top = 110 + 60;
    const room = h - 60 - 24;
    const maskShape = this.make.graphics({}, false).fillRect(x, top, w, room);
    body.setMask(maskShape.createGeometryMask());
    this.page.once(Phaser.GameObjects.Events.DESTROY, () => maskShape.destroy());
    this.body = body;
    this.bodyTop = 66;
    this.bodyRoom = room;
    updateTestState({ journalOpen: id, journalScrollable: body.height > room });
  }

  /** Drag the page (or turn the mouse wheel) to scroll a passage that is taller than the page. */
  private setupScroll(): void {
    const scrollTo = (y: number) => {
      if (!this.body) return;
      const min = this.bodyTop - Math.max(0, this.body.height - this.bodyRoom);
      this.body.y = Phaser.Math.Clamp(y, min, this.bodyTop);
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.body && p.x > this.pageX) this.drag = { y: p.y, start: this.body.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.drag && p.isDown) scrollTo(this.drag.start + (p.y - this.drag.y));
    });
    this.input.on('pointerup', () => (this.drag = null));
    this.input.on(
      'wheel',
      (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) =>
        this.body && scrollTo(this.body.y - dy),
    );
  }

  private publish(
    targets: Record<string, { x: number; y: number }>,
    open: string | null,
    page: number,
    pages: number,
  ): void {
    const { width, height } = this.scale.gameSize;
    updateTestState({
      ready: true,
      scene: 'journal',
      targets,
      gameWidth: width,
      gameHeight: height,
      journalOpen: open,
      journalPage: pages > 0 ? { page, pages } : null,
    });
  }
}
