import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../../src/content';
import {
  bezier,
  dashedCurve,
  focusNode,
  MAP_NODES,
  newlyRevealed,
  nodeStates,
  trailControl,
  WORLD_H,
  WORLD_W,
} from '../../src/core/map/worldMap';
import { markSeenOnMap, newSave, recordVictory } from '../../src/core/progress/progress';

const won = (...ids: string[]) => ids.reduce((s, id) => recordVictory(s, id, 1, 1).save, newSave());

describe('map layout', () => {
  it('has one location per encounter, in reading order, inside the map', () => {
    expect(MAP_NODES.map((n) => n.id)).toEqual(ENCOUNTERS.map((e) => e.id));
    for (const n of MAP_NODES) {
      expect(n.x).toBeGreaterThan(100);
      expect(n.x).toBeLessThan(WORLD_W - 100);
      expect(n.y).toBeGreaterThan(100);
      expect(n.y).toBeLessThan(WORLD_H - 100);
    }
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
  });

  it('focuses the furthest visible location', () => {
    expect(focusNode(newSave()).id).toBe('gen-001');
    expect(focusNode(won('gen-001', 'gen-002')).id).toBe('gen-003');
    expect(focusNode(newSave(), true).id).toBe('gen-011');
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
    const c1 = trailControl(1);
    const c2 = trailControl(2);
    const side = (i: number, p: { x: number; y: number }) => {
      const s = MAP_NODES[i - 1]!;
      const e = MAP_NODES[i]!;
      return Math.sign((e.x - s.x) * (p.y - s.y) - (e.y - s.y) * (p.x - s.x));
    };
    expect(side(1, c1)).not.toBe(side(2, c2));
  });
});
