import sharp from "sharp";

const BLANK =
  "preview-sections/ChatGPT Image Sep 25, 2026, 05_50_02 PM.png";

function applyEdgeFade(rgba, w, h, fadeTop, fadeBot) {
  for (let y = 0; y < h; y++) {
    let a = 255;
    if (fadeTop > 0 && y < fadeTop) a = Math.round(255 * (y / fadeTop));
    else if (fadeBot > 0 && y > h - 1 - fadeBot)
      a = Math.round(255 * ((h - 1 - y) / fadeBot));
    const row = y * w;
    for (let x = 0; x < w; x++) rgba[(row + x) * 4 + 3] = a;
  }
}

function stamp(dst, dw, src, sw, sh, left, top) {
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const si = (y * sw + x) * 4;
      const di = ((top + y) * dw + left + x) * 4;
      const a = src[si + 3] / 255;
      if (a <= 0) continue;
      dst[di] = Math.round(src[si] * a + dst[di] * (1 - a));
      dst[di + 1] = Math.round(src[si + 1] * a + dst[di + 1] * (1 - a));
      dst[di + 2] = Math.round(src[si + 2] * a + dst[di + 2] * (1 - a));
      dst[di + 3] = 255;
    }
  }
}

async function buildDesktop() {
  const deskBase = "public/home-mockup-desktop-v21.png";
  const meta = await sharp(deskBase).metadata();
  const w = meta.width;
  const panel = Math.round(meta.height / 6);
  const y0 = panel * 4;
  const fade = Math.round(panel * 0.09);
  const top = y0 - fade;
  const span = panel + fade * 2;

  const rgba = Buffer.alloc(w * span * 4, 255);
  for (let i = 0; i < w * span; i++) rgba[i * 4 + 3] = 255;

  const art = await sharp(BLANK)
    .resize(w, panel, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  stamp(rgba, w, art.data, w, panel, 0, fade);
  applyEdgeFade(rgba, w, span, fade, fade);

  const overlay = await sharp(rgba, {
    raw: { width: w, height: span, channels: 4 },
  })
    .png()
    .toBuffer();

  await sharp(deskBase)
    .composite([{ input: overlay, top, left: 0 }])
    .png({ compressionLevel: 6 })
    .toFile("public/home-mockup-desktop-v22.png");
  console.log("desktop v22", { top, span, fade });
}

async function buildMobile() {
  const mobBase = "public/home-mockup-mobile-v18.png";
  const meta = await sharp(mobBase).metadata();
  const w = meta.width;
  const start = 9561;
  const end = 11869;
  const band = end - start;
  const fade = Math.round(band * 0.07);
  const top = start - fade;
  const span = band + fade * 2;

  const blankMeta = await sharp(BLANK).metadata();
  const bh = Math.round(w * (blankMeta.height / blankMeta.width));

  const rgba = Buffer.alloc(w * span * 4, 255);
  for (let i = 0; i < w * span; i++) rgba[i * 4 + 3] = 255;

  const art = await sharp(BLANK)
    .resize(w, bh, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const topPad = fade + Math.round((band - bh) / 2);
  stamp(rgba, w, art.data, w, bh, 0, topPad);
  applyEdgeFade(rgba, w, span, fade, fade);

  const overlay = await sharp(rgba, {
    raw: { width: w, height: span, channels: 4 },
  })
    .png()
    .toBuffer();

  await sharp(mobBase)
    .composite([{ input: overlay, top, left: 0 }])
    .png({ compressionLevel: 6 })
    .toFile("public/home-mockup-mobile-v19.png");
  console.log("mobile v19", { top, span, fade, bh, topPad });
}

await buildDesktop();
await buildMobile();

await sharp("public/home-mockup-desktop-v22.png")
  .extract({ left: 0, top: 8640, width: 3840, height: 2160 })
  .png()
  .toFile("public/_panel4-new.png");
await sharp("public/home-mockup-mobile-v19.png")
  .extract({ left: 0, top: 9561, width: 1440, height: 2308 })
  .png()
  .toFile("public/_mpanel4-new.png");
await sharp("public/home-mockup-desktop-v22.png")
  .extract({ left: 0, top: 8460, width: 3840, height: 400 })
  .png()
  .toFile("public/_seam-new-top.png");
await sharp("public/home-mockup-desktop-v22.png")
  .extract({ left: 0, top: 10620, width: 3840, height: 400 })
  .png()
  .toFile("public/_seam-new-bot.png");
await sharp("public/home-mockup-mobile-v19.png")
  .extract({ left: 0, top: 9411, width: 1440, height: 300 })
  .png()
  .toFile("public/_mseam-new-top.png");
await sharp("public/home-mockup-mobile-v19.png")
  .extract({ left: 0, top: 11719, width: 1440, height: 300 })
  .png()
  .toFile("public/_mseam-new-bot.png");

console.log("done");
