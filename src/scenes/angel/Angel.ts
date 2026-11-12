import Phaser from 'phaser';

const OUT = 0x5a4630;
const ROBE = 0xfdfbf4;
const ROBE_SHADE = 0xe6dfcc;
const GOLD = 0xf4c95d;
const SKIN = 0xf6d3a8;
const HAIR = 0xf2d77e;

/**
 * The armor-giving angel: an original chibi character drawn in code (white robe with gold trim,
 * golden hair, halo, feathered wings). Origin is at the hem of the robe. It hovers gently.
 */
export class Angel extends Phaser.GameObjects.Container {
  private readonly wings: Phaser.GameObjects.Container;
  readonly hands: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, x: number, y: number, animate = true) {
    super(scene, x, y);
    const aura = scene.add.circle(0, -110, 120, 0xfff4c8, 0.22);
    this.wings = scene.add.container(0, -120);
    this.wings.add([this.wing(-1), this.wing(1)]);
    const body = scene.add.graphics();
    // Robe: a soft bell shape with gold trim and a sash.
    body.fillStyle(ROBE, 1).fillPoints(
      this.pts([
        [-46, 0],
        [46, 0],
        [30, -110],
        [-30, -110],
      ]),
      true,
    );
    body.fillStyle(ROBE_SHADE, 1).fillPoints(
      this.pts([
        [10, 0],
        [46, 0],
        [30, -110],
        [16, -110],
      ]),
      true,
    );
    body.lineStyle(4, OUT, 1).strokePoints(
      this.pts([
        [-46, 0],
        [46, 0],
        [30, -110],
        [-30, -110],
      ]),
      true,
    );
    body.fillStyle(GOLD, 1).fillRect(-44, -10, 88, 8);
    body.fillStyle(GOLD, 1).fillRect(-33, -70, 66, 9);
    body.lineStyle(2, OUT, 0.8).strokeRect(-33, -70, 66, 9);
    // Head, hair and face (facing the viewer, eyes closed in a smile).
    body.fillStyle(HAIR, 1).fillCircle(0, -148, 40);
    body.lineStyle(4, OUT, 1).strokeCircle(0, -148, 40);
    body.fillStyle(SKIN, 1).fillCircle(0, -142, 32);
    body.lineStyle(3, OUT, 1).strokeCircle(0, -142, 32);
    body.fillStyle(HAIR, 1).fillEllipse(-14, -168, 40, 20).fillEllipse(16, -170, 40, 18);
    body.lineStyle(3, OUT, 1);
    body
      .beginPath()
      .arc(-11, -142, 6, Math.PI * 1.1, Math.PI * 1.9)
      .strokePath();
    body
      .beginPath()
      .arc(11, -142, 6, Math.PI * 1.1, Math.PI * 1.9)
      .strokePath();
    body
      .beginPath()
      .arc(0, -128, 7, Math.PI * 0.15, Math.PI * 0.85)
      .strokePath();
    body.fillStyle(0xf2a0a0, 0.6).fillEllipse(-19, -131, 10, 6).fillEllipse(19, -131, 10, 6);
    // Halo.
    const halo = scene.add.ellipse(0, -198, 64, 16).setStrokeStyle(6, GOLD, 1);
    const haloGlow = scene.add.ellipse(0, -198, 78, 24).setStrokeStyle(10, 0xfff1b0, 0.35);
    // Arms reaching forward to present a gift.
    this.hands = scene.add.container(0, -66);
    const arms = scene.add.graphics();
    arms
      .fillStyle(ROBE, 1)
      .fillRoundedRect(-40, -12, 30, 18, 8)
      .fillRoundedRect(10, -12, 30, 18, 8);
    arms
      .lineStyle(3, OUT, 1)
      .strokeRoundedRect(-40, -12, 30, 18, 8)
      .strokeRoundedRect(10, -12, 30, 18, 8);
    arms.fillStyle(SKIN, 1).fillCircle(-10, -2, 8).fillCircle(10, -2, 8);
    arms.lineStyle(3, OUT, 1).strokeCircle(-10, -2, 8).strokeCircle(10, -2, 8);
    this.hands.add(arms);

    // Parts sit in an inner container so the gentle hover doesn't fight tweens that move the angel itself.
    const inner = scene.add.container(0, 0, [aura, this.wings, body, haloGlow, halo, this.hands]);
    this.add(inner);
    scene.add.existing(this);

    if (animate) {
      scene.tweens.add({
        targets: inner,
        y: -10,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      scene.tweens.add({
        targets: this.wings,
        scaleY: 0.9,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      scene.tweens.add({
        targets: [halo, haloGlow],
        alpha: 0.6,
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
      scene.tweens.add({
        targets: aura,
        scale: 1.15,
        alpha: 0.12,
        duration: 1200,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /** One wing: three overlapping feather rows, gold-edged. side = -1 (left) or 1 (right). */
  private wing(side: -1 | 1): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    const rows: [number, number, number][] = [
      [70, 0x2e, 0],
      [92, 0x1a, 18],
      [110, 0x0a, 36],
    ];
    for (const [len, , drop] of rows) {
      for (let k = 0; k < 5; k++) {
        const ang = (-0.9 + k * 0.32) * side;
        const fx = side * (26 + Math.cos(ang * side) * len * 0.55);
        const fy = -20 + drop - Math.sin(-0.9 + k * 0.32) * len * 0.5;
        g.fillStyle(k % 2 ? 0xffffff : 0xf7f1df, 1).fillEllipse(fx, fy, 46, 20);
        g.lineStyle(2, GOLD, 0.9).strokeEllipse(fx, fy, 46, 20);
      }
    }
    return g;
  }

  private pts(p: number[][]): Phaser.Math.Vector2[] {
    return p.map(([x, y]) => new Phaser.Math.Vector2(x, y));
  }
}

/** What the angel says when presenting each piece of armor (original lines). */
export const ANGEL_LINES: Record<string, string> = {
  sword: 'Well done, little pilgrim! You listened closely. Take the Sword of the Spirit.',
  shield: 'You are growing brave. Here is the Shield of Faith to guard you.',
  breastplate: 'Your heart is true. Wear the Breastplate of Righteousness.',
  sandals: 'Walk on in peace, friend. These are the Sandals of Peace.',
  ultimate: 'You carry every piece now. Stand strong in the Full Armor of God!',
};
