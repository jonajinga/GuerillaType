#!/usr/bin/env node
/* Per-item corpus pages: /quotes/<id>/, /idioms/<id>/,
   /parables/<id>/, /poetry/<id>/.
 *
 * 1,547 pages exist so that a poem, an idiom, a parable or a quote has
 * a public address of its own -- one a share card can point at, one a
 * search engine can index, and one that opens the exact piece in the
 * typing engine. All three of those depend on things that are easy to
 * get wrong and invisible when they are:
 *
 *   - a data loader with a NAMED export alongside the default turns the
 *     template variable into a module namespace and pagination produces
 *     ZERO pages, with no error;
 *   - an og:image pointing at a card the build never rendered previews
 *     as a grey box, and nothing on the page says so;
 *   - the "Type this" link is a URL built by hand in a template, so a
 *     wrong parameter name means the practice page silently serves a
 *     random item instead of the one on the page.
 *
 * So this gate checks all three for EVERY page from disk, and then
 * drives a browser through the three that only a browser can answer:
 * does the deep link really type that piece, does finishing it record
 * completion where the list page reads it, and does "Save to my texts"
 * really save.
 *
 * Two more, added after review:
 *
 *   - the Share button's FIVE data- attributes, on every item page and
 *     every /library/<slug>/ page. Nothing reads them yet (the share
 *     module is another branch's file), so a template that drops one
 *     shows no symptom until a reader taps Share -- section K;
 *   - a poem's indentation, which the HTML minifier was eating on 45
 *     of the 122 poem pages while the practice surface kept it, so the
 *     page and its own "Type this" disagreed about the shape of the
 *     poem -- section L.
 *
 * Sections run A B C D K E F G H J L I. K and L were added to the end
 * of the alphabet rather than renumbered in, so that the diff that
 * added them touches only the lines it added.
 *
 * ANTI-VACUITY. Every count is compared against the JSON that produced
 * it, never against a constant. Every browser assertion waits for
 * .tt-char first, so a page that failed to boot fails loudly instead
 * of reporting "no attribution found". The negative assertions (a row
 * with no tick, an empty text store) are paired with a positive one on
 * the same selector, so a missing element cannot satisfy them.
 *
 * Serves _site itself on a port derived from this task id -- 8080 and
 * 8765 are never ours -- and refuses to trust the server until it has
 * proved it is this project answering.
 *
 * Usage:
 *   npm run build        # not optional: this reads _site, and the OG
 *                        # cards the pages point at are built there
 *   node scripts/check-item-pages.mjs
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync, readdirSync, existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const TASK = "item-pages";
const PORT = Number(process.env.PORT)
  || 8100 + ([...TASK].reduce((a, c) => a + c.charCodeAt(0), 0) % 600);
const ROOT = resolve("_site");
const SRC = resolve("src");
const ORIGIN = "https://guerillatype.com";

let pass = 0, fail = 0;
const chk = (ok, name, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
/* The counts are printed from ONE place, and an exit hook guarantees
   they are printed at all. A rejected top-level await -- a Playwright
   timeout, say -- does not reach process.on("unhandledRejection") in
   Node: the runtime prints the stack and exits 1, and this gate used
   to end there, with a TimeoutError and no idea how much had passed.
   A reader then has to re-run it to learn anything. */
