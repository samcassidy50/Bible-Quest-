import type { Encounter } from '../core/content/types';
import { GEN_001 } from './genesis/gen-001';

/** All encounters in canonical order. Phase 3 replaces this with ContentService + JSON. */
export const ENCOUNTERS: readonly Encounter[] = [GEN_001];

export function getEncounter(id: string | undefined): Encounter {
  return ENCOUNTERS.find((e) => e.id === id) ?? (ENCOUNTERS[0] as Encounter);
}
