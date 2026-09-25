/* Download PNG on a result typed from a text of your own.

   The server renders 1,212 Free-plan result cards ahead of time, one per
   wpm x accuracy-band pair, and a run on your own text gets one of those
   -- a number, a band, no words. It cannot be anything else: the text is
   on your device and nowhere else, so there is no machine at
   guerillatype.com that could draw it. The browser can. This gate is
   about the one place in the product where that matters.

   What must hold:

     A. The server under test is this build. A 200 is not evidence.
     B. A custom-text run, typed to the end at 70 ms/key, downloads a
        1200x630 PNG that is NOT the pre-rendered grid card for the same
        numbers -- different bytes, different pixels on sampled rows --
        and the excerpt is really in those pixels (the same model with
        the text removed renders to different bytes). The render is
        deterministic, the sheet says where the picture came from in
        those exact words, and analytics record method=local.
     C. Nothing left the device while it was drawn. Every request made
        during the render is same-origin, none carries the typed words or
        the text's id, and the grid card is not fetched at all.
     D. A public run is untouched: a words-mode result still downloads
        the pre-rendered card, byte for byte, with method=server and no
        mention of a local picture.
     E. When the renderer cannot run -- the wasm, the satori bundle, a
        font or a vendored lib/og module blocked, and a wasm served as
        an HTML error page with a 200 -- the grid card downloads byte
        for byte, the user is told in those exact words that the picture
        will not have their text, and NOTHING reaches window.onerror or
        window.onunhandledrejection. main.js reports both to analytics
        as js_error, so a failure we have already handled must not also
        be filed as a bug by the user's browser.
     F. The browser draws the SAME card the build does. Every file
        /assets/js/og/ serves is byte-identical to its source, every
        import in the shipped module resolves to a file that exists, and
        the SVG the browser produces for a fixture is byte-identical to
        the one scripts/lib/og-node.mjs produces for it. That last one is
        the whole anti-drift argument: not "it looks similar", the same
        bytes out of the same card.js.
     G. The same text read by chapter (?book=custom:<id>) is the same
        private text. It reaches the results card by a different route
        -- state.bookSlug set, state.mode "book" -- so nothing above
        covers it.
     H. /r/, where a shared result's text arrives in the fragment.
        Browsers never put a fragment on the wire, so it is on that
        device and nowhere else: same situation, same answer. A public
        result still gets the server's card, and drawing a picture must
        not be the thing that finally sends the fragment anywhere.
     I. navigator.share -- the system sheet, which is where a phone
        actually shares and the only path that can attach a file --
        carries the SAME picture. It used to attach the grid card for
        every result, including the private ones this file is about.
        navigator.share and navigator.canShare are stubbed in the page
        and every File they receive is decoded: the local card for a
        private result (byte-identical to what Download PNG draws from
        the same open sheet), the grid card for a public one, and the
        grid card with the same apology when the renderer cannot run.

   Section F is the one that makes the rest worth having. B could pass
   forever against a hand-drawn canvas copy that slowly stopped looking
   like the real card; F cannot.

   Usage:
     OG_SKIP=1 npm run build     then copy a full build's _site/og in,
                                 or build without OG_SKIP -- sections B,
                                 D and E all read a real grid card.
     npm run share-local-png
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { chromium } from "playwright";

/* The Node side of the very things the browser is running. Imported,
   never re-stated: a gate carrying its own copy of the band table or the
   model shape is a gate that can agree with itself while the product is
   wrong. */
import { bandFor as nodeBandFor } from "../lib/og/labels.js";
import { validate as nodeValidate } from "../lib/og/validate.js";
import { FONT_FILES } from "../lib/og/theme.js";
import { createNodeRenderer } from "./lib/og-node.mjs";

/* Port from the task id, not from habit. 8080 is never ours. */
const TASK = "share-local-png";
const PORT = Number(process.env.PORT)
  || 8100 + ([...TASK].reduce((a, c) => a + c.charCodeAt(0), 0) % 600);
const ROOT = resolve("_site");
const SRC = resolve("src");
const LIB = resolve("lib", "og");

let pass = 0, fail = 0;
const chk = (ok, name, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err && err.message ? err.message : err}`);
  console.log("\nRUN ABORTED — the counts below are partial.");
  process.exit(1);
});

/* ── sentinels ─────────────────────────────────────────────────────
   Deliberately not the ones check-share-sheet.mjs uses. Two gates
   sharing a secret word is two gates that can confuse each other's
   leftovers for their own. */
const TEXT_ID = "c_localpng";
const TITLE = "SAFFRONVOLE private notes";
const BODY = "The quillfeather drifted past a brindlewick gate at dusk, and the orchard kept its counsel.";

// ---------------------------------------------------------------- server
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
  ".ico": "image/x-icon", ".xml": "application/xml; charset=utf-8",
};
try {
  await stat(join(ROOT, "practice", "index.html"));
} catch {
  console.log("  FAIL  _site is not built — run `npm run build` first");
  process.exit(1);
}
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
    /* content-length is not decoration here: section B's byte budget is
       read off the responses this server sends. */
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "content-length": String(body.length),
    });
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
  console.log("\nRUN ABORTED — refusing to share a port with something else.");
  process.exit(1);
});
const B = `http://127.0.0.1:${PORT}`;

console.log("\nA. the thing answering the port is this build");
const probe = await fetch(B + "/practice/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe)
  && /id=["']?tt-stage["'\s>]/.test(probe);
chk(isThisProject, `A. server on ${PORT} is this project's /practice/`);
if (!isThisProject) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}
/* A port that answers is not necessarily yours: a verifier once got a
   perfectly good Practice page from another session's build. Compare one
   served file with the one on disk before believing a single check. */
const servedModule = await fetch(B + "/assets/js/share/local-card.js").then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null);
let diskModule = null;
try { diskModule = await readFile(join(ROOT, "assets", "js", "share", "local-card.js")); } catch {}
const sameFile = !!servedModule && !!diskModule
  && Buffer.from(servedModule).equals(diskModule);
chk(sameFile, "A. the local-card.js it serves is the one in THIS worktree's _site",
  servedModule
    ? `${servedModule.byteLength} bytes served`
    : diskModule
      ? "the server would not serve it"
      : "this build has no assets/js/share/local-card.js — the feature is not here");
if (!sameFile) {
  console.log("\nRUN ABORTED — nothing below this point would be testing the change.");
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();

async function bail(msg) {
  chk(false, msg);
  console.log("\nRUN ABORTED — the counts below are partial.");
  await browser.close().catch(() => {});
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

/* One context per section that needs a clean module cache. Third-party
   requests are refused: bunny.net's fonts, instant.page and umami's
   script have nothing to do with drawing a card, and umami's real
   script REPLACES the window.umami stub the moment it loads, which
   would leave section B with no events to read. Refusing them can only
   reveal a dependency, never hide one -- and section C asserts
   separately that the render attempted no off-origin request at all,
   blocked or otherwise. */
async function freshContext() {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: "block",
    hasTouch: false,
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    window.__ttEvents = [];
    window.umami = { track: (name, props) => { window.__ttEvents.push({ name, props: props || {} }); } };
  });
  await context.route((url) => !String(url).startsWith(B), (route) => route.abort());
  return context;
}

