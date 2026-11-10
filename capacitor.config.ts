import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.biblequest.app',
  appName: 'Bible Quest',
  webDir: 'dist',
  backgroundColor: '#1b1530',
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#1b1530' },
  },
  // Live reload against the Vite dev server:  CAP_SERVER_URL=http://<lan-ip>:5173 npx cap run ios
  ...(process.env.CAP_SERVER_URL
    ? { server: { url: process.env.CAP_SERVER_URL, cleartext: true } }
    : {}),
};

export default config;
