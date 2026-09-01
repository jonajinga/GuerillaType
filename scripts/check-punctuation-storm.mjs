#!/usr/bin/env node
/* Punctuation Storm -- gate the MECHANIC, not the markup.

   A test that only asks "did a <text> element appear" would pass
   against a stage that spawns fragments nobody can clear, scores
   nothing, never speeds up, and silently obeys the one preference that
   would delete the game. So every section below either types a real
   fragment and demands an exact number back, or measures a rate over
   the wall clock.

   ANTI-VACUITY. [].every(...) is true. Every .every() here is paired
   with a length assertion, and every section that reads the stage first
   proves the stage had something on it. The one that matters most is
   the storm-rate section: "later window has more spawns than the early
   window" is trivially satisfiable by 0 and 3, so the early window is
   independently required to be non-empty.

   Usage:
     npm run build
     npx serve _site -l 8821 --no-clipboard &
     BASE_URL=http://localhost:8821 node scripts/check-punctuation-storm.mjs

   The build step is not optional. This reads _site, not src -- running
   it against a stale build tests the previous commit. */
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:8765";
const URL_GAME = B + "/practice/storm/";

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

/* The scoring rule, re-implemented here on purpose rather than imported
   from engine/punct-fragments.js. An oracle that imports the code it is
   checking agrees with any change to that code, including a wrong one.
   This is the rule as /practice/storm/ states it in prose:
     10 points per punctuation character + 1 per character,
     +10% per fragment already cleared in the current combo. */
const puncts = (s) => (String(s).match(/[^A-Za-z0-9 ]/g) || []).length;
const expectedBase = (s) => 10 * puncts(s) + String(s).length;
const expectedScore = (s, comboAfter) =>
  Math.round(expectedBase(s) * (1 + 0.1 * (Math.max(1, comboAfter) - 1)));

const browser = await chromium.launch();
const pageErrors = [];

async function newPage() {
  const p = await browser.newPage({ viewport: { width: 1366, height: 950 }, serviceWorkers: "block" });
  p.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  p.on("console", (m) => { if (m.type() === "error") pageErrors.push("console: " + m.text().slice(0, 200)); });
  return p;
}

const hudOf = (p) => p.evaluate(() => {
  const num = (sel) => Number((document.querySelector(sel) || {}).textContent);
  return {
    score: num("[data-score]"),
    cleared: num("[data-cleared]"),
    combo: num("[data-streak]"),
    shields: num("[data-shields]"),
    intensity: (document.querySelector("[data-intensity]") || {}).textContent,
    best: num("[data-best]"),
  };
});

const liveFrags = (p) =>
  p.$$eval("#storm-layer [data-frag]", (els) => els.map((e) => e.getAttribute("data-frag")))
   .catch(() => []);

async function waitUntil(p, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await p.waitForTimeout(60);
  }
  console.log(`  (timed out waiting for ${label} after ${timeoutMs}ms)`);
  return false;
}

