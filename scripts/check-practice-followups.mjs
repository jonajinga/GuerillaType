/* Two follow-ups found while Part D was merged, and the gate that
   keeps them fixed.

   A. The home page's sprint is 15 seconds, and says so in three
      places: the hero button ("15-second tape sprint",
      ?mode=tape&duration=15), the sidecard eyebrow (a "15" that
      counts down) and the comment at the top of home-boot.js. It ran
      for 30. The engine option is `durationSec`; home-boot passed
      `duration`, which the engine ignores, so every home sprint took
      the engine's 30-second default while result.duration was
      overwritten with 15 on the way out. The card said 15, the record
      said 15, the clock said 30, and the share link built from that
      record said dur=30.

      Driven on a scaled clock (performance.now runs CLOCK_SCALE times
      faster), so 15 engine-seconds cost about four real ones and the
      stored session still reports the milliseconds the engine
      measured. The run has to END on its own: the target is 80 words,
      far more than anyone types in 15 seconds, so the only thing that
      can stop it is the deadline.

   B. Enter and Space did nothing on the results-card buttons. The
      document-level keydown in engine/input-capture.js pulls focus
      back to the hidden #tt-input for every key that is not Tab or
      Escape unless the target is an input, textarea, select or
      contenteditable -- and a <button> is none of those, so focus
      moved before the browser could turn the key into a click. Mouse
      worked; keyboard did not. Measured by the share-sheet verifier
      on 2026-09-16 and recorded as a known gap in STATE.md; this is
      that gap turned into an assertion.

      The other half matters just as much: typing while a toolbar
      button happens to hold focus must still start the run, which is
      what the focus-stealing handler is FOR. Only Enter and Space on
      a button, link or [role=button] are let through.

   Usage:
     OG_SKIP=1 npm run build     # not optional: this reads _site
     node scripts/check-practice-followups.mjs
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

/* Port from the task id. 8080 is never ours and 8765 is the shared
   default half the gates in this repo reach for. */
const TASK = "practice-followups";
const PORT = Number(process.env.PORT)
  || 8100 + ([...TASK].reduce((a, c) => a + c.charCodeAt(0), 0) % 600);
const ROOT = resolve("_site");

/* How much faster than real time the browser's clock runs in section
   A. Four is a compromise: high enough that a 15-second sprint costs
   under four real seconds, low enough that one animation frame is
   64 virtual milliseconds, so the measured run cannot overshoot far
   enough to round to 16. */
const CLOCK_SCALE = 4;

