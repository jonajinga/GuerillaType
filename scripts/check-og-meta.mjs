#!/usr/bin/env node
/* The share card must be a real raster image, and the share metadata
   must actually say so.

   Background: until 2026-09-16 `site.ogImage` was an SVG. X, Facebook,
   LinkedIn, Slack and iMessage all refuse an SVG for og:image, so every
   link to guerillatype.com --
   home, every blog post, all 273 library pages -- previewed as a bare
   grey box. Nothing caught it because nothing looked. This is the thing
   that looks.

   It reads the BUILT site, not the templates, because the templates were
   never the problem: what a scraper sees is _site. Two consequences:

     - The build minifies HTML (tinyhtml) and drops quotes AND reorders
       attributes: `<meta content=website property=og:type>`. A gate
       grepping for `property="og:type"` would find nothing and pass with
       zero checks. So attributes are parsed properly, both quoted and
       unquoted forms, in any order, and section A proves the parser
       still recognises both by running it over a fixture.
     - A stale _site tests the previous commit. Section A refuses to run
       if _site/index.html is older than the files that produce these
       tags.

   No browser, no server: plain Node over files on disk.

   Run: npm run build && npm run og-meta */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SITE = resolve(ROOT, "_site");
const ORIGIN = "https://guerillatype.com";

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };
const die = (msg) => { console.log(`  FAIL  ${msg}`); console.log("\nRUN ABORTED — counts below are partial."); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); };

/* ── meta parser ─────────────────────────────────────────────────────
   Returns a Map of property|name -> content for every <meta> in the
   document, tolerating unquoted values (minified output), single
   quotes, and either attribute order. */
