import Phaser from 'phaser';
import type { Setting } from '../../core/content/schema';
import { createRng, type Rng } from '../../core/rng';

/** Width of the repeating parallax tiles. */
const T = 1024;
const FAR_H = 300;
const MID_H = 280;
const GROUND_H = 320;
/**
 * Transparent rows under the far and middle layers. Tile sprites repeat vertically too, so a
 * solid bottom row would bleed a 1px seam onto the layer's top edge.
 */
const PAD = 4;

type G = Phaser.GameObjects.Graphics;
export type Weather = 'storm' | 'clearing';

interface Look {
  sky: [number, number, number]; // top, middle, horizon
}

const LOOKS: Record<string, Look> = {
  deep: { sky: [0x04050c, 0x0b1a26, 0x1d3c47] },
  light: { sky: [0x1d2b5a, 0x7a5a8e, 0xffc56b] },
  garden: { sky: [0x4f9fe0, 0x8cc8ef, 0xd9f2fb] },
  wilderness: { sky: [0x3b2a3a, 0x8a4a3a, 0xe0944e] },
  'flood-storm': { sky: [0x151a24, 0x2a3240, 0x4c5868] },
  'flood-clearing': { sky: [0x5f86b4, 0x9db8d4, 0xf6dcae] },
  babel: { sky: [0x3f74b8, 0x8fb4d8, 0xf8dca2] },
};

/** Draws `fn` at x and again one tile left/right when near an edge, so tiles repeat seamlessly. */
function wrapDraw(x: number, margin: number, fn: (x: number) => void): void {
  fn(x);
  if (x < margin) fn(x + T);
  if (x > T - margin) fn(x - T);
}

/** A smooth tileable ridge line: sum of sines whose periods divide the tile width. */
function ridge(
  g: G,
  color: number,
  alpha: number,
  base: number,
  amps: [number, number][],
  h: number,
  phase = 0,
): void {
  const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, h)];
  for (let x = 0; x <= T; x += 8) {
    let y = base;
    amps.forEach(([k, a], i) => (y -= a * Math.sin((2 * Math.PI * k * x) / T + phase + i)));
    pts.push(new Phaser.Math.Vector2(x, y));
  }
  pts.push(new Phaser.Math.Vector2(T, h));
  g.fillStyle(color, alpha).fillPoints(pts, true);
}

/**
 * Environment behind the reading and the battle (docs/DESIGN.md §2.1): a sky with its own light
 * and landmarks, three parallax layers that tile seamlessly, and small living effects.
 * All art is original and drawn in code.
 */
