/* Node's half of the Open Graph renderer.
 *
 * lib/og/ is deliberately runtime-free: no `fs`, no `node_modules`, no
 * `process`. This file supplies all of that for Node, so the same card
 * code can be handed a different host (a Cloudflare Worker) in Phase D2
 * without touching a line of lib/og/.
 *
 * Used by scripts/gen-og-images.mjs, scripts/check-og-render.mjs, and
 * the worker threads the generator spawns.
 */
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createRequire } from "node:module";

import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

import { createRenderer } from "../../lib/og/render.js";
import { resolveSrc } from "../../lib/og/resolve.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..", "..");
export const FONT_DIR = join(ROOT, "src", "assets", "fonts", "og");
export const DATA_DIR = join(ROOT, "src", "data");

const require_ = createRequire(import.meta.url);

/* ── resvg wasm ──────────────────────────────────────────────────────
   initWasm() must be called exactly once per process and throws
   "Already initialized" on the second call, which is a real hazard in a
   worker pool where two cards can race the first render. One promise,
   shared. */
let resvgReady = null;
export function ensureResvg() {
  if (!resvgReady) {
    const wasmPath = require_.resolve("@resvg/resvg-wasm/index_bg.wasm");
    resvgReady = initWasm(readFileSync(wasmPath)).then(() => Resvg).catch((err) => {
      if (/already/i.test(String(err && err.message))) return Resvg;
      resvgReady = null;
      throw err;
    });
  }
  return resvgReady;
}

const fontCache = new Map();
export async function loadFont(basename) {
  if (!fontCache.has(basename)) {
    fontCache.set(basename, await readFile(join(FONT_DIR, basename)));
  }
  return fontCache.get(basename);
}

export function createNodeRenderer(opts = {}) {
  return createRenderer({ satori, ensureResvg, loadFont, ...opts });
}

/* ── data for resolve.js ─────────────────────────────────────────────
   The corpus lives in two places: src/data/*.json (shipped to the site,
   fetched by the browser) and src/_data/*.js (Eleventy globals, ESM).
   resolve.js knows neither; it asks for a logical name. */
const dataCache = new Map();

export async function loadData(name) {
  if (dataCache.has(name)) return dataCache.get(name);
  let value = null;
  if (name === "quotes" || name === "idioms" || name === "parables" || name === "poetry") {
    value = JSON.parse(await readFile(join(DATA_DIR, `${name}.json`), "utf8"));
  } else if (name === "library") {
    value = JSON.parse(await readFile(join(DATA_DIR, "library.json"), "utf8"));
  } else if (name.startsWith("books/")) {
    /* The slug reached here through validate.js's ^[a-z0-9-]{1,80}$, but
       this is a filesystem path being built from a URL, so check again
       rather than trust a caller two files away. */
    const slug = name.slice("books/".length);
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
    value = JSON.parse(await readFile(join(DATA_DIR, "books", `${slug}.json`), "utf8"));
  } else if (name === "lessons" || name === "challenges" || name === "drills") {
    const mod = await import(new URL(`../../src/_data/${name}.js`, import.meta.url).href);
    value = typeof mod.default === "function" ? await mod.default() : mod.default;
  } else {
    return null;
  }
  dataCache.set(name, value);
  return value;
}

/* resolveSrc bound to Node's data loader. */
export function resolve_(src) {
  return resolveSrc(src, loadData);
}
export { resolve_ as resolveSrcNode };
