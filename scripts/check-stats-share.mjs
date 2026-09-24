/* Sharing a run that is already over: the Share button on /stats/.

   The results card has the whole engine result in hand. A row on
   /stats/ has the stored record and whatever the replay store still
   holds, and it has to produce the SAME link -- otherwise the same run
   says two different things depending on where you shared it from.
   That is the promise this file guards, plus the older one it inherits:
   the server sees numbers and public ids, and what somebody typed
   travels only after the "#", where no browser puts it on the wire.

   What must hold:

     A. A words run, typed at 70 ms/key with two deliberate errors.
        The link the row offers has a query EQUAL to the results
        card's -- every key, every value, the date included -- and a
        fragment whose text and keystroke log decode to the same
        thing. Decoded, not compared as strings: the two are packed
        separately and the ladder is free to choose a different
        quantum.
     B. A quote run shares src=q:<id> and carries no text at all: the
        landing page fetches the words from /data/.
     C. A text of your own shares its words after the "#" and its title
        and its id nowhere, in any form. Delete the text from this
        browser and the same row shares numbers only -- no `t`, and no
        error on the page.
     D. A row whose replay has been evicted (tt-replays cleared) shares
        without `r`, and /r/ offers no Play button for it.
     E. A record written before any of this existed -- no link record,
        no elapsed time, no replay -- still shares its numbers and its
        date, and throws nothing.
     F. The sheet opens from the keyboard: Tab to a row's Share button,
        press Enter.
     G. Every request from /stats/ through the sheet is intercepted.
        Nothing carries the text, the title or the id, and sharing
        contacts no host the page did not already contact.

   A note on G and third parties. /stats/ is not /r/: it loads d3 and
   tippy from esm.sh and the site's analytics tag, and it did before
   this feature existed. So G asserts two things rather than one --
   that the set of foreign hosts is exactly the page's known ones and
   sharing adds none, and that nothing, to any host, ours included,
   carries a word of the run. The tracker is blocked from the network
   throughout this gate, which keeps a test run out of the real
   dashboard and leaves window.umami as the stub, so every property
   every event would have sent is read and swept too.

   Usage:
     OG_SKIP=1 npm run build && npm run stats-share
   The result cards under _site/og are only needed for the sheet's
   Download PNG button, which this gate does not press.
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

/* The pure half, imported rather than reimplemented, and dynamically
   so a verifier who has reverted src/ sees a FAIL with a count instead
   of a Node stack about ERR_MODULE_NOT_FOUND. */
let codec = null;
try {
  codec = await import("../src/assets/js/share/codec.js");
} catch (e) {
  console.log(`  FAIL  src/assets/js/share/codec.js is missing — ${e && e.message ? e.message : e}`);
  console.log("\nRUN ABORTED — the counts below are partial.");
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}

/* Port from the task id (md5 "stats-share" -> a7e1 -> 42977), not from
   habit. 8080 is never ours and 8765 belongs to the older gates. */
const PORT = Number(process.env.PORT) || 42977;
const ROOT = resolve("_site");

/* Sentinels. Nothing in this list may ever appear in a request, in an
   analytics property, or in anything a server could read. */
const CUSTOM_TITLE = "ZEBRAQUARTZ private notes";
const CUSTOM_ID = "c_stats7788";
const CUSTOM_BODY = "velvetmoose gallopingly through the pumpernickel orchard";
const TITLE_WORDS = ["zebraquartz", "velvetmoose", "pumpernickel"];

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
  await stat(join(ROOT, "stats", "index.html"));
} catch {
  chk(false, "the /stats/ page is in _site — run `npm run build` first");
  console.log(`\n${pass} passed, ${fail} failed`);
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
   not evidence: another session's server on this port would answer a
   perfectly good stats page from a different build. So the page is
   checked for being this project's, and one JS file is fetched over
   HTTP and compared byte for byte with the one in this worktree's
   _site. */
const probe = await fetch(B + "/stats/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe) && /id=["']?sessions-list/.test(probe);
chk(isThisProject, `server on ${PORT} is this project's /stats/ page`);
const md5 = (buf) => createHash("md5").update(buf).digest("hex");
let servedSame = false, servedHash = "", diskHash = "";
try {
  const served = Buffer.from(await (await fetch(B + "/assets/js/pages/stats-boot.js")).arrayBuffer());
  const disk = await readFile(join(ROOT, "assets", "js", "pages", "stats-boot.js"));
  servedHash = md5(served); diskHash = md5(disk);
  servedSame = servedHash === diskHash;
} catch { servedSame = false; }
chk(servedSame, "and the JS it serves is this worktree's build (md5)", `${servedHash.slice(0, 12)} vs ${diskHash.slice(0, 12)}`);
if (!isThisProject || !servedSame) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  serviceWorkers: "block",
  hasTouch: false,
});
await context.addInitScript(() => {
  window.__ttEvents = [];
  window.__ttErrors = [];
  window.addEventListener("error", (e) => window.__ttErrors.push(String(e.message || e)));
  window.umami = { track: (name, props) => { window.__ttEvents.push({ name, props: props || {} }); } };
});
/* The analytics tag never reaches the network in this gate: a gate run
   is not a visit, and blocking it keeps window.umami as the stub above
   so every property every event WOULD have sent can be read back. The
   requests are still recorded by section G. */
