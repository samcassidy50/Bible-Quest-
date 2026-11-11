import type { SpecialId } from '../battle/types';

/** Orb timing and collection rules (docs/DESIGN.md §2.6). */

export const ORB_LIFETIME_MS = 4000;
/** Orbs don't appear in the first or last part of the reading. */
export const ORB_WINDOW = { start: 0.12, end: 0.9 } as const;

export interface OrbPlan {
  special: SpecialId;
  /** If set, the orb appears when this fraction of the reading is reached (word-anchored). */
  anchorFraction?: number;
}

export interface ScheduledOrb {
  special: SpecialId;
  /** When the orb appears, ms from the start of the reading. */
  atMs: number;
}

/**
 * Spreads orbs one at a time across the reading. Unanchored orbs are spaced evenly inside the
 * window; anchored ones keep their time. Orbs are then pushed apart so they never overlap, and
 * the result is clamped so each orb appears before the window ends.
 */
export function scheduleOrbs(
  orbs: readonly OrbPlan[],
  durationMs: number,
  lifetimeMs = ORB_LIFETIME_MS,
): ScheduledOrb[] {
  if (orbs.length === 0) return [];
  const start = durationMs * ORB_WINDOW.start;
  const end = durationMs * ORB_WINDOW.end;
  const step = (end - start) / orbs.length;

  const raw = orbs.map((o, i) => ({
    special: o.special,
    atMs:
      o.anchorFraction !== undefined
        ? clamp(o.anchorFraction * durationMs, start, end)
        : start + step * i,
  }));
  raw.sort((a, b) => a.atMs - b.atMs);

  // Keep orbs apart: ideally a full lifetime, but never more than the even spacing allows.
  const gap = Math.min(lifetimeMs, step);
  for (let i = 1; i < raw.length; i++) {
    const prev = raw[i - 1]!;
    if (raw[i]!.atMs < prev.atMs + gap) raw[i]!.atMs = prev.atMs + gap;
  }
  // If pushing ran past the window, shift everything back (keeping gaps) and clamp at the start.
  const overflow = raw[raw.length - 1]!.atMs - end;
  if (overflow > 0) for (const o of raw) o.atMs = Math.max(start, o.atMs - overflow);

  return raw.map((o) => ({ special: o.special, atMs: Math.round(o.atMs) }));
}

export type OrbStatus = 'pending' | 'active' | 'collected' | 'missed';

/**
 * Tracks each orb of one reading. Skip forfeits everything not yet collected; Replay brings
 * missed (and pending) orbs back but keeps collected ones.
 */
export class OrbTracker {
  private readonly status = new Map<SpecialId, OrbStatus>();

  constructor(specials: readonly SpecialId[]) {
    for (const s of specials) {
      if (this.status.has(s)) throw new Error(`Duplicate orb "${s}"`);
      this.status.set(s, 'pending');
    }
  }

  get(special: SpecialId): OrbStatus | undefined {
    return this.status.get(special);
  }

  get all(): { special: SpecialId; status: OrbStatus }[] {
    return [...this.status].map(([special, status]) => ({ special, status }));
  }

  get collected(): SpecialId[] {
    return this.all.filter((o) => o.status === 'collected').map((o) => o.special);
  }

  /** Orbs that still need to appear in this reading. */
  get pending(): SpecialId[] {
    return this.all.filter((o) => o.status === 'pending').map((o) => o.special);
  }

  spawn(special: SpecialId): boolean {
    return this.move(special, 'pending', 'active');
  }

  collect(special: SpecialId): boolean {
    return this.move(special, 'active', 'collected');
  }

  expire(special: SpecialId): boolean {
    return this.move(special, 'active', 'missed');
  }

  /** Skip: everything not collected is missed. */
  forfeitRemaining(): void {
    for (const [s, st] of this.status) if (st !== 'collected') this.status.set(s, 'missed');
  }

  /** Replay: missed and active orbs go back to pending; collected ones stay collected. */
  resetUncollected(): void {
    for (const [s, st] of this.status) if (st !== 'collected') this.status.set(s, 'pending');
  }

  private move(special: SpecialId, from: OrbStatus, to: OrbStatus): boolean {
    if (this.status.get(special) !== from) return false;
    this.status.set(special, to);
    return true;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
