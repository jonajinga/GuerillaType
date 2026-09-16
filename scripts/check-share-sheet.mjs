/* The share sheet: one dialog, ten destinations, and a promise that
   nothing you typed travels with a share.

   What must hold, in the order a user meets it:

     A. A button carrying the data-share contract opens the sheet —
        anywhere, including a node injected after load, because main.js
        delegates from the document.
     B. Every intent in the grid is a real link: the right host, the
        right query parameter, target=_blank and rel=noopener. Social
        intents carry the SHORT url (Bluesky caps a post at 300
        graphemes); copy, email and Telegram carry the FULL one.
     C. Copy link puts the full url on the clipboard (read back through
        navigator.clipboard.readText, with permissions granted).
     D. Download PNG produces a real download whose filename ends .png.
     E. Esc closes the sheet and focus returns to the button that
        opened it.
     F. The blog post's icon row keeps its four icons and now goes
        through the module: the hrefs are built by share.js and a
        "More" button opens the full sheet.
     G. The results card carries a Share button whose image points at
        the pre-rendered card for THIS run's numbers —
        /og/result/<wpm>-<band>.png — and that file exists in the build.
     H. Nothing typed leaks. A custom text with sentinel words in its
        title and body is typed to the end; the sentinels appear in no
        intent url, no share text, no dialog text, and no analytics
        property. Analytics carry exactly the structural keys and
        nothing else.

   Section H is the one a careless implementation fails: putting the
   run's text in the tweet is the obvious thing to do, and it is the
   thing this feature must never do.

   Usage:
     npm run build          # not optional: reads _site, and section G
     node scripts/check-share-sheet.mjs   # needs the /og/result cards
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";
/* The Node-side band table, imported rather than copied. lib/og/labels.js
   is what scripts/gen-og-images.mjs used to NAME the files; if the
   browser's copy in share/share.js disagrees with it, a result links to
   a card that was never rendered. The gate must not carry a third
   opinion about where the boundaries are. */
import { bandFor as nodeBandFor } from "../lib/og/labels.js";

/* Port from the task id, not from habit. 8080 is never ours. */
const TASK = "share-sheet";
const PORT = Number(process.env.PORT)
  || 8100 + ([...TASK].reduce((a, c) => a + c.charCodeAt(0), 0) % 600);
const ROOT = resolve("_site");

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

// ---------------------------------------------------------------- server
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
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
  console.log("\nRUN ABORTED — refusing to share a port with something else.");
  process.exit(1);
});
const B = `http://127.0.0.1:${PORT}`;

/* Prove what is answering before believing anything it says. A 200 is
   not evidence the right thing responded. */
const probe = await fetch(B + "/practice/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe)
  && /id=["']?tt-stage["'\s>]/.test(probe);
chk(isThisProject, `server on ${PORT} is this project's /practice/`);
if (!isThisProject) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  process.exit(1);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  serviceWorkers: "block",
  hasTouch: false,
  acceptDownloads: true,
});
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: B });
/* Stand in for umami before any module runs, so analytics.js finds it.
   Every call is recorded with its props for section H. */
await context.addInitScript(() => {
  window.__ttEvents = [];
  window.umami = { track: (name, props) => { window.__ttEvents.push({ name, props: props || {} }); } };
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 200)));

/* A missing piece must read as a FAIL with a count, not as a
   Playwright stack trace. The verifier reverts src/ and re-runs this
   file; what it should see then is a failure it can read. */
async function bail(msg) {
  chk(false, msg);
  console.log("\nRUN ABORTED — the counts below are partial.");
  await browser.close().catch(() => {});
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}
const waitOr = async (fn, msg, timeout = 8000) => {
  try { await fn(timeout); return true; }
  catch { await bail(msg); return false; }
};

const events = () => page.evaluate(() => window.__ttEvents.slice());
const clearEvents = () => page.evaluate(() => { window.__ttEvents.length = 0; });
const sheetOpen = () => page.evaluate(() => {
  const d = document.getElementById("share-sheet");
  return !!(d && d.open);
});
const grid = () => page.$$eval("#share-sheet [data-share-target]", (els) => els.map((a) => ({
  id: a.dataset.shareTarget,
  href: a.getAttribute("href"),
  target: a.getAttribute("target"),
  rel: a.getAttribute("rel"),
})));

