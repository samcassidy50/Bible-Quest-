import type { Rng } from '../rng';

/**
 * Turn-based battle state machine (docs/DESIGN.md §3.1).
 * Phase 0 stub: phases and transitions are defined; damage, waves and questions arrive in Phase 1.
 *
 * INTRO → HERO_QUESTION → HERO_ATTACK → ENEMY_ATTACK → HERO_QUESTION … → VICTORY | DEFEAT
 */
export type BattlePhase =
  'INTRO' | 'HERO_QUESTION' | 'HERO_ATTACK' | 'ENEMY_ATTACK' | 'VICTORY' | 'DEFEAT';

const TRANSITIONS: Record<BattlePhase, readonly BattlePhase[]> = {
  INTRO: ['HERO_QUESTION'],
  HERO_QUESTION: ['HERO_ATTACK'],
  HERO_ATTACK: ['ENEMY_ATTACK', 'VICTORY'],
  ENEMY_ATTACK: ['HERO_QUESTION', 'DEFEAT'],
  VICTORY: [],
  DEFEAT: [],
};

export class BattleEngine {
  private _phase: BattlePhase = 'INTRO';
  private _turn = 0;

  constructor(readonly rng: Rng) {}

  get phase(): BattlePhase {
    return this._phase;
  }

  /** Number of completed hero turns. */
  get turn(): number {
    return this._turn;
  }

  get isOver(): boolean {
    return this._phase === 'VICTORY' || this._phase === 'DEFEAT';
  }

  canTransition(to: BattlePhase): boolean {
    return TRANSITIONS[this._phase].includes(to);
  }

  transition(to: BattlePhase): void {
    if (!this.canTransition(to)) {
      throw new Error(`Illegal battle transition ${this._phase} → ${to}`);
    }
    if (this._phase === 'HERO_ATTACK') this._turn++;
    this._phase = to;
  }
}