async function freshGame(p, mutateProfile) {
  await p.goto(URL_GAME, { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(350);
  if (mutateProfile) {
    await p.evaluate(async (src) => {
      const prof = await import("/assets/js/profiles.js");
      // eslint-disable-next-line no-new-func
      prof.updateActive(new Function("p", src));
    }, mutateProfile);
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForTimeout(350);
  }
}

/* ─────────────────────────────────────────────────────────────
   1. The page exists, is routed, and boots.
   ───────────────────────────────────────────────────────────── */
console.log("\n## 1. The page is wired into the site");
{
  const p = await newPage();
  const resp = await p.goto(URL_GAME, { waitUntil: "domcontentloaded" });
  chk(!!resp && resp.status() === 200, "/practice/storm/ is a real page", `HTTP ${resp ? resp.status() : "none"}`);
  chk((await p.title()).includes("Punctuation Storm"), "…titled Punctuation Storm", JSON.stringify(await p.title()));
  const slug = await p.evaluate(() => document.body.dataset.page);
  chk(slug === "practice-storm", "body carries pageSlug practice-storm (the key main.js routes on)", JSON.stringify(slug));
  await p.waitForTimeout(700);
  // If main.js did not route practice-storm to storm-boot.js, nothing
  // below runs -- the boot file is what paints the pre-round stage.
  const demo = await p.locator("#storm-layer [data-demo]").count();
  chk(demo === 3, "storm-boot.js ran: three demo fragments painted before Start", `got ${demo}`);
  const before = await liveFrags(p);
  chk(before.length === 0, "…and no LIVE targets exist before Start (demo nodes carry no data-frag)", JSON.stringify(before));
  await p.close();
}

/* ─────────────────────────────────────────────────────────────
   2. The fragment pool is punctuation, and it is typeable.
   ───────────────────────────────────────────────────────────── */
console.log("\n## 2. The pool is punctuation-heavy ASCII, with no ambiguous pairs");
{
  const p = await newPage();
  await p.goto(URL_GAME, { waitUntil: "domcontentloaded" });
  const pool = await p.evaluate(async () => {
    const m = await import("/assets/js/engine/punct-fragments.js");
    return m.FRAGMENTS;
  });
  chk(Array.isArray(pool) && pool.length >= 30, "the pool has at least 30 fragments", `got ${Array.isArray(pool) ? pool.length : typeof pool}`);
  const nonAscii = pool.filter((f) => !/^[\x20-\x7E]+$/.test(f));
  chk(pool.length > 0 && nonAscii.length === 0,
    "every fragment is printable ASCII — no smart quotes, em-dashes or ellipsis characters",
    JSON.stringify(nonAscii.slice(0, 4)));
  const wordy = pool.filter((f) => puncts(f) === 0);
  chk(pool.length > 0 && wordy.length === 0,
    "every fragment actually contains punctuation — this is not a word game",
    JSON.stringify(wordy.slice(0, 4)));
  const dupes = pool.filter((f, i) => pool.indexOf(f) !== i);
  chk(pool.length > 0 && dupes.length === 0, "no duplicate fragments", JSON.stringify(dupes.slice(0, 4)));
  // "Type it exactly and it clears" is only unambiguous if no fragment
  // is a prefix of another; otherwise the shorter one would always fire
  // first and the longer one could never be targeted.
  const prefixPairs = [];
  for (const a of pool) for (const b of pool) if (a !== b && b.indexOf(a) === 0) prefixPairs.push([a, b]);
  chk(pool.length > 0 && prefixPairs.length === 0,
    "no fragment is a prefix of another, so exact-match clearing is unambiguous",
    JSON.stringify(prefixPairs.slice(0, 3)));
  const tooLong = pool.filter((f) => f.length > 20);
  chk(pool.length > 0 && tooLong.length === 0, "no fragment is longer than 20 characters", JSON.stringify(tooLong.slice(0, 3)));
  await p.close();
}

/* ─────────────────────────────────────────────────────────────
   3. Clearing scores an exact number and removes exactly one target.
   4. A leak costs one shield and the combo, and nothing else.
   5. Three leaks end the round and the run is persisted.
   All one round, because they are one round in real play.
   ───────────────────────────────────────────────────────────── */
console.log("\n## 3. Typing a fragment exactly scores it and removes it");
let deathHud = null, clearedInRound = 0;
{
  const p = await newPage();
  await freshGame(p);
  await p.click("#game-start");

  const gotTwo = await waitUntil(p, async () => (await liveFrags(p)).length >= 2, 6000, "two fragments on screen");
  chk(gotTwo, "the storm spawns more than one target");
  const beforeList = await liveFrags(p);
  chk(beforeList.length >= 2, "…confirmed: at least two live fragments before the first clear", JSON.stringify(beforeList));

  if (beforeList.length >= 2) {
    const f1 = beforeList[0];
    const others = beforeList.slice(1);
    const hud0 = await hudOf(p);
    await p.fill("#game-input", f1);
    await p.waitForTimeout(160);
    const hud1 = await hudOf(p);
    const after1 = await liveFrags(p);

    chk(hud1.score === hud0.score + expectedBase(f1),
      `first clear of ${JSON.stringify(f1)} scores its base exactly (${expectedBase(f1)} = 10x${puncts(f1)} punctuation + ${f1.length} chars)`,
      `score ${hud0.score} -> ${hud1.score}`);
    chk(hud1.cleared === hud0.cleared + 1, "…the cleared counter goes up by one", `${hud0.cleared} -> ${hud1.cleared}`);
    chk(hud1.combo === 1, "…and the combo opens at 1", `combo ${hud1.combo}`);
    chk(after1.indexOf(f1) === -1, "the typed fragment is gone from the stage", JSON.stringify(after1));
    chk(others.length > 0 && others.every((o) => after1.indexOf(o) !== -1),
      "…and no OTHER fragment was removed with it",
      `expected still present ${JSON.stringify(others)}, stage ${JSON.stringify(after1)}`);
    chk(await p.inputValue("#game-input") === "", "…and the input field emptied itself (no commit key needed)");

    // Second clear: the combo multiplier is +10%, so this one is NOT
    // just its base. A build that ignored the combo would score the
    // base and fail here while still passing the check above.
    const f2 = others[0];
    await p.fill("#game-input", f2);
    await p.waitForTimeout(160);
    const hud2 = await hudOf(p);
    const want2 = expectedScore(f2, 2);
    chk(hud2.score === hud1.score + want2,
      `second clear of ${JSON.stringify(f2)} scores base x1.1 (${expectedBase(f2)} -> ${want2})`,
      `score ${hud1.score} -> ${hud2.score}, wanted +${want2}`);
    chk(hud2.combo === 2, "…combo is 2", `combo ${hud2.combo}`);
    chk(want2 !== expectedBase(f2),
      "…(and the multiplier is observable at all: base and combo score differ for this fragment)",
      `base ${expectedBase(f2)} vs combo ${want2}`);
  }

  console.log("\n## 4. A leak costs one shield and the combo — and costs no points");
  /* From here on the test stops typing, so the ONLY thing that can move
     the score is a bug. Poll fast enough to catch the frame the first
     leak lands on. */
  let prev = await hudOf(p);
  let atLeak = null, before = prev, maxConcurrent = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 14000) {
    const h = await hudOf(p);
    const n = (await liveFrags(p)).length;
    if (n > maxConcurrent) maxConcurrent = n;
    if (h.shields < prev.shields && atLeak === null) { atLeak = h; before = prev; break; }
    prev = h;
    await p.waitForTimeout(70);
  }
  chk(!!atLeak, "a fragment reached the gutter within 14s of not typing");
  if (atLeak) {
    chk(before.shields === 3 && atLeak.shields === 2, "one leak costs exactly one shield (3 -> 2)", `${before.shields} -> ${atLeak.shields}`);
    chk(before.combo >= 1 && atLeak.combo === 0, "…and resets the combo to zero", `combo ${before.combo} -> ${atLeak.combo}`);
    chk(atLeak.score === before.score, "…and costs no points, which is what the page promises", `score ${before.score} -> ${atLeak.score}`);
    chk(atLeak.cleared === before.cleared, "…and does not count as a clear", `cleared ${before.cleared} -> ${atLeak.cleared}`);
  }
  chk(maxConcurrent >= 3, "several fragments are on screen at once — this is a storm, not a queue", `max concurrent ${maxConcurrent}`);

  console.log("\n## 5. Three leaks end the round, and the run is written to the profile");
  const lastHud = { v: null };
  await waitUntil(p, async () => {
    const h = await hudOf(p);
    if (h.shields > 0) lastHud.v = h;
    return h.shields === 0;
  }, 20000, "shields to reach zero");
  const endHud = await hudOf(p);
  deathHud = lastHud.v || endHud;
  clearedInRound = endHud.cleared;
  chk(endHud.shields === 0, "the round ends at zero shields", `shields ${endHud.shields}`);
  await p.waitForTimeout(400);
  chk(await p.locator("#game-start").isVisible(), "…the Start button comes back");
  chk((await p.locator("#game-start").textContent()).trim() === "Play again", "…relabelled Play again");
  chk(await p.locator("#game-pause").isHidden(), "…and Pause is hidden");
  chk(await p.locator("#storm-overlay").isVisible(), "…with a game-over overlay");
  const cleaned = await liveFrags(p);
  chk(cleaned.length === 0, "…and the stage is cleared of falling fragments", JSON.stringify(cleaned));

  const stored = await p.evaluate(async () => {
    const prof = await import("/assets/js/profiles.js");
    const gs = prof.getActive().gameStats || {};
    return (gs.byMode || {}).storm || null;
  });
  chk(!!stored, "profile.gameStats.byMode.storm exists after a round", JSON.stringify(stored));
  if (stored) {
    chk(stored.rounds === 1, "…rounds = 1", `got ${stored.rounds}`);
    chk(stored.highScore === endHud.score, "…highScore is the score actually reached", `stored ${stored.highScore} vs HUD ${endHud.score}`);
    chk(stored.totalCaught === endHud.cleared, "…totalCaught is the number actually cleared", `stored ${stored.totalCaught} vs HUD ${endHud.cleared}`);
    chk(stored.bestStreak >= 2, "…bestStreak recorded the combo that was built", `got ${stored.bestStreak}`);
    chk(typeof stored.lastPlayedAt === "string" && stored.lastPlayedAt.length > 10, "…lastPlayedAt is an ISO timestamp", String(stored.lastPlayedAt));
  }
  await p.close();
}

/* ─────────────────────────────────────────────────────────────
   6. THE STORM. Fragments must actually arrive faster over time.
   ───────────────────────────────────────────────────────────── */
console.log("\n## 6. The storm builds — spawn rate measured, not read off a label");
{
  const p = await newPage();
  await freshGame(p);
  /* Record every insertion of a live fragment node, timestamped from
     the click on Start. Reading the "Storm 1.60s" HUD readout instead
     would be reading a label: a build that printed a shrinking number
     and spawned at a fixed rate would pass. */
  await p.evaluate(() => {
    window.__spawns = [];
    const layer = document.getElementById("storm-layer");
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.getAttribute && n.getAttribute("data-frag")) {
            window.__spawns.push(performance.now() - window.__t0);
          }
        }
      }
    }).observe(layer, { childList: true });
  });
  await p.evaluate(() => {
    window.__t0 = performance.now();
    document.getElementById("game-start").click();
  });

  /* Survive for 22 seconds by clearing whatever is on screen. This
     writes input.value and fires the same `input` event a keystroke
     fires -- section 3 already proved that path via a real
     page.fill(). Doing 20 seconds of page.fill() round-trips would add
     seconds of latency into the very interval being measured. */
  let maxSeen = 0, endedEarly = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 22000) {
    const r = await p.evaluate(() => {
      const inp = document.getElementById("game-input");
      const frags = Array.prototype.map.call(
        document.querySelectorAll("#storm-layer [data-frag]"),
        (e) => e.getAttribute("data-frag"));
      for (const f of frags) {
        inp.value = f;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
      inp.value = "";
      return {
        n: frags.length,
        shields: Number(document.querySelector("[data-shields]").textContent),
      };
    });
    if (r.n > maxSeen) maxSeen = r.n;
    if (r.shields === 0) { endedEarly = true; break; }
    await p.waitForTimeout(110);
  }
  chk(!endedEarly, "the measured round survived the full 22 seconds", `shields ran out early: ${endedEarly}`);

  const spawns = await p.evaluate(() => window.__spawns.slice());
  const inWindow = (a, z) => spawns.filter((t) => t >= a && t < z).length;
  const early = inWindow(1000, 7000);
  const late = inWindow(15000, 21000);
  console.log(`     spawn times (ms): ${spawns.map((t) => Math.round(t)).join(", ")}`);

  // ANTI-VACUITY: "late > early" is satisfied by 0 and 3. Demand the
  // early window is genuinely a working storm first.
  chk(early >= 2, "the early window (1–7s) is a real sample, not an empty stage", `${early} spawns`);
  chk(late > early, "the late window (15–21s) has more spawns than the early one", `early ${early}, late ${late}`);
  chk(early >= 2 && late >= early + 3, "…and meaningfully more, not one extra", `early ${early}, late ${late}`);
  chk(early >= 2 && late >= Math.ceil(early * 1.5), "…at least 1.5x the early rate", `early ${early}, late ${late}`);
  /* A second, independent statistic on the same claim. The window
     counts above could in principle be satisfied by one late burst; the
     gap between consecutive spawns shrinking across the whole run
     cannot. maxSeen is only reported: this loop clears the stage every
     110ms on purpose, so it measures the test's own aggressiveness, not
     the game. The "several on screen at once" claim is checked in
     section 4, where nothing is being typed. */
  const gaps = spawns.slice(1).map((t, i) => t - spawns[i]);
  const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  const firstHalf = gaps.slice(0, Math.floor(gaps.length / 2));
  const secondHalf = gaps.slice(Math.floor(gaps.length / 2));
  const mFirst = Math.round(median(firstHalf)), mSecond = Math.round(median(secondHalf));
  chk(gaps.length >= 8 && mFirst > 0 && mSecond > 0 && mSecond < mFirst * 0.8,
    "the gap between consecutive spawns shrank across the run, not just in one burst",
    `median gap ${mFirst}ms -> ${mSecond}ms over ${gaps.length} gaps (max on screen while clearing: ${maxSeen})`);

  const intensity = await p.evaluate(() => document.querySelector("[data-intensity]").textContent);
  const asNum = parseFloat(intensity);
  chk(Number.isFinite(asNum) && asNum < 1.6, "the Storm readout also fell below its 1.60s opening value", intensity);
  await p.close();
}

