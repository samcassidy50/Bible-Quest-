import { z } from 'zod';
import { SPECIAL_IDS, type SpecialId } from '../battle/types';
import { ITEM_IDS, RUNE_SLOTS, type ItemId } from '../battle/runes';

/**
 * Player progression (docs/DESIGN.md §2.5): stars per passage, unlocks in reading order,
 * runes set in the hero's items (core/progress/runes.ts), and settings. Pure functions over a versioned, validated save.
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

// ── Settings ───────────────────────────────────────────────────────────────

export const READING_SPEEDS = { slow: 0.75, normal: 0.9, fast: 1.05 } as const;
export type ReadingSpeed = keyof typeof READING_SPEEDS;

/** Seconds per question when the optional timer is on. */
export const QUESTION_TIME_S = 20;

// ── Save data ──────────────────────────────────────────────────────────────

export const SAVE_VERSION = 1;

/** A rune slot holds the id of the passage that awarded the rune, or null when empty. */
const slotsSchema = z
  .array(z.string().nullable().catch(null))
  .catch([])
  .transform((a) => Array.from({ length: RUNE_SLOTS }, (_, i) => a[i] ?? null));

export const emptyRuneSlots = (): Record<ItemId, (string | null)[]> =>
  Object.fromEntries(ITEM_IDS.map((id) => [id, Array<null>(RUNE_SLOTS).fill(null)])) as Record<
    ItemId,
    (string | null)[]
  >;

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
  /** Map locations whose reveal animation has played. */
  seenOnMap: z.array(z.string()).catch([]),
  /**
   * Runes set in each item's slots. Saves from before runes had `upgrades` instead; that field
   * is dropped on load (zod strips unknown keys) and the stars stay as the passage scores.
   */
  runes: z
    .object({
      sword: slotsSchema,
      shield: slotsSchema,
      breastplate: slotsSchema,
      sandals: slotsSchema,
    })
    .catch(emptyRuneSlots),
  settings: z
    .object({
      sound: z.boolean().catch(true),
      narration: z.boolean().catch(true),
      readingSpeed: z.enum(['slow', 'normal', 'fast']).catch('normal'),
      autoCollect: z.boolean().catch(false),
      timer: z.boolean().catch(false),
      /** Dev builds only: foes fall in one hit and every reading can be skipped. */
      quickTest: z.boolean().catch(false),
      /** The hero the player chose; null until they pick one (then the choose screen shows). */
      hero: z.enum(['boy', 'girl']).nullable().catch(null),
    })
    .catch({
      sound: true,
      narration: true,
      readingSpeed: 'normal',
      autoCollect: false,
      timer: false,
      quickTest: false,
      hero: null,
    }),
});

export type SaveData = z.infer<typeof saveSchema>;
export type Settings = SaveData['settings'];
export type HeroKind = 'boy' | 'girl';

export function newSave(): SaveData {
  return saveSchema.parse({
    version: SAVE_VERSION,
    completed: {},
    heard: [],
    seenOnMap: [],
    runes: {},
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

/** Records that these map locations have been shown (so their reveal plays only once). */
export function markSeenOnMap(save: SaveData, ids: readonly string[]): SaveData {
  const add = ids.filter((id) => !save.seenOnMap.includes(id));
  return add.length === 0 ? save : { ...save, seenOnMap: [...save.seenOnMap, ...add] };
}

/**
 * Armor earned along the map: each passage can award a special (or the ultimate) the first time
 * it is won. The hero starts with only the basic attack.
 */
export function ownedArmor(
  save: SaveData,
  encounters: readonly { id: string; unlocks?: SpecialId | 'ultimate' }[],
): { specials: SpecialId[]; ultimate: boolean } {
  const earned = new Set(
    encounters.filter((e) => e.unlocks && e.id in save.completed).map((e) => e.unlocks),
  );
  return { specials: SPECIAL_IDS.filter((id) => earned.has(id)), ultimate: earned.has('ultimate') };
}
