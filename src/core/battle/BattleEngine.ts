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
  /** The front foe of the wave and its HP; a pair also has a back foe. */
  private _front: FoeSpec;
  private _foeHp: number;
  private _back: FoeSpec | null;
  private _backHp: number;
  /** Enemy turns taken this wave, so a pair alternates attackers. */
  private _attacks = 0;
  /** Which foe of a pair single-target hits land on (the player taps a foe to choose). */
  private _target: 'front' | 'back' = 'front';
  private _faith: number;
  private _streak = 0;
  private _blocks = 0;
  private _foeStun = 0;
  private _pending: Exclude<ActionId, 'ultimate'> | null = null;
  private readonly _unlocked: ReadonlySet<SpecialId>;
  private _energy: number;

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
    const first = config.waves[0] as FoeSpec;
    this._front = first;
    this._foeHp = first.maxHp;
    this._back = first.partner ?? null;
    this._backHp = this._back?.maxHp ?? 0;
    this._faith = clamp(config.startingFaith ?? 0, 0, TUNING.faith.max);
    this._energy = clamp(
      (config.startingEnergy ?? 0) + (config.bonusEnergy ?? 0),
      0,
      TUNING.energy.max,
    );
    this._blocks = Math.max(0, config.startingBlocks ?? 0);
  }

  // ── State ────────────────────────────────────────────────────────────────

  /** Rune of Zeal: hits after a right answer land harder. */
  private powered(mult: number, correct: boolean): number {
    return correct ? mult * (1 + (this.config.poweredBonus ?? 0)) : mult;
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
  /** The foe in front (the one hits land on). */
  get foe(): FoeSpec {
    return this._front;
  }
  /** The second foe of a pair, while it stands. */
  get backFoe(): FoeSpec | null {
    return this._back;
  }
  get backFoeHp(): number {
    return this._backHp;
  }
  /** The foe single-target hits land on; always 'front' unless a pair stands. */
  get target(): 'front' | 'back' {
    return this._target;
  }

  /** Chooses which foe of a pair the next single-target hits land on (hero's turn only). */
  setTarget(target: 'front' | 'back'): void {
    this.expectPhase('HERO_CHOOSE');
    if (target === 'back' && !this._back) throw new Error('There is no back foe to target');
    this._target = target;
  }
  get heroHp(): number {
    return this._heroHp;
  }
  get heroMaxHp(): number {
    return this.config.hero.maxHp;
  }

  /**
   * After a defeat the hero prays and is restored to full life (docs/DESIGN.md §2.2). The fight
   * stays lost: the phase remains DEFEAT and the player goes back to the map.
   */
  revive(): void {
    this.expectPhase('DEFEAT');
    this._heroHp = this.config.hero.maxHp;
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
  /** The ultimate has been earned and the Faith meter is full. */
  get ultimateReady(): boolean {
    return this.ultimateUnlocked && this._faith >= TUNING.faith.max;
  }
  get ultimateUnlocked(): boolean {
    return this.config.ultimateUnlocked ?? true;
  }
  get energy(): number {
    return this._energy;
  }
  costOf(id: SpecialId): number {
    return TUNING.energy.cost[id];
  }
  canAfford(id: SpecialId): boolean {
    return this._energy >= this.costOf(id);
  }
  /** The action waiting on a question answer, if any. */
  get pendingAction(): ActionId | null {
    return this._pending;
  }

  /** Owned specials the hero has enough energy for right now. */
  get specialsAvailable(): SpecialId[] {
    return SPECIAL_IDS.filter((id) => this._unlocked.has(id) && this.canAfford(id));
  }

  isUnlocked(id: SpecialId): boolean {
    return this._unlocked.has(id);
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
    if (correct && this.config.healOnCorrect)
      result.healed += this.healHp(this.config.healOnCorrect);
    // Single-target hits land on the chosen foe; the Sword sweeps both whatever the target.
    const hit = (mult: number) => {
      if (this._target === 'back' && this._back) result.backDamage += this.damageBack(mult);
      else result.damage += this.damageFoe(mult);
    };

    switch (action) {
      case 'attack':
        hit(this.powered(correct ? TUNING.attack.powered : TUNING.attack.base, correct));
        break;
      case 'sword': {
        const mult = this.powered(correct ? TUNING.sword.powered : TUNING.sword.base, correct);
        result.damage += this.damageFoe(mult);
        result.backDamage += this.damageBack(mult);
        break;
      }
      case 'shield':
        result.blocksAdded = correct ? TUNING.shield.poweredBlocks : TUNING.shield.baseBlocks;
        this._blocks += result.blocksAdded;
        if (correct) hit(this.powered(TUNING.shield.poweredHit, true));
        break;
      case 'breastplate':
        result.healed += this.healHero(
          (correct ? TUNING.breastplate.poweredHeal : TUNING.breastplate.baseHeal) *
            (this.config.healPower ?? 1),
        );
        break;
      case 'sandals':
        this._foeStun = TUNING.sandals.stunTurns + (this.config.stunBonus ?? 0);
        result.stunned = true;
        if (correct) hit(this.powered(TUNING.sandals.poweredHit, true));
        break;
    }
    if (action !== 'attack') this._energy -= this.costOf(action);

    return this.finishHeroAction(result);
  }

  /** Runs the foe's turn: skipped if stunned, absorbed by a shield block, otherwise damages the hero. */
  enemyTurn(): EnemyTurnResult {
    this.expectPhase('ENEMY_TURN');
    const attacker = this._back && this._attacks % 2 === 1 ? 'back' : 'front';
    const foe = attacker === 'back' ? (this._back as FoeSpec) : this._front;
    this._attacks++;
    const result: EnemyTurnResult = {
      foeId: foe.id,
      attacker,
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
      result.damage = this.roll(foe.attack);
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
    const mult = TUNING.ultimate.damage;
    result.damage = this.damageFoe(mult);
    result.backDamage = this.damageBack(mult);
    result.healed = this.healHero(TUNING.ultimate.heal);
    return this.finishHeroAction(result);
  }

  private finishHeroAction(result: HeroActionResult): HeroActionResult {
    this._turn++;
    if (this._back && this._backHp === 0) {
      this._back = null;
      this._target = 'front';
      if (this._foeHp > 0) result.backDefeated = true;
    }
    if (this._foeHp > 0) {
      this._phase = 'ENEMY_TURN';
      return result;
    }
    result.foeDefeated = true;
    if (this._back) {
      // The other foe of the pair steps up; the wave goes on.
      this._front = this._back;
      this._foeHp = this._backHp;
      this._back = null;
      this._backHp = 0;
      result.steppedUp = true;
      this._target = 'front';
      this._phase = 'ENEMY_TURN';
      return result;
    }
    if (this._waveIndex < this.config.waves.length - 1) {
      this._waveIndex++;
      const next = this.config.waves[this._waveIndex] as FoeSpec;
      this._front = next;
      this._foeHp = next.maxHp;
      this._back = next.partner ?? null;
      this._backHp = this._back?.maxHp ?? 0;
      this._attacks = 0;
      this._target = 'front';
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
    const dealt = this.config.oneShot ? this._foeHp : Math.min(dmg, this._foeHp);
    this._foeHp -= dealt;
    return dealt;
  }

  /** The sweep's share for the back foe of a pair (0 when there is none). */
  private damageBack(multiplier: number): number {
    if (!this._back || this._backHp === 0) return 0;
    const dmg = this.roll(this.config.hero.attack * multiplier);
    const dealt = this.config.oneShot ? this._backHp : Math.min(dmg, this._backHp);
    this._backHp -= dealt;
    return dealt;
  }

  private healHero(fraction: number): number {
    return this.healHp(Math.round(this.config.hero.maxHp * fraction));
  }

  private healHp(amount: number): number {
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
      backDamage: 0,
      backDefeated: false,
      steppedUp: false,
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
