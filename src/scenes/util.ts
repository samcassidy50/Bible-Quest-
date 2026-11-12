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

export const FONT_UI = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const FONT_TITLE = 'Georgia, "Times New Roman", serif';
/** The verse as it scrolls past: a warm book face (Palatino on iOS and macOS, Noto Serif on Android). */
export const FONT_VERSE =
  '"Palatino Linotype", Palatino, "Iowan Old Style", "Book Antiqua", "Noto Serif", Georgia, serif';
