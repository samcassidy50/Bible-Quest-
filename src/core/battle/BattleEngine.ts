import type { Rng } from '../rng';
import { TUNING } from './tuning';
import {
  SPECIAL_IDS,
  type ActionId,
  type BattleConfig,
  type BattlePhase,
  type EnemyTurnResult,
  type FoeSpec,
  type HeroActionResult,
  type SpecialId,
} from './types';

/**
 * Turn-based battle rules (docs/DESIGN.md §2.2, §2.6, §3.1). Pure logic: the scene calls
 * start → choose → answer → enemyTurn … and animates the returned results.
 *
 * INTRO → HERO_CHOOSE ─(attack|special)→ HERO_QUESTION ─answer→ ENEMY_TURN | HERO_CHOOSE(next wave) | VICTORY
 *                     └─(ultimate)──────────────────────────→ ENEMY_TURN | HERO_CHOOSE(next wave) | VICTORY
 * ENEMY_TURN ─enemyTurn→ HERO_CHOOSE | DEFEAT
 */
export class BattleEngine {
  private _phase: BattlePhase = 'INTRO';
  private _turn = 0;
  private _waveIndex = 0;
  private _heroHp: number;
  private _foeHp: number;
  private _faith: number;
  private _streak = 0;
  private _blocks = 0;
  private _foeStun = 0;
  private _pending: Exclude<ActionId, 'ultimate'> | null = null;
  private readonly _unlocked: ReadonlySet<SpecialId>;
  private readonly _used = new Set<SpecialId>();

  constructor(
    private readonly config: BattleConfig,
    private readonly rng: Rng,
  ) {
    if (config.waves.length === 0) throw new Error('A battle needs at least one wave');
    if (config.hero.maxHp <= 0) throw new Error('Hero maxHp must be positive');
    for (const id of config.unlockedSpecials) {
      if (!SPECIAL_IDS.includes(id)) throw new Error(`Unknown special "${id}"`);
    }
    this._unlocked = new Set(config.unlockedSpecials);
    this._heroHp = config.hero.maxHp;
    this._foeHp = this.foe.maxHp;
    this._faith = clamp(config.startingFaith ?? 0, 0, TUNING.faith.max);
  }

  // ── State ────────────────────────────────────────────────────────────────

  private get specialPower(): number {
    return this.config.specialPower ?? 1;
  }

  get phase(): BattlePhase {
    return this._phase;
  }
  /** Completed hero actions. */
  get turn(): number {
    return this._turn;
  }
  get isOver(): boolean {
    return this._phase === 'VICTORY' || this._phase === 'DEFEAT';
  }
  get waveIndex(): number {
    return this._waveIndex;
  }
  get waveCount(): number {
    return this.config.waves.length;
  }
  get foe(): FoeSpec {
    return this.config.waves[this._waveIndex] as FoeSpec;
  }
  get heroHp(): number {
    return this._heroHp;
  }
  get heroMaxHp(): number {
    return this.config.hero.maxHp;
  }
  get foeHp(): number {
    return this._foeHp;
  }
  get faith(): number {
    return this._faith;
  }
  get streak(): number {
    return this._streak;
  }
  get blocks(): number {
    return this._blocks;
  }
  get foeStunned(): boolean {
    return this._foeStun > 0;
  }
  get ultimateReady(): boolean {
    return this._faith >= TUNING.faith.max;
  }
  /** The action waiting on a question answer, if any. */
  get pendingAction(): ActionId | null {
    return this._pending;
  }

  /** Specials unlocked for this fight and not yet used. */
  get specialsAvailable(): SpecialId[] {
    return SPECIAL_IDS.filter((id) => this._unlocked.has(id) && !this._used.has(id));
  }

  isUnlocked(id: SpecialId): boolean {
    return this._unlocked.has(id);
  }
  isUsed(id: SpecialId): boolean {
    return this._used.has(id);
  }

  /** Actions the hero may choose right now (empty outside HERO_CHOOSE). */
  availableActions(): ActionId[] {
    if (this._phase !== 'HERO_CHOOSE') return [];
    const actions: ActionId[] = ['attack', ...this.specialsAvailable];
    if (this.ultimateReady) actions.push('ultimate');
    return actions;
  }

  // ── Commands ─────────────────────────────────────────────────────────────

  start(): void {
    this.expectPhase('INTRO');
    this._phase = 'HERO_CHOOSE';
  }

  /**
   * Picks the hero's action. The ultimate resolves immediately (no question) and returns its
   * result; any other action moves to HERO_QUESTION and returns null.
   */
  choose(action: ActionId): HeroActionResult | null {
    this.expectPhase('HERO_CHOOSE');
    if (!this.availableActions().includes(action)) {
      throw new Error(`Action "${action}" is not available`);
    }
    if (action === 'ultimate') return this.resolveUltimate();
    this._pending = action;
    this._phase = 'HERO_QUESTION';
    return null;
  }