/* ─────────────────────────────────────────────────────────────
   7. skipPunctuation must not silently gut the game.
   ───────────────────────────────────────────────────────────── */
console.log("\n## 7. The 'Skip punctuation' preference is overridden, out loud");
{
  const off = await newPage();
  await freshGame(off);
  chk(await off.locator("#storm-skip-notice").isHidden(),
    "with the preference off, no notice is shown");
  await off.close();

  const p = await newPage();
  await freshGame(p, "p.preferences = p.preferences || {}; p.preferences.skipPunctuation = true; return p;");
  const prefOn = await p.evaluate(async () => {
    const prof = await import("/assets/js/profiles.js");
    return !!(prof.getActive().preferences || {}).skipPunctuation;
  });
  chk(prefOn, "the preference really is set to true for this page load");
  chk(await p.locator("#storm-skip-notice").isVisible(),
    "…and the page tells the player it is being ignored here");
  const noticeText = (await p.locator("#storm-skip-notice").textContent()).replace(/\s+/g, " ");
  chk(/ignores it/i.test(noticeText) && /Skip punctuation/i.test(noticeText),
    "…in words, naming the setting", JSON.stringify(noticeText.slice(0, 110)));

  await p.click("#game-start");
  const ok = await waitUntil(p, async () => {
    const fs = await liveFrags(p);
    return fs.some((f) => f.replace(/[^A-Za-z0-9 ]/g, "").trim().length >= 2);
  }, 8000, "a fragment with strippable punctuation");
  chk(ok, "a fragment with both letters and punctuation is on screen");
  const fs = await liveFrags(p);
  const target = fs.find((f) => f.replace(/[^A-Za-z0-9 ]/g, "").trim().length >= 2);
  chk(!!target, "…picked one", JSON.stringify(target));
  if (target) {
    const stripped = target.replace(/[^A-Za-z0-9 ]/g, "");
    const h0 = await hudOf(p);
    await p.fill("#game-input", stripped);
    await p.waitForTimeout(180);
    const h1 = await hudOf(p);
    const still = await liveFrags(p);
    chk(still.indexOf(target) !== -1,
      `typing ${JSON.stringify(stripped)} — the fragment with its punctuation removed — does NOT clear ${JSON.stringify(target)}`,
      JSON.stringify(still));
    chk(h1.score === h0.score, "…and scores nothing", `score ${h0.score} -> ${h1.score}`);
    chk(h1.cleared === h0.cleared, "…and clears nothing", `cleared ${h0.cleared} -> ${h1.cleared}`);
    // …and the full fragment still works, so the game is not simply broken.
    await p.fill("#game-input", target);
    await p.waitForTimeout(180);
    const h2 = await hudOf(p);
    const after = await liveFrags(p);
    chk(after.indexOf(target) === -1, "typing it in full, punctuation included, DOES clear it", JSON.stringify(after));
    chk(h2.score === h0.score + expectedBase(target), "…for its full base score", `score ${h0.score} -> ${h2.score}, wanted +${expectedBase(target)}`);
  }
  await p.close();
}

