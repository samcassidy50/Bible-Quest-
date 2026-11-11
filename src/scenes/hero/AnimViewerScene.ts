import Phaser from 'phaser';
import type { Clip } from '../../core/anim/clip';
import { HERO_CLIPS, HERO_CLIP_NAMES, type HeroClipName } from '../../core/anim/heroClips';
import type { DebugParams } from '../../core/debugParams';
import { updateTestState } from '../../services/testHooks';
import { Button } from '../ui/Button';
import { FONT_TITLE, FONT_UI } from '../util';
import { HeroRig } from './HeroRig';

const FRAMES = 7;

/**
 * Hero animation viewer (dev builds, `?scene=rig`). Tap a clip to play it on a large hero.
 * `?scene=rig&clip=slash` shows a contact sheet of evenly spaced frames instead.
 */
export class AnimViewerScene extends Phaser.Scene {
  constructor() {
    super('rig');
  }

  create(): void {
    const debug = this.registry.get('debug') as DebugParams;
    const { width: W, height: H } = this.scale.gameSize;
    this.add
      .graphics()
      .fillGradientStyle(0x2a2350, 0x2a2350, 0x6b3a6b, 0x6b3a6b, 1)
      .fillRect(0, 0, W, H);
    this.add
      .graphics()
      .fillStyle(0x3a2a1f)
      .fillRect(0, H * 0.72, W, H * 0.28);

    const sheet = debug.clip && debug.clip in HERO_CLIPS ? (debug.clip as HeroClipName) : undefined;
    if (sheet) this.contactSheet(sheet, W, H);
    else this.player(W, H);
  }

  private contactSheet(name: HeroClipName, W: number, H: number): void {
    const clip = HERO_CLIPS[name];
    this.add
      .text(W / 2, 30, `${name} — ${clip.duration} ms${clip.loop ? ' (loop)' : ''}`, {
        fontFamily: FONT_TITLE,
        fontSize: '40px',
        color: '#f4c95d',
      })
      .setOrigin(0.5, 0);
    const step = (W - 120) / (FRAMES - 1);
    for (let i = 0; i < FRAMES; i++) {
      const t = Math.round((clip.duration * i) / (FRAMES - 1));
      const x = 60 + i * step;
      const rig = new HeroRig(this, x, H * 0.72).setScale(0.95);
      rig.showFrame(name, t);
      this.add
        .text(x, H * 0.72 + 30, `${t} ms`, {
          fontFamily: FONT_UI,
          fontSize: '22px',
          color: '#fdf6e3',
        })
        .setOrigin(0.5, 0);
    }
    updateTestState({ ready: true, scene: 'rig', battle: null, scripture: null });
  }

  private player(W: number, H: number): void {
    const rig = new HeroRig(this, W * 0.3, H * 0.72).setScale(1.6);
    const label = this.add
      .text(W * 0.3, 40, 'idle', { fontFamily: FONT_TITLE, fontSize: '44px', color: '#f4c95d' })
      .setOrigin(0.5, 0);
    this.add
      .text(W * 0.62, 40, 'Hero animations', {
        fontFamily: FONT_UI,
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#fdf6e3',
      })
      .setOrigin(0.5, 0);

    const targets: Record<string, { x: number; y: number }> = {};
    HERO_CLIP_NAMES.forEach((name, i) => {
      const x = W * 0.52 + (i % 2) * 230;
      const y = 120 + Math.floor(i / 2) * 92;
      new Button(this, x, y, {
        width: 210,
        height: 74,
        radius: 37,
        label: name,
        fontSize: 24,
        fill: 0x2e86de,
        onTap: () => {
          label.setText(name);
          void rig.play(name).then(() => {
            if (!(HERO_CLIPS[name] as Clip).hold) label.setText(rig.currentClip);
          });
        },
      });
      targets[`clip:${name}`] = { x, y };
    });
    updateTestState({
      ready: true,
      scene: 'rig',
      battle: null,
      scripture: null,
      targets,
      gameWidth: W,
      gameHeight: H,
    });
  }
}
