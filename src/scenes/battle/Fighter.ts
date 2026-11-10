import Phaser from 'phaser';
import { FONT_UI } from '../util';

/**
 * Placeholder fighter art drawn with shapes (Phase 4 swaps in sprites).
 * Origin is at the fighter's feet so both stand on the same ground line.
 */
export class Fighter extends Phaser.GameObjects.Container {
  readonly figure: Phaser.GameObjects.Container;
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
    if (kind === 'hero') this.drawHero();
    else this.drawFoe(color);
    this.figure.setScale(size);
    scene.add.existing(this);
  }

  /** Height of the drawn figure, for placing HP bars and effects above it. */
  get figureHeight(): number {
    return 190 * this.figure.scaleY;
  }

  private drawHero(): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.25).fillEllipse(0, 0, 110, 22); // shadow
    g.fillStyle(0x2c3e50).fillRoundedRect(-30, -60, 22, 60, 8).fillRoundedRect(8, -60, 22, 60, 8); // legs
    g.fillStyle(0x3b6fd8).fillRoundedRect(-40, -135, 80, 85, 18); // tunic
    g.fillStyle(0xf4c95d).fillRect(-40, -78, 80, 10); // belt
    g.fillStyle(0xf1c27d).fillCircle(0, -160, 32); // head
    g.fillStyle(0x3a2a1a).fillEllipse(0, -182, 70, 30); // hair
    g.fillStyle(0x222222).fillCircle(11, -160, 4).fillCircle(-5, -160, 4); // eyes (facing right)
    const sword = this.scene.add.graphics();
    sword.fillStyle(0xdfe6ee).fillRect(0, -6, 80, 12); // blade
    sword.fillStyle(0xf4c95d).fillRect(-8, -14, 8, 28).fillRect(-26, -5, 18, 10); // guard + grip
    sword.setPosition(44, -100).setRotation(-0.6);
    this.figure.add([g, sword]);
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

  /** Gentle breathing loop (skipped with ?freeze=1). */
  idle(): void {
    this.scene.tweens.add({
      targets: this.figure,
      scaleY: this.figure.scaleY * 1.04,
      duration: this.kind === 'hero' ? 900 : 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
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
