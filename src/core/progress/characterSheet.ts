import { TUNING } from '../battle/tuning';
import type { SpecialId } from '../battle/types';
import {
  heroBuild,
  MAX_UPGRADE_LEVEL,
  ownedArmor,
  totalStars,
  type SaveData,
  type UpgradeId,
} from './progress';

/** One line on the character sheet. */
export interface StatLine {
  id: 'health' | 'attack' | 'defence' | 'specials' | 'ultimate' | 'energy';
  label: string;
  /** The headline number or word. */
  value: string;
  /** What it means in battle, in a child's words. */
  detail: string;
  /** The upgrade that raises it, with its level (none: it grows another way). */
  upgrade?: { id: UpgradeId; level: number; max: number };
}

export interface CharacterSheet {
  stats: StatLine[];
  armor: SpecialId[];
  ultimate: boolean;
  stars: number;
  passagesDone: number;
}

/**
 * Everything the character sheet shows, worked out from the save: the same numbers the battle
 * uses (heroBuild, TUNING), so the sheet never disagrees with a fight.
 */
export function characterSheet(
  save: SaveData,
  encounters: readonly { id: string; unlocks?: SpecialId | 'ultimate' }[],
): CharacterSheet {
  const build = heroBuild(save.upgrades);
  const owned = ownedArmor(save, encounters);
  const lvl = (id: UpgradeId) => ({ id, level: save.upgrades[id], max: MAX_UPGRADE_LEVEL });
  const attack = build.hero.attack;
  const hasShield = owned.specials.includes('shield');
  const blocks = (n: number) => `${n} attack${n === 1 ? '' : 's'}`;

  const stats: StatLine[] = [
    {
      id: 'health',
      label: 'Health',
      value: `${build.hero.maxHp} HP`,
      detail: 'How much the hero can take before a fight is lost.',
      upgrade: lvl('health'),
    },
    {
      id: 'attack',
      label: 'Attack',
      value: `${Math.round(attack * TUNING.attack.base)}`,
      detail: `Damage of a normal Attack; ${Math.round(attack * TUNING.attack.powered)} when you answer right.`,
      upgrade: lvl('strength'),
    },
    {
      id: 'defence',
      label: 'Defence',
      value: hasShield ? 'Shield' : '—',
      detail: hasShield
        ? `The Shield of Faith blocks ${blocks(TUNING.shield.baseBlocks)}; ${blocks(TUNING.shield.poweredBlocks)} when you answer right.`
        : 'Earn the Shield of Faith on the map to block attacks.',
    },
    {
      id: 'specials',
      label: 'Armor power',
      value: `${Math.round(build.specialPower * 100)}%`,
      detail: 'How strong the armor specials are.',
      upgrade: lvl('armor'),
    },
    {
      id: 'ultimate',
      label: 'Ultimate',
      value: owned.ultimate ? `×${TUNING.ultimate.damage + build.ultimateBonus}` : '—',
      detail: owned.ultimate
        ? 'Times your attack when the Full Armor of God strikes.'
        : 'Earn the Full Armor of God on the map.',
      upgrade: lvl('faith'),
    },
    {
      id: 'energy',
      label: 'Energy',
      value: `${TUNING.energy.max} max`,
      detail: 'Collect energy orbs while the verse is read to use your armor.',
    },
  ];

  return {
    stats,
    armor: owned.specials,
    ultimate: owned.ultimate,
    stars: totalStars(save),
    passagesDone: Object.keys(save.completed).length,
  };
}