// ================================================================ A/B/C/D/E
// A fake page: any page plus a button that follows the contract. This is
// exactly what the per-item pages will emit.
console.log("\nA-E. the contract: an injected data-share button");
await page.goto(B + "/about/", { waitUntil: "domcontentloaded" });
await waitOr((t) => page.waitForFunction(() => !!window.ttOpenShareSheet, null, { timeout: t }),
  "A. share/share.js is loaded by main.js on every page (window.ttOpenShareSheet)");

const FULL = `${B}/library/pride-and-prejudice/#frag-SECRETZEBRA`;
const SHORT = `${B}/library/pride-and-prejudice/`;
const IMG = `${B}/assets/img/og-default.png`;
const TITLE = "Pride and Prejudice — Jane Austen";
const TEXT = "Type Pride and Prejudice on GuerillaType";
await page.evaluate(({ full, short, img, title, text }) => {
  const b = document.createElement("button");
  b.type = "button";
  b.id = "fake-share";
  b.textContent = "Share";
  b.setAttribute("data-share", "");
  b.setAttribute("data-share-title", title);
  b.setAttribute("data-share-text", text);
  b.setAttribute("data-share-url", full);
  b.setAttribute("data-share-short-url", short);
  b.setAttribute("data-share-image", img);
  b.setAttribute("data-share-kind", "book");
  document.querySelector("main, body").prepend(b);
}, { full: FULL, short: SHORT, img: IMG, title: TITLE, text: TEXT });

await clearEvents();
await page.click("#fake-share");
await page.waitForTimeout(120);
chk(await sheetOpen(), "A. a button rendered after load opens the sheet");

const ev1 = await events();
const opened = ev1.find((e) => e.name === "share_opened");
chk(!!opened, "A. share_opened fired", JSON.stringify(opened || null));
chk(opened && opened.props.kind === "book", "A. kind travels from the button", JSON.stringify(opened && opened.props));

const g = await grid();
const byId = Object.fromEntries(g.map((x) => [x.id, x]));
const EXPECT = [
  ["x", "x.com", "/intent/post", "short"],
  ["facebook", "www.facebook.com", "/sharer/sharer.php", "short"],
  ["linkedin", "www.linkedin.com", "/sharing/share-offsite/", "short"],
  ["reddit", "www.reddit.com", "/submit", "short"],
  ["bluesky", "bsky.app", "/intent/compose", "short"],
  ["threads", "www.threads.net", "/intent/post", "short"],
  ["whatsapp", "wa.me", "/", "short"],
  ["telegram", "t.me", "/share/url", "full"],
];
chk(g.length === 10, "B. ten destinations in the grid", `got ${g.length}: ${g.map((x) => x.id).join(",")}`);
for (const [id, host, path, variant] of EXPECT) {
  const a = byId[id];
  if (!a) { chk(false, `B. ${id} is present`); continue; }
  let u = null;
  try { u = new URL(a.href); } catch {}
  chk(!!u && u.host === host && u.pathname.startsWith(path), `B. ${id} points at ${host}${path}`, a.href.slice(0, 90));
  chk(a.target === "_blank" && /noopener/.test(a.rel || ""), `B. ${id} opens in a new tab, rel=noopener`, `${a.target} ${a.rel}`);
  const wanted = variant === "short" ? SHORT : FULL;
  const other = variant === "short" ? FULL : SHORT;
  chk(a.href.includes(encodeURIComponent(wanted)), `B. ${id} carries the ${variant} url, encoded`, a.href.slice(0, 110));
  if (variant === "short") {
    chk(!a.href.includes(encodeURIComponent(other)), `B. ${id} does NOT carry the fragment-bearing url`);
  }
}
// The text rides along on the destinations that take one.
for (const id of ["x", "bluesky", "threads", "whatsapp", "telegram"]) {
  const a = byId[id];
  chk(!!a && a.href.includes(encodeURIComponent(TEXT).slice(0, 40)), `B. ${id} carries the share text, encoded`);
}
const mail = byId.email;
chk(!!mail && mail.href.startsWith("mailto:?subject="), "B. email is a mailto with a subject", (mail && mail.href.slice(0, 60)) || "");
chk(!!mail && mail.href.includes(encodeURIComponent(FULL)), "B. email carries the full url");
chk(!!mail && mail.href.includes(encodeURIComponent(TITLE).slice(0, 30)), "B. email subject is the title");