let pass = 0, fail = 0;
const chk = (ok, name, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
const md5 = (buf) => createHash("md5").update(buf).digest("hex");
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
  console.log("  FAIL  _site is not built — run `OG_SKIP=1 npm run build` first");
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

/* Prove what is answering before believing a word of it. A 200 is not
   evidence: a verifier once read a perfectly good Practice page off
   another session's server on a port it had failed to bind. */
const home = await fetch(B + "/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(home)
  /* The built HTML is minified and loses its attribute quotes. */
  && /id=["']?home-typing-card["'\s>]/.test(home);
chk(isThisProject, `server on ${PORT} is this project's home page`);
const servedJs = await fetch(B + "/assets/js/pages/home-boot.js").then((r) => r.arrayBuffer()).catch(() => null);
const diskJs = await readFile(join(ROOT, "assets/js/pages/home-boot.js")).catch(() => null);
const sameJs = !!servedJs && !!diskJs && md5(Buffer.from(servedJs)) === md5(diskJs);
chk(sameJs, "the home-boot.js it serves is the one in this worktree's _site",
  sameJs ? md5(diskJs).slice(0, 12) : `served=${servedJs ? md5(Buffer.from(servedJs)).slice(0, 12) : "none"} disk=${diskJs ? md5(diskJs).slice(0, 12) : "none"}`);
if (!isThisProject || !sameJs) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();

const readSession = (pg) => pg.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const id = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const p = ps.find((x) => x.id === id) || ps[0];
  const s = (p && p.sessions && p.sessions[0]) || null;
  return s ? { mode: s.mode, duration: s.duration, ms: s.ms, chars: s.chars, link: s.link || null } : null;
});

// ==================================================================== A
// The home sprint is 15 seconds of clock, not 15 seconds of copy.
{
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block", hasTouch: false });
  page.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 160)));

  /* The clock, sped up. Everything the engine measures goes through
     performance.now(), so shadowing it scales the deadline, the
     elapsed milliseconds it reports and the countdown together --
     which is the point: a gate that only moved the deadline would
     prove nothing about the number that lands in the profile. */
  await page.addInitScript((scale) => {
    const raw = performance.now.bind(performance);
    const t0 = raw();
    performance.now = () => t0 + (raw() - t0) * scale;
    window.__ttClockScale = scale;
  }, CLOCK_SCALE);

  await page.goto(B + "/", { waitUntil: "networkidle" });
  chk(await page.evaluate(() => window.__ttClockScale === 4 && performance.now() > 0),
    "A. the scaled clock is installed");

  /* The premise, not the fix: the page promises 15 seconds in three
     places. If this copy ever changes, the number below has to change
     with it -- that is the whole argument for 15 over 30. */
  const ctaHref = await page.getAttribute(".hero__cta a.btn--primary", "href");
  const ctaText = ((await page.textContent(".hero__cta a.btn--primary")) || "").trim();
  chk(/duration=15\b/.test(ctaHref || ""), "A. the hero button links a 15-second sprint", String(ctaHref));
  chk(/15-second tape sprint/i.test(ctaText), "A. and calls it a 15-second tape sprint", JSON.stringify(ctaText));
  chk((await page.textContent('[data-live="time"]')) === "15", "A. the sidecard counter starts at 15");

  await page.waitForSelector("#tt-text .tt-char", { timeout: 8000 });
  await page.click("#tt-stage");
  const target = await page.$$eval("#tt-text .tt-char", (els) =>
    els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
  chk(target.split(/\s+/).filter(Boolean).length >= 60,
    "A. the sprint text is far longer than 15 seconds of typing, so only the clock can end it",
    `${target.split(/\s+/).filter(Boolean).length} words`);

  /* 25 characters is a couple of virtual seconds. The rest of the
     sprint runs itself: the engine's frame loop ends it at the
     deadline whether or not anybody is still typing. */
  for (const ch of target.slice(0, 25)) await page.keyboard.type(ch, { delay: 30 });
  const shown = Number(await page.textContent('[data-live="time"]'));
  chk(Number.isFinite(shown) && shown <= 15,
    "A. the countdown never shows more than 15 seconds left", `showing ${shown}`);

  const appeared = await page.waitForSelector("#home-results:not([hidden])", { timeout: 20000 }).then(() => true).catch(() => false);
  chk(appeared, "A. the sprint ends by itself and the results popup opens");
  if (!appeared) {
    console.log("\nRUN ABORTED — the home sprint never finished; nothing below can be measured.");
    await browser.close();
    server.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(1);
  }

  const wpmShown = (await page.textContent('#home-results [data-metric="wpm"]')) || "";
  chk(/^\d+$/.test(wpmShown.trim()), "A. the popup shows a wpm number", JSON.stringify(wpmShown.trim()));

  const sess = await readSession(page);
  chk(!!sess && sess.mode === "tape", "A. the sprint was recorded as a tape session", JSON.stringify(sess && sess.mode));
  const ms = (sess && sess.ms) || 0;
  chk(ms >= 14500 && ms <= 16400,
    "A. the stored session ran for about 15,000 ms", `ms=${ms}`);
  chk(sess && sess.duration === 15,
    "A. the stored session's duration setting is 15", `duration=${sess && sess.duration}`);
  chk(sess && Math.abs(sess.duration * 1000 - ms) <= 1500,
    "A. the setting and the clock agree (the bug was 15 against 30,010)",
    `duration=${sess && sess.duration}s ms=${ms}`);

  /* The share link is built from that record by share/session-link.js,
     the same path a Share button on /stats/ takes, and `dur` in it is
     the elapsed time. It said 30 for a sprint advertised as 15. */
  const link = await page.evaluate(async () => {
    const m = await import("/assets/js/share/session-link.js");
    const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
    const id = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
    const p = ps.find((x) => x.id === id) || ps[0];
    const l = m.shortLinkForSession(p.sessions[0], { origin: "https://guerillatype.com" });
    return l ? { query: l.query, url: l.shortUrl, text: l.text } : null;
  });
  chk(!!link, "A. a share link can be built for the sprint");
  const dur = link ? new URLSearchParams(link.query).get("dur") : null;
  chk(dur === "15", "A. and it reports dur=15", `dur=${dur}`);

  await page.close();
}

