/** Design resolution (docs/DESIGN.md §5). Wider phones expand horizontally via Scale.EXPAND. */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

export const COLORS = {
  background: 0x1b1530,
  gold: 0xf4c95d,
  text: '#fdf6e3',
  subtext: '#b9a9d9',
} as const;

/** Test hooks are on in dev and in e2e builds (VITE_TEST_HOOKS=true), never in store builds. */
export const TEST_HOOKS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === 'true';