/* Mastodon has no single intent host, so the sheet asks once and
   remembers. Before it knows, the tile must not pretend to be a link. */
const mastoBefore = byId.mastodon;
chk(!!mastoBefore && mastoBefore.href === "#", "B. Mastodon has no link until an instance is known", mastoBefore && mastoBefore.href);
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
await page.evaluate(() => localStorage.setItem("tt:mastodon-instance", "https://Mas.Example.Social/"));
await page.click("#fake-share");
await page.waitForTimeout(150);
const mastoAfter = (await grid()).find((a) => a.id === "mastodon");
chk(!!mastoAfter && mastoAfter.href.startsWith("https://mas.example.social/share?text="),
  "B. once remembered, Mastodon points at that instance (host normalised)", mastoAfter && mastoAfter.href.slice(0, 70));
chk(!!mastoAfter && mastoAfter.href.includes(encodeURIComponent(SHORT)), "B. and carries the short url");

// C. Copy link -> clipboard holds the FULL url.
await page.evaluate(() => navigator.clipboard.writeText("__nothing__"));
await clearEvents();
await page.click("#share-sheet [data-share-copy]");
await page.waitForTimeout(250);
const clip = await page.evaluate(() => navigator.clipboard.readText());
chk(clip === FULL, "C. Copy link writes the full url to the clipboard", clip);
const copied = (await events()).find((e) => e.name === "share_copied");
chk(!!copied && copied.props.kind === "book", "C. share_copied fired with the kind", JSON.stringify(copied && copied.props));

// D. Download PNG -> a real download, named .png.
await clearEvents();
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 8000 }),
  page.click("#share-sheet [data-share-download]"),
]);
chk(/\.png$/.test(download.suggestedFilename()), "D. Download PNG downloads a .png", download.suggestedFilename());
await page.waitForTimeout(150);
const saved = (await events()).find((e) => e.name === "share_image_saved");
chk(!!saved && saved.props.method === "server", "D. share_image_saved fired, method=server", JSON.stringify(saved && saved.props));

// E. Esc closes and focus returns to the opener.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
chk(!(await sheetOpen()), "E. Esc closes the sheet");
const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
chk(focused === "fake-share", "E. focus returns to the button that opened it", `activeElement=#${focused}`);

// Focus is trapped while it is open: Tab from the last control wraps.
await page.click("#fake-share");
await page.waitForTimeout(120);
const trapped = await page.evaluate(async () => {
  const d = document.getElementById("share-sheet");
  const f = Array.from(d.querySelectorAll("a[href], button:not([disabled])")).filter((e) => !e.hidden);
  f[f.length - 1].focus();
  return d.contains(document.activeElement);
});
chk(trapped, "E. focus stays inside the open dialog");
await page.keyboard.press("Escape");

// ================================================================ F
console.log("\nF. the blog post share row");
await page.goto(B + "/blog/why-touch-type/", { waitUntil: "domcontentloaded" });
await waitOr((t) => page.waitForFunction(() => {
  const a = document.getElementById("share-x");
  return a && a.getAttribute("href");
}, null, { timeout: t }), "F. the post's X icon gets an href from share.js");
const canonical = await page.getAttribute(".post__share", "data-share-url");
chk(/^https?:\/\/[^/]+\/blog\/why-touch-type\/$/.test(canonical || ""), "F. row carries the absolute canonical url", canonical || "(missing)");
const xHref = await page.getAttribute("#share-x", "href");
chk(new URL(xHref).host === "x.com" && xHref.includes(encodeURIComponent(canonical)),
  "F. X icon goes to x.com/intent/post with the canonical url", xHref.slice(0, 100));
chk((await page.getAttribute("#share-x", "rel")) === "noopener"
  && (await page.getAttribute("#share-x", "target")) === "_blank", "F. X icon opens in a new tab, rel=noopener");
const liHref = await page.getAttribute("#share-li", "href");
chk(new URL(liHref).host === "www.linkedin.com" && liHref.includes(encodeURIComponent(canonical)),
  "F. LinkedIn icon unchanged in look, built by the module", liHref.slice(0, 100));
const mailHref = await page.getAttribute("#share-email", "href");
chk(mailHref.startsWith("mailto:?subject=") && mailHref.includes(encodeURIComponent(canonical)),
  "F. email icon is a mailto carrying the canonical url", mailHref.slice(0, 80));