let countsPrinted = false;
const printCounts = () => {
  if (countsPrinted) return;
  countsPrinted = true;
  console.log(`\n${pass} passed, ${fail} failed`);
};
process.on("exit", printCounts);
const abort = (why) => {
  console.log(`\nRUN ABORTED — ${why}`);
  printCounts();
  process.exit(1);
};
process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err && err.message ? err.message : err}`);
  abort("the counts above are partial.");
});

/* kind -> where its JSON lives, where its pages live, and which query
   parameter the practice page takes for it. One table, used by the
   file checks and the browser checks alike, so the two cannot drift. */
const CORPORA = [
  { kind: "quote",   json: "quotes.json",   dir: "quotes",   param: "qid", mode: "quote" },
  { kind: "idiom",   json: "idioms.json",   dir: "idioms",   param: "iid", mode: "idiom" },
  { kind: "parable", json: "parables.json", dir: "parables", param: "pid", mode: "parable" },
  { kind: "poem",    json: "poetry.json",   dir: "poetry",   param: "pid", mode: "poem" },
];

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// ── A. the gate is looking at this commit's build ───────────────────
console.log("\nA. the build under test");

if (!existsSync(join(ROOT, "index.html"))) abort("_site/index.html is missing — run `npm run build` first.");

/* The templates and loaders that MUST exist for any of this to mean
   anything. Eleventy does not empty _site, so a tree with these files
   reverted still has yesterday's 1,547 pages sitting on disk: without
   this check the whole gate would pass against a build of the change
   it is supposed to be testing. */
const SOURCES = [
  "quote-detail.njk", "idiom-detail.njk", "parable-detail.njk", "poem-detail.njk",
  "_data/quotes.js", "_data/idioms.js", "_data/parables.js", "_data/poems.js",
  "_includes/partials/corpus/detail-actions.njk",
  "assets/js/pages/practice-boot.js", "assets/js/pages/corpus-boot.js",
  "assets/css/partials/pages/corpus-detail.css",
].map((f) => join(SRC, f));
const missingSrc = SOURCES.filter((f) => !existsSync(f));
chk(missingSrc.length === 0, "every source file these pages are built from is present",
  missingSrc.map((f) => f.slice(SRC.length)).join(", "));
if (missingSrc.length) {
  abort("source files are missing while _site still holds the pages they produce — this is a stale build, not a passing one.");
}

const builtAt = statSync(join(ROOT, "index.html")).mtimeMs;
const newestSrc = Math.max(...SOURCES.map((f) => statSync(f).mtimeMs));
chk(builtAt >= newestSrc, "_site is newer than those sources",
  builtAt >= newestSrc ? "" : `${Math.round((newestSrc - builtAt) / 1000)}s stale — run npm run build`);
if (builtAt < newestSrc) abort("stale build — every assertion below would describe the previous commit.");

// ── B. one page per item, and not one more ──────────────────────────
console.log("\nB. page counts against the corpus JSON");

const items = {};
for (const c of CORPORA) {
  const data = readJson(join(SRC, "data", c.json));
  items[c.kind] = data;
  chk(Array.isArray(data) && data.length > 0, `${c.json} is a non-empty array`, `${data.length} items`);
  let built = 0, missing = [];
  for (const it of data) {
    const p = join(ROOT, c.dir, it.id, "index.html");
    if (existsSync(p)) built++;
    else if (missing.length < 3) missing.push(it.id);
  }
  chk(built === data.length, `/${c.dir}/ has exactly one page per ${c.kind}`,
    `${built} pages vs ${data.length} items${missing.length ? " — missing " + missing.join(", ") : ""}`);
}

// ── C. every page's card, link and metadata ─────────────────────────
console.log("\nC. og:image, its PNG, and the Type this link — on every page");

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
/* The minifier may leave an href quoted or unquoted and may decode
   &amp; back to a bare &. Read the attribute, then normalise. */
function typeThisHref(html) {
  const tag = (html.match(/<a\b[^>]*\bdata-type-this\b[^>]*>/i) || html.match(/<a\b[^>]*\bdata-type-this\b[^>]*>/i) || [])[0];
  if (!tag) return null;
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(tag))) {
    if (m[1].toLowerCase() === "href") return (m[2] ?? m[3] ?? m[4] ?? "").replace(/&amp;/g, "&");
  }
  return null;
}
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function isPng(file) {
  let fd;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(8);
    readSync(fd, buf, 0, 8, 0);
    return buf.equals(PNG_SIG);
  } catch { return false; } finally { if (fd !== undefined) closeSync(fd); }
}

const cardCache = new Map();

/* ── the Share button's five data- attributes ───────────────────────
   Nothing on these pages reads them yet: src/assets/js/share/share.js
   belongs to another branch and binds every [data-share] on the site
   from main.js. So a template that drops one of the five is invisible
   until a reader taps Share -- and then gets a card with no image, a
   link to nowhere, or no title. Checking one of the five (this gate
   used to check only data-share-kind) proves nothing about the other
   four: they are five separate template expressions.

   Parsed, not grepped. The minifier sorts attributes, drops the quotes
   where it safely can and decodes entities, so /data-share-image="/ is
   a test of the minifier's mood rather than of the page. */
const SHARE_KEYS = ["data-share-title", "data-share-text", "data-share-url", "data-share-image", "data-share-kind"];
const BARE_SHARE = /\bdata-share(?![-\w=])/;
const SITE_HOST = new URL(ORIGIN).host;

function shareButton(html) {
  for (const tag of html.match(/<[a-z][^>]*\bdata-share\b[^>]*>/gi) || []) {
    if (!BARE_SHARE.test(tag)) continue; // data-share-title alone is not the hook
    const attrs = {};
    ATTR.lastIndex = 0;
    let m;
    while ((m = ATTR.exec(tag))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
    return attrs;
  }
  return null;
}

/* Returns a list of everything wrong with this page's Share button.
   Empty list = all five attributes present, non-empty, and pointing
   where they claim to. */
function shareProblems(html, { pageUrl, kind, wantImage }) {
  const out = [];
  const a = shareButton(html);
  if (!a) return ["no [data-share] button"];
  for (const k of SHARE_KEYS) {
    if (!(k in a)) out.push(`${k} missing`);
    else if (!String(a[k]).trim()) out.push(`${k} empty`);
  }
  if (out.length) return out; // the values below would be undefined

  if (a["data-share-kind"] !== kind) out.push(`kind=${a["data-share-kind"]} wanted ${kind}`);

  const url = a["data-share-url"];
  let u = null;
  try { u = new URL(url); } catch { /* not absolute */ }
  if (!u || u.protocol !== "https:" || u.host !== SITE_HOST) out.push(`url is not an absolute https URL on ${SITE_HOST}: ${url}`);
  else if (url !== `${ORIGIN}${pageUrl}`) out.push(`url=${url} wanted ${ORIGIN}${pageUrl}`);

  const img = a["data-share-image"];
  let i = null;
  try { i = new URL(img); } catch { /* not absolute */ }
  if (!i || i.protocol !== "https:" || i.host !== SITE_HOST) out.push(`image is not an absolute https URL on ${SITE_HOST}: ${img}`);
  else if (!/^\/og\/.+\.png$/.test(i.pathname)) out.push(`image is not a /og/... .png: ${img}`);
  else if (img !== wantImage) out.push(`image=${img} wanted ${wantImage}`);
  else {
    const card = resolve(ROOT, "." + i.pathname);
    if (!existsSync(card)) out.push(`the card it points at is not in _site: ${i.pathname}`);
    else {
      if (!cardCache.has(card)) cardCache.set(card, isPng(card));
      if (!cardCache.get(card)) out.push(`that card is not a PNG: ${i.pathname}`);
    }
  }
  return out;
}

for (const c of CORPORA) {
  const data = items[c.kind];
  let badImg = [], missingCard = [], notPng = [], badHref = [], noHref = [], badCanon = [];
  let sawSave = 0;
  let shareOk = 0, shareEg = [];
  for (const it of data) {
    const file = join(ROOT, c.dir, it.id, "index.html");
    if (!existsSync(file)) continue;
    const html = readFileSync(file, "utf8");
    const m = metaMap(html);

    const wantImg = `${ORIGIN}/og/${c.kind}/${it.id}.png`;
    if (m.get("og:image") !== wantImg && badImg.length < 3) badImg.push(`${it.id} → ${m.get("og:image")}`);
    const card = resolve(ROOT, "og", c.kind, `${it.id}.png`);
    if (!existsSync(card)) { if (missingCard.length < 3) missingCard.push(it.id); }
    else {
      // PNG headers are read once per card; 1,547 opens, 8 bytes each.
      if (!cardCache.has(card)) cardCache.set(card, isPng(card));
      if (!cardCache.get(card) && notPng.length < 3) notPng.push(it.id);
    }

    const want = c.kind === "quote"
      ? `/practice/?mode=quote&quote=id&qid=${it.id}&from=quote`
      : `/practice/?mode=${c.mode}&${c.param}=${it.id}&from=${c.kind}`;
    const got = typeThisHref(html);
    if (got === null) { if (noHref.length < 3) noHref.push(it.id); }
    else if (got !== want && badHref.length < 3) badHref.push(`${it.id} → ${got} (wanted ${want})`);

    if (m.get("og:url") !== `${ORIGIN}/${c.dir}/${it.id}/` && badCanon.length < 3) {
      badCanon.push(`${it.id} → ${m.get("og:url")}`);
    }
    const sp = shareProblems(html, {
      pageUrl: `/${c.dir}/${it.id}/`,
      kind: c.kind,
      wantImage: `${ORIGIN}/og/${c.kind}/${it.id}.png`,
    });
    if (sp.length === 0) shareOk++;
    else if (shareEg.length < 3) shareEg.push(`${it.id}: ${sp.join("; ")}`);
    if (/id=["']?corpus-save["'\s>]/.test(html)) sawSave++;
  }
  const n = data.length;
  chk(badImg.length === 0, `${c.kind}: every og:image is /og/${c.kind}/<id>.png`, badImg.join(" | "));
  chk(missingCard.length === 0, `${c.kind}: every one of those ${n} cards exists in _site`, missingCard.join(", "));
  chk(notPng.length === 0, `${c.kind}: every card starts with a PNG signature`, notPng.join(", "));
  chk(noHref.length === 0, `${c.kind}: every page has a Type this link`, noHref.join(", "));
  chk(badHref.length === 0, `${c.kind}: every Type this link is the id-based deep link`, badHref.join(" | "));
  chk(badCanon.length === 0, `${c.kind}: og:url is the page's own absolute URL`, badCanon.join(" | "));
  chk(shareOk === n, `${c.kind}: every page carries a Share button with all five data-share-* attributes`,
    `${shareOk}/${n} complete${shareEg.length ? " — " + shareEg.join(" | ") : ""}`);
  chk(sawSave === n, `${c.kind}: every page carries Save to my texts`, `${sawSave}/${n}`);
}

