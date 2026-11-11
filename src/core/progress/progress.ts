import { z } from 'zod';
import type { HeroStats } from '../battle/types';
import { HERO_BASE } from '../battle/hero';

/**
 * Player progression (docs/DESIGN.md §2.5): stars per passage, unlocks in reading order,
 * star-bought upgrades, and settings. Pure functions over a versioned, validated save.
 */

// ── Stars ──────────────────────────────────────────────────────────────────

export type Stars = 1 | 2 | 3;

/** 1 star for a win, 2 for ≥ 60% correct, 3 for ≥ 90% correct (no questions asked = 3). */
export function starsFor(correct: number, asked: number): Stars {
  const accuracy = asked === 0 ? 1 : correct / asked;
  if (accuracy >= 0.9) return 3;
  if (accuracy >= 0.6) return 2;
  return 1;
}

// ── Upgrades ───────────────────────────────────────────────────────────────

export const UPGRADE_IDS = ['health', 'strength', 'armor', 'faith'] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export const UPGRADES: Record<UpgradeId, { name: string; icon: string; perLevel: string }> = {
  health: { name: 'Health', icon: '❤️', perLevel: '+15 max HP' },
  strength: { name: 'Strength', icon: '💪', perLevel: '+2 attack' },
  armor: { name: 'Armor Mastery', icon: '🛡️', perLevel: 'Specials +20% stronger' },
  faith: { name: 'Faith', icon: '✨', perLevel: 'Ultimate +1× damage' },
};

/** Star cost of each level (level 1 costs 2, level 2 costs 3, level 3 costs 4). */
export const UPGRADE_COSTS = [2, 3, 4] as const;
export const MAX_UPGRADE_LEVEL = UPGRADE_COSTS.length;

export type UpgradeLevels = Record<UpgradeId, number>;

export interface HeroBuild {
  hero: HeroStats;
  /** Multiplier on special effects (damage, heal). */
  specialPower: number;
  /** Extra ultimate damage multiplier added to the base. */
  ultimateBonus: number;
}

export function heroBuild(levels: UpgradeLevels): HeroBuild {
  return {
    hero: {
      maxHp: HERO_BASE.maxHp + 15 * levels.health,
      attack: HERO_BASE.attack + 2 * levels.strength,
    },
    specialPower: 1 + 0.2 * levels.armor,
    ultimateBonus: levels.faith,
  };
}

// ── Settings ───────────────────────────────────────────────────────────────

export const READING_SPEEDS = { slow: 0.75, normal: 0.9, fast: 1.05 } as const;
export type ReadingSpeed = keyof typeof READING_SPEEDS;

/** Seconds per question when the optional timer is on. */
export const QUESTION_TIME_S = 20;

// ── Save data ──────────────────────────────────────────────────────────────

export const SAVE_VERSION = 1;

const levelSchema = z.number().int().min(0).max(MAX_UPGRADE_LEVEL).catch(0);

export const saveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  completed: z
    .record(
      z.object({
        stars: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        bestAccuracy: z.number().min(0).max(1),
      }),
    )
    .catch({}),
  heard: z.array(z.string()).catch([]),
  upgrades: z
    .object({ health: levelSchema, strength: levelSchema, armor: levelSchema, faith: levelSchema })
    .catch({ health: 0, strength: 0, armor: 0, faith: 0 }),
  settings: z
    .object({
      sound: z.boolean().catch(true),
      narration: z.boolean().catch(true),
      readingSpeed: z.enum(['slow', 'normal', 'fast']).catch('normal'),
      autoCollect: z.boolean().catch(false),
      timer: z.boolean().catch(false),
    })
    .catch({
      sound: true,
      narration: true,
      readingSpeed: 'normal',
      autoCollect: false,
      timer: false,
    }),
});

export type SaveData = z.infer<typeof saveSchema>;
export type Settings = SaveData['settings'];

export function newSave(): SaveData {
  return saveSchema.parse({
    version: SAVE_VERSION,
    completed: {},
    heard: [],
    upgrades: {},
    settings: {},
  });
}

/**
 * Reads stored JSON. Unknown or corrupt data never crashes the game: bad fields fall back to
 * defaults, and anything unreadable (or from another version) starts a fresh save.
 */
export function loadSave(raw: string | null | undefined): SaveData {
  if (!raw) return newSave();
  try {
    const parsed = saveSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : newSave();
  } catch {
    return newSave();
  }
}

// ── Queries and updates (all return new objects) ──────────────────────────

export function totalStars(save: SaveData): number {
  return Object.values(save.completed).reduce((sum, c) => sum + c.stars, 0);
}

export function spentStars(save: SaveData): number {
  let spent = 0;
  for (const id of UPGRADE_IDS)
    for (let l = 0; l < save.upgrades[id]; l++) spent += UPGRADE_COSTS[l]!;
  return spent;
}

export function availableStars(save: SaveData): number {
  return totalStars(save) - spentStars(save);
}

/** Cost of the next level, or null at max. */
export function nextUpgradeCost(save: SaveData, id: UpgradeId): number | null {
  return UPGRADE_COSTS[save.upgrades[id]] ?? null;
}

export function canBuyUpgrade(save: SaveData, id: UpgradeId): boolean {
  const cost = nextUpgradeCost(save, id);
  return cost !== null && availableStars(save) >= cost;
}

export function buyUpgrade(save: SaveData, id: UpgradeId): SaveData {
  if (!canBuyUpgrade(save, id)) return save;
  return { ...save, upgrades: { ...save.upgrades, [id]: save.upgrades[id] + 1 } };
}

/** Records a win; keeps the best stars and accuracy. Returns whether it was a new best. */
export function recordVictory(
  save: SaveData,
  encounterId: string,
  correct: number,
  asked: number,
): { save: SaveData; stars: Stars; newBest: boolean } {
  const stars = starsFor(correct, asked);
  const accuracy = asked === 0 ? 1 : correct / asked;
  const prev = save.completed[encounterId];
  const newBest = !prev || stars > prev.stars;
  const entry = {
    stars: (prev ? Math.max(prev.stars, stars) : stars) as Stars,
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
  };
  return {
    save: { ...save, completed: { ...save.completed, [encounterId]: entry } },
    stars,
    newBest,
  };
}

export function markHeard(save: SaveData, encounterId: string): SaveData {
  return save.heard.includes(encounterId) ? save : { ...save, heard: [...save.heard, encounterId] };
}

/** The first passage is always open; each later one opens when the one before it is won. */
export function isUnlocked(save: SaveData, orderedIds: readonly string[], id: string): boolean {
  const i = orderedIds.indexOf(id);
  if (i <= 0) return i === 0;
  return orderedIds[i - 1]! in save.completed;
}

export function updateSettings(save: SaveData, patch: Partial<Settings>): SaveData {
  return { ...save, settings: { ...save.settings, ...patch } };
}

export function resetProgress(save: SaveData): SaveData {
  return { ...newSave(), settings: save.settings };
}
