/* One-shot script: rasterize the red SVG favicons at every size we ship.
   Run: node scripts/gen-red-favicons.mjs */
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const imgDir = resolve(__dirname, "..", "src", "assets", "img");

async function render(svgPath, outPath, size) {
  const svg = await readFile(svgPath);
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(outPath, png);
  console.log(`  wrote ${outPath}`);
}

const jobs = [
  // [svg, png, size]
  ["favicon-red.svg",         "favicon-16-red.png",         16],
  ["favicon-red.svg",         "favicon-32-red.png",         32],
  ["favicon-red.svg",         "favicon-48-red.png",         48],
  ["favicon-red.svg",         "favicon-64-red.png",         64],
  ["apple-touch-icon-red.svg","apple-touch-icon-red.png",  180],
  ["icon-192-red.svg",        "icon-192-red.png",          192],
  ["icon-192-red.svg",        "icon-256-red.png",          256],
  ["icon-192-red.svg",        "icon-512-red.png",          512],
];

console.log("Rendering red favicon PNGs...");
for (const [src, out, size] of jobs) {
  await render(resolve(imgDir, src), resolve(imgDir, out), size);
}
console.log("Done.");
