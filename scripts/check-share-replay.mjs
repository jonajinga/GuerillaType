/* The replay player on /r/: does it show the run that was actually
   typed, and does it stay inside the promise the page makes?

   The thing being guarded is not "a player exists". It is that the
   replay is the SAME RUN. A player that drew plausible-looking text
   would pass a screenshot review and be worthless; so every assertion
   here is tied back to a real run typed through the real engine in
   this same process, at 70 ms/key, with two mistakes and a backspace
   in it. What the typist's screen ended up showing -- how many glyphs
   went green, how many went red -- is measured on the practice page,
   and the replay has to reproduce it exactly, from nothing but the URL.

   What must hold:

     A. A real run at 70 ms/key: two wrong keys, one backspace, the
        full share URL taken off the share sheet (Copy link), and the
        live glyph counts read off the practice surface.
     B. That URL opened in a FRESH context: the Play button is visible,
        __ttReplay.play(16) runs to the end, and at the end the replay
        surface carries exactly the live counts, the wpm is within
        1 of the number in the query, and the page says it matches.
     C. Seek to the middle: the counts equal an independent recount of
        events 0..k done here, in Node, from the decoded log -- not a
        number the player handed over.
     D. A link with no replay in it: no Play button, no replay root,
        and the rest of the page exactly as D2 left it.
     E. Nothing plays until Play is pressed -- for a normal viewer as
        much as for one who asked for reduced motion, who additionally
        gets a caret that does not blink.
     F. Not one request during playback leaves the origin, and not one
        carries any part of the fragment.
     G. The player is not an input. Keys pressed at it change nothing:
        the engine is driven by the scheduler and by nothing else.

   Usage:
     OG_SKIP=1 npm run build && npm run share-replay
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

/* Dynamic and guarded, for the same reason check-share-page.mjs does
   it: a verifier's first move is to revert src/ and run this again,
   and a bare static import would answer with a Node stack trace about
   a missing module instead of a FAIL with a count. */
let codec;
const MISSING = [];
try {
  codec = await import("../src/assets/js/share/codec.js");
} catch (e) {
  MISSING.push(`src/assets/js/share/codec.js (${e && e.message ? e.message : e})`);
}
try {
  await stat(resolve("src/assets/js/share/replay.js"));
} catch {
  MISSING.push("src/assets/js/share/replay.js");
}
if (MISSING.length) {
  console.log(`  FAIL  the replay player is not in this tree — ${MISSING.join(", ")}`);
  console.log("\nRUN ABORTED — the counts below are partial.");
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}

/* Port from the task id. 8080 is never ours; 8765 belongs to the older
   gates; 9495 and 9497 belong to D2's. */
const PORT = Number(process.env.PORT) || 9521;
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
  await stat(join(ROOT, "r", "index.html"));
} catch {
  chk(false, "the /r/ page is in _site — run `OG_SKIP=1 npm run build` first");
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

/* A 200 is not evidence the right thing answered. This project has
   already lost a full test run to a server that was somebody else's
   build, so: fetch the page AND the module under test, and compare the
   module byte for byte with the one in this worktree. */
const { createHash } = await import("node:crypto");
const md5 = (buf) => createHash("md5").update(buf).digest("hex");
const probe = await fetch(B + "/r/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe) && /id=["']?tt-shared["'\s>]/.test(probe);
chk(isThisProject, `the server on ${PORT} is this project's /r/ page`);
let sameBuild = false;
try {
  const served = Buffer.from(await (await fetch(B + "/assets/js/share/replay.js")).arrayBuffer());
  const mine = await readFile(join(ROOT, "assets", "js", "share", "replay.js"));
  sameBuild = md5(served) === md5(mine);
  chk(sameBuild, "and it is serving THIS worktree's replay.js", `md5 ${md5(served).slice(0, 12)}`);
} catch (e) {
  chk(false, "and it is serving THIS worktree's replay.js", String(e && e.message));
}
if (!isThisProject || !sameBuild) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const mkContext = () => browser.newContext({
  viewport: { width: 1366, height: 900 },
  serviceWorkers: "block",
  hasTouch: false,
});
const context = await mkContext();
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: B });
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
const waitOr = async (fn, msg, timeout = 15000) => {
  try { await fn(timeout); return true; }
  catch { await bail(msg); return false; }
};

// =============================================================== A
console.log("\nA. a real run: 70 ms/key, two wrong keys, one backspace");
await page.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "networkidle" });
await waitOr((t) => page.waitForSelector(".tt-char", { timeout: t }), "A. the practice surface painted");
await page.click(".tt-stage").catch(() => {});
const TARGET = await page.$$eval("#tt-text .tt-char", (els) =>
  els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
chk(TARGET.length > 20, "A. there is a real target to type", `${TARGET.length} chars`);

/* 70 ms/key. Anything faster reads as over 250 wpm and the engine
   flags the result suspect, which is a different code path. The two
   mistakes are placed by hand so the run is not all-green: one is
   corrected with a backspace (so the replay has to rewind), one is
   left standing (so the replay has to keep a red glyph). */
const wrongFor = (ch) => (ch === "q" ? "z" : "q");
const FIX_AT = 4, LEAVE_AT = 11;
for (let i = 0; i < TARGET.length; i++) {
  const ch = TARGET[i];
  if (i === FIX_AT) {
    await page.keyboard.type(wrongFor(ch), { delay: 70 });
    await page.keyboard.press("Backspace", { delay: 70 });
    await page.keyboard.type(ch, { delay: 70 });
  } else if (i === LEAVE_AT) {
    await page.keyboard.type(wrongFor(ch), { delay: 70 });
  } else {
    await page.keyboard.type(ch, { delay: 70 });
  }
}
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }),
  "A. the run finished and the results card is up");
await waitOr((t) => page.waitForFunction(() => {
  const b = document.getElementById("tt-share");
  return b && (b.getAttribute("data-share-url") || "").includes("#");
}, null, { timeout: t }), "A. the Share button got its fragment-bearing url");

/* What the typist's screen ended up showing. This is the number the
   replay has to reproduce, and it is read off the DOM, not computed. */