// ── D. the sitemap ──────────────────────────────────────────────────
console.log("\nD. sitemap");

const sitemapPath = join(ROOT, "sitemap.xml");
if (!existsSync(sitemapPath)) chk(false, "sitemap.xml exists");
else {
  const xml = readFileSync(sitemapPath, "utf8");
  const locs = new Set((xml.match(/<loc>([^<]+)<\/loc>/g) || []).map((s) => s.slice(5, -6)));
  chk(locs.size > 1500, "sitemap lists the whole site", `${locs.size} urls`);
  for (const c of CORPORA) {
    const data = items[c.kind];
    const missing = data.filter((it) => !locs.has(`${ORIGIN}/${c.dir}/${it.id}/`));
    chk(missing.length === 0, `sitemap lists all ${data.length} ${c.kind} pages`,
      missing.length ? `${missing.length} missing, e.g. ${missing.slice(0, 3).map((x) => x.id).join(", ")}` : "");
  }
}

// ── K. the same five attributes on every /library/<slug>/ page ──────
/* K and L are new; they carry on from the letters already in use
   rather than renumbering the sections around them, which would make
   every heading in the diff look changed. */
console.log("\nK. the five share attributes on the book pages");

/* The slug of every book, read from the file that produced the page
   rather than from the directory listing -- a page built from a book
   that no longer exists would otherwise check itself. The books are
   188 MB of full text between them, so only the head of each file is
   read; the slug is the first key. */