const ANALYTICS_HOSTS = ["umami.is"];
await context.route("**/*", (route) => {
  const host = (() => { try { return new URL(route.request().url()).hostname; } catch { return ""; } })();
  if (ANALYTICS_HOSTS.some((h) => host === h || host.endsWith("." + h))) return route.abort();
  return route.continue();
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

async function bail(msg) {
  chk(false, msg);
  console.log("\nRUN ABORTED — the counts below are partial.");
  await browser.close().catch(() => {});
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}
const waitOr = async (fn, msg, timeout = 12000) => {
  try { await fn(timeout); return true; }
  catch { await bail(msg); return false; }
};
const events = () => page.evaluate(() => window.__ttEvents.slice());
const clearEvents = () => page.evaluate(() => { window.__ttEvents.length = 0; });

const surfaceText = () => page.$$eval(".tt-char", (els) =>
  els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));

/* 70 ms/key. Anything faster is flagged suspect by the engine (over
   250 wpm) and would be testing a different code path. Two wrong keys
   on purpose, so accuracy lands below 100 and the numbers in the link
   are not all the same constant. */
async function typeRun(target, { errorsAt = [3, 9] } = {}) {
  let i = 0;
  for (const ch of target) {
    if (errorsAt.includes(i)) await page.keyboard.type(ch === "q" ? "z" : "q", { delay: 70 });
    else await page.keyboard.type(ch, { delay: 70 });
    i++;
  }
}

/* The newest stored session, straight out of the profile. */
const newestSession = () => page.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const id = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const prof = ps.find((x) => x.id === id) || ps[0];
  return prof && prof.sessions ? prof.sessions[0] : null;
});

/* Open /stats/ and wait for one row's Share button to finish its
   second pass (data-share-ready), then read every attribute off it. */
async function shareFromStats(sessionId, { reload = true } = {}) {
  if (reload) await page.goto(B + "/stats/", { waitUntil: "domcontentloaded" });
  const sel = `[data-session-id="${sessionId}"] button[data-share][data-share-ready]`;
  const ok = await waitOr((t) => page.waitForSelector(sel, { timeout: t }),
    `a Share button finished building for session ${sessionId}`);
  if (!ok) return null;
  return page.evaluate((s) => {
    const b = document.querySelector(s);
    return {
      ds: Object.assign({}, b.dataset),
      label: b.textContent.trim(),
      tag: b.tagName,
      type: b.getAttribute("type"),
      tip: b.getAttribute("data-tip"),
      visible: !!(b.offsetParent || b.getClientRects().length),
    };
  }, sel);
}

const qOf = (url) => new URLSearchParams(new URL(url).search);
const fragOf = (url) => {
  const h = new URL(url).hash.replace(/^#/, "");
  return new URLSearchParams(h);
};
/* Two packed logs, decoded and compared as entries. The packer is free
   to pick a different quantum for the same log (the ladder decides by
   size), so the deltas are re-rounded to the coarser of the two before
   they are compared; the characters are compared as they are. */
async function sameKeylog(fragA, fragB) {
  const a = await codec.unpackLog({ r: fragA.get("r"), ru: fragA.get("ru") });
  const b = await codec.unpackLog({ r: fragB.get("r"), ru: fragB.get("ru") });
  if (!a || !b) return { ok: false, why: `decode failed (card ${!!a}, row ${!!b})`, a, b };
  const q = Math.max(a.quantum || 1, b.quantum || 1);
  const norm = (log) => log.entries.map(([ch, d]) => [ch, Math.round(d / q) * q]);
  const A = norm(a), C = norm(b);
  return {
    ok: JSON.stringify(A) === JSON.stringify(C),
    why: `${A.length} vs ${C.length} entries, quantum ${a.quantum}/${b.quantum}`,
    a, b,
  };
}

// =============================================================== A
console.log("\nA. a words run: the row's link is the card's link");
await page.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "domcontentloaded" });
await waitOr((t) => page.waitForSelector(".tt-char", { timeout: t }), "A. the practice page painted a target");
await page.click(".tt-stage").catch(() => {});
const wordsTarget = await surfaceText();
chk(wordsTarget.length > 20, "A. a real word stream is on the surface", `${wordsTarget.length} chars`);
await typeRun(wordsTarget);
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }),
  "A. the run finished and the results card is up");
