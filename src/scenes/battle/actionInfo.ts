import type { ActionId, SpecialId } from '../../core/battle/types';

/** Display info for each hero action (`icon` is the emoji used inside text; buttons use the pixel icons in scenes/icons.ts). */
export const ACTION_INFO: Record<
  ActionId,
  { name: string; short: string; icon: string; color: number }
> = {
  attack: { name: 'Attack', short: 'Attack', icon: '🗡️', color: 0xc0392b },
  sword: { name: 'Sword of the Spirit', short: 'Sword', icon: '⚔️', color: 0x2e86de },
  shield: { name: 'Shield of Faith', short: 'Shield', icon: '🛡️', color: 0x16a085 },
  breastplate: {
    name: 'Breastplate of Righteousness',
    short: 'Breastplate',
    icon: '💖',
    color: 0xd35490,
  },
  sandals: { name: 'Sandals of Peace', short: 'Sandals', icon: '🕊️', color: 0x8e6bd8 },
  ultimate: { name: 'Full Armor of God', short: 'Ultimate', icon: '✨', color: 0xe6a817 },
};

/** What each piece of armor does, for the page shown after the angel gives it (original lines). */
export const ARMOR_ABOUT: Record<SpecialId | 'ultimate', string> = {
  sword: 'You can now channel your energy into the Sword for a more powerful attack.',
  shield: "You can now channel your energy into the Shield to block the foe's next attack.",
  breastplate: 'You can now channel your energy into the Breastplate to heal your wounds.',
  sandals: 'You can now channel your energy into the Sandals to stun the foe for a turn.',
  ultimate:
    'Answer well to fill your Faith meter, then unleash the Full Armor of God for a mighty strike that also heals you.',
};

export const COLOR = {
  correct: 0x27ae60,
  wrong: 0xc0392b,
  gold: 0xf4c95d,
  panel: 0x1d1838,
  card: 0xfdf6e3,
  ink: '#2b2140',
  heroHp: 0x4cd964,
  foeHp: 0xe74c3c,
  faith: 0xf4c95d,
  heal: '#5ee08a',
  damage: '#ffffff',
  powered: '#ffd34d',
} as const;
