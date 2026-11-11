import { describe, expect, it } from 'vitest';
import {
  BASE_WPM,
  estimateNarrationMs,
  tickerX,
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

  it('ticker starts off the right edge and ends off the left edge', () => {
    expect(tickerX(0, 10_000, 1280, 3000)).toBe(1280);
    expect(tickerX(10_000, 10_000, 1280, 3000)).toBe(-3000);
    expect(tickerX(5_000, 10_000, 1280, 3000)).toBe(1280 - 0.5 * 4280);
    expect(tickerX(99_999, 10_000, 1280, 3000)).toBe(-3000);
    expect(tickerX(-5, 10_000, 1280, 3000)).toBe(1280);
    expect(tickerX(1, 0, 1280, 3000)).toBe(-3000);
  });

  it('word anchor fraction matches the ticker position', () => {
    const W = 1280;
    const textW = 3000;
    const offset = 900;
    const anchor = W * 0.7;
    const f = wordAnchorFraction(offset, anchor, W, textW);
    expect(tickerX(f * 10_000, 10_000, W, textW) + offset).toBeCloseTo(anchor, 5);
    expect(wordAnchorFraction(-1e6, anchor, W, textW)).toBe(0);
    expect(wordAnchorFraction(1e6, anchor, W, textW)).toBe(1);
  });
});

describe('scheduleOrbs', () => {
  const D = 20_000;

  it('returns nothing for no orbs', () => {
    expect(scheduleOrbs([], D)).toEqual([]);
  });

  it('spreads unanchored orbs evenly inside the window, one at a time', () => {
    const s = scheduleOrbs(
      [
        { special: 'sword' },
        { special: 'shield' },
        { special: 'breastplate' },
        { special: 'sandals' },
      ],
      D,
    );
    expect(s.map((o) => o.special)).toEqual(['sword', 'shield', 'breastplate', 'sandals']);
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
    const s = scheduleOrbs([{ special: 'sword', anchorFraction: 0.5 }], D);
    expect(s).toEqual([{ special: 'sword', atMs: 10_000 }]);
    expect(scheduleOrbs([{ special: 'sword', anchorFraction: 0 }], D)[0]!.atMs).toBe(
      D * ORB_WINDOW.start,
    );
    expect(scheduleOrbs([{ special: 'sword', anchorFraction: 1 }], D)[0]!.atMs).toBe(
      D * ORB_WINDOW.end,
    );
  });

  it('pushes clashing anchored orbs apart and keeps them inside the window', () => {
    const s = scheduleOrbs(
      [
        { special: 'sword', anchorFraction: 0.85 },
        { special: 'shield', anchorFraction: 0.86 },
      ],
      D,
    );
    expect(s[1]!.atMs - s[0]!.atMs).toBeGreaterThanOrEqual(ORB_LIFETIME_MS);
    expect(s[1]!.atMs).toBeLessThanOrEqual(D * ORB_WINDOW.end);
  });

  it('squeezes the gap when the reading is too short for full lifetimes', () => {
    const short = 6_000;
    const s = scheduleOrbs(
      [{ special: 'sword' }, { special: 'shield' }, { special: 'sandals' }],
      short,
    );
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
      { special: 'sword', status: 'collected' },
      { special: 'shield', status: 'missed' },
      { special: 'sandals', status: 'missed' },
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
