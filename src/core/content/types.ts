import type { RuneId } from '../battle/runes';
import type { FoeSpec, SpecialId } from '../battle/types';
import type { FoeSpriteId, Setting } from './schema';
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
  /**
   * The reading section (1-based) this question belongs to. It is asked in that section's fight
   * (and later ones, as review), so its highlight must be in that section or an earlier one.
   */
  section: number;
}

export interface EncounterFoe extends FoeSpec {
  /** Placeholder-art colour until Phase 4 sprites exist. */
  color: number;
  /** Placeholder-art scale (1 = normal foe, bigger for bosses). */
  size: number;
  /** Sprite art for this foe; without it the placeholder shape is drawn in `color`. */
  sprite?: FoeSpriteId;
  /** The second foe of a pair (see FoeSpec.partner). */
  partner?: EncounterFoe;
}

/** An energy orb in the reading (+1 energy when tapped). */
export interface Orb {
  /** Optional key word in the verse the orb is anchored to: it rises as that word scrolls past. */
  word?: string;
}

/**
 * One part of a passage: its verses are read, then its foe is fought. A passage has 1–4 sections,
 * read and fought in turn, with the hero's health and energy carried from one fight to the next.
 */
export interface EncounterSection {
  /** Display reference, e.g. "Genesis 1:1–2". */
  reference: string;
  verses: readonly Verse[];
  /** The foe (or pair) fought after this reading. */
  foe: EncounterFoe;
  /** Energy orbs in this reading. */
  orbs: readonly Orb[];
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
  setting: Setting;
  weather?: 'storm' | 'clearing';
  /** The readings and fights, in order. */
  sections: readonly EncounterSection[];
  /** Every verse of the passage (all sections). */
  verses: readonly Verse[];
  /** Each section's foe, in order: the battle's waves. */
  waves: readonly EncounterFoe[];
  /** Every section's orbs, in order. */
  orbs: readonly Orb[];
  /** Armor awarded the first time this passage is won (unlocks a special, or the ultimate). */
  unlocks?: SpecialId | 'ultimate';
  /** Blessing awarded the first time this passage is won. */
  rune?: RuneId;
  questions: readonly Question[];
}

/** All verse text joined, for grounding checks. */
export function encounterText(e: Encounter): string {
  return e.verses.map((v) => v.text).join(' ');
}

/** The verse text read by the end of section `n` (1-based): what a question of that section may ask about. */
export function textUpToSection(e: Encounter, n: number): string {
  return e.sections
    .slice(0, n)
    .flatMap((s) => s.verses.map((v) => v.text))
    .join(' ');
}

/**
 * The questions for the fight after section `n` (1-based): that section's own, plus earlier
 * sections' as review. `current` lists the ids to ask first.
 */
export function sectionQuestions(
  e: Encounter,
  n: number,
): { pool: readonly Question[]; current: readonly string[] } {
  const pool = e.questions.filter((q) => q.section <= n);
  return { pool, current: pool.filter((q) => q.section === n).map((q) => q.id) };
}
