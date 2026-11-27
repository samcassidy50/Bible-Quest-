import { describe, expect, it } from 'vitest';
import { BIBLE, ENCOUNTERS, getEncounter, nextEncounter } from '../../src/content';
import { parseVpl } from '../../src/core/content/bible';
import { encounterText, textUpToSection } from '../../src/core/content/types';

/**
 * `npm run validate:content` (docs/DESIGN.md §3.2). Loading src/content already validates every
 * file and throws on any mistake; these tests make the guarantees explicit.
 */
const BEGINNINGS = Array.from({ length: 11 }, (_, i) => `gen-${String(i + 1).padStart(3, '0')}`);
const NOAH = Array.from({ length: 9 }, (_, i) => `gen-0${19 + i}`);
const SODOM = ['gen-052', 'gen-053', 'gen-054'];
/** Joseph in Egypt: the 44 chosen passages (docs/joseph-map-plan.md). */
const JOSEPH = [
  'gen-118',
  'gen-119',
  'gen-120',
  ...[
    '124',
    '125',
    '126',
    '127',
    '128',
    '129',
    '130',
    '131',
    '132',
    '133',
    '134',
    '135',
    '136',
    '137',
    '138',
    '139',
    '140',
    '141',
    '142',
    '143',
    '144',
    '145',
    '146',
    '147',
    '148',
    '149',
    '150',
    '151',
    '152',
    '153',
    '154',
    '155',
    '156',
    '157',
    '158',
    '159',
    '160',
    '161',
    '166',
    '167',
    '168',
  ].map((n) => `gen-${n}`),
];

