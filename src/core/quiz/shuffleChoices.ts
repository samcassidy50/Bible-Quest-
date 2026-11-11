import type { Question } from '../content/types';
import type { Rng } from '../rng';

/**
 * Shuffles a question's answer choices for display so the right answer isn't always in the same
 * place. True/false keeps its natural order. Returns a new question; the original is untouched.
 */
export function shuffleChoices(q: Question, rng: Rng): Question {
  if (q.type === 'true_false') return q;
  const order = rng.shuffle(q.choices.map((_, i) => i));
  return {
    ...q,
    choices: order.map((i) => q.choices[i] as string),
    answerIndex: order.indexOf(q.answerIndex),
  };
}
