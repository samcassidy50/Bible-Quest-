import Phaser from 'phaser';
import { readSafeAreaInsets, toGameInsets, type Insets } from '../../services/safeArea';
import { Button } from '../ui/Button';
import { FONT_TITLE } from '../util';

/**
 * Shared background, heading and back button for the menu screens. Returns the safe insets.
 * `backData` is passed to the scene Back opens (needed when it is this scene, which otherwise
 * restarts with its current data).
 */
export function menuFrame(
  scene: Phaser.Scene,
  heading: string,
  backTo = 'map',
  backData?: object,
): { insets: Insets; back: Button } {
  const { width: W, height: H } = scene.scale.gameSize;
  const insets = toGameInsets(readSafeAreaInsets(), W, scene.scale.displaySize.width);
  scene.add
    .graphics()
    .fillGradientStyle(0x1b1340, 0x1b1340, 0x3d2a5c, 0x3d2a5c, 1)
    .fillRect(0, 0, W, H);
  scene.add
    .text(W / 2, insets.top + 22, heading, {
      fontFamily: FONT_TITLE,
      fontSize: '40px',
      fontStyle: 'bold',
      color: '#f4c95d',
      stroke: '#3a2a10',
      strokeThickness: 6,
    })
    .setOrigin(0.5, 0);
  const back = new Button(scene, insets.left + 24 + 65, insets.top + 50, {
    width: 130,
    height: 60,
    radius: 30,
    label: '‹ Back',
    fontSize: 22,
    fill: 0x2a2350,
    onTap: () => scene.scene.start(backTo, backData),
  });
  return { insets, back };
}

export const center = (o: { x: number; y: number }) => ({ x: Math.round(o.x), y: Math.round(o.y) });
