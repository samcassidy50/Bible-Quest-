import { TEST_HOOKS_ENABLED } from '../config';

/** Read-only game state for Playwright/Maestro assertions (docs/DESIGN.md §8.2). */
export interface TestState {
  ready: boolean;
  scene: string | null;
  platform: string;
  seed: number;
  paused: boolean;
}

declare global {
  interface Window {
    __TEST__?: Readonly<TestState>;
  }
}

let state: TestState = { ready: false, scene: null, platform: 'web', seed: 0, paused: false };

export function updateTestState(patch: Partial<TestState>): void {
  if (!TEST_HOOKS_ENABLED) return;
  state = { ...state, ...patch };
  window.__TEST__ = Object.freeze({ ...state });
}
