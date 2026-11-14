import Phaser from 'phaser';

/** Promise wrappers so battle sequencing reads top to bottom. Both respect scene time scale. */
export function tweenAsync(
  scene: Phaser.Scene,
  config: Phaser.Types.Tweens.TweenBuilderConfig,
): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({ ...config, onComplete: () => resolve() });
  });
}

export function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise((resolve) => scene.time.delayedCall(ms, resolve));
}

/** Pixel font (Pixelify Sans, OFL, bundled via @fontsource and loaded in main.ts) for all UI text. */
export const FONT_PIXEL = '"Pixelify Sans", system-ui, sans-serif';
export const FONT_UI = FONT_PIXEL;
export const FONT_TITLE = FONT_PIXEL;
/** Plain, easy-to-read face for text a child must read closely (questions and answers). */
export const FONT_READ = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** The verse as it scrolls past: a warm book face (Palatino on iOS and macOS, Noto Serif on Android). */
export const FONT_VERSE =
  '"Palatino Linotype", Palatino, "Iowan Old Style", "Book Antiqua", "Noto Serif", Georgia, serif';