const live = await page.evaluate(() => ({
  correct: document.querySelectorAll("#tt-text .tt-char--correct").length,
  incorrect: document.querySelectorAll("#tt-text .tt-char--incorrect").length,
  wpm: parseInt(document.querySelector(".results__title-num").textContent, 10),
  acc: parseInt(Array.from(document.querySelectorAll(".results__metric"))
    .find((m) => /accuracy/.test(m.textContent)).querySelector(".results__value").textContent, 10),
}));
chk(live.incorrect === 1 && live.correct === TARGET.length - 1,
  "A. the live surface ended with one red glyph and the rest green",
  `${live.correct} correct, ${live.incorrect} incorrect, ${TARGET.length} chars`);
chk(live.acc < 100 && live.acc > 80, "A. and an accuracy that is neither perfect nor a robot's", `${live.acc}%`);

/* Off the sheet, not out of the dataset: Copy link is the path a real
   person's link takes, and it is the one that carries the fragment. */
await page.click("#tt-share");
await page.waitForTimeout(200);
await page.evaluate(() => navigator.clipboard.writeText("__nothing__"));
await page.click("#share-sheet [data-share-copy]");
await page.waitForTimeout(300);
const FULL_URL = await page.evaluate(() => navigator.clipboard.readText());
await page.keyboard.press("Escape");
chk(FULL_URL.startsWith(B + "/r/?") && FULL_URL.includes("#"),
  "A. the share sheet's Copy link gives a /r/ link with a fragment", FULL_URL.slice(0, 80));

const FRAG = new URLSearchParams(FULL_URL.split("#")[1] || "");
const QUERY = new URLSearchParams(new URL(FULL_URL.split("#")[0]).search);
chk(FRAG.get("t") === TARGET, "A. the fragment carries the target, whole", (FRAG.get("t") || "").slice(0, 40));
const LOG = await codec.unpackLog({ r: FRAG.get("r"), ru: FRAG.get("ru") });
chk(!!LOG && LOG.entries.length === TARGET.length + 2,
  "A. and a keystroke log of every key pressed, the backspace included",
  LOG ? `${LOG.entries.length} entries for ${TARGET.length} chars + 1 retype + 1 backspace` : "did not decode");
if (!LOG) await bail("A. the log has to decode or nothing below means anything");
/* A short log is not a small problem: it means the engine stopped
   recording, and every count below would be measuring an empty replay
   against a real run. Stop here, with a number, rather than 40 lines
   down with a stack trace. */
if (LOG.entries.length < TARGET.length) {
  await bail(`A. the log is far too short to be this run — ${LOG.entries.length} entries for ${TARGET.length} typed characters`);
}
chk(Number(QUERY.get("wpm")) === live.wpm && Number(QUERY.get("acc")) === live.acc,
  "A. the query carries the numbers the card showed", `${QUERY.get("wpm")} wpm, ${QUERY.get("acc")}%`);

/* An independent recount, done here, from the decoded log. Yes, it is
   a second implementation of the engine's rules -- that is the point:
   if the player fed events in the wrong order, fed one twice, or
   silently dropped the backspace, the player's own numbers would still
   agree with themselves and only an outside count would notice. Valid
   for the default preferences this run used (freedom on, nothing else),
   which is what the "o" parameter is checked to be below. */
function recount(entries, target, k) {
  const marks = new Array(target.length).fill(0); // 0 untyped, 1 correct, 2 wrong
  let cursor = 0, keys = 0, done = false;
  const upto = Math.min(k, entries.length);
  for (let i = 0; i < upto; i++) {
    const ch = entries[i][0];
    const cp = ch.codePointAt(0);
    if (cp === 0x03 || cp === 0x04) continue;          // pause, ended
    if (cp === 0x01 || cp === 0x02) {                  // backspace, word backspace
      if (done || cursor === 0) continue;
      let steps = 1;
      if (cp === 0x02) {
        steps = 0;
        let j = cursor - 1;
        while (j >= 0 && target[j] === " ") { steps++; j--; }
        while (j >= 0 && target[j] !== " ") { steps++; j--; }
        if (steps === 0) steps = 1;
      }
      for (let s = 0; s < steps && cursor > 0; s++) { cursor--; marks[cursor] = 0; }
      continue;
    }
    if (done) continue;
    keys++;
    if (cursor >= target.length) continue;
    marks[cursor] = ch === target[cursor] ? 1 : 2;
    cursor++;
    if (cursor >= target.length) done = true;          // words mode ends here
  }
  return {
    correct: marks.filter((m) => m === 1).length,
    incorrect: marks.filter((m) => m === 2).length,
    cursor, keys,
  };
}
{
  const whole = recount(LOG.entries, TARGET, LOG.entries.length);
  chk(whole.correct === live.correct && whole.incorrect === live.incorrect,
    "A. and replaying the log on paper gives the screen the typist saw",
    `paper ${whole.correct}/${whole.incorrect} vs screen ${live.correct}/${live.incorrect}`);
}
chk(!FRAG.get("o"), "A. the run used the default preferences (no o in the fragment)", FRAG.get("o") || "(absent)");

// =============================================================== B
console.log("\nB. the same link, opened cold: the player reproduces the run");
const ctxB = await mkContext();
const pageB = await ctxB.newPage();
const bErrors = [];
pageB.on("pageerror", (e) => bErrors.push(String(e).slice(0, 200)));
/* Every request from the moment this document starts loading, for F. */
const seen = [];
const seenD = [];
pageB.on("request", (req) => {
  let body = "";
  try { body = req.postData() || ""; } catch { body = ""; }
  seen.push({ url: req.url(), body, headers: req.headers() });
});
await pageB.goto(FULL_URL, { waitUntil: "networkidle" });
await waitOr((t) => pageB.waitForFunction(() => window.__ttReplay && window.__ttReplay.ready, null, { timeout: t }),
  "B. the player mounted from the link alone");

