import type { Clip } from './clip';
import type { Pose } from './pose';

/**
 * Animation clips for the original chibi hero (cutout rig). Angles follow pose.ts conventions.
 * Sword angle is relative to the hand: blade direction = sword − armF − elbowF
 * (0 = up, 90 = forward, −90 = back), so each pose sets `sword` to keep the blade where it should be.
 */

/** Relaxed stance, sword held up and slightly forward. */
export const IDLE: Partial<Pose> = {
  lean: 3,
  armF: 20,
  elbowF: 50,
  sword: 110,
  armB: -10,
  elbowB: 30,
  thighF: 8,
  kneeF: 6,
  thighB: -8,
  kneeB: 6,
};

const at = (ms: number, pose: Partial<Pose>, ease?: Clip['keys'][number]['ease']) => ({
  at: ms,
  pose,
  ease,
});

const RUN_A: Partial<Pose> = {
  lean: 14,
  head: -4,
  thighF: 40,
  kneeF: 10,
  thighB: -35,
  kneeB: 50,
  armF: -20,
  elbowF: 70,
  sword: 80,
  armB: 45,
  elbowB: 60,
};

const PUNCH_HIT: Partial<Pose> = {
  ...IDLE,
  x: 20,
  lean: 16,
  head: 6,
  armB: 96,
  elbowB: 0,
  armF: -45,
  elbowF: 60,
  sword: 45,
  thighF: 30,
  kneeF: 15,
  thighB: -28,
  kneeB: 15,
};

const SLASH_HIT: Partial<Pose> = {
  ...IDLE,
  x: 20,
  y: 4,
  lean: 18,
  head: 6,
  armF: 75,
  elbowF: 0,
  sword: 185,
  armB: -30,
  elbowB: 40,
  thighF: 35,
  kneeF: 20,
  thighB: -30,
  kneeB: 20,
};

const SLAM_HIT: Partial<Pose> = {
  x: 30,
  y: 6,
  squash: 0.92,
  lean: 24,
  head: 8,
  armF: 70,
  elbowF: 0,
  sword: 170,
  armB: -40,
  elbowB: 30,
  thighF: 50,
  kneeF: 30,
  thighB: -40,
  kneeB: 30,
};

const HURT: Partial<Pose> = {
  ...IDLE,
  x: -16,
  y: -4,
  lean: -20,
  head: -16,
  armF: -20,
  elbowF: 30,
  sword: 60,
  armB: -35,
  elbowB: 40,
  thighF: -5,
  thighB: -20,
  kneeB: 20,
};

const DOWN: Partial<Pose> = {
  body: -84,
  x: 30,
  lean: 10,
  head: 6,
  armF: 110,
  elbowF: 10,
  sword: 100,
  armB: 130,
  elbowB: 20,
  thighF: 25,
  kneeF: 30,
  thighB: 10,
  kneeB: 20,
};

const SWORD_UP: Partial<Pose> = {
  armF: 175,
  elbowF: 0,
  sword: 175,
  armB: 130,
  elbowB: 60,
  head: -10,
};

const BLOCK: Partial<Pose> = {
  ...IDLE,
  x: -6,
  lean: -6,
  head: -4,
  armB: 85,
  elbowB: 95,
  armF: 10,
  elbowF: 60,
  sword: 100,
  thighF: 20,
  kneeF: 10,
  thighB: -20,
  kneeB: 20,
};

const CAST: Partial<Pose> = {
  ...IDLE,
  y: -6,
  lean: -4,
  head: -14,
  armF: 160,
  elbowF: 20,
  sword: 180,
  armB: 150,
  elbowB: 30,
};

