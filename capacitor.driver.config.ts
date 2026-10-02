import type { CapacitorConfig } from "@capacitor/cli";

/**
 * FOAM Driver — staff app (separate product from the public website).
 * Ships a local build of the Driver console; does NOT load the live customer site.
 */
const config: CapacitorConfig = {
  appId: "app.foam.driver",
  appName: "FOAM Driver",
  webDir: "out",
  server: {
    androidScheme: "https",
    appStartPath: "driver.html",
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