chk(await pageB.isVisible("#tt-replay-play"), "B. the Play button is visible");
chk(await pageB.isVisible("#tt-replay-root"), "B. so is the replay panel");
chk(await pageB.isVisible("[data-replay-surface]"), "B. and the surface it paints on");
{
  const labels = await pageB.evaluate(() => Array.from(
    document.querySelectorAll("#tt-replay-root button, #tt-replay-root input[type=range]")
  ).map((el) => ({ tag: el.tagName, label: el.getAttribute("aria-label") || "" })));
  chk(labels.length >= 7, "B. every control is a real button or slider", `${labels.length} controls`);
  chk(labels.every((l) => l.label.length > 3),
    "B. and every one of them says what it does",
    labels.map((l) => l.label || "(none)").join(" | ").slice(0, 120));
}
{
  /* Keyboard focus has to be visible. The ring comes from the site's
     global :focus-visible rule, which only applies to real focusable
     elements -- a div dressed as a button would show nothing. */
  await pageB.focus("#tt-replay-play");
  await pageB.keyboard.press("Tab");
  await pageB.keyboard.press("Shift+Tab");
  const ring = await pageB.evaluate(() => {
    const el = document.getElementById("tt-replay-play");
    const cs = getComputedStyle(el);
    return { id: document.activeElement && document.activeElement.id, w: cs.outlineWidth, style: cs.outlineStyle };
  });
  chk(ring.id === "tt-replay-play" && parseFloat(ring.w) > 0 && ring.style !== "none",
    "B. the focused control draws a visible ring", `${ring.w} ${ring.style}`);
}

/* Where playback begins in the request log. Everything before this
   line is the page loading -- webfonts from bunny.net, tippy from
   esm.sh, the site's normal furniture. Section F asks a narrower and
   more useful question: once the replay is running, does the player
   itself talk to anyone? */
const playbackMark = seen.length;
const playedAt = await pageB.evaluate(() => {
  window.__ttReplay.seek(0);
  window.__ttReplay.play(16);
  return window.__ttReplay.state().speed;
});
chk(playedAt === 16, "B. play(16) sets the speed the gate asked for", String(playedAt));
await waitOr((t) => pageB.waitForFunction(() => window.__ttReplay.state().finished, null, { timeout: t }),
  "B. the replay ran to the end");

const endState = await pageB.evaluate(() => {
  const s = window.__ttReplay.state();
  return Object.assign(s, {
    domCorrect: document.querySelectorAll("[data-replay-surface] .tt-char--correct").length,
    domIncorrect: document.querySelectorAll("[data-replay-surface] .tt-char--incorrect").length,
    verdictShown: (() => {
      const v = document.querySelector("[data-replay-verdict]");
      return v && !v.hidden ? v.textContent.trim() : "";
    })(),
  });
});
chk(endState.domCorrect === live.correct,
  "B. the replay ends with exactly the green glyphs the live run had",
  `replay ${endState.domCorrect} vs live ${live.correct}`);
chk(endState.domIncorrect === live.incorrect,
  "B. and exactly the red ones", `replay ${endState.domIncorrect} vs live ${live.incorrect}`);
chk(endState.index === LOG.entries.length,
  "B. every recorded event was delivered, no more and no fewer",
  `${endState.index} of ${LOG.entries.length}`);
chk(endState.keystrokes === TARGET.length + 1,
  "B. the engine counted one keystroke per key pressed", String(endState.keystrokes));
chk(Math.abs(endState.wpm - Number(QUERY.get("wpm"))) <= 1,
  "B. the wpm it computes is within 1 of the number in the query",
  `replay ${endState.wpm} vs shared ${QUERY.get("wpm")}`);
chk(Math.abs(endState.accuracy - Number(QUERY.get("acc"))) <= 1,
  "B. and the accuracy within a point",
  `replay ${endState.accuracy}% vs shared ${QUERY.get("acc")}%`);
chk(endState.verdict === "match" && /Matches the shared numbers/.test(endState.verdictShown),
  "B. so the page says it matches the shared numbers", endState.verdictShown || "(nothing shown)");
chk(/^✓/.test(endState.verdictShown), "B. with a tick in front of it", endState.verdictShown.slice(0, 6));
chk(!/—|–/.test(endState.verdictShown), "B. and no em-dash in it", endState.verdictShown);
chk(bErrors.length === 0, "B. the page threw nothing while playing", bErrors.join(" | "));

