const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "assets");
const publicDir = path.join(__dirname, "..", "public");

const iconCandidates = [
  path.join(outDir, "ops-icon-source.png"),
  path.join(publicDir, "foam-ops-app-icon.png"),
  path.join(publicDir, "ChatGPT Image Oct 1, 2026, 11_27_16 AM.png"),
];

const splashCandidates = [
  path.join(outDir, "ops-splash-source.png"),
  path.join(publicDir, "foam-ops-splash.png"),
  path.join(publicDir, "ChatGPT Image Oct 1, 2026, 11_39_35 AM.png"),
];

fs.mkdirSync(outDir, { recursive: true });

function firstExisting(paths) {
  return paths.find((p) => fs.existsSync(p));
}

async function main() {
  const iconSrc = firstExisting(iconCandidates);
  const splashSrc = firstExisting(splashCandidates);
  if (!iconSrc) throw new Error("OPS icon source missing");
  if (!splashSrc) throw new Error("OPS splash source missing");

  const iconStable = path.join(outDir, "ops-icon-source.png");
  const splashStable = path.join(outDir, "ops-splash-source.png");
  if (path.resolve(iconSrc) !== path.resolve(iconStable)) {
    fs.copyFileSync(iconSrc, iconStable);
  }
  if (path.resolve(splashSrc) !== path.resolve(splashStable)) {
    fs.copyFileSync(splashSrc, splashStable);
  }
  fs.copyFileSync(iconStable, path.join(publicDir, "foam-ops-app-icon.png"));
  fs.copyFileSync(splashStable, path.join(publicDir, "foam-ops-splash.png"));

  const size = 1024;
  const square = await sharp(iconStable)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  for (const name of [
    "logo.png",
    "icon.png",
    "logo-dark.png",
    "icon-only.png",
    "icon-foreground.png",
  ]) {
    await sharp(square).toFile(path.join(outDir, name));
  }

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: "#1a8cff",
    },
  })
    .png()
    .toFile(path.join(outDir, "icon-background.png"));

  // Splash: exact art centered on black (phone letterbox).
  // 2048 keeps APK smaller while still looking sharp on phones.
  const canvas = 2048;
  const fitted = await sharp(splashStable)
    .resize(canvas, canvas, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await sharp(fitted).toFile(path.join(outDir, "splash.png"));
  await sharp(fitted).toFile(path.join(outDir, "splash-dark.png"));

  for (const f of fs.readdirSync(outDir)) {
    const s = fs.statSync(path.join(outDir, f));
    console.log(`${f}\t${s.size}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
