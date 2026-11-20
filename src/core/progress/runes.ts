import {
  ITEM_IDS,
  RUNE_SLOTS,
  RUNES,
  runeLoadout,
  type ItemId,
  type RuneId,
  type RuneLoadout,
} from '../battle/runes';
import type { SpecialId } from '../battle/types';
import { ownedArmor, type SaveData } from './progress';

/**
 * The hero's runes (docs/DESIGN.md §2.5): each passage awards one rune the first time it is won
 * (`rune` in its encounter file). The player sets runes into their items' slots. A rune is known
 * by the id of the passage that awarded it, so two runes of the same kind stay distinct.
 */

/** The part of an encounter the rune rules read. */
export interface RuneSource {
  id: string;
  rune?: RuneId;
  unlocks?: SpecialId | 'ultimate';
}

export interface OwnedRune {
  /** The passage that awarded it (its id in the save). */
  id: string;
  kind: RuneId;
  item: ItemId;
  /** Where it is set, or null while it waits in the bag. */
  slot: { item: ItemId; index: number } | null;
}

/** Runes earned so far, in the order they were awarded along the map. */
export function ownedRunes(save: SaveData, encounters: readonly RuneSource[]): OwnedRune[] {
  const placed = new Map<string, { item: ItemId; index: number }>();
  for (const item of ITEM_IDS)
    validSlots(save, encounters)[item].forEach((id, index) => {
      if (id) placed.set(id, { item, index });
    });
  return encounters
    .filter((e) => e.rune && e.id in save.completed)
    .map((e) => ({
      id: e.id,
      kind: e.rune!,
      item: RUNES[e.rune!].item,
      slot: placed.get(e.id) ?? null,
    }));
}

/** The sword is carried from the start; the other items open when their armor is earned. */
export function itemOpen(save: SaveData, encounters: readonly RuneSource[], item: ItemId): boolean {
  return item === 'sword' || ownedArmor(save, encounters).specials.includes(item);
}

/**
 * The save's slots with anything that no longer fits removed: runes not (or no longer) owned,
 * runes in the wrong item, items not yet open, and duplicates. Old or hand-edited saves never
 * give the hero runes they have not earned.
 */
export function validSlots(
  save: SaveData,
  encounters: readonly RuneSource[],
): Record<ItemId, (string | null)[]> {
  const kindOf = new Map(
    encounters.filter((e) => e.rune && e.id in save.completed).map((e) => [e.id, e.rune!]),
  );
  const seen = new Set<string>();
  const out = {} as Record<ItemId, (string | null)[]>;
  for (const item of ITEM_IDS) {
    const open = itemOpen(save, encounters, item);
    out[item] = Array.from({ length: RUNE_SLOTS }, (_, i) => {
      const id = save.runes[item][i] ?? null;
      const kind = id ? kindOf.get(id) : undefined;
      if (!id || !kind || !open || RUNES[kind].item !== item || seen.has(id)) return null;
      seen.add(id);
      return id;
    });
  }
  return out;
}

/** The kinds of the runes set in the hero's items. */
export function setRuneKinds(save: SaveData, encounters: readonly RuneSource[]): RuneId[] {
  return ownedRunes(save, encounters)
    .filter((r) => r.slot)
    .map((r) => r.kind);
}

/** What the set runes add to a fight (hero stats and bonuses for BattleConfig). */
export function heroLoadout(save: SaveData, encounters: readonly RuneSource[]): RuneLoadout {
  return runeLoadout(setRuneKinds(save, encounters));
}

/** Runes waiting in the bag that could be set right now (an open item has a free slot). */
export function runesToSet(save: SaveData, encounters: readonly RuneSource[]): number {
  const slots = validSlots(save, encounters);
  const free = (item: ItemId) =>
    itemOpen(save, encounters, item) ? slots[item].filter((s) => s === null).length : 0;
  const waiting = ownedRunes(save, encounters).filter((r) => !r.slot);
  let n = 0;
  for (const item of ITEM_IDS)
    n += Math.min(free(item), waiting.filter((r) => r.item === item).length);
  return n;
}

/**
 * Sets an owned rune into a slot of its own item, taking it out of wherever it was. Whatever was
 * in that slot goes back to the bag. Returns the save unchanged when the move is not allowed.
 */
export function setRune(
  save: SaveData,
  encounters: readonly RuneSource[],
  runeId: string,
  item: ItemId,
  index: number,
): SaveData {
  const rune = ownedRunes(save, encounters).find((r) => r.id === runeId);
  if (!rune || rune.item !== item || index < 0 || index >= RUNE_SLOTS) return save;
  if (!itemOpen(save, encounters, item)) return save;
  const slots = validSlots(save, encounters);
  if (rune.slot) slots[rune.slot.item][rune.slot.index] = null;
  slots[item][index] = runeId;
  return { ...save, runes: slots };
}

/** Takes the rune out of a slot and back into the bag. */
export function clearSlot(
  save: SaveData,
  encounters: readonly RuneSource[],
  item: ItemId,
  index: number,
): SaveData {
  const slots = validSlots(save, encounters);
  if (!slots[item][index]) return save;
  slots[item][index] = null;
  return { ...save, runes: slots };
}

/**
 * Sets a newly won rune straight into the first free slot of its item, if the item is open
 * (so a player who never opens the Runes screen still gets its effect).
 */
export function autoSetRune(
  save: SaveData,
  encounters: readonly RuneSource[],
  runeId: string,
): SaveData {
  const rune = ownedRunes(save, encounters).find((r) => r.id === runeId);
  if (!rune || rune.slot) return save;
  const free = validSlots(save, encounters)[rune.item].indexOf(null);
  return free < 0 ? save : setRune(save, encounters, runeId, rune.item, free);
}

/**
 * After the first win of a passage: sets its rune, and if the win opened an item, any runes for
 * that item that were waiting in the bag. Runes the player took out themselves stay out.
 */
export function autoSetOnFirstWin(
  save: SaveData,
  encounters: readonly RuneSource[],
  encounterId: string,
): SaveData {
  const opened = encounters.find((e) => e.id === encounterId)?.unlocks;
  let next = save;
  for (const r of ownedRunes(save, encounters))
    if (!r.slot && (r.id === encounterId || r.item === opened))
      next = autoSetRune(next, encounters, r.id);
  return next;
}