/* ─────────────────────────────────────────────────────────────
   8. Prefix lock, and colour that follows the theme.
   ───────────────────────────────────────────────────────────── */
console.log("\n## 8. Prefix lock, and colours that come from theme tokens");
{
  const p = await newPage();
  await freshGame(p);
  await p.click("#game-start");
  const ready = await waitUntil(p, async () => (await liveFrags(p)).length >= 2, 8000, "two fragments");
  chk(ready, "two fragments on screen for the lock check");
  const fs = await liveFrags(p);
  chk(fs.length >= 2, "…confirmed", JSON.stringify(fs));
  if (fs.length >= 2) {
    const target = fs[0];
    const prefix = target.slice(0, 2);
    await p.fill("#game-input", prefix);
    await p.waitForTimeout(140);
    const locks = await p.$$eval("#storm-layer [data-frag]", (els) =>
      els.map((e) => ({ f: e.getAttribute("data-frag"), locked: e.getAttribute("data-locked") === "true" })));
    const me = locks.find((l) => l.f === target);
    chk(!!me && me.locked, `typing the prefix ${JSON.stringify(prefix)} locks ${JSON.stringify(target)}`, JSON.stringify(locks));
    const wrong = locks.filter((l) => l.locked && l.f.indexOf(prefix) !== 0);
    chk(locks.length > 0 && wrong.length === 0, "…and locks nothing that does not start with it", JSON.stringify(wrong));
    chk(await p.locator("#game-input").getAttribute("data-bad") === null, "…and the field is not flagged bad");

    // Nothing in the pool starts with "zzz".
    await p.fill("#game-input", "zzz");
    await p.waitForTimeout(140);
    chk(await p.locator("#game-input").getAttribute("data-bad") === "true",
      "typing something no fragment starts with flags the field");
    const anyLocked = await p.$$eval("#storm-layer [data-frag][data-locked='true']", (e) => e.length);
    chk(anyLocked === 0, "…and locks nothing", `${anyLocked} locked`);

    // Colour. Sampled on a locked node vs an unlocked one: --accent vs
    // --fg-0. Then the same node across three themes.
    await p.fill("#game-input", prefix);
    await p.waitForTimeout(140);
    const fills = await p.evaluate(() => {
      const lock = document.querySelector("#storm-layer [data-frag][data-locked='true']");
      const free = document.querySelector("#storm-layer [data-frag]:not([data-locked='true'])");
      return {
        locked: lock ? getComputedStyle(lock).fill : null,
        free: free ? getComputedStyle(free).fill : null,
      };
    });
    chk(!!fills.locked && !!fills.free && fills.locked !== fills.free,
      "a locked fragment is painted a different colour from an unlocked one", JSON.stringify(fills));
  }
  await p.close();

  /* The stage must repaint under every theme. A hard-coded hex would
     survive a theme switch and produce identical values here. Sampled
     on the pre-round demo fragments so no round has to be kept alive. */
  const t = await newPage();
  const seen = {};
  for (const theme of ["dark", "light", "dracula"]) {
    await t.goto(URL_GAME, { waitUntil: "domcontentloaded" });
    await t.evaluate((th) => localStorage.setItem("tt:theme", th), theme);
    await t.reload({ waitUntil: "domcontentloaded" });
    await t.waitForTimeout(600);
    const s = await t.evaluate(() => {
      const frag = document.querySelector("#storm-layer .storm-frag");
      const line = document.querySelector(".storm-gutter-line");
      return {
        frag: frag ? getComputedStyle(frag).fill : null,
        gutter: line ? getComputedStyle(line).stroke : null,
      };
    });
    chk(!!s.frag && !!s.gutter, `${theme}: the stage paints a fragment and a gutter line`, JSON.stringify(s));
    seen[theme] = s;
  }
  const keys = Object.keys(seen);
  chk(keys.length === 3 && seen.dark.frag && seen.light.frag && seen.dark.frag !== seen.light.frag,
    "fragment text is a theme token — dark and light paint it differently",
    JSON.stringify({ dark: seen.dark.frag, light: seen.light.frag }));
  chk(keys.length === 3 && seen.dark.gutter && seen.dracula.gutter && seen.dark.gutter !== seen.dracula.gutter,
    "the gutter line is a theme token — dark and dracula differ",
    JSON.stringify({ dark: seen.dark.gutter, dracula: seen.dracula.gutter }));
  await t.close();
}