await waitOr((t) => page.waitForFunction(() => {
  const b = document.getElementById("tt-share");
  return b && b.getAttribute("data-share-url") && b.getAttribute("data-share-url").includes("#");
}, null, { timeout: t }), "A. the card's Share button upgraded to the full link");
const cardShare = await page.evaluate(() => Object.assign({}, document.getElementById("tt-share").dataset));
const wordsSession = await newestSession();
chk(!!(wordsSession && wordsSession.id), "A. the run was recorded in the profile", wordsSession && wordsSession.id);
chk(!!(wordsSession && wordsSession.link && wordsSession.link.exact),
  "A. and the record carries the link fields the card was built from",
  wordsSession && wordsSession.link ? Object.keys(wordsSession.link).join(",") : "no link record");

const rowShare = await shareFromStats(wordsSession.id);
if (!rowShare) await bail("A. the row for that run has a Share button");
chk(rowShare.tag === "BUTTON" && rowShare.type === "button" && rowShare.ds.share === "",
  "A. the row's action is a button[data-share], the same contract as the card",
  `${rowShare.tag} type=${rowShare.type}`);
chk(rowShare.label === "Share", "A. it reads Share", JSON.stringify(rowShare.label));
chk(rowShare.tip === "Share this run. The numbers travel in the link; the text and replay, if kept, sit after the #.",
  "A. with the tooltip the brief specifies", JSON.stringify(rowShare.tip));
chk(!/[—–]/.test(rowShare.tip || ""), "A. and no dash in it that is not a hyphen");
chk(rowShare.visible, "A. and it is visible on the row");

{
  const cardQ = qOf(cardShare.shareShortUrl);
  const rowQ = qOf(rowShare.ds.shareShortUrl);
  chk(cardQ.toString() === rowQ.toString(),
    "A. the row's query is the card's query, key for key and value for value",
    `card ${cardQ.toString()}\n        row  ${rowQ.toString()}`);
  const keys = [...new Set([...cardQ.keys(), ...rowQ.keys()])];
  const differ = keys.filter((k) => cardQ.get(k) !== rowQ.get(k));
  chk(differ.length === 0, "A. no single key differs", differ.map((k) => `${k}: ${cardQ.get(k)} vs ${rowQ.get(k)}`).join(", "));
  chk(cardQ.get("d") === rowQ.get("d") && /^\d{4}-\d{2}-\d{2}$/.test(rowQ.get("d") || ""),
    "A. including d, the day of the run", rowQ.get("d"));
  chk(rowQ.get("pb") === cardQ.get("pb"), "A. and pb, which only the stored record could have known",
    `card ${cardQ.get("pb")} / row ${rowQ.get("pb")}`);
  chk(Number(rowQ.get("acc")) < 100, "A. the run really did land below 100 % (the numbers are not constants)", rowQ.get("acc"));
}
{
  const cardF = fragOf(cardShare.shareUrl);
  const rowF = fragOf(rowShare.ds.shareUrl);
  chk(!!cardF.get("t") && cardF.get("t") === rowF.get("t"),
    "A. the fragment carries the same text",
    `${(rowF.get("t") || "").slice(0, 40)}… (${(rowF.get("t") || "").length} chars)`);
  chk((rowF.get("t") || "").replace(/\s+/g, " ").trim() === wordsTarget.replace(/\s+/g, " ").trim(),
    "A. and that text is what was actually on the surface");
  const kl = await sameKeylog(cardF, rowF);
  chk(kl.ok, "A. and the same keystroke log, decoded", kl.why);
  chk(!!kl.a && kl.a.entries.length > 20, "A. a log with real keystrokes in it, not an empty one",
    kl.a ? `${kl.a.entries.length} entries` : "none");
  chk(rowShare.ds.shareUrl.includes("#") && !rowShare.ds.shareShortUrl.includes("#"),
    "A. short url has no fragment, full url does");
}

