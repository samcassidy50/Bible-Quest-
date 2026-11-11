import { describe, expect, it } from 'vitest';
import {
  formatReference,
  parsePassage,
  parseVpl,
  resolvePassage,
} from '../../src/core/content/bible';
import { buildEncounter, canonicalOrder, validateCollection } from '../../src/core/content/build';
import { shuffleChoices } from '../../src/core/quiz/shuffleChoices';
import { createRng } from '../../src/core/rng';

const bible = parseVpl(
  ['GEN 1:1 Alpha beta gamma.', '', 'GEN 1:2 Delta epsilon zeta.', 'GEN 2:1 Eta theta.'].join('\n'),
);

const q = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `test-1-q${n}`,
  type: 'multiple_choice',
  prompt: 'Which word?',
  choices: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  answerIndex: 0,
  highlight: 'Alpha beta',
  ...extra,
});
const file = (extra: Record<string, unknown> = {}) => ({
  id: 'test-1',
  title: 'Test',
  passage: 'GEN 1:1-2',
  waves: [{ id: 'foe', name: 'Foe', maxHp: 10, attack: 1, color: '#123456', size: 1 }],
  orbs: [{ special: 'sword', word: 'epsilon' }],
  questions: [1, 2, 3, 4, 5, 6].map((n) => q(n)),
  ...extra,
});

describe('bible helpers', () => {
  it('parses passages and formats references', () => {
    expect(parsePassage('GEN 1:1-2')).toEqual({ book: 'GEN', chapter: 1, from: 1, to: 2 });
    expect(parsePassage('GEN 3:4')).toEqual({ book: 'GEN', chapter: 3, from: 4, to: 4 });
    expect(formatReference(parsePassage('GEN 1:1-2'))).toBe('Genesis 1:1–2');
    expect(formatReference(parsePassage('GEN 3:4'))).toBe('Genesis 3:4');
    expect(formatReference(parsePassage('XYZ 1:1'))).toBe('XYZ 1:1');
    expect(() => parsePassage('Genesis 1')).toThrow(/Invalid passage/);
    expect(() => parsePassage('GEN 1:5-2')).toThrow(/Invalid verse range/);
    expect(() => parsePassage('GEN 1:0')).toThrow(/Invalid verse range/);
  });

  it('resolves verses and refuses missing ones', () => {
    expect(resolvePassage(bible, 'GEN 1:1-2').map((v) => v.ref)).toEqual(['1:1', '1:2']);
    expect(() => resolvePassage(bible, 'GEN 1:1-3')).toThrow(/GEN 1:3 not found/);
    expect(() => resolvePassage(bible, 'EXO 1:1')).toThrow(/No source text/);
  });

  it('rejects malformed source lines', () => {
    expect(() => parseVpl('Genesis one')).toThrow(/Malformed/);
  });
});

describe('buildEncounter', () => {
  it('builds a valid file with verses from the source', () => {
    const e = buildEncounter(file(), bible);
    expect(e.reference).toBe('Genesis 1:1–2');
    expect(e.verses[1]!.text).toBe('Delta epsilon zeta.');
    expect(e.waves[0]!.color).toBe(0x123456);
  });

  it('rejects verse text in the file and other unknown fields', () => {
    expect(() =>
      buildEncounter(file({ verses: [{ ref: '1:1', text: 'made up' }] }), bible),
    ).toThrow(/Unrecognized key/);
  });

  it('lists schema problems by path', () => {
    expect(() => buildEncounter(file({ questions: [q(1)] }), bible, 'x.json')).toThrow(
      /x\.json: invalid file[\s\S]*questions/,
    );
    expect(() => buildEncounter(file({ waves: [] }), bible)).toThrow(/waves/);
    const tfBad = file({
      questions: [1, 2, 3, 4, 5]
        .map((n) => q(n))
        .concat([q(6, { type: 'true_false', choices: ['Yes', 'No'] })]),
    });
    expect(() => buildEncounter(tfBad, bible)).toThrow(/invalid file/);
  });

  it('reports every content rule that is broken', () => {
    const bad = file({
      orbs: [{ special: 'sword', word: 'omega' }, { special: 'sword' }],
      waves: [
        { id: 'foe', name: 'Foe', maxHp: 10, attack: 1, color: '#123456', size: 1 },
        { id: 'foe', name: 'Foe', maxHp: 10, attack: 1, color: '#123456', size: 1 },
      ],
      questions: [
        q(1, { highlight: 'not in text' }),
        q(2, { answerIndex: 4 }),
        q(3, { choices: ['A', 'A', 'B', 'C'] }),
        q(4, { id: 'other-q4' }),
        q(1),
        q(6),
      ],
    });
    let message = '';
    try {
      buildEncounter(bad, bible);
    } catch (err) {
      message = (err as Error).message;
    }
    for (const part of [
      'highlight "not in text"',
      'answerIndex 4',
      'duplicate choices',
      'should start with "test-1-"',
      'duplicate question id "test-1-q1"',
      'word "omega"',
      'duplicate orb "sword"',
      'duplicate foe id "foe"',
    ]) {
      expect(message).toContain(part);
    }
  });

  it('checks ids across encounters and sorts canonically', () => {
    const a = buildEncounter(file(), bible);
    const b = buildEncounter(
      file({
        id: 'test-2',
        passage: 'GEN 2:1',
        orbs: [],
        questions: [1, 2, 3, 4, 5, 6].map((n) =>
          q(n, { id: `test-2-q${n}`, highlight: 'Eta theta' }),
        ),
      }),
      bible,
    );
    expect(validateCollection([a, b])).toEqual([]);
    expect(validateCollection([a, a]).join('\n')).toMatch(
      /duplicate encounter id[\s\S]*more than one encounter/,
    );
    expect(canonicalOrder([b, a], ['GEN']).map((e) => e.passage)).toEqual(['GEN 1:1-2', 'GEN 2:1']);
  });
});

describe('shuffleChoices', () => {
  const base = buildEncounter(file(), bible).questions[0]!;

  it('keeps the right answer attached to the right choice', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = shuffleChoices(base, createRng(seed));
      expect(s.choices[s.answerIndex]).toBe('Alpha');
      expect([...s.choices].sort()).toEqual([...base.choices].sort());
    }
    expect(base.choices[0]).toBe('Alpha'); // original untouched
  });

  it('actually moves the answer around', () => {
    const positions = new Set(
      Array.from({ length: 40 }, (_, i) => shuffleChoices(base, createRng(i + 1)).answerIndex),
    );
    expect(positions.size).toBeGreaterThan(2);
  });

  it('leaves True/False in order', () => {
    const tf = { ...base, type: 'true_false' as const, choices: ['True', 'False'], answerIndex: 1 };
    expect(shuffleChoices(tf, createRng(3))).toBe(tf);
  });
});