/* ─────────────────────────────────────────────────────────────
   9. It is reachable. Every other game is linked from two places.
   ───────────────────────────────────────────────────────────── */
console.log("\n## 9. Linked from the games hub and the megamenu");
{
  const p = await newPage();
  await p.goto(B + "/games/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(500);
  const card = await p.evaluate(() => {
    const el = document.querySelector('.game-card[data-game-slug="storm"]');
    if (!el) return null;
    const a = el.querySelector("a.btn");
    return {
      title: (el.querySelector(".game-card__title") || {}).textContent,
      href: a ? a.getAttribute("href") : null,
      bestKey: (el.querySelector("[data-game-best]") || {}).dataset ? el.querySelector("[data-game-best]").dataset.gameBest : null,
    };
  });
  chk(!!card, "the /games/ hub has a Punctuation Storm card", JSON.stringify(card));
  if (card) {
    chk(card.title.trim() === "Punctuation Storm", "…titled correctly", JSON.stringify(card.title));
    chk(card.href === "/practice/storm/", "…linking to /practice/storm/", JSON.stringify(card.href));
    chk(card.bestKey === "storm", "…and wired to the 'storm' best-score key", JSON.stringify(card.bestKey));
  }
  const body = await p.evaluate(() => document.body.innerText);
  chk(!/Sixteen (typing games|modes)/.test(body), "the hub's game count was updated, not left at sixteen");

  // The best-score chip has to actually read byMode.storm.
  await p.evaluate(async () => {
    const prof = await import("/assets/js/profiles.js");
    prof.updateActive((x) => {
      x.gameStats = x.gameStats || {};
      x.gameStats.byMode = Object.assign({}, x.gameStats.byMode, { storm: { highScore: 4321, bestStreak: 7 } });
      return x;
    });
  });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(500);
  const chip = await p.evaluate(() => {
    const el = document.querySelector('.game-card[data-game-slug="storm"] [data-game-best]');
    if (!el) return null;
    return { hidden: el.hidden, score: (el.querySelector("[data-game-best-score]") || {}).textContent };
  });
  chk(!!chip && chip.hidden === false && String(chip.score).replace(/,/g, "") === "4321",
    "a stored storm high score shows on the hub card", JSON.stringify(chip));

  const inMenu = await p.evaluate(() =>
    Array.prototype.filter.call(document.querySelectorAll('a[href="/practice/storm/"]'),
      (a) => !a.closest(".game-card")).length);
  chk(inMenu >= 1, "the megamenu links /practice/storm/ outside the hub cards", `${inMenu} link(s)`);

  await p.goto(B + "/roadmap/", { waitUntil: "domcontentloaded" });
  const road = await p.evaluate(() => {
    const heads = Array.prototype.slice.call(document.querySelectorAll("h2"));
    const out = {};
    for (const h of heads) {
      let n = h.nextElementSibling, txt = "";
      while (n && n.tagName !== "H2") { txt += " " + n.innerText; n = n.nextElementSibling; }
      out[h.id] = txt;
    }
    return out;
  });
  chk(/Punctuation Storm/.test(road["recently-shipped"] || ""), "the roadmap moved it to Recently shipped");
  chk(!/Punctuation Storm/.test(road["in-flight"] || ""), "…and it no longer sits in In flight");
  await p.close();
}

console.log("\n## 10. No page errors anywhere in this run");
chk(pageErrors.length === 0, "no uncaught errors or console errors", JSON.stringify(pageErrors.slice(0, 3)));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