// =============================================================== B
console.log("\nB. a quote run names the quote and carries no text");
await page.goto(`${B}/practice/?mode=quote&qid=q-do-love`, { waitUntil: "domcontentloaded" });
await waitOr((t) => page.waitForSelector(".tt-char", { timeout: t }), "B. the quote is on the surface");
await page.click(".tt-stage").catch(() => {});
await page.keyboard.type("Th", { delay: 70 });
await page.keyboard.press("Escape");
await waitOr((t) => page.waitForSelector("#tt-share", { timeout: t }), "B. the card is up after Esc");
const quoteCardSrc = qOf(await page.getAttribute("#tt-share", "data-share-short-url")).get("src");
const quoteSession = await newestSession();
const quoteRow = await shareFromStats(quoteSession.id);
if (!quoteRow) await bail("B. the quote row has a Share button");
{
  const q = qOf(quoteRow.ds.shareShortUrl);
  chk(q.get("src") === "q:q-do-love", "B. the row shares src=q:q-do-love", q.get("src"));
  const f = fragOf(quoteRow.ds.shareUrl);
  chk(!f.get("t"), "B. and no t at all — the landing page looks the words up", f.get("t") || "(absent)");
  chk(q.get("mode") === "quote", "B. the mode reads quote, not custom", q.get("mode"));
  chk(quoteCardSrc === "q:q-do-love" && q.get("src") === quoteCardSrc,
    "B. and the results card named the same quote", `card ${quoteCardSrc} / row ${q.get("src")}`);
}

// =============================================================== C
console.log("\nC. a text of your own: the words travel, the title and the id never do");
await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await page.evaluate(({ title, body, id }) => {
  localStorage.setItem("tt:custom-texts", JSON.stringify([{
    id, title, createdAt: new Date().toISOString(), bytes: body.length,
    lastSeg: 0, segments: [body], meta: null,
  }]));
}, { title: CUSTOM_TITLE, body: CUSTOM_BODY, id: CUSTOM_ID });
await page.goto(`${B}/practice/?mode=custom&custom=${CUSTOM_ID}&seg=0`, { waitUntil: "domcontentloaded" });
await waitOr((t) => page.waitForSelector(".tt-char", { timeout: t }), "C. the custom text is on the surface");
await page.click(".tt-stage").catch(() => {});
const customTarget = await surfaceText();
chk(customTarget.includes("velvetmoose"), "C. the sentinel body is what is being typed", JSON.stringify(customTarget.slice(0, 40)));
await typeRun(customTarget, { errorsAt: [4] });
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }), "C. the custom run finished");
const customSession = await newestSession();
const customRow = await shareFromStats(customSession.id);
if (!customRow) await bail("C. the custom row has a Share button");
{
  const q = qOf(customRow.ds.shareShortUrl);
  const f = fragOf(customRow.ds.shareUrl);
  chk(!q.has("src"), "C. no src: a text of your own has no public id and never gets one", q.get("src") || "(absent)");
  chk((f.get("t") || "").includes("velvetmoose"), "C. the words are in the fragment",
    `${(f.get("t") || "").slice(0, 40)}…`);
  /* Squashed to letters and digits before the search, so custom:c_x,
     custom%3Ac_x and custom-c-x all collapse to the same string and a
     "helpful" sanitiser cannot slip the id through in a new shape. */
  const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const everything = JSON.stringify(customRow.ds);
  chk(!squash(everything).includes(squash(CUSTOM_ID)), "C. the private id appears nowhere on the button, in any shape");
  chk(!squash(everything).includes(squash(CUSTOM_TITLE)), "C. and neither does the title");
  const serverVisible = customRow.ds.shareShortUrl + " " + customRow.ds.shareTitle + " " + customRow.ds.shareText + " " + customRow.ds.shareImage;
  for (const w of TITLE_WORDS) {
    chk(!serverVisible.toLowerCase().includes(w), `C. no "${w}" anywhere a server could read it`);
  }
}
/* Delete the text. The words are no longer this browser's to hand on,
   whatever else is still in the replay store. */
