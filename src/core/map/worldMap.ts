import type { SaveData } from '../progress/progress';

/**
 * The passage maps (original parchment maps). Pure layout data and reveal rules;
 * scenes/map/MapScene.ts draws them. Coordinates are world pixels on a map that is `width` wide
 * and WORLD_H tall (the design height), panned horizontally on phones.
 *
 * Each map is a tree of paths: each location names the one it follows (`after`), always on the
 * same map. On Genesis 1–11, Beginnings is one trail; after it the player chooses a path (Noah,
 * Babel or Sodom), and each path opens on its own. A later map opens when a location on an
 * earlier one is won (`opensAfter`): Joseph in Egypt opens at the end of the Noah path.
 *
 * A map may list locations whose passages aren't written yet. Pass `built` to the reveal rules:
 * such a location shows as "coming soon" when it would otherwise be open.
 */
export const WORLD_H = 720;

export const MAP_IDS = ['genesis', 'egypt'] as const;
export type MapId = (typeof MAP_IDS)[number];

export interface Point {
  x: number;
  y: number;
}

export interface MapNode extends Point {
  id: string;
  /** The map this location is on. */
  map: MapId;
  /** Small emoji glyph shown in the medallion. */
  icon: string;
  /** The location this one follows (on the same map); a map's first location has none. */
  after?: string;
}

/** A path the player can choose after the location it branches from. */
export interface MapPath {
  name: string;
  /** Ids of its locations, in reading order. */
  ids: readonly string[];
}

