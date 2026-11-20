import Phaser from 'phaser';
import { ENCOUNTERS } from '../../content';
import { ITEM_IDS, ITEMS, RUNE_SLOTS, RUNES, type ItemId } from '../../core/battle/runes';
import {
  clearSlot,
  heroLoadout,
  itemOpen,
  ownedRunes,
  setRune,
  validSlots,
} from '../../core/progress/runes';
import { progress } from '../../services/progress';
import { sfx } from '../../services/sfx';
import { updateTestState } from '../../services/testHooks';
import { ACTION_INFO } from '../battle/actionInfo';
import { iconSprite } from '../icons';
import { runeHex, runeIcon } from '../runeIcon';
import { PIXEL_INK, pixelBox, UI } from '../ui/pixelUi';
import { FONT_UI } from '../util';
import { center, menuFrame } from './menuFrame';

const SOFT_INK = '#7a5a3a';
const SLOT = 92;

/**
 * Runes (docs/DESIGN.md §2.5): every item has two slots, and each rune fits one item only, in
 * that item's colour. Tap a rune in the bag, then a slot of its item, to set it; tap a set rune
 * to take it back out. Rules live in core/progress/runes.ts; this scene only draws and forwards.
 */
export class RunesScene extends Phaser.Scene {
  /** The rune picked in the bag (its passage id), waiting for a slot tap. */
  private selected: string | null = null;
  private info!: Phaser.GameObjects.Text;

  constructor() {
    super('runes');
  }

  init(data: { selected?: string | null }): void {
    this.selected = data.selected ?? null;
  }

  create(): void {
    const { insets, back } = menuFrame(this, 'Runes', 'map');
    const { width: W, height: H } = this.scale.gameSize;
    const save = progress.save;
    const runes = ownedRunes(save, ENCOUNTERS);
    const slots = validSlots(save, ENCOUNTERS);
    const byId = new Map(runes.map((r) => [r.id, r]));
    const selected = this.selected ? byId.get(this.selected) : undefined;
    const targets: Record<string, { x: number; y: number }> = { back: center(back) };

    const total = Math.min(W - insets.left - insets.right - 48, 1180);
    const x0 = (W - total) / 2;
    const top = insets.top + 92;
    const bottom = H - insets.bottom - 16;
    const bagH = 170;
    const gap = 16;
    const cardW = (total - gap * (ITEM_IDS.length - 1)) / ITEM_IDS.length;
    const cardH = bottom - top - bagH - gap;

    // ── Item cards, each with its slots ───────────────────────────────────────
    ITEM_IDS.forEach((item, i) => {
      const cx = x0 + i * (cardW + gap) + cardW / 2;
      const open = itemOpen(save, ENCOUNTERS, item);
      const card = pixelBox(this, UI.panel, cx, top + cardH / 2, cardW, cardH);
      if (!open) card.setTint(0x9a9080);
      const icon = iconSprite(this, item, 2).setPosition(cx - cardW / 2 + 44, top + 46);
      if (!open) icon.setAlpha(0.4);
      this.add
        .text(cx - cardW / 2 + 76, top + 26, ITEMS[item].name, {
          fontFamily: FONT_UI,
          fontSize: '24px',
          fontStyle: 'bold',
          color: open ? PIXEL_INK : SOFT_INK,
        })
        .setOrigin(0, 0);
      this.add.text(cx - cardW / 2 + 76, top + 54, `${ITEMS[item].gem} · ${ITEMS[item].theme}`, {
        fontFamily: FONT_UI,
        fontSize: '15px',
        fontStyle: 'bold',
        color: runeHex(item),
        stroke: '#3a2410',
        strokeThickness: 2,
      });

      const slotY = top + 92 + (cardH - 92) * 0.3;
      for (let s = 0; s < RUNE_SLOTS; s++) {
        const sx = cx + (s - (RUNE_SLOTS - 1) / 2) * (SLOT + 22);
        const id = slots[item][s] ?? null;
        const fits = open && selected?.item === item;
        const socket = this.add
          .rectangle(sx, slotY, SLOT, SLOT, 0x2a1d10, open ? 0.85 : 0.35)
          .setStrokeStyle(fits ? 5 : 3, fits ? 0xfff1b0 : 0x6b4a22);
        if (open) {
          const rune = id ? byId.get(id) : undefined;
          runeIcon(this, sx, slotY, SLOT - 26, item, rune?.kind);
          if (rune)
            this.add
              .text(sx, slotY + SLOT / 2 + 8, RUNES[rune.kind].name.replace('Rune of ', ''), {
                fontFamily: FONT_UI,
                fontSize: '17px',
                fontStyle: 'bold',
                color: runeHex(item),
                stroke: '#3a2410',
                strokeThickness: 3,
              })
              .setOrigin(0.5, 0);
          this.add
            .text(
              sx,
              slotY + SLOT / 2 + (rune ? 32 : 8),
              rune ? RUNES[rune.kind].effect : 'Empty',
              {
                fontFamily: FONT_UI,
                fontSize: '14px',
                color: rune ? PIXEL_INK : SOFT_INK,
                align: 'center',
                wordWrap: { width: SLOT + 14, useAdvancedWrap: true },
              },
            )
            .setOrigin(0.5, 0);
        } else {
          this.add.text(sx, slotY, '🔒', { fontSize: '30px' }).setOrigin(0.5).setAlpha(0.6);
        }
        socket.setInteractive({ useHandCursor: open }).on('pointerup', () => this.tapSlot(item, s));
        targets[`slot:${item}:${s}`] = center(socket);
      }
      if (!open) {
        this.add
          .text(cx, top + cardH - 28, `Earn the ${ACTION_INFO[item].short} on the map`, {
            fontFamily: FONT_UI,
            fontSize: '15px',
            color: SOFT_INK,
            align: 'center',
            wordWrap: { width: cardW - 40 },
          })
          .setOrigin(0.5, 1);
      }
    });

    // ── The bag: runes not set yet ────────────────────────────────────────────
    const bagY = bottom - bagH / 2;
    pixelBox(this, UI.panel, W / 2, bagY, total, bagH);
    const bag = runes.filter((r) => !r.slot);
    this.add
      .text(x0 + 28, bagY - bagH / 2 + 22, `Rune bag (${bag.length})`, {
        fontFamily: FONT_UI,
        fontSize: '20px',
        fontStyle: 'bold',
        color: PIXEL_INK,
      })
      .setOrigin(0, 0);
    const step = 74;
    bag.forEach((r, i) => {
      const x = x0 + 60 + i * step;
      const y = bagY + 16;
      const isSel = r.id === this.selected;
      const hit = this.add
        .rectangle(x, y, 64, 64, isSel ? 0xfff1b0 : 0x000000, isSel ? 0.9 : 0.12)
        .setStrokeStyle(isSel ? 4 : 0, 0xb07d00);
      runeIcon(this, x, y, 50, r.item, r.kind);
      hit.setInteractive({ useHandCursor: true }).on('pointerup', () => this.tapBag(r.id));
      targets[`rune:${r.id}`] = center(hit);
    });

    const effects = summary(heroLoadout(save, ENCOUNTERS));
    this.info = this.add
      .text(x0 + 60 + Math.max(bag.length, 1) * step, bagY + 16, '', {
        fontFamily: FONT_UI,
        fontSize: '18px',
        color: PIXEL_INK,
        wordWrap: { width: x0 + total - 40 - (x0 + 60 + Math.max(bag.length, 1) * step) },
        lineSpacing: 4,
      })
      .setOrigin(0, 0.5);
    if (bag.length === 0) this.info.setX(x0 + 28);
    if (selected) {
      const fits = ITEMS[selected.item].name;
      this.info.setText(
        `${RUNES[selected.kind].name}: ${RUNES[selected.kind].effect}.\n` +
          (itemOpen(save, ENCOUNTERS, selected.item)
            ? `Tap a ${fits} slot to set it.`
            : `Fits the ${fits}: earn it on the map first.`),
      );
    } else if (runes.length === 0) {
      this.info.setText('Win a passage on the map to earn your first rune.');
    } else {
      this.info.setText(
        (bag.length > 0 ? 'Tap a rune, then a slot of its item. ' : '') +
          `Your runes: ${effects}. Tap a set rune to take it out.`,
      );
    }

    updateTestState({
      ready: true,
      scene: 'runes',
      targets,
      runes: { selected: this.selected, bag: bag.map((r) => r.id) },
      gameWidth: W,
      gameHeight: H,
    });
  }

