import type { SaveData } from '../progress/progress';

/**
 * The passage map (an original parchment map of the Genesis 1–11 lands). Pure layout data and
 * reveal rules; scenes/map/MapScene.ts draws it. Coordinates are world pixels on a map that is
 * WORLD_W wide and WORLD_H tall (the design height), panned horizontally on phones.
 */
export const WORLD_W = 2400;
export const WORLD_H = 720;

export interface Point {
  x: number;
  y: number;
}

export interface MapNode extends Point {
  id: string;
  /** Small emoji glyph shown in the medallion. */
  icon: string;
}

/** Locations in reading order, winding left to right across the map. */
export const MAP_NODES: readonly MapNode[] = [
  { id: 'gen-001', x: 230, y: 470, icon: '🌑' },
  { id: 'gen-002', x: 420, y: 300, icon: '☀️' },
  { id: 'gen-003', x: 610, y: 480, icon: '🧑' },
  { id: 'gen-004', x: 820, y: 350, icon: '🌳' },
  { id: 'gen-005', x: 1010, y: 520, icon: '🐍' },
  { id: 'gen-006', x: 1190, y: 320, icon: '🌿' },
  { id: 'gen-007', x: 1390, y: 500, icon: '🚪' },
  { id: 'gen-008', x: 1590, y: 300, icon: '🛶' },
  { id: 'gen-009', x: 1770, y: 480, icon: '🌊' },
  { id: 'gen-010', x: 1970, y: 280, icon: '🌈' },
  { id: 'gen-011', x: 2190, y: 450, icon: '🗼' },
];

/** Region names painted on the map (place names from Genesis 1–11). */
export const MAP_REGIONS: readonly (Point & { name: string })[] = [
  { name: 'THE DEEP', x: 330, y: 170 },
  { name: 'EDEN', x: 960, y: 190 },
  { name: 'LAND OF NOD', x: 1410, y: 640 },
  { name: 'ARARAT', x: 1880, y: 140 },
  { name: 'SHINAR', x: 2210, y: 640 },
];

export type NodeState = 'done' | 'open' | 'hidden';

/** done = won; open = playable now (the first, or the one after a win); hidden = not yet revealed. */
export function nodeStates(save: SaveData, unlockAll = false): { id: string; state: NodeState }[] {
  return MAP_NODES.map((n, i) => {
    if (n.id in save.completed) return { id: n.id, state: 'done' as const };
    const prev = MAP_NODES[i - 1];
    const open = unlockAll || i === 0 || (prev !== undefined && prev.id in save.completed);
    return { id: n.id, state: open ? ('open' as const) : ('hidden' as const) };
  });
}

/** Visible locations the player hasn't seen appear yet (they get the reveal animation). */
export function newlyRevealed(save: SaveData, unlockAll = false): string[] {
  return nodeStates(save, unlockAll)
    .filter((n) => n.state !== 'hidden' && !save.seenOnMap.includes(n.id))
    .map((n) => n.id);
}

/** The location to centre the camera on: the furthest one that is open (or the last one won). */
export function focusNode(save: SaveData, unlockAll = false): MapNode {
  const states = nodeStates(save, unlockAll);
  let idx = 0;
  states.forEach((s, i) => {
    if (s.state !== 'hidden') idx = i;
  });
  return MAP_NODES[idx]!;
}

/** Curve control point for the trail from node i-1 to node i (bends alternately). */
export function trailControl(i: number): Point {
  const a = MAP_NODES[i - 1]!;
  const b = MAP_NODES[i]!;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = (i % 2 === 0 ? 1 : -1) * 70;
  return { x: mx + (-dy / len) * bend, y: my + (dx / len) * bend };
}

export function bezier(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

/**
 * Dashes along a quadratic curve, drawn only up to `progress` (0..1) of its length, so a trail
 * can "draw itself" when a new location is revealed. Returns [x1, y1, x2, y2] segments.
 */
export function dashedCurve(
  p0: Point,
  c: Point,
  p1: Point,
  progress = 1,
  dash = 14,
  gap = 10,
  samples = 120,
): [number, number, number, number][] {
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) pts.push(bezier(p0, c, p1, i / samples));
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = cum[cum.length - 1]!;
  const limit = total * Math.min(1, Math.max(0, progress));
  const at = (d: number): Point => {
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < d) i++;
    const span = cum[i]! - cum[i - 1]! || 1;
    const k = (d - cum[i - 1]!) / span;
    return {
      x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * k,
      y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * k,
    };
  };
  const out: [number, number, number, number][] = [];
  for (let d = 0; d < limit; d += dash + gap) {
    const a = at(d);
    const b = at(Math.min(d + dash, limit));
    out.push([a.x, a.y, b.x, b.y]);
  }
  return out;
}