export interface WorldMap {
  id: MapId;
  /** Shown on the plate at the top of the map. */
  title: string;
  /** Short name, for the signpost and the map switch button. */
  short: string;
  width: number;
  /** Region names painted on the map. */
  regions: readonly (Point & { name: string })[];
  /** Paths offered as a choice at a fork. */
  paths: readonly MapPath[];
  /** The location (on an earlier map) whose win opens this map; the first map has none. */
  opensAfter?: string;
  /** Where the signpost to this map stands on the map of `opensAfter`. */
  signpost?: Point;
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
const SODOM = ['gen-052', 'gen-053', 'gen-054'];

/** Joseph in Egypt (docs/joseph-map-plan.md): one trail, Genesis 37, 39–48 and 50:1-21. */
const JOSEPH = [
  ...[118, 119, 120],
  ...Array.from({ length: 38 }, (_, i) => 124 + i), // 124–161
  ...[166, 167, 168],
].map((n) => `gen-${String(n).padStart(3, '0')}`);

/** The paths after Beginnings, offered as a choice at its last location. */
export const MAP_PATHS: readonly MapPath[] = [
  { name: 'Noah and the Flood', ids: NOAH },
  { name: 'The Tower of Babel', ids: BABEL },
  { name: 'Escape from Sodom', ids: SODOM },
];

export const WORLD_MAPS: readonly WorldMap[] = [
  {
    id: 'genesis',
    title: 'Genesis 1–11 · Beginnings',
    short: 'Beginnings',
    width: 4200,
    regions: [
      { name: 'THE DEEP', x: 330, y: 170 },
      { name: 'EDEN', x: 1450, y: 180 },
      { name: 'ARARAT', x: 3360, y: 640 },
      { name: 'SHINAR', x: 2780, y: 660 },
    ],
    paths: MAP_PATHS,
  },
  {
    id: 'egypt',
    title: 'Genesis 37–50 · Joseph',
    short: 'Joseph in Egypt',
    width: 4700,
    regions: [
      // In the gap between the two bands: the top band's places and the bottom band's.
      { name: 'CANAAN', x: 330, y: 370 },
      { name: 'GOSHEN', x: 960, y: 370 },
      { name: 'THE PRISON', x: 1560, y: 370 },
      { name: 'THE NILE', x: 2400, y: 370 },
      { name: 'STOREHOUSES', x: 3300, y: 370 },
      { name: "JOSEPH'S HOUSE", x: 4180, y: 370 },
    ],
    paths: [],
    opensAfter: 'gen-027',
    signpost: { x: 4040, y: 470 },
  },
];

const GENESIS_PLACES: Record<string, [number, number, string]> = {
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
  // Sodom: east along the bottom, across the plain toward Zoar.
  'gen-052': [2580, 470, '👼'],
  'gen-053': [2940, 480, '🏃'],
  'gen-054': [3110, 580, '🔥'],
};

/** Medallion glyphs for the Joseph trail, in reading order. */
const JOSEPH_ICONS = [
  '🌾',
  '🕳️',
  '🐪',
  '🏛️',
  '🏃',
  '⛓️',
  '🌙',
  '🍇',
  '🧺',
  '🐄',
  '💭',
  '🌊',
  '✨',
  '📜',
  '💍',
  '🌾',
  '🎒',
  '🕵️',
  '🔗',
  '💧',
  '🤝',
  '🍯',
  '🕊️',
  '🍞',
  '🏆',
  '🎒',
  '🗣️',
  '❤️',
  '😭',
  '🏡',
  '🛒',
  '🎉',
  '⭐',
  '👨‍👩‍👧‍👦',
  '🤗',
  '👑',
  '🥣',
  '🌱',
  '🙏',
  '👦',
  '✋',
  '🕯️',
  '🐎',
  '🌅',
];

/**
 * Joseph winds in two bands: east along the top (Canaan, down the road to Egypt, the prison, the
 * Nile, the storehouses), then back west along the bottom (Joseph's house, Goshen).
 */
function josephPlaces(): Record<string, [number, number, string]> {
  const out: Record<string, [number, number, string]> = {};
  const perBand = JOSEPH.length / 2;
  JOSEPH.forEach((id, i) => {
    const top = i < perBand;
    const k = top ? i : JOSEPH.length - 1 - i;
    const x = 230 + k * 200;
    const y = top ? (k % 2 === 0 ? 155 : 280) : k % 2 === 0 ? 580 : 455;
    out[id] = [x, y, JOSEPH_ICONS[i]!];
  });
  return out;
}

const PLACES: Record<string, [number, number, string]> = { ...GENESIS_PLACES, ...josephPlaces() };

/** Each location follows the one before it on its trail; a path's first follows `from`. */
function trail(ids: readonly string[], from?: string): [string, string | undefined][] {
  return ids.map((id, i) => [id, i === 0 ? from : ids[i - 1]]);
}

const AFTER = new Map([
  ...trail(BEGINNINGS),
  ...trail(NOAH, 'gen-011'),
  ...trail(BABEL, 'gen-011'),
  ...trail(SODOM, 'gen-011'),
  ...trail(JOSEPH),
]);

const ON_MAP: [MapId, readonly string[]][] = [
  ['genesis', [...BEGINNINGS, ...NOAH, ...BABEL, ...SODOM]],
  ['egypt', JOSEPH],
];

/** Locations in reading order (each map in turn: Beginnings, then each path, then Joseph). */
export const MAP_NODES: readonly MapNode[] = ON_MAP.flatMap(([map, ids]) =>
  ids.map((id) => {
    const [x, y, icon] = PLACES[id]!;
    const after = AFTER.get(id);
    return after ? { id, map, x, y, icon, after } : { id, map, x, y, icon };
  }),
);

const byId = new Map(MAP_NODES.map((n) => [n.id, n]));

export function mapNode(id: string): MapNode | undefined {
  return byId.get(id);
}

export function worldMap(id: MapId): WorldMap {
  return WORLD_MAPS.find((m) => m.id === id)!;
}

/** The locations on one map, in reading order. */
export function nodesOn(map: MapId): MapNode[] {
  return MAP_NODES.filter((n) => n.map === map);
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

/** True once the player may see a map: the first always, a later one after its `opensAfter`. */
export function mapUnlocked(save: SaveData, map: MapId, unlockAll = false): boolean {
  const opens = worldMap(map).opensAfter;
  return unlockAll || !opens || opens in save.completed;
}

/** The maps the player can visit, in order. */
export function unlockedMaps(save: SaveData, unlockAll = false): MapId[] {
  return MAP_IDS.filter((m) => mapUnlocked(save, m, unlockAll));
}

/**
 * done = won; open = playable now (a map's first location once the map is unlocked, or one whose
 * trail-mate before it is won); soon = would be open, but its passage isn't written yet;
 * hidden = not yet revealed.
 */
export type NodeState = 'done' | 'open' | 'soon' | 'hidden';

/** Whether a location's passage exists (content decides; everything counts as built by default). */
export type IsBuilt = (id: string) => boolean;
const ALL_BUILT: IsBuilt = () => true;

export function nodeStates(
  save: SaveData,
  unlockAll = false,
  built: IsBuilt = ALL_BUILT,
): { id: string; state: NodeState }[] {
  return MAP_NODES.map((n) => {
    if (n.id in save.completed) return { id: n.id, state: 'done' as const };
    const reachable = n.after ? n.after in save.completed : mapUnlocked(save, n.map);
    if (!unlockAll && !reachable) return { id: n.id, state: 'hidden' as const };
    return { id: n.id, state: built(n.id) ? ('open' as const) : ('soon' as const) };
  });
}

/** Visible locations the player hasn't seen appear yet (they get the reveal animation). */
export function newlyRevealed(save: SaveData, unlockAll = false, built?: IsBuilt): string[] {
  return nodeStates(save, unlockAll, built)
    .filter((n) => n.state !== 'hidden' && !save.seenOnMap.includes(n.id))
    .map((n) => n.id);
}

/**
 * Where the hero stands on a map: at the open location furthest along its trail. When the furthest
 * open locations are the start of a choice of paths, the hero waits at the fork instead.
 */
export function focusNode(
  save: SaveData,
  unlockAll = false,
  map: MapId = 'genesis',
  built?: IsBuilt,
): MapNode {
  const states = new Map(nodeStates(save, unlockAll, built).map((s) => [s.id, s.state]));
  const here = nodesOn(map);
  const open = here.filter((n) => states.get(n.id) === 'open');
  const visible = here.filter((n) => states.get(n.id) !== 'hidden');
  const pool = open.length > 0 ? open : visible;
  if (pool.length === 0) return here[0]!;
  const best = Math.max(...pool.map(depth));
  const furthest = pool.filter((n) => depth(n) === best);
  const fork = furthest[0]?.after;
  if (furthest.length > 1 && furthest.every((n) => n.after === fork) && fork)
    return byId.get(fork)!;
  return furthest[0] ?? here[0]!;
}

/** True while the player stands at a fork on this map with no path started yet. */
export function choosingPath(save: SaveData, unlockAll = false, map: MapId = 'genesis'): boolean {
  const fork = focusNode(save, unlockAll, map);
  const kids = childrenOf(fork.id);
  return (
    fork.id in save.completed && kids.length > 1 && kids.every((k) => !(k.id in save.completed))
  );
}

/**
 * The map to show when the player opens the passage map: the latest map the player has really
 * opened (by winning, not by `unlockAll`) that has a playable location, so a map whose passages
 * are all still coming soon doesn't take over, and debug unlocking doesn't move the start.
 */
export function startMap(save: SaveData, unlockAll = false, built?: IsBuilt): MapId {
  const states = new Map(nodeStates(save, unlockAll, built).map((s) => [s.id, s.state]));
  const playable = unlockedMaps(save).filter((m) =>
    nodesOn(m).some((n) => states.get(n.id) === 'open' || states.get(n.id) === 'done'),
  );
  return playable[playable.length - 1] ?? 'genesis';
}

/** A map whose signpost stands on `map` and is unlocked (the next map to travel to), if any. */
export function signpostsOn(save: SaveData, map: MapId, unlockAll = false): WorldMap[] {
  return WORLD_MAPS.filter(
    (m) =>
      m.opensAfter &&
      m.signpost &&
      mapNode(m.opensAfter)?.map === map &&
      mapUnlocked(save, m.id, unlockAll),
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
