import { describe, expect, it } from 'vitest';
import {
  BASE_WPM,
  estimateNarrationMs,
  readingOffset,
  readingTimeline,
  tickerX,
  timeAtOffset,
  wordAnchorFraction,
  wordCount,
} from '../../src/core/scripture/timing';
import {
  ORB_LIFETIME_MS,
  ORB_WINDOW,
  OrbTracker,
  scheduleOrbs,
} from '../../src/core/scripture/orbs';

describe('narration timing', () => {
  it('counts words', () => {
    expect(wordCount('  In the  beginning, God ')).toBe(4);
    expect(wordCount('')).toBe(0);
  });

  it('estimates duration from words, rate and sentence pauses', () => {
    const text = Array.from({ length: BASE_WPM }, () => 'word').join(' ');
    expect(estimateNarrationMs(text)).toBe(60_000);
    expect(estimateNarrationMs(text, 0.5)).toBe(120_000);
    expect(estimateNarrationMs('One two. Three four.')).toBe(1600 + 700);
    expect(estimateNarrationMs('   ')).toBe(0);
    expect(() => estimateNarrationMs('x', 0)).toThrow(RangeError);
  });

  it('builds a verse-by-verse reading timeline ending at the duration', () => {
    const knots = readingTimeline(['One two.', 'Three four five six.'], [100, 400], 9000);
    expect(knots[0]).toEqual({ t: 0, x: 0 });
    expect(knots).toHaveLength(3);
    expect(knots[2]).toEqual({ t: 9000, x: 400 });
    // The first verse is shorter, so it ends before the halfway point.
    expect(knots[1]!.t).toBeGreaterThan(0);
    expect(knots[1]!.t).toBeLessThan(4500);
    expect(knots[1]!.x).toBe(100);
    expect(readingTimeline(['', ''], [0, 0], 1000).map((k) => k.t)).toEqual([0, 1000, 1000]);
  });

  it('uses real clip lengths for the verse knots when narration is recorded', () => {
    // Text lengths would put the first knot early; the clips say the first verse is the long one.
    const knots = readingTimeline(
      ['One two.', 'Three four five six.'],
      [100, 400],
      9000,
      1,
      [6000, 3000],
    );
    expect(knots.map((k) => k.t)).toEqual([0, 6000, 9000]);
  });

  it('interpolates the reading offset within each verse and inverts it', () => {
    const knots = [
      { t: 0, x: 0 },
      { t: 1000, x: 200 },
      { t: 3000, x: 1200 },
    ];
    expect(readingOffset(-5, knots)).toBe(0);
    expect(readingOffset(500, knots)).toBe(100);
    expect(readingOffset(2000, knots)).toBe(700);
    expect(readingOffset(9999, knots)).toBe(1200);
    expect(timeAtOffset(700, knots)).toBe(2000);
    expect(timeAtOffset(-1, knots)).toBe(0);
    expect(timeAtOffset(5000, knots)).toBe(3000);
    expect(readingOffset(5, [])).toBe(0);
    expect(
      readingOffset(5, [
        { t: 5, x: 3 },
        { t: 5, x: 9 },
      ]),
    ).toBe(3);
  });

  it('keeps the spoken word at the reading point', () => {
    const knots = [
      { t: 0, x: 0 },
      { t: 10_000, x: 3000 },
    ];
    expect(tickerX(0, knots, 640)).toBe(640); // first word starts in the middle
    expect(tickerX(5000, knots, 640) + 1500).toBe(640);
    expect(tickerX(10_000, knots, 640) + 3000).toBe(640); // last word ends in the middle
  });

  it('word anchor fraction matches the ticker position', () => {
    const knots = [
      { t: 0, x: 0 },
      { t: 4000, x: 1000 },
      { t: 10_000, x: 3000 },
    ];
    const offset = 1800;
    const anchor = 1280 * 0.72;
    const f = wordAnchorFraction(offset, anchor, 640, knots, 10_000);
    expect(tickerX(f * 10_000, knots, 640) + offset).toBeCloseTo(anchor, 5);
    expect(wordAnchorFraction(-1e6, anchor, 640, knots, 10_000)).toBe(0);
    expect(wordAnchorFraction(1e6, anchor, 640, knots, 10_000)).toBe(1);
    expect(wordAnchorFraction(10, anchor, 640, knots, 0)).toBe(1);
  });
});

