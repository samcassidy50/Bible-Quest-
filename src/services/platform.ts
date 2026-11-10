import { Capacitor } from '@capacitor/core';

/** Native-only setup. Every call is guarded so the web build and tests work without native plugins. */
export async function initPlatform(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // System bars are hidden natively before the WebView loads (Android: MainActivity immersive
  // mode, iOS: Info.plist UIStatusBarHidden). Hiding them from JS resizes the window after layout.
  // Orientation is also locked natively; this call is a backup.
  const { ScreenOrientation } = await import('@capacitor/screen-orientation');
  await ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => undefined);
}

export async function hideSplash(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { SplashScreen } = await import('@capacitor/splash-screen');
  await SplashScreen.hide();
}

/** Calls the handler when the app goes to the background (calls, home button) or returns. */
export async function onAppActiveChange(handler: (active: boolean) => void): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { App } = await import('@capacitor/app');
    await App.addListener('appStateChange', ({ isActive }) => handler(isActive));
  } else {
    document.addEventListener('visibilitychange', () => handler(!document.hidden));
  }
}

export function platformName(): string {
  return Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
}
