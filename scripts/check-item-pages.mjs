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
import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
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
const abort = (why) => {
  console.log(`\nRUN ABORTED — ${why}`);
  console.log(`\n${pass} passed, ${fail} failed`);
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
for (const c of CORPORA) {
  const data = items[c.kind];
  let badImg = [], missingCard = [], notPng = [], badHref = [], noHref = [], badCanon = [];
  let sawShare = 0, sawSave = 0;
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
    if (/data-share-kind=["']?/.test(html)) sawShare++;
    if (/id=["']?corpus-save["'\s>]/.test(html)) sawSave++;
  }
  const n = data.length;
  chk(badImg.length === 0, `${c.kind}: every og:image is /og/${c.kind}/<id>.png`, badImg.join(" | "));
  chk(missingCard.length === 0, `${c.kind}: every one of those ${n} cards exists in _site`, missingCard.join(", "));
  chk(notPng.length === 0, `${c.kind}: every card starts with a PNG signature`, notPng.join(", "));
  chk(noHref.length === 0, `${c.kind}: every page has a Type this link`, noHref.join(", "));
  chk(badHref.length === 0, `${c.kind}: every Type this link is the id-based deep link`, badHref.join(" | "));
  chk(badCanon.length === 0, `${c.kind}: og:url is the page's own absolute URL`, badCanon.join(" | "));
  chk(sawShare === n, `${c.kind}: every page carries a Share button for the share module`, `${sawShare}/${n}`);
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
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(code);
};

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
  await page.click("[data-type-this]");
  await page.waitForSelector(".tt-char", { timeout: 20000 });
  return link;
}

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
await page.waitForSelector(".tt-char", { timeout: 20000 });
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
await page.waitForSelector(".corpus-table__row", { timeout: 20000 });
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
await page.waitForSelector("#corpus-done", { timeout: 20000 });
const tickHidden = await page.$eval("#corpus-done", (el) => el.hidden);
const tickText = await page.textContent("#corpus-done");
chk(tickHidden === false, "the item page shows its own completion tick");
chk(/typed/i.test(tickText || ""), "the tick says what it means", JSON.stringify((tickText || "").trim()));

// ── H. Save to my texts ─────────────────────────────────────────────
console.log("\nH. Save to my texts");

const customTexts = () => page.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]"));
await page.goto(B + `/parables/${moralParable.id}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#corpus-save", { timeout: 20000 });
const before = await customTexts();
chk(before.length === 0, "no saved texts before the click", `${before.length} record(s)`);
await page.click("#corpus-save");
await page.waitForFunction(() => (JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")).length > 0,
  null, { timeout: 10000 }).catch(() => {});
const after = await customTexts();
chk(after.length === 1, "one record in tt:custom-texts after the click", `${after.length} record(s)`);
const saved = after[0] || {};
chk(saved.title === moralParable.title, "it is saved under the parable's title", JSON.stringify(saved.title));
chk(saved.meta && saved.meta.kind === "parable" && saved.meta.sourceId === moralParable.id,
  "its meta carries kind + sourceId, so completion still records against the corpus", JSON.stringify(saved.meta));
chk(saved.meta && saved.meta.moral === moralParable.moral, "the moral travelled with it", JSON.stringify(saved.meta && saved.meta.moral));

console.log("\nI. the browser had nothing to complain about");
chk(pageErrors.length === 0, "no uncaught page errors during the run", pageErrors.slice(0, 2).join(" | "));

await done(fail ? 1 : 0);