/* Anything that runs INSIDE the page can throw for a reason that is the
   very thing under test -- a font that will not load, a wasm that is
   refused. A verifier reverting src/ and re-running this file should see
   a readable FAIL and a count, not a Playwright stack. */
async function inPage(fn, name, fallback) {
  try { return await fn(); }
  catch (err) {
    chk(false, name, String((err && err.message) || err).split("\n")[0].slice(0, 120));
    return fallback;
  }
}

/* Every URL that exists only because the browser is drawing a card.
   /assets/js/og/ is lib/og itself, passthrough-copied for the /r/ page
   and imported by local-card.js rather than copied a second time -- so
   it is on this list, and share-boot.js's own use of labels.js and
   validate.js is NOT, which is why the pattern names the three files
   the renderer adds rather than the directory. */
const RENDERER_URL = /\/assets\/vendor\/|\/assets\/js\/share\/local-card\.js|\/assets\/js\/og\/(card|render|theme)\.js/;

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngInfo(buf) {
  if (!buf || buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  if (buf.toString("latin1", 12, 16) !== "IHDR") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
}

/* Everything a page asked for, whether it was allowed to happen or not,
   plus what it was allowed to download. */
function watch(page) {
  const w = { on: false, requests: [], before: [], bytes: 0 };
  page.on("request", (r) => {
    (w.on ? w.requests : w.before).push({ url: r.url(), method: r.method(), post: r.postData() || "" });
  });
  page.on("response", async (r) => {
    if (!w.on) return;
    const len = Number(r.headers()["content-length"] || 0);
    if (String(r.url()).startsWith(B)) w.bytes += len;
  });
  return w;
}

const surfaceText = (page) => page.$$eval(".tt-char", (els) =>
  els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));

/* 70 ms/key. TypingEngine.finish() flags anything over 250 wpm as
   suspect, and a robot-speed run is a different code path. */
async function typeAll(page, text, wrongAt = []) {
  let i = 0;
  for (const ch of text) {
    if (wrongAt.indexOf(i) !== -1) await page.keyboard.type(ch === "q" ? "z" : "q", { delay: 70 });
    else await page.keyboard.type(ch, { delay: 70 });
    i++;
  }
}

async function seedCustomText(page) {
  await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ id, title, body }) => {
    localStorage.setItem("tt:custom-texts", JSON.stringify([{
      id, title, createdAt: new Date().toISOString(), bytes: body.length,
      lastSeg: 0, segments: [body], meta: null,
    }]));
  }, { id: TEXT_ID, title: TITLE, body: BODY });
}

async function runCustomToTheEnd(page) {
  await seedCustomText(page);
  await page.goto(`${B}/practice/?mode=custom&custom=${TEXT_ID}&seg=0`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tt-char", { timeout: 15000 });
  await page.click(".tt-stage").catch(() => {});
  const target = await surfaceText(page);
  await typeAll(page, target);
  await page.waitForSelector("#tt-results:not([hidden])", { timeout: 20000 });
  return target;
}

const resultNumbers = (page) => page.evaluate(() => {
  const w = document.querySelector(".results__title-num");
  const a = Array.from(document.querySelectorAll(".results__metric"))
    .find((m) => /accuracy/.test(m.textContent));
  return {
    wpm: w ? parseInt(w.textContent, 10) : NaN,
    acc: a ? parseInt(a.querySelector(".results__value").textContent, 10) : NaN,
  };
});

const gridPathFor = (wpm, acc) => `/og/result/${wpm > 200 ? "200p" : wpm}-${nodeBandFor(acc)}.png`;

// ================================================================ B
console.log("\nB. a result on your own text draws its own card");
const ctxB = await freshContext();
const page = await ctxB.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
const wB = watch(page);

const target = await runCustomToTheEnd(page);
chk(target.includes("quillfeather"), "B. the sentinel text is what was typed", JSON.stringify(target.slice(0, 44)));
const nums = await resultNumbers(page);
const share = await page.evaluate(() => Object.assign({}, (document.getElementById("tt-share") || {}).dataset || {}));
chk(share.sharePrivate === "1", "B. the results card marks this run as one the server cannot draw",
  `data-share-private=${JSON.stringify(share.sharePrivate)}`);
chk(share.shareImage === B + gridPathFor(nums.wpm, nums.acc),
  "B. and its og:image is STILL the grid card, by design", share.shareImage);

await page.click("#tt-share");
await page.waitForTimeout(200);
const note = await page.evaluate(() => {
  const el = document.querySelector("[data-share-local-note]");
  return el ? { hidden: el.hidden, text: el.textContent } : null;
});
chk(!!note && note.hidden === false, "B. the sheet shows the local-picture caption");
chk(!!note && note.text === "The picture includes your text and is made on your device",
  "B. and it says exactly that", JSON.stringify(note && note.text));

await page.evaluate(() => { window.__ttEvents.length = 0; });
/* Snapshotted HERE, not read at the end: section B's own differential
   render imports the module directly a few lines below, and a list read
   afterwards would contain that import and accuse the page of eager
   loading. It did, the first time this assertion was written. */
const beforeClick = wB.before.slice();
wB.on = true;
const started = Date.now();
const [dl] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }).catch(() => null),
  page.click("#share-sheet [data-share-download]"),
]);
const renderMs = Date.now() - started;
wB.on = false;
if (!dl) await bail("B. Download PNG produced a download");
const localBuf = await readFile(await dl.path());
const localInfo = pngInfo(localBuf);
chk(/\.png$/.test(dl.suggestedFilename()), "B. the file is named .png", dl.suggestedFilename());
chk(!!localInfo, "B. and it really is a PNG", localInfo ? `${localInfo.bytes} bytes` : "no PNG signature");
chk(!!localInfo && localInfo.w === 1200 && localInfo.h === 630,
  "B. 1200x630, the Open Graph size", localInfo ? `${localInfo.w}x${localInfo.h}` : "?");

const gridDisk = await readFile(join(ROOT, gridPathFor(nums.wpm, nums.acc))).catch(() => null);
if (!gridDisk) await bail(`B. the grid card ${gridPathFor(nums.wpm, nums.acc)} is in the build (build without OG_SKIP=1, or copy _site/og in)`);
const gridInfo = pngInfo(gridDisk);
chk(!!gridInfo && gridInfo.w === 1200 && gridInfo.h === 630,
  "B. the grid card for the same numbers is also 1200x630", gridInfo ? `${gridInfo.w}x${gridInfo.h}` : "?");
chk(localBuf.length !== gridDisk.length,
  "B. the downloaded card is not the grid card (different bytes)",
  `local ${localBuf.length} vs grid ${gridDisk.length}`);

/* Byte length is weak on its own -- two different PNGs could compress to
   the same size. Decode both in the page and walk three rows: the wpm
   digits, the stat row that a grid card does not have, and the excerpt
   panel. */