const BOOKS_DIR = join(SRC, "data", "books");
const bookFiles = existsSync(BOOKS_DIR) ? readdirSync(BOOKS_DIR).filter((f) => f.endsWith(".json")) : [];
const bookSlugs = [];
for (const f of bookFiles) {
  const fd = openSync(join(BOOKS_DIR, f), "r");
  const buf = Buffer.alloc(4096);
  const n = readSync(fd, buf, 0, 4096, 0);
  closeSync(fd);
  const m = buf.slice(0, n).toString("utf8").match(/"slug"\s*:\s*"([^"]+)"/);
  if (m) bookSlugs.push(m[1]);
}
chk(bookSlugs.length === bookFiles.length && bookSlugs.length > 0,
  "every book JSON names a slug", `${bookSlugs.length}/${bookFiles.length}`);

let bookPages = 0, bookShareOk = 0, bookShareEg = [], bookMissing = [];
for (const slug of bookSlugs) {
  const file = join(ROOT, "library", slug, "index.html");
  if (!existsSync(file)) { if (bookMissing.length < 3) bookMissing.push(slug); continue; }
  bookPages++;
  const html = readFileSync(file, "utf8");
  const sp = shareProblems(html, {
    pageUrl: `/library/${slug}/`,
    kind: "book",
    wantImage: `${ORIGIN}/og/book/${slug}.png`,
  });
  if (sp.length === 0) bookShareOk++;
  else if (bookShareEg.length < 3) bookShareEg.push(`${slug}: ${sp.join("; ")}`);
}
chk(bookMissing.length === 0, `/library/ has a page for every book`,
  `${bookPages}/${bookSlugs.length}${bookMissing.length ? " — missing " + bookMissing.join(", ") : ""}`);
chk(bookShareOk === bookSlugs.length,
  "every book page carries a Share button with all five data-share-* attributes",
  `${bookShareOk}/${bookSlugs.length} complete${bookShareEg.length ? " — " + bookShareEg.join(" | ") : ""}`);

/* Anti-vacuity for the two checks above and their four siblings in
   section C: shareProblems() must be able to SAY no. Feed it a button
   with each attribute removed in turn and one with a card that was
   never rendered, and confirm each is caught. Without this, a helper
   that returned [] on everything would report 1,818 perfect pages. */
const GOOD = `<button data-share data-share-title="T" data-share-text="X"`
  + ` data-share-url="${ORIGIN}/library/s/" data-share-image="${ORIGIN}/og/book/${bookSlugs[0]}.png"`
  + ` data-share-kind="book">Share</button>`;
const ARGS = { pageUrl: "/library/s/", kind: "book", wantImage: `${ORIGIN}/og/book/${bookSlugs[0]}.png` };
chk(shareProblems(GOOD, ARGS).length === 0, "the attribute reader passes a complete button",
  shareProblems(GOOD, ARGS).join("; "));
let caught = 0;
for (const k of SHARE_KEYS) {
  const mutated = GOOD.replace(new RegExp(`\\s${k}="[^"]*"`), "");
  if (mutated !== GOOD && shareProblems(mutated, ARGS).length > 0) caught++;
}
chk(caught === SHARE_KEYS.length, "and fails a button with any ONE of the five removed",
  `${caught}/${SHARE_KEYS.length} caught`);
const noCard = GOOD.replace(/data-share-image="[^"]*"/, `data-share-image="${ORIGIN}/og/book/no-such-book-9x.png"`);
chk(shareProblems(noCard, { ...ARGS, wantImage: `${ORIGIN}/og/book/no-such-book-9x.png` }).length > 0,
  "and fails an image URL whose card is not in _site");
const relative = GOOD.replace(/data-share-url="[^"]*"/, `data-share-url="/library/s/"`);
chk(shareProblems(relative, ARGS).length > 0, "and fails a data-share-url that is not absolute");
const httpUrl = GOOD.replace(/data-share-url="[^"]*"/, `data-share-url="http://${SITE_HOST}/library/s/"`);
chk(shareProblems(httpUrl, ARGS).length > 0, "and fails a data-share-url that is not https");

// ── the server ──────────────────────────────────────────────────────
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon", ".xml": "application/xml; charset=utf-8",
};
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    } catch {
      if (!extname(file)) file += ".html";
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});
await new Promise((ok, no) => {
  server.on("error", no);
  server.listen(PORT, "127.0.0.1", ok);
}).catch((e) => {
  console.log(`  FAIL  could not bind 127.0.0.1:${PORT} — ${e.code || e.message}`);
  abort("refusing to share a port with something else.");
});
const B = `http://127.0.0.1:${PORT}`;

console.log("\nE. the server answering is this build");
const probe = await fetch(B + "/practice/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe) && /id=["']?tt-stage["'\s>]/.test(probe);
chk(isThisProject, `server on ${PORT} is this project's /practice/`,
  isThisProject ? "" : `${probe.length} bytes back`);
if (!isThisProject) { server.close(); abort("refusing to test something that is not this build."); }

// ── the browser ─────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block", hasTouch: false });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

const done = async (code) => {
  await browser.close();
  server.close();
  printCounts();
  process.exit(code);
};

/* Wait for a selector and answer yes or no instead of throwing. Every
   wait below is something a broken change can make never appear, and
   a throw here costs the whole report -- the counts, the sections that
   had already passed, and the name of the thing that never showed up.
   `state` is explicit because Playwright's default is "visible", which
   is the right question for the completion tick (it is [hidden] and an
   author display rule beats the UA's [hidden] rule) and the wrong one
   for an element that is merely present. */
const seen = (sel, { state = "visible", timeout = 20000 } = {}) =>
  page.waitForSelector(sel, { state, timeout }).then(() => true).catch(() => false);