await page.evaluate(() => navigator.clipboard.writeText("__nothing__"));
await clearEvents();
await page.click("#share-copy");
await page.waitForTimeout(250);
chk((await page.evaluate(() => navigator.clipboard.readText())) === canonical, "F. copy icon copies the canonical url");
chk(!!(await events()).find((e) => e.name === "share_copied" && e.props.kind === "post"), "F. copy fires share_copied with kind=post");
await clearEvents();
await waitOr((t) => page.waitForSelector("#share-more", { timeout: t }),
  "F. the row has a More button for the destinations that have no icon");
await page.click("#share-more");
await page.waitForTimeout(150);
chk(await sheetOpen(), "F. More opens the full sheet");
const gPost = await grid();
chk(gPost.length === 10 && gPost.some((a) => a.id === "facebook") && gPost.some((a) => a.id === "reddit"),
  "F. Facebook and Reddit are reachable from the post");
const openedPost = (await events()).find((e) => e.name === "share_opened");
chk(!!openedPost && openedPost.props.kind === "post" && openedPost.props.surface === "post",
  "F. share_opened carries surface=post", JSON.stringify(openedPost && openedPost.props));
// Clicking a destination reports which one and which url variant.
await clearEvents();
await page.evaluate(() => {
  /* Do not actually navigate to x.com from a gate. The listener is on
     the grid, so a synthetic click exercises the same path. */
  const a = document.querySelector('#share-sheet [data-share-target="x"]');
  a.removeAttribute("href");
  a.click();
});
await page.waitForTimeout(120);
const tgt = (await events()).find((e) => e.name === "share_target");
chk(!!tgt && tgt.props.target === "x" && tgt.props.variant === "short",
  "F. share_target names the destination and the url variant", JSON.stringify(tgt && tgt.props));
await page.keyboard.press("Escape");

// ================================================================ G
console.log("\nG. the results card after a words run");
await page.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
await page.click(".tt-stage").catch(() => {});
const surfaceText = () => page.$$eval(".tt-char", (els) =>
  els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
/* 70 ms/key. The engine flags anything over 250 wpm as suspect and a
   robot-speed run would be testing a different code path. Two wrong
   keys on purpose so accuracy lands in a band below 100 — a gate that
   only ever sees 100 % never proves the band is computed at all. */
const wordsTarget = await surfaceText();
let i = 0;
for (const ch of wordsTarget) {
  if (i === 3 || i === 9) await page.keyboard.type(ch === "q" ? "z" : "q", { delay: 70 });
  else await page.keyboard.type(ch, { delay: 70 });
  i++;
}
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }),
  "G. the run finished and the results card is up");
await waitOr((t) => page.waitForSelector("#tt-share", { timeout: t }),
  "G. the results card carries a Share button");
chk(true, "G. the results card carries a Share button");
const shareData = await page.evaluate(() => {
  const b = document.getElementById("tt-share");
  const wpm = parseInt(document.querySelector(".results__title-num").textContent, 10);
  const acc = parseInt(Array.from(document.querySelectorAll(".results__metric"))
    .find((m) => /accuracy/.test(m.textContent)).querySelector(".results__value").textContent, 10);
  return { d: Object.assign({}, b.dataset), wpm, acc };
});
const band = nodeBandFor;   // lib/og/labels.js, the file the cards were named from
const wantImg = `${B}/og/result/${shareData.wpm > 200 ? "200p" : shareData.wpm}-${band(shareData.acc)}.png`;
chk(shareData.d.shareImage === wantImg,
  `G. image is the pre-rendered card for ${shareData.wpm} wpm / ${shareData.acc}% (band ${band(shareData.acc)})`,
  shareData.d.shareImage);
chk(shareData.acc < 100, "G. the run really did land below 100 % (the band is not a constant)", `${shareData.acc}%`);
const imgRes = await fetch(shareData.d.shareImage).catch(() => null);
const imgBuf = imgRes && imgRes.ok ? Buffer.from(await imgRes.arrayBuffer()) : null;
chk(!!imgBuf && imgBuf.length > 1000 && imgBuf[0] === 0x89 && imgBuf.toString("latin1", 1, 4) === "PNG",
  "G. that card exists in the build and is a PNG",
  imgBuf ? `${imgBuf.length} bytes` : `HTTP ${imgRes ? imgRes.status : "?"} (build without OG_SKIP=1)`);
