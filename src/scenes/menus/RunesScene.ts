import Phaser from 'phaser';
import { ENCOUNTERS } from '../../content';
import { ITEM_IDS, ITEMS, RUNE_SLOTS, RUNES, type ItemId } from '../../core/battle/runes';
import { clearSlot, itemOpen, ownedRunes, setRune, validSlots } from '../../core/progress/runes';
import { progress } from '../../services/progress';
import { sfx } from '../../services/sfx';
import { updateTestState } from '../../services/testHooks';
import { ACTION_INFO } from '../battle/actionInfo';
import { ITEM_ART_CELL, itemArtSprite } from '../itemArt';
import { runeHex, runeIcon } from '../runeIcon';
import { PIXEL_INK, pixelBox, UI } from '../ui/pixelUi';
import { FONT_UI } from '../util';
import { center, menuFrame } from './menuFrame';

const SOFT_INK = '#7a5a3a';
const SLOT = 120;

type Targets = Record<string, { x: number; y: number }>;

/**
 * Runes (docs/DESIGN.md §2.5): every item has two slots, and each rune fits one item only, in
 * that item's colour. The screen opens on one button per item; tapping one shows that item's
 * slots and the runes that fit it. Tap a rune to set it in a free slot (or, when both are full,
 * then tap a slot to swap it in); tap a set rune to take it back out. Rules live in
 * core/progress/runes.ts; this scene only draws and forwards.
 */
export class RunesScene extends Phaser.Scene {
  /** The item opened, or null for the item buttons. */
  private item: ItemId | null = null;
  /** The rune picked (its passage id), waiting for a slot tap because both slots are full. */
  private selected: string | null = null;
  private info?: Phaser.GameObjects.Text;

  constructor() {
    super('runes');
  }

  init(data: { item?: ItemId | null; selected?: string | null }): void {
    this.item = data.item ?? null;
    this.selected = data.selected ?? null;
  }

  create(): void {
    if (this.item) this.drawItem(this.item);
    else this.drawOverview();
  }

