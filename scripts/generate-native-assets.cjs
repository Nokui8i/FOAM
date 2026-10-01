const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const BG = "#050505";
const ACCENT = "#8fe5ff";
const outDir = path.join(__dirname, "..", "assets");

fs.mkdirSync(outDir, { recursive: true });

const iconSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${BG}"/>
  <circle cx="47" cy="17" r="8" fill="${ACCENT}"/>
  <path d="M18 16h25v8H28v7h13v8H28v13H18V16Z" fill="#fff"/>
</svg>`);

const iconOnlySvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
  <circle cx="47" cy="17" r="8" fill="${ACCENT}"/>
  <path d="M18 16h25v8H28v7h13v8H28v13H18V16Z" fill="#fff"/>
</svg>`);

const bgSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BG}"/>
</svg>`);

async function main() {
  await sharp(iconSvg).png().toFile(path.join(outDir, "logo.png"));
  await sharp(iconSvg).png().toFile(path.join(outDir, "icon.png"));
  await sharp(iconSvg).png().toFile(path.join(outDir, "logo-dark.png"));
  await sharp(iconOnlySvg).png().toFile(path.join(outDir, "icon-only.png"));
  await sharp(iconOnlySvg).png().toFile(path.join(outDir, "icon-foreground.png"));
  await sharp(bgSvg).png().toFile(path.join(outDir, "icon-background.png"));

  const logoPath = path.join(__dirname, "..", "public", "foam-ops-logo-on-dark.png");
  const logo = await sharp(logoPath)
    .resize(1600, 1600, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const meta = await sharp(logo).metadata();
  const w = meta.width || 1600;
  const h = meta.height || 400;
  const canvas = 2732;
  const left = Math.round((canvas - w) / 2);
  const top = Math.round((canvas - h) / 2);

  const splash = sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 3,
      background: BG,
    },
  }).composite([{ input: logo, left, top }]);

  await splash.clone().png().toFile(path.join(outDir, "splash.png"));
  await splash.clone().png().toFile(path.join(outDir, "splash-dark.png"));

  for (const f of fs.readdirSync(outDir)) {
    const s = fs.statSync(path.join(outDir, f));
    console.log(`${f}\t${s.size}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
