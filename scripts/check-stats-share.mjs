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
import { bandFor } from "../lib/og/labels.js";

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
  acceptDownloads: true,
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
/* Section J presses Download PNG, which is a real download. */
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

/* The replay store is written fire-and-forget: a browser with no
   IndexedDB, or a full one, must cost somebody a replay and never the
   session that earned it, so nothing awaits the write. A page opened
   in the same breath as the run that produced it can therefore read
   the store before the record lands, and a gate that asserts "the
   replay travels" without waiting is asserting how fast this machine
   is. Polls for up to four seconds and says plainly if it gave up.

   This is a real property of the app, not only of the gate: click View
   stats the instant a run ends and that row may share without its
   replay until the next load. */
async function waitForReplay(id, ms = 4000) {
  const until = Date.now() + ms;
  for (;;) {
    const keys = await page.evaluate(async (sid) => {
      try {
        const m = await import("/assets/js/engine/replay-store.js");
        const r = await m.get(sid);
        return r && Array.isArray(r.keylog) ? r.keylog.length : 0;
      } catch { return -1; }
    }, id);
    if (keys > 0) return keys;
    if (Date.now() > until) return keys;
    await page.waitForTimeout(120);
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

/* Enough of a PNG header to say it is one, and how big. The same
   reader check-share-local-png.mjs uses. */
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngInfo(buf) {
  if (!buf || buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  if (buf.toString("latin1", 12, 16) !== "IHDR") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
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

chk(await waitForReplay(wordsSession.id) > 0, "A. its keystrokes reached the replay store");
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

{
  /* Sorting re-renders every row from scratch. A button that is wired
     once and never again is a button that disappears the first time
     somebody sorts by WPM. */
  const sortBtn = await page.$(".sessions-d3__sort[data-sort='wpm']");
  chk(!!sortBtn, "A. the list has its sort buttons (the D3 rows, not the fallback)");
  if (sortBtn) {
    await sortBtn.click();
    const back = await page.waitForSelector(
      `[data-session-id="${wordsSession.id}"] button[data-share][data-share-ready]`, { timeout: 12000 }
    ).then(() => true).catch(() => false);
    chk(back, "A. and the row still has a working Share button after a re-sort");
    if (back) {
      const url = await page.getAttribute(`[data-session-id="${wordsSession.id}"] button[data-share]`, "data-share-url");
      chk(url === rowShare.ds.shareUrl, "A. the same link, not a fresh guess at one",
        url === rowShare.ds.shareUrl ? "" : `${String(url).slice(0, 60)}…`);
    }
  }
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
chk(await waitForReplay(quoteSession.id) > 0, "B. the quote run's keystrokes reached the store");
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
  /* The counterweight to sections C and D2: a replay travels wherever
     the link can say what was typed, and a public id says it. Without
     this, "drop the replay" everywhere would pass every other check
     in this file. */
  chk(!!(f.get("r") || f.get("ru")),
    "B. and the replay DOES travel, because /r/ can resolve the words from the id",
    `${(f.get("r") || f.get("ru") || "").length} chars`);
}

// =============================================================== B2
console.log("\nB2. every other public source, through the stored record");
/* The link record keeps a book's slug, chapter and page, a lesson id,
   a drill id, a challenge id and whether it was cleared. Each of those
   is a separate field written by a separate line, and a helper wired
   into one call site out of four is this codebase's signature failure.
   Esc ends each run after two keys: what is being checked is the id
   the row rebuilds, not the typing. */
for (const [url, want, label] of [
  /* Chapter 1, page 2, not 0 and 0: srcFor defaults a missing chapter
     to 0 and a missing page to 0, so a fixture at the origin cannot
     tell a stored field from a default. */
  [`${B}/practice/?book=a-christmas-carol&ch=1&page=2`, "bk:a-christmas-carol:1:2", "a book page"],
  [`${B}/practice/?lesson=3`, "ls:3", "a lesson"],
  [`${B}/practice/?drill=home-row`, "dr:home-row", "a drill"],
  [`${B}/practice/?challenge=sprint`, "ch:sprint", "a challenge"],
]) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const painted = await page.waitForSelector(".tt-char", { timeout: 12000 }).then(() => true).catch(() => false);
  chk(painted, `B2. ${label} painted a target`, url);
  if (!painted) continue;
  await page.click(".tt-stage").catch(() => {});
  await page.keyboard.type("th", { delay: 70 });
  await page.keyboard.press("Escape");
  const carded = await page.waitForSelector("#tt-share", { timeout: 12000 }).then(() => true).catch(() => false);
  if (!carded) { chk(false, `B2. ${label}: the card came up after Esc`); continue; }
  const cardSrc = qOf(await page.getAttribute("#tt-share", "data-share-short-url")).get("src");
  const cardOk = qOf(await page.getAttribute("#tt-share", "data-share-short-url")).get("ok");
  const sess = await newestSession();
  await waitForReplay(sess.id);
  const row = await shareFromStats(sess.id);
  if (!row) { chk(false, `B2. ${label}: the row has a Share button`); continue; }
  const q = qOf(row.ds.shareShortUrl);
  chk(q.get("src") === want && cardSrc === want,
    `B2. ${label} rebuilds as ${want}`, `card ${cardSrc} / row ${q.get("src")}`);
  chk(!fragOf(row.ds.shareUrl).get("t"), `B2. ${label} carries no text`, fragOf(row.ds.shareUrl).get("t") || "(absent)");
  {
    const rf = fragOf(row.ds.shareUrl);
    chk(!!(rf.get("r") || rf.get("ru")), `B2. ${label} does carry its replay`,
      `${(rf.get("r") || rf.get("ru") || "").length} chars`);
  }
  if (want.startsWith("ch:")) {
    chk(q.get("ok") === cardOk && (q.get("ok") === "0" || q.get("ok") === "1"),
      "B2. and the challenge verdict travels with it", `card ok=${cardOk} / row ok=${q.get("ok")}`);
  }
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
chk(await waitForReplay(customSession.id) > 0, "C. the custom run's keystrokes reached the store");
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
  /* And the keystrokes go with the words. Round 1 of this branch
     dropped `t` and went on carrying `r`, which decoded to the same
     sentence one character at a time: the words were still in the link,
     spelled out. A replay with no target cannot be played anyway -- /r/
     shows no Play button for it -- so there is nothing to keep it for. */
  chk(!f.get("r") && !f.get("ru"),
    "C. and no replay either, which would spell the same words out", f.toString().slice(0, 80));
  const decoded = await codec.unpackLog({ r: f.get("r"), ru: f.get("ru") });
  chk(!decoded || !decoded.entries || decoded.entries.length === 0,
    "C. decoding what is left yields no keystrokes at all",
    decoded && decoded.entries ? `${decoded.entries.length} entries: ${JSON.stringify(decoded.entries.slice(0, 6))}` : "nothing to decode");
  chk(Number(q.get("wpm")) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(q.get("d") || ""),
    "C. but still the numbers and the date", `wpm=${q.get("wpm")} d=${q.get("d")}`);
  const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  chk(!squash(JSON.stringify(customRow2.ds)).includes(squash(CUSTOM_ID)), "C. and still no id anywhere");
  const errs = await page.evaluate(() => window.__ttErrors.slice());
  chk(errs.length === errorsBefore && pageErrors.length === 0,
    "C. and nothing threw on the way", [...errs.slice(errorsBefore), ...pageErrors].join(" | "));
}

// =============================================================== C2
console.log("\nC2. a published quote read through /custom/ keeps nothing");
/* The one case where "a text of your own" and "a public piece" are the
   same run: a quote, idiom, poem or parable opened from its own page is
   saved as a custom text carrying meta.kind and meta.sourceId, so
   isOwnText() says yes and srcFor() also says q:<id>. Whichever of the
   two is asked first decides whether this browser keeps the words of a
   published quote for fifty runs. It shares by id, so it must not. */
const CORPUS_TEXT_ID = "c_corpusquote";
const CORPUS_BODY = "The only way to do great work is to love what you do.";
await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await page.evaluate(({ id, body }) => {
  localStorage.setItem("tt:custom-texts", JSON.stringify([{
    id, title: "Steve Jobs", createdAt: new Date().toISOString(), bytes: body.length,
    lastSeg: 0, segments: [body],
    meta: { kind: "quote", sourceId: "q-do-love", title: "Steve Jobs" },
  }]));
}, { id: CORPUS_TEXT_ID, body: CORPUS_BODY });
await page.goto(`${B}/practice/?mode=custom&custom=${CORPUS_TEXT_ID}&seg=0`, { waitUntil: "domcontentloaded" });
{
  const painted = await page.waitForSelector(".tt-char", { timeout: 12000 }).then(() => true).catch(() => false);
  chk(painted, "C2. the quote is on the surface");
  if (painted) {
    await page.click(".tt-stage").catch(() => {});
    await page.keyboard.type("Th", { delay: 70 });
    await page.keyboard.press("Escape");
    await page.waitForSelector("#tt-share", { timeout: 12000 }).catch(() => {});
    const sess = await newestSession();
    await waitForReplay(sess.id);
    const rec = await page.evaluate(async (id) => {
      const m = await import("/assets/js/engine/replay-store.js");
      const r = await m.get(id);
      return r ? { text: r.text, keys: (r.keylog || []).length } : null;
    }, sess.id);
    chk(!!rec && rec.keys > 0, "C2. the run's keystrokes were filed", rec ? `${rec.keys} keys` : "no record");
    chk(!!rec && rec.text === null,
      "C2. and the store kept NO text for it, because the link names the quote by id",
      rec ? JSON.stringify(String(rec.text).slice(0, 40)) : "no record");
    const row = await shareFromStats(sess.id);
    if (row) {
      const q = qOf(row.ds.shareShortUrl), f = fragOf(row.ds.shareUrl);
      chk(q.get("src") === "q:q-do-love", "C2. the row shares it by id", q.get("src"));
      chk(!f.get("t"), "C2. with no words in the link", f.get("t") || "(absent)");
    } else {
      chk(false, "C2. the row has a Share button");
    }
  }
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

// =============================================================== D2
console.log("\nD2. a stored target whose fingerprint disagrees with the run");
/* The store answers by session id, so a record under this id IS this
   run -- unless the fingerprint of the target it kept disagrees with
   the one the profile kept, which means one of the two was rewritten
   underneath the other. The words beside the keystrokes are then not
   vouched for, and by the rule in section C the keystrokes do not
   travel without them: a replay whose target cannot be trusted would
   be played against the wrong text or not at all, and either way it
   only spells out what was typed. */
await page.evaluate(async ({ sid, text }) => {
  const rs = await import("/assets/js/engine/replay-store.js");
  await rs.save({
    id: sid,
    keylog: Array.from(text).map((ch, i) => [ch, i === 0 ? 0 : 65]),
    textHash: "deadbeef:999",
    prefs: 0,
    text: "a different sentence entirely, from some other run",
  });
}, { sid: wordsSession.id, text: wordsTarget });
const mismatchRow = await shareFromStats(wordsSession.id);
if (!mismatchRow) await bail("D2. the row is still shareable");
{
  const f = fragOf(mismatchRow.ds.shareUrl);
  chk(!f.get("t"), "D2. the words the store offered do not travel", f.get("t") || "(absent)");
  chk(!f.get("r") && !f.get("ru"), "D2. and neither do the keystrokes beside them",
    f.toString().slice(0, 80));
  const d2log = await codec.unpackLog({ r: f.get("r"), ru: f.get("ru") });
  chk(!d2log || !d2log.entries || d2log.entries.length === 0,
    "D2. nothing decodes out of the fragment", d2log && d2log.entries ? `${d2log.entries.length} entries` : "nothing to decode");
  const d2q = qOf(mismatchRow.ds.shareShortUrl);
  chk(Number(d2q.get("wpm")) > 0 && d2q.get("d"), "D2. the numbers and the date are untouched",
    `wpm=${d2q.get("wpm")} d=${d2q.get("d")}`);
}

// =============================================================== D3
console.log("\nD3. how long a target the store will keep");
/* A book imported as one custom text is millions of characters, and a
   5.4 MB target was read back out of this store during review. Fifty of
   those is a quarter of a gigabyte in somebody's browser, for words no
   link could carry anyway: the fragment budget is 8 KB. Over the cap,
   no text is kept, and by section C's rule the replay goes with it. */
{
  const capped = await page.evaluate(async () => {
    const m = await import("/assets/js/engine/replay-store.js");
    const max = m.TEXT_MAX;
    const log = [["a", 0], ["b", 70]];
    await m.save({ id: "s_capunder", keylog: log, textHash: "x:1", prefs: 0, text: "u".repeat(max) });
    await m.save({ id: "s_capover", keylog: log, textHash: "x:1", prefs: 0, text: "o".repeat(max + 1) });
    const under = await m.get("s_capunder");
    const over = await m.get("s_capover");
    return {
      max,
      underLen: under && typeof under.text === "string" ? under.text.length : -1,
      overText: over ? over.text : "missing",
      overKeys: over ? (over.keylog || []).length : -1,
    };
  });
  chk(capped.max === 20000, "D3. the cap is 20,000 characters, from the store's own export", String(capped.max));
  chk(capped.underLen === capped.max, "D3. a target exactly at the cap is kept", `${capped.underLen} chars`);
  chk(capped.overText === null, "D3. one character over it is not kept at all",
    typeof capped.overText === "string" ? `${capped.overText.length} chars kept` : String(capped.overText));
  chk(capped.overKeys === 2, "D3. and the keystrokes are still filed either way", String(capped.overKeys));
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

// =============================================================== I
console.log("\nI. the home page's 15-second sprint is a session like any other");
/* recordSession has two call sites. The home page's tape sprint lands
   in the profile, on the contribution grid and in Recent sessions, so
   its rows sat on /stats/ with no Share button at all while every
   other row had one: it was passing two arguments to a function that
   had grown a third. */
await page.goto(B + "/", { waitUntil: "domcontentloaded" });
{
  const painted = await page.waitForSelector("#tt-stage .tt-char", { timeout: 12000 }).then(() => true).catch(() => false);
  chk(painted, "I. the home sprint painted a target");
  if (painted) {
    await page.click("#tt-stage").catch(() => {});
    const homeTarget = (await page.$$eval("#tt-stage .tt-char", (els) =>
      els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""))).slice(0, 24);
    for (const ch of homeTarget) await page.keyboard.type(ch, { delay: 70 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const sess = await newestSession();
    chk(!!(sess && sess.link && sess.link.exact), "I. the sprint stored a link record",
      sess && sess.link ? Object.keys(sess.link).join(",") : "no link record");
    chk(!!(sess && sess.mode === "tape" && Number(sess.ms) > 0),
      "I. with its mode and its elapsed time", sess ? `${sess.mode} ${Math.round(sess.ms)}ms` : "");
    await waitForReplay(sess.id);
    const rec = await page.evaluate(async (id) => {
      const m = await import("/assets/js/engine/replay-store.js");
      const r = await m.get(id);
      return r ? { keys: (r.keylog || []).length, text: r.text } : null;
    }, sess.id);
    chk(!!rec && rec.keys > 0, "I. and filed its keystrokes", rec ? `${rec.keys} keys` : "no replay record");
    const row = await shareFromStats(sess.id);
    if (!row) { chk(false, "I. the home sprint's row has a Share button"); }
    else {
      const q = qOf(row.ds.shareShortUrl), f = fragOf(row.ds.shareUrl);
      chk(q.get("mode") === "tape" && Number(q.get("wpm")) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(q.get("d") || ""),
        "I. and its row shares a valid link", q.toString());
      chk(!!f.get("t") && homeTarget.startsWith(f.get("t").slice(0, 12)),
        "I. carrying the word stream it generated", `${(f.get("t") || "").slice(0, 30)}…`);
      chk(!!(f.get("r") || f.get("ru")), "I. and the replay", `${(f.get("r") || f.get("ru") || "").length} chars`);
    }
  }
}

// =============================================================== J
console.log("\nJ. Download PNG on a row typed from a text of your own");
/* The results card draws that card in the browser, because this site
   has never seen the words. A row on /stats/ has to do the same or the
   same run gives two different pictures depending on where it was
   shared from. share.js holds ONE local card at a time, so the row
   also has to fill that slot at click time -- sixty rows cannot each
   own a module-level variable. */
{
  await page.goto(B + "/stats/", { waitUntil: "domcontentloaded" });
  const sel = `[data-session-id="${customSession.id}"] button[data-share][data-share-ready]`;
  const there = await page.waitForSelector(sel, { timeout: 15000 }).then(() => true).catch(() => false);
  chk(there, "J. the custom row is on the page with its link built");
  if (there) {
    const priv = await page.getAttribute(sel, "data-share-private");
    chk(priv === "1", "J. and it is marked private, like the results card's button", String(priv));
    const nums = await page.evaluate((s) => {
      const q = new URLSearchParams(new URL(document.querySelector(s).dataset.shareShortUrl).search);
      return { wpm: Number(q.get("wpm")), acc: Number(q.get("acc")) };
    }, sel);
    await page.click(sel);
    await page.waitForTimeout(200);
    const noteHidden = await page.evaluate(() =>
      (document.querySelector("#share-sheet [data-share-local-note]") || {}).hidden);
    chk(noteHidden === false, "J. the sheet says the picture is made on this device", String(noteHidden));
    await page.evaluate(() => { window.__ttEvents.length = 0; });
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 90000 }).catch(() => null),
      page.click("#share-sheet [data-share-download]"),
    ]);
    if (!dl) { chk(false, "J. Download PNG produced a download"); }
    else {
      const got = await readFile(await dl.path());
      const info = pngInfo(got);
      chk(!!info && info.w === 1200 && info.h === 630,
        "J. it is a 1200x630 PNG", info ? `${info.w}x${info.h}, ${info.bytes} bytes` : "not a PNG");
      const gridPath = `/og/result/${nums.wpm > 200 ? "200p" : nums.wpm}-${bandFor(nums.acc)}.png`;
      const grid = await readFile(join(ROOT, gridPath)).catch(() => null);
      chk(!!grid, `J. the grid card ${gridPath} is in the build (copy _site/og in, or build without OG_SKIP=1)`);
      chk(!!grid && !got.equals(grid), "J. and it is NOT the pre-rendered grid card",
        grid ? `local ${got.length} vs grid ${grid.length} bytes` : "");
      const saved = (await events()).find((e) => e.name === "share_image_saved");
      chk(!!saved && saved.props.method === "local",
        "J. share_image_saved says method=local", JSON.stringify(saved && saved.props));
      chk(!!saved && Object.keys(saved.props).join(",") === "kind,mode,method",
        "J. and carries nothing else", JSON.stringify(saved && Object.keys(saved.props)));
    }
    await page.keyboard.press("Escape");
    /* And the slot does not leak: a public row's Download PNG must be
       the grid card, even though a private row filled the slot a
       moment ago. */
    const pubSel = `[data-session-id="${wordsSession.id}"] button[data-share][data-share-ready]`;
    const pubThere = await page.waitForSelector(pubSel, { timeout: 12000 }).then(() => true).catch(() => false);
    if (pubThere) {
      const pubPriv = await page.getAttribute(pubSel, "data-share-private");
      chk(pubPriv === null, "J. a public row is not marked private", String(pubPriv));
      const pnums = await page.evaluate((s) => {
        const q = new URLSearchParams(new URL(document.querySelector(s).dataset.shareShortUrl).search);
        return { wpm: Number(q.get("wpm")), acc: Number(q.get("acc")) };
      }, pubSel);
      await page.click(pubSel);
      await page.waitForTimeout(200);
      await page.evaluate(() => { window.__ttEvents.length = 0; });
      const [dl2] = await Promise.all([
        page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
        page.click("#share-sheet [data-share-download]"),
      ]);
      const gridPath2 = `/og/result/${pnums.wpm > 200 ? "200p" : pnums.wpm}-${bandFor(pnums.acc)}.png`;
      const want = await readFile(join(ROOT, gridPath2)).catch(() => null);
      const got2 = dl2 ? await readFile(await dl2.path()) : null;
      chk(!!got2 && !!want && got2.equals(want),
        "J. and downloads the pre-rendered card BYTE FOR BYTE, with no words in it",
        got2 && want ? `${got2.length} vs ${want.length} bytes of ${gridPath2}` : "no download");
      const saved2 = (await events()).find((e) => e.name === "share_image_saved");
      chk(!!saved2 && saved2.props.method === "server", "J. method=server for that one",
        JSON.stringify(saved2 && saved2.props));
      await page.keyboard.press("Escape");
    } else {
      chk(false, "J. the public row is still on the page");
    }
  }
}

// =============================================================== J2
console.log("\nJ2. two private rows, one renderer slot");
/* share.js holds ONE local card: it was written for a results page,
   where there is one result on screen. A list has sixty rows. If the
   slot is filled when a row is WIRED rather than when it is CLICKED,
   the last private row wired owns the renderer and every other private
   row downloads its words.

   Two rows with IDENTICAL numbers and different words, so the query
   that goes into both cards is the same string and the only thing left
   that can make the two pictures differ is the text. */
{
  const A = { id: "c_slotalpha", sid: "s_slotalpha", words: "alphapelican trundling past the marmalade lighthouse" };
  const Z = { id: "c_slotomega", sid: "s_slotomega", words: "omegawalrus bickering beneath the cardamom viaduct" };
  await page.goto(B + "/stats/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ a, z }) => {
    const rs = await import("/assets/js/engine/replay-store.js");
    localStorage.setItem("tt:custom-texts", JSON.stringify([a, z].map((x) => ({
      id: x.id, title: "slot test", createdAt: new Date().toISOString(),
      bytes: x.words.length, lastSeg: 0, segments: [x.words], meta: null,
    }))));
    const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
    const active = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
    const i = Math.max(0, ps.findIndex((x) => x.id === active));
    for (const x of [a, z]) {
      /* Identical in every number, and on the same day. */
      ps[i].sessions.unshift({
        id: x.sid, at: "2026-09-20T12:00:00.000Z", mode: "custom", duration: 30,
        wpm: 77, raw: 80, acc: 94, cons: 88, chars: 200, correctChars: 188, errors: 12,
        lang: "en-1k", layout: "qwerty", suspect: false, ms: 30000,
        link: { v: 1, exact: { wpm: 77, raw: 80, acc: 94, con: 88, ms: 30000 },
          mode: "custom", lang: "en-1k", lay: "qwerty", customId: x.id, prefs: 0,
          th: rs.textHash(x.words) },
      });
      await rs.save({
        id: x.sid, keylog: Array.from(x.words).map((c, n) => [c, n === 0 ? 0 : 66]),
        textHash: rs.textHash(x.words), prefs: 0, text: x.words,
      });
    }
    localStorage.setItem("tt:profiles", JSON.stringify(ps));
  }, { a: A, z: Z });
  await page.goto(B + "/stats/", { waitUntil: "domcontentloaded" });

  const shots = {};
  let queries = [];
  for (const x of [A, Z]) {
    const sel = `[data-session-id="${x.sid}"] button[data-share][data-share-ready]`;
    const there = await page.waitForSelector(sel, { timeout: 15000 }).then(() => true).catch(() => false);
    if (!there) { chk(false, `J2. the row for ${x.id} is on the page`); continue; }
    const d = await page.evaluate((sl) => {
      const b = document.querySelector(sl);
      return { priv: b.getAttribute("data-share-private"), q: new URL(b.dataset.shareShortUrl).search };
    }, sel);
    chk(d.priv === "1", `J2. ${x.id} is a private row`, String(d.priv));
    queries.push(d.q);
    await page.click(sel);
    await page.waitForTimeout(150);
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 90000 }).catch(() => null),
      page.click("#share-sheet [data-share-download]"),
    ]);
    shots[x.id] = dl ? await readFile(await dl.path()) : null;
    chk(!!shots[x.id] && !!pngInfo(shots[x.id]), `J2. ${x.id} downloaded a PNG`,
      shots[x.id] ? `${shots[x.id].length} bytes` : "no download");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }
  chk(queries.length === 2 && queries[0] === queries[1],
    "J2. both rows produce the identical query, so only the words can differ", queries[0] || "");
  const a = shots[A.id], z = shots[Z.id];
  chk(!!a && !!z && !a.equals(z),
    "J2. and the two cards are different pictures — each row drew its own words",
    a && z ? `${a.length} vs ${z.length} bytes` : "one of them is missing");
}