const surfaceText = () => page.$$eval(".tt-char", (els) =>
  els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
const attrTitle = () => page.textContent("#tt-attribution .tt-attribution__title").catch(() => null);

/* Fixtures picked FROM the data, not hardcoded: the shortest idiom
   (it gets typed key by key at human pace), the first parable that
   actually has a moral, the first poem. */
const shortestIdiom = items.idiom
  .filter((i) => /^[\x20-\x7e]+$/.test(i.text))
  .sort((a, b) => a.text.length - b.text.length)[0];
const moralParable = items.parable
  .filter((p) => p.moral && /^[\x20-\x7e\s]+$/.test(p.text + p.moral))
  .sort((a, b) => (a.text.length + a.moral.length) - (b.text.length + b.moral.length))[0];
const firstPoem = items.poem[0];

// Start from a clean profile so the tick assertions mean something.
await page.goto(B + "/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());

// ── F. the deep links really type the piece on the page ─────────────
console.log("\nF. Type this opens that exact piece");

async function openAndType(pathname) {
  await page.goto(B + pathname, { waitUntil: "domcontentloaded" });
  const link = await page.getAttribute("[data-type-this]", "href").catch(() => null);
  await page.click("[data-type-this]").catch(() => {});
  const up = await seen(".tt-char");
  if (!up) chk(false, `the typing surface never rendered after Type this on ${pathname}`);
  return link;
}

/* Before anything is typed: the tick must not be showing. It is an
   [hidden] element whose class sets `display`, and an author display
   rule beats the UA's [hidden] rule -- so "hidden" in the DOM and
   "invisible on screen" are two different questions here, and only the
   second one is the one a reader sees. This assertion is what makes
   "the page shows its tick" below mean something. */
await page.goto(B + `/poetry/${firstPoem.id}/`, { waitUntil: "domcontentloaded" });
chk(await seen(".corpus-page__title"), `the poem page /poetry/${firstPoem.id}/ renders its title`);
const freshTick = await page.isVisible("#corpus-done");
chk(freshTick === false, "a piece nobody has typed does not show a completion tick", `visible=${freshTick}`);

// poem
const poemLink = await openAndType(`/poetry/${firstPoem.id}/`);
chk(/pid=/.test(page.url()) && page.url().includes(firstPoem.id),
  "poem: the click landed on a pid deep link", page.url().replace(B, ""));
const poemChars = await page.$$eval(".tt-char", (e) => e.length);
chk(poemChars > 0, "poem: the typing surface rendered characters", `${poemChars} chars`);
const poemWant = String(firstPoem.text).replace(/\r\n?/g, "\n").split("\n")
  .map((l) => l.replace(/[ \t]+$/, "")).filter((l) => l.trim()).join(" ");
const poemGot = await surfaceText();
chk(poemGot === poemWant, "poem: the surface holds THAT poem, line by line",
  poemGot === poemWant ? `${poemGot.length} chars` : JSON.stringify(poemGot.slice(0, 70)));
chk((await attrTitle()) === firstPoem.title, "poem: the attribution names the poem", JSON.stringify(await attrTitle()));
chk(poemChars === poemWant.length, "poem: every character of it is typeable", `${poemChars} vs ${poemWant.length}`);

// idiom
await openAndType(`/idioms/${shortestIdiom.id}/`);
chk(page.url().includes(`iid=${shortestIdiom.id}`), "idiom: the click landed on an iid deep link", page.url().replace(B, ""));
const idiomGot = await surfaceText();
chk(idiomGot === shortestIdiom.text, "idiom: the surface holds THAT idiom", JSON.stringify(idiomGot));
chk((await attrTitle()) === shortestIdiom.text, "idiom: the attribution names it", JSON.stringify(await attrTitle()));
const meaning = (await page.textContent("#tt-attribution .tt-attribution__meaning").catch(() => "")) || "";
chk(meaning.includes(shortestIdiom.meaning), "idiom: its meaning shows above the surface", JSON.stringify(meaning.trim()));

// parable — the one that was not an engine mode at all before
await openAndType(`/parables/${moralParable.id}/`);
chk(page.url().includes(`mode=parable`) && page.url().includes(`pid=${moralParable.id}`),
  "parable: the click landed on the native parable deep link", page.url().replace(B, ""));
const parGot = await surfaceText();
const parWant = `${moralParable.text.trim()} ${moralParable.moral.trim()}`;
chk(parGot === parWant, "parable: the surface holds the story AND its moral",
  parGot === parWant ? `${parGot.length} chars` : JSON.stringify(parGot.slice(0, 80)));
const paras = await page.$$eval("#tt-text .tt-paragraph", (e) => e.length);
chk(paras === 2, "parable: two paragraph blocks — the moral is its own", `${paras} block(s)`);
const kindAttr = await page.getAttribute("#tt-text", "data-kind");
chk(kindAttr === "parable", "parable: the surface is tagged data-kind=parable, so the moral gets its styling", String(kindAttr));
chk((await attrTitle()) === moralParable.title, "parable: the attribution names it", JSON.stringify(await attrTitle()));
const backLink = (await page.textContent("#tt-back-link").catch(() => "")) || "";
chk(/parables/i.test(backLink), "parable: the back link points at the parable index", JSON.stringify(backLink.trim()));

// ── G. typing one through records completion where the list reads it ─
console.log("\nG. finishing an idiom records it");

const progressFor = (kind, id) => page.evaluate(([k, i]) => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const active = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const p = ps.find((x) => x.id === active) || ps[0];
  return ((p && p.corpusProgress && p.corpusProgress[k]) || {})[i] || null;
}, [kind, id]);

chk((await progressFor("idiom", shortestIdiom.id)) === null,
  "idiom: no completion record before the run — the check below cannot pass by accident");

await page.goto(`${B}/practice/?mode=idiom&iid=${shortestIdiom.id}&from=idiom`, { waitUntil: "networkidle" });
chk(await seen(".tt-char"), "the idiom deep link renders a typing surface");
await page.click(".tt-stage").catch(() => {});
const target = await surfaceText();
chk(target === shortestIdiom.text, "idiom: about to type exactly the idiom", JSON.stringify(target));
/* 70 ms a key. The engine marks anything over 250 wpm as suspect and
   a suspect run is treated differently downstream, so a 4 ms robot
   would be testing a path no human takes. */
for (const ch of target) await page.keyboard.type(ch, { delay: 70 });
await page.waitForTimeout(600);

const rec = await progressFor("idiom", shortestIdiom.id);
chk(!!rec, "idiom: corpusProgress.idiom[<id>] was written", JSON.stringify(rec));
chk(!!rec && typeof rec.wpm === "number" && rec.acc >= 80,
  "idiom: the record carries the run's numbers", JSON.stringify(rec));

await page.goto(B + "/idioms/", { waitUntil: "domcontentloaded" });
chk(await seen(".corpus-table__row"), "/idioms/ renders its rows");
const rowState = await page.evaluate((id) => {
  const row = document.querySelector(`.corpus-table__row[data-id="${id}"]`);
  if (!row) return { found: false };
  const other = [...document.querySelectorAll(".corpus-table__row")].find((r) => r.dataset.id !== id);
  return {
    found: true,
    tick: !!row.querySelector(".corpus-table__check"),
    open: (row.querySelector(".corpus-table__open") || {}).getAttribute
      ? row.querySelector(".corpus-table__open").getAttribute("href") : null,
    otherTick: other ? !!other.querySelector(".corpus-table__check") : null,
  };
}, shortestIdiom.id);
chk(rowState.found, "the idiom's row is on /idioms/");
chk(rowState.tick === true, "the list page shows its completion tick");
chk(rowState.otherTick === false, "a row that was not typed has no tick — the tick means something");
chk(rowState.open === `/idioms/${shortestIdiom.id}/`, "the row links to the item page", String(rowState.open));

await page.goto(B + `/idioms/${shortestIdiom.id}/`, { waitUntil: "domcontentloaded" });
/* The tick is [hidden] in the markup and unhidden by the page's own
   module once it reads the run out of the profile. If that module is
   missing or broken it never appears -- which is a FAIL with the rest
   of the report intact, not a TimeoutError that takes the run down
   before it can print a single number. */
const tickShowed = await seen("#corpus-done");
chk(tickShowed, "the completion tick appeared on the item page within 20s",
  tickShowed ? "" : "#corpus-done never became visible — the page never read the run");
const tickHidden = await page.$eval("#corpus-done", (el) => el.hidden).catch(() => null);
const tickVisible = await page.isVisible("#corpus-done").catch(() => false);
const tickText = await page.textContent("#corpus-done").catch(() => null);
chk(tickHidden === false, "the item page unhides its own completion tick");
chk(tickVisible === true, "and the tick is actually on screen", `visible=${tickVisible}`);
/* Visibility is part of this assertion on purpose: the element's
   markup says "Typed" whether or not it is shown, so a text-only
   check passes on a page whose tick never appeared. */
chk(tickHidden === false && /typed/i.test(tickText || "") && /\d+\s*wpm/i.test(tickText || ""),
  "the visible tick names the run", JSON.stringify((tickText || "").trim()));

// ── H. Save to my texts ─────────────────────────────────────────────
console.log("\nH. Save to my texts");

const customTexts = () => page.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]"));
await page.goto(B + `/parables/${moralParable.id}/`, { waitUntil: "domcontentloaded" });
chk(await seen("#corpus-save"), "the parable page offers Save to my texts");
const before = await customTexts();
chk(before.length === 0, "no saved texts before the click", `${before.length} record(s)`);
await page.click("#corpus-save").catch(() => {});
await page.waitForFunction(() => (JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")).length > 0,
  null, { timeout: 10000 }).catch(() => {});
const after = await customTexts();
chk(after.length === 1, "one record in tt:custom-texts after the click", `${after.length} record(s)`);
const saved = after[0] || {};
chk(saved.title === moralParable.title, "it is saved under the parable's title", JSON.stringify(saved.title));
chk(saved.meta && saved.meta.kind === "parable" && saved.meta.sourceId === moralParable.id,
  "its meta carries kind + sourceId, so completion still records against the corpus", JSON.stringify(saved.meta));
chk(saved.meta && saved.meta.moral === moralParable.moral, "the moral travelled with it", JSON.stringify(saved.meta && saved.meta.moral));

// ── J. a native corpus session finishes, and advances ───────────────
console.log("\nJ. finishing a native parable / idiom session");

/* This is the section that proves the engine change. "parable" had to
   be added to typing-engine's end-of-target mode list: without it the
   cursor runs past the last character and the session NEVER finishes,
   so nothing is recorded and nothing advances -- and every assertion
   in section F would still pass, because the text renders fine.

   It also proves the auto-advance route for the native modes.
   getAutoAdvanceAction used to send them down the "restart" path,
   which re-runs buildText -- and buildText honours the pinned id, so a
   session opened from an item page would have served the same piece
   for ever. */
const autoMap = () => page.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const active = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const p = ps.find((x) => x.id === active) || ps[0];
  return (p && p.preferences && p.preferences.autoAdvance) || {};
});

