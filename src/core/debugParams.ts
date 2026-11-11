import { SPECIAL_IDS, type SpecialId } from './battle/types';

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
  /** Specials unlocked without collecting orbs, e.g. `?specials=sword,shield`. */
  specials?: SpecialId[];
  /** Starting Faith meter, e.g. `?faith=5` to test the ultimate. */
  faith?: number;
  /** `?narration=off`: silent reading that waits the estimated time (tests). */
  narrationOff: boolean;
  /** `?autoCollect=1`: orbs collect themselves (accessibility setting, until Phase 5 settings). */
  autoCollect: boolean;
  fast: boolean;
  freeze: boolean;
  fps: boolean;
}

const ENCOUNTER_ID = /^[a-z0-9-]{1,40}$/;

export function parseDebugParams(search: string): DebugParams {
  const p = new URLSearchParams(search);
  const flag = (name: string) => p.get(name) === '1' || p.get(name) === 'true';

  const result: DebugParams = {
    fast: flag('fast'),
    freeze: flag('freeze'),
    fps: flag('fps'),
    narrationOff: p.get('narration') === 'off',
    autoCollect: flag('autoCollect'),
  };

  const scene = p.get('scene');
  if (scene && (SCENE_KEYS as readonly string[]).includes(scene)) result.scene = scene as SceneKey;

  const encounter = p.get('encounter');
  if (encounter && ENCOUNTER_ID.test(encounter)) result.encounter = encounter;

  const seed = p.get('seed');
  if (seed !== null && /^\d{1,10}$/.test(seed)) result.seed = Number(seed) >>> 0;

  const auto = p.get('autoAnswer');
  if (auto === 'correct' || auto === 'wrong') result.autoAnswer = auto;

  const specials = p.get('specials');
  if (specials !== null) {
    const ids = specials
      .split(',')
      .filter((s): s is SpecialId => (SPECIAL_IDS as readonly string[]).includes(s));
    result.specials = [...new Set(ids)];
  }

  const faith = p.get('faith');
  if (faith !== null && /^\d{1,2}$/.test(faith)) result.faith = Number(faith);

  return result;
}
