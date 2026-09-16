#!/usr/bin/env node
/* Build-time Open Graph cards.
 *
 * Runs after Eleventy in `npm run build` and writes ~3,200 PNGs into
 * _site/og/**. They are NOT in git (_site is ignored) -- they are built
 * on every deploy and uploaded by Cloudflare Pages, which only sends
 * files whose hash changed.
 *
 * Why pre-render instead of rendering on demand: Jon is on the Workers
 * FREE plan, 10 ms CPU per request. satori + resvg is 60-250 ms. So
 * every card a share link can point at has to exist as a static file
 * before the request arrives. That is also why there is a result GRID:
 * a result card cannot be rendered per visitor, so one is built for
 * every wpm 0-200 (plus 200+) x accuracy band -- 1,212 cards that cover
 * every result anyone can share.
 *
 *   OG_SKIP=1   skip the whole step (fast local builds, `npm run dev`)
 *   OG_FORCE=1  rebuild even when the PNG is newer than its sources
 *   OG_JOBS=n   pool size (default: os.availableParallelism())
 *
 * The one committed output is src/assets/img/og-default.png, the
 * site-wide og:image. It is written only when its bytes actually
 * change: rewriting it every build would leave the working tree dirty
 * and would make scripts/check-og-meta.mjs declare the build stale
 * (it compares _site/index.html's mtime against that file).
 *
 * Run: node scripts/gen-og-images.mjs   (or npm run build) */
import { Worker } from "node:worker_threads";
import { availableParallelism, cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";

import { BAND_IDS } from "../lib/og/labels.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SITE = join(ROOT, "_site");
const OG = join(SITE, "og");
const DATA = join(ROOT, "src", "data");

const t0 = Date.now();

if (process.env.OG_SKIP === "1") {
  console.log("[og] OG_SKIP=1 — no cards rendered.");
  process.exit(0);
}

const FORCE = process.env.OG_FORCE === "1";
const POOL = Math.max(1, Math.min(
  Number(process.env.OG_JOBS) || (typeof availableParallelism === "function" ? availableParallelism() : cpus().length),
  16,
));

/* ── what counts as a source ─────────────────────────────────────────
   A card is stale if ANY of the renderer's own files changed, not just
   its data. Getting this wrong is worse than not skipping at all: you
   ship yesterday's design. */
function mtime(p) { try { return statSync(p).mtimeMs; } catch { return 0; } }
function newestIn(dir, filter = () => true) {
  let n = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && filter(e.name)) n = Math.max(n, mtime(join(dir, e.name)));
    }
  } catch { /* missing dir -> 0 */ }
  return n;
}

const RENDERER_MTIME = Math.max(
  newestIn(join(ROOT, "lib", "og")),
  mtime(join(__dirname, "lib", "og-node.mjs")),
  mtime(join(__dirname, "gen-og-images.mjs")),
  newestIn(join(ROOT, "src", "assets", "fonts", "og")),
);

/* ── the job list ────────────────────────────────────────────────── */

const jobs = [];
let skipped = 0;

function want(out, srcMtime) {
  const full = join(SITE, out);
  if (!FORCE && mtime(full) > Math.max(srcMtime, RENDERER_MTIME)) { skipped++; return false; }
  return true;
}

function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }

/* content cards from the four corpus JSONs */
const CORPUS = [
  { file: "quotes.json", prefix: "q", dir: "quote" },
  { file: "idioms.json", prefix: "id", dir: "idiom" },
  { file: "parables.json", prefix: "pa", dir: "parable" },
  { file: "poetry.json", prefix: "po", dir: "poem" },
];
const counts = {};
for (const c of CORPUS) {
  const path = join(DATA, c.file);
  const items = readJson(path);
  const m = mtime(path);
  counts[c.dir] = items.length;
  for (const it of items) {
    if (!it || !it.id) continue;
    const out = `og/${c.dir}/${it.id}.png`;
    if (want(out, m)) jobs.push({ t: "content", src: `${c.prefix}:${it.id}`, out });
  }
}

/* books: one card per book, chapter 0 page 0 */
const bookFiles = readdirSync(join(DATA, "books")).filter((f) => f.endsWith(".json"));
counts.book = bookFiles.length;
for (const f of bookFiles) {
  const slug = f.slice(0, -5);
  const out = `og/book/${slug}.png`;
  if (want(out, mtime(join(DATA, "books", f)))) jobs.push({ t: "content", src: `bk:${slug}`, out });
}