async function advanceRun(kind, param, id, label) {
  await page.goto(`${B}/practice/?mode=${kind}&${param}=${id}&from=${kind}`, { waitUntil: "networkidle" });
  if (!(await seen(".tt-char"))) {
    chk(false, `${label}: the deep link never rendered a typing surface`, `mode=${kind}&${param}=${id}`);
    return null;
  }
  const hasBtn = await page.isVisible("#tt-autoadvance");
  chk(hasBtn, `${label}: the toolbar offers an Auto button`);
  if (!hasBtn) return null;
  if ((await page.getAttribute("#tt-autoadvance", "aria-pressed")) !== "true") {
    await page.click("#tt-autoadvance");
  }
  chk((await autoMap())[kind] === true, `${label}: the switch is keyed on "${kind}"`, JSON.stringify(await autoMap()));
  await page.click(".tt-stage").catch(() => {});
  const before = await surfaceText();
  for (const ch of before) await page.keyboard.type(ch, { delay: 70 });
  await page.waitForTimeout(1200);
  return { before, url: page.url(), after: await surfaceText() };
}

const parRun = await advanceRun("parable", "pid", moralParable.id, "parable");
if (parRun) {
  chk(parRun.before === parWant, "parable: typed the whole piece, moral included", `${parRun.before.length} chars`);
  /* Both halves in one assertion on purpose. "The card is hidden" is
     also true of a session that never ended at all -- which is exactly
     what happens when the engine does not know the mode. The last-run
     strip only appears after an advance actually ran. */
  const cardHidden = await page.$eval("#tt-results", (el) => el.hidden);
  const stripUp = await page.isVisible("#tt-last-run");
  chk(cardHidden && stripUp,
    "parable: the session FINISHED and advanced in place — card stayed hidden, last-run strip appeared",
    `card hidden ${cardHidden}, strip visible ${stripUp}`);
  chk(!parRun.url.includes(`pid=${moralParable.id}`) && /pid=/.test(parRun.url),
    "parable: the URL moved to a different parable id", parRun.url.replace(B, ""));
  chk(parRun.after.length > 0 && parRun.after !== parRun.before,
    "parable: a different parable is on the surface", JSON.stringify(parRun.after.slice(0, 50)));
  const prec = await progressFor("parable", moralParable.id);
  chk(!!prec, "parable: completion recorded against the corpus id, not a local one", JSON.stringify(prec));
  const strip = (await page.textContent("#tt-last-run").catch(() => "")) || "";
  chk(/parable done/i.test(strip), "parable: the last-run strip names it", JSON.stringify(strip.trim()));
}