// ==================================================================== B
// Enter and Space belong to the focused button.
{
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block", hasTouch: false });
  page.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 160)));
  const surfaceText = () => page.$$eval("#tt-text .tt-char", (els) =>
    els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
  /* 70 ms a key. The engine flags anything over 250 wpm as suspect and
     the results card is not the same card for a suspect run. */
  const runToTheEnd = async () => {
    await page.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "networkidle" });
    await page.waitForSelector(".tt-char", { timeout: 8000 });
    await page.click(".tt-stage").catch(() => {});
    const t = await surfaceText();
    for (const ch of t) await page.keyboard.type(ch, { delay: 70 });
    await page.waitForSelector("#tt-results:not([hidden])", { timeout: 8000 });
  };
  const active = () => page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return { id: null, tag: null, inDialog: false };
    return {
      id: el.id || null, tag: el.tagName,
      inDialog: !!el.closest("dialog"),
      dialogClass: el.closest("dialog") ? el.closest("dialog").className : null,
    };
  });

  await runToTheEnd();
  chk(await page.isVisible("#tt-share"), "B. the results card has a Share button");

  // B1. Enter on Share opens the sheet, and focus moves into it.
  await page.focus("#tt-share");
  chk((await active()).id === "tt-share", "B. the Share button can hold focus");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const sheetOpen = await page.evaluate(() => {
    const d = document.querySelector("dialog.share-sheet");
    return !!d && d.open;
  });
  chk(sheetOpen, "B. Enter on Share opens the share sheet");
  const inSheet = await active();
  chk(inSheet.inDialog && /share-sheet/.test(inSheet.dialogClass || ""),
    "B. and focus moved into the sheet", JSON.stringify(inSheet));
  chk(inSheet.id !== "tt-input", "B. focus was not stolen by the typing surface", JSON.stringify(inSheet.id));

  // B2. Escape closes it and gives focus back to the button.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  chk(await page.evaluate(() => {
    const d = document.querySelector("dialog.share-sheet");
    return !d || !d.open;
  }), "B. Escape closes the sheet");
  chk((await active()).id === "tt-share", "B. and focus comes back to the Share button", JSON.stringify(await active()));

  // B3. Space activates it too -- a button's other keyboard press.
  await page.keyboard.press(" ");
  await page.waitForTimeout(400);
  chk(await page.evaluate(() => {
    const d = document.querySelector("dialog.share-sheet");
    return !!d && d.open;
  }), "B. Space on Share opens the sheet as well");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // B4. Enter on Send feedback opens the feedback dialog.
  const fbSel = '#tt-results button[onclick*="openFeedbackModal"]';
  chk(await page.isVisible(fbSel), "B. the results card has a Send feedback button");
  await page.focus(fbSel);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const fbOpen = await page.evaluate(() => {
    const ta = document.getElementById("fb-message");
    const d = ta && ta.closest("dialog");
    return !!d && d.open;
  });
  chk(fbOpen, "B. Enter on Send feedback opens the feedback dialog");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // B5. The behaviour the focus-stealing handler exists for: an
  //     ordinary character with a toolbar button focused still starts
  //     the run. This is what a narrower fix (letting every key
  //     through to a focused button) would break.
  await page.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tt-char", { timeout: 8000 });
  const t2 = await surfaceText();
  await page.focus("#tt-restart");
  chk((await active()).id === "tt-restart", "B. a toolbar button has focus, not the surface");
  await page.keyboard.type(t2[0], { delay: 70 });
  await page.waitForTimeout(200);
  chk((await page.getAttribute("#tt-stage", "data-state")) === "running",
    "B. a printable key with a toolbar button focused still starts the run");
  chk((await active()).id === "tt-input", "B. and focus moved to the typing surface");
  chk(await page.$$eval(".tt-char--incorrect", (els) => els.length) === 0,
    "B. the key counted as the first correct character, not an error");

  // B6. Tab and Escape were already let through; they still are.
  await page.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tt-char", { timeout: 8000 });
  await page.focus("#tt-restart");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(150);
  chk((await active()).id !== "tt-input", "B. Tab still moves focus normally", JSON.stringify((await active()).id));

  await page.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