await page.evaluate(async (id) => {
  const m = await import("/assets/js/engine/custom-text.js");
  m.deleteSaved(id);
}, CUSTOM_ID);
const customGone = await page.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]").length);
chk(customGone === 0, "C. the saved text is gone from this browser", `${customGone} left`);
const errorsBefore = (await page.evaluate(() => window.__ttErrors.slice())).length;
const customRow2 = await shareFromStats(customSession.id);
if (!customRow2) await bail("C. the row is still there after the text was deleted");
{
  const f = fragOf(customRow2.ds.shareUrl);
  const q = qOf(customRow2.ds.shareShortUrl);
  chk(!f.get("t"), "C. after the delete the link carries no text at all", f.get("t") || "(absent)");
  chk(Number(q.get("wpm")) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(q.get("d") || ""),
    "C. but still the numbers and the date", `wpm=${q.get("wpm")} d=${q.get("d")}`);
  const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  chk(!squash(JSON.stringify(customRow2.ds)).includes(squash(CUSTOM_ID)), "C. and still no id anywhere");
  const errs = await page.evaluate(() => window.__ttErrors.slice());
  chk(errs.length === errorsBefore && pageErrors.length === 0,
    "C. and nothing threw on the way", [...errs.slice(errorsBefore), ...pageErrors].join(" | "));
}

// =============================================================== D
console.log("\nD. a run whose replay has been evicted");
const clearedOk = await page.evaluate(async () => {
  const m = await import("/assets/js/engine/replay-store.js");
  return await m.clear();
});
chk(clearedOk !== false, "D. tt-replays cleared", String(clearedOk));
const noReplayRow = await shareFromStats(wordsSession.id);
if (!noReplayRow) await bail("D. the row is still shareable with no replay");
{
  const f = fragOf(noReplayRow.ds.shareUrl);
  const q = qOf(noReplayRow.ds.shareShortUrl);
  chk(!f.get("r") && !f.get("ru"), "D. no replay in the fragment", f.toString());
  chk(!f.get("t"), "D. and no text either, since the store held it beside the keystrokes", f.get("t") || "(absent)");
  chk(Number(q.get("wpm")) > 0 && q.get("d"), "D. the numbers and the date still travel", `wpm=${q.get("wpm")} d=${q.get("d")}`);
  /* And the landing page agrees: no replay in the link, no Play. */
  await page.goto(noReplayRow.ds.shareUrl, { waitUntil: "domcontentloaded" });
  await waitOr((t) => page.waitForFunction(() => !!window.__ttReplay, null, { timeout: t }), "D. /r/ finished booting");
  const r = await page.evaluate(() => {
    const b = document.getElementById("tt-replay-play");
    return {
      ready: window.__ttReplay.ready,
      entries: window.__ttReplay.entries ? window.__ttReplay.entries.length : 0,
      buttonShown: !!(b && (b.offsetParent || b.getClientRects().length)),
      rootHidden: !!(document.getElementById("tt-replay-root") || {}).hidden,
    };
  });
  chk(r.ready === false && r.entries === 0, "D. /r/ has no replay to play", JSON.stringify(r));
  chk(!r.buttonShown, "D. and shows no Play button", `buttonShown=${r.buttonShown} rootHidden=${r.rootHidden}`);
}

// =============================================================== E
console.log("\nE. a session written before any of this existed");
const LEGACY_ID = "s_legacy0001";
await page.goto(B + "/stats/", { waitUntil: "domcontentloaded" });
await page.evaluate((id) => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const active = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const i = Math.max(0, ps.findIndex((x) => x.id === active));
  /* Exactly the record session-recorder wrote before this change: no
     link, no ms, no replay anywhere. */
  ps[i].sessions.unshift({
    id, at: "2026-03-14T09:15:00.000Z", mode: "time", duration: 30,
    wpm: 58.4, raw: 61.2, acc: 96.3, cons: 81.7,
    chars: 154, correctChars: 148, errors: 6,
    lang: "en-1k", layout: "qwerty", suspect: false,
  });
  localStorage.setItem("tt:profiles", JSON.stringify(ps));
}, LEGACY_ID);
const legacyRow = await shareFromStats(LEGACY_ID);
if (!legacyRow) await bail("E. an old record still gets a Share button");
{
  const q = qOf(legacyRow.ds.shareShortUrl);
  const f = fragOf(legacyRow.ds.shareUrl);
  chk(q.get("wpm") === "58" && q.get("acc") === "96" && q.get("n") === "154" && q.get("err") === "6",
    "E. the numbers travel", q.toString());
  chk(q.get("d") === "2026-03-14", "E. and the date is the day it happened, not today", q.get("d"));
  chk(q.get("mode") === "time" && q.get("dur") === "30", "E. the mode and the length it knew about", `${q.get("mode")} ${q.get("dur")}s`);
  chk(!f.get("t") && !f.get("r") && !f.get("ru") && !f.get("o"),
    "E. no text, no replay, no settings mask — it never had them", f.toString());
  chk(!q.has("pb"), "E. and no personal-best badge it cannot vouch for", q.get("pb") || "(absent)");
  const errs = await page.evaluate(() => window.__ttErrors.slice());
  chk(errs.length === 0 && pageErrors.length === 0, "E. and nothing threw", [...errs, ...pageErrors].join(" | "));
}

