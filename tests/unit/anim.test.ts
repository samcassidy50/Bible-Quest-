import { describe, expect, it } from 'vitest';
import {
  eventsBetween,
  localTime,
  samplePose,
  validateClip,
  type Clip,
} from '../../src/core/anim/clip';
import { HERO_CLIPS, HERO_CLIP_NAMES } from '../../src/core/anim/heroClips';
import { EASES, fullPose, lerpPose, POSE_KEYS, REST_POSE } from '../../src/core/anim/pose';

const clip = (over: Partial<Clip> = {}): Clip => ({
  name: 'test',
  duration: 100,
  loop: false,
  keys: [
    { at: 0, pose: { armF: 0 } },
    { at: 100, pose: { armF: 90 }, ease: 'linear' },
  ],
  ...over,
});

describe('poses', () => {
  it('fills missing joints from the rest pose', () => {
    expect(fullPose({ armF: 45 })).toEqual({ ...REST_POSE, armF: 45 });
    expect(REST_POSE.squash).toBe(1);
    expect(POSE_KEYS).toHaveLength(Object.keys(REST_POSE).length);
  });

  it('interpolates every joint', () => {
    const p = lerpPose(fullPose({ x: 0, armF: 0 }), fullPose({ x: 10, armF: 90 }), 0.5);
    expect(p.x).toBe(5);
    expect(p.armF).toBe(45);
    expect(p.squash).toBe(1);
  });

  it('eases start at 0 and end at 1; back overshoots', () => {
    for (const ease of Object.values(EASES)) {
      expect(ease(0)).toBeCloseTo(0, 6);
      expect(ease(1)).toBeCloseTo(1, 6);
    }
    expect(EASES.in(0.5)).toBeLessThan(0.5);
    expect(EASES.out(0.5)).toBeGreaterThan(0.5);
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(EASES.back))).toBeGreaterThan(1);
  });
});

describe('clip sampling', () => {
  it('hits keyframes exactly and interpolates between them', () => {
    const c = clip();
    expect(samplePose(c, 0).armF).toBe(0);
    expect(samplePose(c, 50).armF).toBe(45);
    expect(samplePose(c, 100).armF).toBe(90);
  });

  it('defaults to inOut easing', () => {
    const c = clip({
      keys: [
        { at: 0, pose: {} },
        { at: 100, pose: { armF: 100 } },
      ],
    });
    expect(samplePose(c, 25).armF).toBeCloseTo(EASES.inOut(0.25) * 100);
  });

  it('clamps one-shots and wraps loops', () => {
    expect(localTime(clip(), 150)).toBe(100);
    expect(localTime(clip(), -5)).toBe(0);
    expect(localTime(clip({ loop: true }), 250)).toBe(50);
    expect(samplePose(clip(), 500).armF).toBe(90);
  });

  it('handles keyframes at the same time', () => {
    const c = clip({
      keys: [
        { at: 0, pose: { armF: 0 } },
        { at: 0, pose: { armF: 30 } },
        { at: 100, pose: { armF: 30 } },
      ],
    });
    expect(samplePose(c, 0).armF).toBe(30);
  });
});

describe('clip events', () => {
  const hit = clip({ events: [{ at: 40, name: 'impact' }] });

  it('fires once when crossed, and not when not reached', () => {
    expect(eventsBetween(hit, 0, 39)).toEqual([]);
    expect(eventsBetween(hit, 0, 40)).toEqual(['impact']);
    expect(eventsBetween(hit, 40, 100)).toEqual([]);
    expect(eventsBetween(hit, 50, 40)).toEqual([]);
    expect(eventsBetween(clip(), 0, 100)).toEqual([]);
  });

  it('fires once per cycle in loops, including several cycles in one step', () => {
    const loop = clip({ loop: true, events: [{ at: 40, name: 'step' }] });
    expect(eventsBetween(loop, 90, 150)).toEqual(['step']);
    expect(eventsBetween(loop, 0, 350)).toEqual(['step', 'step', 'step', 'step']);
  });
});

describe('clip validation', () => {
  it('accepts a good clip', () => {
    expect(validateClip(clip())).toEqual([]);
  });

  it('reports authoring mistakes', () => {
    expect(validateClip(clip({ keys: [{ at: 0, pose: {} }] })).join()).toMatch(/at least 2/);
    expect(
      validateClip(
        clip({
          keys: [
            { at: 5, pose: {} },
            { at: 100, pose: {} },
          ],
        }),
      ).join(),
    ).toMatch(/first keyframe/);
    expect(
      validateClip(
        clip({
          keys: [
            { at: 0, pose: {} },
            { at: 90, pose: {} },
          ],
        }),
      ).join(),
    ).toMatch(/last keyframe/);
    expect(
      validateClip(
        clip({
          keys: [
            { at: 0, pose: {} },
            { at: 60, pose: {} },
            { at: 30, pose: {} },
            { at: 100, pose: {} },
          ],
        }),
      ).join(),
    ).toMatch(/increasing order/);
    expect(validateClip(clip({ events: [{ at: 150, name: 'late' }] })).join()).toMatch(
      /outside the clip/,
    );
    expect(validateClip(clip({ loop: true })).join()).toMatch(/must end on its first pose/);
  });
});

describe('hero clips', () => {
  it('has every animation the game uses', () => {
    expect(HERO_CLIP_NAMES).toEqual(
      expect.arrayContaining([
        'idle',
        'run',
        'punch',
        'slash',
        'slashPowered',
        'hurt',
        'die',
        'victory',
        'block',
        'cast',
      ]),
    );
  });

  it.each(HERO_CLIP_NAMES)('%s is well-formed', (name) => {
    expect(validateClip(HERO_CLIPS[name])).toEqual([]);
  });

  it.each(['punch', 'slash', 'slashPowered'] as const)(
    '%s lands its hit with an impact event',
    (name) => {
      const c: Clip = HERO_CLIPS[name];
      expect(eventsBetween(c, 0, c.duration)).toEqual(['impact']);
    },
  );

  it('only idle and run loop; die and victory hold their last frame', () => {
    expect(HERO_CLIP_NAMES.filter((n) => (HERO_CLIPS[n] as Clip).loop)).toEqual(['idle', 'run']);
    expect(HERO_CLIP_NAMES.filter((n) => (HERO_CLIPS[n] as Clip).hold)).toEqual(['die', 'victory']);
  });
});
