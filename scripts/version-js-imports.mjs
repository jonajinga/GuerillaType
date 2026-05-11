/* Post-build: rewrite every static + dynamic JS import in
   _site/assets/js to carry a ?v=BUILD_VERSION query suffix.

   Why: Cloudflare's edge caches /assets/js/*.js under
   `Cache-Control: max-age=31536000, immutable` once a file's URL
   has been served. Updated `_headers` rules don't retroactively
   invalidate already-cached entries. Adding a version query string
   gives each build a brand-new URL Cloudflare has never cached --
   so users always get the latest module chain even when the SW
   passes JS straight to the browser.

   Strategy: walk `_site/assets/js/`, for every .js file, append
   `?v=${BUILD}` to:
     - `import ... from "./foo.js"`         (static)
     - `import ... from "../foo.js"`        (static, parent)
     - `import("./foo.js")`                 (dynamic)
   Skip imports that already carry a query string, and skip
   absolute URLs (http(s)://) and bare module specifiers. */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..", "_site", "assets", "js");

// Prefer the build version 11ty wrote to _site/.build-version
// during eleventy.after -- guarantees the JS import suffix matches
// the cssVersion baked into the HTML for the same build.
async function readBuildVersion() {
  if (process.env.JS_IMPORT_VERSION) return process.env.JS_IMPORT_VERSION;
  try {
    const buf = await (await import("node:fs/promises")).readFile(
      resolve(__dirname, "..", "_site", ".build-version"),
      "utf8"
    );
    return buf.trim() || String(Date.now());
  } catch {
    return String(Date.now());
  }
}
const VERSION = await readBuildVersion();

const STATIC_IMPORT = /(\bfrom\s+["'])(\.\.?\/[^"'?]+\.js)(["'])/g;
const DYNAMIC_IMPORT = /(\bimport\s*\(\s*["'])(\.\.?\/[^"'?]+\.js)(["']\s*\))/g;

let touched = 0;
let rewritten = 0;

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full);
    else if (e.isFile() && full.endsWith(".js")) await processFile(full);
  }
}

async function processFile(file) {
  const src = await readFile(file, "utf8");
  let out = src;
  let n = 0;
  out = out.replace(STATIC_IMPORT, (m, a, b, c) => {
    n++;
    return `${a}${b}?v=${VERSION}${c}`;
  });
  out = out.replace(DYNAMIC_IMPORT, (m, a, b, c) => {
    n++;
    return `${a}${b}?v=${VERSION}${c}`;
  });
  if (n > 0) {
    await writeFile(file, out);
    rewritten += n;
    touched++;
  }
}

const start = Date.now();
await walk(ROOT);
console.log(`[version-js-imports] rewrote ${rewritten} imports across ${touched} files (v=${VERSION}, ${Date.now() - start}ms)`);
