import { EASES, fullPose, lerpPose, type EaseName, type Pose } from './pose';

export interface Keyframe {
  /** ms from the start of the clip */
  at: number;
  pose: Partial<Pose>;
  /** Easing into this keyframe from the previous one (default inOut). */
  ease?: EaseName;
}

export interface ClipEvent {
  at: number;
  /** e.g. "impact" — the frame a hit should land on. */
  name: string;
}

export interface Clip {
  name: string;
  duration: number;
  /** Loops forever (idle, run). */
  loop: boolean;
  /** One-shot that stays on its last frame instead of returning to the base loop (die). */
  hold?: boolean;
  keys: readonly Keyframe[];
  events?: readonly ClipEvent[];
}

/** Playback time → time inside the clip (wraps for loops, clamps otherwise). */
export function localTime(clip: Clip, t: number): number {
  if (clip.loop) return ((t % clip.duration) + clip.duration) % clip.duration;
  return Math.min(clip.duration, Math.max(0, t));
}

export function samplePose(clip: Clip, t: number): Pose {
  const lt = localTime(clip, t);
  const keys = clip.keys;
  let i = 1;
  while (i < keys.length - 1 && keys[i]!.at < lt) i++;
  const a = keys[i - 1]!;
  const b = keys[i]!;
  const span = b.at - a.at;
  const k = span <= 0 ? 1 : Math.min(1, Math.max(0, (lt - a.at) / span));
  return lerpPose(fullPose(a.pose), fullPose(b.pose), EASES[b.ease ?? 'inOut'](k));
}

/**
 * Names of events crossed when playback moves from `from` (exclusive) to `to` (inclusive).
 * Loops fire their events once per cycle.
 */
export function eventsBetween(clip: Clip, from: number, to: number): string[] {
  const events = clip.events ?? [];
  if (events.length === 0 || to <= from) return [];
  if (!clip.loop) return events.filter((e) => e.at > from && e.at <= to).map((e) => e.name);
  const out: string[] = [];
  const d = clip.duration;
  for (let cycle = Math.floor(from / d); cycle <= Math.floor(to / d); cycle++) {
    for (const e of events) {
      const abs = cycle * d + e.at;
      if (abs > from && abs <= to) out.push(e.name);
    }
  }
  return out;
}

/** Authoring mistakes in a clip, as readable messages (empty when valid). */
export function validateClip(clip: Clip): string[] {
  const errors: string[] = [];
  const keys = clip.keys;
  if (keys.length < 2) errors.push(`${clip.name}: needs at least 2 keyframes`);
  if (keys[0]?.at !== 0) errors.push(`${clip.name}: first keyframe must be at 0`);
  if (keys[keys.length - 1]?.at !== clip.duration)
    errors.push(`${clip.name}: last keyframe must be at duration`);
  for (let i = 1; i < keys.length; i++) {
    if (keys[i]!.at <= keys[i - 1]!.at)
      errors.push(`${clip.name}: keyframes must be in increasing order`);
  }
  for (const e of clip.events ?? []) {
    if (e.at < 0 || e.at > clip.duration)
      errors.push(`${clip.name}: event "${e.name}" is outside the clip`);
  }
  if (clip.loop && keys.length >= 2) {
    const first = fullPose(keys[0]!.pose);
    const last = fullPose(keys[keys.length - 1]!.pose);
    if (JSON.stringify(first) !== JSON.stringify(last))
      errors.push(`${clip.name}: a loop must end on its first pose`);
  }
  return errors;
}
