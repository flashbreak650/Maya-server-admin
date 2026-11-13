import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.carromhub.app',
  appName: 'Carrom Hub',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      '*.firebaseapp.com',
      '*.googleapis.com',
      '*.google.com',
      '*.gstatic.com',
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
