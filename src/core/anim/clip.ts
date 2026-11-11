/** One sprite frame shown for `ms` milliseconds. */
export interface FrameStep<F extends string = string> {
  frame: F;
  ms: number;
}

export interface ClipEvent {
  at: number;
  /** e.g. "impact": the moment a hit should land. */
  name: string;
}

export interface Clip<F extends string = string> {
  name: string;
  /** Sum of every frame's `ms`. */
  duration: number;
  /** Loops forever (idle, run). */
  loop: boolean;
  /** One-shot that stays on its last frame instead of returning to the base loop (die). */
  hold?: boolean;
  frames: readonly FrameStep<F>[];
  events?: readonly ClipEvent[];
}

/** Builds a clip from its frames, deriving the duration. */
export function frameClip<F extends string>(
  name: string,
  frames: readonly FrameStep<F>[],
  opts: { loop?: boolean; hold?: boolean; events?: readonly ClipEvent[] } = {},
): Clip<F> {
  return {
    name,
    duration: frames.reduce((sum, f) => sum + f.ms, 0),
    loop: opts.loop ?? false,
    hold: opts.hold,
    frames,
    events: opts.events,
  };
}

/** Playback time → time inside the clip (wraps for loops, clamps otherwise). */
export function localTime(clip: Clip, t: number): number {
  if (clip.loop) return ((t % clip.duration) + clip.duration) % clip.duration;
  return Math.min(clip.duration, Math.max(0, t));
}

/** Index into `clip.frames` showing at time `t`. */
export function frameIndexAt(clip: Clip, t: number): number {
  const lt = localTime(clip, t);
  let end = 0;
  for (let i = 0; i < clip.frames.length; i++) {
    end += clip.frames[i]!.ms;
    if (lt < end) return i;
  }
  return clip.frames.length - 1;
}

export function frameAt<F extends string>(clip: Clip<F>, t: number): F {
  return clip.frames[frameIndexAt(clip, t)]!.frame;
}

/** Time at which frame `index` starts. */
export function frameStart(clip: Clip, index: number): number {
  return clip.frames.slice(0, index).reduce((sum, f) => sum + f.ms, 0);
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
export function validateClip(clip: Clip, knownFrames?: readonly string[]): string[] {
  const errors: string[] = [];
  if (clip.frames.length === 0) errors.push(`${clip.name}: needs at least 1 frame`);
  for (const f of clip.frames) {
    if (!(f.ms > 0)) errors.push(`${clip.name}: frame "${f.frame}" needs a positive duration`);
    if (knownFrames && !knownFrames.includes(f.frame))
      errors.push(`${clip.name}: unknown frame "${f.frame}"`);
  }
  const total = clip.frames.reduce((sum, f) => sum + f.ms, 0);
  if (total !== clip.duration) errors.push(`${clip.name}: duration must equal the frame total`);
  for (const e of clip.events ?? []) {
    if (e.at < 0 || e.at > clip.duration)
      errors.push(`${clip.name}: event "${e.name}" is outside the clip`);
  }
  if (clip.loop && clip.hold) errors.push(`${clip.name}: a loop cannot hold`);
  return errors;
}
