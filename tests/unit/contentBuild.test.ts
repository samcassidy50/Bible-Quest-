import { describe, expect, it } from 'vitest';
import {
  formatReference,
  parsePassage,
  parseVpl,
  resolvePassage,
} from '../../src/core/content/bible';
import { buildEncounter, canonicalOrder, validateCollection } from '../../src/core/content/build';
import { sectionQuestions, textUpToSection } from '../../src/core/content/types';
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
  section: 1,
  ...extra,
});
const foe = (id = 'foe') => ({ id, name: 'Foe', maxHp: 10, attack: 1, color: '#123456', size: 1 });
const file = (extra: Record<string, unknown> = {}) => ({
  id: 'test-1',
  title: 'Test',
  passage: 'GEN 1:1-2',
  setting: 'deep',
  sections: [{ verses: '1-2', foe: foe(), orbs: [{ word: 'epsilon' }] }],
  questions: [1, 2, 3, 4, 5, 6].map((n) => q(n)),
  ...extra,
});

describe('question prompts', () => {
  const withFirst = (extra: Record<string, unknown>) =>
    file({ questions: [q(1, extra), ...[2, 3, 4, 5, 6].map((n) => q(n))] });

  it('rejects fill-in-the-blank prompts (questions are read aloud)', () => {
    expect(() =>
      buildEncounter(withFirst({ prompt: 'God made the ____.' }), bible, 'x.json'),
    ).toThrow(/fill-in-the-blank/);
    expect(() => buildEncounter(withFirst({ type: 'fill_blank' }), bible, 'x.json')).toThrow(
      /invalid file/,
    );
  });
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
    expect(() => buildEncounter(file({ sections: [] }), bible)).toThrow(/sections/);
    const tfBad = file({
      questions: [1, 2, 3, 4, 5]
        .map((n) => q(n))
        .concat([q(6, { type: 'true_false', choices: ['Yes', 'No'] })]),
    });
    expect(() => buildEncounter(tfBad, bible)).toThrow(/invalid file/);
  });

  it('reports every content rule that is broken', () => {
    const bad = file({
      sections: [
        { verses: '1', foe: foe(), orbs: [{ word: 'omega' }, { word: 'omega' }, {}] },
        { verses: '2', foe: foe(), orbs: [] },
      ],
      questions: [
        q(1, { highlight: 'not in text' }),
        q(2, { answerIndex: 4 }),
        q(3, { choices: ['A', 'A', 'B', 'C'] }),
        q(4, { id: 'other-q4' }),
        q(1),
        q(6, { section: 3 }),
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
      'duplicate orb word "omega"',
      'duplicate foe id "foe"',
      'orb word "omega" is not in section 1',
      'section 2 has 0 question(s)',
      'section 3, but the passage has 2',
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
        sections: [{ verses: '1', foe: foe(), orbs: [] }],
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

describe('settings', () => {
  it('requires a known setting and accepts flood weather', () => {
    expect(() => buildEncounter(file({ setting: 'moon' }), bible)).toThrow(/setting/);
    expect(buildEncounter(file({ setting: 'flood', weather: 'clearing' }), bible)).toMatchObject({
      setting: 'flood',
      weather: 'clearing',
    });
    expect(buildEncounter(file(), bible).weather).toBeUndefined();
  });
});

describe('armor rewards', () => {
  it('a passage may award one piece of armor, and each piece only once', () => {
    const a = buildEncounter(file({ unlocks: 'sword' }), bible);
    expect(a.unlocks).toBe('sword');
    const b = buildEncounter(
      file({
        id: 'test-2',
        unlocks: 'sword',
        questions: [1, 2, 3, 4, 5, 6].map((n) => q(n, { id: `test-2-q${n}` })),
      }),
      bible,
    );
    expect(validateCollection([a, b]).join()).toMatch(
      /"sword" is awarded by both test-1 and test-2/,
    );
    expect(() => buildEncounter(file({ unlocks: 'laser' }), bible)).toThrow(/unlocks/);
    expect(() =>
      buildEncounter(
        file({ sections: [{ verses: '1-2', foe: foe(), orbs: [{ special: 'sword' }] }] }),
        bible,
      ),
    ).toThrow(/invalid file/);
  });
});

describe('foe sprites', () => {
  const withSprite = (sprite: string) =>
    file({ sections: [{ verses: '1-2', foe: { ...foe(), sprite }, orbs: [] }] });
  it('a foe may name known sprite art, and nothing else', () => {
    expect(buildEncounter(withSprite('slime-lava'), bible).waves[0]?.sprite).toBe('slime-lava');
    expect(buildEncounter(file(), bible).waves[0]?.sprite).toBeUndefined();
    expect(() => buildEncounter(withSprite('dragon'), bible)).toThrow(/sprite/);
  });
});

describe('reading sections', () => {
  const twoParts = (questions: unknown[]) =>
    file({
      sections: [
        { verses: '1', foe: foe('a'), orbs: [{ word: 'beta' }] },
        { verses: '2', foe: foe('b'), orbs: [{ word: 'zeta' }] },
      ],
      questions,
    });
  const four = [
    q(1),
    q(2, { highlight: 'gamma' }),
    q(3, { highlight: 'Delta', section: 2 }),
    q(4, { highlight: 'zeta', section: 2 }),
    q(5, { section: 2 }), // review: asks about section 1 in the second fight
    q(6, { highlight: 'beta' }),
  ];

  it('splits the passage into readings, each with its own verses, foe and orbs', () => {
    const e = buildEncounter(twoParts(four), bible);
    expect(e.sections.map((s) => s.reference)).toEqual(['Genesis 1:1', 'Genesis 1:2']);
    expect(e.sections[1]!.verses[0]!.text).toBe('Delta epsilon zeta.');
    expect(e.waves.map((w) => w.id)).toEqual(['a', 'b']);
    expect(e.orbs).toEqual([{ word: 'beta' }, { word: 'zeta' }]);
    expect(e.verses).toHaveLength(2);
  });

  it('only asks about what has been read: the fight after a section draws from it and earlier ones', () => {
    const e = buildEncounter(twoParts(four), bible);
    expect(textUpToSection(e, 1)).toBe('Alpha beta gamma.');
    const first = sectionQuestions(e, 1);
    expect(first.pool.map((x) => x.id)).toEqual(['test-1-q1', 'test-1-q2', 'test-1-q6']);
    expect(first.current).toEqual(['test-1-q1', 'test-1-q2', 'test-1-q6']);
    const second = sectionQuestions(e, 2);
    expect(second.pool).toHaveLength(6);
    expect(second.current).toEqual(['test-1-q3', 'test-1-q4', 'test-1-q5']);
  });

  it('rejects a question about a part not read yet', () => {
    const early = [...four.slice(0, 5), q(6, { highlight: 'Delta', section: 1 })];
    expect(() => buildEncounter(twoParts(early), bible)).toThrow(/not read by section 1/);
  });

  it('requires the sections to cover the passage in order', () => {
    const parts = (a: string, b: string) =>
      file({
        sections: [
          { verses: a, foe: foe('a'), orbs: [] },
          { verses: b, foe: foe('b'), orbs: [] },
        ],
      });
    expect(() => buildEncounter(parts('1', '1'), bible)).toThrow(/start at verse 2/);
    expect(() => buildEncounter(parts('2', '1'), bible)).toThrow(/start at verse 1/);
    expect(() =>
      buildEncounter(file({ sections: [{ verses: '1', foe: foe(), orbs: [] }] }), bible),
    ).toThrow(/sections end at verse 1, not 2/);
    expect(() =>
      buildEncounter(
        file({ sections: [1, 2, 3, 4, 5].map(() => ({ verses: '1', foe: foe(), orbs: [] })) }),
        bible,
      ),
    ).toThrow(/sections/);
  });
});
