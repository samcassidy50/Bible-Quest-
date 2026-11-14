import Phaser from 'phaser';
import { progress } from '../services/progress';
import { pixelBox, UI } from './ui/pixelUi';
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

    const pill = pixelBox(this, UI.button, 0, 0, 330, 72).setTint(0xe0503e);
    const begin = this.add
      .text(0, 0, 'Tap to begin', {
        fontFamily: FONT_UI,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#5a120a', 6);
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
    }

    this.input.once('pointerdown', () => {
      sfx.play('start');
      this.runOff(debug.fast);
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

  /** The hero dashes off the right edge of the screen, then the map fades in. */
  private runOff(fast: boolean): void {
    const hero = this.hero;
    const go = (): void => {
      this.cameras.main.fadeOut(250, 27, 21, 48);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        // New players choose their hero first.
        if (progress.save.settings.hero === null) {
          this.registry.set('heroSelectNext', 'map');
          this.scene.start('heroSelect');
        } else this.scene.start('map');
      });
    };
    if (!hero || fast) {
      go();
      return;
    }
    this.scale.off('resize', this.layout, this);
    hero.loop('run');
    this.tweens.add({
      targets: hero,
      x: this.scale.gameSize.width + 160,
      duration: 900,
      ease: 'Quad.in',
    });
    // Start fading while the hero is still leaving, so the screen never sits empty.
    this.time.delayedCall(700, go);
  }

  /** Re-positions everything for the current (expanded) game size and safe-area insets. */
  private layout(): void {
    const { width, height } = this.scale.gameSize;
    const insets = toGameInsets(readSafeAreaInsets(), width, this.scale.displaySize.width);
    const cx = (insets.left + width - insets.right) / 2;
    const groundY = height * 0.8;

    this.backdrop?.layout(width, height, groundY);
    this.hero?.setPosition(cx - Math.min(430, width * 0.3), groundY);

    // Darker at the top so the name reads against the sky (the backdrop's sun brings the rays).
    this.shade?.clear();
    this.shade
      ?.fillGradientStyle(0x0b0816, 0x0b0816, 0x0b0816, 0x0b0816, 0.55, 0.55, 0, 0)
      .fillRect(0, 0, width, height * 0.5);
    const titleY = insets.top + height * 0.24;

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
