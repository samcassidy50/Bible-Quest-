import type { SaveData } from '../progress/progress';

/**
 * The passage map (an original parchment map of the Genesis lands). Pure layout data and reveal
 * rules; scenes/map/MapScene.ts draws it. Coordinates are world pixels on a map that is WORLD_W
 * wide and WORLD_H tall (the design height), panned horizontally on phones.
 *
 * The map is a tree of paths: each location names the one it follows (`after`). Beginnings is one
 * trail; after it the player chooses a path (Noah or Babel), and each path opens on its own.
 */
export const WORLD_W = 4200;
export const WORLD_H = 720;

export interface Point {
  x: number;
  y: number;
}

export interface MapNode extends Point {
  id: string;
  /** Small emoji glyph shown in the medallion. */
  icon: string;
  /** The location this one follows; the first location has none. */
  after?: string;
}

/** A path the player can choose after the location it branches from. */
export interface MapPath {
  name: string;
  /** Ids of its locations, in reading order. */
  ids: readonly string[];
}

const BEGINNINGS = [
  'gen-001',
  'gen-002',
  'gen-003',
  'gen-004',
  'gen-005',
  'gen-006',
  'gen-007',
  'gen-008',
  'gen-009',
  'gen-010',
  'gen-011',
];
const NOAH = [
  'gen-019',
  'gen-020',
  'gen-021',
  'gen-022',
  'gen-023',
  'gen-024',
  'gen-025',
  'gen-026',
  'gen-027',
];
const BABEL = ['gen-031'];

/** The paths after Beginnings, offered as a choice at its last location. */
export const MAP_PATHS: readonly MapPath[] = [
  { name: 'Noah and the Flood', ids: NOAH },
  { name: 'The Tower of Babel', ids: BABEL },
];

const PLACES: Record<string, [number, number, string]> = {
  // Beginnings: winding left to right through the Deep and Eden.
  'gen-001': [230, 470, '🌑'],
  'gen-002': [420, 300, '🌊'],
  'gen-003': [610, 480, '☀️'],
  'gen-004': [800, 320, '🐟'],
  'gen-005': [990, 500, '🧑'],
  'gen-006': [1180, 310, '🌅'],
  'gen-007': [1370, 490, '🌳'],
  'gen-008': [1560, 300, '🤝'],
  'gen-009': [1750, 480, '🐍'],
  'gen-010': [1940, 300, '🍃'],
  'gen-011': [2140, 450, '🌿'],
  // Noah: north-east, up toward Ararat.
  'gen-019': [2360, 320, '🔨'],
  'gen-020': [2550, 160, '🦒'],
  'gen-021': [2740, 330, '🛶'],
  'gen-022': [2930, 160, '🌧️'],
  'gen-023': [3120, 330, '🌊'],
  'gen-024': [3310, 160, '🕊️'],
  'gen-025': [3500, 330, '⛰️'],
  'gen-026': [3690, 160, '🌾'],
  'gen-027': [3880, 320, '🌈'],
  // Babel: south-east, down onto the plain of Shinar.
  'gen-031': [2420, 570, '🗼'],
};

/** Each location follows the one before it on its trail; a path's first follows `from`. */
function trail(ids: readonly string[], from?: string): [string, string | undefined][] {
  return ids.map((id, i) => [id, i === 0 ? from : ids[i - 1]]);
}

const AFTER = new Map([
  ...trail(BEGINNINGS),
  ...trail(NOAH, 'gen-011'),
  ...trail(BABEL, 'gen-011'),
]);

/** Locations in reading order (Beginnings, then each path). */
export const MAP_NODES: readonly MapNode[] = [...BEGINNINGS, ...NOAH, ...BABEL].map((id) => {
  const [x, y, icon] = PLACES[id]!;
  const after = AFTER.get(id);
  return after ? { id, x, y, icon, after } : { id, x, y, icon };
});

const byId = new Map(MAP_NODES.map((n) => [n.id, n]));

export function mapNode(id: string): MapNode | undefined {
  return byId.get(id);
}

/** The location a node follows, if any. */
export function parentOf(node: MapNode): MapNode | undefined {
  return node.after ? byId.get(node.after) : undefined;
}

/** The locations that follow `id` (two or more where the player chooses a path). */
export function childrenOf(id: string): MapNode[] {
  return MAP_NODES.filter((n) => n.after === id);
}

/** The single location that follows `id`, or null at a fork or the end of a path. */
export function nextOnMap(id: string): string | null {
  const kids = childrenOf(id);
  return kids.length === 1 ? kids[0]!.id : null;
}

/** How many locations lie before this one on its trail. */
function depth(node: MapNode): number {
  let d = 0;
  for (let p = parentOf(node); p; p = parentOf(p)) d++;
  return d;
}

/** Region names painted on the map (place names from Genesis 1–11). */
export const MAP_REGIONS: readonly (Point & { name: string })[] = [
  { name: 'THE DEEP', x: 330, y: 170 },
  { name: 'EDEN', x: 1450, y: 180 },
  { name: 'ARARAT', x: 3360, y: 640 },
  { name: 'SHINAR', x: 2780, y: 660 },
];

export type NodeState = 'done' | 'open' | 'hidden';

/** done = won; open = playable now (the first, or one whose trail-mate before it is won); hidden = not yet revealed. */
export function nodeStates(save: SaveData, unlockAll = false): { id: string; state: NodeState }[] {
  return MAP_NODES.map((n) => {
    if (n.id in save.completed) return { id: n.id, state: 'done' as const };
    const open = unlockAll || !n.after || n.after in save.completed;
    return { id: n.id, state: open ? ('open' as const) : ('hidden' as const) };
  });
}

/** Visible locations the player hasn't seen appear yet (they get the reveal animation). */
export function newlyRevealed(save: SaveData, unlockAll = false): string[] {
  return nodeStates(save, unlockAll)
    .filter((n) => n.state !== 'hidden' && !save.seenOnMap.includes(n.id))
    .map((n) => n.id);
}

/**
 * Where the hero stands: at the open location furthest along its trail. When the furthest open
 * locations are the start of a choice of paths, the hero waits at the fork instead.
 */
export function focusNode(save: SaveData, unlockAll = false): MapNode {
  const states = nodeStates(save, unlockAll);
  const open = MAP_NODES.filter((_, i) => states[i]!.state === 'open');
  const visible = MAP_NODES.filter((_, i) => states[i]!.state !== 'hidden');
  const pool = open.length > 0 ? open : visible;
  const best = Math.max(...pool.map(depth));
  const furthest = pool.filter((n) => depth(n) === best);
  const fork = furthest[0]?.after;
  if (furthest.length > 1 && furthest.every((n) => n.after === fork) && fork)
    return byId.get(fork)!;
  return furthest[0] ?? MAP_NODES[0]!;
}

/** True while the player stands at a fork with no path started yet. */
export function choosingPath(save: SaveData, unlockAll = false): boolean {
  const fork = focusNode(save, unlockAll);
  const kids = childrenOf(fork.id);
  return (
    fork.id in save.completed && kids.length > 1 && kids.every((k) => !(k.id in save.completed))
  );
}

/** Curve control point for the trail into `node` from the location it follows (bends alternately). */
export function trailControl(node: MapNode): Point {
  const a = parentOf(node) ?? node;
  const b = node;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = (depth(node) % 2 === 0 ? 1 : -1) * 70;
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
