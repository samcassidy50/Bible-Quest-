import { describe, expect, it } from 'vitest';
import { BIBLE, ENCOUNTERS, getEncounter, nextEncounter } from '../../src/content';
import { parseVpl } from '../../src/core/content/bible';
import { encounterText } from '../../src/core/content/types';

/**
 * `npm run validate:content` (docs/DESIGN.md §3.2). Loading src/content already validates every
 * file and throws on any mistake; these tests make the guarantees explicit.
 */
describe('content: Genesis 1–11', () => {
  it('has the 11 Beginnings encounters in reading order', () => {
    expect(ENCOUNTERS.map((e) => e.id)).toEqual(
      Array.from({ length: 11 }, (_, i) => `gen-${String(i + 1).padStart(3, '0')}`),
    );
  });

  it.each(ENCOUNTERS.map((e) => [e.id, e] as [string, typeof e]))(
    '%s: verses come word for word from the retelling source',
    (_id, e) => {
      const gen = BIBLE.get('GEN')!;
      expect(e.verses.length).toBeGreaterThan(0);
      for (const v of e.verses) expect(v.text).toBe(gen.get(v.ref));
    },
  );

  it.each(ENCOUNTERS.map((e) => [e.id, e] as [string, typeof e]))(
    '%s: every highlight and orb word is in the verses',
    (_id, e) => {
      const text = encounterText(e);
      for (const q of e.questions) expect(text, q.id).toContain(q.highlight);
      for (const o of e.orbs) if (o.word) expect(text, 'orb word').toContain(o.word);
    },
  );

  it('has energy orbs in every reading: 3 early on, then 5', () => {
    expect(ENCOUNTERS.map((e) => e.orbs.length)).toEqual([3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5]);
  });

  it('awards the armor along the map: Sword after 3, Shield 5, Breastplate 7, Sandals 9, Ultimate 10', () => {
    expect(ENCOUNTERS.filter((e) => e.unlocks).map((e) => [e.id, e.unlocks])).toEqual([
      ['gen-003', 'sword'],
      ['gen-005', 'shield'],
      ['gen-007', 'breastplate'],
      ['gen-009', 'sandals'],
      ['gen-010', 'ultimate'],
    ]);
  });

  it('gives every passage its own environment', () => {
    expect(ENCOUNTERS.map((e) => e.setting)).toEqual([
      'deep',
      'light',
      'shore',
      'garden',
      'grove',
      'wilderness',
      'fields',
      'shipyard',
      'flood',
      'flood',
      'babel',
    ]);
    expect(getEncounter('gen-009').weather).toBe('storm');
    expect(getEncounter('gen-010').weather).toBe('clearing');
    const backdrops = ENCOUNTERS.map((e) => `${e.setting}-${e.weather ?? ''}`);
    expect(new Set(backdrops).size).toBe(ENCOUNTERS.length);
  });

  it('has sprite art for every foe', () => {
    for (const e of ENCOUNTERS)
      for (const foe of e.waves) expect(foe.sprite, `${e.id} ${foe.id}`).toBeTruthy();
    expect(getEncounter('gen-005').waves.map((w) => w.sprite)).toEqual([
      'hissling',
      'hissling',
      'serpent',
    ]);
    expect(getEncounter('gen-010').waves.at(-1)?.sprite).toBe('tempest');
  });

  it('getEncounter / nextEncounter walk the list', () => {
    expect(getEncounter('gen-005').title).toBe('The Temptation');
    expect(getEncounter('nope').id).toBe('gen-001');
    expect(nextEncounter('gen-001')?.id).toBe('gen-002');
    expect(nextEncounter('gen-011')).toBeNull();
    expect(nextEncounter('nope')).toBeNull();
  });
});

describe('retelling source', () => {
  it('holds exactly the verses the passages read, so no retold verse goes unused', () => {
    const used = new Set(ENCOUNTERS.flatMap((e) => e.verses.map((v) => v.ref)));
    expect([...BIBLE.get('GEN')!.keys()].sort()).toEqual([...used].sort());
  });

  it('parses the first verse exactly', () => {
    expect(parseVpl('GEN 1:1 In the beginning.\n').get('GEN')!.get('1:1')).toBe(
      'In the beginning.',
    );
  });
});
