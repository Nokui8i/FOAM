/**
 * Next.js 16 static export on Windows writes RSC segments as nested dirs:
 *   out/book/__next.book/__PAGE__.txt
 * but the client requests flat files:
 *   out/book/__next.book.__PAGE__.txt
 * Copy aliases so Firebase Hosting can serve them.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] || "out");

let created = 0;
let skipped = 0;
let missing = 0;

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("__next.")) {
        const pageFile = path.join(full, "__PAGE__.txt");
        const alias = path.join(dir, `${entry.name}.__PAGE__.txt`);
        if (fs.existsSync(pageFile)) {
          if (!fs.existsSync(alias)) {
            fs.copyFileSync(pageFile, alias);
            created += 1;
          } else {
            skipped += 1;
          }
        } else {
          missing += 1;
        }
      }
      walk(full);
    }
  }
}

if (!fs.existsSync(root)) {
  console.error(`[fix-rsc] missing output dir: ${root}`);
  process.exit(1);
}

walk(root);
console.log(
  `[fix-rsc] created=${created} skipped=${skipped} missing=${missing}`
);