export const HERO_CLIPS = {
  idle: {
    name: 'idle',
    duration: 1400,
    loop: true,
    keys: [
      at(0, IDLE),
      at(700, {
        ...IDLE,
        y: -3,
        lean: 5,
        head: -2,
        armF: 22,
        elbowF: 46,
        sword: 108,
        armB: -12,
        elbowB: 34,
      }),
      at(1400, IDLE),
    ],
  },
  run: {
    name: 'run',
    duration: 440,
    loop: true,
    keys: [
      at(0, RUN_A),
      at(110, {
        y: -10,
        lean: 12,
        thighF: 5,
        kneeF: 60,
        thighB: 0,
        kneeB: 15,
        armF: 10,
        elbowF: 70,
        sword: 110,
        armB: 10,
        elbowB: 60,
      }),
      at(220, {
        lean: 14,
        head: -4,
        thighF: -35,
        kneeF: 50,
        thighB: 40,
        kneeB: 10,
        armF: 40,
        elbowF: 70,
        sword: 140,
        armB: -20,
        elbowB: 60,
      }),
      at(330, {
        y: -10,
        lean: 12,
        thighF: 0,
        kneeF: 15,
        thighB: 5,
        kneeB: 60,
        armF: 10,
        elbowF: 70,
        sword: 110,
        armB: 10,
        elbowB: 60,
      }),
      at(440, RUN_A),
    ],
  },
  punch: {
    name: 'punch',
    duration: 420,
    loop: false,
    events: [
      { at: 110, name: 'swing' },
      { at: 190, name: 'impact' },
    ],
    keys: [
      at(0, IDLE),
      at(
        110,
        {
          ...IDLE,
          x: -6,
          lean: -6,
          head: -3,
          armB: -35,
          elbowB: 110,
          thighF: 15,
          kneeF: 10,
          thighB: -15,
        },
        'out',
      ),
      at(190, PUNCH_HIT, 'in'),
      at(290, { ...PUNCH_HIT, x: 18, armB: 90, elbowB: 8 }, 'out'),
      at(420, IDLE),
    ],
  },
  slash: {
    name: 'slash',
    duration: 520,
    loop: false,
    events: [
      { at: 170, name: 'swing' },
      { at: 250, name: 'impact' },
    ],
    keys: [
      at(0, IDLE),
      at(
        170,
        {
          ...IDLE,
          x: -8,
          lean: -8,
          head: -4,
          armF: -70,
          elbowF: 40,
          sword: -90,
          armB: 30,
          elbowB: 60,
          thighF: 12,
          thighB: -12,
        },
        'out',
      ),
      at(250, SLASH_HIT, 'in'),
      at(340, { ...SLASH_HIT, armF: 100, elbowF: 10, sword: 180, lean: 16 }, 'out'),
      at(520, IDLE),
    ],
  },
  slashPowered: {
    name: 'slashPowered',
    duration: 760,
    loop: false,
    events: [
      { at: 330, name: 'swing' },
      { at: 470, name: 'impact' },
    ],
    keys: [
      at(0, IDLE),
      at(
        150,
        {
          y: 10,
          squash: 0.9,
          lean: 10,
          thighF: 40,
          kneeF: 70,
          thighB: -10,
          kneeB: 80,
          armF: -30,
          elbowF: 60,
          sword: -30,
          armB: 30,
          elbowB: 40,
        },
        'out',
      ),
      at(
        330,
        {
          x: 10,
          y: -60,
          squash: 1.05,
          lean: -12,
          head: -8,
          armF: 210,
          elbowF: 15,
          sword: 95,
          armB: 60,
          elbowB: 80,
          thighF: 30,
          kneeF: 80,
          thighB: -20,
          kneeB: 60,
        },
        'out',
      ),
      at(470, SLAM_HIT, 'in'),
      at(580, SLAM_HIT),
      at(760, IDLE),
    ],
  },
  hurt: {
    name: 'hurt',
    duration: 380,
    loop: false,
    keys: [at(0, IDLE), at(80, HURT, 'out'), at(380, IDLE)],
  },
  die: {
    name: 'die',
    duration: 1000,
    loop: false,
    hold: true,
    keys: [
      at(0, IDLE),
      at(
        180,
        { ...HURT, x: -12, lean: -24, head: -20, armF: -30, elbowF: 20, sword: 40, armB: -40 },
        'out',
      ),
      at(560, DOWN, 'in'),
      at(700, { ...DOWN, body: -80 }, 'out'),
      at(1000, { ...DOWN, body: -88, armF: 150, elbowF: 0, sword: 150, armB: 160 }, 'out'),
    ],
  },
  victory: {
    name: 'victory',
    duration: 900,
    loop: false,
    hold: true,
    keys: [
      at(0, IDLE),
      at(
        200,
        { ...IDLE, y: 8, squash: 0.92, lean: 6, thighF: 30, kneeF: 50, thighB: -10, kneeB: 60 },
        'out',
      ),
      at(420, { ...SWORD_UP, y: -40, thighF: 20, kneeF: 40, thighB: -15, kneeB: 50 }, 'out'),
      at(620, { ...SWORD_UP, squash: 0.95, thighF: 10, kneeF: 10, thighB: -10, kneeB: 10 }, 'in'),
      at(900, { ...SWORD_UP, lean: -4, head: -8, thighF: 10, thighB: -10 }, 'out'),
    ],
  },
  block: {
    name: 'block',
    duration: 520,
    loop: false,
    keys: [at(0, IDLE), at(120, BLOCK, 'out'), at(400, BLOCK), at(520, IDLE)],
  },
  cast: {
    name: 'cast',
    duration: 700,
    loop: false,
    keys: [at(0, IDLE), at(220, CAST, 'out'), at(520, CAST), at(700, IDLE)],
  },
} satisfies Record<string, Clip>;

export type HeroClipName = keyof typeof HERO_CLIPS;
export const HERO_CLIP_NAMES = Object.keys(HERO_CLIPS) as HeroClipName[];
