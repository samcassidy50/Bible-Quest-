import Phaser from 'phaser';
import type { HeroClipName } from '../../core/anim/heroClips';
import { HERO_SCALE, HeroSprite } from '../hero/HeroSprite';
import { HERO_SHEET } from '../../core/anim/heroSheet';
import { FONT_UI } from '../util';
import type { FoeSpriteId } from '../../core/content/schema';
import { FoeSprite, type FoeAnim } from './FoeSprite';

/**
 * A combatant on the field. The hero is the pixel-art sprite (scenes/hero/HeroSprite.ts);
 * foes with a `sprite` use FoeSprite, the rest are placeholder shapes until their sprites land.
 * Origin is at the fighter's feet so both stand on the same ground line.
 */
export class Fighter extends Phaser.GameObjects.Container {
  readonly figure: Phaser.GameObjects.Container;
  readonly rig?: HeroSprite;
  readonly foeSprite?: FoeSprite;
  private shieldBubble?: Phaser.GameObjects.Arc;
  private stunText?: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly kind: 'hero' | 'foe',
    color = 0x3b6fd8,
    size = 1,
    sprite?: FoeSpriteId,
  ) {
    super(scene, x, y);
    this.figure = scene.add.container(0, 0);
    this.add(this.figure);
    if (kind === 'hero') {
      this.rig = new HeroSprite(scene, 0, 0);
      this.figure.add(this.rig);
      this.figure.setScale(size);
    } else if (sprite) {
      // Sprite foes pick their own whole-number pixel scale from `size`.
      this.foeSprite = new FoeSprite(scene, sprite, size);
      this.figure.add(this.foeSprite);
    } else {
      this.drawFoe(color);
      this.figure.setScale(size);
    }
    scene.add.existing(this);
  }

  /** Height of the drawn figure, for placing HP bars and effects above it. */
  get figureHeight(): number {
    if (this.foeSprite) return this.foeSprite.bodyHeight;
    const h = this.rig ? HERO_SHEET.standingHeight * HERO_SCALE : 190;
    return h * this.figure.scaleY;
  }

  private drawFoe(color: number): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.3).fillEllipse(0, 0, 140, 26);
    g.fillStyle(color, 0.55).fillCircle(0, -95, 92);
    g.fillStyle(color, 0.85).fillCircle(-18, -85, 70).fillCircle(26, -100, 62);
    g.fillStyle(color).fillCircle(0, -95, 58);
    // Dark outline and rim light so foes read clearly against any backdrop.
    g.lineStyle(5, 0x0b0816, 0.85).strokeCircle(0, -95, 92);
    g.lineStyle(3, 0xffffff, 0.35)
      .beginPath()
      .arc(0, -95, 86, Math.PI * 1.15, Math.PI * 1.6)
      .strokePath();
    g.fillStyle(0xff4d6d).fillEllipse(-22, -110, 22, 14).fillEllipse(14, -110, 22, 14); // eyes (facing left)
    g.fillStyle(0x0b0816).fillEllipse(-4, -72, 46, 14); // mouth
    this.figure.add(g);
  }

  /** Idle loop: the hero's breathing clip, or a gentle pulse for foes. */
  idle(): void {
    if (this.rig) {
      this.rig.loop('idle');
      return;
    }
    if (this.foeSprite) {
      this.foeSprite.idle();
      return;
    }
    this.scene.tweens.add({
      targets: this.figure,
      scaleY: this.figure.scaleY * 1.04,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  run(): void {
    this.rig?.loop('run');
  }

  stopRun(): void {
    this.rig?.loop('idle');
  }

  /** Plays a hero animation (no-op for foes). Resolves when it ends. */
  act(name: HeroClipName, onEvent?: (event: string) => void): Promise<void> {
    if (!this.rig) {
      onEvent?.('impact');
      return Promise.resolve();
    }
    return this.rig.act(name, onEvent);
  }

  /** How close the hero should stand to strike this foe without running into it. */
  get strikeDistance(): number {
    return Math.max(150, (this.foeSprite?.frontReach ?? 0) + 90);
  }

  /** Plays a sprite foe's attack, hurt or death frames (no-op for placeholder foes). */
  foeAct(anim: Exclude<FoeAnim, 'idle'>, ms?: number): Promise<void> {
    return this.foeSprite ? this.foeSprite.play(anim, ms) : Promise.resolve();
  }

  /**
   * Starts a foe walking across the field (-1 toward the hero, 1 back to its spot). Placeholder
   * foes just bob. Call `foeStop()` when it arrives.
   */
  foeMove(dir: 1 | -1): void {
    if (this.foeSprite) {
      this.foeSprite.move(dir);
      return;
    }
    this.scene.tweens.killTweensOf(this.figure);
    this.figure.y = 0;
    this.scene.tweens.add({ targets: this.figure, y: -14, duration: 150, yoyo: true, repeat: -1 });
  }

  foeStop(): void {
    if (this.foeSprite) {
      this.foeSprite.stop();
      return;
    }
    this.scene.tweens.killTweensOf(this.figure);
    this.figure.y = 0;
    this.idle();
  }

  /**
   * Plays a foe's attack and calls `onImpact` on the frame where the blow lands (once, and at
   * the latest when the attack ends). Placeholder foes lunge a little and land halfway.
   */
  async foeStrike(onImpact: () => void): Promise<void> {
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      onImpact();
    };
    if (this.foeSprite) {
      const impact = this.foeSprite.impactFrame;
      await this.foeSprite.play('attack', undefined, (k) => {
        if (k >= impact) land();
      });
    } else {
      await new Promise<void>((resolve) =>
        this.scene.tweens.add({
          targets: this.figure,
          x: -40,
          duration: 180,
          yoyo: true,
          ease: 'Quad.in',
          onYoyo: land,
          onComplete: () => resolve(),
        }),
      );
    }
    land();
  }

  get foeAnimHistory(): string[] {
    return this.foeSprite ? [...this.foeSprite.history] : [];
  }

  face(dir: 1 | -1): void {
    this.rig?.face(dir);
  }

  /** Keeps loops on their first frame for stable screenshots (?freeze=1). */
  setFrozen(frozen: boolean): void {
    if (this.rig) this.rig.frozen = frozen;
  }

  get animHistory(): string[] {
    return this.rig ? [...this.rig.history] : [];
  }

  setShield(blocks: number): void {
    if (blocks > 0 && !this.shieldBubble) {
      this.shieldBubble = this.scene.add
        .circle(0, -100, 120, 0x5dade2, 0.18)
        .setStrokeStyle(4, 0x85c1e9, 0.8);
      this.addAt(this.shieldBubble, 0);
    }
    this.shieldBubble?.setVisible(blocks > 0);
  }

  setStunned(stunned: boolean): void {
    if (stunned && !this.stunText) {
      this.stunText = this.scene.add
        .text(0, -this.figureHeight - 50, '🕊️ Calmed', {
          fontFamily: FONT_UI,
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#d7c8ff',
        })
        .setOrigin(0.5);
      this.add(this.stunText);
    }
    this.stunText?.setVisible(stunned);
  }
}