  /** Resolves the pending action with the player's answer. */
  answer(correct: boolean): HeroActionResult {
    this.expectPhase('HERO_QUESTION');
    const action = this._pending as Exclude<ActionId, 'ultimate'>;
    this._pending = null;

    const faithGained = this.updateFaith(correct);
    const result = this.emptyResult(action, correct, faithGained);
    const hit = (mult: number) => (result.damage += this.damageFoe(mult));

    switch (action) {
      case 'attack':
        hit(correct ? TUNING.attack.powered : TUNING.attack.base);
        break;
      case 'sword':
        hit((correct ? TUNING.sword.powered : TUNING.sword.base) * this.specialPower);
        break;
      case 'shield':
        result.blocksAdded = correct ? TUNING.shield.poweredBlocks : TUNING.shield.baseBlocks;
        this._blocks += result.blocksAdded;
        if (correct) hit(TUNING.shield.poweredHit);
        break;
      case 'breastplate':
        result.healed = this.healHero(
          (correct ? TUNING.breastplate.poweredHeal : TUNING.breastplate.baseHeal) *
            this.specialPower,
        );
        break;
      case 'sandals':
        this._foeStun = TUNING.sandals.stunTurns;
        result.stunned = true;
        if (correct) hit(TUNING.sandals.poweredHit);
        break;
    }
    if (action !== 'attack') this._used.add(action);

    return this.finishHeroAction(result);
  }

  /** Runs the foe's turn: skipped if stunned, absorbed by a shield block, otherwise damages the hero. */
  enemyTurn(): EnemyTurnResult {
    this.expectPhase('ENEMY_TURN');
    const result: EnemyTurnResult = {
      foeId: this.foe.id,
      damage: 0,
      blocked: false,
      skippedStunned: false,
      defeat: false,
    };

    if (this._foeStun > 0) {
      this._foeStun--;
      result.skippedStunned = true;
    } else if (this._blocks > 0) {
      this._blocks--;
      result.blocked = true;
    } else {
      result.damage = this.roll(this.foe.attack);
      this._heroHp = Math.max(0, this._heroHp - result.damage);
    }

    if (this._heroHp === 0) {
      result.defeat = true;
      this._phase = 'DEFEAT';
    } else {
      this._phase = 'HERO_CHOOSE';
    }
    return result;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private resolveUltimate(): HeroActionResult {
    this._faith = 0;
    const result = this.emptyResult('ultimate', null, 0);
    result.damage = this.damageFoe(TUNING.ultimate.damage + (this.config.ultimateBonus ?? 0));
    result.healed = this.healHero(TUNING.ultimate.heal);
    return this.finishHeroAction(result);
  }

  private finishHeroAction(result: HeroActionResult): HeroActionResult {
    this._turn++;
    if (this._foeHp > 0) {
      this._phase = 'ENEMY_TURN';
      return result;
    }
    result.foeDefeated = true;
    if (this._waveIndex < this.config.waves.length - 1) {
      this._waveIndex++;
      this._foeHp = this.foe.maxHp;
      this._foeStun = 0; // a stun doesn't carry over to the next foe; shield blocks do
      result.nextWave = this._waveIndex;
      this._phase = 'HERO_CHOOSE';
    } else {
      result.victory = true;
      this._phase = 'VICTORY';
    }
    return result;
  }

  private updateFaith(correct: boolean): number {
    if (!correct) {
      this._streak = 0;
      return 0;
    }
    this._streak++;
    let gain: number = TUNING.faith.perCorrect;
    if (this._streak % TUNING.faith.streakLength === 0) gain += TUNING.faith.streakBonus;
    const before = this._faith;
    this._faith = Math.min(TUNING.faith.max, this._faith + gain);
    return this._faith - before;
  }

  private damageFoe(multiplier: number): number {
    const dmg = this.roll(this.config.hero.attack * multiplier);
    const dealt = Math.min(dmg, this._foeHp);
    this._foeHp -= dealt;
    return dealt;
  }

  private healHero(fraction: number): number {
    const amount = Math.round(this.config.hero.maxHp * fraction);
    const healed = Math.min(amount, this.config.hero.maxHp - this._heroHp);
    this._heroHp += healed;
    return healed;
  }

  /** Applies ±variance and rounds; never below 1. */
  private roll(base: number): number {
    const v = TUNING.damageVariance;
    const factor = 1 - v + this.rng.next() * 2 * v;
    return Math.max(1, Math.round(base * factor));
  }

  private emptyResult(
    action: ActionId,
    correct: boolean | null,
    faithGained: number,
  ): HeroActionResult {
    return {
      action,
      correct,
      damage: 0,
      healed: 0,
      blocksAdded: 0,
      stunned: false,
      faithGained,
      foeDefeated: false,
      nextWave: null,
      victory: false,
    };
  }

  private expectPhase(phase: BattlePhase): void {
    if (this._phase !== phase) {
      throw new Error(`Expected phase ${phase} but battle is in ${this._phase}`);
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