export class Backdrop {
  private readonly key: string;
  private readonly sky: G;
  private readonly landmarks: G;
  private readonly far: Phaser.GameObjects.TileSprite;
  private readonly mid: Phaser.GameObjects.TileSprite;
  private readonly ground: Phaser.GameObjects.TileSprite;
  private readonly fx: Phaser.GameObjects.Container;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private fxTimers: Phaser.Time.TimerEvent[] = [];
  private W = 0;
  private H = 0;
  private groundY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly setting: Setting,
    readonly weather: Weather | undefined,
    private readonly freeze = false,
  ) {
    this.key = setting === 'flood' ? `flood-${weather ?? 'storm'}` : setting;
    this.makeTextures();
    this.sky = scene.add.graphics().setDepth(-30);
    this.landmarks = scene.add.graphics().setDepth(-27);
    this.far = scene.add
      .tileSprite(0, 0, 10, FAR_H + PAD, `bd-${this.key}-far`)
      .setOrigin(0, 1)
      .setDepth(-28);
    this.mid = scene.add
      .tileSprite(0, 0, 10, MID_H + PAD, `bd-${this.key}-mid`)
      .setOrigin(0, 1)
      .setDepth(-26);
    this.ground = scene.add
      .tileSprite(0, 0, 10, GROUND_H, `bd-${this.key}-ground`)
      .setOrigin(0, 0)
      .setDepth(-25);
    this.fx = scene.add.container(0, 0).setDepth(-24);
    this.flash = scene.add.rectangle(0, 0, 10, 10, 0xffffff, 0).setOrigin(0).setDepth(-23);
  }

  /** Re-lays out every layer for the current screen size and ground line. */
  layout(W: number, H: number, groundY: number): void {
    this.W = W;
    this.H = H;
    this.groundY = groundY;
    this.drawSky();
    this.drawLandmarks();
    const gy = Math.round(groundY);
    this.far.setPosition(0, gy - 18 + PAD).setSize(W, FAR_H + PAD);
    this.mid.setPosition(0, gy + 12 + PAD).setSize(W, MID_H + PAD);
    this.ground.setPosition(0, gy - 14).setSize(W, Math.max(GROUND_H, H - gy + 14));
    this.flash.setSize(W, H);
    this.startFx();
  }

  /** Parallax: the ground moves fastest, distant layers slowest. */
  scroll(dt: number): void {
    this.far.tilePositionX += dt * 0.02;
    this.mid.tilePositionX += dt * 0.07;
    this.ground.tilePositionX += dt * 0.3;
  }

  destroy(): void {
    this.fxTimers.forEach((t) => t.remove());
    for (const o of [
      this.sky,
      this.landmarks,
      this.far,
      this.mid,
      this.ground,
      this.fx,
      this.flash,
    ])
      o.destroy();
  }

  // ── Sky and landmarks (not tiled) ──────────────────────────────────────────

  private drawSky(): void {
    const { W, groundY: gy } = this;
    const [top, middle, horizon] = LOOKS[this.key]!.sky;
    const g = this.sky.clear();
    g.fillGradientStyle(top, top, middle, middle, 1).fillRect(0, 0, W, gy * 0.55);
    g.fillGradientStyle(middle, middle, horizon, horizon, 1).fillRect(
      0,
      gy * 0.55 - 1,
      W,
      gy * 0.45 + 40,
    );

    const rng = createRng(3);
    switch (this.key) {
      case 'deep':
        // Soft light hovering over the waters.
        for (let r = 140; r > 0; r -= 14)
          g.fillStyle(0xfff3c4, 0.05).fillCircle(W * 0.56, gy * 0.42, r);
        g.fillStyle(0xfffbe6, 0.5).fillCircle(W * 0.56, gy * 0.42, 10);
        break;
      case 'light': {
        // Darkness to the west giving way to dawn; the sun rising in the east.
        g.fillGradientStyle(0x050812, 0x050812, 0x050812, 0x050812, 0.75, 0, 0.75, 0).fillRect(
          0,
          0,
          W * 0.5,
          gy + 40,
        );
        for (let i = 0; i < 40; i++)
          g.fillStyle(0xffffff, 0.4 + rng.next() * 0.5).fillCircle(
            rng.next() * W * 0.35,
            rng.next() * gy * 0.6,
            1 + rng.next() * 1.5,
          );
        const sx = W * 0.64;
        const sy = gy - 30;
        for (let r = 260; r > 90; r -= 20) g.fillStyle(0xffe08a, 0.06).fillCircle(sx, sy, r);
        g.fillStyle(0xfff3c0, 1).fillCircle(sx, sy, 88);
        g.fillStyle(0xffffff, 0.6).fillCircle(sx, sy, 60);
        break;
      }
      case 'garden':
        g.fillStyle(0xfff6c8, 0.9).fillCircle(W * 0.82, gy * 0.22, 44);
        for (let r = 120; r > 44; r -= 16)
          g.fillStyle(0xfff6c8, 0.06).fillCircle(W * 0.82, gy * 0.22, r);
        break;
      case 'wilderness':
        for (let r = 200; r > 60; r -= 20)
          g.fillStyle(0xffb070, 0.07).fillCircle(W * 0.3, gy - 50, r);
        g.fillStyle(0xffc08a, 0.85).fillCircle(W * 0.3, gy - 50, 58);
        g.fillStyle(0x8a4a3a, 0.35).fillRect(0, gy - 70, W, 18); // haze bands
        g.fillStyle(0x8a4a3a, 0.25).fillRect(0, gy - 110, W, 12);
        break;
      case 'flood-storm':
        for (let i = 0; i < 26; i++) {
          const x = rng.next() * W;
          const y = rng.next() * gy * 0.45;
          g.fillStyle(i % 2 ? 0x0e121a : 0x232b38, 0.75).fillEllipse(
            x,
            y,
            220 + rng.next() * 260,
            70 + rng.next() * 60,
          );
        }
        break;
      case 'flood-clearing':
        for (let i = 0; i < 14; i++) {
          const x = rng.next() * W;
          const y = rng.next() * gy * 0.35;
          g.fillStyle(0xe8edf2, 0.55).fillEllipse(
            x,
            y,
            180 + rng.next() * 200,
            50 + rng.next() * 40,
          );
        }
        g.fillStyle(0xfff6c8, 0.9).fillCircle(W * 0.18, gy * 0.25, 40);
        break;
      case 'babel':
        for (let r = 150; r > 50; r -= 16)
          g.fillStyle(0xfff4d0, 0.07).fillCircle(W * 0.2, gy * 0.24, r);
        g.fillStyle(0xfffbe8, 1).fillCircle(W * 0.2, gy * 0.24, 46);
        break;
    }
  }

  private drawLandmarks(): void {
    const { W, groundY: gy } = this;
    const g = this.landmarks.clear();
    if (this.key === 'flood-clearing') {
      // Rainbow over the calming water.
      const bands = [0xe74c3c, 0xf39c12, 0xf1c40f, 0x2ecc71, 0x3498db, 0x5b4bd8, 0x8e44ad];
      const cx = W * 0.58;
      const cy = gy + 40;
      bands.forEach((c, i) => {
        g.lineStyle(14, c, 0.42)
          .beginPath()
          .arc(cx, cy, 380 - i * 13, Math.PI, 0)
          .strokePath();
      });
    }
    if (this.setting === 'flood') {
      // A great wooden ship on the water.
      const x = W * 0.8;
      const y = gy - 26;
      const s = 1;
      g.fillStyle(0x5a3a1e, 1).fillPoints(
        [
          new Phaser.Math.Vector2(x - 170 * s, y - 40),
          new Phaser.Math.Vector2(x + 170 * s, y - 40),
          new Phaser.Math.Vector2(x + 135 * s, y + 10),
          new Phaser.Math.Vector2(x - 135 * s, y + 10),
        ],
        true,
      );
      g.lineStyle(2, 0x2e1c0c, 0.8);
      for (let k = 0; k < 3; k++)
        g.lineBetween(x - 160 + k * 6, y - 30 + k * 14, x + 160 - k * 6, y - 30 + k * 14);
      g.fillStyle(0x6e4a28, 1).fillRect(x - 110, y - 82, 220, 42);
      g.fillStyle(0x4a2e14, 1).fillTriangle(x - 124, y - 82, x + 124, y - 82, x, y - 118);
      g.fillStyle(0x2e1c0c, 1).fillRect(x - 12, y - 70, 24, 22);
    }
    if (this.setting === 'babel') {
      // A tall stepped tower of brick reaching toward the sky.
      const x = W * 0.72;
      const base = gy - 10;
      const tiers = 7;
      for (let i = 0; i < tiers; i++) {
        const w = 300 - i * 38;
        const h = 44;
        const y = base - (i + 1) * h;
        g.fillStyle(i % 2 ? 0xa86a3c : 0x9a5e32, 1).fillRect(x - w / 2, y, w, h);
        g.lineStyle(2, 0x5a3418, 0.6).strokeRect(x - w / 2, y, w, h);
        g.lineStyle(1, 0x5a3418, 0.35);
        for (let bx = x - w / 2 + 14; bx < x + w / 2; bx += 22)
          g.lineBetween(bx, y + 4, bx, y + h - 4);
        g.fillStyle(0x3a2210, 0.8).fillRect(x - 8, y + 14, 16, 22);
      }
      g.lineStyle(6, 0x8a5430, 1).lineBetween(x - 150, base, x + 30, base - 3 * 44); // ramp
      // Scaffolding at the unfinished top.
      g.lineStyle(3, 0x6b4423, 0.9);
      const topY = base - tiers * 44;
      g.lineBetween(x - 40, topY, x - 40, topY - 60)
        .lineBetween(x + 40, topY, x + 40, topY - 50)
        .lineBetween(x - 50, topY - 40, x + 50, topY - 40);
    }
  }

  // ── Tiled layers ───────────────────────────────────────────────────────────

  private makeTextures(): void {
    if (this.scene.textures.exists(`bd-${this.key}-far`)) return;
    const rng = createRng(this.key.length * 97 + 13);
    const make = (name: string, h: number, draw: (g: G, rng: Rng) => void) => {
      const g = this.scene.make.graphics({}, false);
      draw(g, rng);
      g.generateTexture(`bd-${this.key}-${name}`, T, h);
      g.destroy();
    };
    make('far', FAR_H + PAD, (g, r) => this.drawFar(g, r));
    make('mid', MID_H + PAD, (g, r) => this.drawMid(g, r));
    make('ground', GROUND_H, (g, r) => this.drawGround(g, r));
  }

  private drawFar(g: G, rng: Rng): void {
    const h = FAR_H;
    switch (this.key) {
      case 'deep':
        ridge(
          g,
          0x0c2129,
          1,
          h - 70,
          [
            [2, 18],
            [5, 8],
          ],
          h,
        );
        ridge(
          g,
          0x10303a,
          1,
          h - 40,
          [
            [3, 12],
            [7, 6],
          ],
          h,
          1,
        );
        break;
      case 'light':
        ridge(
          g,
          0x3c3260,
          1,
          h - 120,
          [
            [2, 60],
            [5, 25],
            [9, 10],
          ],
          h,
        );
        ridge(
          g,
          0x55447a,
          1,
          h - 70,
          [
            [3, 30],
            [7, 14],
          ],
          h,
          2,
        );
        break;
      case 'garden':
        ridge(
          g,
          0x9fcfb0,
          1,
          h - 110,
          [
            [2, 40],
            [4, 18],
          ],
          h,
        );
        ridge(
          g,
          0x7bbf8c,
          1,
          h - 60,
          [
            [3, 26],
            [6, 10],
          ],
          h,
          1.5,
        );
        break;
      case 'wilderness': {
        // Flat-topped mesas.
        ridge(g, 0x7a4a3a, 0.6, h - 50, [[4, 8]], h);
        for (let i = 0; i < 5; i++) {
          const x = i * (T / 5) + rng.next() * 80;
          const w = 120 + rng.next() * 90;
          const top = h - 120 - rng.next() * 70;
          wrapDraw(x, w, (xx) =>
            g
              .fillStyle(0x6b3e30, 1)
              .fillRect(xx, top, w, h - top)
              .fillTriangle(xx - 30, h, xx, top, xx, h)
              .fillTriangle(xx + w, top, xx + w + 30, h, xx + w, h),
          );
        }
        break;
      }
      case 'flood-storm':
        ridge(
          g,
          0x232c38,
          1,
          h - 90,
          [
            [2, 40],
            [5, 16],
          ],
          h,
        );
        ridge(
          g,
          0x2b4655,
          1,
          h - 34,
          [
            [6, 6],
            [11, 4],
          ],
          h,
          1,
        ); // floodwater covering the land
        break;
      case 'flood-clearing':
        ridge(
          g,
          0x6f8f86,
          1,
          h - 90,
          [
            [2, 36],
            [5, 14],
          ],
          h,
        );
        ridge(
          g,
          0x6a9ab0,
          1,
          h - 34,
          [
            [6, 4],
            [11, 2],
          ],
          h,
          1,
        );
        break;
      case 'babel':
        ridge(
          g,
          0xe6c48c,
          1,
          h - 70,
          [
            [2, 26],
            [5, 10],
          ],
          h,
        );
        ridge(
          g,
          0xd8b07a,
          1,
          h - 40,
          [
            [3, 16],
            [7, 6],
          ],
          h,
          2,
        );
        break;
    }
  }

  private drawMid(g: G, rng: Rng): void {
    const h = MID_H;
    switch (this.key) {
      case 'deep':
        ridge(
          g,
          0x123540,
          1,
          h - 60,
          [
            [4, 14],
            [9, 7],
            [15, 3],
          ],
          h,
        );
        g.lineStyle(2, 0x3f7684, 0.55);
        for (let i = 0; i < 26; i++) {
          const x = rng.next() * T;
          const y = h - 70 + rng.next() * 50;
          wrapDraw(x, 30, (xx) =>
            g
              .beginPath()
              .arc(xx, y, 14, Math.PI * 1.1, Math.PI * 1.9)
              .strokePath(),
          );
        }
        break;
      case 'light':
        ridge(
          g,
          0x6e5a36,
          1,
          h - 70,
          [
            [3, 26],
            [6, 10],
          ],
          h,
        );
        g.lineStyle(3, 0xf2c46a, 0.6);
        for (let x = 0; x < T; x += 6) {
          const y =
            h -
            70 -
            26 * Math.sin((2 * Math.PI * 3 * x) / T) -
            10 * Math.sin((2 * Math.PI * 6 * x) / T + 1);
          g.lineBetween(x, y, x + 6, y);
        }
        break;
      case 'garden':
        ridge(
          g,
          0x56a85e,
          1,
          h - 40,
          [
            [3, 12],
            [7, 6],
          ],
          h,
        );
        for (let i = 0; i < 9; i++) {
          const x = (i + rng.next() * 0.6) * (T / 9);
          const s = 0.8 + rng.next() * 0.5;
          wrapDraw(x, 80, (xx) => this.fruitTree(g, xx, h - 30, s, rng));
        }
        break;
      case 'wilderness':
        ridge(
          g,
          0x8a5a36,
          1,
          h - 34,
          [
            [4, 8],
            [9, 4],
          ],
          h,
        );
        for (let i = 0; i < 6; i++) {
          const x = (i + rng.next() * 0.6) * (T / 6);
          wrapDraw(x, 90, (xx) => this.deadTree(g, xx, h - 30, 0.8 + rng.next() * 0.5));
        }
        for (let i = 0; i < 14; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 30, (xx) => this.thornBush(g, xx, h - 28, 0x4a2e1a));
        }
        break;
      case 'flood-storm':
        ridge(
          g,
          0x2a4a5c,
          1,
          h - 60,
          [
            [4, 22],
            [9, 10],
            [15, 5],
          ],
          h,
        );
        g.fillStyle(0xd8e4ea, 0.55);
        for (let i = 0; i < 18; i++) {
          const x = rng.next() * T;
          const y = h - 72 + rng.next() * 30;
          wrapDraw(x, 30, (xx) => g.fillEllipse(xx, y, 34, 7));
        }
        break;
      case 'flood-clearing':
        ridge(
          g,
          0x5a8fa6,
          1,
          h - 46,
          [
            [4, 6],
            [9, 3],
          ],
          h,
        );
        g.fillStyle(0xffffff, 0.5);
        for (let i = 0; i < 30; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 10, (xx) => g.fillRect(xx, h - 46 + rng.next() * 40, 8, 2));
        }
        break;
      case 'babel':
        ridge(g, 0xcf9f68, 1, h - 30, [[3, 8]], h);
        for (let i = 0; i < 10; i++) {
          const x = (i + rng.next() * 0.5) * (T / 10);
          const w = 50 + rng.next() * 50;
          const bh = 40 + rng.next() * 70;
          wrapDraw(x, w, (xx) => {
            g.fillStyle(i % 2 ? 0xb07a4a : 0xa06c3e, 1).fillRect(xx, h - 30 - bh, w, bh);
            g.fillStyle(0x5a3418, 0.7)
              .fillRect(xx + w * 0.3, h - 30 - bh + 12, 8, 12)
              .fillRect(xx + w * 0.62, h - 30 - bh + 12, 8, 12);
            g.lineStyle(2, 0x6b4423, 0.6).strokeRect(xx, h - 30 - bh, w, bh);
          });
        }
        break;
    }
  }

  private drawGround(g: G, rng: Rng): void {
    const h = GROUND_H;
    const band = (top: number, edge: number, rest: number) => {
      g.fillStyle(rest, 1).fillRect(0, 0, T, h);
      g.fillStyle(edge, 1).fillRect(0, 0, T, top);
    };
    switch (this.key) {
      case 'deep':
        band(14, 0x33424a, 0x1b2327);
        for (let i = 0; i < 40; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 40, (xx) =>
            g
              .fillStyle(0x2a363c, 1)
              .fillEllipse(
                xx,
                30 + rng.next() * (h - 40),
                40 + rng.next() * 60,
                10 + rng.next() * 12,
              ),
          );
        }
        g.fillStyle(0x5b8a96, 0.25);
        for (let i = 0; i < 16; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 40, (xx) => g.fillEllipse(xx, 40 + rng.next() * 120, 70, 8)); // wet sheen
        }
        break;
      case 'light':
        band(12, 0xd8b878, 0xb89a62);
        for (let i = 0; i < 50; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 10, (xx) => this.grassTuft(g, xx, 20 + rng.next() * (h - 30), 0x8a8a3a));
        }
        break;
      case 'garden': {
        band(12, 0x7fd06e, 0x5aa954);
        for (let i = 0; i < 40; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 10, (xx) => this.grassTuft(g, xx, 18 + rng.next() * (h - 30), 0x3f8a3f));
        }
        const petals = [0xff8fb1, 0xffffff, 0xffd84a, 0xc49bff];
        for (let i = 0; i < 60; i++) {
          const x = rng.next() * T;
          const c = petals[i % petals.length]!;
          wrapDraw(x, 8, (xx) => g.fillStyle(c, 1).fillCircle(xx, 16 + rng.next() * (h - 30), 3.5));
        }
        break;
      }
      case 'wilderness':
        band(10, 0xb07a46, 0x9a6a3e);
        g.lineStyle(2, 0x5a3a20, 0.7);
        for (let i = 0; i < 40; i++) {
          let x = rng.next() * T;
          let y = 20 + rng.next() * (h - 40);
          for (let k = 0; k < 4; k++) {
            const nx = x + (rng.next() - 0.5) * 40;
            const ny = y + 6 + rng.next() * 12;
            const a = x;
            const b = y;
            wrapDraw(a, 50, (xx) => g.lineBetween(xx, b, xx + (nx - a), ny));
            x = nx;
            y = ny;
          }
        }
        for (let i = 0; i < 16; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 20, (xx) => this.thistle(g, xx, 30 + rng.next() * (h - 60)));
        }
        break;
      case 'flood-storm':
        band(12, 0x5a4a38, 0x45382a);
        g.fillStyle(0x6f8a96, 0.4);
        for (let i = 0; i < 22; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 40, (xx) =>
            g.fillEllipse(xx, 30 + rng.next() * (h - 40), 60 + rng.next() * 50, 9),
          );
        }
        break;
      case 'flood-clearing':
        band(12, 0x8fae5a, 0x6f8c48);
        for (let i = 0; i < 40; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 10, (xx) => this.grassTuft(g, xx, 20 + rng.next() * (h - 30), 0x4f6e34));
        }
        g.fillStyle(0xa8c8d8, 0.4);
        for (let i = 0; i < 10; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 40, (xx) => g.fillEllipse(xx, 40 + rng.next() * 120, 70, 8));
        }
        break;
      case 'babel':
        band(10, 0xead0a0, 0xe0bf86);
        g.lineStyle(2, 0xc49c62, 0.5);
        for (let i = 0; i < 30; i++) {
          const x = rng.next() * T;
          const y = 20 + rng.next() * (h - 40);
          wrapDraw(x, 30, (xx) =>
            g
              .beginPath()
              .arc(xx, y, 20, Math.PI * 1.15, Math.PI * 1.85)
              .strokePath(),
          );
        }
        for (let i = 0; i < 26; i++) {
          const x = rng.next() * T;
          wrapDraw(x, 20, (xx) => {
            const y = 26 + rng.next() * (h - 50);
            g.fillStyle(0xa4552e, 1).fillRect(xx, y, 22, 10);
            g.lineStyle(1, 0x5a2a14, 0.7).strokeRect(xx, y, 22, 10);
          });
        }
        break;
    }
  }

  private fruitTree(g: G, x: number, base: number, s: number, rng: Rng): void {
    g.fillStyle(0x6b4423, 1).fillRect(x - 7 * s, base - 70 * s, 14 * s, 70 * s);
    const leaves = [0x3f9b4a, 0x4fb058, 0x369044];
    for (let k = 0; k < 5; k++) {
      g.fillStyle(leaves[k % 3]!, 1).fillCircle(
        x + (k - 2) * 18 * s,
        base - 90 * s - (k % 2) * 20 * s,
        32 * s,
      );
    }
    for (let k = 0; k < 6; k++) {
      g.fillStyle(k % 2 ? 0xe74c3c : 0xf4c95d, 1).fillCircle(
        x + (rng.next() - 0.5) * 80 * s,
        base - 80 * s - rng.next() * 50 * s,
        4.5 * s,
      );
    }
  }

  private deadTree(g: G, x: number, base: number, s: number): void {
    g.lineStyle(9 * s, 0x3a2a20, 1).lineBetween(x, base, x - 6 * s, base - 90 * s);
    g.lineStyle(5 * s, 0x3a2a20, 1)
      .lineBetween(x - 4 * s, base - 60 * s, x - 40 * s, base - 95 * s)
      .lineBetween(x - 5 * s, base - 75 * s, x + 30 * s, base - 110 * s)
      .lineBetween(x - 6 * s, base - 90 * s, x - 14 * s, base - 125 * s);
    g.lineStyle(3 * s, 0x3a2a20, 1).lineBetween(
      x + 18 * s,
      base - 95 * s,
      x + 40 * s,
      base - 100 * s,
    );
  }

  private thornBush(g: G, x: number, base: number, color: number): void {
    g.lineStyle(2, color, 0.9);
    for (let k = -3; k <= 3; k++) {
      g.lineBetween(x, base, x + k * 6, base - 18 + Math.abs(k) * 2);
      g.lineBetween(
        x + k * 6,
        base - 18 + Math.abs(k) * 2,
        x + k * 6 + 3,
        base - 22 + Math.abs(k) * 2,
      );
    }
  }

  private thistle(g: G, x: number, y: number): void {
    g.lineStyle(2, 0x5a6a3a, 1).lineBetween(x, y, x, y - 22);
    g.lineBetween(x, y - 10, x - 7, y - 16).lineBetween(x, y - 14, x + 7, y - 20);
    g.fillStyle(0x6a7a3a, 1).fillCircle(x, y - 24, 5);
    g.fillStyle(0x9b5ab8, 1).fillTriangle(x - 5, y - 26, x + 5, y - 26, x, y - 34);
  }

  private grassTuft(g: G, x: number, y: number, color: number): void {
    g.lineStyle(2, color, 0.9)
      .lineBetween(x, y, x - 4, y - 8)
      .lineBetween(x, y, x, y - 10)
      .lineBetween(x, y, x + 4, y - 8);
  }

  // ── Living effects ─────────────────────────────────────────────────────────

  private startFx(): void {
    this.fxTimers.forEach((t) => t.remove());
    this.fxTimers = [];
    this.fx.removeAll(true);
    const { W, groundY: gy } = this;
    const rng = createRng(21);
    const add = <O extends Phaser.GameObjects.GameObject>(o: O) => {
      this.fx.add(o);
      return o;
    };
    const loop = (targets: object, props: Record<string, unknown>) => {
      if (!this.freeze) {
        this.scene.tweens.add({
          ...props,
          targets,
          repeat: -1,
        } as Phaser.Types.Tweens.TweenBuilderConfig);
      }
    };

    switch (this.key) {
      case 'deep':
        for (let i = 0; i < 6; i++) {
          const m = add(
            this.scene.add.ellipse(
              rng.next() * W,
              gy - 40 - rng.next() * 80,
              360,
              60,
              0xcfe3ea,
              0.06,
            ),
          );
          loop(m, {
            x: m.x + 160,
            duration: 9000 + rng.next() * 6000,
            yoyo: true,
            ease: 'Sine.inOut',
          });
        }
        for (let i = 0; i < 14; i++) {
          const d = add(
            this.scene.add.circle(
              W * 0.56 + (rng.next() - 0.5) * 260,
              gy * 0.42 + rng.next() * 120,
              2,
              0xfff3c4,
              0.7,
            ),
          );
          loop(d, {
            y: d.y - 60,
            alpha: 0,
            duration: 3000 + rng.next() * 3000,
            delay: rng.next() * 2000,
          });
        }
        break;
      case 'light': {
        const rays = add(this.scene.add.container(W * 0.64, gy - 30));
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const r = this.scene.add
            .triangle(
              0,
              0,
              0,
              0,
              Math.cos(a - 0.06) * 600,
              Math.sin(a - 0.06) * 600,
              Math.cos(a + 0.06) * 600,
              Math.sin(a + 0.06) * 600,
              0xfff1b0,
              0.1,
            )
            .setOrigin(0, 0);
          rays.add(r);
        }
        loop(rays, { angle: 360, duration: 60000 });
        for (let i = 0; i < 16; i++) {
          const s = add(
            this.scene.add.star(
              W * 0.4 + rng.next() * W * 0.6,
              rng.next() * gy,
              4,
              1.5,
              5,
              0xfff6c8,
              0.8,
            ),
          );
          loop(s, {
            alpha: 0.1,
            duration: 800 + rng.next() * 1200,
            yoyo: true,
            delay: rng.next() * 1000,
          });
        }
        break;
      }
      case 'garden':
        for (let i = 0; i < 5; i++) {
          const c = add(
            this.scene.add.ellipse(
              rng.next() * W,
              40 + rng.next() * gy * 0.3,
              160 + rng.next() * 120,
              46,
              0xffffff,
              0.85,
            ),
          );
          loop(c, { x: c.x + W * 0.3, duration: 40000 + rng.next() * 20000, yoyo: true });
        }
        for (let i = 0; i < 6; i++) {
          const colors = [0xff8fb1, 0xffd84a, 0xc49bff];
          const b = add(this.scene.add.container(rng.next() * W, gy - 40 - rng.next() * 120));
          const wing = this.scene.add.ellipse(0, 0, 10, 14, colors[i % 3]!, 0.9);
          const wing2 = this.scene.add.ellipse(6, 0, 10, 14, colors[i % 3]!, 0.9);
          b.add([wing, wing2]);
          loop([wing, wing2], { scaleX: 0.2, duration: 160, yoyo: true });
          loop(b, {
            x: b.x + 120 - rng.next() * 240,
            y: b.y - 40,
            duration: 4000 + rng.next() * 3000,
            yoyo: true,
            ease: 'Sine.inOut',
          });
        }
        break;
      case 'wilderness':
        for (let i = 0; i < 18; i++) {
          const d = add(
            this.scene.add.circle(
              rng.next() * W,
              gy - rng.next() * 160,
              2 + rng.next() * 2,
              0xd9a066,
              0.5,
            ),
          );
          loop(d, {
            x: d.x - 300,
            y: d.y + 20,
            alpha: 0,
            duration: 4000 + rng.next() * 3000,
            delay: rng.next() * 3000,
          });
        }
        break;
      case 'flood-storm': {
        for (let i = 0; i < 70; i++) {
          const x = rng.next() * (W + 200);
          const y = rng.next() * this.H;
          const r = add(
            this.scene.add
              .line(0, 0, x, y, x - 10, y + 30, 0xb8c8d8, 0.45)
              .setOrigin(0, 0)
              .setLineWidth(1.5),
          );
          loop(r, { x: -80, y: this.H, duration: 700 + rng.next() * 400, delay: rng.next() * 700 });
        }
        if (!this.freeze) {
          const strike = () => {
            this.flash.setFillStyle(0xffffff, 0.35);
            this.scene.tweens.add({ targets: this.flash, fillAlpha: 0, duration: 400 });
            this.fxTimers.push(this.scene.time.delayedCall(3500 + rng.next() * 4000, strike));
          };
          this.fxTimers.push(this.scene.time.delayedCall(2500, strike));
        }
        break;
      }
      case 'flood-clearing':
        for (let i = 0; i < 18; i++) {
          const s = add(
            this.scene.add.star(rng.next() * W, gy + rng.next() * 30, 4, 1, 4, 0xffffff, 0.8),
          );
          loop(s, {
            alpha: 0,
            duration: 700 + rng.next() * 900,
            yoyo: true,
            delay: rng.next() * 1000,
          });
        }
        break;
      case 'babel':
        for (let i = 0; i < 12; i++) {
          const d = add(
            this.scene.add.circle(rng.next() * W, gy - rng.next() * 60, 2, 0xf3dcae, 0.6),
          );
          loop(d, {
            x: d.x + 200,
            alpha: 0,
            duration: 5000 + rng.next() * 3000,
            delay: rng.next() * 3000,
          });
        }
        break;
    }
  }
}