describe('scheduleOrbs', () => {
  const D = 20_000;

  it('returns nothing for no orbs', () => {
    expect(scheduleOrbs([], D)).toEqual([]);
  });

  it('spreads unanchored orbs evenly inside the window, one at a time', () => {
    const s = scheduleOrbs(
      [{ id: 'sword' }, { id: 'shield' }, { id: 'breastplate' }, { id: 'sandals' }],
      D,
    );
    expect(s.map((o) => o.id)).toEqual(['sword', 'shield', 'breastplate', 'sandals']);
    expect(s[0]!.atMs).toBe(D * ORB_WINDOW.start);
    // 20 s can't fit four full 4 s lifetimes, so gaps shrink to the even spacing.
    const step = (D * (ORB_WINDOW.end - ORB_WINDOW.start)) / 4;
    for (let i = 1; i < s.length; i++) {
      expect(s[i]!.atMs - s[i - 1]!.atMs).toBeGreaterThanOrEqual(
        Math.min(ORB_LIFETIME_MS, step) - 1,
      );
    }
    expect(s[3]!.atMs).toBeLessThanOrEqual(D * ORB_WINDOW.end);
  });

  it('keeps anchored orbs at their word, clamped to the window', () => {
    const s = scheduleOrbs([{ id: 'sword', anchorFraction: 0.5 }], D);
    expect(s).toEqual([{ id: 'sword', atMs: 10_000 }]);
    expect(scheduleOrbs([{ id: 'sword', anchorFraction: 0 }], D)[0]!.atMs).toBe(
      D * ORB_WINDOW.start,
    );
    expect(scheduleOrbs([{ id: 'sword', anchorFraction: 1 }], D)[0]!.atMs).toBe(D * ORB_WINDOW.end);
  });

  it('pushes clashing anchored orbs apart and keeps them inside the window', () => {
    const s = scheduleOrbs(
      [
        { id: 'sword', anchorFraction: 0.85 },
        { id: 'shield', anchorFraction: 0.86 },
      ],
      D,
    );
    expect(s[1]!.atMs - s[0]!.atMs).toBeGreaterThanOrEqual(ORB_LIFETIME_MS);
    expect(s[1]!.atMs).toBeLessThanOrEqual(D * ORB_WINDOW.end);
  });

  it('squeezes the gap when the reading is too short for full lifetimes', () => {
    const short = 6_000;
    const s = scheduleOrbs([{ id: 'sword' }, { id: 'shield' }, { id: 'sandals' }], short);
    expect(s[2]!.atMs).toBeLessThanOrEqual(short * ORB_WINDOW.end);
    expect(s[1]!.atMs).toBeGreaterThan(s[0]!.atMs);
  });
});

describe('OrbTracker', () => {
  it('moves orbs pending → active → collected', () => {
    const t = new OrbTracker(['sword', 'shield']);
    expect(t.pending).toEqual(['sword', 'shield']);
    expect(t.collect('sword')).toBe(false); // not active yet
    expect(t.spawn('sword')).toBe(true);
    expect(t.spawn('sword')).toBe(false);
    expect(t.collect('sword')).toBe(true);
    expect(t.collected).toEqual(['sword']);
    expect(t.get('sword')).toBe('collected');
    expect(t.get('breastplate')).toBeUndefined();
  });

  it('an active orb that is not tapped expires as missed', () => {
    const t = new OrbTracker(['sword']);
    t.spawn('sword');
    expect(t.expire('sword')).toBe(true);
    expect(t.get('sword')).toBe('missed');
    expect(t.collect('sword')).toBe(false);
  });

  it('skip forfeits everything not collected', () => {
    const t = new OrbTracker(['sword', 'shield', 'sandals']);
    t.spawn('sword');
    t.collect('sword');
    t.spawn('shield');
    t.forfeitRemaining();
    expect(t.all).toEqual([
      { id: 'sword', status: 'collected' },
      { id: 'shield', status: 'missed' },
      { id: 'sandals', status: 'missed' },
    ]);
  });

  it('replay brings back uncollected orbs only', () => {
    const t = new OrbTracker(['sword', 'shield']);
    t.spawn('sword');
    t.collect('sword');
    t.spawn('shield');
    t.expire('shield');
    t.resetUncollected();
    expect(t.pending).toEqual(['shield']);
    expect(t.collected).toEqual(['sword']);
  });

  it('rejects duplicate orbs', () => {
    expect(() => new OrbTracker(['sword', 'sword'])).toThrow(/Duplicate/);
  });
});