  private tapBag(id: string): void {
    sfx.play('uiTap');
    this.scene.restart({ selected: this.selected === id ? null : id });
  }

  private tapSlot(item: ItemId, index: number): void {
    const save = progress.save;
    if (!itemOpen(save, ENCOUNTERS, item)) return;
    const rune = this.selected
      ? ownedRunes(save, ENCOUNTERS).find((r) => r.id === this.selected)
      : undefined;
    if (rune) {
      if (rune.item !== item) {
        this.info.setText(`The ${RUNES[rune.kind].name} only fits the ${ITEMS[rune.item].name}.`);
        return;
      }
      progress.update((s) => setRune(s, ENCOUNTERS, rune.id, item, index));
      sfx.play('poweredUp');
      this.scene.restart({ selected: null });
      return;
    }
    if (!validSlots(save, ENCOUNTERS)[item][index]) return;
    progress.update((s) => clearSlot(s, ENCOUNTERS, item, index));
    sfx.play('uiTap');
    this.scene.restart({ selected: null });
  }
}

/** The set runes' effects in a few words (core numbers, so it matches the battle). */
function summary(l: ReturnType<typeof heroLoadout>): string {
  const parts = [`${l.hero.maxHp} HP`, `${l.hero.attack} attack`];
  if (l.poweredBonus) parts.push(`right answers +${Math.round(l.poweredBonus * 100)}%`);
  if (l.startingBlocks) parts.push(`${l.startingBlocks} starting block`);
  if (l.healPower > 1) parts.push(`healing +${Math.round((l.healPower - 1) * 100)}%`);
  if (l.healOnCorrect) parts.push(`+${l.healOnCorrect} HP per right answer`);
  if (l.bonusEnergy) parts.push(`+${l.bonusEnergy} energy`);
  if (l.stunBonus) parts.push(`+${l.stunBonus} stun turn`);
  return parts.join(', ');
}
