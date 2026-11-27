import { describe, expect, it } from 'vitest';
import { ENCOUNTERS, isBuilt } from '../../src/content';
import {
  bezier,
  childrenOf,
  choosingPath,
  dashedCurve,
  focusNode,
  mapNode,
  MAP_NODES,
  MAP_PATHS,
  mapUnlocked,
  newlyRevealed,
  nextOnMap,
  nodeStates,
  nodesOn,
  parentOf,
  signpostsOn,
  startMap,
  trailControl,
  unlockedMaps,
  worldMap,
  WORLD_H,
  WORLD_MAPS,
} from '../../src/core/map/worldMap';
import { markSeenOnMap, newSave, recordVictory } from '../../src/core/progress/progress';

const won = (...ids: string[]) => ids.reduce((s, id) => recordVictory(s, id, 1, 1).save, newSave());

const BEGINNINGS = Array.from({ length: 11 }, (_, i) => `gen-${String(i + 1).padStart(3, '0')}`);
const open = (s: ReturnType<typeof newSave>, unlockAll = false) =>
  nodeStates(s, unlockAll)
    .filter((n) => n.state === 'open')
    .map((n) => n.id);

describe('map layout', () => {
  it('has one location per encounter, in reading order, inside its map', () => {
    expect(MAP_NODES.filter((n) => isBuilt(n.id)).map((n) => n.id)).toEqual(
      ENCOUNTERS.map((e) => e.id),
    );
    expect(new Set(MAP_NODES.map((n) => n.id)).size).toBe(MAP_NODES.length);
    for (const n of MAP_NODES) {
      expect(n.x).toBeGreaterThan(100);
      expect(n.x).toBeLessThan(worldMap(n.map).width - 100);
      expect(n.y).toBeGreaterThan(100);
      expect(n.y).toBeLessThan(WORLD_H - 100);
    }
  });

  it('keeps locations apart so their name plates do not overlap', () => {
    for (const a of MAP_NODES)
      for (const b of MAP_NODES)
        if (a !== b && a.map === b.map)
          expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id}–${b.id}`).toBeGreaterThan(170);
  });

  it('Beginnings is one trail, then it forks into the Noah, Babel and Sodom paths', () => {
    expect(mapNode('gen-001')!.after).toBeUndefined();
    for (let i = 1; i < BEGINNINGS.length; i++)
      expect(mapNode(BEGINNINGS[i]!)!.after).toBe(BEGINNINGS[i - 1]);
    expect(childrenOf('gen-011').map((n) => n.id)).toEqual(['gen-019', 'gen-031', 'gen-052']);
    expect(MAP_PATHS.map((p) => p.ids[0])).toEqual(['gen-019', 'gen-031', 'gen-052']);
    expect(MAP_PATHS[0]!.ids).toHaveLength(9);
    for (const n of nodesOn('genesis').slice(1)) expect(parentOf(n), n.id).toBeDefined();
  });

  it('nextOnMap follows a trail and stops at a fork or the end of a path', () => {
    expect(nextOnMap('gen-001')).toBe('gen-002');
    expect(nextOnMap('gen-011')).toBeNull();
    expect(nextOnMap('gen-026')).toBe('gen-027');
    expect(nextOnMap('gen-027')).toBeNull();
    expect(nextOnMap('gen-031')).toBeNull();
    expect(nextOnMap('gen-052')).toBe('gen-053');
    expect(nextOnMap('gen-054')).toBeNull();
  });
});

const NOAH = Array.from({ length: 9 }, (_, i) => `gen-${String(19 + i).padStart(3, '0')}`);
/** Joseph in Egypt is planned but not written yet: its locations are all "coming soon". */
const none = () => false;

describe('Joseph in Egypt map', () => {
  it('is one trail of the 44 chosen Joseph passages, every step on the same map', () => {
    const ids = nodesOn('egypt').map((n) => n.id);
    expect(ids).toHaveLength(44);
    expect(ids[0]).toBe('gen-118');
    expect(ids).not.toContain('gen-121'); // Judah and Tamar, left out
    expect(ids).toContain('gen-161');
    expect(ids.at(-1)).toBe('gen-168');
    expect(mapNode('gen-118')!.after).toBeUndefined();
    expect(mapNode('gen-124')!.after).toBe('gen-120');
    expect(mapNode('gen-166')!.after).toBe('gen-161');
    for (const n of MAP_NODES) if (n.after) expect(mapNode(n.after)!.map, n.id).toBe(n.map);
    expect(nextOnMap('gen-168')).toBeNull();
  });

  it('opens at the end of the Noah path, not at the end of Beginnings', () => {
    expect(worldMap('egypt').opensAfter).toBe('gen-027');
    expect(mapUnlocked(won(...BEGINNINGS), 'egypt')).toBe(false);
    expect(mapUnlocked(won(...BEGINNINGS, 'gen-031', 'gen-052'), 'egypt')).toBe(false);
    expect(mapUnlocked(won(...BEGINNINGS, ...NOAH), 'egypt')).toBe(true);
    expect(mapUnlocked(newSave(), 'egypt', true)).toBe(true);
    expect(mapUnlocked(newSave(), 'genesis')).toBe(true);
    expect(unlockedMaps(won(...BEGINNINGS))).toEqual(['genesis']);
    expect(unlockedMaps(won(...BEGINNINGS, ...NOAH))).toEqual(['genesis', 'egypt']);
  });

  it('shows its first location as coming soon until its passage is written', () => {
    const state = (s: ReturnType<typeof newSave>, built?: (id: string) => boolean) =>
      Object.fromEntries(nodeStates(s, false, built).map((n) => [n.id, n.state]));
    expect(state(won(...BEGINNINGS))['gen-118']).toBe('hidden');
    const done = won(...BEGINNINGS, ...NOAH);
    expect(state(done, none)['gen-118']).toBe('soon');
    expect(state(done, none)['gen-119']).toBe('hidden');
    expect(state(done)['gen-118']).toBe('open');
    expect(newlyRevealed(markSeenOnMap(done, [...BEGINNINGS, ...NOAH]), false, none)).toEqual(
      expect.arrayContaining(['gen-118']),
    );
    expect(focusNode(done, false, 'egypt', none).id).toBe('gen-118');
  });

  it('the map shown first is the latest one with something to play', () => {
    const done = won(...BEGINNINGS, ...NOAH);
    expect(startMap(newSave())).toBe('genesis');
    expect(startMap(done, false, none)).toBe('genesis');
    expect(startMap(done)).toBe('egypt');
    expect(startMap(newSave(), true, none)).toBe('genesis');
    // ?unlockAll opens every map but doesn't move where the player starts.
    expect(startMap(newSave(), true)).toBe('genesis');
    expect(startMap(done, true)).toBe('egypt');
  });

  it('puts a signpost to Egypt on the Genesis map once Egypt is open', () => {
    expect(signpostsOn(won(...BEGINNINGS), 'genesis')).toEqual([]);
    const done = won(...BEGINNINGS, ...NOAH);
    expect(signpostsOn(done, 'genesis').map((m) => m.id)).toEqual(['egypt']);
    expect(signpostsOn(done, 'egypt')).toEqual([]);
    const post = worldMap('egypt').signpost!;
    expect(post.x).toBeLessThan(worldMap('genesis').width - 100);
    // Clear of the Genesis locations' medallions and name plates.
    for (const n of nodesOn('genesis'))
      expect(Math.hypot(n.x - post.x, n.y - post.y), n.id).toBeGreaterThan(120);
  });

  it('keeps every location clear of the menu buttons along the bottom of a 720px screen', () => {
    // Medallion, name plate and stars reach 76px below a location; the buttons start at 652.
    for (const n of MAP_NODES) expect(n.y + 76, n.id).toBeLessThan(652);
  });

  it('every map has a title, a short name and regions', () => {
    for (const m of WORLD_MAPS) {
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.short.length).toBeGreaterThan(0);
      expect(m.regions.length).toBeGreaterThan(0);
      expect(nodesOn(m.id).length).toBeGreaterThan(0);
    }
    expect(choosingPath(won(...BEGINNINGS), false, 'egypt')).toBe(false);
  });
});

describe('reveal rules', () => {
  it('a new player sees only the first location', () => {
    const states = nodeStates(newSave());
    expect(states.filter((s) => s.state !== 'hidden').map((s) => s.id)).toEqual(['gen-001']);
    expect(states[0]!.state).toBe('open');
  });

  it('each win reveals the next location', () => {
    const states = nodeStates(won('gen-001', 'gen-002'));
    expect(states.slice(0, 4).map((s) => s.state)).toEqual(['done', 'done', 'open', 'hidden']);
  });

  it('finishing Beginnings opens every path, and each path then opens on its own', () => {
    expect(open(won(...BEGINNINGS.slice(0, 10)))).toEqual(['gen-011']);
    const fork = won(...BEGINNINGS);
    expect(open(fork)).toEqual(['gen-019', 'gen-031', 'gen-052']);
    expect(open(won(...BEGINNINGS, 'gen-019'))).toEqual(['gen-020', 'gen-031', 'gen-052']);
    expect(open(won(...BEGINNINGS, 'gen-031'))).toEqual(['gen-019', 'gen-052']);
    expect(open(won(...BEGINNINGS, 'gen-052'))).toEqual(['gen-019', 'gen-031', 'gen-053']);
  });

  it('shows the choice of paths until one is started', () => {
    expect(choosingPath(won(...BEGINNINGS.slice(0, 10)))).toBe(false);
    expect(choosingPath(won(...BEGINNINGS))).toBe(true);
    expect(choosingPath(won(...BEGINNINGS, 'gen-031'))).toBe(false);
    expect(choosingPath(won(...BEGINNINGS, 'gen-019'))).toBe(false);
  });

  it('unlockAll opens everything', () => {
    expect(nodeStates(newSave(), true).every((s) => s.state !== 'hidden')).toBe(true);
  });

  it('newly revealed = visible but not yet seen', () => {
    let s = newSave();
    expect(newlyRevealed(s)).toEqual(['gen-001']);
    s = markSeenOnMap(s, ['gen-001']);
    expect(newlyRevealed(s)).toEqual([]);
    s = recordVictory(s, 'gen-001', 1, 1).save;
    expect(newlyRevealed(s)).toEqual(['gen-002']);
    expect(markSeenOnMap(s, ['gen-001'])).toBe(s);
    s = markSeenOnMap(won(...BEGINNINGS), BEGINNINGS);
    expect(newlyRevealed(s)).toEqual(['gen-019', 'gen-031', 'gen-052']);
  });

  it('puts the hero at the furthest open location, or at the fork while choosing', () => {
    expect(focusNode(newSave()).id).toBe('gen-001');
    expect(focusNode(won('gen-001', 'gen-002')).id).toBe('gen-003');
    expect(focusNode(won(...BEGINNINGS)).id).toBe('gen-011');
    expect(focusNode(won(...BEGINNINGS, 'gen-019', 'gen-020')).id).toBe('gen-021');
    // Babel done, Noah and Sodom both unstarted: the hero waits at the fork.
    expect(focusNode(won(...BEGINNINGS, 'gen-031')).id).toBe('gen-011');
    expect(focusNode(won(...BEGINNINGS, 'gen-052')).id).toBe('gen-053');
    expect(focusNode(newSave(), true).id).toBe('gen-027');
  });
});

describe('trails', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 200, y: 0 };
  const c = { x: 100, y: 0 };

  it('bezier passes through its end points', () => {
    expect(bezier(a, { x: 100, y: 80 }, b, 0)).toEqual(a);
    expect(bezier(a, { x: 100, y: 80 }, b, 1)).toEqual(b);
    expect(bezier(a, c, b, 0.5)).toEqual({ x: 100, y: 0 });
  });

  it('dashes cover the curve with gaps, and stop at the given progress', () => {
    const full = dashedCurve(a, c, b, 1, 14, 10);
    expect(full.length).toBe(Math.ceil(200 / 24));
    expect(full[0]![0]).toBeCloseTo(0);
    expect(full[0]![2]).toBeCloseTo(14);
    expect(full[1]![0]).toBeCloseTo(24);
    const half = dashedCurve(a, c, b, 0.5, 14, 10);
    expect(Math.max(...half.map((d) => d[2]))).toBeLessThanOrEqual(100.001);
    expect(dashedCurve(a, c, b, 0)).toEqual([]);
    expect(dashedCurve(a, c, b, 2).length).toBe(full.length);
  });

  it('trails bend alternately between consecutive locations', () => {
    const side = (id: string) => {
      const e = mapNode(id)!;
      const s = parentOf(e)!;
      const p = trailControl(e);
      return Math.sign((e.x - s.x) * (p.y - s.y) - (e.y - s.y) * (p.x - s.x));
    };
    expect(side('gen-002')).not.toBe(side('gen-003'));
    expect(side('gen-020')).not.toBe(side('gen-021'));
  });
});
