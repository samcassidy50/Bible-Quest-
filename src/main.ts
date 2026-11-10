import Phaser from 'phaser';
import { COLORS, DESIGN_HEIGHT, DESIGN_WIDTH, TEST_HOOKS_ENABLED } from './config';
import { parseDebugParams, type DebugParams } from './core/debugParams';
import { randomSeed } from './core/rng';
import { initPlatform, onAppActiveChange, platformName } from './services/platform';
import { updateTestState } from './services/testHooks';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';

async function start(): Promise<void> {
  await initPlatform();

  const debug: DebugParams = TEST_HOOKS_ENABLED
    ? parseDebugParams(window.location.search)
    : { fast: false, freeze: false, fps: false };
  const seed = debug.seed ?? randomSeed();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.background,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    scale: {
      mode: Phaser.Scale.EXPAND, // fills 19.5:9 phones without letterboxing
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: { antialias: true, roundPixels: false },
    fps: { target: 60 },
    input: { activePointers: 2 },
    scene: [BootScene, TitleScene],
    callbacks: {
      preBoot: (g) => {
        g.registry.set('debug', debug);
        g.registry.set('seed', seed);
        if (debug.fast) g.registry.set('timeScale', 10);
      },
    },
  });

  updateTestState({ platform: platformName(), seed });

  await onAppActiveChange((active) => {
    if (active) game.resume();
    else game.pause();
    updateTestState({ paused: !active });
  });
}

void start();
