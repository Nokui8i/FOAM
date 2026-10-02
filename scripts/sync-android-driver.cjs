/**
 * After `cap sync` updates `android/` (OPS), refresh `android-driver/`
 * Capacitor assets/plugins while keeping driver appId + package.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const opsAndroid = path.join(root, "android");
const driverAndroid = path.join(root, "android-driver");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function main() {
  if (!fs.existsSync(driverAndroid)) {
    console.error("android-driver missing — run staff android setup first");
    process.exit(1);
  }

  // Shared Capacitor plugin wiring + cordova plugins folder
  for (const rel of [
    "capacitor.settings.gradle",
    "capacitor-cordova-android-plugins",
  ]) {
    const from = path.join(opsAndroid, rel);
    const to = path.join(driverAndroid, rel);
    if (!fs.existsSync(from)) continue;
    if (fs.statSync(from).isDirectory()) {
      fs.rmSync(to, { recursive: true, force: true });
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }

  // Web assets + plugin registry from OPS sync, then overwrite driver config
  const opsAssets = path.join(opsAndroid, "app", "src", "main", "assets");
  const driverAssets = path.join(driverAndroid, "app", "src", "main", "assets");
  if (fs.existsSync(opsAssets)) {
    fs.rmSync(driverAssets, { recursive: true, force: true });
    copyDir(opsAssets, driverAssets);
  }

  const driverConfig = {
    appId: "app.foam.driver",
    appName: "FOAM Driver",
    webDir: "out",
    server: {
      androidScheme: "https",
      appStartPath: "driver.html",
    },
    android: { allowMixedContent: true },
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
      StatusBar: { style: "LIGHT", backgroundColor: "#050505" },
      Keyboard: { resizeOnFullScreen: true },
    },
  };
  fs.writeFileSync(
    path.join(driverAssets, "capacitor.config.json"),
    JSON.stringify(driverConfig, null, "\t")
  );

  // Keep driver build.gradle / MainActivity package intact — already set.
  console.log("android-driver assets refreshed for FOAM Driver (/driver)");
}

main();
