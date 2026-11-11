/**
 * Cutout-rig poses (docs/DESIGN.md §11.3 option 2). A pose is a set of joint angles in degrees
 * plus a few body offsets. Angles use "forward" conventions so clips read naturally:
 *  - arm / thigh: 0 = hanging down, 90 = pointing forward, 180 = straight up
 *  - elbow: + bends the forearm forward/up; knee: + bends the shin backward
 *  - lean / head / sword: + tips forward; body: + rotates the whole figure forward about the feet
 * The renderer (scenes/hero/HeroRig.ts) maps these onto Phaser rotations.
 */
export const POSE_KEYS = [
  'x',
  'y',
  'body',
  'lean',
  'head',
  'armB',
  'elbowB',
  'armF',
  'elbowF',
  'thighB',
  'kneeB',
  'thighF',
  'kneeF',
  'sword',
  'squash',
] as const;

export type PoseKey = (typeof POSE_KEYS)[number];
export type Pose = Record<PoseKey, number>;

export const REST_POSE: Readonly<Pose> = Object.freeze({
  x: 0,
  y: 0,
  body: 0,
  lean: 0,
  head: 0,
  armB: 0,
  elbowB: 0,
  armF: 0,
  elbowF: 0,
  thighB: 0,
  kneeB: 0,
  thighF: 0,
  kneeF: 0,
  sword: 0,
  squash: 1,
});

export function fullPose(p: Partial<Pose>): Pose {
  return { ...REST_POSE, ...p };
}

export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const out = {} as Pose;
  for (const key of POSE_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

/** Easing curves, k in [0, 1] → [0, 1] (back overshoots past 1 on the way). */
export const EASES = {
  linear: (k: number) => k,
  in: (k: number) => k * k,
  out: (k: number) => 1 - (1 - k) * (1 - k),
  inOut: (k: number) => (1 - Math.cos(Math.PI * k)) / 2,
  back: (k: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2;
  },
} as const;

export type EaseName = keyof typeof EASES;