/* Phase D2 changed what a result links TO. It used to be whichever
   public page reproduced the same text; it is now /r/, the landing
   page that shows the run. The short url is the query alone -- and for
   a run on random words there is no public source to name. */
chk(new URL(shareData.d.shareShortUrl).pathname === "/r/"
  && !shareData.d.shareShortUrl.includes("#")
  && !new URLSearchParams(new URL(shareData.d.shareShortUrl).search).has("src"),
  "G. a words run links to /r/ and names no public source", shareData.d.shareShortUrl);
chk(shareData.d.shareKind === "result", "G. kind=result");
chk(/^\d+ wpm · \d+% accuracy/.test(shareData.d.shareText), "G. the text is numbers first", shareData.d.shareText);

/* The words in the target are random; the full string appearing in a
   url would be the leak. Check it, plus the first three words joined —
   a share text that quoted the run would contain both. */
const first3 = wordsTarget.trim().split(/\s+/).slice(0, 3).join(" ");
await clearEvents();
await page.click("#tt-share");
await page.waitForTimeout(150);
chk(await sheetOpen(), "G. the results Share button opens the sheet");
const gRes = await grid();
const resultHaystack = JSON.stringify(gRes) + " " + shareData.d.shareText + " "
  + (await page.textContent("#share-sheet"));
chk(!resultHaystack.includes(wordsTarget) && !resultHaystack.includes(encodeURIComponent(wordsTarget)),
  "G. the run's target string is in no intent url and no share text");
chk(!resultHaystack.includes(first3) && !resultHaystack.includes(encodeURIComponent(first3)),
  "G. not even the first three words of it", JSON.stringify(first3));
const openedRes = (await events()).find((e) => e.name === "share_opened");
chk(!!openedRes && openedRes.props.surface === "result" && openedRes.props.mode === "words",
  "G. share_opened carries surface=result and the mode", JSON.stringify(openedRes && openedRes.props));
await page.keyboard.press("Escape");

/* The band boundaries, all of them, not just the one this run landed
   in. Four files used to carry this table; share.js is the browser's
   copy and practice-boot now calls it rather than repeating it. The
   comparison is against lib/og/labels.js, imported above — so moving a
   boundary in either file is caught whatever the run scored. */
const BOUNDARIES = [0, 79, 80, 89, 90, 94, 95, 97, 98, 99, 100];
const browserBands = await page.evaluate(async (accs) => {
  const m = await import("/assets/js/share/share.js");
  return {
    bands: accs.map((a) => m.bandFor(a)),
    paths: [[0, 100], [61, 95], [200, 100], [201, 98], [999, 79]].map(([w, a]) => m.resultImagePath(w, a)),
  };
}, BOUNDARIES);
const nodeBands = BOUNDARIES.map((a) => nodeBandFor(a));
chk(JSON.stringify(browserBands.bands) === JSON.stringify(nodeBands),
  "G. share.js bandFor() agrees with lib/og/labels.js at every boundary",
  `${BOUNDARIES.map((a, i) => `${a}:${browserBands.bands[i]}`).join(" ")} vs ${nodeBands.join(",")}`);
/* Expected names built from lib/og/labels.js, not typed out here: the
   gate carrying its own idea of the boundaries is what this round of
   review removed. Accuracies sit ON the boundaries on purpose. */
const wantPaths = [[0, 100], [61, 95], [200, 100], [201, 98], [999, 79]]
  .map(([w, a]) => `/og/result/${w > 200 ? "200p" : w}-${nodeBandFor(a)}.png`);
chk(JSON.stringify(browserBands.paths) === JSON.stringify(wantPaths),
  "G. resultImagePath clamps at 200 and names the band", browserBands.paths.join(" "));

// ================================================================ I
console.log("\nI. the result links back to the text that produced it");
/* Esc ends a run and shows the card, which is all this needs: what is
   being checked is the URL the card builds, not the typing. */
