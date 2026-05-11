/* Generate the gorilla-face favicons from the brand source PNG.
   Crops the face region from src/assets/img/Guerilla Type Favicon.png,
   maps its grayscale tones to a light-cream-on-dark-navy palette
   (essentially the source color-inverted), and renders every size
   we ship.
   Run: node scripts/gen-favicons.mjs */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const imgDir = resolve(__dirname, "..", "src", "assets", "img");

// Face crop coordinates (tuned to center the gorilla face,
// excluding the keyboard body to the left).
const FACE_CROP = { left: 760, top: 120, width: 220, height: 220 };

// Color palette -- light cream gorilla on dark navy background.
const CREAM     = [233, 227, 213];   // #e9e3d5 -- gorilla outline / face
const CREAM_DIM = [180, 174, 160];   // dimmer cream for mid-tones
const NAVY_DEEP = [12, 14, 22];      // #0c0e16 -- background + features
const NAVY_MID  = [30, 33, 44];      // #1e212c -- shadows + nostrils / eyes

/* Render: crop the face area; map every source pixel by luminance
   bucket; emit an RGBA buffer with a solid dark background. */
async function recoloredFace() {
  const { data, info } = await sharp(resolve(imgDir, "Guerilla Type Favicon.png"))
    .extract(FACE_CROP)
    .raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (lum < 60) {
      // Source's darkest pixels -- the gorilla's outline + face body.
      // Invert them to cream so the gorilla pops on dark.
      out[i] = CREAM[0]; out[i + 1] = CREAM[1]; out[i + 2] = CREAM[2]; out[i + 3] = 255;
    } else if (lum < 150) {
      // Source mid-tones -- minor shadows.
      out[i] = CREAM_DIM[0]; out[i + 1] = CREAM_DIM[1]; out[i + 2] = CREAM_DIM[2]; out[i + 3] = 255;
    } else if (lum < 220) {
      // Source's cream highlights (whites of eyes, bandana stitching).
      // Invert to deep navy so the features read distinct against the
      // newly-cream face.
      out[i] = NAVY_MID[0]; out[i + 1] = NAVY_MID[1]; out[i + 2] = NAVY_MID[2]; out[i + 3] = 255;
    } else {
      // Source's brightest pixels -- the page background. Replace
      // with the deepest navy so the face sits on a solid dark tile.
      out[i] = NAVY_DEEP[0]; out[i + 1] = NAVY_DEEP[1]; out[i + 2] = NAVY_DEEP[2]; out[i + 3] = 255;
    }
  }
  return { buffer: out, width: info.width, height: info.height };
}

async function render(face, outPath, size) {
  const png = await sharp(face.buffer, {
    raw: { width: face.width, height: face.height, channels: 4 },
  })
    .resize(size, size, { fit: "contain", background: { ...NAVY_DEEP_RGBA() } })
    .flatten({ background: NAVY_DEEP_OBJ() })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(outPath, png);
  console.log("  wrote", outPath);
}
function NAVY_DEEP_OBJ() { return { r: NAVY_DEEP[0], g: NAVY_DEEP[1], b: NAVY_DEEP[2] }; }
function NAVY_DEEP_RGBA() { return { r: NAVY_DEEP[0], g: NAVY_DEEP[1], b: NAVY_DEEP[2], alpha: 1 }; }

console.log("Generating gorilla-face favicons (cream on navy)...");
const face = await recoloredFace();

// New filenames -- "face" generation -- so browsers can't serve
// the previously-cached -red files under the old URLs.
const jobs = [
  ["favicon-face-16.png", 16],
  ["favicon-face-32.png", 32],
  ["favicon-face-48.png", 48],
  ["favicon-face-64.png", 64],
  ["apple-touch-icon-face.png", 180],
  ["icon-face-192.png", 192],
  ["icon-face-256.png", 256],
  ["icon-face-512.png", 512],
];
for (const [name, size] of jobs) {
  await render(face, resolve(imgDir, name), size);
}
console.log("Done.");