const secondIdiom = items.idiom
  .filter((i) => i.id !== shortestIdiom.id && /^[\x20-\x7e]+$/.test(i.text))
  .sort((a, b) => a.text.length - b.text.length)[0];
const idRun = await advanceRun("idiom", "iid", secondIdiom.id, "idiom");
if (idRun) {
  const cardHidden = await page.$eval("#tt-results", (el) => el.hidden);
  const stripUp = await page.isVisible("#tt-last-run");
  chk(cardHidden && stripUp, "idiom: advanced in place — card stayed hidden, last-run strip appeared",
    `card hidden ${cardHidden}, strip visible ${stripUp}`);
  chk(!idRun.url.includes(`iid=${secondIdiom.id}`) && /iid=/.test(idRun.url),
    "idiom: the URL moved to a different idiom id", idRun.url.replace(B, ""));
  chk(idRun.after !== idRun.before, "idiom: a different idiom is on the surface", JSON.stringify(idRun.after));
  chk(!!(await progressFor("idiom", secondIdiom.id)), "idiom: completion recorded");
}

// ── L. every poem page shows the poem's own shape ───────────────────
console.log("\nL. the poems keep their indentation");

/* A poem's indentation is not decoration, it is the poem. 45 of the
   122 in poetry.json indent at least one line, and the build was
   throwing those spaces away: `.poem-line` is styled
   `white-space: pre-wrap`, so the browser would have kept them, but
   html-minifier runs first and collapses every run of whitespace in a
   text node -- and trims the run that sits against the <p>. The page
   and its own "Type this" surface then disagreed about the shape of
   the poem, on 45 pages, silently.

   src/_data/poems.js now writes the spaces the minifier would destroy
   as non-breaking spaces. This section is the check that the fix is
   still there: for EVERY poem, every rendered line, with U+00A0 mapped
   back to an ordinary space, must equal the line in poetry.json --
   character for character, no trimming at either end.

   Read through the browser, not with a regex over the file: poem text
   holds 200 apostrophes, 38 quote marks and 2 ampersands, and the
   minifier decodes entities as it likes. Only a real HTML parser
   settles what the text of a line actually is. The pages are fetched
   and parsed rather than navigated to: 122 navigations would boot 122
   copies of the page's modules to read text that is already in the
   markup. One of them IS navigated to, below, to prove the two agree. */