/* lessons / challenges / drills live in src/_data as ESM */
for (const [name, prefix, dir] of [["lessons", "ls", "lesson"], ["challenges", "ch", "challenge"], ["drills", "dr", "drill"]]) {
  const mod = await import(new URL(`../src/_data/${name}.js`, import.meta.url).href);
  const items = typeof mod.default === "function" ? await mod.default() : mod.default;
  const m = mtime(join(ROOT, "src", "_data", `${name}.js`));
  counts[dir] = items.length;
  for (const it of items) {
    if (!it || it.id == null) continue;
    const out = `og/${dir}/${it.id}.png`;
    if (want(out, m)) jobs.push({ t: "content", src: `${prefix}:${it.id}`, out });
  }
}

/* the Free-plan result grid */
let gridCount = 0;
for (const band of BAND_IDS) {
  for (let wpm = 0; wpm <= 200; wpm++) {
    gridCount++;
    const out = `og/result/${wpm}-${band}.png`;
    if (want(out, 0)) jobs.push({ t: "grid", wpm, label: String(wpm), band, out });
  }
  gridCount++;
  const out = `og/result/200p-${band}.png`;
  if (want(out, 0)) jobs.push({ t: "grid", wpm: 200, label: "200+", band, out });
}
counts.result = gridCount;

/* the committed default card */
const DEFAULT_PNG = join(ROOT, "src", "assets", "img", "og-default.png");
jobs.push({ t: "default", out: null });

/* ── output directories, once, on this thread ────────────────────── */
for (const d of ["quote", "idiom", "parable", "poem", "book", "lesson", "challenge", "drill", "result"]) {
  mkdirSync(join(OG, d), { recursive: true });
}

/* ── the pool ────────────────────────────────────────────────────── */

const total = jobs.length;
let done = 0, failed = 0;
const failures = [];

if (!total) {
  console.log("[og] nothing to do.");
  process.exit(0);
}

const workerUrl = new URL("./lib/og-worker.mjs", import.meta.url);
const poolSize = Math.min(POOL, total);
const queue = jobs.slice();

await new Promise((resolveAll, rejectAll) => {
  let alive = 0;
  /* eslint-disable-next-line no-unused-vars -- rejectAll is unused on
     purpose: a failed card is counted and reported, never a thrown
     build. One bad quote must not take the deploy down. */
  for (let i = 0; i < poolSize; i++) {
    const w = new Worker(workerUrl, { workerData: { root: ROOT, site: SITE, defaultPng: DEFAULT_PNG } });
    alive++;
    const next = () => {
      const job = queue.shift();
      if (!job) { w.postMessage(null); return; }
      w.postMessage(job);
    };
    w.on("message", (msg) => {
      if (msg && msg.ready) { next(); return; }
      done++;
      if (msg && msg.error) { failed++; failures.push(`${msg.out || msg.job}: ${msg.error}`); }
      if (msg && msg.wroteDefault) console.log(`[og] default card CHANGED — src/assets/img/og-default.png rewritten (${msg.wroteDefault} bytes). Commit it.`);
      if (done % 250 === 0) process.stdout.write(`[og] ${done}/${total}\r`);
      next();
    });
    w.on("error", (err) => { failed++; failures.push(`worker: ${err.message}`); w.terminate(); });
    w.on("exit", () => { if (--alive === 0) resolveAll(); });
  }
});

/* ── report ──────────────────────────────────────────────────────── */

function dirSize(dir) {
  let bytes = 0, n = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { const s = dirSize(join(dir, e.name)); bytes += s.bytes; n += s.n; }
      else if (e.name.endsWith(".png")) { bytes += statSync(join(dir, e.name)).size; n++; }
    }
  } catch { /* nothing there */ }
  return { bytes, n };
}

const { bytes, n } = dirSize(OG);
const ms = Date.now() - t0;
console.log(
  `[og] ${done - failed} rendered, ${skipped} unchanged, ${failed} failed  ` +
  `(${n} PNGs, ${(bytes / 1048576).toFixed(1)} MB in _site/og)  ${ms} ms, ${poolSize} threads`,
);
console.log(
  "[og] " + ["quote", "idiom", "parable", "poem", "book", "lesson", "challenge", "drill", "result"]
    .map((k) => `${k} ${counts[k]}`).join(" · "),
);
if (failed) {
  for (const f of failures.slice(0, 10)) console.error("  " + f);
  if (failures.length > 10) console.error(`  …and ${failures.length - 10} more`);
  process.exit(1);
}
