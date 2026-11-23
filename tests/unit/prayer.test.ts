import { describe, expect, it } from 'vitest';
import { REVIVE_PRAYER } from '../../src/core/content/prayer';

describe('Revive prayer', () => {
  it('is a short, tappable part of the Lord’s Prayer', () => {
    expect(REVIVE_PRAYER.reference).toBe('Matthew 6:9-10');
    expect(REVIVE_PRAYER.phrases.length).toBeGreaterThanOrEqual(3);
    expect(REVIVE_PRAYER.phrases.length).toBeLessThanOrEqual(6);
    for (const phrase of REVIVE_PRAYER.phrases) {
      expect(phrase.trim()).toBe(phrase);
      // Short enough to read on one line beside the hero.
      expect(phrase.length).toBeLessThanOrEqual(32);
    }
    expect(REVIVE_PRAYER.phrases[0]).toMatch(/^Our Father in heaven/);
  });
});
