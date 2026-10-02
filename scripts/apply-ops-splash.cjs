const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const src = path.join(
  __dirname,
  "..",
  "public",
  "ChatGPT Image Oct 1, 2026, 11_39_35 AM.png"
);
const layer = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@android:color/black"/>
    <item>
        <bitmap
            android:gravity="fill"
            android:src="@drawable/splash_art"
            android:antialias="true"/>
    </item>
</layer-list>
`;

const sizes = {
  drawable: [1080, 1920],
  "drawable-port-mdpi": [320, 568],
  "drawable-port-hdpi": [480, 854],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [1080, 1920],
  "drawable-port-xxxhdpi": [1080, 1920],
};

async function main() {
  if (!fs.existsSync(src)) throw new Error("missing splash source: " + src);
  fs.copyFileSync(src, path.join(__dirname, "..", "public", "foam-ops-splash.png"));
  fs.copyFileSync(src, path.join(__dirname, "..", "assets", "ops-splash-source.png"));

  for (const [dir, [w, h]] of Object.entries(sizes)) {
    const out = path.join(__dirname, "..", "android", "app", "src", "main", "res", dir);
    fs.mkdirSync(out, { recursive: true });
    for (const f of fs.readdirSync(out)) {
      if (f.startsWith("splash")) fs.unlinkSync(path.join(out, f));
    }
    const buf = await sharp(src)
      .resize(w, h, { fit: "cover", position: "centre" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    fs.writeFileSync(path.join(out, "splash_art.jpg"), buf);
    fs.writeFileSync(path.join(out, "splash.xml"), layer);
    console.log(dir, buf.length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
