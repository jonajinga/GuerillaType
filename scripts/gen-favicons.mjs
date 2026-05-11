/* Generate gorilla-face favicons from the brand source PNG.
   Crops the face tight, recolors to cream-on-navy (dark theme) and
   navy-on-cream (light theme), renders every size we ship.
   Run: node scripts/gen-favicons.mjs */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const imgDir = resolve(__dirname, "..", "src", "assets", "img");

// Tight face crop: the gorilla face fills nearly the entire square.
const FACE = { left: 780, top: 140, width: 180, height: 180 };

const CREAM     = [233, 227, 213]; // #e9e3d5 -- gorilla outline (dark theme)
const CREAM_DIM = [180, 174, 160];
const NAVY_DEEP = [12, 14, 22];    // #0c0e16 -- dark tile background
const NAVY_MID  = [30, 33, 44];    // #1e212c -- mid-shadow / face features
const CREAM_BG  = [232, 225, 209]; // light tile background
const NAVY_INK  = [20, 22, 30];    // gorilla outline (light theme)

const { data, info } = await sharp(resolve(imgDir, "Guerilla Type Favicon.png"))
  .extract(FACE)
  .raw().toBuffer({ resolveWithObject: true });

// Two recolor passes -- one for each theme.
const darkBuf  = Buffer.alloc(data.length);
const lightBuf = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  let dark, light;
  if (lum < 60)        { dark = CREAM;     light = NAVY_INK;  }
  else if (lum < 150)  { dark = CREAM_DIM; light = NAVY_MID;  }
  else if (lum < 220)  { dark = NAVY_MID;  light = CREAM_DIM; }
  else                 { dark = NAVY_DEEP; light = CREAM_BG;  }
  darkBuf[i]   = dark[0];  darkBuf[i+1]  = dark[1];  darkBuf[i+2]  = dark[2];  darkBuf[i+3]  = 255;
  lightBuf[i]  = light[0]; lightBuf[i+1] = light[1]; lightBuf[i+2] = light[2]; lightBuf[i+3] = 255;
}

const SIZES = [16, 32, 48, 64, 180, 192, 256, 512];

async function emit(buf, theme, bg, size) {
  const prefix = size === 180 ? "apple-touch-icon" : (size >= 192 ? "icon-face" : "favicon-face");
  const dim = size === 180 ? "" : "-" + size;
  const suffix = theme === "dark" ? "" : "-light";
  const out = resolve(imgDir, prefix + dim + suffix + ".png");
  await sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(size, size, { fit: "contain", background: { r: bg[0], g: bg[1], b: bg[2] } })
    .flatten({ background: { r: bg[0], g: bg[1], b: bg[2] } })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("  wrote", out);
}

console.log("Generating gorilla-face favicons (dark + light themes)...");
for (const sz of SIZES) {
  await emit(darkBuf,  "dark",  NAVY_DEEP, sz);
  await emit(lightBuf, "light", CREAM_BG,  sz);
}
console.log("Done.");
