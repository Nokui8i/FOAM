import type { CapacitorConfig } from "@capacitor/cli";

/**
 * FOAM OPS — staff app (separate product from the public website).
 * Ships a local build of the OPS console; does NOT load foam-laundry-app.web.app.
 * Backend stays Firebase / Cloud Functions (shared with the website).
 */
const config: CapacitorConfig = {
  appId: "app.foam.ops",
  appName: "FOAM OPS",
  webDir: "out",
  server: {
    androidScheme: "https",
    appStartPath: "ops.html",
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com"],
    },
    SplashScreen: {
      // MUST stay 0 on Android 12+: any >0 uses the system icon splash.
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#000000",
      androidSplashResourceName: "splash",
      androidScaleType: "FIT_XY",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#050505",
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
};

export default config;
