#!/usr/bin/env node
/* Power-ups in Catch the Word: do the two effects actually happen?
 *
 * A power-up is a bonus word -- a marked target that grants an effect
 * when it is typed correctly. There are two, both named on the roadmap:
 * time-freeze and screen-clear.
 *
 * WHAT THIS GATE REFUSES TO DO
 * It does not check that a CSS class turned up in the DOM, and it does
 * not check that a capsule rendered. Either would pass against a
 * decorative marker that grants nothing. Instead it reads the game's
 * own state through window.__ttGame.snapshot() and asserts:
 *
 *   freeze  -- the game clock STOPS. gameMs does not advance, every
 *              target's coordinates are unchanged, and nothing new
 *              spawns, for the stated duration and no longer.
 *   clear   -- the targets are GONE, by id, and the score moved by
 *              exactly the payout the design specifies, while `caught`
 *              moved by exactly one (the bonus word you typed).
 *   lost    -- a power-up that falls off the stage grants nothing and
 *              costs nothing: it must not tick the miss counter.
 *
 * VACUITY
 * `[].every(f => ...)` is true. Every .every() below is preceded by an
 * explicit length assertion, and the arrays it runs over are built from
 * live game state rather than from anything this file controls.
 *
 * THE CSS TRAP
 * A CSS property beats an SVG presentation attribute. game-boot.js sets
 * the capsule colour as an attribute; if any stylesheet rule ever sets
 * `fill` on .fall__power-capsule it wins silently and every theme goes
 * the same colour. Section 5 reads the COMPUTED fill, compares it to
 * the resolved theme token, and sweeps every bundled theme -- a
 * hard-coded hex cannot survive that, and neither can a CSS override.
 *
 * Usage:
 *   npm run build
 *   npx serve _site -l 8822 --no-clipboard &
 *   BASE_URL=http://localhost:8822 node scripts/check-game-powerups.mjs
 */
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:8765";

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
  ok ? pass++ : fail++;
};
process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err?.message ?? err}`);
  console.log("\nRUN ABORTED — counts below are partial.");
  process.exit(1);
});

/* ── colour helpers (contrast is computed here, not asserted by eye) ── */
const parseRgb = (s) => {
  const m = String(s).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = String(s).trim();
  if (/^#[0-9a-f]{6}$/i.test(h)) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  if (/^#[0-9a-f]{3}$/i.test(h)) {
    return [h[1], h[2], h[3]].map((c) => parseInt(c + c, 16));
  }
  return null;
};
const lum = (rgb) => {
  const s = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const contrast = (a, b) => {
  const ra = parseRgb(a), rb = parseRgb(b);
  if (!ra || !rb) return 0;
  const la = lum(ra), lb = lum(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const sameColour = (a, b) => {
  const ra = parseRgb(a), rb = parseRgb(b);
  return !!ra && !!rb && ra[0] === rb[0] && ra[1] === rb[1] && ra[2] === rb[2];
};

/* The streak -> multiplier table, restated independently of the game.
   Deliberate duplication: the score arithmetic below has to be checked
   against something that is not the code under test. If multiplierFor()
   in game-boot.js changes, this gate goes red and someone has to decide
   which one is right. */
const multFor = (streak) =>
  streak >= 40 ? 5 : streak >= 20 ? 3 : streak >= 10 ? 2 : streak >= 5 ? 1.5 : 1;
const catchValue = (word, streakBefore) =>
  Math.round((10 + word.length * 2) * multFor(streakBefore));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console: " + m.text().slice(0, 200)); });

const snap = () => page.evaluate(() => window.__ttGame.snapshot());

async function openGame(mode, speed) {
  await page.goto(`${B}/practice/game/?mode=${mode}&speed=${speed}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__ttGame, null, { timeout: 30000 });
  await page.click("#game-start");
  await page.waitForFunction(() => window.__ttGame.snapshot().running, null, { timeout: 15000 });
}

