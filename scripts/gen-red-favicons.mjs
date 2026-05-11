/* Generate red gorilla-face favicons from the brand source PNG.
   Crops the face region from src/assets/img/Guerilla Type Favicon.png,
   recolors dark pixels to brand red, makes background transparent,
   then renders every favicon size we ship.
   Run: node scripts/gen-red-favicons.mjs */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const imgDir = resolve(__dirname, "..", "src", "assets", "img");

// Crop the FULL gorilla + keyboard figure (not just the face) so the
// favicon reads as the site icon -- in red. The source is 1408x768
// with the figure roughly centered horizontally; we extract a
// square bounding box of just the figure and let the recolor pass
// drop the background to transparent.
const FIGURE_CROP = { left: 470, top: 90, width: 600, height: 600 };

// Color palette -- mapped from the source's grayscale tones to red.
const RED       = [193, 65, 60];   // #c1413c -- primary
const DARK_RED  = [138, 37, 33];   // #8a2521 -- shadow / outline
const HIGHLIGHT = [232, 128, 96];  // #e88060 -- bandana stitch / whites

/* Crop the figure, recolor every pixel by luminance bucket, drop
   background to transparent. Returns an RGBA buffer + dims. */
async function recoloredFigure() {
  const { data, info } = await sharp(resolve(imgDir, "Guerilla Type Favicon.png"))
    .extract(FIGURE_CROP)
    .raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (lum < 60) {
      out[i] = DARK_RED[0]; out[i + 1] = DARK_RED[1]; out[i + 2] = DARK_RED[2]; out[i + 3] = 255;
    } else if (lum < 150) {
      out[i] = RED[0]; out[i + 1] = RED[1]; out[i + 2] = RED[2]; out[i + 3] = 255;
    } else if (lum < 220) {
      out[i] = HIGHLIGHT[0]; out[i + 1] = HIGHLIGHT[1]; out[i + 2] = HIGHLIGHT[2]; out[i + 3] = 255;
    } else {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
    }
  }
  return { buffer: out, width: info.width, height: info.height };
}

async function render(face, outPath, size, opts = {}) {
  let pipeline = sharp(face.buffer, {
    raw: { width: face.width, height: face.height, channels: 4 },
  }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });

  if (opts.background) {
    pipeline = pipeline.flatten({ background: opts.background });
  }
  const png = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  await writeFile(outPath, png);
  console.log("  wrote", outPath);
}

console.log("Generating red gorilla favicons (full figure)...");
const figure = await recoloredFigure();

// Transparent-background variants (default for browser tabs).
const jobs = [
  ["favicon-16-red.png", 16],
  ["favicon-32-red.png", 32],
  ["favicon-48-red.png", 48],
  ["favicon-64-red.png", 64],
  ["apple-touch-icon-red.png", 180],
  ["icon-192-red.png", 192],
  ["icon-256-red.png", 256],
  ["icon-512-red.png", 512],
];
for (const [name, size] of jobs) {
  await render(figure, resolve(imgDir, name), size);
}
console.log("Done.");
