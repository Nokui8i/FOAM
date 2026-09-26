import sharp from "sharp";

const BLANK =
  "preview-sections/ChatGPT Image Sep 25, 2026, 06_34_57 PM.png";
const DESK_BASE = "public/home-mockup-desktop-v21.png";
const DESK_OUT = "public/home-mockup-desktop-v24";
const MOB_BASE = "public/home-mockup-mobile-v18.png";
const MOB_OUT = "public/home-mockup-mobile-v21";

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
  const meta = await sharp(DESK_BASE).metadata();
  const w = meta.width;
  const panel = Math.round(meta.height / 6);
  const y0 = panel * 4;
  const fade = Math.round(panel * 0.09);
  const top = y0 - fade;
  const span = panel + fade * 2;

  const rgba = Buffer.alloc(w * span * 4, 255);

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

  const composed = await sharp(DESK_BASE)
    .composite([{ input: overlay, top, left: 0 }])
    .png({ compressionLevel: 6 })
    .toBuffer();

  await sharp(composed).png().toFile(`${DESK_OUT}.png`);
  await sharp(composed)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(`${DESK_OUT}.jpg`);
  console.log("desktop v24", { w, panel, top, span, fade });
}

async function buildMobile() {
  const meta = await sharp(MOB_BASE).metadata();
  const w = meta.width;
  const start = 9561;
  const end = 11869;
  const band = end - start;
  const fade = Math.round(band * 0.07);
  const top = start - fade;
  const span = band + fade * 2;

  const blankMeta = await sharp(BLANK).metadata();
  // Fit blank width; keep aspect, then cover the pricing band
  const targetH = band;
  const rgba = Buffer.alloc(w * span * 4, 255);

  const art = await sharp(BLANK)
    .resize(w, targetH, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  stamp(rgba, w, art.data, w, targetH, 0, fade);
  applyEdgeFade(rgba, w, span, fade, fade);

  const overlay = await sharp(rgba, {
    raw: { width: w, height: span, channels: 4 },
  })
    .png()
    .toBuffer();

  const composed = await sharp(MOB_BASE)
    .composite([{ input: overlay, top, left: 0 }])
    .png({ compressionLevel: 6 })
    .toBuffer();

  await sharp(composed).png().toFile(`${MOB_OUT}.png`);
  await sharp(composed)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(`${MOB_OUT}.jpg`);
  console.log("mobile v21", { w, top, span, fade, blankMeta });
}

await buildDesktop();
await buildMobile();
console.log("done");
