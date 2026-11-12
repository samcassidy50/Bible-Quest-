import Phaser from 'phaser';
import { ORB_LIFETIME_MS } from '../../core/scripture/orbs';

/** A plain orb of light that floats up while the verse is read; tap it for +1 energy (docs/DESIGN.md §2.6). */
export const ENERGY_COLOR = 0xf4b400;
export class Orb extends Phaser.GameObjects.Container {
  private readonly glow: Phaser.GameObjects.Arc;
  private floatTween?: Phaser.Tweens.Tween;
  private fadeTimer?: Phaser.Time.TimerEvent;
  private done = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly id: string,
    onTap: (orb: Orb) => void,
    private readonly onExpire: (orb: Orb) => void,
  ) {
    super(scene, x, y);
    const color = ENERGY_COLOR;
    // Light only, no icon: a soft halo, a warm body and a white-hot heart.
    this.glow = scene.add.circle(0, 0, 60, color, 0.28);
    const halo = scene.add.circle(0, 0, 44, 0xffd34d, 0.55);
    const body = scene.add.circle(0, 0, 32, 0xffe98a, 0.95);
    const heart = scene.add.circle(-4, -5, 18, 0xffffff, 0.95);
    // Generous invisible hit area (≥ 64 px on a phone).
    const hit = scene.add.circle(0, 0, 70, 0x000000, 0).setInteractive();
    hit.on('pointerdown', () => onTap(this));
    this.add([this.glow, halo, body, heart, hit]);
    this.setDepth(40).setScale(0);
    scene.add.existing(this);
  }

  /** Pops in, drifts upward for its lifetime, then fades and expires if not tapped. */
  appear(riseBy: number, lifetimeMs = ORB_LIFETIME_MS): void {
    this.scene.tweens.add({ targets: this, scale: 1, duration: 250, ease: 'Back.out' });
    this.scene.tweens.add({
      targets: this.glow,
      scale: 1.35,
      alpha: 0.12,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });
    this.floatTween = this.scene.tweens.add({
      targets: this,
      y: this.y - riseBy,
      duration: lifetimeMs,
      ease: 'Sine.inOut',
    });
    this.fadeTimer = this.scene.time.delayedCall(lifetimeMs * 0.75, () => {
      if (this.done) return;
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: lifetimeMs * 0.25,
        onComplete: () => {
          if (this.done) return;
          this.done = true;
          this.onExpire(this);
          this.destroy();
        },
      });
    });
  }

  /** Flies to the loadout slot and disappears. */
  collectTo(x: number, y: number): Promise<void> {
    this.done = true;
    this.floatTween?.stop();
    this.fadeTimer?.remove();
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(1);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        x,
        y,
        scale: 0.45,
        duration: 450,
        ease: 'Cubic.in',
        onComplete: () => {
          this.destroy();
          resolve();
        },
      });
    });
  }

  /** Removes the orb without expiring it (skip / replay). */
  discard(): void {
    this.done = true;
    this.fadeTimer?.remove();
    this.destroy();
  }
}
