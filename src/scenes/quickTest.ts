import { TEST_HOOKS_ENABLED } from '../config';
import { progress } from '../services/progress';

/**
 * Quick test mode (Settings, dev builds only): foes fall in one hit and every reading shows
 * Skip. Never on in store builds, whatever the save says.
 */
export function quickTestOn(): boolean {
  return TEST_HOOKS_ENABLED && progress.save.settings.quickTest;
}