/* Speed has to mean something. Every wait in the scheduler is divided
   by it, so the same run at 4x must take appreciably less wall time
   than at 1x -- and a player that had quietly stopped dividing would
   still pass every count, every glyph and every verdict above. Measured
   in the page, end to end, with generous slack: the expected ratio is
   0.25 and the assertion only asks for under a half. */
{
  const timeAt = (speed) => pageB.evaluate((sp) => new Promise((resolve) => {
    window.__ttReplay.pause();
    window.__ttReplay.seek(0);
    const t0 = performance.now();
    window.__ttReplay.play(sp);
    const tick = () => {
      if (window.__ttReplay.state().finished) return resolve(Math.round(performance.now() - t0));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), speed);
  const at1 = await timeAt(1);
  const at4 = await timeAt(4);
  chk(at1 > 1500, "B. the fixture is long enough for speed to be measurable", `${at1} ms at 1x`);
  chk(at4 < at1 / 2, "B. the same run at 4x takes less than half the wall time",
    `${at1} ms at 1x, ${at4} ms at 4x, ratio ${(at4 / at1).toFixed(2)}`);
}

/* A replay of a DIFFERENT run must not say it matches. Same page, same
   player, numbers from somebody else's link: the verdict has to flip,
   or it is decoration. Two fixtures, because one that is 25 wpm out
   holds the tolerance to nothing -- widening it from 1 to 10 would
   still pass. The second is 2 wpm out: one more than is allowed.

   The fixture is built from the wpm the REPLAY computed a moment ago,
   not from the wpm in the query. Those two are allowed to differ by 1
   -- this gate says so itself, twenty lines up -- so a fixture placed
   2 above the query could land 1 from the replay, inside the tolerance,
   and the verdict would correctly read "matches" while this section
   called it a failure. That is a guard accusing a healthy tree, and it
   fired on one clean run in four before a verifier caught it. Measured
   from the replay's own number, the distance is exact by construction. */
{
  const base = endState.wpm;
  for (const [gap, why] of [[25, "25 wpm out"], [2, "2 wpm out, just past the tolerance"]]) {
    /* Away from the replay's number by exactly `gap`, in whichever
       direction stays inside the 0-400 the validator accepts. */
    const fixtureWpm = base + gap <= 400 ? base + gap : base - gap;
    const ctxX = await mkContext();
    const pageX = await ctxX.newPage();
    const other = new URL(FULL_URL);
    const q = new URLSearchParams(other.search);
    q.set("wpm", String(fixtureWpm));
    const bogus = `${other.origin}${other.pathname}?${q.toString()}#${FULL_URL.split("#")[1]}`;
    await pageX.goto(bogus, { waitUntil: "networkidle" });
    await pageX.waitForFunction(() => window.__ttReplay && window.__ttReplay.ready, null, { timeout: 15000 });
    await pageX.evaluate(() => { window.__ttReplay.seek(0); window.__ttReplay.play(16); });
    await pageX.waitForFunction(() => window.__ttReplay.state().finished, null, { timeout: 15000 });
    const v = await pageX.evaluate(() => ({
      s: window.__ttReplay.state(),
      text: (document.querySelector("[data-replay-verdict]").textContent || "").trim(),
    }));
    chk(Math.abs(v.s.shared.wpm - base) === gap,
      `B. the ${why} fixture really is ${gap} from the replay's own number`,
      `link says ${v.s.shared.wpm}, the replay computed ${base}`);
    /* The same log, the same target, the same engine: the number the
       replay computes must not move between one page and the next. If
       this ever fails it is the replay that is wrong, not the fixture --
       which is the point of asserting it rather than allowing slack. */
    chk(v.s.wpm === base,
      "B. ...and the replay computes the same wpm as it did on the first page",
      `${v.s.wpm} here, ${base} there`);
    chk(v.s.verdict === "differ" && /Replay differs from the shared numbers/.test(v.text),
      `B. a link ${why} says the replay differs`, v.text || "(nothing shown)");
    await ctxX.close();
  }
}

// =============================================================== C
console.log("\nC. the scrub: state rebuilt from events 0..k");
const MID = Math.floor(LOG.entries.length / 2);
const paperMid = recount(LOG.entries, TARGET, MID);
const mid = await pageB.evaluate((k) => {
  window.__ttReplay.pause();
  window.__ttReplay.seek(k);
  const s = window.__ttReplay.state();
  return Object.assign(s, {
    domCorrect: document.querySelectorAll("[data-replay-surface] .tt-char--correct").length,
    domIncorrect: document.querySelectorAll("[data-replay-surface] .tt-char--incorrect").length,
    scrub: Number(document.querySelector("[data-replay-scrub]").value),
  });
}, MID);
chk(mid.index === MID, "C. the player is where it was told to go", `${mid.index} of ${LOG.entries.length}`);
chk(mid.domCorrect === paperMid.correct,
  "C. the green glyphs are exactly the recount of events 0..k",
  `player ${mid.domCorrect} vs recount ${paperMid.correct}`);
chk(mid.domIncorrect === paperMid.incorrect,
  "C. and so are the red ones", `player ${mid.domIncorrect} vs recount ${paperMid.incorrect}`);
chk(mid.cursor === paperMid.cursor, "C. and the caret is at the same character",
  `player ${mid.cursor} vs recount ${paperMid.cursor}`);
chk(mid.scrub === MID, "C. the slider reads the position it seeked to", String(mid.scrub));
/* Seeking away from a finished run has to clear the finish state, all
   of it. playedAll is in here because it was the one field seek()
   forgot, which left the player reporting "I played every event" about
   a run that was no longer over. */
chk(mid.finished === false && mid.verdict === null && mid.playedAll === false,
  "C. and a mid-run seek is not a finished run, in any of the fields that say so",
  `finished=${mid.finished} verdict=${mid.verdict} playedAll=${mid.playedAll}`);

/* Seeking backwards has to rebuild, not rewind: a backspace is not
   invertible, so the only state that is certainly right is the one
   built from the beginning. Check a point BEFORE the correction. */
{
  const early = 3;
  const paperEarly = recount(LOG.entries, TARGET, early);
  const got = await pageB.evaluate((k) => {
    window.__ttReplay.seek(k);
    return {
      correct: document.querySelectorAll("[data-replay-surface] .tt-char--correct").length,
      incorrect: document.querySelectorAll("[data-replay-surface] .tt-char--incorrect").length,
      untouched: document.querySelectorAll("[data-replay-surface] .tt-char:not(.tt-char--correct):not(.tt-char--incorrect)").length,
    };
  }, early);
  chk(got.correct === paperEarly.correct && got.incorrect === paperEarly.incorrect,
    "C. seeking backwards rebuilds rather than rewinds",
    `${got.correct}/${got.incorrect} vs ${paperEarly.correct}/${paperEarly.incorrect}`);
  chk(got.untouched === TARGET.length - early,
    "C. everything after the seek point is untyped again", `${got.untouched} untouched`);
}

/* Home, End and the arrow steps, on the player and not on the page. */
{
  const steps = await pageB.evaluate(async () => {
    const root = document.querySelector("[data-replay]");
    const btn = document.getElementById("tt-replay-play");
    btn.focus();
    window.__ttReplay.seek(20);
    const fire = (key) => root.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    const before = window.__ttReplay.state().index;
    fire("ArrowLeft");
    const left = window.__ttReplay.state().index;
    fire("ArrowRight");
    const right = window.__ttReplay.state().index;
    fire("Home");
    const home = window.__ttReplay.state().index;
    fire("End");
    const end = window.__ttReplay.state().index;
    return { before, left, right, home, end, total: window.__ttReplay.state().total };
  });
  chk(steps.left === steps.before - 10 && steps.right === steps.before,
    "C. left and right step ten keystrokes", JSON.stringify(steps));
  chk(steps.home === 0 && steps.end === steps.total, "C. Home and End jump to the ends", JSON.stringify(steps));
}

// =============================================================== D
console.log("\nD. a link with no replay in it");
{
  const noReplay = `${FULL_URL.split("#")[0]}#v=1&t=${encodeURIComponent(TARGET)}`;
  const ctxD = await mkContext();
  const pageD = await ctxD.newPage();
  const dErrors = [];
  pageD.on("pageerror", (e) => dErrors.push(String(e).slice(0, 200)));
  /* This page is also the baseline for F: the same /r/ with no player
     on it, so whatever off-origin hosts it talks to are the site's own
     furniture (webfonts, tippy, instant.page) and not the replay's. */
  pageD.on("request", (req) => seenD.push({ url: req.url() }));
  await pageD.goto(noReplay, { waitUntil: "networkidle" });
  await pageD.waitForSelector("#tt-shared:not([hidden])", { timeout: 9000 });
  await pageD.waitForTimeout(250);
  const d = await pageD.evaluate(() => ({
    rootHidden: !!document.getElementById("tt-replay-root").hidden,
    playHidden: !!document.getElementById("tt-replay-play").hidden,
    playVisible: !!document.getElementById("tt-replay-play").offsetParent,
    surfaces: document.querySelectorAll("[data-replay-surface]").length,
    ready: !!(window.__ttReplay && window.__ttReplay.ready),
    played: window.__ttReplay ? window.__ttReplay.play(4) : "no namespace",
    text: (document.querySelector('[data-r="text"]').textContent || "").slice(0, 20),
    wpm: document.querySelector('[data-r="wpm"]').textContent,
  }));
  chk(d.rootHidden && !d.playVisible, "D. no Play button and no replay root",
    `root hidden=${d.rootHidden} button visible=${d.playVisible}`);
  chk(d.surfaces === 0, "D. and no replay surface was built at all", `${d.surfaces} found`);
  chk(d.ready === false && d.played === false, "D. __ttReplay answers no rather than throwing", String(d.played));
  chk(d.wpm === QUERY.get("wpm") && d.text.length > 5,
    "D. the page is otherwise exactly what D2 left: numbers and text", `${d.wpm} wpm, text "${d.text}"`);
  chk(dErrors.length === 0, "D. and it threw nothing", dErrors.join(" | "));
  await ctxD.close();
}

// =============================================================== E
console.log("\nE. nothing plays until Play is pressed");
/* Both kinds of visitor, because "it does not start by itself" is the
   decision for everybody, not a concession to one media query. Reduced
   motion gets one extra thing on top: the caret stops blinking. */
for (const viewer of ["a normal viewer", "prefers-reduced-motion"]) {
  const reduce = viewer !== "a normal viewer";
  const ctxE = await mkContext();
  const pageE = await ctxE.newPage();
  const eErrors = [];
  pageE.on("pageerror", (e) => eErrors.push(String(e).slice(0, 200)));
  if (reduce) await pageE.emulateMedia({ reducedMotion: "reduce" });
  await pageE.goto(FULL_URL, { waitUntil: "networkidle" });
  await pageE.waitForFunction(() => window.__ttReplay && window.__ttReplay.ready, null, { timeout: 15000 });

  const atLoad = await pageE.evaluate(() => window.__ttReplay.state());
  chk(atLoad.playing === false && atLoad.index === 0,
    `E. ${viewer}: the player mounts at rest`, `playing=${atLoad.playing} index=${atLoad.index}`);
  /* Long enough that a run which HAD started would be most of the way
     through it: this fixture is about five seconds at 1x. */
  await pageE.waitForTimeout(1200);
  const later = await pageE.evaluate(() => ({
    s: window.__ttReplay.state(),
    glyphs: document.querySelectorAll("[data-replay-surface] .tt-char--correct, [data-replay-surface] .tt-char--incorrect").length,
    label: (document.getElementById("tt-replay-play").textContent || "").trim(),
    caretAnim: (() => {
      const c = document.querySelector("[data-replay-surface] .tt-caret");
      return c ? getComputedStyle(c).animationName : "(no caret)";
    })(),
  }));
  chk(later.s.playing === false && later.s.index === 0,
    `E. ${viewer}: and a second later it still has not started`,
    `playing=${later.s.playing} index=${later.s.index}`);
  chk(later.glyphs === 0,
    `E. ${viewer}: not one character has been painted`, `${later.glyphs} glyphs`);
  chk(await pageE.isVisible("#tt-replay-play") && /play/i.test(later.label),
    `E. ${viewer}: the Play button is there, waiting`, later.label || "(no label)");
  chk(atLoad.reducedMotion === reduce,
    `E. ${viewer}: the player reads the motion preference correctly`, String(atLoad.reducedMotion));
  chk(reduce ? later.caretAnim === "none" : later.caretAnim === "tt-blink",
    `E. ${viewer}: the caret ${reduce ? "does not blink" : "blinks"}`, later.caretAnim);

  await pageE.click("#tt-replay-play");
  await pageE.waitForTimeout(400);
  const after = await pageE.evaluate(() => window.__ttReplay.state());
  chk(after.index > 0, `E. ${viewer}: pressing it plays the run`, `index ${after.index}`);
  chk(eErrors.length === 0, `E. ${viewer}: and nothing threw`, eErrors.join(" | "));
  await ctxE.close();
}

// =============================================================== F
console.log("\nF. playback sends nothing anywhere");
{
  const origin = new URL(B).origin;
  const rValue = FRAG.get("r") || FRAG.get("ru") || "";
  const during = seen.slice(playbackMark);
  const offOrigin = during.filter((r) => !r.url.startsWith(origin)
    && !r.url.startsWith("data:") && !r.url.startsWith("blob:") && !r.url.startsWith("about:"));
  chk(seen.length > 3, "F. the page really did make requests to inspect", `${seen.length} requests`);
  chk(offOrigin.length === 0, "F. not one request made during playback left the origin",
    offOrigin.length ? offOrigin.map((r) => r.url.slice(0, 70)).join(" | ")
      : `${during.length} requests once playback started`);
  /* And over the whole load, measured against the same page without a
     replay on it: the player may not introduce a single host the page
     did not already talk to. A beacon fired the moment the run starts
     autoplaying would be inside the load window and invisible to the
     check above -- this is the one that sees it. */
  const hostsOf = (list) => new Set(list
    .map((r) => { try { return new URL(r.url).host; } catch { return ""; } })
    .filter((h) => h && h !== new URL(B).host));
  const baseline = hostsOf(seenD);
  const newHosts = [...hostsOf(seen)].filter((h) => !baseline.has(h));
  chk(seenD.length > 3 && baseline.size > 0,
    "F. the no-replay page gave a baseline of hosts to compare against",
    [...baseline].join(", ") || "(none)");
  chk(newHosts.length === 0,
    "F. and the player introduced no host the page did not already use",
    newHosts.join(", ") || `${baseline.size} hosts, all of them the page's own`);
  const carriers = seen.filter((r) => {
    const hay = `${r.url} ${r.body} ${JSON.stringify(r.headers)}`;
    const dec = (() => { try { return decodeURIComponent(hay); } catch { return hay; } })();
    return hay.includes(rValue.slice(0, 24)) || dec.includes(rValue.slice(0, 24))
      || hay.includes(TARGET.slice(0, 18)) || dec.includes(TARGET.slice(0, 18))
      || hay.includes("#") || dec.includes("#");
  });
  chk(carriers.length === 0, "F. and not one carried the replay, the text or a #",
    carriers.map((r) => r.url.slice(0, 90)).join(" | "));
}

// =============================================================== G
console.log("\nG. the player is not an input");
{
  await pageB.evaluate(() => { window.__ttReplay.pause(); window.__ttReplay.seek(12); });
  await pageB.evaluate(() => document.querySelector('[data-r="text"]').scrollIntoView());
  await pageB.mouse.click(400, 300);
  const before = await pageB.evaluate(() => Object.assign(window.__ttReplay.state(), {
    dom: document.querySelectorAll("[data-replay-surface] .tt-char--correct, [data-replay-surface] .tt-char--incorrect").length,
    active: (document.activeElement && document.activeElement.tagName) || "",
  }));
  for (const k of ["a", "b", "c", "x", "y", "z"]) await pageB.keyboard.type(k, { delay: 40 });
  await pageB.waitForTimeout(200);
  const after = await pageB.evaluate(() => Object.assign(window.__ttReplay.state(), {
    dom: document.querySelectorAll("[data-replay-surface] .tt-char--correct, [data-replay-surface] .tt-char--incorrect").length,
    active: (document.activeElement && document.activeElement.tagName) || "",
  }));
  chk(after.index === before.index && after.keystrokes === before.keystrokes,
    "G. six keys pressed at a paused replay move nothing",
    `index ${before.index}->${after.index}, keystrokes ${before.keystrokes}->${after.keystrokes}`);
  chk(after.dom === before.dom, "G. and paint nothing", `${before.dom} -> ${after.dom} glyphs`);
  chk(after.active !== "INPUT" && after.active !== "TEXTAREA",
    "G. nothing stole the focus into a text field", after.active || "(body)");
  chk((await pageB.$$("#tt-input")).length === 0,
    "G. there is no hidden typing input on this page to steal it into");

  /* And while it is actually playing: the scheduler delivers the log,
     the keyboard adds nothing to it. */
  await pageB.evaluate(() => { window.__ttReplay.seek(0); window.__ttReplay.play(2); });
  for (const k of ["a", "b", "c", "d", "e"]) await pageB.keyboard.type(k, { delay: 30 });
  await pageB.evaluate(() => window.__ttReplay.play(16));
  await waitOr((t) => pageB.waitForFunction(() => window.__ttReplay.state().finished, null, { timeout: t }),
    "G. the replay still reached the end");
  const end2 = await pageB.evaluate(() => Object.assign(window.__ttReplay.state(), {
    domCorrect: document.querySelectorAll("[data-replay-surface] .tt-char--correct").length,
    domIncorrect: document.querySelectorAll("[data-replay-surface] .tt-char--incorrect").length,
  }));
  chk(end2.keystrokes === TARGET.length + 1 && end2.index === LOG.entries.length,
    "G. keys pressed during playback are in neither the count nor the log",
    `${end2.keystrokes} keystrokes, ${end2.index} events`);
  chk(end2.domCorrect === live.correct && end2.domIncorrect === live.incorrect,
    "G. and the run still ends on the typist's screen, not a mixture",
    `${end2.domCorrect}/${end2.domIncorrect} vs ${live.correct}/${live.incorrect}`);
}

/* Built again and again, deliberately: a re-share, a resize or a second
   boot must not leave two players fighting over one surface -- and,
   less visibly, must not leave the old ones alive. The Play button is
   the page's, not the player's, so every construction that binds a
   listener to it and never unbinds leaves a dead player, its engine,
   its renderer and a detached DOM tree reachable forever. */
{
  const teardown = await pageB.evaluate(async () => {
    const m = await import("/assets/js/share/replay.js");
    const r = window.__ttReplay;
    const made = [];
    for (let i = 0; i < 4; i++) {
      made.push(m.mountReplay({
        root: r.root, entries: r.entries, text: r.target, prefs: r.prefs, model: r.model,
      }));
    }
    const live = made[made.length - 1];
    const stale = made.slice(0, -1);
    live.seek(0);
    live.play(1);
    const before = stale.map((p) => p.idx);
    await new Promise((res) => setTimeout(res, 700));
    const after = stale.map((p) => p.idx);
    live.pause();
    live.seek(5);
    return {
      mounts: made.length,
      bound: document.getElementById("tt-replay-play").__ttToggleBound,
      surfaces: document.querySelectorAll("[data-replay-surface]").length,
      playButtons: document.querySelectorAll("#tt-replay-play").length,
      /* By the attribute the speed buttons actually own. aria-pressed
         alone counts the Play button too, which carries it to say
         whether it is playing. */
      speedButtons: document.querySelectorAll("#tt-replay-root [data-replay-speed]").length,
      staleDestroyed: stale.filter((p) => p.destroyed === true).length,
      staleReleased: stale.filter((p) => p.engine === null).length,
      staleCount: stale.length,
      staleFrozen: JSON.stringify(before) === JSON.stringify(after),
      before, after,
      liveIndex: live.state().index,
    };
  });
  chk(teardown.surfaces === 1 && teardown.playButtons === 1 && teardown.speedButtons === 4,
    "G. four more mounts leave one surface, one Play button and four speed buttons",
    JSON.stringify({ surfaces: teardown.surfaces, play: teardown.playButtons, speeds: teardown.speedButtons }));
  chk(teardown.bound === 1,
    "G. and exactly one click listener on the button the page ships",
    `${teardown.bound} bound after ${teardown.mounts + 1} constructions`);
  chk(teardown.staleDestroyed === teardown.staleCount && teardown.staleReleased === teardown.staleCount,
    "G. every superseded player is destroyed and has let go of its engine",
    `${teardown.staleDestroyed}/${teardown.staleCount} destroyed, ${teardown.staleReleased}/${teardown.staleCount} released`);
  chk(teardown.staleFrozen,
    "G. and none of them is still running a scheduler against the surface",
    `${JSON.stringify(teardown.before)} -> ${JSON.stringify(teardown.after)}`);
  chk(teardown.liveIndex === 5, "G. the newest player is the one that works", String(teardown.liveIndex));
}

// =============================================================== H
console.log("\nH. a run is played to its last keystroke, or it does not claim to match");
/* The defect this section exists for: `dur` in the query is whole
   seconds, and the engine ENDS a timed run when the clock passes its
   deadline. A run whose real length rounded down therefore lost its
   last keystrokes, and the verdict still read "matches", because a
   truncated run's numbers are close to the whole run's numbers almost
   by construction. A real timed test, then the same link with `dur`
   forced a second short -- which is exactly what the rounding does. */
{
  await page.goto(`${B}/practice/?mode=time&duration=5`, { waitUntil: "networkidle" });
  await waitOr((t) => page.waitForSelector(".tt-char", { timeout: t }), "H. the timed surface painted");
  await page.click(".tt-stage").catch(() => {});
  const stream = await page.$$eval("#tt-text .tt-char", (els) =>
    els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
  for (let i = 0; i < stream.length; i++) {
    if (i % 10 === 0 && await page.isVisible("#tt-results")) break;
    await page.keyboard.type(stream[i], { delay: 70 });
  }
  await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }),
    "H. the timed run ended on its own deadline");
  await waitOr((t) => page.waitForFunction(() => {
    const b = document.getElementById("tt-share");
    return b && (b.getAttribute("data-share-url") || "").includes("#");
  }, null, { timeout: t }), "H. and produced a share url");
  const timedUrl = await page.evaluate(() => document.getElementById("tt-share").getAttribute("data-share-url"));
  const timedQ = new URLSearchParams(new URL(timedUrl.split("#")[0]).search);
  const timedFrag = new URLSearchParams(timedUrl.split("#")[1] || "");
  const timedLog = await codec.unpackLog({ r: timedFrag.get("r"), ru: timedFrag.get("ru") });
  chk(timedQ.get("mode") === "time" && Number(timedQ.get("dur")) >= 4,
    "H. it really was a timed run", `mode=${timedQ.get("mode")} dur=${timedQ.get("dur")}`);
  if (!timedLog) await bail("H. the timed run's log has to decode");

  /* dur one second short: the rounding that happens for real whenever
     a run's length lands just above a whole second. */
  const shortQ = new URLSearchParams(timedQ);
  shortQ.set("dur", String(Math.max(0, Number(timedQ.get("dur")) - 1)));
  for (const [name, url] of [
    ["as shared", timedUrl],
    ["with dur a second short", `${B}/r/?${shortQ.toString()}#${timedUrl.split("#")[1]}`],
  ]) {
    const ctxH = await mkContext();
    const pageH = await ctxH.newPage();
    await pageH.goto(url, { waitUntil: "networkidle" });
    await pageH.waitForFunction(() => window.__ttReplay && window.__ttReplay.ready, null, { timeout: 15000 });
    await pageH.evaluate(() => { window.__ttReplay.seek(0); window.__ttReplay.play(16); });
    await pageH.waitForFunction(() => window.__ttReplay.state().finished, null, { timeout: 20000 });
    const st = await pageH.evaluate(() => window.__ttReplay.state());
    chk(st.index === st.total && st.total === timedLog.entries.length,
      `H. ${name}: every one of the logged events was played`,
      `${st.index} of ${st.total}`);
    chk(st.playedAll === true, `H. ${name}: and the player knows it played all of it`);
    chk(!(st.verdict === "match" && st.index < st.total),
      `H. ${name}: it never says "matches" about a run it cut short`,
      `${st.verdict} at ${st.index}/${st.total}`);
    await ctxH.close();
  }

  /* The other direction: a link whose text is one character shorter
     than the log. The engine reaches the end of the text and finishes
     with events still in hand, and the numbers come out within a
     whisker of the shared ones (one fewer character over one fewer
     keystroke's worth of time). Only "did I play all of it" can tell
     these apart, which is why the verdict asks. */
  const shortText = TARGET.slice(0, -1);
  const shortUrl = `${FULL_URL.split("#")[0]}#v=1&t=${encodeURIComponent(shortText)}`
    + `&${FRAG.get("r") ? "r" : "ru"}=${FRAG.get("r") || FRAG.get("ru")}`;
  const ctxS = await mkContext();
  const pageS = await ctxS.newPage();
  await pageS.goto(shortUrl, { waitUntil: "networkidle" });
  await pageS.waitForFunction(() => window.__ttReplay && window.__ttReplay.ready, null, { timeout: 15000 });
  await pageS.evaluate(() => { window.__ttReplay.seek(0); window.__ttReplay.play(16); });
  await pageS.waitForFunction(() => window.__ttReplay.state().finished, null, { timeout: 20000 });
  const sh = await pageS.evaluate(() => ({
    s: window.__ttReplay.state(),
    text: (document.querySelector("[data-replay-verdict]").textContent || "").trim(),
  }));
  chk(sh.s.playedAll === false && sh.s.index < sh.s.total,
    "H. a text one character short leaves events unplayed", `${sh.s.index} of ${sh.s.total}`);
  chk(Math.abs(sh.s.wpm - sh.s.shared.wpm) <= 1,
    "H. and its numbers are close enough that the numbers alone would have said yes",
    `${sh.s.wpm} vs shared ${sh.s.shared.wpm}`);
  chk(sh.s.verdict === "differ" && /Replay differs/.test(sh.text),
    "H. so the verdict refuses it on the strength of the unplayed events", sh.text || "(nothing shown)");
  await ctxS.close();
}