const ATTR = /([A-Za-z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
function metaMap(html) {
  const out = new Map();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    ATTR.lastIndex = 0;
    let m;
    while ((m = ATTR.exec(tag))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
    const key = attrs.property || attrs.name;
    if (key && "content" in attrs) out.set(key.toLowerCase(), attrs.content);
  }
  return out;
}

/* Everything in _site that a scraper could read. */
function htmlFiles(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, acc);
    else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

/* site.url + path -> file on disk. */
function localPath(url) {
  if (!url.startsWith(ORIGIN + "/")) return null;
  return resolve(SITE, "." + url.slice(ORIGIN.length));
}

// ── A. the gate is looking at something real ────────────────────────
console.log("\nA. build freshness and parser");

if (!existsSync(join(SITE, "index.html"))) die("_site/index.html is missing — run `npm run build` first.");

const SOURCES = [
  "src/_data/site.js",
  "src/_includes/layouts/base.njk",
  "src/posts/posts.json",
  "src/assets/img/og-default.png",
];
const builtAt = statSync(join(SITE, "index.html")).mtimeMs;
const newestSrc = Math.max(...SOURCES.map((f) => statSync(resolve(ROOT, f)).mtimeMs));
chk(builtAt >= newestSrc, "_site is newer than the sources that produce these tags",
  builtAt >= newestSrc ? "" : `_site is ${Math.round((newestSrc - builtAt) / 1000)}s stale — run npm run build`);
if (builtAt < newestSrc) die("stale build — every assertion below would describe the previous commit.");

/* The parser must read both the minified and the un-minified shape, or
   this whole file is capable of passing while seeing nothing. */
const fixture = metaMap(
  `<meta content=website property=og:type>` +
  `<meta property="og:site_name" content="GuerillaType">` +
  `<meta name='twitter:image' content='https://x/y.png'>` +
  `<meta content="1200" property=og:image:width>`
);
chk(fixture.get("og:type") === "website", "parser reads unquoted, content-first attributes", String(fixture.get("og:type")));
chk(fixture.get("og:site_name") === "GuerillaType", "parser reads quoted attributes", String(fixture.get("og:site_name")));
chk(fixture.get("twitter:image") === "https://x/y.png", "parser reads single-quoted attributes", String(fixture.get("twitter:image")));
chk(fixture.get("og:image:width") === "1200", "parser reads mixed quoting", String(fixture.get("og:image:width")));

// ── B. the home page ────────────────────────────────────────────────
console.log("\nB. home page (/)");

const home = metaMap(readFileSync(join(SITE, "index.html"), "utf8"));
chk(home.size >= 10, "meta tags found at all", `${home.size} tags`);

const ogImage = home.get("og:image") || "";
chk(ogImage.startsWith(ORIGIN + "/"), "og:image is an absolute URL", ogImage);
chk(/\.png$/i.test(ogImage), "og:image is a .png (SVG is rejected by every major platform)", ogImage);
chk(!/\.svg$/i.test(ogImage), "og:image is not an SVG", ogImage);

const imgFile = localPath(ogImage);
chk(!!imgFile && existsSync(imgFile), "the og:image file exists in _site", imgFile ? imgFile.slice(SITE.length) : "unresolvable");

// ── C. the PNG itself ───────────────────────────────────────────────
console.log("\nC. the card file");

if (imgFile && existsSync(imgFile)) {
  const buf = readFileSync(imgFile);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  chk(buf.length > 8 && buf.subarray(0, 8).equals(sig), "PNG signature", buf.subarray(0, 8).toString("hex"));
  const isIHDR = buf.length > 24 && buf.subarray(12, 16).toString("latin1") === "IHDR";
  chk(isIHDR, "first chunk is IHDR");
  if (isIHDR) {
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    chk(w === 1200, "card is 1200 px wide", String(w));
    chk(h === 630, "card is 630 px tall", String(h));
  }
  const kb = buf.length / 1024;
  chk(kb < 150, "card is under the 150 KB share budget", `${kb.toFixed(1)} KB`);
  chk(kb > 3, "card is not an empty placeholder", `${kb.toFixed(1)} KB`);
} else {
  chk(false, "PNG checks skipped — file not found");
}

// ── D. the rest of the metadata on the home page ────────────────────
console.log("\nD. the tags a scraper needs");

chk(home.get("og:image:width") === "1200", "og:image:width = 1200", String(home.get("og:image:width")));
chk(home.get("og:image:height") === "630", "og:image:height = 630", String(home.get("og:image:height")));
chk(home.get("og:image:type") === "image/png", "og:image:type = image/png", String(home.get("og:image:type")));
chk((home.get("og:image:alt") || "").length > 10, "og:image:alt is a real sentence", String(home.get("og:image:alt")));
chk(home.get("og:site_name") === "GuerillaType", "og:site_name", String(home.get("og:site_name")));
chk(home.get("og:type") === "website", "og:type = website on the home page", String(home.get("og:type")));
chk(home.get("og:url") === ORIGIN + "/", "og:url is absolute", String(home.get("og:url")));
chk(home.get("twitter:card") === "summary_large_image", "twitter:card", String(home.get("twitter:card")));
chk(home.get("twitter:image") === ogImage, "twitter:image matches og:image", String(home.get("twitter:image")));
chk((home.get("twitter:title") || "").length > 0, "twitter:title", String(home.get("twitter:title")));
chk((home.get("twitter:description") || "").length > 20, "twitter:description", (home.get("twitter:description") || "").slice(0, 40) + "…");
chk((home.get("twitter:image:alt") || "").length > 10, "twitter:image:alt", String(home.get("twitter:image:alt")));

// ── E. a blog post: og:type must be article ─────────────────────────
console.log("\nE. a blog post");

const blogDir = join(SITE, "blog");
const posts = existsSync(blogDir)
  ? readdirSync(blogDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  : [];
chk(posts.length > 5, "blog posts were built", `${posts.length} posts`);
if (posts.length) {
  const slug = posts[0];
  const post = metaMap(readFileSync(join(blogDir, slug, "index.html"), "utf8"));
  console.log(`  (using /blog/${slug}/)`);
  chk(post.get("og:type") === "article", "og:type = article on a post", String(post.get("og:type")));
  chk(/\.png$/i.test(post.get("og:image") || ""), "post og:image is a .png", String(post.get("og:image")));
  chk(existsSync(localPath(post.get("og:image") || "") || ""), "post og:image file exists");
  chk(post.get("og:image:width") === "1200", "post og:image:width", String(post.get("og:image:width")));
  chk(post.get("og:image:height") === "630", "post og:image:height", String(post.get("og:image:height")));
  chk(post.get("og:site_name") === "GuerillaType", "post og:site_name", String(post.get("og:site_name")));
  chk((post.get("twitter:image") || "") === (post.get("og:image") || ""), "post twitter:image", String(post.get("twitter:image")));
  chk(post.get("og:url") === `${ORIGIN}/blog/${slug}/`, "post og:url is absolute", String(post.get("og:url")));
}

// ── F. a library page ───────────────────────────────────────────────
console.log("\nF. a library page");

const bookFile = join(SITE, "library", "alice-in-wonderland", "index.html");
if (!existsSync(bookFile)) {
  chk(false, "library page built", bookFile);
} else {
  const book = metaMap(readFileSync(bookFile, "utf8"));
  chk(/\.png$/i.test(book.get("og:image") || ""), "book og:image is a .png", String(book.get("og:image")));
  chk(existsSync(localPath(book.get("og:image") || "") || ""), "book og:image file exists");
  chk(book.get("og:image:width") === "1200", "book og:image:width", String(book.get("og:image:width")));
  chk(book.get("og:image:height") === "630", "book og:image:height", String(book.get("og:image:height")));
  chk(book.get("og:site_name") === "GuerillaType", "book og:site_name", String(book.get("og:site_name")));
  chk((book.get("twitter:image") || "") === (book.get("og:image") || ""), "book twitter:image", String(book.get("twitter:image")));
  chk((book.get("og:title") || "").length > 0, "book og:title", String(book.get("og:title")));
}

// ── G. no page anywhere still offers an SVG ─────────────────────────
console.log("\nG. the whole site");

const files = htmlFiles(SITE);
chk(files.length > 200, "html pages scanned", `${files.length} files`);

/* Sections B-F prove the tags are right on FOUR pages. Everything
   below runs the same assertions on EVERY page, because "the home page
   is fine" is how 1,547 new pages shipped last time without anyone
   checking whether the per-page override they all rely on actually
   produced anything. A single page holding the whole site to account
   is exactly the shape of gate this project keeps having to rewrite. */
let svgOffenders = [], missingImg = new Set(), noImage = [], noSiteName = [], noTwitter = [];
let noWidth = [], noHeight = [], noAlt = [], relImg = [], relTwitter = [], twMismatch = [];
let doubleEscaped = [];
const seen = new Map();

/* ── the double-escape detector ──────────────────────────────────
   library-detail.njk built its og:title in eleventyComputed, where
   Nunjucks autoescaping is ON. base.njk then escaped the result a
   second time, so 11 books shipped

       <meta property="og:title" content="Alice&amp;#39;s Adventures …">

   and every scraper showed a literal "Alice&#39;s Adventures".

   Detecting that has to survive both build shapes. In a production
   build the minifier decodes entities inside a quoted attribute, so a
   CORRECT page reads `Alice's` and a broken one reads `Alice&#39;s`.
   With NODE_ENV=development there is no minifier, so a correct page
   reads `Alice&#39;s` -- which a naive grep would call a failure.

   So: decode exactly once, the way a scraper does, and then look for
   an entity that is still there. One escape decodes to a bare
   character; two decode to a visible entity. */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
function decodeOnce(str) {
  return String(str).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const hit = ENT[body.toLowerCase()];
    return hit === undefined ? m : hit;
  });
}
const LEFTOVER_ENTITY = /&(?:#x?[0-9a-f]+|amp|quot|apos|lt|gt);/i;
const isDoubleEscaped = (v) => LEFTOVER_ENTITY.test(decodeOnce(v || ""));

for (const f of files) {
  const m = metaMap(readFileSync(f, "utf8"));
  const rel = f.slice(SITE.length);
  const img = m.get("og:image");
  const tw = m.get("twitter:image");
  const title = m.get("og:title") || "";
  const desc = m.get("og:description") || "";
  if (isDoubleEscaped(title) || isDoubleEscaped(desc)) {
    doubleEscaped.push(`${rel} → ${isDoubleEscaped(title) ? title : desc}`.slice(0, 120));
  }
  if (!img) { noImage.push(rel); continue; }
  if (/\.svg(\?|#|$)/i.test(img) || /\.svg(\?|#|$)/i.test(tw || "")) svgOffenders.push(rel + " → " + img);
  const lp = localPath(img);
  if (!lp || !existsSync(lp)) missingImg.add(img);
  if (!m.get("og:site_name")) noSiteName.push(rel);
  if (!tw) noTwitter.push(rel);
  // Per-page, not per-sample: the dimensions and the alt text are what
  // decide whether a platform renders a large card or a thumbnail.
  if (m.get("og:image:width") !== "1200") noWidth.push(`${rel} → ${m.get("og:image:width")}`);
  if (m.get("og:image:height") !== "630") noHeight.push(`${rel} → ${m.get("og:image:height")}`);
  if ((m.get("og:image:alt") || "").length < 8) noAlt.push(`${rel} → ${m.get("og:image:alt")}`);
  // Scrapers do not resolve a relative image URL. This is the check
  // that catches a per-page ogImage override that forgot site.url.
  if (!img.startsWith("https://")) relImg.push(`${rel} → ${img}`);
  if (tw && !tw.startsWith("https://")) relTwitter.push(`${rel} → ${tw}`);
  if (tw && tw !== img) twMismatch.push(`${rel} → ${tw} vs ${img}`);
  seen.set(img, (seen.get(img) || 0) + 1);
}
chk(noImage.length === 0, "every page has an og:image", noImage.slice(0, 3).join(", "));
chk(svgOffenders.length === 0, "no page offers an SVG as og:image or twitter:image", svgOffenders.slice(0, 3).join(" | "));
chk(missingImg.size === 0, "every og:image resolves to a file in _site", [...missingImg].slice(0, 3).join(", "));
chk(noSiteName.length === 0, "every page has og:site_name", noSiteName.slice(0, 3).join(", "));
chk(noTwitter.length === 0, "every page has twitter:image", noTwitter.slice(0, 3).join(", "));
chk(noWidth.length === 0, "every page declares og:image:width 1200", `${noWidth.length} page(s): ` + noWidth.slice(0, 3).join(", "));
chk(noHeight.length === 0, "every page declares og:image:height 630", `${noHeight.length} page(s): ` + noHeight.slice(0, 3).join(", "));
chk(noAlt.length === 0, "every page has a real og:image:alt", `${noAlt.length} page(s): ` + noAlt.slice(0, 3).join(", "));
chk(relImg.length === 0, "every og:image is an absolute https URL", `${relImg.length} page(s): ` + relImg.slice(0, 3).join(", "));
chk(relTwitter.length === 0, "every twitter:image is an absolute https URL", `${relTwitter.length} page(s): ` + relTwitter.slice(0, 3).join(", "));
chk(twMismatch.length === 0, "twitter:image matches og:image on every page", `${twMismatch.length} page(s): ` + twMismatch.slice(0, 3).join(", "));
chk(doubleEscaped.length === 0,
  "no og:title or og:description is escaped twice (a visible &#39; in the share preview)",
  `${doubleEscaped.length} page(s): ` + doubleEscaped.slice(0, 3).join(" | "));
console.log(`  (distinct og:image values: ${seen.size} — ${[...seen.keys()].slice(0, 3).join(", ")})`);

/* Anti-vacuity: the double-escape detector must fire on the string it
   exists to catch, and must NOT fire on a correctly escaped one. A
   regex that matches nothing passes the loop above silently. */
chk(isDoubleEscaped("Alice&amp;#39;s Adventures"), "detector fires on a minified double escape");
chk(isDoubleEscaped("Alice&amp;amp;#39;s Adventures"), "detector fires on an un-minified double escape");
chk(!isDoubleEscaped("Alice's Adventures in Wonderland"), "detector stays quiet on a minified correct title");
chk(!isDoubleEscaped("Alice&#39;s Adventures in Wonderland"), "detector stays quiet on an un-minified correct title");
chk(!isDoubleEscaped("Tom &amp; Jerry — a typing test"), "detector stays quiet on a single-escaped ampersand");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
