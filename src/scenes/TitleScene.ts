import Phaser from 'phaser';
import { readSafeAreaInsets, toGameInsets } from '../services/safeArea';
import { hideSplash } from '../services/platform';
import { updateTestState } from '../services/testHooks';
import { sfx } from '../services/sfx';
import type { DebugParams } from '../core/debugParams';
import { getEncounter } from '../content';
import { Backdrop } from './backdrop/Backdrop';
import { HERO_SCALE, HeroSprite } from './hero/HeroSprite';
import { FONT_TITLE, FONT_UI, FONT_VERSE } from './util';

/**
 * Title screen: the hero setting out across the first morning, the game's name, the opening
 * verse, and a prompt to begin. Any tap goes to the map.
 */
export class TitleScene extends Phaser.Scene {
  private backdrop?: Backdrop;
  private hero?: HeroSprite;
  private shade?: Phaser.GameObjects.Graphics;
  private rays?: Phaser.GameObjects.Graphics;
  private title?: Phaser.GameObjects.Text;
  private tagline?: Phaser.GameObjects.Text;
  private verse?: Phaser.GameObjects.Text;
  private verseBack?: Phaser.GameObjects.Graphics;
  private prompt?: Phaser.GameObjects.Container;
  private frozen = false;

  constructor() {
    super('title');
  }

  create(): void {
    const debug = this.registry.get('debug') as DebugParams;
    this.frozen = debug.freeze;

    this.backdrop = new Backdrop(this, 'light', undefined, this.frozen);
    this.shade = this.add.graphics().setDepth(-20);
    this.rays = this.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
    this.hero = new HeroSprite(this, 0, 0).setScale(HERO_SCALE).setDepth(2);
    this.hero.loop(this.frozen ? 'idle' : 'run');

    this.title = this.add
      .text(0, 0, 'Bible Quest', {
        fontFamily: FONT_TITLE,
        fontSize: '124px',
        fontStyle: 'bold',
        color: '#ffd76a',
        stroke: '#3a1d08',
        strokeThickness: 12,
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setShadow(0, 8, '#1a0c04', 0, true, true);
    this.title.setTint(0xfff3c0, 0xfff3c0, 0xf0a030, 0xf0a030);
    this.tagline = this.add
      .text(0, 0, 'READ  ·  REMEMBER  ·  STAND FIRM', {
        fontFamily: FONT_UI,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#fdf6e3',
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setLetterSpacing(4)
      .setShadow(0, 2, '#1a0c04', 4, false, true);

    // The opening verse, straight from the vendored source text.
    const opening = getEncounter('gen-001');
    const first = opening.verses[0];
    this.verseBack = this.add.graphics().setDepth(4);
    this.verse = this.add
      .text(0, 0, first ? `“${first.text}”\nGenesis ${first.ref} (${opening.translation})` : '', {
        fontFamily: FONT_VERSE,
        fontSize: '28px',
        fontStyle: 'italic',
        color: '#fdf6e3',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5)
      .setDepth(5);

    const pill = this.add.graphics();
    pill.fillStyle(0x000000, 0.35).fillRoundedRect(-157, -27, 320, 64, 32);
    pill.fillStyle(0xc0392b, 1).fillRoundedRect(-160, -32, 320, 64, 32);
    pill.lineStyle(3, 0xffd76a, 0.9).strokeRoundedRect(-160, -32, 320, 64, 32);
    const begin = this.add
      .text(0, 0, 'Tap to begin', {
        fontFamily: FONT_UI,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setShadow(0, 2, '#5a120a', 2, false, true);
    this.prompt = this.add.container(0, 0, [pill, begin]).setDepth(6);

    if (!this.frozen) {
      this.tweens.add({
        targets: this.prompt,
        scale: 1.06,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      this.tweens.add({ targets: this.rays, alpha: 0.55, duration: 3000, yoyo: true, repeat: -1 });
    }

    this.input.once('pointerdown', () => {
      sfx.play('start');
      this.cameras.main.fadeOut(250, 27, 21, 48);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('map'));
    });

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      this.backdrop?.destroy();
    });

    updateTestState({ ready: true, scene: 'title' });
    // Hide the native splash only once the first real frame is drawn (no black flash).
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => void hideSplash());
  }

  update(_t: number, delta: number): void {
    if (!this.frozen) this.backdrop?.scroll(delta * 0.6);
  }

  /** Re-positions everything for the current (expanded) game size and safe-area insets. */
  private layout(): void {
    const { width, height } = this.scale.gameSize;
    const insets = toGameInsets(readSafeAreaInsets(), width, this.scale.displaySize.width);
    const cx = (insets.left + width - insets.right) / 2;
    const groundY = height * 0.8;

    this.backdrop?.layout(width, height, groundY);
    this.hero?.setPosition(cx - Math.min(430, width * 0.3), groundY);

    // Darker at the top so the name reads against the sky, and soft rays fanning out behind it.
    this.shade?.clear();
    this.shade
      ?.fillGradientStyle(0x0b0816, 0x0b0816, 0x0b0816, 0x0b0816, 0.55, 0.55, 0, 0)
      .fillRect(0, 0, width, height * 0.5);
    const titleY = insets.top + height * 0.24;
    this.rays?.clear();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.rays
        ?.fillStyle(0xffe08a, i % 2 ? 0.05 : 0.09)
        .fillTriangle(
          cx,
          titleY,
          cx + Math.cos(a - 0.09) * 620,
          titleY + Math.sin(a - 0.09) * 620,
          cx + Math.cos(a + 0.09) * 620,
          titleY + Math.sin(a + 0.09) * 620,
        );
    }

    this.tweens.killTweensOf(this.title ?? []);
    this.title?.setPosition(cx, titleY);
    if (!this.frozen && this.title) {
      this.tweens.add({
        targets: this.title,
        y: titleY - 8,
        duration: 2400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
    this.tagline?.setPosition(cx, titleY + 86);

    const verseY = titleY + 178;
    this.verse?.setWordWrapWidth(Math.min(880, width - insets.left - insets.right - 80));
    this.verse?.setPosition(cx, verseY);
    const vw = (this.verse?.width ?? 0) + 56;
    const vh = (this.verse?.height ?? 0) + 28;
    this.verseBack?.clear();
    this.verseBack
      ?.fillStyle(0x0b0816, 0.5)
      .fillRoundedRect(cx - vw / 2, verseY - vh / 2, vw, vh, 18)
      .lineStyle(2, 0xffd76a, 0.45)
      .strokeRoundedRect(cx - vw / 2, verseY - vh / 2, vw, vh, 18);

    this.prompt?.setPosition(cx, height - insets.bottom - 70);
  }
}
