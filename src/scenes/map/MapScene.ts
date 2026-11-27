import Phaser from 'phaser';
import { pixelBox, UI } from '../ui/pixelUi';

/** Parchment tint for the pixel name plates. */
const PLATE = 0xfff0c8;
import { ENCOUNTERS, isBuilt } from '../../content';
import type { DebugParams } from '../../core/debugParams';
import { unlockAllOn } from '../quickTest';
import {
  bezier,
  childrenOf,
  choosingPath,
  dashedCurve,
  focusNode,
  mapNode,
  mapUnlocked,
  newlyRevealed,
  nodeStates,
  nodesOn,
  parentOf,
  signpostsOn,
  startMap,
  trailControl,
  unlockedMaps,
  worldMap,
  WORLD_H,
  type MapId,
  type MapNode,
  type NodeState,
  type WorldMap,
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
 * and the hero walking along it. At a fork both paths appear and a sign asks the player to
 * choose one. Drag to pan; tap a location for its card.
 *
 * There is one map per part of the story (core/map/worldMap.ts). A later map opens when a
 * location on an earlier one is won: a signpost appears there, and a button at the top left
 * switches between the maps the player has opened. The shown map is kept in the registry
 * (`mapId`), so coming back from a passage returns to its map.
 */
export class MapScene extends Phaser.Scene {
  private debug!: DebugParams;
  private mapId: MapId = 'genesis';
  private world!: WorldMap;
  private signposts = new Map<MapId, Phaser.GameObjects.Container>();
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private markers = new Map<string, Marker>();
  private trails = new Map<string, Phaser.GameObjects.Graphics>();
  private choiceSign?: Phaser.GameObjects.Container;
  private hero!: HeroSprite;
  private card?: Phaser.GameObjects.Container;
  private cardId: string | null = null;
  private beginBtn?: Button;
  private hud: Phaser.GameObjects.GameObject[] = [];
  private menu = new Map<string, Button>();
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
    this.choiceSign = undefined;
    this.menu = new Map();
    this.hud = [];
    this.card = undefined;
    this.cardId = null;
    this.revealing = false;
    this.signposts = new Map();

    const save = progress.save;
    const unlockAll = this.unlockAll();
    const want = (this.registry.get('mapId') as MapId | undefined) ?? this.debug.map;
    this.mapId =
      want && mapUnlocked(save, want, unlockAll) ? want : startMap(save, unlockAll, isBuilt);
    this.registry.set('mapId', this.mapId);
    this.world = worldMap(this.mapId);
    const nodes = nodesOn(this.mapId);

    const { width: W, height: H } = this.scale.gameSize;
    this.insets = toGameInsets(readSafeAreaInsets(), W, this.scale.displaySize.width);
    const mapH = Math.max(WORLD_H, H);
    this.cameras.main.setBounds(0, 0, this.world.width, mapH);

    const states = new Map(nodeStates(save, unlockAll, isBuilt).map((s) => [s.id, s.state]));
    // Animate a single reveal or the paths of one fork; big jumps (like ?unlockAll) just appear.
    const here = new Set(nodes.map((n) => n.id));
    const fresh = newlyRevealed(save, unlockAll, isBuilt).filter((id) => here.has(id));
    const forkOf = (id: string) => mapNode(id)?.after;
    const animate =
      fresh.length === 1 || (fresh.length === 2 && forkOf(fresh[0]!) === forkOf(fresh[1]!))
        ? fresh
        : [];
    if (animate.length === 0 && fresh.length > 0) progress.update((s) => markSeenOnMap(s, fresh));

    this.drawParchment(mapH);
    if (this.mapId === 'egypt') this.drawEgypt();
    else this.drawGenesis();
    this.drawRegions();

    for (const node of nodes) {
      if (!node.after || states.get(node.id) === 'hidden') continue;
      const g = this.add.graphics();
      this.trails.set(node.id, g);
      if (!animate.includes(node.id)) this.drawTrail(g, node, 1);
    }
    for (const node of nodes) {
      const state = states.get(node.id)!;
      if (state === 'hidden') continue;
      const m = this.makeMarker(node, state);
      if (animate.includes(node.id)) m.c.setScale(0).setAlpha(0);
      this.markers.set(node.id, m);
    }

    // Hero stands at the furthest location (or, before a reveal, at the one before it).
    const focus = focusNode(save, unlockAll, this.mapId, isBuilt);
    const firstNew = animate.length > 0 ? mapNode(animate[0]!) : undefined;
    // A signpost to a map the player hasn't visited yet: the hero waits beside it.
    const newPost = signpostsOn(save, this.mapId, unlockAll).find(
      (m) => !save.seenOnMap.includes(nodesOn(m.id)[0]!.id),
    );
    const start =
      (firstNew && parentOf(firstNew)) ??
      (newPost && !unlockAll ? mapNode(newPost.opensAfter!) : undefined) ??
      focus;
    this.hero = new HeroSprite(this, start.x - HERO_OFFSET_X, start.y + 18)
      .setScale(HERO_SCALE * 0.75)
      .setDepth(20);
    this.hero.loop('idle');
    this.centerOn(start.x);

    this.choiceSign = this.makeChoiceSign();
    this.choiceSign?.setAlpha(animate.length > 1 ? 0 : 1);
    for (const m of signpostsOn(save, this.mapId, unlockAll)) this.makeSignpost(m);
    this.buildHud(W, H);
    this.setupDrag();

    updateTestState({
      ready: true,
      scene: 'map',
      battle: null,
      scripture: null,
      mapId: this.mapId,
    });
    this.sync();
    if (animate.length > 0) void this.playReveals(animate);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private drawParchment(mapH: number): void {
    const w = this.world.width;
    const rng = createRng(7);
    const g = this.add.graphics();
    g.fillStyle(PAPER, 1).fillRect(0, 0, w, mapH);
    // Stains and uneven tone.
    const tones = [0xd6b574, 0xeed9a8, 0xc7a263, 0xdcc089];
    for (let i = 0; i < 220; i++) {
      g.fillStyle(tones[i % tones.length]!, 0.07 + rng.next() * 0.12);
      g.fillCircle(rng.next() * w, rng.next() * mapH, 30 + rng.next() * 170);
    }
    // Fold creases.
    for (let x = 600; x < w; x += 600) {
      g.lineStyle(3, 0xffffff, 0.12).lineBetween(x, 0, x, mapH);
      g.lineStyle(2, 0x8a6a3a, 0.12).lineBetween(x + 3, 0, x + 3, mapH);
    }
    g.lineStyle(3, 0xffffff, 0.12).lineBetween(0, mapH / 2, w, mapH / 2);
    // Burnt, darkened edges.
    const burnt = 0x4a2a0c;
    const band = 110;
    g.fillGradientStyle(burnt, burnt, burnt, burnt, 0.75, 0, 0.75, 0).fillRect(0, 0, band, mapH);
    g.fillGradientStyle(burnt, burnt, burnt, burnt, 0, 0.75, 0, 0.75).fillRect(
      w - band,
      0,
      band,
      mapH,
    );
    g.fillGradientStyle(burnt, burnt, burnt, burnt, 0.7, 0.7, 0, 0).fillRect(0, 0, w, band);
    g.fillGradientStyle(burnt, burnt, burnt, burnt, 0, 0, 0.7, 0.7).fillRect(
      0,
      mapH - band,
      w,
      band,
    );
    for (let i = 0; i < 40; i++) {
      const edge = rng.int(0, 3);
      const t = rng.next();
      const x = edge === 0 ? 0 : edge === 1 ? w : t * w;
      const y = edge === 2 ? 0 : edge === 3 ? mapH : t * mapH;
      g.fillStyle(0x2e1806, 0.25 + rng.next() * 0.25).fillCircle(x, y, 20 + rng.next() * 50);
    }
  }

  /** Genesis 1–11: the Deep, Eden, the flood waters, Ararat and Shinar. */
  private drawGenesis(): void {
    const rng = createRng(11);
    const g = this.add.graphics();

    // The Deep: dark waters on the west, where creation begins.
    g.fillStyle(0x7f9a98, 0.3).fillEllipse(300, 330, 600, 560);
    g.fillStyle(0x5f7c7c, 0.2).fillEllipse(240, 300, 400, 380);
    g.lineStyle(2, 0x3f5a5a, 0.35);
    for (let i = 0; i < 30; i++)
      this.wave(g, 60 + rng.next() * 520, 120 + rng.next() * 440, 26 + rng.next() * 18);

    // Rivers through Eden.
    g.lineStyle(9, 0x7f9aa0, 0.45);
    this.river(g, [1400, 0], [1370, 160], [1450, 300], [1400, 450], [1480, 720]);
    g.lineStyle(3, 0xd8e2dc, 0.45);
    this.river(g, [1400, 0], [1370, 160], [1450, 300], [1400, 450], [1480, 720]);
    g.lineStyle(6, 0x7f9aa0, 0.35);
    this.river(g, [1450, 300], [1560, 260], [1700, 280], [1760, 200]);

    // Garden of Eden: tree clusters.
    for (let i = 0; i < 80; i++)
      this.tree(g, 1150 + rng.next() * 700, 200 + rng.next() * 420, 0.7 + rng.next() * 0.5);

    // The wilderness outside Eden: thorny scrub.
    g.lineStyle(2, 0x5a4022, 0.45);
    for (let i = 0; i < 60; i++) this.thorn(g, 1980 + rng.next() * 320, 380 + rng.next() * 260);

    // Flood waters along Noah's path.
    g.fillStyle(0x7f9a98, 0.25).fillEllipse(3000, 250, 560, 300);
    g.lineStyle(2, 0x3f5a5a, 0.3);
    for (let i = 0; i < 24; i++) this.wave(g, 2760 + rng.next() * 480, 130 + rng.next() * 240, 22);

    // Mountains of Ararat, where the ark comes to rest.
    const peaks: [number, number, number][] = [];
    for (let i = 0; i < 20; i++)
      peaks.push([3150 + rng.next() * 760, 480 + rng.next() * 90, 40 + rng.next() * 36]);
    peaks.sort((a, b) => a[1] - b[1]).forEach(([x, y, s]) => this.mountain(g, x, y, s));

    // The plain of Shinar, with brick kilns' smoke and a half-built tower.
    this.tower(g, 2760, 590);

    this.hills(g, rng, 70, 400, this.world.width - 650);
    this.compass(g, 560, 630);
  }

  /**
   * Joseph in Egypt: the hills of Canaan in the north-west, the caravan road south, the Nile with
   * its pyramids, the storehouses, and the green fields of Goshen along the bottom.
   */
  private drawEgypt(): void {
    const rng = createRng(37);
    const g = this.add.graphics();

    // Canaan: olive trees on the hills in the north-west.
    for (let i = 0; i < 26; i++)
      this.tree(g, 140 + rng.next() * 420, 90 + rng.next() * 230, 0.6 + rng.next() * 0.4);

    // The desert road: dunes between Canaan and Egypt.
    g.lineStyle(2, 0x9a7440, 0.45);
    for (let i = 0; i < 34; i++) this.dune(g, 560 + rng.next() * 460, 90 + rng.next() * 240);

    // The Nile runs from top to bottom, with marsh reeds along its banks.
    const nile: [number, number][] = [
      [2240, 0],
      [2320, 160],
      [2260, 330],
      [2360, 520],
      [2300, 720],
    ];
    g.lineStyle(26, 0x7f9aa0, 0.4);
    this.river(g, ...nile);
    g.lineStyle(8, 0xd8e2dc, 0.4);
    this.river(g, ...nile);
    g.lineStyle(2, 0x5f7a3a, 0.5);
    for (let i = 0; i < 40; i++) this.reed(g, 2180 + rng.next() * 260, 40 + rng.next() * 640);

    // Pyramids on the far bank.
    for (const [x, y, s] of [
      [2640, 420, 40],
      [2720, 432, 30],
      [2580, 436, 22],
    ] as const)
      this.pyramid(g, x, y, s);

    // The storehouses: domed granaries in rows.
    for (let i = 0; i < 9; i++) this.granary(g, 3500 + (i % 5) * 60, 424 - Math.floor(i / 5) * 36);

    // Goshen: green fields and canals along the bottom, toward the delta.
    g.fillStyle(0x7f9a4a, 0.22).fillEllipse(1100, 560, 2000, 300);
    g.lineStyle(4, 0x7f9aa0, 0.35);
    this.river(g, [2300, 640], [1700, 660], [1100, 630], [400, 670]);
    for (let i = 0; i < 30; i++)
      this.tree(g, 160 + rng.next() * 1900, 480 + rng.next() * 190, 0.5 + rng.next() * 0.3);

    this.hills(g, rng, 50, 300, this.world.width - 500);
    this.compass(g, 4560, 630);
  }

  /** Low ink hills scattered across the open land. */
  private hills(
    g: Phaser.GameObjects.Graphics,
    rng: ReturnType<typeof createRng>,
    n: number,
    x0: number,
    span: number,
  ): void {
    g.lineStyle(2, 0x8a6a3a, 0.35);
    for (let i = 0; i < n; i++) {
      const x = x0 + rng.next() * span;
      const y = 140 + rng.next() * 520;
      g.beginPath()
        .arc(x, y, 18, Math.PI * 1.1, Math.PI * 1.9)
        .strokePath();
    }
  }

  private drawRegions(): void {
    for (const r of this.world.regions) {
      this.add
        .text(r.x, r.y, r.name, { fontFamily: FONT_TITLE, fontSize: '34px', color: '#6b4a22' })
        .setOrigin(0.5)
        .setAlpha(0.55)
        .setLetterSpacing(8);
    }
  }

  private dune(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.beginPath()
      .arc(x, y + 14, 22, Math.PI * 1.15, Math.PI * 1.85)
      .strokePath();
  }

  private reed(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.lineBetween(x, y, x - 3, y - 12).lineBetween(x + 3, y, x + 5, y - 10);
  }

  private pyramid(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
    g.fillStyle(0xd9b878, 0.9).fillTriangle(x - s, y, x, y - s * 0.9, x + s, y);
    g.fillStyle(0xa98448, 0.75).fillTriangle(x, y - s * 0.9, x + s, y, x + s * 0.15, y);
    g.lineStyle(2, INK, 0.5).strokeTriangle(x - s, y, x, y - s * 0.9, x + s, y);
  }

  /** A domed mud-brick grain store. */
  private granary(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0xc9a46a, 0.85).fillRect(x - 18, y - 20, 36, 20);
    g.fillStyle(0xd6b574, 0.9)
      .slice(x, y - 20, 18, Math.PI, 0, false)
      .fillPath();
    g.lineStyle(2, INK, 0.45).strokeRect(x - 18, y - 20, 36, 20);
    g.beginPath()
      .arc(x, y - 20, 18, Math.PI, 0, false)
      .strokePath();
  }

  /** A stepped, unfinished tower in ink, for the plain of Shinar. */
  private tower(g: Phaser.GameObjects.Graphics, x: number, base: number): void {
    const tiers = [120, 92, 66, 42];
    let y = base;
    tiers.forEach((w, i) => {
      const h = 26;
      g.fillStyle(i % 2 ? 0xb8925a : 0xc9a46a, 0.85).fillRect(x - w / 2, y - h, w, h);
      g.lineStyle(2, INK, 0.5).strokeRect(x - w / 2, y - h, w, h);
      y -= h;
    });
    // Ragged top: the building stopped.
    g.lineStyle(2, INK, 0.5)
      .lineBetween(x - 21, y, x - 8, y - 10)
      .lineBetween(x - 8, y - 10, x + 6, y);
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

  private drawTrail(g: Phaser.GameObjects.Graphics, node: MapNode, progressK: number): void {
    const a = parentOf(node) ?? node;
    g.clear().lineStyle(4, TRAIL, 0.85);
    for (const [x1, y1, x2, y2] of dashedCurve(a, trailControl(node), node, progressK))
      g.lineBetween(x1, y1, x2, y2);
  }

  /** A signpost at the fork while the player has not started either path yet. */
  private makeChoiceSign(): Phaser.GameObjects.Container | undefined {
    const unlockAll = this.unlockAll();
    if (!choosingPath(progress.save, unlockAll, this.mapId)) return undefined;
    const fork = focusNode(progress.save, unlockAll, this.mapId);
    const names = childrenOf(fork.id)
      .map((k) => this.world.paths.find((p) => p.ids[0] === k.id)?.name)
      .filter((n): n is string => !!n);
    const title = this.add
      .text(0, -14, 'Choose your path', {
        fontFamily: FONT_TITLE,
        fontSize: '24px',
        fontStyle: 'bold',
        color: INK_TEXT,
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(0, 16, names.join('  or  '), {
        fontFamily: FONT_UI,
        fontSize: '17px',
        color: '#6b4a22',
      })
      .setOrigin(0.5);
    const w = Math.max(title.width, sub.width) + 40;
    const plate = pixelBox(this, UI.button, 0, 0, w, 74).setTint(PLATE);
    const post = this.add.rectangle(0, 58, 10, 50, 0x6b4a22).setStrokeStyle(2, INK);
    // Above the fork, clear of the hero who waits there and of the neighbouring name plates.
    return this.add.container(fork.x + 20, fork.y - 230, [post, plate, title, sub]).setDepth(15);
  }

  /**
   * A signpost to the next map, standing past the location that opens it. It bobs until the
   * player has visited that map.
   */
  private makeSignpost(to: WorldMap): void {
    const p = to.signpost!;
    const title = this.add
      .text(0, -12, `To ${to.short}`, {
        fontFamily: FONT_TITLE,
        fontSize: '22px',
        fontStyle: 'bold',
        color: INK_TEXT,
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(0, 14, 'Tap to travel ▶', { fontFamily: FONT_UI, fontSize: '16px', color: '#6b4a22' })
      .setOrigin(0.5);
    const w = Math.max(title.width, sub.width) + 36;
    const plate = pixelBox(this, UI.button, 0, 0, w, 66).setTint(PLATE);
    const post = this.add.rectangle(0, 56, 10, 48, 0x6b4a22).setStrokeStyle(2, INK);
    const hit = this.add.rectangle(0, 10, w, 110, 0x000000, 0).setInteractive();
    hit.on('pointerup', () => {
      if (this.drag.moved || this.revealing) return;
      sfx.play('uiTap');
      this.switchTo(to.id);
    });
    const c = this.add.container(p.x, p.y, [post, plate, title, sub, hit]).setDepth(15);
    const first = nodesOn(to.id)[0]!;
    if (!progress.save.seenOnMap.includes(first.id) && !this.debug.freeze)
      this.tweens.add({ targets: c, y: p.y - 10, duration: 600, yoyo: true, repeat: -1 });
    this.signposts.set(to.id, c);
  }

  private switchTo(id: MapId): void {
    this.registry.set('mapId', id);
    this.cameras.main.fadeOut(200, 27, 21, 48);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
  }

  private unlockAll(): boolean {
    return this.debug.unlockAll || unlockAllOn();
  }

  private makeMarker(node: MapNode, state: NodeState): Marker {
    if (state === 'soon') return this.makeSoonMarker(node);
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

  /** A location whose passage isn't written yet: a faded medallion that can't be opened. */
  private makeSoonMarker(node: MapNode): Marker {
    const c = this.add.container(node.x, node.y).setDepth(10).setAlpha(0.6);
    const shadow = this.add.ellipse(3, 30, 56, 14, 0x000000, 0.15);
    const ring = this.add.circle(0, 0, 28, 0xb89a68).setStrokeStyle(3, INK, 0.6);
    const inner = this.add.circle(0, 0, 22, 0xe8d6a8).setStrokeStyle(2, 0xb08a4a, 0.6);
    const icon = this.add.text(0, 1, node.icon, { fontSize: '24px' }).setOrigin(0.5).setAlpha(0.5);
    const label = this.add
      .text(0, 50, 'Coming soon', {
        fontFamily: FONT_TITLE,
        fontSize: '16px',
        fontStyle: 'italic',
        color: INK_TEXT,
      })
      .setOrigin(0.5);
    c.add([shadow, ring, inner, icon, label]);
    return { node, state: 'soon', c };
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
        .text(W / 2, ins.top + 41, this.world.title, {
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

    // With more than one map open, a button at the top left goes to the next one.
    const maps = unlockedMaps(progress.save, this.unlockAll());
    if (maps.length > 1) {
      const next = maps[(maps.indexOf(this.mapId) + 1) % maps.length]!;
      const b = fixed(
        new Button(this, ins.left + 24 + 110, ins.top + 41, {
          width: 220,
          height: 56,
          radius: 28,
          label: `🗺️ ${worldMap(next).short}`,
          fontSize: 19,
          fill: 0x6b4a22,
          onTap: () => !this.revealing && this.switchTo(next),
        }),
      );
      this.menu.set('mapSwitch', b);
    }

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
    this.cameras.main.scrollX = Phaser.Math.Clamp(
      x - W * 0.5,
      0,
      Math.max(0, this.world.width - W),
    );
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
    this.registry.set('mapId', this.mapId);
    this.registry.remove('collectedEnergy');
    this.cameras.main.fadeOut(200, 27, 21, 48);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('scripture'));
  }

  // ── Reveal ─────────────────────────────────────────────────────────────────

  /**
   * Trail draws itself, the hero walks it, and the new location pops onto the map. At a fork
   * every path's trail draws at once, the hero waits where they split, and the sign appears.
   */
  private async playReveals(ids: string[]): Promise<void> {
    this.revealing = true;
    this.sync();
    await wait(this, 400);
    const nodes = ids.map((id) => mapNode(id)!);
    const fork = nodes.length > 1;
    const { width: W } = this.scale.gameSize;
    const midX = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
    await tweenAsync(this, {
      targets: this.cameras.main,
      scrollX: Phaser.Math.Clamp(midX - W * 0.5, 0, Math.max(0, this.world.width - W)),
      duration: 600,
      ease: 'Sine.inOut',
    });

    const withTrail = nodes.filter((n) => this.trails.has(n.id) && parentOf(n));
    if (withTrail.length > 0) {
      const walker = fork ? undefined : withTrail[0];
      if (walker) {
        this.hero.loop('run');
        this.hero.face(walker.x >= parentOf(walker)!.x ? 1 : -1);
      }
      await new Promise<void>((resolve) => {
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 1400,
          ease: 'Sine.inOut',
          onUpdate: (t) => {
            const k = t.getValue() ?? 0;
            for (const n of withTrail) this.drawTrail(this.trails.get(n.id)!, n, k);
            if (walker) {
              const p = bezier(parentOf(walker)!, trailControl(walker), walker, k);
              this.hero.setPosition(p.x - HERO_OFFSET_X * k, p.y + 18);
            }
          },
          onComplete: () => resolve(),
        });
      });
      this.hero.loop('idle');
      this.hero.face(1);
    }

    sfx.play('orbCollect');
    const pops = ids.map((id) => this.markers.get(id)?.c).filter((c) => !!c);
    if (pops.length > 0)
      await tweenAsync(this, {
        targets: pops,
        scale: 1,
        alpha: 1,
        duration: 420,
        ease: 'Back.out',
      });
    if (this.choiceSign)
      await tweenAsync(this, { targets: this.choiceSign, alpha: 1, duration: 350 });
    progress.update((s) => markSeenOnMap(s, ids));
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
    for (const [k, b] of this.menu) targets[k] = { x: Math.round(b.x), y: Math.round(b.y) };
    for (const [id, c] of this.signposts) {
      const x = Math.round(c.x - cam.scrollX);
      if (x > 30 && x < width - 30) targets[`signpost:${id}`] = { x, y: Math.round(c.y + 10) };
    }
    if (this.card && this.beginBtn) {
      targets['begin'] = {
        x: Math.round(this.card.x + this.beginBtn.x),
        y: Math.round(this.card.y + this.beginBtn.y),
      };
    }
    const states = nodeStates(progress.save, this.unlockAll(), isBuilt);
    updateTestState({
      mapId: this.mapId,
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
      mapChoosing: !!this.choiceSign,
    });
  }
}
