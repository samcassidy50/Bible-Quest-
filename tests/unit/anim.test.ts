import { describe, expect, it } from 'vitest';
import {
  eventsBetween,
  frameAt,
  frameClip,
  frameIndexAt,
  frameStart,
  localTime,
  validateClip,
  type Clip,
} from '../../src/core/anim/clip';
import { HERO_CLIPS, HERO_CLIP_NAMES } from '../../src/core/anim/heroClips';
import { HERO_FRAMES, HERO_SHEET } from '../../src/core/anim/heroSheet';

const clip = (over: Partial<Clip> = {}): Clip => ({
  ...frameClip('test', [
    { frame: 'a', ms: 30 },
    { frame: 'b', ms: 70 },
  ]),
  ...over,
});

describe('frame clips', () => {
  it('derives the duration from the frames', () => {
    expect(clip().duration).toBe(100);
    expect(clip().loop).toBe(false);
    expect(frameClip('l', [{ frame: 'a', ms: 10 }], { loop: true }).loop).toBe(true);
  });

  it('shows each frame for its time', () => {
    const c = clip();
    expect(frameAt(c, 0)).toBe('a');
    expect(frameAt(c, 29)).toBe('a');
    expect(frameAt(c, 30)).toBe('b');
    expect(frameAt(c, 99)).toBe('b');
    expect(frameIndexAt(c, 1000)).toBe(1);
    expect(frameStart(c, 0)).toBe(0);
    expect(frameStart(c, 1)).toBe(30);
  });

  it('clamps one-shots and wraps loops', () => {
    expect(localTime(clip(), 150)).toBe(100);
    expect(localTime(clip(), -5)).toBe(0);
    expect(localTime(clip({ loop: true }), 250)).toBe(50);
    expect(frameAt(clip({ loop: true }), 120)).toBe('a');
    expect(frameAt(clip(), 500)).toBe('b');
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
    expect(validateClip(clip(), ['a', 'b'])).toEqual([]);
  });

  it('reports authoring mistakes', () => {
    expect(validateClip(clip({ frames: [], duration: 0 })).join()).toMatch(/at least 1 frame/);
    expect(validateClip(clip({ frames: [{ frame: 'a', ms: 0 }], duration: 0 })).join()).toMatch(
      /positive duration/,
    );
    expect(validateClip(clip(), ['a']).join()).toMatch(/unknown frame "b"/);
    expect(validateClip(clip({ duration: 90 })).join()).toMatch(/frame total/);
    expect(validateClip(clip({ events: [{ at: 150, name: 'late' }] })).join()).toMatch(
      /outside the clip/,
    );
    expect(validateClip(clip({ loop: true, hold: true })).join()).toMatch(/cannot hold/);
  });
});

describe('hero clips', () => {
  const frames = Object.keys(HERO_FRAMES);

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

  it.each(HERO_CLIP_NAMES)('%s is well-formed and uses frames from the sheet', (name) => {
    expect(validateClip(HERO_CLIPS[name], frames)).toEqual([]);
  });

  it.each(['punch', 'slash', 'slashPowered'] as const)(
    '%s lands its hit with an impact event',
    (name) => {
      const c: Clip = HERO_CLIPS[name];
      expect(eventsBetween(c, 0, c.duration)).toEqual(['swing', 'impact']);
    },
  );

  it('only idle and run loop; die and victory hold their last frame', () => {
    expect(HERO_CLIP_NAMES.filter((n) => (HERO_CLIPS[n] as Clip).loop)).toEqual(['idle', 'run']);
    expect(HERO_CLIP_NAMES.filter((n) => (HERO_CLIPS[n] as Clip).hold)).toEqual(['die', 'victory']);
  });

  it('sheet frames are numbered 0..n-1 with the feet inside the cell', () => {
    expect(Object.values(HERO_FRAMES).sort((a, b) => a - b)).toEqual(frames.map((_, i) => i));
    expect(HERO_SHEET.originX).toBeLessThan(HERO_SHEET.frameWidth);
    expect(HERO_SHEET.originY).toBeLessThan(HERO_SHEET.frameHeight);
  });
});