describe('content: Genesis', () => {
  it('has Beginnings, the Noah, Babel and Sodom paths, then Joseph, in reading order', () => {
    expect(ENCOUNTERS.map((e) => e.id)).toEqual([
      ...BEGINNINGS,
      ...NOAH,
      'gen-031',
      ...SODOM,
      ...JOSEPH,
    ]);
  });

  it('reads Genesis 1:1–3:19, 6:9–9:17, 11:1-9, 19:1-29, 37, 39–48 and 50:1-21 with no gaps or overlaps', () => {
    expect(ENCOUNTERS.map((e) => e.passage)).toEqual([
      'GEN 1:1-5',
      'GEN 1:6-13',
      'GEN 1:14-19',
      'GEN 1:20-25',
      'GEN 1:26-31',
      'GEN 2:1-7',
      'GEN 2:8-17',
      'GEN 2:18-25',
      'GEN 3:1-7',
      'GEN 3:8-13',
      'GEN 3:14-19',
      'GEN 6:9-16',
      'GEN 6:17-22',
      'GEN 7:1-10',
      'GEN 7:11-16',
      'GEN 7:17-24',
      'GEN 8:1-12',
      'GEN 8:13-22',
      'GEN 9:1-7',
      'GEN 9:8-17',
      'GEN 11:1-9',
      'GEN 19:1-11',
      'GEN 19:12-22',
      'GEN 19:23-29',
      'GEN 37:1-11',
      'GEN 37:12-24',
      'GEN 37:25-36',
      'GEN 39:1-6',
      'GEN 39:7-12',
      'GEN 39:13-23',
      'GEN 40:1-8',
      'GEN 40:9-15',
      'GEN 40:16-23',
      'GEN 41:1-8',
      'GEN 41:9-16',
      'GEN 41:17-24',
      'GEN 41:25-32',
      'GEN 41:33-40',
      'GEN 41:41-46',
      'GEN 41:47-57',
      'GEN 42:1-8',
      'GEN 42:9-17',
      'GEN 42:18-28',
      'GEN 42:29-38',
      'GEN 43:1-10',
      'GEN 43:11-18',
      'GEN 43:19-25',
      'GEN 43:26-34',
      'GEN 44:1-10',
      'GEN 44:11-17',
      'GEN 44:18-26',
      'GEN 44:27-34',
      'GEN 45:1-8',
      'GEN 45:9-15',
      'GEN 45:16-24',
      'GEN 45:25-28',
      'GEN 46:1-7',
      'GEN 46:8-27',
      'GEN 46:28-34',
      'GEN 47:1-12',
      'GEN 47:13-19',
      'GEN 47:20-26',
      'GEN 47:27-31',
      'GEN 48:1-12',
      'GEN 48:13-22',
      'GEN 50:1-6',
      'GEN 50:7-14',
      'GEN 50:15-21',
    ]);
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

  it('splits every passage into 1–4 readings, each with its own fight, orbs and questions', () => {
    for (const e of ENCOUNTERS) {
      expect(e.sections.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.sections.length, e.id).toBeLessThanOrEqual(4);
      expect(e.waves).toHaveLength(e.sections.length);
      expect(e.sections.flatMap((s) => s.verses)).toEqual(e.verses);
      e.sections.forEach((s, i) => {
        expect(s.orbs.length, `${e.id} section ${i + 1} orbs`).toBeGreaterThanOrEqual(1);
        expect(e.questions.filter((q) => q.section === i + 1).length).toBeGreaterThanOrEqual(2);
      });
    }
    // The last fight of each passage is its boss: the biggest foe.
    for (const e of ENCOUNTERS)
      if (e.waves.length > 1)
        expect(e.waves.at(-1)!.maxHp, e.id).toBeGreaterThan(
          Math.max(...e.waves.slice(0, -1).map((w) => w.maxHp)),
        );
  });

  it.each(ENCOUNTERS.map((e) => [e.id, e] as [string, typeof e]))(
    '%s: each question is about verses read by its section',
    (_id, e) => {
      for (const q of e.questions)
        expect(textUpToSection(e, q.section), q.id).toContain(q.highlight);
    },
  );

  it('awards all the armor in Beginnings, so either path starts fully armed', () => {
    expect(ENCOUNTERS.filter((e) => e.unlocks).map((e) => [e.id, e.unlocks])).toEqual([
      ['gen-001', 'sword'],
      ['gen-005', 'shield'],
      ['gen-007', 'breastplate'],
      ['gen-009', 'sandals'],
      ['gen-011', 'ultimate'],
    ]);
  });

  it('sets each passage in a fitting environment', () => {
    expect(ENCOUNTERS.map((e) => e.setting)).toEqual([
      'deep',
      'shore',
      'light',
      'wilds',
      'shore',
      'light',
      'garden',
      'garden',
      'grove',
      'grove',
      'wilderness',
      'shipyard',
      'shipyard',
      'shipyard',
      'flood',
      'flood',
      'flood',
      'flood',
      'fields',
      'flood',
      'babel',
      'sodom',
      'plain',
      'brimstone',
      'canaan',
      'dothan',
      'caravan',
      'estate',
      'estate',
      'prison',
      'prison',
      'prison',
      'prison',
      'nile',
      'palace',
      'nile',
      'palace',
      'palace',
      'palace',
      'granary',
      'granary',
      'palace',
      'palace',
      'canaan',
      'canaan',
      'caravan',
      'estate',
      'estate',
      'caravan',
      'caravan',
      'estate',
      'estate',
      'estate',
      'estate',
      'palace',
      'canaan',
      'wilderness',
      'caravan',
      'goshen',
      'palace',
      'granary',
      'granary',
      'goshen',
      'goshen',
      'goshen',
      'goshen',
      'plain',
      'goshen',
    ]);
    // The flood rages, then clears for the dove, the landing and the rainbow.
    expect(ENCOUNTERS.filter((e) => e.setting === 'flood').map((e) => e.weather)).toEqual([
      'storm',
      'storm',
      'clearing',
      'clearing',
      'clearing',
    ]);
  });

  it('has sprite art for every foe', () => {
    for (const e of ENCOUNTERS)
      for (const foe of e.waves) expect(foe.sprite, `${e.id} ${foe.id}`).toBeTruthy();
    expect(getEncounter('gen-009').waves.map((w) => w.sprite)).toEqual([
      'hissling',
      'hissling',
      'serpent',
    ]);
    expect(getEncounter('gen-027').waves.at(-1)?.sprite).toBe('tempest');
  });

  it('nextEncounter follows the map trail, stopping at the fork and at the end of a path', () => {
    expect(getEncounter('gen-009').title).toBe('The Tricky Serpent');
    expect(getEncounter('nope').id).toBe('gen-001');
    expect(nextEncounter('gen-001')?.id).toBe('gen-002');
    expect(nextEncounter('gen-011')).toBeNull(); // the player chooses Noah, Babel or Sodom
    expect(nextEncounter('gen-019')?.id).toBe('gen-020');
    expect(nextEncounter('gen-027')).toBeNull();
    expect(nextEncounter('gen-031')).toBeNull();
    expect(nextEncounter('gen-052')?.id).toBe('gen-053');
    expect(nextEncounter('gen-054')).toBeNull();
    expect(nextEncounter('gen-120')?.id).toBe('gen-124'); // Genesis 38 is left out
    expect(nextEncounter('gen-126')?.id).toBe('gen-127');
    expect(nextEncounter('gen-132')?.id).toBe('gen-133');
    expect(nextEncounter('gen-138')?.id).toBe('gen-139');
    expect(nextEncounter('gen-144')?.id).toBe('gen-145');
    expect(nextEncounter('gen-150')?.id).toBe('gen-151');
    expect(nextEncounter('gen-156')?.id).toBe('gen-157');
    expect(nextEncounter('gen-161')?.id).toBe('gen-166'); // Genesis 49 is left out
    expect(nextEncounter('gen-168')).toBeNull(); // the end of the Joseph trail
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
