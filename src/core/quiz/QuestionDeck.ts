import type { Rng } from '../rng';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DeckItem {
  id: string;
  difficulty?: Difficulty;
}

/**
 * Draws questions without replacement (docs/DESIGN.md §2.3). When the pool runs out it is
 * reshuffled, and the first draw of the new round never repeats the last question asked.
 * Questions in `seen` (asked in earlier battles) come after the unseen ones in the first round,
 * so replaying a passage asks new questions before old ones. Unseen questions in `preferred`
 * (the section just read) come first of all.
 */
export class QuestionDeck<Q extends DeckItem> {
  private readonly pool: readonly Q[];
  private queue: Q[] = [];
  private last: Q | null = null;
  private _round = 0;
  private seen: ReadonlySet<string>;
  private preferred: ReadonlySet<string>;

  constructor(
    questions: readonly Q[],
    private readonly rng: Rng,
    difficulties?: readonly Difficulty[],
    seen: Iterable<string> = [],
    preferred: Iterable<string> = [],
  ) {
    this.seen = new Set(seen);
    this.preferred = new Set(preferred);
    const ids = new Set<string>();
    for (const q of questions) {
      if (ids.has(q.id)) throw new Error(`Duplicate question id "${q.id}"`);
      ids.add(q.id);
    }
    this.pool = difficulties
      ? questions.filter((q) => !q.difficulty || difficulties.includes(q.difficulty))
      : questions.slice();
    if (this.pool.length === 0) throw new Error('Question deck is empty');
  }

  get size(): number {
    return this.pool.length;
  }

  /** How many times the pool has been (re)shuffled. 1 after the first draw. */
  get round(): number {
    return this._round;
  }

  draw(): Q {
    if (this.queue.length === 0) this.refill();
    const next = this.queue.shift() as Q;
    this.last = next;
    return next;
  }

  private refill(): void {
    const shuffled = this.rng.shuffle(this.pool);
    // Unseen first, preferred ones leading (stable, so each part stays shuffled); only the first
    // round looks at `seen` and `preferred`.
    this.queue =
      this._round === 0
        ? [
            ...shuffled.filter((q) => !this.seen.has(q.id) && this.preferred.has(q.id)),
            ...shuffled.filter((q) => !this.seen.has(q.id) && !this.preferred.has(q.id)),
            ...shuffled.filter((q) => this.seen.has(q.id)),
          ]
        : shuffled;
    this._round++;
    if (this.queue.length > 1 && this.queue[0] === this.last) {
      // Swap with the end so the same question isn't asked twice in a row.
      const end = this.queue.length - 1;
      [this.queue[0], this.queue[end]] = [this.queue[end] as Q, this.queue[0] as Q];
    }
  }
}
