import { parseVpl } from '../core/content/bible';
import { buildEncounter, canonicalOrder, validateCollection } from '../core/content/build';
import type { Encounter } from '../core/content/types';
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

export function getEncounter(id: string | undefined): Encounter {
  return ENCOUNTERS.find((e) => e.id === id) ?? (ENCOUNTERS[0] as Encounter);
}

/** The encounter after `id` in reading order, or null at the end. */
export function nextEncounter(id: string): Encounter | null {
  const i = ENCOUNTERS.findIndex((e) => e.id === id);
  return i >= 0 && i < ENCOUNTERS.length - 1 ? (ENCOUNTERS[i + 1] as Encounter) : null;
}