/* ...and the two records nothing can be built from. This is the whole
   of "hidden for rows the site cannot build a valid link for": a row
   whose query lib/og/validate.js refuses, and a row with no session id
   to find a replay or a record by. Neither gets a button; both still
   draw as rows. */
console.log("\nE2. and the rows no link can be built for");
await page.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const active = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const i = Math.max(0, ps.findIndex((x) => x.id === active));
  /* 1999 is outside the range lib/og/validate.js accepts for `d`
     (2015..2100), so the query it produces is not a valid one. */
  ps[i].sessions.unshift({
    id: "s_ancient001", at: "1999-05-05T10:00:00.000Z", mode: "time", duration: 30,
    wpm: 44.1, raw: 47, acc: 95, cons: 80, chars: 120, correctChars: 114, errors: 6,
    lang: "en-1k", layout: "qwerty", suspect: false,
  });
  /* And a record with no id at all. */
  ps[i].sessions.unshift({
    at: new Date().toISOString(), mode: "time", duration: 30,
    wpm: 41.5, raw: 44, acc: 93, cons: 77, chars: 110, correctChars: 102, errors: 8,
    lang: "en-1k", layout: "qwerty", suspect: false,
  });
  localStorage.setItem("tt:profiles", JSON.stringify(ps));
});
await page.goto(B + "/stats/", { waitUntil: "domcontentloaded" });
await waitOr((t) => page.waitForSelector(`[data-session-id="${LEGACY_ID}"] button[data-share][data-share-ready]`, { timeout: t }),
  "E2. the shareable rows finished building");
{
  const seen = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("[data-session-id]"));
    const idless = rows.filter((r) => !r.getAttribute("data-session-id"));
    const ancient = document.querySelector('[data-session-id="s_ancient001"]');
    return {
      rows: rows.length,
      buttons: document.querySelectorAll("button[data-share]").length,
      idless: idless.length,
      idlessWithButton: idless.filter((r) => r.querySelector("button[data-share]")).length,
      ancientDrawn: !!ancient,
      ancientHasButton: !!(ancient && ancient.querySelector("button[data-share]")),
    };
  });
  chk(seen.ancientDrawn && !seen.ancientHasButton,
    "E2. a record whose date the validator refuses is drawn, with no Share button", JSON.stringify(seen));
  chk(seen.idless === 1 && seen.idlessWithButton === 0,
    "E2. and neither does a record with no session id", `${seen.idless} id-less row(s), ${seen.idlessWithButton} with a button`);
  chk(seen.buttons === seen.rows - 2,
    "E2. every other row has one", `${seen.buttons} buttons on ${seen.rows} rows`);
}

// =============================================================== F
console.log("\nF. the sheet opens from the keyboard");
await clearEvents();
const opened = await page.evaluate(async (id) => {
  const btn = document.querySelector(`[data-session-id="${id}"] button[data-share]`);
  btn.focus();
  const focused = document.activeElement === btn;
  /* A real Enter through the browser is sent below; this records what
     the page looked like before it. */
  return { focused, dialogOpen: !!(document.getElementById("share-sheet") || {}).open };
}, LEGACY_ID);
chk(opened.focused, "F. the Share button takes focus");
chk(!opened.dialogOpen, "F. and the sheet is closed before the key");
await page.keyboard.press("Enter");
await page.waitForTimeout(250);
const afterEnter = await page.evaluate(() => {
  const d = document.getElementById("share-sheet");
  return {
    open: !!(d && d.open),
    preview: d ? (d.querySelector("[data-share-preview]") || {}).textContent : "",
    targets: d ? d.querySelectorAll("[data-share-target]").length : 0,
  };
});
chk(afterEnter.open, "F. Enter opens the share sheet", JSON.stringify(afterEnter).slice(0, 120));
chk(afterEnter.targets >= 10, "F. with the full grid of destinations", String(afterEnter.targets));
chk(/^\d+ wpm · \d+% accuracy/.test(afterEnter.preview || ""),
  "F. and the preview is numbers first", JSON.stringify(afterEnter.preview));
{
  const ev = (await events()).find((e) => e.name === "share_opened");
  chk(!!ev && ev.props.surface === "stats" && ev.props.kind === "result",
    "F. share_opened says it came from the stats page", JSON.stringify(ev && ev.props));
}
await page.keyboard.press("Escape");

