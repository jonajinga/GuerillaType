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

// ── Red gorilla favicon ───────────────────────────────────────
// Recolors only the OPAQUE pixels of the source image to a red
// palette and trims the canvas tight around the gorilla so it
// fills the favicon at every output size. Background stays fully
// transparent -- the OS / browser draws whatever tab color it
// likes underneath. */
console.log("Generating red gorilla favicon (tight crop, transparent bg)...");
const RED_DEEP = [162, 58, 42];   // #a23a2a -- primary accent
const RED_MID  = [201, 90, 64];
const RED_DIM  = [225, 165, 145];

const fullRaw = await sharp(resolve(imgDir, "Guerilla Type Favicon.png"))
  .raw().toBuffer({ resolveWithObject: true });
const W = fullRaw.info.width;
const H = fullRaw.info.height;

// 1) Recolor pass. Treat near-white pixels (likely the original
//    background) AND already-transparent pixels as transparent so
//    the gorilla floats on whatever surface it lands on. Opaque
//    non-white pixels get recolored by luminance into the red
//    palette.
const redBuf = Buffer.alloc(fullRaw.data.length);
function isBackgroundPixel(r, g, b, a) {
  if (a < 16) return true;
  // Very light pixels (cream / off-white) -- treat as background.
  return r > 235 && g > 230 && b > 215;
}
for (let i = 0; i < fullRaw.data.length; i += 4) {
  const r = fullRaw.data[i], g = fullRaw.data[i + 1], b = fullRaw.data[i + 2];
  const a = fullRaw.data[i + 3];
  if (isBackgroundPixel(r, g, b, a)) {
    redBuf[i] = 0; redBuf[i+1] = 0; redBuf[i+2] = 0; redBuf[i+3] = 0;
    continue;
  }
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  const c = lum < 60 ? RED_DEEP : lum < 150 ? RED_MID : RED_DIM;
  redBuf[i]   = c[0]; redBuf[i+1] = c[1]; redBuf[i+2] = c[2]; redBuf[i+3] = 255;
}

// 2) Find the tight bounding box of opaque pixels so the gorilla
//    fills the output canvas (the source PNG has substantial
//    blank padding around the figure).
let minX = W, minY = H, maxX = -1, maxY = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4 + 3;
    if (redBuf[i] > 0) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) { minX = 0; minY = 0; maxX = W - 1; maxY = H - 1; }
// A small uniform padding around the figure so it doesn't kiss
// the favicon edges at 16px.
const pad = Math.round(Math.min(W, H) * 0.04);
const cropLeft = Math.max(0, minX - pad);
const cropTop = Math.max(0, minY - pad);
const cropRight = Math.min(W - 1, maxX + pad);
const cropBottom = Math.min(H - 1, maxY + pad);
const cropW = cropRight - cropLeft + 1;
const cropH = cropBottom - cropTop + 1;
// Make the crop a square (pad whichever axis is shorter) so the
// resize doesn't squash the figure.
const side = Math.max(cropW, cropH);
const padX = Math.floor((side - cropW) / 2);
const padY = Math.floor((side - cropH) / 2);

// 3) Build the cropped + squared raw buffer.
const squareBuf = Buffer.alloc(side * side * 4);
for (let y = 0; y < cropH; y++) {
  for (let x = 0; x < cropW; x++) {
    const src = ((cropTop + y) * W + (cropLeft + x)) * 4;
    const dst = ((y + padY) * side + (x + padX)) * 4;
    squareBuf[dst]   = redBuf[src];
    squareBuf[dst+1] = redBuf[src+1];
    squareBuf[dst+2] = redBuf[src+2];
    squareBuf[dst+3] = redBuf[src+3];
  }
}

async function emitRed(size) {
  const prefix = size === 180 ? "apple-touch-icon-red" : (size >= 192 ? "icon-red" : "favicon-red");
  const dim = size === 180 ? "" : "-" + size;
  const out = resolve(imgDir, prefix + dim + ".png");
  await sharp(squareBuf, { raw: { width: side, height: side, channels: 4 } })
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("  wrote", out);
}
for (const sz of SIZES) {
  await emitRed(sz);
}

console.log("Done.");
