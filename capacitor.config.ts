/**
 * Capacitor Android Porting Configuration
 * Ready for `npx cap add android && npm run build && npx cap sync android`
 */
const config = {
  appId: 'com.proarena.eightballpool',
  appName: '8 Ball Pool Master',
  webDir: 'dist',
  bundledWebRuntime: false,
  backgroundColor: '#020617',
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#020617',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#020617',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020617',
      overlaysWebView: true,
    },
  },
};

export default config;
