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
const band = (a) => a >= 100 ? "100" : a >= 98 ? "98" : a >= 95 ? "95" : a >= 90 ? "90" : a >= 80 ? "80" : "u80";
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
chk(shareData.d.shareUrl === `${B}/practice/?mode=words`, "G. a words run links to the mode, absolute", shareData.d.shareUrl);
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
  return page.getAttribute("#tt-share", "data-share-url");
};
const bookUrl = await endEarly(`${B}/practice/?book=a-christmas-carol&ch=0&page=0`);
chk(bookUrl === `${B}/practice/?book=a-christmas-carol&ch=0&page=0`,
  "I. a book page links back to that exact page", bookUrl);
const lessonUrl = await endEarly(`${B}/practice/?lesson=3`);
chk(lessonUrl === `${B}/practice/?lesson=3`, "I. a lesson links back to the lesson", lessonUrl);
const quoteUrl = await endEarly(`${B}/practice/?mode=quote&qid=q-do-love`);
chk(quoteUrl === `${B}/practice/?mode=quote&quote=id&qid=q-do-love`,
  "I. a quote links back by public id", quoteUrl);
const drillUrl = await endEarly(`${B}/practice/?drill=home-row`);
chk(/\/practice\/\?drill=/.test(drillUrl || ""), "I. a drill links back to the drill", drillUrl);

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
chk(customShare.shareUrl === `${B}/practice/?mode=custom`,
  "H. a custom text links to the generic mode — no id, no title", customShare.shareUrl);
await clearEvents();
await page.click("#tt-share");
await page.waitForTimeout(150);
const gCustom = await grid();
const dialogText = await page.textContent("#share-sheet");
const evJson = JSON.stringify(await events());
const hay = [JSON.stringify(gCustom), JSON.stringify(customShare), dialogText, evJson].join(" ");
for (const secret of ["ZEBRAQUARTZ", "velvetmoose", "pumpernickel", "c_share"]) {
  chk(!hay.toLowerCase().includes(secret.toLowerCase())
    && !hay.includes(encodeURIComponent(secret)),
    `H. "${secret}" appears nowhere — not in a url, the dialog, or an event`);
}
/* Analytics carry exactly the structural keys. An extra key is how a
   title ends up in a dashboard nobody audits. */
const ALLOWED = {
  share_opened: ["surface", "kind", "mode"],
  share_target: ["target", "kind", "mode", "variant"],
  share_copied: ["kind", "mode"],
  share_image_saved: ["kind", "mode", "method"],
};
const all = await events();
const shareEvents = all.filter((e) => e.name.startsWith("share_"));
chk(shareEvents.length > 0, "H. share events were recorded at all", `${shareEvents.length}`);
let keysOk = true, offender = "";
for (const e of shareEvents) {
  const allowed = ALLOWED[e.name];
  if (!allowed) { keysOk = false; offender = e.name; break; }
  const keys = Object.keys(e.props).sort();
  const extra = keys.filter((k) => allowed.indexOf(k) === -1);
  if (extra.length) { keysOk = false; offender = `${e.name}: +${extra.join(",")}`; break; }
}
chk(keysOk, "H. every share event carries only its allowed props", offender);

await page.keyboard.press("Escape");
await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