// =============================================================== I
console.log("\nI. a pause in the log holds the clock, and says so");
/* Spliced into the real log from section A with a delta of zero, so the
   recorded timing is untouched: the pause marker adds no time to the
   run, because the engine already subtracted it. That makes this two
   assertions in one -- the player must hold, and the numbers must come
   out exactly as they did without it. */
{
  const withPause = LOG.entries.slice();
  const PAUSE_AT = Math.min(20, withPause.length - 2);
  withPause.splice(PAUSE_AT, 0, [codec.MARK_PAUSE, 0]);
  const packed = await codec.packLog(withPause, { quantum: 1 });
  const url = `${FULL_URL.split("#")[0]}#v=1&t=${encodeURIComponent(TARGET)}&${packed.key}=${packed.value}`;
  const ctxP = await mkContext();
  const pageP = await ctxP.newPage();
  await pageP.goto(url, { waitUntil: "networkidle" });
  await pageP.waitForFunction(() => window.__ttReplay && window.__ttReplay.ready, null, { timeout: 15000 });
  chk((await pageP.evaluate(() => window.__ttReplay.state().total)) === withPause.length,
    "I. the spliced log decoded with the pause in it", `${withPause.length} events`);

  await pageP.evaluate((k) => { window.__ttReplay.seek(k); window.__ttReplay.play(1); }, PAUSE_AT);
  await pageP.waitForTimeout(250);
  const a = await pageP.evaluate(() => ({
    s: window.__ttReplay.state(),
    badge: !document.querySelector("[data-replay-badge]").hidden,
  }));
  await pageP.waitForTimeout(500);
  const b = await pageP.evaluate(() => ({
    s: window.__ttReplay.state(),
    badge: !document.querySelector("[data-replay-badge]").hidden,
  }));
  chk(a.badge && b.badge, "I. the panel says they paused here, and keeps saying it while it holds",
    `badge ${a.badge} then ${b.badge}`);
  chk(a.s.index === PAUSE_AT + 1 && b.s.index === PAUSE_AT + 1,
    "I. the marker is delivered and nothing else is, for the length of the hold",
    `index ${a.s.index} then ${b.s.index}`);
  chk(a.s.clockMs === b.s.clockMs,
    "I. and the clock is HELD, not merely slowed -- a pause costs the run no time",
    `${a.s.clockMs} ms then ${b.s.clockMs} ms`);
  chk(a.s.playing === true && b.s.playing === true,
    "I. while the player is still playing, not stopped");

  await pageP.evaluate(() => window.__ttReplay.play(16));
  await pageP.waitForFunction(() => window.__ttReplay.state().finished, null, { timeout: 20000 });
  const done = await pageP.evaluate(() => ({
    s: window.__ttReplay.state(),
    correct: document.querySelectorAll("[data-replay-surface] .tt-char--correct").length,
    incorrect: document.querySelectorAll("[data-replay-surface] .tt-char--incorrect").length,
  }));
  chk(done.s.index === withPause.length && done.s.playedAll,
    "I. the hold ends and the rest of the log plays", `${done.s.index} of ${withPause.length}`);
  chk(done.correct === live.correct && done.incorrect === live.incorrect,
    "I. the screen is the same screen", `${done.correct}/${done.incorrect} vs ${live.correct}/${live.incorrect}`);
  chk(done.s.verdict === "match",
    "I. and the numbers are unchanged by the pause, because a pause is not time",
    `${done.s.wpm} vs shared ${done.s.shared.wpm}`);
  await ctxP.close();
}

