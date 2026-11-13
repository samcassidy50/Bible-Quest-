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

/**
 * What each piece of armor does, for the page shown after the angel gives it (original lines;
 * `ref` is only a passage reference, never verse text).
 */
export const ARMOR_ABOUT: Record<SpecialId | 'ultimate', { text: string; ref: string }> = {
  sword: {
    text: 'A mighty strike that hits harder than an Attack. Answer right for an even bigger blow.',
    ref: 'Ephesians 6:17',
  },
  shield: {
    text: "Blocks the foe's next attack. Answer right to block two attacks and strike back too.",
    ref: 'Ephesians 6:16',
  },
  breastplate: {
    text: 'Heals your wounds. Answer right and it heals much more.',
    ref: 'Ephesians 6:14',
  },
  sandals: {
    text: 'Stuns the foe so it misses its next turn. Answer right to land a hit as well.',
    ref: 'Ephesians 6:15',
  },
  ultimate: {
    text: 'A huge strike that also heals you. Fill your Faith meter by answering well, then unleash it.',
    ref: 'Ephesians 6:13',
  },
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
