import { HERO_BASE } from './hero';
import { SPECIAL_IDS, type HeroStats, type SpecialId } from './types';

/**
 * Runes (docs/DESIGN.md §2.5): gems the hero earns along the map and sets into their items.
 * Each item has RUNE_SLOTS slots; each rune fits one item only and shares that item's colour.
 * Every number here is a draft, checked by the balance simulation (tests/unit/balance.test.ts).
 */

/** The items that take runes: the four armor pieces (the sword is carried from the start). */
export const ITEM_IDS = SPECIAL_IDS;
export type ItemId = SpecialId;

/** Slots per item. */
export const RUNE_SLOTS = 2;

export interface ItemInfo {
  name: string;
  /** Gem colour shared by the item's runes (0xRRGGBB). */
  color: number;
  /** Gem name, e.g. "Ruby". */
  gem: string;
  /** What this item's runes are about, in a child's words. */
  theme: string;
}

export const ITEMS: Record<ItemId, ItemInfo> = {
  sword: { name: 'Sword', color: 0xe0413a, gem: 'Ruby', theme: 'Attack' },
  shield: { name: 'Shield', color: 0x3a7be0, gem: 'Sapphire', theme: 'Health' },
  breastplate: { name: 'Breastplate', color: 0x2fb35a, gem: 'Emerald', theme: 'Healing' },
  sandals: { name: 'Sandals', color: 0xe8b021, gem: 'Topaz', theme: 'Energy' },
};

export const RUNE_IDS = [
  'might',
  'zeal',
  'life',
  'guard',
  'mending',
  'renewal',
  'haste',
  'peace',
] as const;
export type RuneId = (typeof RUNE_IDS)[number];

export interface RuneInfo {
  item: ItemId;
  name: string;
  /** The effect, short enough for a slot label. */
  effect: string;
}

/** Rune effect sizes, per rune set (two of a kind stack). */
export const RUNE_TUNING = {
  might: { attack: 1 },
  zeal: { poweredBonus: 0.25 },
  life: { maxHp: 20 },
  guard: { startingBlocks: 1 },
  mending: { healPower: 0.4 },
  renewal: { healOnCorrect: 3 },
  haste: { bonusEnergy: 2 },
  peace: { stunBonus: 1 },
} as const;

export const RUNES: Record<RuneId, RuneInfo> = {
  might: { item: 'sword', name: 'Rune of Might', effect: `+${RUNE_TUNING.might.attack} attack` },
  zeal: {
    item: 'sword',
    name: 'Rune of Zeal',
    effect: `Right answers hit +${RUNE_TUNING.zeal.poweredBonus * 100}% harder`,
  },
  life: { item: 'shield', name: 'Rune of Life', effect: `+${RUNE_TUNING.life.maxHp} max HP` },
  guard: {
    item: 'shield',
    name: 'Rune of Guarding',
    effect: `Start each fight with ${RUNE_TUNING.guard.startingBlocks} block`,
  },
  mending: {
    item: 'breastplate',
    name: 'Rune of Mending',
    effect: `Breastplate heals +${RUNE_TUNING.mending.healPower * 100}%`,
  },
  renewal: {
    item: 'breastplate',
    name: 'Rune of Renewal',
    effect: `Heal ${RUNE_TUNING.renewal.healOnCorrect} HP on each right answer`,
  },
  haste: {
    item: 'sandals',
    name: 'Rune of Haste',
    effect: `Start each fight with +${RUNE_TUNING.haste.bonusEnergy} energy`,
  },
  peace: {
    item: 'sandals',
    name: 'Rune of Peace',
    effect: `Sandals stun ${RUNE_TUNING.peace.stunBonus} more turn`,
  },
};

/** Everything set runes add to a fight; spread into BattleConfig. */
export interface RuneLoadout {
  hero: HeroStats;
  /** Extra multiplier on hits after a right answer (0.25 = 25% harder). */
  poweredBonus: number;
  /** Shield blocks the hero starts each fight with. */
  startingBlocks: number;
  /** Multiplier on Breastplate healing (1 = normal). */
  healPower: number;
  /** HP healed on each right answer. */
  healOnCorrect: number;
  /** Energy added at the start of each fight. */
  bonusEnergy: number;
  /** Extra turns a Sandals stun lasts. */
  stunBonus: number;
}

/** Adds up the effects of the runes set in the hero's items. */
export function runeLoadout(set: readonly RuneId[]): RuneLoadout {
  const n = (id: RuneId) => set.filter((r) => r === id).length;
  return {
    hero: {
      maxHp: HERO_BASE.maxHp + n('life') * RUNE_TUNING.life.maxHp,
      attack: HERO_BASE.attack + n('might') * RUNE_TUNING.might.attack,
    },
    poweredBonus: n('zeal') * RUNE_TUNING.zeal.poweredBonus,
    startingBlocks: n('guard') * RUNE_TUNING.guard.startingBlocks,
    healPower: 1 + n('mending') * RUNE_TUNING.mending.healPower,
    healOnCorrect: n('renewal') * RUNE_TUNING.renewal.healOnCorrect,
    bonusEnergy: n('haste') * RUNE_TUNING.haste.bonusEnergy,
    stunBonus: n('peace') * RUNE_TUNING.peace.stunBonus,
  };
}
