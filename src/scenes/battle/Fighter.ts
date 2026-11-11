import Phaser from 'phaser';
import type { HeroClipName } from '../../core/anim/heroClips';
import { HERO_SCALE, HeroSprite } from '../hero/HeroSprite';
import { HERO_SHEET } from '../../core/anim/heroSheet';
import { FONT_UI } from '../util';

/**
 * A combatant on the field. The hero is the pixel-art sprite (scenes/hero/HeroSprite.ts);
 * foes are still placeholder shapes until their sprites land.
 * Origin is at the fighter's feet so both stand on the same ground line.
 */
export class Fighter extends Phaser.GameObjects.Container {
  readonly figure: Phaser.GameObjects.Container;
  readonly rig?: HeroSprite;
  private shieldBubble?: Phaser.GameObjects.Arc;
  private stunText?: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly kind: 'hero' | 'foe',
    color = 0x3b6fd8,
    size = 1,
  ) {
    super(scene, x, y);
    this.figure = scene.add.container(0, 0);
    this.add(this.figure);
    if (kind === 'hero') {
      this.rig = new HeroSprite(scene, 0, 0);
      this.figure.add(this.rig);
    } else {
      this.drawFoe(color);
    }
    this.figure.setScale(size);
    scene.add.existing(this);
  }

  /** Height of the drawn figure, for placing HP bars and effects above it. */
  get figureHeight(): number {
    const h = this.rig ? HERO_SHEET.standingHeight * HERO_SCALE : 190;
    return h * this.figure.scaleY;
  }

  private drawFoe(color: number): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.3).fillEllipse(0, 0, 140, 26);
    g.fillStyle(color, 0.55).fillCircle(0, -95, 92);
    g.fillStyle(color, 0.85).fillCircle(-18, -85, 70).fillCircle(26, -100, 62);
    g.fillStyle(color).fillCircle(0, -95, 58);
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
