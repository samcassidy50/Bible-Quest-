import Phaser from 'phaser';
import angelSheetUrl from '../../assets/angel/angel.png';

/**
 * Pixel-art angel sheet painted by scripts/art/paint_angel.py (keep these in sync with that
 * script): FRAMES cells of W x H, robe hem at (ORIGIN_X, ORIGIN_Y), hands at HANDS.
 */
const SHEET = {
  frameWidth: 112,
  frameHeight: 100,
  frames: 4,
  originX: 56,
  originY: 98,
  handsY: 76,
};
export const ANGEL_TEXTURE = 'angel';
/** Same pixel size as the hero (native → design pixels). */
const ANGEL_SCALE = 3;

/** Queues the angel sheet on a loader (call from a scene's preload). */
export function loadAngelSheet(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(ANGEL_TEXTURE, angelSheetUrl, {
    frameWidth: SHEET.frameWidth,
    frameHeight: SHEET.frameHeight,
  });
}

/** Keeps the pixel art crisp when scaled up (call once the sheet has loaded). */
export function useNearestFilterForAngel(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(ANGEL_TEXTURE))
    textures.get(ANGEL_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/**
 * The armor-giving angel: an original pixel-art character matching the hero's style (golden hair,
 * halo, white robe, feathered wings). Origin is at the hem of the robe. It hovers and flaps
 * gently; `hands` is where a presented gift sits.
 */
export class Angel extends Phaser.GameObjects.Container {
  readonly hands: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, x: number, y: number, animate = true) {
    super(scene, x, y);
    const s = ANGEL_SCALE;
    const aura = scene.add.circle(0, -50 * s, 52 * s, 0xfff4c8, 0.22);
    const haloGlow = scene.add.ellipse(0, -80 * s, 34 * s, 12 * s, 0xfff1b0, 0.3);
    const sprite = scene.add
      .sprite(0, 0, ANGEL_TEXTURE, 0)
      .setOrigin(SHEET.originX / SHEET.frameWidth, (SHEET.originY + 1) / SHEET.frameHeight)
      .setScale(s);
    this.hands = scene.add.container(0, -(SHEET.originY - SHEET.handsY) * s);

    // Parts sit in an inner container so the gentle hover doesn't fight tweens that move the angel itself.
    const inner = scene.add.container(0, 0, [aura, haloGlow, sprite, this.hands]);
    this.add(inner);
    scene.add.existing(this);

    if (animate) {
      if (!scene.anims.exists('angel-flap')) {
        scene.anims.create({
          key: 'angel-flap',
          frames: scene.anims.generateFrameNumbers(ANGEL_TEXTURE, {
            start: 0,
            end: SHEET.frames - 1,
          }),
          frameRate: 7,
          repeat: -1,
        });
      }
      sprite.play('angel-flap');
      scene.tweens.add({
        targets: inner,
        y: -10,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      scene.tweens.add({ targets: haloGlow, alpha: 0.1, duration: 900, yoyo: true, repeat: -1 });
      scene.tweens.add({
        targets: aura,
        scale: 1.12,
        alpha: 0.1,
        duration: 1200,
        yoyo: true,
        repeat: -1,
      });
    }
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