const rows = await inPage(() => page.evaluate(async ({ a, b }) => {
  const toImage = async (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u8], { type: "image/png" }));
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return c;
  };
  const ca = await toImage(a), cb = await toImage(b);
  const out = { w: ca.width, h: ca.height, sameSize: ca.width === cb.width && ca.height === cb.height, rows: [] };
  for (const y of [200, 320, 410]) {
    const da = ca.getContext("2d").getImageData(0, y, ca.width, 1).data;
    const db = cb.getContext("2d").getImageData(0, y, cb.width, 1).data;
    let diff = 0;
    for (let x = 0; x < ca.width; x++) {
      const i = x * 4;
      if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) diff++;
    }
    out.rows.push({ y, diff, total: ca.width });
  }
  return out;
}, { a: localBuf.toString("base64"), b: gridDisk.toString("base64") }),
  "B. both PNGs decode in the page",
  { w: 0, h: 0, sameSize: false, rows: [{ y: 200, diff: 0, total: 1 }, { y: 320, diff: 0, total: 1 }, { y: 410, diff: 0, total: 1 }] });
chk(rows.sameSize, "B. both decode to the same canvas size, so a pixel diff means content");
const excerptRow = rows.rows.find((r) => r.y === 410);
chk(excerptRow.diff / excerptRow.total > 0.05,
  "B. the excerpt row differs from the grid card's",
  `${excerptRow.diff}/${excerptRow.total} pixels at y=410`);
chk(rows.rows.every((r) => r.diff > 0), "B. every sampled row differs",
  rows.rows.map((r) => `y${r.y}:${r.diff}`).join(" "));

/* Proof the excerpt reached the canvas rather than merely being passed
   in: the same model with the text removed has to come out different.
   The og-render verifier's trick, and the only cheap one that works
   without reading pixels for glyphs. */
const stats = await page.evaluate(() => new URLSearchParams({
  v: "1", wpm: "80", raw: "88", acc: "96.4", con: "88", dur: "47", mode: "custom", d: "2026-09-16",
}).toString());
const diffRender = await inPage(() => page.evaluate(async ({ stats, text }) => {
  const m = await import("/assets/js/share/local-card.js");
  const fnv = (u8) => { let h = 0x811c9dc5; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = (h * 0x01000193) >>> 0; } return h.toString(16); };
  const bytes = async (src) => new Uint8Array(await (await m.renderCardPng(src)).arrayBuffer());
  const withText = await bytes({ stats, text });
  const without = await bytes({ stats, text: "" });
  const again = await bytes({ stats, text });
  return {
    withText: { len: withText.length, hash: fnv(withText) },
    without: { len: without.length, hash: fnv(without) },
    again: { len: again.length, hash: fnv(again) },
  };
}, { stats, text: BODY }),
  "B. the module renders a card when called directly",
  { withText: { len: 0, hash: "threw" }, without: { len: 0, hash: "threw" }, again: { len: 0, hash: "also-threw" } });
chk(diffRender.withText.hash !== diffRender.without.hash,
  "B. removing the excerpt from the model changes the pixels, so it IS drawn",
  `${diffRender.withText.len}B/${diffRender.withText.hash} vs ${diffRender.without.len}B/${diffRender.without.hash}`);
chk(diffRender.withText.hash === diffRender.again.hash,
  "B. and the same model twice is the same bytes (no clock, no randomness)",
  `${diffRender.withText.hash} / ${diffRender.again.hash}`);

const saved = await page.evaluate(() => (window.__ttEvents || []).find((e) => e.name === "share_image_saved") || null);
chk(!!saved && saved.props.method === "local",
  "B. share_image_saved says the picture was made here", JSON.stringify(saved && saved.props));
chk(!!saved && Object.keys(saved.props).join(",") === "kind,mode,method",
  "B. and carries nothing else", JSON.stringify(saved && Object.keys(saved.props)));

/* "Lazy" is a claim about page load, not about the click. Everything the
   page asked for between opening /custom/ and pressing Download PNG --
   two navigations, a whole typing session and the share sheet -- is in
   w.before, and none of it may be the renderer. check-typing-perf.mjs
   would notice the cost; this names the file. */
const early = beforeClick.filter((r) => RENDERER_URL.test(r.url));
chk(early.length === 0,
  "B. none of it was loaded before the click",
  early.map((r) => r.url.replace(B, "")).join(" ") || `${beforeClick.length} requests up to the click, none of them the renderer`);
console.log(`     [first click: ${wB.bytes} bytes from this origin, ${(wB.bytes / 1024 / 1024).toFixed(2)} MB, ${renderMs} ms to the download]`);
chk(wB.bytes > 0 && wB.bytes < 3 * 1024 * 1024,
  "B. the first click stays inside the 3 MB budget",
  `${(wB.bytes / 1024 / 1024).toFixed(2)} MB`);

// ================================================================ C
console.log("\nC. nothing left the device while it was drawn");
const offOrigin = wB.requests.filter((r) => !r.url.startsWith(B));
chk(offOrigin.length === 0, "C. the render asked nothing of any other origin",
  offOrigin.map((r) => r.url).join(" ") || "0 requests off-origin");
const hay = wB.requests.map((r) => `${r.url} ${r.post}`).join(" ");
let hayDecoded = hay;
try { hayDecoded = decodeURIComponent(hay); } catch {}
for (const secret of ["quillfeather", "brindlewick", "SAFFRONVOLE", TEXT_ID]) {
  const found = hay.toLowerCase().includes(secret.toLowerCase())
    || hayDecoded.toLowerCase().includes(secret.toLowerCase())
    || hay.includes(encodeURIComponent(secret));
  chk(!found, `C. no request carries "${secret}"`, found ? "FOUND" : `${wB.requests.length} requests checked`);
}
chk(!/\/og\/result\//.test(hay), "C. and the pre-rendered grid card was never fetched");
chk(wB.requests.length >= 8, "C. there were real requests to check, not an empty list",
  `${wB.requests.length} requests`);
chk(pageErrors.length === 0, "C. the page threw nothing while rendering", pageErrors.join(" | "));
await ctxB.close();

// ================================================================ D
console.log("\nD. a public run is untouched");
const ctxD = await freshContext();
const pageD = await ctxD.newPage();
const wD = watch(pageD);
await pageD.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "domcontentloaded" });
await pageD.waitForSelector(".tt-char", { timeout: 15000 });
await pageD.click(".tt-stage").catch(() => {});
const wordsTarget = await surfaceText(pageD);
/* Two wrong keys, so accuracy lands in a band below 100 and the card
   under test is not the one every run happens to share. */
await typeAll(pageD, wordsTarget, [3, 9]);
await pageD.waitForSelector("#tt-results:not([hidden])", { timeout: 20000 });
const numsD = await resultNumbers(pageD);
chk(numsD.acc < 100, "D. the words run landed below 100 %, so the band is not a constant", `${numsD.acc}%`);
const shareD = await pageD.evaluate(() => Object.assign({}, (document.getElementById("tt-share") || {}).dataset || {}));
chk(shareD.sharePrivate === undefined, "D. a words run is not marked private",
  JSON.stringify(shareD.sharePrivate));
await pageD.click("#tt-share");
await pageD.waitForTimeout(200);
chk(await inPage(() => pageD.evaluate(() => {
  const el = document.querySelector("[data-share-local-note]");
  /* null when share.js is the version from main: the caption does not
     exist there at all, which must read as a FAIL with a count and not
     as a TypeError inside page.evaluate. */
  return el ? el.hidden : "the caption is not in this build";
}), "D. the sheet's caption element can be read", "could not read it") === true,
  "D. the sheet does not claim a local picture");