const endEarly = async (url) => {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".tt-char", { timeout: 8000 });
  await page.click(".tt-stage").catch(() => {});
  await page.keyboard.type("th", { delay: 70 });
  await page.keyboard.press("Escape");
  await waitOr((t) => page.waitForSelector("#tt-share", { timeout: t }), `I. card with a Share button for ${url}`);
  /* The SHORT url: query only, no fragment. Which public thing was
     typed is now carried by its `src` parameter rather than by the
     shape of a /practice/ link -- see lib/og/validate.js for the
     grammar, and share/result-link.js for the mapping. */
  const short = await page.getAttribute("#tt-share", "data-share-short-url");
  return new URLSearchParams(new URL(short).search).get("src");
};
const bookSrc = await endEarly(`${B}/practice/?book=a-christmas-carol&ch=0&page=0`);
chk(bookSrc === "bk:a-christmas-carol:0:0",
  "I. a book page links back to that exact page", bookSrc);
const lessonSrc = await endEarly(`${B}/practice/?lesson=3`);
chk(lessonSrc === "ls:3", "I. a lesson links back to the lesson", lessonSrc);
const quoteSrc = await endEarly(`${B}/practice/?mode=quote&qid=q-do-love`);
chk(quoteSrc === "q:q-do-love", "I. a quote links back by public id", quoteSrc);
const drillSrc = await endEarly(`${B}/practice/?drill=home-row`);
chk(/^dr:/.test(drillSrc || ""), "I. a drill links back to the drill", drillSrc);

// ================================================================ H
console.log("\nH. a custom text: the numbers travel, the text never does");
const SENTINEL_TITLE = "ZEBRAQUARTZ private notes";
const SENTINEL_BODY = "velvetmoose gallopingly through the pumpernickel orchard";
await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await page.evaluate(({ title, body }) => {
  localStorage.setItem("tt:custom-texts", JSON.stringify([{
    id: "c_share", title, createdAt: new Date().toISOString(), bytes: body.length,
    lastSeg: 0, segments: [body], meta: null,
  }]));
}, { title: SENTINEL_TITLE, body: SENTINEL_BODY });
await page.goto(`${B}/practice/?mode=custom&custom=c_share&seg=0`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
await page.click(".tt-stage").catch(() => {});
const customTarget = await surfaceText();
chk(customTarget.includes("velvetmoose"), "H. the sentinel text is what is on the surface", JSON.stringify(customTarget.slice(0, 40)));
for (const ch of customTarget) await page.keyboard.type(ch, { delay: 70 });
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }),
  "H. the custom-text run finished and the card is up");
const customShare = await page.evaluate(() => Object.assign({}, document.getElementById("tt-share").dataset));
{
  const q = new URLSearchParams(new URL(customShare.shareShortUrl).search);
  chk(q.get("mode") === "custom" && !q.has("src") && !customShare.shareShortUrl.includes("#"),
    "H. a custom text links to /r/ with no public source — no id, no title", customShare.shareShortUrl);
}
await clearEvents();
await page.click("#tt-share");
await page.waitForTimeout(150);
const gCustom = await grid();
const dialogText = await page.textContent("#share-sheet");
const evJson = JSON.stringify(await events());

/* Two haystacks, because Phase D2 made the distinction real.

   `everything` is every string the sheet produced. A custom text's
   TITLE and its private ID must not appear in any of it, ever: they
   are not part of a share in any form.

   `visible` is only the part a server could ever see -- a url's origin,
   path and query, with the fragment of any /r/ link inside it removed.
   The BODY of a custom text now travels legitimately, in that
   fragment, which browsers do not send. Copy link and Telegram carry
   it on purpose, because those go to a person. It must still reach no
   query, no analytics property and no dialog preview. */
const serverVisible = (raw) => {
  const s = String(raw || "");
  try {
    const u = new URL(s, B);
    const bits = [u.protocol, u.host, u.pathname];
    for (const [k, v] of u.searchParams) {
      const hash = v.indexOf("#");
      bits.push(`${k}=${hash !== -1 && /\/r\//.test(v) ? v.slice(0, hash) : v}`);
    }
    return bits.join(" ");
  } catch {
    return s.split("#")[0];
  }
};
const everything = [JSON.stringify(gCustom), JSON.stringify(customShare), dialogText, evJson].join(" ");
const visible = [
  gCustom.map((a) => serverVisible(a.href)).join(" "),
  serverVisible(customShare.shareUrl), serverVisible(customShare.shareShortUrl),
  customShare.shareText, customShare.shareTitle, dialogText, evJson,
].join(" ");
const absent = (hay, secret) => !hay.toLowerCase().includes(secret.toLowerCase())
  && !hay.includes(encodeURIComponent(secret));
