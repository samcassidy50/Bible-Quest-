/**
 * Debug/test URL parameters (see docs/DESIGN.md §8.2).
 * Parsing is pure so it can be unit-tested; main.ts decides whether to honour them.
 */
export const SCENE_KEYS = ['boot', 'title', 'battle', 'scripture'] as const;
export type SceneKey = (typeof SCENE_KEYS)[number];

export interface DebugParams {
  scene?: SceneKey;
  encounter?: string;
  seed?: number;
  autoAnswer?: 'correct' | 'wrong';
  fast: boolean;
  freeze: boolean;
  fps: boolean;
}

const ENCOUNTER_ID = /^[a-z0-9-]{1,40}$/;

export function parseDebugParams(search: string): DebugParams {
  const p = new URLSearchParams(search);
  const flag = (name: string) => p.get(name) === '1' || p.get(name) === 'true';

  const result: DebugParams = { fast: flag('fast'), freeze: flag('freeze'), fps: flag('fps') };

  const scene = p.get('scene');
  if (scene && (SCENE_KEYS as readonly string[]).includes(scene)) result.scene = scene as SceneKey;

  const encounter = p.get('encounter');
  if (encounter && ENCOUNTER_ID.test(encounter)) result.encounter = encounter;

  const seed = p.get('seed');
  if (seed !== null && /^\d{1,10}$/.test(seed)) result.seed = Number(seed) >>> 0;

  const auto = p.get('autoAnswer');
  if (auto === 'correct' || auto === 'wrong') result.autoAnswer = auto;

  return result;
}