  // ── The item buttons ──────────────────────────────────────────────────────
  private drawOverview(): void {
    const { insets, back } = menuFrame(this, 'Runes', 'map');
    const { width: W, height: H } = this.scale.gameSize;
    const save = progress.save;
    const runes = ownedRunes(save, ENCOUNTERS);
    const slots = validSlots(save, ENCOUNTERS);
    const byId = new Map(runes.map((r) => [r.id, r]));
    const targets: Targets = { back: center(back) };

    // Use nearly the whole width: the Back button sits above the row, so no side margin is needed.
    const total = Math.min(W - insets.left - insets.right - 40, 1600);
    const x0 = (W - total) / 2;
    const top = insets.top + 100;
    const bottom = H - insets.bottom - 20;
    const gap = 32;
    const cardW = (total - gap * (ITEM_IDS.length - 1)) / ITEM_IDS.length;
    const cardH = bottom - top;
    const cy = top + cardH / 2;
    // The panel under each picture (name, slots, news); the picture gets the rest of the height.
    const PANEL_H = 210;
    const picH = cardH - PANEL_H;
    // Whole-number scale of the item picture so it stays crisp, as big as fits the space.
    const artScale = Math.max(1, Math.floor(Math.min(picH - 30, cardW - 40) / ITEM_ART_CELL));

    ITEM_IDS.forEach((item, i) => {
      const cx = x0 + i * (cardW + gap) + cardW / 2;
      const open = itemOpen(save, ENCOUNTERS, item);
      const waiting = runes.filter((r) => r.item === item && !r.slot).length;
      const y0 = cy - cardH / 2;
      // A border round the whole column: the item picture, then one panel with its name, slots
      // and news, set inside the border.
      const PAD = 10;
      this.add
        .graphics()
        .fillStyle(0x120c26, 0.55)
        .fillRoundedRect(cx - cardW / 2, y0, cardW, cardH, 14)
        .lineStyle(4, open ? 0xc9a24a : 0x6b5a3a, 1)
        .strokeRoundedRect(cx - cardW / 2, y0, cardW, cardH, 14);
      const nameH = 64;
      const panelTop = y0 + picH;
      const panel = pixelBox(
        this,
        UI.panel,
        cx,
        panelTop + (cardH - picH - PAD) / 2,
        cardW - PAD * 2,
        cardH - picH - PAD,
      );
      if (!open) panel.setTint(0x9a9080);
      const nameTop = panelTop + 8;
      const slotTop = nameTop + nameH - 8;

      const icon = itemArtSprite(this, item, artScale).setPosition(cx, y0 + picH / 2);
      if (!open) icon.setAlpha(0.45);

      const name = this.add
        .text(cx, nameTop + nameH / 2, ITEMS[item].name, {
          fontFamily: FONT_UI,
          fontSize: '36px',
          fontStyle: 'bold',
          color: open ? PIXEL_INK : SOFT_INK,
        })
        .setOrigin(0.5);
      // Long names (Breastplate) shrink to fit the panel rather than spill over its edge.
      const room = cardW - PAD * 2 - 36;
      if (name.width > room) name.setFontSize(Math.floor((36 * room) / name.width));

      // The two slots in small, so the player sees what is set without opening the item.
      const miniY = slotTop + 50;
      for (let s = 0; s < RUNE_SLOTS; s++) {
        const sx = cx + (s - (RUNE_SLOTS - 1) / 2) * 74;
        this.add
          .rectangle(sx, miniY, 62, 62, 0x2a1d10, open ? 0.85 : 0.35)
          .setStrokeStyle(3, 0x6b4a22);
        if (open) {
          const id = slots[item][s];
          runeIcon(this, sx, miniY, 44, item, id ? byId.get(id)?.kind : undefined);
        } else {
          this.add.text(sx, miniY, '🔒', { fontSize: '22px' }).setOrigin(0.5).setAlpha(0.6);
        }
      }
      const note = !open
        ? `Earn the ${ACTION_INFO[item].short} on the map`
        : waiting > 0
          ? `${waiting} new rune${waiting > 1 ? 's' : ''} to set`
          : '';
      if (note)
        this.add
          .text(cx, miniY + 42, note, {
            fontFamily: FONT_UI,
            fontSize: '15px',
            fontStyle: open ? 'bold' : 'normal',
            color: open ? '#2f7a3a' : SOFT_INK,
            align: 'center',
            wordWrap: { width: cardW - 40 },
          })
          .setOrigin(0.5, 0);

      const hit = this.add
        .zone(cx, cy, cardW, cardH)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          sfx.play('uiTap');
          this.scene.restart({ item, selected: null });
        });
      targets[`item:${item}`] = center(hit);
    });

    this.publish(targets, []);
  }

  // ── One item: its slots and the runes that fit it ─────────────────────────
  private drawItem(item: ItemId): void {
    const { insets, back } = menuFrame(this, `${ITEMS[item].name} Runes`, 'runes', {
      item: null,
      selected: null,
    });
    const { width: W, height: H } = this.scale.gameSize;
    const save = progress.save;
    const open = itemOpen(save, ENCOUNTERS, item);
    const runes = ownedRunes(save, ENCOUNTERS).filter((r) => r.item === item);
    const slots = validSlots(save, ENCOUNTERS)[item];
    const byId = new Map(runes.map((r) => [r.id, r]));
    const selected = this.selected ? byId.get(this.selected) : undefined;
    const targets: Targets = { back: center(back) };

    const total = Math.min(W - insets.left - insets.right - 48, 1180);
    const x0 = (W - total) / 2;
    const top = insets.top + 100;
    const bottom = H - insets.bottom - 16;
    const gap = 20;
    const leftW = Math.round(total * 0.42);
    const rightW = total - leftW - gap;
    const panelH = bottom - top;

    // Left: the item and its two slots.
    const lx = x0 + leftW / 2;
    const card = pixelBox(this, UI.panel, lx, top + panelH / 2, leftW, panelH);
    if (!open) card.setTint(0x9a9080);
    // The item picture big and centred, its name under it, then its two slots.
    itemArtSprite(this, item, 3).setPosition(lx, top + 26 + (ITEM_ART_CELL * 3) / 2);
    this.add
      .text(lx, top + 34 + ITEM_ART_CELL * 3, ITEMS[item].name, {
        fontFamily: FONT_UI,
        fontSize: '30px',
        fontStyle: 'bold',
        color: PIXEL_INK,
      })
      .setOrigin(0.5, 0);

    const slotY = top + 110 + ITEM_ART_CELL * 3 + SLOT / 2;
    for (let s = 0; s < RUNE_SLOTS; s++) {
      const sx = lx + (s - (RUNE_SLOTS - 1) / 2) * (SLOT + 30);
      const id = slots[s] ?? null;
      const swap = open && !!selected;
      const socket = this.add
        .rectangle(sx, slotY, SLOT, SLOT, 0x2a1d10, open ? 0.85 : 0.35)
        .setStrokeStyle(swap ? 5 : 3, swap ? 0xfff1b0 : 0x6b4a22);
      if (open) {
        const rune = id ? byId.get(id) : undefined;
        runeIcon(this, sx, slotY, SLOT - 34, item, rune?.kind);
        if (rune)
          this.add
            .text(sx, slotY + SLOT / 2 + 8, RUNES[rune.kind].name.replace('Rune of ', ''), {
              fontFamily: FONT_UI,
              fontSize: '19px',
              fontStyle: 'bold',
              color: runeHex(item),
              stroke: '#3a2410',
              strokeThickness: 3,
            })
            .setOrigin(0.5, 0);
        this.add
          .text(sx, slotY + SLOT / 2 + (rune ? 36 : 8), rune ? RUNES[rune.kind].effect : 'Empty', {
            fontFamily: FONT_UI,
            fontSize: '15px',
            color: rune ? PIXEL_INK : SOFT_INK,
            align: 'center',
            wordWrap: { width: SLOT + 20, useAdvancedWrap: true },
          })
          .setOrigin(0.5, 0);
      } else {
        this.add.text(sx, slotY, '🔒', { fontSize: '34px' }).setOrigin(0.5).setAlpha(0.6);
      }
      socket.setInteractive({ useHandCursor: open }).on('pointerup', () => this.tapSlot(item, s));
      targets[`slot:${item}:${s}`] = center(socket);
    }

    // Right: the runes for this item still in the bag.
    const rx = x0 + leftW + gap;
    pixelBox(this, UI.panel, rx + rightW / 2, top + panelH / 2, rightW, panelH);
    const bag = runes.filter((r) => !r.slot);
    this.add
      .text(rx + 28, top + 26, `${ITEMS[item].name} runes in your bag (${bag.length})`, {
        fontFamily: FONT_UI,
        fontSize: '21px',
        fontStyle: 'bold',
        color: PIXEL_INK,
      })
      .setOrigin(0, 0);
    const rowH = 84;
    bag.forEach((r, i) => {
      const y = top + 100 + i * rowH;
      const isSel = r.id === this.selected;
      const hit = this.add
        .rectangle(rx + rightW / 2, y, rightW - 48, rowH - 10, isSel ? 0xfff1b0 : 0x000000)
        .setFillStyle(isSel ? 0xfff1b0 : 0x000000, isSel ? 0.9 : 0.08)
        .setStrokeStyle(isSel ? 4 : 0, 0xb07d00);
      runeIcon(this, rx + 70, y, 54, item, r.kind);
      this.add
        .text(rx + 114, y - 4, RUNES[r.kind].name, {
          fontFamily: FONT_UI,
          fontSize: '19px',
          fontStyle: 'bold',
          color: runeHex(item),
          stroke: '#3a2410',
          strokeThickness: 3,
        })
        .setOrigin(0, 1);
      this.add
        .text(rx + 114, y + 2, RUNES[r.kind].effect, {
          fontFamily: FONT_UI,
          fontSize: '16px',
          color: PIXEL_INK,
        })
        .setOrigin(0, 0);
      hit.setInteractive({ useHandCursor: true }).on('pointerup', () => this.tapBag(item, r.id));
      targets[`rune:${r.id}`] = center(hit);
    });

    this.info = this.add
      .text(rx + 28, bottom - 24, '', {
        fontFamily: FONT_UI,
        fontSize: '17px',
        color: SOFT_INK,
        wordWrap: { width: rightW - 56 },
        lineSpacing: 4,
      })
      .setOrigin(0, 1);
    const name = ITEMS[item].name;
    if (!open)
      this.info.setText(`Earn the ${ACTION_INFO[item].short} on the map to set these runes.`);
    else if (selected)
      this.info.setText(
        `Both slots are full: tap a slot to swap in the ${RUNES[selected.kind].name}.`,
      );
    else if (runes.length === 0)
      this.info.setText(
        `Win passages on the map to earn ${ITEMS[item].gem} runes for the ${name}.`,
      );
    else if (bag.length > 0)
      this.info.setText('Tap a rune to set it. Tap a set rune to take it out.');
    else this.info.setText('Tap a set rune to take it out.');

    this.publish(
      targets,
      bag.map((r) => r.id),
    );
  }

  private publish(targets: Targets, bag: string[]): void {
    const { width: W, height: H } = this.scale.gameSize;
    updateTestState({
      ready: true,
      scene: 'runes',
      targets,
      runes: { item: this.item, selected: this.selected, bag },
      gameWidth: W,
      gameHeight: H,
    });
  }

  /** A rune goes straight into the first free slot; with both full it waits for a slot tap. */
  private tapBag(item: ItemId, id: string): void {
    const save = progress.save;
    if (!itemOpen(save, ENCOUNTERS, item)) return;
    const free = validSlots(save, ENCOUNTERS)[item].findIndex((s) => s === null);
    if (free >= 0) {
      progress.update((s) => setRune(s, ENCOUNTERS, id, item, free));
      sfx.play('poweredUp');
      this.scene.restart({ item, selected: null });
      return;
    }
    sfx.play('uiTap');
    this.scene.restart({ item, selected: this.selected === id ? null : id });
  }

  private tapSlot(item: ItemId, index: number): void {
    const save = progress.save;
    if (!itemOpen(save, ENCOUNTERS, item)) return;
    if (this.selected) {
      const id = this.selected;
      progress.update((s) => setRune(s, ENCOUNTERS, id, item, index));
      sfx.play('poweredUp');
      this.scene.restart({ item, selected: null });
      return;
    }
    if (!validSlots(save, ENCOUNTERS)[item][index]) return;
    progress.update((s) => clearSlot(s, ENCOUNTERS, item, index));
    sfx.play('uiTap');
    this.scene.restart({ item, selected: null });
  }
}