// =============================================================== G
console.log("\nG. every request from /stats/ through the sheet");
/* Put the sentinel text back first. Sections C and D deliberately took
   it away -- the saved text was deleted and the replay store cleared --
   and sweeping requests for words that are no longer in the link would
   prove nothing at all. Seeded through the app's own modules, on the
   page that is NOT being swept, because localStorage and IndexedDB are
   shared across the context. The guard assertion below says out loud
   that the link under the sweep really does carry the words. */
await page.evaluate(async ({ id, title, text, sid }) => {
  localStorage.setItem("tt:custom-texts", JSON.stringify([{
    id, title, createdAt: new Date().toISOString(), bytes: text.length,
    lastSeg: 0, segments: [text], meta: null,
  }]));
  const rs = await import("/assets/js/engine/replay-store.js");
  await rs.save({
    id: sid,
    keylog: Array.from(text).map((ch, i) => [ch, i === 0 ? 0 : 60 + (i % 5) * 7]),
    textHash: rs.textHash(text),
    prefs: 0,
    text,
  });
}, { id: CUSTOM_ID, title: CUSTOM_TITLE, text: customTarget, sid: customSession.id });

/* A fresh page. Playwright reports requests per page and the beacons
   of a previous document land late: the /r/ gate lost half an hour to
   a POST from the page before being blamed on the page after. */
const gPage = await context.newPage();
const reqs = [];
gPage.on("request", (r) => {
  reqs.push({ url: r.url(), method: r.method(), body: (() => { try { return r.postData() || ""; } catch { return ""; } })() });
});
const gErrors = [];
gPage.on("pageerror", (e) => gErrors.push(String(e).slice(0, 200)));
await gPage.goto(B + "/stats/", { waitUntil: "domcontentloaded" });
await gPage.waitForSelector(`[data-session-id="${customSession.id}"] button[data-share][data-share-ready]`, { timeout: 15000 })
  .catch(() => {});
{
  /* The guard: sweeping a link with nothing in it is a green tick
     that means nothing. */
  const full = await gPage.getAttribute(`[data-session-id="${customSession.id}"] button[data-share]`, "data-share-url");
  const f = fragOf(full || `${B}/r/?v=1`);
  chk((f.get("t") || "").includes("velvetmoose") && !!(f.get("r") || f.get("ru")),
    "G. the link about to be swept really does carry the text and the replay",
    `t=${(f.get("t") || "").slice(0, 30)}… r=${(f.get("r") || f.get("ru") || "").length} chars`);
}
const beforeShare = reqs.length;
await gPage.click(`[data-session-id="${customSession.id}"] button[data-share]`);
await gPage.waitForTimeout(300);
/* Click a destination without actually navigating to it: the handler
   is delegated from the grid, so removing the href exercises the same
   path a real click takes. */
await gPage.evaluate(() => {
  const a = document.querySelector('#share-sheet [data-share-target="x"]');
  if (a) { a.removeAttribute("href"); a.click(); }
  const t = document.querySelector('#share-sheet [data-share-target="telegram"]');
  if (t) { t.removeAttribute("href"); t.click(); }
});
await gPage.waitForTimeout(400);
chk(reqs.length >= 10, "G. there were requests to sweep at all",
  `${reqs.length} requests, ${reqs.length - beforeShare} of them after the sheet opened`);

const ORIGIN = new URL(B).origin;
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return u; } };
const isForeign = (u) => { try { return new URL(u).origin !== ORIGIN; } catch { return true; } };
const foreignHosts = [...new Set(reqs.filter((r) => isForeign(r.url)).map((r) => hostOf(r.url)))];
/* The page's own third parties, every one of them older than this
   feature: d3 and tippy from esm.sh, the web fonts from bunny, the
   prefetcher, and the analytics tag (blocked above, and it still
   asks). Anything else here means sharing introduced one. */
const ALLOWED_FOREIGN = [
  "esm.sh", "fonts.bunny.net", "instant.page",
  "cloud.umami.is", "gateway.umami.is", "api-gateway.umami.dev",
];
const strangers = foreignHosts.filter((h) => !ALLOWED_FOREIGN.includes(h));
chk(strangers.length === 0, "G. no host beyond the page's own third parties is contacted",
  strangers.join(", ") || `seen: ${foreignHosts.join(", ") || "none"}`);
