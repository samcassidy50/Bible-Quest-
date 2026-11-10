import type { FoeSpec, SpecialId } from '../battle/types';
import type { Difficulty } from '../quiz/QuestionDeck';

/** Content types (docs/DESIGN.md §3.2). Phase 3 moves encounters to JSON validated by Zod. */

export interface Verse {
  ref: string;
  text: string;
}

/**
 * Phase 1 questions are all choice-based: multiple choice (4), true/false (2 choices),
 * and fill-in-the-blank (choices for the blank).
 */
export interface Question {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'fill_blank';
  difficulty?: Difficulty;
  prompt: string;
  choices: readonly string[];
  answerIndex: number;
  /** Phrase that must appear word for word in the encounter's verses; shown on a wrong answer. */
  highlight: string;
}

export interface EncounterFoe extends FoeSpec {
  /** Placeholder-art colour until Phase 4 sprites exist. */
  color: number;
  /** Placeholder-art scale (1 = normal foe, bigger for bosses). */
  size: number;
}

export interface Orb {
  special: SpecialId;
  /** Optional key word in the verse the orb is anchored to (Phase 2 stretch). */
  word?: string;
}

export interface Encounter {
  id: string;
  book: string;
  reference: string;
  translation: 'WEB';
  verses: readonly Verse[];
  waves: readonly EncounterFoe[];
  orbs: readonly Orb[];
  questions: readonly Question[];
}

/** All verse text joined, for grounding checks. */
export function encounterText(e: Encounter): string {
  return e.verses.map((v) => v.text).join(' ');
}
