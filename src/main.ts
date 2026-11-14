import Phaser from 'phaser';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import { COLORS, DESIGN_HEIGHT, DESIGN_WIDTH, TEST_HOOKS_ENABLED } from './config';
import { parseDebugParams, type DebugParams } from './core/debugParams';
import { randomSeed } from './core/rng';
import { initPlatform, onAppActiveChange, platformName } from './services/platform';
import { updateTestState } from './services/testHooks';
import { sfx } from './services/sfx';
import { progress } from './services/progress';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { BattleScene } from './scenes/battle/BattleScene';
import { ScriptureScene } from './scenes/scripture/ScriptureScene';
import { MapScene } from './scenes/map/MapScene';
import { UpgradesScene } from './scenes/menus/UpgradesScene';
import { JournalScene } from './scenes/menus/JournalScene';
import { SettingsScene } from './scenes/menus/SettingsScene';
import { HeroSelectScene } from './scenes/menus/HeroSelectScene';
import { AnimViewerScene } from './scenes/hero/AnimViewerScene';
import { SoundBoardScene } from './scenes/debug/SoundBoardScene';
import { BackdropViewerScene } from './scenes/debug/BackdropViewerScene';
import { FoeGalleryScene } from './scenes/debug/FoeGalleryScene';

async function start(): Promise<void> {
  await initPlatform();
  await progress.load();
  // Canvas text can't wait for a web font, so load the pixel font before any scene draws.
  await Promise.all([
    document.fonts.load('400 32px "Pixelify Sans"'),
    document.fonts.load('700 32px "Pixelify Sans"'),
  ]).catch(() => undefined);

  const debug: DebugParams = TEST_HOOKS_ENABLED
    ? parseDebugParams(window.location.search)
    : {
        fast: false,
        freeze: false,
        fps: false,
        narrationOff: false,
        autoCollect: false,
        unlockAll: false,
        oneShot: false,
      };
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
    scene: [
      BootScene,
      TitleScene,
      MapScene,
      UpgradesScene,
      JournalScene,
      SettingsScene,
      HeroSelectScene,
      ScriptureScene,
      BattleScene,
      AnimViewerScene,
      SoundBoardScene,
      BackdropViewerScene,
      FoeGalleryScene,
    ],
    callbacks: {
      preBoot: (g) => {
        g.registry.set('debug', debug);
        g.registry.set('seed', seed);
        if (debug.fast) g.registry.set('timeScale', 10);
      },
    },
  });

  // The sound manager exists once the game has booted.
  game.events.once(Phaser.Core.Events.READY, () => sfx.attach(game));
  updateTestState({ platform: platformName(), seed });

  await onAppActiveChange((active) => {
    if (active) game.resume();
    else game.pause();
    updateTestState({ paused: !active });
  });
}

void start();