await pageD.evaluate(() => { window.__ttEvents.length = 0; });
wD.on = true;
const [dlD] = await Promise.all([
  pageD.waitForEvent("download", { timeout: 30000 }).catch(() => null),
  pageD.click("#share-sheet [data-share-download]"),
]);
wD.on = false;
if (!dlD) await bail("D. Download PNG produced a download for the words run");
const gotD = await readFile(await dlD.path());
const wantD = await readFile(join(ROOT, gridPathFor(numsD.wpm, numsD.acc))).catch(() => null);
if (!wantD) await bail(`D. the grid card ${gridPathFor(numsD.wpm, numsD.acc)} is in the build`);
chk(gotD.equals(wantD), "D. it downloads the pre-rendered card BYTE FOR BYTE",
  `${gotD.length} vs ${wantD.length} bytes of ${gridPathFor(numsD.wpm, numsD.acc)}`);
const savedD = await pageD.evaluate(() => (window.__ttEvents || []).find((e) => e.name === "share_image_saved") || null);
chk(!!savedD && savedD.props.method === "server",
  "D. share_image_saved still says method=server", JSON.stringify(savedD && savedD.props));
/* Byte-for-byte equality is not enough on its own: a build that TRIED
   the local renderer for every run and fell back would download the
   same bytes, having pulled 915 KB and flashed a toast on the way. The
   renderer must not be reached at all. */
const reachedRenderer = wD.requests.filter((r) => RENDERER_URL.test(r.url));
chk(reachedRenderer.length === 0,
  "D. and the browser renderer is never even loaded for a public run",
  reachedRenderer.map((r) => r.url.replace(B, "")).join(" ") || `${wD.requests.length} requests, none of them the renderer`);
const toastD = await pageD.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
chk(toastD === "", "D. and nothing is apologised for", JSON.stringify(toastD));
await ctxD.close();

// ================================================================ E
console.log("\nE. when the renderer cannot run");
/* Four ways the renderer can fail to arrive, and one way it can arrive
   broken. satori 0.33 shapes every run of text with HarfBuzz, so a
   blocked hb.wasm is what a corporate proxy or a wasm-hostile CSP
   produces; the other three are a bad deploy or a partial cache.

   Each case must do three things: download the pre-rendered card BYTE
   FOR BYTE, say so in those exact words, and be SILENT. The third is
   not cosmetic. main.js registers window.onerror and
   window.onunhandledrejection and both report js_error to analytics, so
   anything that escapes here is a user's browser telling us about a
   failure we already handled -- and emscripten's abort() does exactly
   that: it rejects its ready promise and then throws the same error
   again from a continuation nobody awaits. That was real, on all three
   engines, and it is why the shim now fetches the wasm itself. */
const BLOCKED = [
  ["the wasm", "**/hb.wasm*", null],
  ["the satori bundle", "**/satori.browser.js*", null],
  ["a font", "**/assets/fonts/og/lora-600.ttf*", null],
  ["a lib/og module", "**/assets/js/og/card.js*", null],
  /* Not blocked: served, with a 200, carrying something that is not
     wasm. A captive portal or a rewritten 404 does this, and it reaches
     further into emscripten than a refused request does. */
  ["a wasm that is really an error page", "**/hb.wasm*",
    { status: 200, contentType: "application/wasm", body: "<html>not wasm</html>" }],
];
for (const [what, pattern, fulfill] of BLOCKED) {
  const ctxE = await freshContext();
  await ctxE.route(pattern, (route) => (fulfill ? route.fulfill(fulfill) : route.abort()));
  const pageE = await ctxE.newPage();
  const errsE = [];
  pageE.on("pageerror", (e) => errsE.push(String(e).slice(0, 140)));
  const targetE = await runCustomToTheEnd(pageE);
  chk(targetE.includes("quillfeather"), `E. [${what}] the same custom run, typed again`);
  const numsE = await resultNumbers(pageE);
  await pageE.click("#tt-share");
  await pageE.waitForTimeout(200);
  await pageE.evaluate(() => { window.__ttEvents.length = 0; });
  const [dlE] = await Promise.all([
    pageE.waitForEvent("download", { timeout: 40000 }).catch(() => null),
    pageE.click("#share-sheet [data-share-download]"),
  ]);
  if (!dlE) await bail(`E. [${what}] there is still a download`);
  const gotE = await readFile(await dlE.path());
  const wantE = await readFile(join(ROOT, gridPathFor(numsE.wpm, numsE.acc))).catch(() => null);
  if (!wantE) await bail(`E. the grid card ${gridPathFor(numsE.wpm, numsE.acc)} is in the build`);
  chk(gotE.equals(wantE), `E. [${what}] the grid card downloads instead, byte for byte`,
    `${gotE.length} bytes of ${gridPathFor(numsE.wpm, numsE.acc)}`);
  const toastE = await pageE.evaluate(() => {
    const t = document.getElementById("toast");
    return t ? { text: t.textContent, hidden: t.hidden, bad: t.classList.contains("toast--bad") } : null;
  });
  chk(!!toastE && toastE.text === "Saved the plain card. The picture will not include your text."
    && toastE.hidden === false && toastE.bad === true,
    `E. [${what}] and the user is told, in those words`, JSON.stringify(toastE && toastE.text));
  const savedE = await pageE.evaluate(() => (window.__ttEvents || []).find((e) => e.name === "share_image_saved") || null);
  chk(!!savedE && savedE.props.method === "server",
    `E. [${what}] analytics record the fallback as method=server`, JSON.stringify(savedE && savedE.props));
  /* Give anything that escaped the chain a turn of the event loop to
     reach window.onunhandledrejection before looking. */
  await pageE.waitForTimeout(800);
  chk(errsE.length === 0, `E. [${what}] nothing escaped to window.onerror`, errsE.join(" | "));
  const reported = await pageE.evaluate(() => (window.__ttEvents || []).filter((e) => e.name === "js_error"));
  chk(reported.length === 0, `E. [${what}] and nothing was reported to analytics as js_error`,
    reported.map((e) => JSON.stringify(e.props)).join(" | ") || "0 js_error events");
  await ctxE.close();
}

// ================================================================ F
console.log("\nF. the browser draws the build's card, not a copy of it");
const VENDOR_OG = ["card.js", "theme.js", "labels.js", "render.js", "validate.js"];
/* The ONE difference allowed between lib/og/x.js and the copy the
   browser gets: eleventy.config.js's import versioner stamps every
   relative import under _site/assets/js with the build's ?v=. Stripped
   here rather than skipped, so a second character of difference still
   fails. */
