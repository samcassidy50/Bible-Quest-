import Phaser from 'phaser';
import panelUrl from '../../assets/ui/panel.png';
import buttonUrl from '../../assets/ui/button.png';
import starUrl from '../../assets/ui/star.png';
import starEmptyUrl from '../../assets/ui/star-empty.png';

/**
 * Pixel UI pieces cut from a CraftPix free pack by scripts/art/process_ui.py (credits in
 * art/README.md), shown at the hero's 3x pixel size. Panels and buttons of any size are built by
 * tiling the source piece's frame edges (never stretching), so the frame stays crisp.
 */
export const UI_SCALE = 3;
export const UI = {
  panel: 'ui-panel',
  button: 'ui-button',
  star: 'ui-star',
  starEmpty: 'ui-star-empty',
} as const;

/** Frame widths of each tileable piece, in native pixels: left, top, right, bottom. */
const SLICES: Record<string, [number, number, number, number]> = {
  [UI.panel]: [14, 14, 14, 14],
  [UI.button]: [5, 4, 5, 5],
};

const URLS: Record<string, string> = {
  [UI.panel]: panelUrl,
  [UI.button]: buttonUrl,
  [UI.star]: starUrl,
  [UI.starEmpty]: starEmptyUrl,
};

/** Text colour on parchment. */
export const PIXEL_INK = '#4a2c12';

export function loadPixelUi(load: Phaser.Loader.LoaderPlugin): void {
  for (const [key, url] of Object.entries(URLS)) load.image(key, url);
}

export function useNearestFilterForUi(textures: Phaser.Textures.TextureManager): void {
  for (const key of Object.keys(URLS))
    if (textures.exists(key)) textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Builds (once per size) a texture of `piece` tiled to w x h native pixels. */
function tiledTexture(scene: Phaser.Scene, piece: string, w: number, h: number): string {
  const key = `${piece}-${w}x${h}`;
  const textures = scene.textures;
  if (textures.exists(key)) return key;
  const src = textures.get(piece).getSourceImage() as HTMLImageElement;
  const [l, t, r, b] = SLICES[piece]!;
  const sw = src.width;
  const sh = src.height;
  const canvas = textures.createCanvas(key, w, h)!;
  const ctx = canvas.getContext();
  ctx.imageSmoothingEnabled = false;
  const cols: [number, number, number, number][] = [
    [0, l, 0, l],
    [l, sw - r, l, w - r],
    [sw - r, sw, w - r, w],
  ];
  const rows: [number, number, number, number][] = [
    [0, t, 0, t],
    [t, sh - b, t, h - b],
    [sh - b, sh, h - b, h],
  ];
  for (const [sx0, sx1, dx0, dx1] of cols) {
    for (const [sy0, sy1, dy0, dy1] of rows) {
      const pw = sx1 - sx0;
      const ph = sy1 - sy0;
      for (let y = dy0; y < dy1; y += ph) {
        for (let x = dx0; x < dx1; x += pw) {
          const cw = Math.min(pw, dx1 - x);
          const ch = Math.min(ph, dy1 - y);
          ctx.drawImage(src, sx0, sy0, cw, ch, x, y, cw, ch);
        }
      }
    }
  }
  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/**
 * A pixel-art box about `width` x `height` design pixels (rounded to whole native pixels),
 * centred on (x, y) unless an origin is set. `piece` is UI.panel (parchment) or UI.button
 * (light grey, tint it).
 */
export function pixelBox(
  scene: Phaser.Scene,
  piece: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.Image {
  const [l, t, r, b] = SLICES[piece]!;
  const w = Math.max(l + r + 1, Math.round(width / UI_SCALE));
  const h = Math.max(t + b + 1, Math.round(height / UI_SCALE));
  return scene.add.image(x, y, tiledTexture(scene, piece, w, h)).setScale(UI_SCALE);
}
