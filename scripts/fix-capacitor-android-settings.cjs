/**
 * Capacitor generates broken relative paths when the repo is reached via
 * the C:\FOAM junction (Hebrew Desktop path). Point modules at the ASCII
 * junction so Gradle never walks `../../Users/.../שולחן העבודה/...`.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const settingsPath = path.join(root, "android", "capacitor.settings.gradle");
if (!fs.existsSync(settingsPath)) {
  console.log("skip: android/capacitor.settings.gradle missing");
  process.exit(0);
}

// Prefer the ASCII junction when present (Gradle safe).
const foamRoot = fs.existsSync("C:\\FOAM\\package.json") ? "C:/FOAM" : root.replace(/\\/g, "/");

const src = fs.readFileSync(settingsPath, "utf8");
const fixed = src.replace(
  /project\('([^']+)'\)\.projectDir = new File\(['"][^'"]*node_modules\/((?:@capacitor(?:-firebase)?\/[^'"]+))['"]\)/g,
  `project('$1').projectDir = new File('${foamRoot}/node_modules/$2')`
);

if (fixed !== src) {
  fs.writeFileSync(settingsPath, fixed);
  console.log(`patched android/capacitor.settings.gradle → ${foamRoot}/node_modules`);
} else {
  console.log("android/capacitor.settings.gradle already clean");
}