for (const secret of ["ZEBRAQUARTZ", "c_share"]) {
  chk(absent(everything, secret), `H. "${secret}" appears nowhere at all — not even after the #`);
}
for (const secret of ["velvetmoose", "pumpernickel"]) {
  chk(absent(visible, secret), `H. "${secret}" reaches no server — not in a query, the dialog, or an event`);
}
await page.keyboard.press("Escape");

// ================================================================ J
console.log("\nJ. the bundled sample, read by chapter: still your text");
/* A custom text read by chapter arrives as ?book=custom:<id>, which
   means state.bookSlug IS the private id. The library branch of the
   link builder would put it in every intent url — that is the leak
   this section exists for, and it was real. The sample is used rather
   than a seeded record because the id has to be one the app minted. */
await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  localStorage.clear();
  await new Promise((r) => {
    const q = indexedDB.deleteDatabase("tt-custom");
    q.onsuccess = q.onerror = q.onblocked = () => r();
  });
});
await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await waitOr((t) => page.waitForSelector(".saved-item", { timeout: Math.max(t, 20000) }),
  "J. the bundled sample seeded itself into an empty list");
const sample = await page.evaluate(() => {
  const list = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]");
  const it = list.find((x) => x && x.sample) || list[0] || null;
  return it ? { id: it.id, title: it.title, chapCount: it.chapCount || 0 } : null;
});
chk(!!sample && /^c_/.test(sample.id || ""), "J. it has an app-minted id", JSON.stringify(sample));
chk(!!sample && sample.chapCount > 1, "J. and a chapter structure to read by", `chapCount=${sample && sample.chapCount}`);

/* Two runs. The first is the URL the leak was reported against, ended
   with Esc because chapter 1 page 1 of Alice is 2,372 characters and
   70 ms/key is 166 seconds of gate. The second FINISHES a real page —
   the shortest in the book, 184 characters — so the payload is also
   asserted after a clean finish, not only after a stop. */
const sampleSlug = `custom:${sample.id}`;
const openChapter = async (ch, pg) => {
  await page.goto(`${B}/practice/?book=${encodeURIComponent(sampleSlug)}&ch=${ch}&page=${pg}`, { waitUntil: "networkidle" });
  await waitOr((t) => page.waitForSelector(".tt-char", { timeout: t }), `J. chapter ${ch} page ${pg} rendered`);
  await page.click(".tt-stage").catch(() => {});
  return surfaceText();
};
const firstPage = await openChapter(0, 0);
chk(firstPage.length > 200, "J. chapter 1 page 1 is real book text", `${firstPage.length} chars`);
await page.keyboard.type("Al", { delay: 70 });
await page.keyboard.press("Escape");
await waitOr((t) => page.waitForSelector("#tt-share", { timeout: t }), "J. the card came up for the chapter run");
const chapShare = await page.evaluate(() => Object.assign({}, document.getElementById("tt-share").dataset));
{
  const q = new URLSearchParams(new URL(chapShare.shareShortUrl).search);
  chk(q.get("mode") === "custom" && !q.has("src"),
    "J. ?book=custom:<id> shares no public source, and calls itself custom", chapShare.shareShortUrl);
}

const shortPage = await openChapter(8, 15);
chk(shortPage.length > 0 && shortPage.length < 700, "J. a page short enough to finish at 70 ms/key", `${shortPage.length} chars`);
for (const ch of shortPage) await page.keyboard.type(ch, { delay: 70 });
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }),
  "J. the page was finished and the card is up");
const finishedShare = await page.evaluate(() => Object.assign({}, document.getElementById("tt-share").dataset));
{
  const q = new URLSearchParams(new URL(finishedShare.shareShortUrl).search);
  chk(q.get("mode") === "custom" && !q.has("src"),
    "J. and a FINISHED page shares the same kind of link", finishedShare.shareShortUrl);
}
await clearEvents();
await page.click("#tt-share");
await page.waitForTimeout(200);
const gChap = await grid();
const chapRaw = [JSON.stringify(gChap), JSON.stringify(finishedShare), JSON.stringify(chapShare),
  await page.textContent("#share-sheet"), JSON.stringify(await events())].join(" ");
/* Percent-encoded is still leaked: "custom%3Ac_tdwho2" in a tweet is
   the same id. Search the decoded form too — the first version of this
   check passed against a live leak for exactly that reason. */
