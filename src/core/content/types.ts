import type { FoeSpec, SpecialId } from '../battle/types';
import type { Difficulty } from '../quiz/QuestionDeck';

/**
 * Content types (docs/DESIGN.md §3.2). Encounter files live in content/encounters/ as JSON and
 * are validated and resolved by core/content/build.ts.
 */

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
  /** Short name shown on the passage select screen. */
  title: string;
  book: string;
  /** Source reference, e.g. "GEN 1:1-2". */
  passage: string;
  /** Display reference, e.g. "Genesis 1:1–2". */
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
