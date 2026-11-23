import Phaser from 'phaser';
import { pixelBox, UI } from '../ui/pixelUi';

/** Parchment tint for the pixel name plates. */
const PLATE = 0xfff0c8;
import { ENCOUNTERS } from '../../content';
import type { DebugParams } from '../../core/debugParams';
import {
  bezier,
  dashedCurve,
  focusNode,
  MAP_NODES,
  MAP_REGIONS,
  newlyRevealed,
  nodeStates,
  trailControl,
  WORLD_H,
  WORLD_W,
  type MapNode,
  type NodeState,
} from '../../core/map/worldMap';
import { markSeenOnMap, totalStars } from '../../core/progress/progress';
import { runesToSet } from '../../core/progress/runes';
import { createRng } from '../../core/rng';
import { progress } from '../../services/progress';
import { readSafeAreaInsets, toGameInsets, type Insets } from '../../services/safeArea';
import { sfx } from '../../services/sfx';
import { updateTestState } from '../../services/testHooks';
import { HERO_SCALE, HeroSprite } from '../hero/HeroSprite';
import { Button } from '../ui/Button';
import { FONT_TITLE, FONT_UI, tweenAsync, wait } from '../util';

const INK = 0x3a2410;
const INK_TEXT = '#4a2e14';
const PAPER = 0xe3c98f;
const TRAIL = 0x5a3a1a;
/** The hero stands this far left of a location so its medallion stays visible. */
const HERO_OFFSET_X = 78;

/**
 * Pins an object and everything inside it to the screen. Phaser hit-tests each child with its
 * own scroll factor, so pinning only the container would leave buttons' tap areas sliding with
 * the map when it is panned.
 */
function pinToScreen(o: Phaser.GameObjects.GameObject): void {
  (o as Partial<Phaser.GameObjects.Components.ScrollFactor>).setScrollFactor?.(0);
  if (o instanceof Phaser.GameObjects.Container) o.list.forEach(pinToScreen);
}

interface Marker {
  node: MapNode;
  state: NodeState;
  c: Phaser.GameObjects.Container;
}

/**
 * Passage select as an original parchment map (docs/DESIGN.md §2.5). Only won and playable
 * locations are shown; winning a passage reveals the next one with a trail that draws itself
 * and the hero walking along it. Drag to pan; tap a location for its card.
 */
export class MapScene extends Phaser.Scene {
  private debug!: DebugParams;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private markers = new Map<string, Marker>();
  private trails = new Map<number, Phaser.GameObjects.Graphics>();
  private hero!: HeroSprite;
  private card?: Phaser.GameObjects.Container;
  private cardId: string | null = null;
  private beginBtn?: Button;
  private hud: Phaser.GameObjects.GameObject[] = [];
  private menu = new Map<string, Button>();
  private back!: Button;
  private revealing = false;
  private drag = { down: false, moved: false, x: 0, scroll: 0 };

  constructor() {
    super('map');
  }