let chapHay = chapRaw;
try { chapHay += " " + decodeURIComponent(chapRaw.replace(/%(?![0-9a-f]{2})/gi, "%25")); } catch {}
for (const secret of ["custom:", sample.id, encodeURIComponent(sampleSlug)]) {
  chk(!chapHay.includes(secret), `J. "${secret}" appears in no url, no dialog text and no event`);
}
/* The book's WORDS are a different question from its identity. Since
   Phase D2 they travel in the fragment on purpose -- that is how the
   person you send the link to sees what you typed -- so "Alice" is
   checked against the server-visible part only, the same split section
   H makes. The id checks above still span everything, fragment
   included, because an id must never travel in any form. */
const chapVisible = [
  gChap.map((a) => serverVisible(a.href)).join(" "),
  serverVisible(finishedShare.shareUrl), serverVisible(finishedShare.shareShortUrl),
  finishedShare.shareText, finishedShare.shareTitle,
  await page.textContent("#share-sheet"), JSON.stringify(await events()),
].join(" ");
chk(!chapVisible.includes("Alice"), "J. \"Alice\" reaches no server — not in a query, no dialog text, no event");
const idLike = chapHay.match(/c_[a-z0-9]{4,}/i);
chk(!idLike, "J. no custom-text id in any shape", idLike ? idLike[0] : "");

// ================================================================ K
console.log("\nK. what analytics are allowed to see");
/* The old version of this section ran its allowlist over whatever had
   been recorded — which was one share_opened. One event passing for
   four is exactly the kind of guard this project has shipped before,
   so every event type is now PROVOKED here and the count is asserted
   alongside the keys. */
await clearEvents();
/* Re-open, so the OPEN event is one of the four this section judges
   rather than one left over from J. */
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.click("#tt-share");
await page.waitForTimeout(200);
await page.evaluate(() => {
  const a = document.querySelector('#share-sheet [data-share-target="telegram"]');
  a.removeAttribute("href");   // do not navigate to t.me from a gate
  a.click();
});
await page.click("#share-sheet [data-share-copy]");
await page.waitForTimeout(250);
const [dl2] = await Promise.all([
  page.waitForEvent("download", { timeout: 10000 }),
  page.click("#share-sheet [data-share-download]"),
]);
chk(/\.png$/.test(dl2.suggestedFilename()), "K. the result card downloads as a .png", dl2.suggestedFilename());
await page.waitForTimeout(200);
const ALLOWED = {
  share_opened: ["surface", "kind", "mode"],
  share_target: ["target", "kind", "mode", "variant"],
  share_copied: ["kind", "mode"],
  share_image_saved: ["kind", "mode", "method"],
};
const fired = (await events()).filter((e) => e.name.startsWith("share_"));
const seen = {};
fired.forEach((e) => { seen[e.name] = (seen[e.name] || 0) + 1; });
/* share_opened came from the click that opened this sheet, in J. */
const missing = Object.keys(ALLOWED).filter((n) => !seen[n]);
chk(missing.length === 0, "K. all four share events fired", `seen ${JSON.stringify(seen)}`);
chk(fired.length >= 4, "K. and the allowlist below runs over all of them, not one", `${fired.length} events`);
let keysOk = true, offender = "";
for (const e of fired) {
  const allowed = ALLOWED[e.name];
  if (!allowed) { keysOk = false; offender = `unknown event ${e.name}`; break; }
  const extra = Object.keys(e.props).filter((k) => allowed.indexOf(k) === -1);
  if (extra.length) { keysOk = false; offender = `${e.name}: +${extra.join(",")}`; break; }
}
chk(keysOk, "K. every share event carries only its allowed props", offender);
/* Keys are half of it: a value can leak just as well. No prop may hold
   a url, a title, the sample's id, or anything that came off a page. */
let valsOk = true, badVal = "";
for (const e of fired) {
  for (const [k, v] of Object.entries(e.props)) {
    const str = String(v);
    if (/https?:|:\/\/|\bc_[a-z0-9]|custom:|Alice|wpm/i.test(str)) { valsOk = false; badVal = `${e.name}.${k}=${str}`; break; }
  }
  if (!valsOk) break;
}
chk(valsOk, "K. and no prop VALUE is a url, an id or a sentence", badVal);

await page.keyboard.press("Escape");
await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
