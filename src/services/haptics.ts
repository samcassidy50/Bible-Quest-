import { Capacitor } from '@capacitor/core';

/** Light haptic tap (orb collected, powered hit). No-op on web. */
export async function hapticTap(strong = false): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: strong ? ImpactStyle.Heavy : ImpactStyle.Light });
  } catch {
    // Haptics are a nice-to-have; ignore devices without a vibration motor.
  }
}