/* And the sharper form of the same question, which does not depend on
   that list being kept up to date: whatever the page contacted before
   anybody pressed Share is the baseline, and pressing Share must not
   add to it. */
const hostsBefore = new Set(reqs.slice(0, beforeShare).filter((r) => isForeign(r.url)).map((r) => hostOf(r.url)));
const foreignAfter = reqs.slice(beforeShare).filter((r) => isForeign(r.url));
const newHostsAfter = [...new Set(foreignAfter.map((r) => hostOf(r.url)))].filter((h) => !hostsBefore.has(h));
chk(newHostsAfter.length === 0, "G. and sharing contacts none that the page had not already",
  newHostsAfter.join(", ") || `baseline ${[...hostsBefore].join(", ") || "none"}; ${foreignAfter.length} foreign requests after`);

const decodeAll = (s) => {
  let out = String(s || "");
  for (let i = 0; i < 3; i++) {
    try { const d = decodeURIComponent(out.replace(/%(?![0-9a-f]{2})/gi, "%25")); if (d === out) break; out = d; }
    catch { break; }
  }
  return out + " " + String(s || "");
};
const haystack = reqs.map((r) => `${r.method} ${decodeAll(r.url)} ${decodeAll(r.body)}`);
const evJson = decodeAll(JSON.stringify(await gPage.evaluate(() => window.__ttEvents.slice())));
const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
for (const [label, needle] of [["the text", "velvetmoose"], ["the title", "zebraquartz"], ["the id", CUSTOM_ID]]) {
  const hit = haystack.find((h) => squash(h).includes(squash(needle)));
  chk(!hit, `G. no request carries ${label}`, hit ? hit.slice(0, 160) : "");
  chk(!squash(evJson).includes(squash(needle)), `G. and no analytics property carries ${label}`);
}
{
  const hit = haystack.find((h) => /[?&#](t|r|ru)=/.test(h));
  chk(!hit, "G. no request carries a fragment parameter of a share link", hit ? hit.slice(0, 160) : "");
  const hashed = reqs.find((r) => r.url.includes("#"));
  chk(!hashed, "G. and no request URL has a # in it at all", hashed ? hashed.url.slice(0, 120) : "");
}
{
  /* The sheet did open and did report, or the sweep above swept an
     empty room. */
  const evs = await gPage.evaluate(() => window.__ttEvents.slice());
  const names = evs.map((e) => e.name);
  chk(names.includes("share_opened") && names.includes("share_target"),
    "G. the sheet really did run its analytics path", names.join(","));
  const props = evs.flatMap((e) => Object.entries(e.props || {}).map(([k, v]) => `${e.name}.${k}=${v}`));
  const custom = props.find((p) => /c_[a-z0-9]{4,}/i.test(p));
  chk(!custom, "G. and no property carries a c_-shaped id in any other form", custom || "");
}
chk(gErrors.length === 0, "G. and the page threw nothing while all this happened", gErrors.join(" | "));

// =============================================================== H
console.log("\nH. with the CDN unreachable, the plain list shares too");
/* d3 is fetched from esm.sh at runtime and the sessions list falls
   back to a plain table when it cannot be had. That fallback is a real
   path -- an offline browser, a blocked CDN, a corporate proxy -- and a
   Share button that only exists inside the D3 rows would be missing
   exactly when somebody is least able to work out why. */
const hPage = await context.newPage();
await hPage.route("**/esm.sh/**", (route) => route.abort());
const hErrors = [];
hPage.on("pageerror", (e) => hErrors.push(String(e).slice(0, 200)));
await hPage.goto(B + "/stats/", { waitUntil: "domcontentloaded" });
const hSel = `[data-session-id="${customSession.id}"] button[data-share][data-share-ready]`;
const hOk = await hPage.waitForSelector(hSel, { timeout: 15000 }).then(() => true).catch(() => false);
chk(hOk, "H. the fallback list still offers Share on the row");
if (hOk) {
  const h = await hPage.evaluate((sel) => {
    const b = document.querySelector(sel);
    const row = b.closest("[data-session-id]");
    return { tag: row.tagName, label: b.textContent.trim(), url: b.getAttribute("data-share-url"), d3: !!document.querySelector(".session-row") };
  }, hSel);
  chk(h.tag === "TR" && !h.d3, "H. and it is the plain table, not the D3 rows", `${h.tag} d3rows=${h.d3}`);
  chk(h.label === "Share" && fragOf(h.url).get("t"), "H. with the same label and the same link", h.label);
  chk(hErrors.length === 0, "H. and nothing threw", hErrors.join(" | "));
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
