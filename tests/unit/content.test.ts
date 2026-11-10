import { describe, expect, it } from 'vitest';
import { ENCOUNTERS, getEncounter } from '../../src/content';
import { encounterText } from '../../src/core/content/types';
import { SPECIAL_IDS } from '../../src/core/battle/types';

/** Early version of `validate:content` (docs/DESIGN.md §3.2). */
describe.each(ENCOUNTERS.map((e) => [e.id, e] as const))('content %s', (_id, e) => {
  const text = encounterText(e);

  it('has at least 6 questions with unique ids', () => {
    expect(e.questions.length).toBeGreaterThanOrEqual(6);
    expect(new Set(e.questions.map((q) => q.id)).size).toBe(e.questions.length);
  });

  it.each(e.questions.map((q) => [q.id, q] as const))(
    '%s is grounded and well-formed',
    (_qid, q) => {
      expect(text, `highlight "${q.highlight}" must appear in the verse`).toContain(q.highlight);
      expect(q.answerIndex).toBeGreaterThanOrEqual(0);
      expect(q.answerIndex).toBeLessThan(q.choices.length);
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.choices.length).toBe(q.type === 'true_false' ? 2 : 4);
    },
  );

  it('has 1–3 waves and valid orbs', () => {
    expect(e.waves.length).toBeGreaterThanOrEqual(1);
    expect(e.waves.length).toBeLessThanOrEqual(3);
    const specials = e.orbs.map((o) => o.special);
    expect(new Set(specials).size).toBe(specials.length);
    for (const o of e.orbs) {
      expect(SPECIAL_IDS).toContain(o.special);
      if (o.word) expect(text).toContain(o.word);
    }
  });
});

describe('getEncounter', () => {
  it('finds by id and falls back to the first encounter', () => {
    expect(getEncounter('gen-001').id).toBe('gen-001');
    expect(getEncounter('nope').id).toBe('gen-001');
    expect(getEncounter(undefined).id).toBe('gen-001');
  });
});
