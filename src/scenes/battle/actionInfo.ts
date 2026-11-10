import type { ActionId } from '../../core/battle/types';

/** Display info for each hero action (placeholder icons until Phase 4 art). */
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