/* Play the game for real: type whatever ordinary target is on stage,
   never the bonus. Returns the snapshot at which `done` first held, or
   null on timeout.

   `shouldType` exists because several assertions need OTHER targets on
   the stage next to the bonus -- "nothing moved" says nothing if there
   is nothing to move. A caller can stop catching once a bonus appears
   and let the stage fill up, which is also how a person plays it: you
   let the screen get busy before you spend a screen-clear. */
async function playUntil(done, timeoutMs = 60000, shouldType = () => true) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const s = await snap();
    if (done(s)) return s;
    if (shouldType(s)) {
      await page.evaluate(() => {
        const st = window.__ttGame.snapshot();
        const t = st.falling.find((f) => !f.power && f.y > 2 && f.y < 400);
        if (!t) return;
        const i = document.getElementById("game-input");
        i.value = t.word;
        i.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await page.waitForTimeout(60);
  }
  return null;
}

// Once a bonus is on the stage, stop catching: let the ordinary targets
// pile up so the effects have something to act on.
const holdWhenBonusIsUp = (s) => !s.falling.some((f) => f.power);

const cfg = await (async () => {
  await page.goto(`${B}/practice/game/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__ttGame, null, { timeout: 30000 });
  return page.evaluate(() => window.__ttGame.power);
})();

/* Every bundled theme, read off the live settings page rather than
   pasted here, so a theme added later is covered automatically. */
const themes = await (async () => {
  await page.goto(`${B}/settings/`, { waitUntil: "domcontentloaded" });
  const opts = await page.$$eval("#pref-themePreset option", (els) => els.map((e) => e.value));
  // "" is the preset-less default; the light/dark pair lives on its own
  // toggle, so both are named explicitly. null = no data-theme at all,
  // which is the :root (dark) palette.
  return [null, "dark", "light", ...opts.filter(Boolean)];
})();

// Errors from /settings/ (visited only to read the theme list) are not
// this gate's business; section 7 is about the game page.
pageErrors.length = 0;

console.log(`\n# Power-ups — ${B}`);
console.log(`  config: ${JSON.stringify(cfg)}`);

/* ─────────────────────────────────────────────────────────────────────
   1. The mechanic exists at all, and only where it is supposed to
   ───────────────────────────────────────────────────────────────── */
console.log("\n## 1. The mechanic exists, and is scoped to the modes that can carry it");

chk(cfg.CYCLE.length === 2 && cfg.CYCLE.includes("freeze") && cfg.CYCLE.includes("clear"),
  "both roadmap power-ups are implemented (time-freeze, screen-clear)", JSON.stringify(cfg.CYCLE));
chk(cfg.MODES.length >= 4, "power-ups reach four or more modes", `got ${cfg.MODES.length}`);
chk(!cfg.MODES.includes("bomb") && !cfg.MODES.includes("stroop"),
  "single-target modes (bomb, stroop) are excluded, not given a thin version");
chk(/^[\x20-\x7e]+$/.test(cfg.WORDS.freeze) && /^[\x20-\x7e]+$/.test(cfg.WORDS.clear)
  && cfg.WORDS.freeze === cfg.WORDS.freeze.toLowerCase()
  && cfg.WORDS.clear === cfg.WORDS.clear.toLowerCase(),
  "the bonus words are plain lowercase ASCII (site rule: typeable content is ASCII)",
  JSON.stringify(cfg.WORDS));

/* ─────────────────────────────────────────────────────────────────────
   2. TIME-FREEZE — the clock actually stops
   ───────────────────────────────────────────────────────────────── */
console.log("\n## 2. Time-freeze — the game clock stops, for the stated duration");

await openGame("endless", "0.6");

// Play until a freeze bonus is on stage AND there are ordinary targets
// beside it, because "nothing moved" is only meaningful with something
// on the stage that could have moved.
let s = await playUntil(
  (x) => x.falling.some((f) => f.power === "freeze") && x.falling.length >= 3,
  90000, holdWhenBonusIsUp);
chk(!!s, "a freeze bonus word spawns during normal play");
if (!s) { await finish(); }

const beforeFreeze = s;
chk(beforeFreeze.frozen === false, "the stage is not frozen before the bonus is typed");

// Read state and type the bonus inside ONE evaluate. JS is single
// threaded, so no animation frame can slip between the two reads and
// change the target set underneath the arithmetic.
const fz = await page.evaluate((word) => {
  const before = window.__ttGame.snapshot();
  const t0 = performance.now();
  const i = document.getElementById("game-input");
  i.value = word;
  i.dispatchEvent(new Event("input", { bubbles: true }));
  return { before, after: window.__ttGame.snapshot(), t0 };
}, cfg.WORDS.freeze);

chk(fz.after.frozen === true, "typing the freeze bonus freezes the stage");
chk(Math.abs(fz.after.freezeMsLeft - cfg.FREEZE_MS) < 1,
  `the freeze is armed for the stated ${cfg.FREEZE_MS} ms`, `got ${fz.after.freezeMsLeft}`);

const t0Wall = Date.now();
const frozenA = await snap();
await page.waitForTimeout(2000);
const frozenB = await snap();

chk(frozenB.frozen === true, "still frozen two seconds later");
chk(frozenA.gameMs === frozenB.gameMs,
  "THE CLOCK STOPPED — gameMs did not advance across two seconds of wall time",
  `${frozenA.gameMs} -> ${frozenB.gameMs}`);
chk(frozenA.falling.length >= 1 && frozenB.falling.length >= 1,
  "there were targets on the stage to hold still", `${frozenA.falling.length} / ${frozenB.falling.length}`);
{
  const byId = new Map(frozenB.falling.map((f) => [f.id, f]));
  const pairs = frozenA.falling.filter((f) => byId.has(f.id));
  // Length-guarded: [].every() is true, so an empty pair list must fail
  // here rather than sail through the assertion below.
  chk(pairs.length >= 1, "the same targets are still on stage after two frozen seconds",
    `matched ${pairs.length} of ${frozenA.falling.length}`);
  chk(pairs.length >= 1 && pairs.every((f) => {
    const b = byId.get(f.id);
    return b.x === f.x && b.y === f.y;
  }), "NOTHING MOVED — every held target has identical coordinates",
    JSON.stringify(pairs.slice(0, 3).map((f) => [f.word, f.x, f.y])));
}
chk(frozenB.falling.length === frozenA.falling.length,
  "nothing spawned into the frozen stage", `${frozenA.falling.length} -> ${frozenB.falling.length}`);
chk(frozenB.freezeMsLeft < frozenA.freezeMsLeft - 1500,
  "the freeze itself is burning real time, so it will end",
  `${Math.round(frozenA.freezeMsLeft)} -> ${Math.round(frozenB.freezeMsLeft)}`);

// … and it ends when it said it would.
await page.waitForFunction(() => !window.__ttGame.snapshot().frozen, null, { timeout: 15000 })
  .catch(() => {});
const thawedAt = Date.now() - t0Wall;
const thawed = await snap();
chk(thawed.frozen === false, "the freeze ends by itself");
chk(thawedAt > cfg.FREEZE_MS * 0.85 && thawedAt < cfg.FREEZE_MS * 1.6,
  `…after roughly the stated ${cfg.FREEZE_MS} ms, not indefinitely`, `${thawedAt} ms`);

await page.waitForTimeout(600);
const running = await snap();
chk(running.gameMs > thawed.gameMs,
  "the clock restarts after the thaw", `${Math.round(thawed.gameMs)} -> ${Math.round(running.gameMs)}`);
{
  const byId = new Map(running.falling.map((f) => [f.id, f]));
  const pairs = thawed.falling.filter((f) => byId.has(f.id));
  chk(pairs.length >= 1, "a target survived the thaw to be measured", `${pairs.length}`);
  chk(pairs.length >= 1 && pairs.some((f) => byId.get(f.id).y !== f.y || byId.get(f.id).x !== f.x),
    "targets move again once the freeze is over");
}

/* ─────────────────────────────────────────────────────────────────────
   3. SCREEN-CLEAR — the targets are gone, and paid for
   ───────────────────────────────────────────────────────────────── */
console.log("\n## 3. Screen-clear — the stage is emptied and scored");

s = await playUntil(
  (x) => x.falling.some((f) => f.power === "clear") && x.falling.length >= 3,
  90000, holdWhenBonusIsUp);
chk(!!s, "a screen-clear bonus word spawns during normal play");
if (!s) { await finish(); }

const sc = await page.evaluate((word) => {
  const before = window.__ttGame.snapshot();
  const i = document.getElementById("game-input");
  i.value = word;
  i.dispatchEvent(new Event("input", { bubbles: true }));
  return { before, after: window.__ttGame.snapshot() };
}, cfg.WORDS.clear);

const victims = sc.before.falling.filter((f) => !f.power);
chk(victims.length >= 2, "there were at least two ordinary targets on stage to clear",
  JSON.stringify(victims.map((v) => v.word)));

const survivingIds = new Set(sc.after.falling.map((f) => f.id));
chk(victims.length >= 2 && victims.every((v) => !survivingIds.has(v.id)),
  "THE TARGETS ARE GONE — every ordinary target that was on stage was removed, by id",
  `${sc.before.falling.length} -> ${sc.after.falling.length}`);
chk(sc.after.falling.filter((f) => !f.power).length === 0,
  "no ordinary target survives the clear", JSON.stringify(sc.after.falling.map((f) => f.word)));

const expectedClearPay = victims.reduce(
  (n, v) => n + Math.round((10 + v.word.length * 2) * cfg.CLEAR_PAYOUT), 0);
const expectedBonusCatch = catchValue(cfg.WORDS.clear, sc.before.streak);
const scoreDelta = sc.after.score - sc.before.score;
chk(expectedClearPay > 0, "the cleared words are worth something", `${expectedClearPay}`);
chk(scoreDelta === expectedBonusCatch + expectedClearPay,
  `SCORED PER DESIGN — delta is the bonus catch (${expectedBonusCatch}) plus ${cfg.CLEAR_PAYOUT * 100}% of each cleared word (${expectedClearPay})`,
  `got ${scoreDelta}, expected ${expectedBonusCatch + expectedClearPay}`);
chk(scoreDelta > expectedBonusCatch,
  "the clear paid out something over and above simply typing the word",
  `${scoreDelta} > ${expectedBonusCatch}`);
chk(sc.after.caught - sc.before.caught === 1,
  "`caught` counts the one word you typed, not the words the clear destroyed",
  `+${sc.after.caught - sc.before.caught}`);
chk(sc.after.streak - sc.before.streak === 1,
  "…and the streak likewise moves by one", `+${sc.after.streak - sc.before.streak}`);
chk(sc.after.missed === sc.before.missed,
  "clearing a word is not the same as missing it", `${sc.before.missed} -> ${sc.after.missed}`);

/* ─────────────────────────────────────────────────────────────────────
   4. A LOST POWER-UP GRANTS NOTHING — and costs nothing
   ───────────────────────────────────────────────────────────────── */
console.log("\n## 4. A power-up you do not type grants nothing, and is not a miss");

await openGame("endless", "2.4");

// An in-page watcher plays the ordinary targets and books what leaves
// the stage. Anything that vanishes without the watcher typing it is a
// natural loss. That distinction is the whole assertion: ordinary
// losses tick `missed`, a lost bonus must not.
await page.evaluate(() => {
  const st = { known: new Map(), lost: [], caught: [], start: null, done: false };
  window.__pw = st;
  st.start = window.__ttGame.snapshot();
  st.timer = setInterval(() => {
    if (st.done) return;
    const s0 = window.__ttGame.snapshot();
    const live = new Set(s0.falling.map((f) => f.id));
    for (const [id, meta] of Array.from(st.known)) {
      if (!live.has(id)) { st.lost.push(meta); st.known.delete(id); }
    }
    for (const f of s0.falling) {
      if (!st.known.has(f.id)) st.known.set(f.id, { id: f.id, word: f.word, power: f.power });
    }
    const t = s0.falling.find((f) => !f.power && f.y > 2 && f.y < 400);
    if (t) {
      const i = document.getElementById("game-input");
      i.value = t.word;
      i.dispatchEvent(new Event("input", { bubbles: true }));
      const s1 = window.__ttGame.snapshot();
      const live1 = new Set(s1.falling.map((f) => f.id));
      for (const [id, meta] of Array.from(st.known)) {
        if (!live1.has(id)) { st.caught.push(meta); st.known.delete(id); }
      }
    }
    // Stop once a bonus has come and gone untyped.
    if (st.lost.some((l) => l.power)) {
      st.done = true;
      st.end = window.__ttGame.snapshot();
      clearInterval(st.timer);
    }
  }, 40);
});

await page.waitForFunction(() => window.__pw.done, null, { timeout: 120000 }).catch(() => {});
const watch = await page.evaluate(() => ({
  lost: window.__pw.lost, caught: window.__pw.caught,
  start: window.__pw.start, end: window.__pw.end || window.__ttGame.snapshot(),
  done: window.__pw.done,
}));

const lostPowers = watch.lost.filter((l) => l.power);
const lostPlain = watch.lost.filter((l) => !l.power);
chk(watch.done && lostPowers.length >= 1,
  "a bonus word fell off the stage without being typed",
  JSON.stringify(lostPowers.map((l) => l.word)));
chk(watch.end.frozen === false,
  "a bonus that was never typed granted no freeze");
chk(watch.end.missed - watch.start.missed === lostPlain.length,
  "IT COST NOTHING — the miss counter moved by exactly the ordinary words that were lost, so the bonus contributed zero",
  `missed +${watch.end.missed - watch.start.missed}, ordinary losses ${lostPlain.length}, bonus losses ${lostPowers.length}`);
chk(lostPlain.length > 0 || watch.end.streak >= watch.start.streak,
  "…and with nothing else lost, the streak survived the bonus falling",
  `streak ${watch.start.streak} -> ${watch.end.streak}, ordinary losses ${lostPlain.length}`);

/* ─────────────────────────────────────────────────────────────────────
   5. LEGIBILITY — theme tokens, not a hex, and not overridden by CSS
   ───────────────────────────────────────────────────────────────── */
console.log("\n## 5. Legibility across every bundled theme");

chk(themes.length >= 8, "the theme list was read off the settings page", `${themes.length} themes`);

async function sweepThemes(label, token) {
  const rows = [];
  for (const t of themes) {
    const r = await page.evaluate(([theme, tok]) => {
      const html = document.documentElement;
      if (theme === null) html.removeAttribute("data-theme");
      else html.setAttribute("data-theme", theme);
      const g = document.querySelector("#game-svg g.fall--power");
      if (!g) return null;
      const cap = g.querySelector("rect.fall__power-capsule");
      const ring = g.querySelector("rect.fall__power-ring");
      const ch = g.querySelector("tspan.fall__char");
      if (!cap || !ch || !ring) return null;
      const rootCS = getComputedStyle(html);
      return {
        capsule: getComputedStyle(cap).fill,
        ink: getComputedStyle(ch).fill,
        ring: getComputedStyle(ring).stroke,
        tokenValue: rootCS.getPropertyValue(tok).trim(),
        bg1: rootCS.getPropertyValue("--bg-1").trim(),
        fg0: rootCS.getPropertyValue("--fg-0").trim(),
      };
    }, [t, token]);
    if (r) rows.push({ theme: t === null ? "(default)" : t, ...r });
  }
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));

  chk(rows.length === themes.length, `${label}: sampled the capsule in every theme`,
    `${rows.length}/${themes.length}`);
  if (!rows.length) return;

  // A hard-coded hex cannot change with the theme. If it did not change,
  // the colour is not coming from the variable contract.
  const distinct = new Set(rows.map((r) => r.capsule));
  chk(distinct.size >= 3,
    `${label}: the capsule colour tracks the theme (so it is not a hard-coded hex)`,
    `${distinct.size} distinct values across ${rows.length} themes`);

  // The CSS trap: a property would beat the attribute silently.
  const tokenMatches = rows.filter((r) => r.tokenValue && sameColour(r.capsule, r.tokenValue));
  chk(rows.length >= 1 && tokenMatches.length === rows.length,
    `${label}: computed fill equals the resolved ${token} in every theme (no CSS rule is overriding the attribute)`,
    `${tokenMatches.length}/${rows.length}`);

  const inkFloor = 4.0, stageFloor = 3.0;
  const inkFails = rows.filter((r) => contrast(r.capsule, r.ink) < inkFloor);
  chk(rows.length >= 1 && inkFails.length === 0,
    `${label}: the word reads against its capsule everywhere (>= ${inkFloor}:1)`,
    inkFails.length
      ? inkFails.map((r) => `${r.theme} ${contrast(r.capsule, r.ink).toFixed(2)}`).join(", ")
      : `worst ${Math.min(...rows.map((r) => contrast(r.capsule, r.ink))).toFixed(2)}`);
  const stageFails = rows.filter((r) => contrast(r.capsule, r.bg1) < stageFloor);
  chk(rows.length >= 1 && stageFails.length === 0,
    `${label}: the capsule reads against the stage everywhere (>= ${stageFloor}:1)`,
    stageFails.length
      ? stageFails.map((r) => `${r.theme} ${contrast(r.capsule, r.bg1).toFixed(2)}`).join(", ")
      : `worst ${Math.min(...rows.map((r) => contrast(r.capsule, r.bg1))).toFixed(2)}`);
  const ringFails = rows.filter((r) => !sameColour(r.ring, r.fg0));
  chk(rows.length >= 1 && ringFails.length === 0,
    `${label}: the ring outline follows --fg-0 in every theme`,
    ringFails.length ? ringFails.map((r) => `${r.theme} ${r.ring}`).join(", ") : "");
}

for (const kind of cfg.CYCLE) {
  await openGame("endless", "0.6");
  const got = await playUntil((x) => x.falling.some((f) => f.power === kind), 90000, holdWhenBonusIsUp);
  chk(!!got, `a ${kind} bonus reached the stage for the theme sweep`);
  if (!got) continue;
  // Pause holds the stage exactly where it is, so the same element can
  // be sampled under every theme without racing the fall.
  await page.click("#game-pause");
  await sweepThemes(kind, cfg.TOKENS[kind]);
}

/* ─────────────────────────────────────────────────────────────────────
   6. EXCLUDED MODES really are excluded
   ───────────────────────────────────────────────────────────────── */
console.log("\n## 6. Single-target modes never spawn a bonus");

for (const mode of ["bomb", "stroop"]) {
  await openGame(mode, "1.0");
  let sawPower = false;
  const target = cfg.EVERY_CATCHES + 3;
  const done = await playUntil((x) => {
    if (x.falling.some((f) => f.power)) sawPower = true;
    return x.caught >= target || sawPower;
  }, 90000);
  chk(!!done && done.caught >= target,
    `${mode}: played past ${target} catches, well past the ${cfg.EVERY_CATCHES}-catch cadence`,
    done ? `caught ${done.caught}` : "timed out");
  chk(!sawPower && !!done && done.powerSpawnCount === 0,
    `${mode}: no bonus word ever spawned`, done ? `powerSpawnCount ${done.powerSpawnCount}` : "");
}

/* ───────────────────────────────────────────────────────────────── */
console.log("\n## 7. No page errors");
chk(pageErrors.length === 0, "the game page logged no errors", pageErrors.slice(0, 3).join(" | "));

await finish();

async function finish() {
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
