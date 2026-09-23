import sharp from "sharp";

async function punchBlack(src, dest) {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i] < 28 && out[i + 1] < 28 && out[i + 2] < 28) out[i + 3] = 0;
  }
  await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(dest);
}

await punchBlack(
  "preview-sections/whatsapp.png",
  "public/ops-icon-whatsapp.png"
);
await punchBlack("preview-sections/maps.png", "public/ops-icon-maps.png");

// call.png is solid black — draw a FOAM-blue phone mark
const phoneSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none">
  <path fill="#00a8d8" d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.4 21 3 13.6 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.02l-2.2 2.19z"/>
</svg>`;
await sharp(Buffer.from(phoneSvg)).png().toFile("public/ops-icon-call.png");
console.log("icons ready");
