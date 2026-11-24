import { describe, expect, it } from 'vitest';
import { QuestionDeck, type DeckItem } from '../../src/core/quiz/QuestionDeck';
import { createRng } from '../../src/core/rng';

const qs: DeckItem[] = [
  { id: 'q1', difficulty: 'easy' },
  { id: 'q2', difficulty: 'easy' },
  { id: 'q3', difficulty: 'medium' },
  { id: 'q4', difficulty: 'hard' },
  { id: 'q5' },
  { id: 'q6', difficulty: 'medium' },
];

describe('QuestionDeck', () => {
  it('asks questions not seen in earlier battles first', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const deck = new QuestionDeck(qs, createRng(seed), undefined, ['q1', 'q2', 'q3']);
      const first = Array.from({ length: 3 }, () => deck.draw().id).sort();
      expect(first).toEqual(['q4', 'q5', 'q6']);
      const rest = Array.from({ length: 3 }, () => deck.draw().id).sort();
      expect(rest).toEqual(['q1', 'q2', 'q3']);
    }
  });

  it('asks the section just read first, then other new questions, then seen ones', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const deck = new QuestionDeck(qs, createRng(seed), undefined, ['q1'], ['q5', 'q6', 'q1']);
      const order = Array.from({ length: 6 }, () => deck.draw().id);
      expect(order.slice(0, 2).sort()).toEqual(['q5', 'q6']);
      expect(order.slice(2, 5).sort()).toEqual(['q2', 'q3', 'q4']);
      expect(order[5]).toBe('q1');
    }
  });

  it('draws every question once before repeating', () => {
    const deck = new QuestionDeck(qs, createRng(1));
    const ids = Array.from({ length: 6 }, () => deck.draw().id);
    expect(new Set(ids).size).toBe(6);
    expect(deck.round).toBe(1);
    deck.draw();
    expect(deck.round).toBe(2);
  });

  it('never asks the same question twice in a row across reshuffles', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const deck = new QuestionDeck(qs, createRng(seed));
      let prev = '';
      for (let i = 0; i < 30; i++) {
        const id = deck.draw().id;
        expect(id).not.toBe(prev);
        prev = id;
      }
    }
  });

  it('is deterministic for a seed', () => {
    const a = new QuestionDeck(qs, createRng(9));
    const b = new QuestionDeck(qs, createRng(9));
    for (let i = 0; i < 12; i++) expect(a.draw().id).toBe(b.draw().id);
  });

  it('filters by difficulty; untagged questions are always included', () => {
    const deck = new QuestionDeck(qs, createRng(1), ['easy']);
    expect(deck.size).toBe(3);
    const ids = new Set(Array.from({ length: 3 }, () => deck.draw().id));
    expect(ids).toEqual(new Set(['q1', 'q2', 'q5']));
  });

  it('works with a single question', () => {
    const deck = new QuestionDeck([{ id: 'only' }], createRng(1));
    expect(deck.draw().id).toBe('only');
    expect(deck.draw().id).toBe('only');
  });

  it('rejects duplicate ids and empty pools', () => {
    expect(() => new QuestionDeck([{ id: 'a' }, { id: 'a' }], createRng(1))).toThrow(/Duplicate/);
    expect(() => new QuestionDeck([], createRng(1))).toThrow(/empty/);
    expect(
      () => new QuestionDeck([{ id: 'a', difficulty: 'hard' }], createRng(1), ['easy']),
    ).toThrow(/empty/);
  });
});
