import { parseVpl } from '../core/content/bible';
import { buildEncounter, canonicalOrder, validateCollection } from '../core/content/build';
import type { Encounter } from '../core/content/types';
import { nextOnMap } from '../core/map/worldMap';
import genesisSource from '../../content/source/retelling/GEN.txt?raw';

/**
 * ContentService (docs/DESIGN.md §3.1): loads every encounter file, resolves its verses from the
 * kid-friendly retelling in content/source/retelling/, and validates it. Any content mistake throws at startup (and in CI).
 */
export const BOOK_ORDER = ['GEN'] as const;

const files = import.meta.glob('../../content/encounters/**/*.json', {
  eager: true,
  import: 'default',
});

export const BIBLE = parseVpl(genesisSource);

export const ENCOUNTERS: readonly Encounter[] = (() => {
  const built = Object.entries(files).map(([path, raw]) =>
    buildEncounter(raw, BIBLE, path.replace('../../', '')),
  );
  const errors = validateCollection(built);
  if (errors.length > 0) throw new Error(`Content errors:\n${errors.join('\n')}`);
  return canonicalOrder(built, BOOK_ORDER);
})();

/** True when the passage for a map location is written (others show as "coming soon"). */
export function isBuilt(id: string): boolean {
  return ENCOUNTERS.some((e) => e.id === id);
}

export function getEncounter(id: string | undefined): Encounter {
  return ENCOUNTERS.find((e) => e.id === id) ?? (ENCOUNTERS[0] as Encounter);
}

/**
 * The encounter that follows `id` on its map trail, or null at the end of a path or at a fork
 * (where the player chooses the next path on the map).
 */
export function nextEncounter(id: string): Encounter | null {
  const next = nextOnMap(id);
  return ENCOUNTERS.find((e) => e.id === next) ?? null;
}
