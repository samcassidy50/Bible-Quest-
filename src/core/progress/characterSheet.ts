import { TUNING } from '../battle/tuning';
import type { SpecialId } from '../battle/types';
import type { RuneId } from '../battle/runes';
import { ownedArmor, totalStars, type SaveData } from './progress';
import { heroLoadout, setRuneKinds, type RuneSource } from './runes';

/** One line on the character sheet. */
export interface StatLine {
  id: 'health' | 'attack' | 'defence' | 'healing' | 'energy' | 'ultimate';
  label: string;
  /** The headline number or word. */
  value: string;
  /** What it means in battle, in a child's words. */
  detail: string;
  /** The set blessings that change this stat, drawn beside it in their item's colour. */
  runes: RuneId[];
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
export function characterSheet(save: SaveData, encounters: readonly RuneSource[]): CharacterSheet {
  const build = heroLoadout(save, encounters);
  const set = setRuneKinds(save, encounters);
  const runes = (...kinds: RuneId[]) => set.filter((k) => kinds.includes(k));
  const owned = ownedArmor(save, encounters);
  const attack = build.hero.attack;
  const zeal = 1 + build.poweredBonus;
  const hasShield = owned.specials.includes('shield');
  const hasBreastplate = owned.specials.includes('breastplate');
  const blocks = (n: number) => `${n} attack${n === 1 ? '' : 's'}`;
  const pct = (f: number) => `${Math.round(f * build.healPower * 100)}%`;

  const defence: string[] = [];
  if (build.startingBlocks > 0)
    defence.push(`Starts each fight blocking ${blocks(build.startingBlocks)}.`);
  defence.push(
    hasShield
      ? `The Shield of Faith blocks ${blocks(TUNING.shield.baseBlocks)}; ${blocks(TUNING.shield.poweredBlocks)} when you answer right.`
      : 'Earn the Shield of Faith on the map to block attacks.',
  );
  const healing: string[] = [];
  if (build.healOnCorrect > 0)
    healing.push(`Heals ${build.healOnCorrect} HP on each right answer.`);
  healing.push(
    hasBreastplate
      ? `The Breastplate heals ${pct(TUNING.breastplate.baseHeal)} of your health; ${pct(TUNING.breastplate.poweredHeal)} when you answer right.`
      : 'Earn the Breastplate of Righteousness on the map to heal.',
  );

  const stats: StatLine[] = [
    {
      id: 'health',
      label: 'Health',
      value: `${build.hero.maxHp} HP`,
      detail: 'How much the hero can take before a fight is lost.',
      runes: runes('life'),
    },
    {
      id: 'attack',
      label: 'Attack',
      value: `${Math.round(attack * TUNING.attack.base)}`,
      detail: `Damage of a normal Attack; ${Math.round(attack * TUNING.attack.powered * zeal)} when you answer right.`,
      runes: runes('might', 'zeal'),
    },
    {
      id: 'defence',
      label: 'Defence',
      value: hasShield ? 'Shield' : '—',
      detail: defence.join(' '),
      runes: runes('guard'),
    },
    {
      id: 'healing',
      label: 'Healing',
      value: hasBreastplate ? pct(TUNING.breastplate.poweredHeal) : '—',
      detail: healing.join(' '),
      runes: runes('mending', 'renewal'),
    },
    {
      id: 'energy',
      label: 'Energy',
      value: build.bonusEnergy > 0 ? `+${build.bonusEnergy} start` : `${TUNING.energy.max} max`,
      detail:
        (build.bonusEnergy > 0 ? `Starts each fight with ${build.bonusEnergy} energy. ` : '') +
        'Collect energy orbs while the verse is read to use your armor.' +
        (build.stunBonus > 0
          ? ` Sandals stun for ${TUNING.sandals.stunTurns + build.stunBonus} turns.`
          : ''),
      runes: runes('haste', 'peace'),
    },
    {
      id: 'ultimate',
      label: 'Ultimate',
      value: owned.ultimate ? `×${TUNING.ultimate.damage}` : '—',
      detail: owned.ultimate
        ? 'Times your attack when the Full Armor of God strikes.'
        : 'Earn the Full Armor of God on the map.',
      runes: [],
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