const unstamp = (t) => t.replace(/(\.\.?\/[^"']+\.js)\?v=\d+/g, "$1");
for (const f of VENDOR_OG) {
  const src = await readFile(join(LIB, f), "utf8").catch(() => null);
  const out = await readFile(join(ROOT, "assets", "js", "og", f), "utf8").catch(() => null);
  const stamps = out ? (out.match(/\?v=\d+/g) || []).length : 0;
  chk(src != null && out != null && unstamp(out) === src,
    `F. /assets/js/og/${f} is lib/og/${f}, byte for byte (bar ${stamps} cache-bust stamp${stamps === 1 ? "" : "s"})`,
    src != null && out != null ? `${out.length} bytes` : "missing from the build");
}
/* The stamps are not decoration: without them the browser would hold a
   second module instance of theme.js -- local-card.js's import carries
   ?v= because the versioner walks /assets/js, card.js's ./theme.js
   would not -- and one design change would live on in a cache. */
const stampedCard = await readFile(join(ROOT, "assets", "js", "og", "card.js"), "utf8").catch(() => "");
chk(/from "\.\/theme\.js\?v=\d+"/.test(stampedCard),
  "F. and the versioner reached inside it, so there is one theme.js and not two",
  (stampedCard.match(/from "\.\/theme\.js[^"]*"/) || ["(no import found)"])[0]);
/* One copy of lib/og on the site, not two. The card was served from
   /assets/vendor/og/ until main started copying the whole directory to
   /assets/js/og/ for the /r/ page; two copies is two module instances
   of theme.js and a second download of every file. */
chk(!(await stat(join(ROOT, "assets", "vendor", "og")).then(() => true).catch(() => false)),
  "F. and there is no second copy of it under /assets/vendor/og/");
const bundle = await readFile(join(ROOT, "assets", "vendor", "satori", "satori.browser.js")).catch(() => null);
chk(!!bundle && bundle.length > 200000 && /export\s*\{/.test(bundle.toString("utf8", bundle.length - 400)),
  "F. the satori bundle is in the build and is an ES module",
  bundle ? `${bundle.length} bytes` : "missing (run npm run og-bundle)");
const wasm = await readFile(join(ROOT, "assets", "vendor", "satori", "hb.wasm")).catch(() => null);
chk(!!wasm && wasm.toString("latin1", 0, 4) === "\0asm",
  "F. hb.wasm is in the build and is WebAssembly", wasm ? `${wasm.length} bytes` : "missing");
const licences = await readFile(join(ROOT, "assets", "vendor", "licenses", "satori-bundle-LICENSES.txt"), "utf8").catch(() => null);
chk(!!licences && /satori 0\.\d+\.\d+ — MPL-2\.0/.test(licences) && /harfbuzzjs .* — MIT/.test(licences),
  "F. the bundle's licences ship with it and name satori and harfbuzzjs",
  licences ? `${licences.length} chars` : "missing");
for (const f of FONT_FILES) {
  const p = join(ROOT, "assets", "fonts", "og", f.file);
  const ok = await stat(p).then((s) => s.size > 1000).catch(() => false);
  chk(ok, `F. the card's ${f.name} ${f.weight}${f.style === "italic" ? " italic" : ""} face is served`, `/assets/fonts/og/${f.file}`);
}

/* Every import in the shipped modules, followed. A passthrough that was
   never added shows up here as a missing file rather than as a broken
   button three sections earlier. */
const seen = new Set();
const unresolved = [];
let followed = 0;
async function follow(fileAbs) {
  if (seen.has(fileAbs)) return;
  seen.add(fileAbs);
  let text;
  try { text = await readFile(fileAbs, "utf8"); } catch { unresolved.push(fileAbs); return; }
  const specs = [...text.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g)].map((m) => m[1]);
  for (const spec of specs) {
    followed++;
    const next = resolve(dirname(fileAbs), spec.replace(/\?.*$/, ""));
    if (!next.startsWith(ROOT)) { unresolved.push(`${spec} escapes _site`); continue; }
    await follow(next);
  }
}
await follow(join(ROOT, "assets", "js", "share", "local-card.js"));
chk(followed >= 6, "F. the shipped module really has imports to follow", `${followed} followed`);
chk(unresolved.length === 0, "F. every one of them resolves to a file in the build",
  unresolved.join(", ") || `${seen.size} files reachable`);

/* The model, and then the card. The browser builds its model with
   lib/og/validate.js -- the same function a server-rendered share card
   would use -- so the two cannot disagree about what a result card is.
   Then the same model goes through Node's renderer and the browser's,
   and the SVGs are compared byte for byte. */
const FIXTURE = {
  stats: new URLSearchParams({
    v: "1", wpm: "82", raw: "91", acc: "96.4", con: "88", dur: "47",
    mode: "custom", pb: "1", d: "2026-09-16",
  }).toString(),
  text: BODY,
};
const nodeModel = nodeValidate(FIXTURE.stats);
nodeModel.content = { kind: "custom", text: FIXTURE.text };
const ctxF = await freshContext();
const pageF = await ctxF.newPage();
await pageF.goto(B + "/about/", { waitUntil: "domcontentloaded" });
const browserSide = await inPage(() => pageF.evaluate(async (fx) => {
  const m = await import("/assets/js/share/local-card.js");
  return { model: m.resultModel(fx), svg: await m.renderCardSvg(fx) };
}, FIXTURE),
  "F. the shipped module loads in the page and renders the fixture",
  { model: null, svg: "" });
chk(JSON.stringify(browserSide.model) === JSON.stringify(nodeModel),
  "F. the browser's model is the object lib/og/validate.js builds",
  JSON.stringify(browserSide.model).slice(0, 150));
const nodeSvg = await createNodeRenderer().renderSvg(nodeModel);
let firstDiff = -1;
for (let i = 0; i < Math.max(browserSide.svg.length, nodeSvg.length); i++) {
  if (browserSide.svg[i] !== nodeSvg[i]) { firstDiff = i; break; }
}
chk(firstDiff === -1,
  "F. and the SVG it renders is the build's, byte for byte",
  firstDiff === -1
    ? `${nodeSvg.length} chars identical`
    : `browser ${browserSide.svg.length} / node ${nodeSvg.length} chars, first difference at ${firstDiff}: `
      + `${JSON.stringify(browserSide.svg.slice(firstDiff, firstDiff + 30))} vs ${JSON.stringify(nodeSvg.slice(firstDiff, firstDiff + 30))}`);
/* A length match alone would survive two different renderers producing
   coincidentally equal output; name a glyph path from the middle so a
   reader can see what was compared. */
chk(nodeSvg.includes("<svg width=\"1200\" height=\"630\""), "F. the compared SVG is a 1200x630 card",
  nodeSvg.slice(0, 48));
await ctxF.close();

// ================================================================ G
console.log("\nG. the other way a text of your own is typed: by chapter");
/* ?book=custom:<id> is a custom text read like a library book. Its slug
   IS the private id, state.bookSlug is set and state.mode is "book", so
   nothing about the ?mode=custom path above covers it -- and it is the
   same private text. The bundled sample is used rather than a seeded
   record because the id has to be one the app minted, and because it is
   the only custom text in the build with chapters. */
const ctxG = await freshContext();
const pageG = await ctxG.newPage();
const wG = watch(pageG);
await pageG.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await pageG.evaluate(async () => {
  localStorage.clear();
  await new Promise((r) => {
    const q = indexedDB.deleteDatabase("tt-custom");
    q.onsuccess = q.onerror = q.onblocked = () => r();
  });
});
await pageG.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
const seeded = await pageG.waitForSelector(".saved-item", { timeout: 30000 }).then(() => true).catch(() => false);
if (!seeded) await bail("G. the bundled sample seeded itself into an empty list");
const sample = await pageG.evaluate(() => {
  const list = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]");
  const it = list.find((x) => x && x.sample) || list[0] || null;
  return it ? { id: it.id, chapCount: it.chapCount || 0 } : null;
});
chk(!!sample && /^c_/.test(sample.id || "") && sample.chapCount > 1,
  "G. it has an app-minted id and chapters to read", JSON.stringify(sample));
/* Chapter 8, page 15 of the sample is the shortest page in it; chapter 1
   page 1 is 2,372 characters, which is 166 seconds at 70 ms/key. */
await pageG.goto(`${B}/practice/?book=${encodeURIComponent("custom:" + sample.id)}&ch=8&page=15`, { waitUntil: "domcontentloaded" });
await pageG.waitForSelector(".tt-char", { timeout: 15000 });
await pageG.click(".tt-stage").catch(() => {});
const pageText = await surfaceText(pageG);
chk(pageText.length > 0 && pageText.length < 700, "G. a page short enough to finish at 70 ms/key", `${pageText.length} chars`);
await typeAll(pageG, pageText);
await pageG.waitForSelector("#tt-results:not([hidden])", { timeout: 40000 });
const shareG = await pageG.evaluate(() => Object.assign({}, (document.getElementById("tt-share") || {}).dataset || {}));
chk(shareG.sharePrivate === "1",
  "G. a chapter of your own text is private too", `data-share-private=${JSON.stringify(shareG.sharePrivate)}`);
const numsG = await resultNumbers(pageG);
await pageG.click("#tt-share");
await pageG.waitForTimeout(200);
await pageG.evaluate(() => { window.__ttEvents.length = 0; });
wG.on = true;
const [dlG] = await Promise.all([
  pageG.waitForEvent("download", { timeout: 60000 }).catch(() => null),
  pageG.click("#share-sheet [data-share-download]"),
]);
wG.on = false;
if (!dlG) await bail("G. Download PNG produced a download for the chapter run");
const localG = pngInfo(await readFile(await dlG.path()));
const gridG = await readFile(join(ROOT, gridPathFor(numsG.wpm, numsG.acc))).catch(() => null);
chk(!!localG && localG.w === 1200 && localG.h === 630,
  "G. and it is a 1200x630 PNG drawn here", localG ? `${localG.bytes} bytes` : "not a PNG");
chk(!!localG && !!gridG && localG.bytes !== gridG.length,
  "G. not the grid card", localG && gridG ? `${localG.bytes} vs ${gridG.length}` : "?");
const savedG = await pageG.evaluate(() => (window.__ttEvents || []).find((e) => e.name === "share_image_saved") || null);
chk(!!savedG && savedG.props.method === "local", "G. method=local", JSON.stringify(savedG && savedG.props));
const hayG = wG.requests.map((r) => `${r.url} ${r.post}`).join(" ");
let hayGDecoded = hayG;
try { hayGDecoded = decodeURIComponent(hayG); } catch {}
chk(!hayG.includes(sample.id) && !hayGDecoded.includes(sample.id),
  "G. and the text's id is in none of the requests it made", `${wG.requests.length} requests, id ${sample.id}`);
await ctxG.close();

// ================================================================ H
console.log("\nH. the same question on /r/, where the text is in the fragment");
/* A shared link carries the text after the "#", which browsers never
   put on the wire. So on /r/ the text is on THIS device and nowhere
   else -- the same situation as the practice page after a run of your
   own, and it gets the same answer. A result whose text is public came
   from /data/, has no fragment text, and is unchanged. */
const R_SECRET = "QUILLFEATHER";
const R_TEXT = `the ${R_SECRET} drifted past a brindlewick gate at dusk`;
/* With a real keystroke replay in it, so share/replay.js mounts its
   player on this page. Drawing the card and playing the run back are
   two features reading the same fragment, and the merge that brought
   the player in is exactly where they could have started fighting. */
let R_REPLAY = "";
try {
  const codec = await import("../src/assets/js/share/codec.js");
  const packed = await codec.packLog([
    ["t", 0], ["h", 90], ["e", 80], [codec.MARK_BACKSPACE, 210],
    ["e", 140], [codec.MARK_PAUSE, 3000], ["!", 120], [codec.MARK_END, 90],
  ], { quantum: 1 });
  R_REPLAY = `&${packed.key}=${packed.value}`;
} catch (err) {
  chk(false, "H. a replay could be packed for the fixture", String(err && err.message || err));
}
const R_PRIVATE = `${B}/r/?v=1&wpm=62&raw=70&acc=96&con=88&dur=30&n=180&err=7&mode=custom&d=2026-09-16`
  + `#v=1&t=${encodeURIComponent(R_TEXT)}&o=3${R_REPLAY}`;
const R_PUBLIC = `${B}/r/?v=1&wpm=62&raw=70&acc=96&con=88&dur=30&mode=quote&src=q%3Aq-do-love&d=2026-09-16`;
const rGrid = await readFile(join(ROOT, gridPathFor(62, 96))).catch(() => null);
if (!rGrid) await bail(`H. the grid card ${gridPathFor(62, 96)} is in the build`);

for (const [label, url, wantLocal] of [["a text in the fragment", R_PRIVATE, true],
                                        ["a public quote", R_PUBLIC, false]]) {
  const ctxH = await freshContext();
  const pageH = await ctxH.newPage();
  const errsH = [];
  pageH.on("pageerror", (e) => errsH.push(String(e).slice(0, 140)));
  const wH = watch(pageH);
  await pageH.goto(url, { waitUntil: "domcontentloaded" });
  const shown = await pageH.waitForSelector("#tt-shared:not([hidden])", { timeout: 15000 }).then(() => true).catch(() => false);
  if (!shown) await bail(`H. [${label}] /r/ renders the shared card`);
  chk(true, `H. [${label}] /r/ renders the shared card`);
  wH.on = true;
  await pageH.click("#tt-reshare");
  await pageH.waitForTimeout(250);
  const noteH = await inPage(() => pageH.evaluate(() => {
    const el = document.querySelector("[data-share-local-note]");
    return el ? { hidden: el.hidden, text: el.textContent } : null;
  }), `H. [${label}] the sheet's caption can be read`, null);
  chk(!!noteH && noteH.hidden === !wantLocal,
    `H. [${label}] the local-picture caption is ${wantLocal ? "shown" : "hidden"}`,
    `hidden=${noteH && noteH.hidden}`);
  await pageH.evaluate(() => { window.__ttEvents.length = 0; });
  const [dlH] = await Promise.all([
    pageH.waitForEvent("download", { timeout: 40000 }).catch(() => null),
    pageH.click("#share-sheet [data-share-download]"),
  ]);
  wH.on = false;
  if (!dlH) await bail(`H. [${label}] Download PNG produces a download`);
  const gotH = await readFile(await dlH.path());
  const infoH = pngInfo(gotH);
  chk(!!infoH && infoH.w === 1200 && infoH.h === 630,
    `H. [${label}] it is a 1200x630 PNG`, infoH ? `${infoH.bytes} bytes` : "not a PNG");
  chk(gotH.equals(rGrid) === !wantLocal,
    `H. [${label}] it is ${wantLocal ? "NOT the grid card" : "the grid card, byte for byte"}`,
    `${gotH.length} vs ${rGrid.length} bytes`);
  const savedH = await pageH.evaluate(() => (window.__ttEvents || []).find((e) => e.name === "share_image_saved") || null);
  chk(!!savedH && savedH.props.method === (wantLocal ? "local" : "server"),
    `H. [${label}] share_image_saved says method=${wantLocal ? "local" : "server"}`,
    JSON.stringify(savedH && savedH.props));
  /* The whole point of a fragment is that it does not travel. Drawing a
     picture from it must not be the thing that finally sends it. */
  const hayH = wH.requests.map((r) => `${r.url} ${r.post}`).join(" ");
  let decH = hayH;
  try { decH = decodeURIComponent(hayH); } catch {}
  chk(!hayH.includes(R_SECRET) && !decH.includes(R_SECRET) && !hayH.includes(encodeURIComponent(R_SECRET)),
    `H. [${label}] no request carries the fragment's text`, `${wH.requests.length} requests checked`);
  chk(wH.requests.every((r) => r.url.startsWith(B)),
    `H. [${label}] and every one of them is same-origin`,
    wH.requests.filter((r) => !r.url.startsWith(B)).map((r) => r.url).join(" ") || "0 off-origin");
  /* Same rule as section D: a result the server CAN draw must not cost
     a reader 915 KB of renderer to find that out. */
  const rendererH = wH.requests.filter((r) => RENDERER_URL.test(r.url));
  chk((rendererH.length > 0) === wantLocal,
    `H. [${label}] the renderer is ${wantLocal ? "loaded" : "never loaded"}`,
    rendererH.map((r) => r.url.replace(B, "")).join(" ") || `${wH.requests.length} requests, none of them the renderer`);
  chk(errsH.length === 0, `H. [${label}] the page threw nothing`, errsH.join(" | "));
  /* The replay player and the card renderer share one fragment and one
     page. Neither may cost the other anything: the player must still be
     offered after the sheet has been opened and a card drawn. */
  const replayH = await pageH.evaluate(() => {
    const r = window.__ttReplay || null;
    const btn = document.getElementById("tt-replay-play");
    return { ready: !!(r && r.ready), entries: (r && r.entries && r.entries.length) || 0, btnHidden: btn ? btn.hidden : null };
  });
  chk(replayH.entries === (wantLocal ? 8 : 0),
    `H. [${label}] the replay log is ${wantLocal ? "still decoded" : "absent, as it should be"}`,
    `${replayH.entries} entries`);
  if (wantLocal) {
    chk(replayH.ready === true && replayH.btnHidden === false,
      "H. [a text in the fragment] and the player is still offered after a card was drawn",
      JSON.stringify(replayH));
  }
  await ctxH.close();
}

// ================================================================ I
console.log("\nI. the system share sheet carries the same picture");
/* navigator.share is where a phone actually shares, and it is the one
   path that can attach a file. It used to attach the pre-rendered
   grid card for EVERY result, including the one kind this whole file
   is about: a run on a text of your own, where the grid card is a
   number and an accuracy band and nothing else, while the Download
   PNG button two rows below it drew the real card with the words in
   it. Same sheet, same result, two different pictures.

   Playwright cannot open a real system sheet, so navigator.share and
   navigator.canShare are replaced in the page before any of its own
   script runs and every File they are handed is decoded and kept. The
   stub is the only fiction here: the file it receives is the file the
   product built, and it is compared against real bytes on disk --
   the grid card for a public run, and for a private one the picture
   Download PNG produces from the very same open sheet.

   og:image is NOT what changes. That stays the grid card in every
   case, because it is what a crawler is given and a crawler must
   never be sent a picture of something the server has never seen. */
const SHARE_STUB = () => {
  window.__ttShared = [];
  const b64 = (u8) => {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const share = async (data) => {
    const rec = { title: data.title, text: data.text, url: data.url, files: [] };
    for (const f of (data.files || [])) {
      const u8 = new Uint8Array(await f.arrayBuffer());
      rec.files.push({ name: f.name, type: f.type, size: u8.length, b64: b64(u8) });
    }
    window.__ttShared.push(rec);
  };
  /* What a real implementation answers: yes to a files payload of
     real Files. Saying yes to everything would hide a payload that a
     platform would have refused. */
  const canShare = (data) => {
    if (!data || !data.files) return true;
    return Array.isArray(data.files) && data.files.length > 0 && data.files.every((f) => f instanceof File);
  };
  try {
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true, writable: true });
  } catch {
    navigator.share = share;
    navigator.canShare = canShare;
  }
};

async function sharedFilesFrom(pageX) {
  const ok = await pageX.waitForFunction(() => (window.__ttShared || []).length > 0, null, { timeout: 60000 })
    .then(() => true).catch(() => false);
  if (!ok) return null;
  const rec = await pageX.evaluate(() => window.__ttShared[0]);
  return {
    ...rec,
    files: (rec.files || []).map((f) => ({ ...f, buf: Buffer.from(f.b64, "base64") })),
  };
}

/* I1 -- a text of your own. */
{
  const ctxI = await freshContext();
  await ctxI.addInitScript(SHARE_STUB);
  const pageI = await ctxI.newPage();
  const errsI = [];
  pageI.on("pageerror", (e) => errsI.push(String(e).slice(0, 140)));
  const wI = watch(pageI);
  const targetI = await runCustomToTheEnd(pageI);
  chk(targetI.includes("quillfeather"), "I1. the private run typed the sentinel text");
  const numsI = await resultNumbers(pageI);
  await pageI.click("#tt-share");
  await pageI.waitForTimeout(200);
  const nativeShown = await inPage(() => pageI.evaluate(() => {
    const b = document.querySelector("[data-share-native]");
    return b ? { hidden: b.hidden, label: b.textContent.trim() } : null;
  }), "I1. the sheet's native button can be read", null);
  chk(!!nativeShown && nativeShown.hidden === false,
    "I1. the sheet offers the system share button", JSON.stringify(nativeShown));

  wI.on = true;
  await pageI.click("#share-sheet [data-share-native]");
  const sharedI = await sharedFilesFrom(pageI);
  wI.on = false;
  if (!sharedI) await bail("I1. navigator.share was called");
  chk(sharedI.files.length === 1, "I1. exactly one file went to the system sheet",
    `${sharedI.files.length} files`);
  const fileI = sharedI.files[0] || { buf: Buffer.alloc(0), name: "", type: "" };
  const infoI = pngInfo(fileI.buf);
  chk(!!infoI && infoI.w === 1200 && infoI.h === 630,
    "I1. and it decodes as a 1200x630 PNG", infoI ? `${infoI.w}x${infoI.h}, ${infoI.bytes} bytes` : "not a PNG");
  chk(fileI.type === "image/png" && /\.png$/.test(fileI.name || ""),
    "I1. declared as one, with a .png name", `${fileI.name} ${fileI.type}`);
  const gridI = await readFile(join(ROOT, gridPathFor(numsI.wpm, numsI.acc))).catch(() => null);
  if (!gridI) await bail(`I1. the grid card ${gridPathFor(numsI.wpm, numsI.acc)} is in the build`);
  chk(!fileI.buf.equals(gridI),
    "I1. it is NOT the pre-rendered grid card, which is what used to be attached",
    `${fileI.buf.length} vs grid ${gridI.length} bytes`);

  /* And it is the local card, not merely something else: the same
     sheet is still open, so Download PNG draws the picture this very
     result would save, and the two must be the same bytes. */
  const [dlI] = await Promise.all([
    pageI.waitForEvent("download", { timeout: 60000 }).catch(() => null),
    pageI.click("#share-sheet [data-share-download]"),
  ]);
  if (!dlI) await bail("I1. Download PNG still works from the same sheet");
  const downloadedI = await readFile(await dlI.path());
  chk(downloadedI.equals(fileI.buf),
    "I1. it is byte for byte the card Download PNG draws for the same result",
    `${fileI.buf.length} shared vs ${downloadedI.length} downloaded`);
  chk(!downloadedI.equals(gridI), "I1. and that one is not the grid card either",
    `${downloadedI.length} vs ${gridI.length}`);

  chk(sharedI.url === (await pageI.getAttribute("#tt-share", "data-share-url")),
    "I1. the link that went with it is the result's full link",
    String(sharedI.url || "").slice(0, 60) + "…");
  const toastI = await pageI.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
  chk(toastI === "", "I1. and nothing was apologised for", JSON.stringify(toastI));
  chk(errsI.length === 0, "I1. the page threw nothing", errsI.join(" | "));

  /* Nothing left the device to make that picture, and nothing carried
     a word of it. The share itself is a local API call; what is being
     checked is everything the page asked for while serving it. */
  const offI = wI.requests.filter((r) => !r.url.startsWith(B));
  chk(offI.length === 0, "I1. the share asked nothing of any other origin",
    offI.map((r) => r.url).join(" ") || `${wI.requests.length} requests, all same-origin`);
  const hayI = wI.requests.map((r) => `${r.url} ${r.post}`).join(" ");
  let decI = hayI;
  try { decI = decodeURIComponent(hayI); } catch {}
  for (const secret of ["quillfeather", "brindlewick", "SAFFRONVOLE", TEXT_ID]) {
    const found = hayI.toLowerCase().includes(secret.toLowerCase())
      || decI.toLowerCase().includes(secret.toLowerCase())
      || hayI.includes(encodeURIComponent(secret));
    chk(!found, `I1. no request carries "${secret}"`, found ? "FOUND" : `${wI.requests.length} requests checked`);
  }
  chk(!/\/og\/result\//.test(hayI),
    "I1. and the grid card was never fetched, so it cannot have been what travelled");
  chk(wI.requests.length >= 3, "I1. there were real requests to check, not an empty list",
    `${wI.requests.length} requests`);
  await ctxI.close();
}

/* I2 -- a public run. The server can draw this one, so it should, and
   the browser renderer must not be reached at all. */
{
  const ctxI2 = await freshContext();
  await ctxI2.addInitScript(SHARE_STUB);
  const pageI2 = await ctxI2.newPage();
  const wI2 = watch(pageI2);
  await pageI2.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "domcontentloaded" });
  await pageI2.waitForSelector(".tt-char", { timeout: 15000 });
  await pageI2.click(".tt-stage").catch(() => {});
  const targetI2 = await surfaceText(pageI2);
  await typeAll(pageI2, targetI2, [3, 9]);
  await pageI2.waitForSelector("#tt-results:not([hidden])", { timeout: 20000 });
  const numsI2 = await resultNumbers(pageI2);
  chk(numsI2.acc < 100, "I2. the words run landed below 100 %, so the band is not a constant", `${numsI2.acc}%`);
  await pageI2.click("#tt-share");
  await pageI2.waitForTimeout(200);
  wI2.on = true;
  await pageI2.click("#share-sheet [data-share-native]");
  const sharedI2 = await sharedFilesFrom(pageI2);
  wI2.on = false;
  if (!sharedI2) await bail("I2. navigator.share was called for the public run");
  const fileI2 = sharedI2.files[0] || { buf: Buffer.alloc(0) };
  const gridI2 = await readFile(join(ROOT, gridPathFor(numsI2.wpm, numsI2.acc))).catch(() => null);
  if (!gridI2) await bail(`I2. the grid card ${gridPathFor(numsI2.wpm, numsI2.acc)} is in the build`);
  chk(fileI2.buf.equals(gridI2),
    "I2. a public run still attaches the pre-rendered grid card, byte for byte",
    `${fileI2.buf.length} vs ${gridI2.length} bytes of ${gridPathFor(numsI2.wpm, numsI2.acc)}`);
  const rendererI2 = wI2.requests.filter((r) => RENDERER_URL.test(r.url));
  chk(rendererI2.length === 0,
    "I2. and the browser renderer is never loaded for it",
    rendererI2.map((r) => r.url.replace(B, "")).join(" ") || `${wI2.requests.length} requests, none of them the renderer`);
  const toastI2 = await pageI2.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
  chk(toastI2 === "", "I2. and nothing is apologised for", JSON.stringify(toastI2));
  await ctxI2.close();
}

/* I3 -- the renderer cannot run. Section E's question, asked of the
   other button: the grid card goes instead, the user is told in the
   same words the download path uses, and nothing is reported as a
   bug by their browser. */
{
  const ctxI3 = await freshContext();
  await ctxI3.addInitScript(SHARE_STUB);
  await ctxI3.route("**/satori.browser.js*", (route) => route.abort());
  const pageI3 = await ctxI3.newPage();
  const errsI3 = [];
  pageI3.on("pageerror", (e) => errsI3.push(String(e).slice(0, 140)));
  await runCustomToTheEnd(pageI3);
  const numsI3 = await resultNumbers(pageI3);
  await pageI3.click("#tt-share");
  await pageI3.waitForTimeout(200);
  await pageI3.evaluate(() => { window.__ttEvents.length = 0; });
  await pageI3.click("#share-sheet [data-share-native]");
  const sharedI3 = await sharedFilesFrom(pageI3);
  if (!sharedI3) await bail("I3. navigator.share was still called with the renderer blocked");
  const fileI3 = sharedI3.files[0] || { buf: Buffer.alloc(0) };
  const gridI3 = await readFile(join(ROOT, gridPathFor(numsI3.wpm, numsI3.acc))).catch(() => null);
  if (!gridI3) await bail(`I3. the grid card ${gridPathFor(numsI3.wpm, numsI3.acc)} is in the build`);
  chk(fileI3.buf.equals(gridI3),
    "I3. with the renderer blocked the grid card travels instead, byte for byte",
    `${fileI3.buf.length} vs ${gridI3.length} bytes`);
  const toastI3 = await pageI3.evaluate(() => {
    const t = document.getElementById("toast");
    return t ? { text: t.textContent, hidden: t.hidden, bad: t.classList.contains("toast--bad") } : null;
  });
  chk(!!toastI3 && toastI3.text === "Saved the plain card. The picture will not include your text."
    && toastI3.hidden === false && toastI3.bad === true,
    "I3. and the user is told, in the same words the download path uses",
    JSON.stringify(toastI3 && toastI3.text));
  await pageI3.waitForTimeout(800);
  chk(errsI3.length === 0, "I3. nothing escaped to window.onerror", errsI3.join(" | "));
  const reportedI3 = await pageI3.evaluate(() => (window.__ttEvents || []).filter((e) => e.name === "js_error"));
  chk(reportedI3.length === 0, "I3. and nothing was reported to analytics as js_error",
    reportedI3.map((e) => JSON.stringify(e.props)).join(" | ") || "0 js_error events");
  await ctxI3.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