const NBSP = "\u00A0"; // an escape, not a raw nbsp: the raw one is invisible in source
const sameLine = (renderedText, jsonLine) => renderedText.replace(/\u00A0/g, " ") === jsonLine;

// The comparison must be able to say no; these two fix that in place.
chk(sameLine(`${NBSP}${NBSP}${NBSP}Life is but an empty dream!`, "   Life is but an empty dream!") === true,
  "the line comparison accepts leading nbsp where the JSON has spaces");
chk(sameLine("Life is but an empty dream!", "   Life is but an empty dream!") === false,
  "and REJECTS the same line with its indentation stripped");

const poemJsonLines = (p) => String(p.text).replace(/\r\n?/g, "\n").split("\n");
const indentedPoems = items.poem.filter((p) => poemJsonLines(p).some((l) => /^ /.test(l)));
const indentedLines = items.poem.reduce((n, p) => n + poemJsonLines(p).filter((l) => /^ /.test(l)).length, 0);
chk(indentedPoems.length > 0 && indentedLines > 0,
  "poetry.json still contains indented poems, so this section has something to check",
  `${indentedPoems.length} of ${items.poem.length} poems, ${indentedLines} indented lines`);

const poemUrls = items.poem.map((p) => `/poetry/${p.id}/`);
const renderedLines = await page.evaluate(async (urls) => {
  const out = {};
  for (const u of urls) {
    try {
      const html = await (await fetch(u, { cache: "no-store" })).text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      out[u] = [...doc.querySelectorAll(".poem-line")].map((el) => ({
        text: el.textContent,
        brk: el.classList.contains("poem-line--break"),
      }));
    } catch (e) {
      out[u] = null;
    }
  }
  return out;
}, poemUrls);

let poemBad = 0, poemEg = [], linesCompared = 0, poemsCompared = 0;
for (const p of items.poem) {
  const want = poemJsonLines(p);
  const got = renderedLines[`/poetry/${p.id}/`];
  let problem = null;
  if (!Array.isArray(got)) problem = "the page did not load";
  else if (got.length !== want.length) problem = `${got.length} rendered lines, ${want.length} in poetry.json`;
  else {
    poemsCompared++;
    for (let i = 0; i < want.length; i++) {
      const blank = want[i] === "";
      /* A blank line is a stanza break and renders as the aria-hidden
         spacer paragraph, whose content is one nbsp on purpose. Its
         text is not compared -- that it IS the spacer, and that no
         other line is, is what is compared. */
      if (got[i].brk !== blank) {
        problem = `line ${i + 1}: ${got[i].brk ? "a stanza break where the poem has text" : "text where the poem has a blank line"}`;
        break;
      }
      if (blank) continue;
      linesCompared++;
      if (!sameLine(got[i].text, want[i])) {
        problem = `line ${i + 1}: rendered ${JSON.stringify(got[i].text.replace(/\u00A0/g, "·"))} vs JSON ${JSON.stringify(want[i])}`;
        break;
      }
    }
  }
  if (problem) { poemBad++; if (poemEg.length < 3) poemEg.push(`${p.id} — ${problem}`); }
}
chk(linesCompared > 0 && poemsCompared > 0, "lines were actually compared",
  `${linesCompared} lines across ${poemsCompared} poems`);
chk(poemBad === 0, "every poem page renders every line exactly as poetry.json stores it",
  `${poemBad} of ${items.poem.length} pages disagree${poemEg.length ? " — " + poemEg.join(" | ") : ""}`);

/* The fetched-and-parsed reading above is only worth anything if it
   says the same thing as the page a reader opens. Navigate to the
   most indented poem and read its lines out of the live DOM. */
const deepest = [...indentedPoems].sort((a, b) =>
  Math.max(...poemJsonLines(b).map((l) => (l.match(/^ +/) || [""])[0].length))
  - Math.max(...poemJsonLines(a).map((l) => (l.match(/^ +/) || [""])[0].length)))[0];
if (deepest) {
  await page.goto(`${B}/poetry/${deepest.id}/`, { waitUntil: "domcontentloaded" });
  const live = await page.$$eval(".poem-line", (els) => els.map((el) => ({
    text: el.textContent, brk: el.classList.contains("poem-line--break"),
  })));
  const parsed = renderedLines[`/poetry/${deepest.id}/`] || [];
  const agree = live.length === parsed.length
    && live.every((l, i) => l.text === parsed[i].text && l.brk === parsed[i].brk);
  chk(agree, `a navigated page reads the same as the parsed one (${deepest.id})`,
    `${live.length} lines vs ${parsed.length}`);
  const wantDeep = poemJsonLines(deepest);
  const liveOk = live.length === wantDeep.length
    && live.every((l, i) => (wantDeep[i] === "" ? l.brk : sameLine(l.text, wantDeep[i])));
  chk(liveOk, `and the live page's lines are the JSON's lines (${deepest.id})`,
    liveOk ? `${live.length} lines` : JSON.stringify(live.slice(0, 3).map((l) => l.text.replace(/\u00A0/g, "·"))));
}

console.log("\nI. the browser had nothing to complain about");
chk(pageErrors.length === 0, "no uncaught page errors during the run", pageErrors.slice(0, 2).join(" | "));

await done(fail ? 1 : 0);
