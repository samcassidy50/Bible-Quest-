import { frameClip, type FrameStep } from './clip';
import type { HeroFrame } from './heroSheet';

/**
 * Animation clips for the pixel-art hero. Frames come from the sprite sheet built by
 * scripts/art/process_hero.py (see heroSheet.ts for the frame names).
 *
 * Placeholder until its own art lands: `punch` borrows slash frames.
 */

const f = (frame: HeroFrame, ms: number): FrameStep<HeroFrame> => ({ frame, ms });

export const HERO_CLIPS = {
  // Rest a little longer on the first frame so the breathing feels natural.
  idle: frameClip(
    'idle',
    [f('idle_0', 500), f('idle_1', 250), f('idle_2', 250), f('idle_3', 250)],
    {
      loop: true,
    },
  ),
  run: frameClip(
    'run',
    [
      f('run_0', 75),
      f('run_1', 75),
      f('run_2', 75),
      f('run_3', 75),
      f('run_4', 75),
      f('run_5', 75),
      f('run_6', 75),
      f('run_7', 75),
    ],
    { loop: true },
  ),
  punch: frameClip(
    'punch',
    [f('slash_0', 110), f('slash_2', 80), f('thrust', 150), f('idle_0', 80)],
    {
      events: [
        { at: 110, name: 'swing' },
        { at: 190, name: 'impact' },
      ],
    },
  ),
  // Ready, anticipation (held), swing (fast), impact, follow-through, recovery.
  slash: frameClip(
    'slash',
    [
      f('slash_0', 80),
      f('slash_1', 180),
      f('slash_2', 60),
      f('slash_3', 140),
      f('slash_4', 110),
      f('slash_5', 120),
    ],
    {
      events: [
        { at: 260, name: 'swing' },
        { at: 320, name: 'impact' },
      ],
    },
  ),
  slashPowered: frameClip(
    'slashPowered',
    [
      f('power_0', 140),
      f('power_1', 120),
      f('power_2', 160),
      f('power_3', 130),
      f('power_4', 150),
      f('power_5', 140),
    ],
    {
      events: [
        { at: 360, name: 'swing' },
        { at: 420, name: 'impact' },
      ],
    },
  ),
  // Flinch, recoil, shake it off.
  hurt: frameClip('hurt', [f('hurt_0', 120), f('hurt_1', 140), f('hurt_2', 160)]),
  // Stagger, sway, kneel, slump, rest (held). Gentle: worn out, not hurt.
  die: frameClip(
    'die',
    [f('down_0', 180), f('down_1', 200), f('down_2', 240), f('down_3', 260), f('down_4', 500)],
    { hold: true },
  ),
  // Relief, crouch, jump, land, proud pose (held).
  victory: frameClip(
    'victory',
    [f('win_0', 180), f('win_1', 120), f('win_2', 220), f('win_3', 160), f('win_4', 500)],
    { hold: true },
  ),
  // Brace, guard (held), take the hit, recover.
  block: frameClip('block', [
    f('block_0', 90),
    f('block_1', 200),
    f('block_2', 150),
    f('block_3', 140),
  ]),
  // Ready, bow, raise the sword, power (a small hop), point forward.
  cast: frameClip('cast', [
    f('cast_0', 100),
    f('cast_1', 160),
    f('cast_2', 140),
    f('cast_3', 260),
    f('cast_4', 160),
  ]),
} as const;

export type HeroClipName = keyof typeof HERO_CLIPS;
export const HERO_CLIP_NAMES = Object.keys(HERO_CLIPS) as HeroClipName[];