  create(): void {
    this.debug = this.registry.get('debug') as DebugParams;
    const timeScale = (this.registry.get('timeScale') as number | undefined) ?? 1;
    this.tweens.timeScale = timeScale;
    this.time.timeScale = timeScale;
    this.markers = new Map();
    this.trails = new Map();
    this.menu = new Map();
    this.hud = [];
    this.card = undefined;
    this.cardId = null;
    this.revealing = false;

    const { width: W, height: H } = this.scale.gameSize;
    this.insets = toGameInsets(readSafeAreaInsets(), W, this.scale.displaySize.width);
    const mapH = Math.max(WORLD_H, H);
    this.cameras.main.setBounds(0, 0, WORLD_W, mapH);

    const save = progress.save;
    const unlockAll = this.debug.unlockAll;
    const states = new Map(nodeStates(save, unlockAll).map((s) => [s.id, s.state]));
    // Animate at most a couple of reveals; big jumps (like ?unlockAll) just appear.
    const fresh = newlyRevealed(save, unlockAll);
    const animate = fresh.length <= 2 ? fresh : [];
    if (fresh.length > 2) progress.update((s) => markSeenOnMap(s, fresh));

    this.drawParchment(mapH);
    this.drawTerrain();

    MAP_NODES.forEach((node, i) => {
      const state = states.get(node.id)!;
      if (i > 0 && state !== 'hidden') {
        const g = this.add.graphics();
        this.trails.set(i, g);
        if (!animate.includes(node.id)) this.drawTrail(g, i, 1);
      }
    });
    for (const node of MAP_NODES) {
      const state = states.get(node.id)!;
      if (state === 'hidden') continue;
      const m = this.makeMarker(node, state);
      if (animate.includes(node.id)) m.c.setScale(0).setAlpha(0);
      this.markers.set(node.id, m);
    }

    // Hero stands at the furthest location (or, before a reveal, at the one before it).
    const focus = focusNode(save, unlockAll);
    const firstNew = animate.length > 0 ? MAP_NODES.findIndex((n) => n.id === animate[0]) : -1;
    const start = firstNew > 0 ? MAP_NODES[firstNew - 1]! : focus;
    this.hero = new HeroSprite(this, start.x - HERO_OFFSET_X, start.y + 18)
      .setScale(HERO_SCALE * 0.75)
      .setDepth(20);
    this.hero.loop('idle');
    this.centerOn(start.x);

    this.buildHud(W, H);
    this.setupDrag();

    updateTestState({ ready: true, scene: 'map', battle: null, scripture: null });
    this.sync();
    if (animate.length > 0) void this.playReveals(animate);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private drawParchment(mapH: number): void {
    const rng = createRng(7);
    const g = this.add.graphics();
    g.fillStyle(PAPER, 1).fillRect(0, 0, WORLD_W, mapH);
    // Stains and uneven tone.
    const tones = [0xd6b574, 0xeed9a8, 0xc7a263, 0xdcc089];
    for (let i = 0; i < 220; i++) {
      g.fillStyle(tones[i % tones.length]!, 0.07 + rng.next() * 0.12);
      g.fillCircle(rng.next() * WORLD_W, rng.next() * mapH, 30 + rng.next() * 170);
    }
    // Fold creases.
    for (const x of [600, 1200, 1800]) {
      g.lineStyle(3, 0xffffff, 0.12).lineBetween(x, 0, x, mapH);
      g.lineStyle(2, 0x8a6a3a, 0.12).lineBetween(x + 3, 0, x + 3, mapH);
    }
    g.lineStyle(3, 0xffffff, 0.12).lineBetween(0, mapH / 2, WORLD_W, mapH / 2);
    // Burnt, darkened edges.
    const burnt = 0x4a2a0c;
    const band = 110;
    g.fillGradientStyle(burnt, burnt, burnt, burnt, 0.75, 0, 0.75, 0).fillRect(0, 0, band, mapH);
    g.fillGradientStyle(burnt, burnt, burnt, burnt, 0, 0.75, 0, 0.75).fillRect(
      WORLD_W - band,
      0,
      band,
      mapH,
    );
    g.fillGradientStyle(burnt, burnt, burnt, burnt, 0.7, 0.7, 0, 0).fillRect(0, 0, WORLD_W, band);
    g.fillGradientStyle(burnt, burnt, burnt, burnt, 0, 0, 0.7, 0.7).fillRect(
      0,
      mapH - band,
      WORLD_W,
      band,
    );
    for (let i = 0; i < 40; i++) {
      const edge = rng.int(0, 3);
      const t = rng.next();
      const x = edge === 0 ? 0 : edge === 1 ? WORLD_W : t * WORLD_W;
      const y = edge === 2 ? 0 : edge === 3 ? mapH : t * mapH;
      g.fillStyle(0x2e1806, 0.25 + rng.next() * 0.25).fillCircle(x, y, 20 + rng.next() * 50);
    }
  }

  private drawTerrain(): void {
    const rng = createRng(11);
    const g = this.add.graphics();

    // The Deep: dark waters on the west.
    g.fillStyle(0x7f9a98, 0.3).fillEllipse(260, 330, 520, 560);
    g.fillStyle(0x5f7c7c, 0.2).fillEllipse(220, 300, 360, 380);
    g.lineStyle(2, 0x3f5a5a, 0.35);
    for (let i = 0; i < 26; i++)
      this.wave(g, 60 + rng.next() * 420, 120 + rng.next() * 440, 26 + rng.next() * 18);

    // Rivers through Eden.
    g.lineStyle(9, 0x7f9aa0, 0.45);
    this.river(g, [960, 0], [930, 160], [1010, 300], [960, 450], [1040, 720]);
    g.lineStyle(3, 0xd8e2dc, 0.45);
    this.river(g, [960, 0], [930, 160], [1010, 300], [960, 450], [1040, 720]);
    g.lineStyle(6, 0x7f9aa0, 0.35);
    this.river(g, [1010, 300], [1120, 260], [1260, 280], [1320, 200]);

    // Garden of Eden: tree clusters.
    for (let i = 0; i < 70; i++)
      this.tree(g, 720 + rng.next() * 560, 200 + rng.next() * 420, 0.7 + rng.next() * 0.5);

    // Wilderness: thorny scrub.
    g.lineStyle(2, 0x5a4022, 0.45);
    for (let i = 0; i < 60; i++) this.thorn(g, 1180 + rng.next() * 380, 380 + rng.next() * 260);

    // Flood waters.
    g.fillStyle(0x7f9a98, 0.25).fillEllipse(1740, 520, 380, 260);
    g.lineStyle(2, 0x3f5a5a, 0.3);
    for (let i = 0; i < 14; i++) this.wave(g, 1590 + rng.next() * 300, 440 + rng.next() * 160, 22);

    // Mountains of Ararat.
    const peaks: [number, number, number][] = [];
    for (let i = 0; i < 16; i++)
      peaks.push([1760 + rng.next() * 380, 120 + rng.next() * 180, 40 + rng.next() * 40]);
    peaks.sort((a, b) => a[1] - b[1]).forEach(([x, y, s]) => this.mountain(g, x, y, s));

    // Low hills across the plains.
    g.lineStyle(2, 0x8a6a3a, 0.35);
    for (let i = 0; i < 40; i++) {
      const x = 400 + rng.next() * 1950;
      const y = 140 + rng.next() * 520;
      g.beginPath()
        .arc(x, y, 18, Math.PI * 1.1, Math.PI * 1.9)
        .strokePath();
    }

    // Region names.
    for (const r of MAP_REGIONS) {
      this.add
        .text(r.x, r.y, r.name, { fontFamily: FONT_TITLE, fontSize: '34px', color: '#6b4a22' })
        .setOrigin(0.5)
        .setAlpha(0.55)
        .setLetterSpacing(8);
    }
    this.compass(g, 560, 630);
  }

  private wave(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number): void {
    g.beginPath();
    g.arc(x, y, w / 4, Math.PI, 0, false);
    g.arc(x + w / 2, y, w / 4, Math.PI, 0, true);
    g.strokePath();
  }

  private river(g: Phaser.GameObjects.Graphics, ...pts: [number, number][]): void {
    const curve = new Phaser.Curves.Spline(pts.flat());
    curve.draw(g, 64);
  }

  private tree(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
    g.fillStyle(0x5a3a1a, 0.6).fillRect(x - 2 * s, y, 4 * s, 10 * s);
    g.fillStyle(0x6f8a4a, 0.55).fillCircle(x, y - 6 * s, 11 * s);
    g.lineStyle(2, INK, 0.35).strokeCircle(x, y - 6 * s, 11 * s);
  }

  private thorn(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.lineBetween(x - 7, y, x + 7, y - 4);
    g.lineBetween(x - 3, y + 4, x + 2, y - 8);
    g.lineBetween(x + 4, y + 3, x - 1, y - 6);
  }

  private mountain(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
    g.fillStyle(0xcbb07a, 0.9).fillTriangle(x - s, y + s, x, y - s * 0.4, x + s, y + s);
    g.fillStyle(0x9a7c48, 0.7).fillTriangle(x, y - s * 0.4, x + s, y + s, x + s * 0.2, y + s);
    g.fillStyle(0xf3ead2, 0.8).fillTriangle(
      x - s * 0.22,
      y - s * 0.12,
      x,
      y - s * 0.4,
      x + s * 0.22,
      y - s * 0.12,
    );
    g.lineStyle(2, INK, 0.5).strokeTriangle(x - s, y + s, x, y - s * 0.4, x + s, y + s);
  }

  private compass(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.lineStyle(2, INK, 0.6).strokeCircle(x, y, 46).strokeCircle(x, y, 40);
    g.fillStyle(0x6b4a22, 0.75);
    g.fillTriangle(x, y - 58, x - 9, y, x + 9, y);
    g.fillStyle(0xd6b574, 0.9).fillTriangle(x, y + 58, x - 9, y, x + 9, y);
    g.fillStyle(0x6b4a22, 0.5)
      .fillTriangle(x - 58, y, x, y - 7, x, y + 7)
      .fillTriangle(x + 58, y, x, y - 7, x, y + 7);
    this.add
      .text(x, y - 74, 'N', { fontFamily: FONT_TITLE, fontSize: '22px', color: INK_TEXT })
      .setOrigin(0.5);
  }

  private drawTrail(g: Phaser.GameObjects.Graphics, i: number, progressK: number): void {
    const a = MAP_NODES[i - 1]!;
    const b = MAP_NODES[i]!;
    g.clear().lineStyle(4, TRAIL, 0.85);
    for (const [x1, y1, x2, y2] of dashedCurve(a, trailControl(i), b, progressK))
      g.lineBetween(x1, y1, x2, y2);
  }

  private makeMarker(node: MapNode, state: NodeState): Marker {
    const enc = ENCOUNTERS.find((e) => e.id === node.id)!;
    const c = this.add.container(node.x, node.y).setDepth(10);
    const glow = this.add.circle(0, 0, 40, 0xf4c95d, state === 'open' ? 0.45 : 0);
    const shadow = this.add.ellipse(3, 30, 56, 14, 0x000000, 0.25);
    const ring = this.add.circle(0, 0, 28, 0x7a5a2e).setStrokeStyle(3, INK);
    const inner = this.add.circle(0, 0, 22, 0xf1dfb0).setStrokeStyle(2, 0xb08a4a);
    const icon = this.add.text(0, 1, node.icon, { fontSize: '24px' }).setOrigin(0.5);
    const label = this.add
      .text(0, 50, enc.title, {
        fontFamily: FONT_TITLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: INK_TEXT,
      })
      .setOrigin(0.5);
    const plate = pixelBox(this, UI.button, 0, 51, label.width + 30, 33).setTint(PLATE);
    const stars = progress.save.completed[node.id]?.stars ?? 0;
    const starText = this.add
      .text(0, 76, state === 'done' ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '', {
        fontFamily: FONT_UI,
        fontSize: '20px',
        color: '#b07d00',
        stroke: '#f3e3bb',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const hit = this.add.circle(0, 10, 46, 0x000000, 0).setInteractive();
    hit.on('pointerup', () => {
      if (this.drag.moved || this.revealing) return;
      sfx.play('uiTap');
      this.openCard(node.id);
    });
    c.add([glow, shadow, ring, inner, icon, plate, label, starText, hit]);
    if (state === 'open' && !this.debug.freeze) {
      this.tweens.add({
        targets: glow,
        scale: 1.35,
        alpha: 0.1,
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
    }
    return { node, state, c };
  }

  // ── HUD, card, panning ─────────────────────────────────────────────────────

  private buildHud(W: number, H: number): void {
    const ins = this.insets;
    const fixed = <
      T extends Phaser.GameObjects.GameObject & {
        setScrollFactor(x: number): T;
        setDepth(d: number): T;
      },
    >(
      o: T,
    ) => {
      pinToScreen(o);
      o.setDepth(50);
      this.hud.push(o);
      return o;
    };

    fixed(pixelBox(this, UI.button, W / 2, ins.top + 41, 480, 63).setTint(PLATE));
    fixed(
      this.add
        .text(W / 2, ins.top + 41, 'Genesis 1–11 · Beginnings', {
          fontFamily: FONT_TITLE,
          fontSize: '30px',
          fontStyle: 'bold',
          color: INK_TEXT,
        })
        .setOrigin(0.5),
    );
    fixed(
      this.add
        .text(W - ins.right - 30, ins.top + 41, `★ ${totalStars(progress.save)}`, {
          fontFamily: FONT_UI,
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#f4c95d',
          stroke: '#3a2410',
          strokeThickness: 6,
        })
        .setOrigin(1, 0.5),
    );
    this.back = fixed(
      new Button(this, ins.left + 24 + 65, ins.top + 41, {
        width: 130,
        height: 58,
        radius: 29,
        label: '‹ Title',
        fontSize: 22,
        fill: 0x6b4a22,
        onTap: () => this.scene.start('title'),
      }),
    );

    const toSet = runesToSet(progress.save, ENCOUNTERS);
    const items: [string, string, number][] = [
      ['runes', toSet > 0 ? `🛡️ Equipment (${toSet})` : '🛡️ Equipment', 0x8e44ad],
      ['journal', '📖 Journal', 0x2e86de],
      ['settings', '⚙️ Settings', 0x6b4a22],
    ];
    items.forEach(([key, label, fill], i) => {
      const b = fixed(
        new Button(this, ins.left + 24 + 100 + i * 214, H - ins.bottom - 40, {
          width: 200,
          height: 56,
          radius: 28,
          label,
          fontSize: 20,
          fill,
          onTap: () => this.scene.start(key),
        }),
      );
      this.menu.set(key, b);
    });
  }

  private setupDrag(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.drag = { down: true, moved: false, x: p.x, scroll: this.cameras.main.scrollX };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag.down || this.revealing) return;
      const dx = p.x - this.drag.x;
      if (Math.abs(dx) > 10) this.drag.moved = true;
      if (this.drag.moved) {
        this.cameras.main.scrollX = this.drag.scroll - dx;
        this.sync();
      }
    });
    this.input.on(
      'pointerup',
      (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        // Tapping empty map closes the card.
        if (!this.drag.moved && over.length === 0) this.closeCard();
        this.time.delayedCall(0, () => (this.drag.down = false));
      },
    );
  }

  private centerOn(x: number): void {
    const { width: W } = this.scale.gameSize;
    this.cameras.main.scrollX = Phaser.Math.Clamp(x - W * 0.5, 0, Math.max(0, WORLD_W - W));
  }

  private openCard(id: string): void {
    this.closeCard();
    const enc = ENCOUNTERS.find((e) => e.id === id)!;
    const done = progress.save.completed[id];
    const { width: W, height: H } = this.scale.gameSize;
    const cw = 560;
    const ch = 200;
    const y = H - this.insets.bottom - 100 - ch / 2;
    const bg = pixelBox(this, UI.panel, 0, 0, cw, ch);
    const title = this.add.text(-cw / 2 + 24, -ch / 2 + 18, enc.title, {
      fontFamily: FONT_TITLE,
      fontSize: '30px',
      fontStyle: 'bold',
      color: INK_TEXT,
    });
    const sub = this.add.text(-cw / 2 + 24, -ch / 2 + 62, `📖 ${enc.reference}`, {
      fontFamily: FONT_UI,
      fontSize: '20px',
      color: '#6b4a22',
    });
    const stars = this.add.text(
      -cw / 2 + 24,
      -ch / 2 + 98,
      done ? '★'.repeat(done.stars) + '☆'.repeat(3 - done.stars) : 'Not yet completed',
      {
        fontFamily: FONT_UI,
        fontSize: done ? '28px' : '20px',
        color: done ? '#b07d00' : '#8a6a3a',
      },
    );
    this.beginBtn = new Button(this, cw / 2 - 110, 18, {
      width: 180,
      height: 72,
      radius: 36,
      label: done ? 'Play again' : 'Begin',
      fontSize: 26,
      fill: 0x27ae60,
      onTap: () => this.begin(id),
    });
    this.card = this.add.container(W / 2, y, [bg, title, sub, stars, this.beginBtn]).setDepth(60);
    pinToScreen(this.card);
    this.cardId = id;
    this.sync();
  }

  private closeCard(): void {
    this.card?.destroy();
    this.card = undefined;
    this.cardId = null;
    this.beginBtn = undefined;
    this.sync();
  }

  private begin(id: string): void {
    this.registry.set('encounterId', id);
    this.registry.remove('collectedEnergy');
    this.cameras.main.fadeOut(200, 27, 21, 48);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('scripture'));
  }

  // ── Reveal ─────────────────────────────────────────────────────────────────

  /** Trail draws itself, the hero walks it, and the new location pops onto the map. */
  private async playReveals(ids: string[]): Promise<void> {
    this.revealing = true;
    this.sync();
    await wait(this, 400);
    for (const id of ids) {
      const i = MAP_NODES.findIndex((n) => n.id === id);
      const node = MAP_NODES[i]!;
      const g = this.trails.get(i);
      const { width: W } = this.scale.gameSize;
      const targetScroll = Phaser.Math.Clamp(node.x - W * 0.5, 0, Math.max(0, WORLD_W - W));
      await tweenAsync(this, {
        targets: this.cameras.main,
        scrollX: targetScroll,
        duration: 600,
        ease: 'Sine.inOut',
      });

      if (g && i > 0) {
        this.hero.loop('run');
        this.hero.face(node.x >= MAP_NODES[i - 1]!.x ? 1 : -1);
        const c = trailControl(i);
        const prev = MAP_NODES[i - 1]!;
        await new Promise<void>((resolve) => {
          this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 1400,
            ease: 'Sine.inOut',
            onUpdate: (t) => {
              const k = t.getValue() ?? 0;
              this.drawTrail(g, i, k);
              const p = bezier(prev, c, node, k);
              this.hero.setPosition(p.x - HERO_OFFSET_X * k, p.y + 18);
            },
            onComplete: () => resolve(),
          });
        });
        this.hero.loop('idle');
        this.hero.face(1);
      }

      const m = this.markers.get(id);
      if (m) {
        sfx.play('orbCollect');
        await tweenAsync(this, {
          targets: m.c,
          scale: 1,
          alpha: 1,
          duration: 420,
          ease: 'Back.out',
        });
      }
      progress.update((s) => markSeenOnMap(s, [id]));
    }
    this.revealing = false;
    this.sync();
  }

  // ── Test hooks ─────────────────────────────────────────────────────────────

  private sync(): void {
    const { width, height } = this.scale.gameSize;
    const cam = this.cameras.main;
    const targets: Record<string, { x: number; y: number }> = {};
    for (const [id, m] of this.markers) {
      const x = Math.round(m.node.x - cam.scrollX);
      if (x > 30 && x < width - 30 && m.c.scale > 0.9)
        targets[`stage:${id}`] = { x, y: Math.round(m.node.y + 10) };
    }
    targets['back'] = { x: Math.round(this.back.x), y: Math.round(this.back.y) };
    for (const [k, b] of this.menu) targets[k] = { x: Math.round(b.x), y: Math.round(b.y) };
    if (this.card && this.beginBtn) {
      targets['begin'] = {
        x: Math.round(this.card.x + this.beginBtn.x),
        y: Math.round(this.card.y + this.beginBtn.y),
      };
    }
    const states = nodeStates(progress.save, this.debug.unlockAll);
    updateTestState({
      gameWidth: width,
      gameHeight: height,
      targets,
      busy: this.revealing,
      map: states.map((s) => ({
        id: s.id,
        open: s.state !== 'hidden',
        state: s.state,
        stars: progress.save.completed[s.id]?.stars ?? 0,
      })),
      mapRevealing: this.revealing,
      mapCard: this.cardId,
    });
  }
}