// =============================================================== J
console.log("\nJ. 375 px: the panel fits, and the slider is big enough to hit");
{
  const ctxJ = await browser.newContext({ viewport: { width: 375, height: 800 }, serviceWorkers: "block" });
  const pageJ = await ctxJ.newPage();
  await pageJ.goto(FULL_URL, { waitUntil: "networkidle" });
  await pageJ.waitForFunction(() => window.__ttReplay && window.__ttReplay.ready, null, { timeout: 15000 });
  await pageJ.waitForTimeout(300);
  const m = await pageJ.evaluate(() => {
    const panel = document.querySelector(".replay");
    const live = document.querySelector("[data-replay-live]");
    const scrub = document.querySelector("[data-replay-scrub]");
    const pr = panel.getBoundingClientRect();
    const lr = live.getBoundingClientRect();
    const sr = scrub.getBoundingClientRect();
    return {
      panelLeft: pr.left, panelRight: pr.right,
      liveLeft: lr.left, liveRight: lr.right,
      overflow: Math.round(lr.right - pr.right),
      scrubH: Math.round(sr.height),
      scrubW: Math.round(sr.width),
      labels: Array.from(live.querySelectorAll(".live-stats__label")).map((el) => ({
        t: el.textContent.trim(),
        right: el.getBoundingClientRect().right,
        clipped: el.scrollWidth > el.clientWidth + 1,
      })),
      buttons: Array.from(document.querySelectorAll("#tt-replay-root button")).map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), right: r.right };
      }),
    };
  });
  chk(m.liveRight <= m.panelRight + 0.5 && m.liveLeft >= m.panelLeft - 0.5,
    "J. the live-stats row stays inside the panel's border",
    `row ${Math.round(m.liveLeft)}..${Math.round(m.liveRight)} in panel ${Math.round(m.panelLeft)}..${Math.round(m.panelRight)} (overflow ${m.overflow}px)`);
  const badLabel = m.labels.find((l) => l.clipped || l.right > m.panelRight + 0.5);
  chk(!badLabel, "J. and no label is cut off, including \"words typed\"",
    badLabel ? `${badLabel.t} right=${Math.round(badLabel.right)} clipped=${badLabel.clipped}` : m.labels.map((l) => l.t).join(", "));
  chk(m.scrubH >= 44, "J. the scrub slider is at least 44 px of hit area", `${m.scrubH} px tall, ${m.scrubW} px wide`);
  const offPanel = m.buttons.filter((b) => b.right > m.panelRight + 0.5);
  chk(offPanel.length === 0, "J. and every control is inside the panel too",
    offPanel.length ? JSON.stringify(offPanel[0]) : `${m.buttons.length} controls`);
  await ctxJ.close();
}

// ---------------------------------------------------------------- done
chk(pageErrors.length === 0, "the practice page threw nothing either", pageErrors.join(" | "));
await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