// =============================================================== K
console.log("\nK. the roadmap and the changelog say what this does");
{
  const roadmap = await fetch(B + "/roadmap/").then((r) => r.text()).catch(() => "");
  const changelog = await fetch(B + "/changelog/").then((r) => r.text()).catch(() => "");
  const flat = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const road = flat(roadmap), chan = flat(changelog);
  chk(road.length > 2000 && chan.length > 2000, "K. both pages were fetched",
    `${road.length} and ${chan.length} characters`);
  for (const [where, hay] of [["roadmap", road], ["changelog", chan]]) {
    chk(/Share a run from your stats/.test(hay), `K. ${where}: the item is there`);
    chk(/sixty newest sessions/.test(hay), `K. ${where}: it says how many sessions are listed`);
    chk(/only while this browser still has them/.test(hay),
      `K. ${where}: and that the text and the replay travel only while this browser has them`);
    chk(/carries no button|carries no button at all/.test(hay),
      `K. ${where}: and that a row with no valid link carries no button`);
    const mine = (hay.match(/Share a run from your stats[^]*?(?:carries no button at all\.|carries no button\.)/) || [""])[0];
    chk(mine.length > 400, `K. ${where}: the whole paragraph, not a fragment of it`, `${mine.length} chars`);
    chk(!/[\u2014\u2013]/.test(mine), `K. ${where}: and no em-dash or en-dash in it`,
      (mine.match(/[\u2014\u2013][^]{0,30}/) || [""])[0]);
  }
  /* The claim about sixty is a claim about the list, so read the list --
     BOTH lists. A number that is only true while a CDN answers is not a
     number worth publishing. */
  const sixty = await readFile(resolve("src/assets/js/stats/viz-sessions-d3.js"), "utf8").catch(() => "");
  chk(/sessions\.slice\(0,\s*60\)/.test(sixty), "K. and the list really does take the newest sixty");
  const boot = await readFile(resolve("src/assets/js/pages/stats-boot.js"), "utf8").catch(() => "");
  chk(/sessions\.slice\(0,\s*60\)/.test(boot),
    "K. and so does the plain table drawn when d3 cannot be fetched");
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
