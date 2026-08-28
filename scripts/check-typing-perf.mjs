/* Typing-surface performance + correctness guard.

   Two things are checked, both in a real browser:

   1. CORRECTNESS — after typing N chars the caret must sit on the char
      the engine thinks is current. This is ground truth measured live
      via getBoundingClientRect, so it catches the position cache in
      renderer.js drifting out of sync with the real layout.

   2. LATENCY — how long the keydown handler blocks for. The renderer
      used to call getBoundingClientRect two or three times per press
      right after mutating classes, forcing a synchronous layout on
      every keystroke. Handler time is where that cost landed, so it is
      the number that must not regress.

   Usage:  node scripts/check-typing-perf.mjs
           BASE_URL=http://localhost:8765 node scripts/check-typing-perf.mjs
*/
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:8765";

// p99 budget for the keydown handler, in ms. One 120Hz frame is 8.3ms
// and the handler is only part of a frame's work, so 4ms is a deliberately
// tight ceiling that still leaves headroom on slow CI hardware.
const P99_BUDGET_MS = Number(process.env.TYPING_P99_BUDGET || 4);

const CASES = [
  { name: "time  (scrolling branch)", url: "/practice/?mode=time&duration=60", type: 90 },
  { name: "words (scrolling branch)", url: "/practice/?mode=words&count=50",   type: 60 },
  { name: "quote (full branch)",      url: "/practice/?mode=quote",            type: 70 },
  { name: "tape  (tape branch)",      url: "/practice/?mode=tape",             type: 50 },
  { name: "zen   (appendText path)",  url: "/practice/?mode=zen",              type: 120 },
];

// The long-passage case is the real regression guard: the old code's cost
// grew with passage length, so a short test would hide a reintroduced bug.
const LONG_CASE = { name: "long passage (500+ chars)", url: "/practice/?mode=words&count=100", type: 300 };

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function runCase(browser, c, { measureLatency = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  try {
    await page.goto(BASE + c.url, { waitUntil: "networkidle" });
    await page.waitForSelector(".tt-char", { timeout: 10000 });
    await page.click(".tt-stage").catch(() => {});
    await page.waitForTimeout(300);

    if (measureLatency) {
      await page.evaluate(() => {
        window.__hs = [];
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            if (e.name === "keydown") window.__hs.push(e.processingEnd - e.processingStart);
          }
        }).observe({ type: "event", durationThreshold: 0, buffered: true });
      });
    }

    const target = await page.$$eval(".tt-char", els =>
      els.slice(0, 600).map(e => e.classList.contains("tt-char--space") ? " " : e.textContent).join(""));
    for (const ch of target.slice(0, c.type)) {
      await page.keyboard.type(ch, { delay: 6 });
    }
    await page.waitForTimeout(400); // let tape interpolation settle

    const r = await page.evaluate(() => {
      const caret = document.querySelector(".tt-caret");
      const cont  = document.querySelector(".tt-text");
      const chars = [...document.querySelectorAll(".tt-char")].filter(e => !e.classList.contains("tt-char--extra"));
      let i = chars.findIndex(e => !e.classList.contains("tt-char--correct") && !e.classList.contains("tt-char--incorrect"));
      if (i < 0) i = chars.length - 1;
      const cr = cont.getBoundingClientRect();
      const ch = chars[i].getBoundingClientRect();
      const ca = caret.getBoundingClientRect();
      return {
        caretX: ca.left - cr.left, charX: ch.left - cr.left,
        caretY: ca.top - cr.top,   charY: ch.top - cr.top,
        tape: cont.classList.contains("tt-text--tape"), idx: i,
        hs: window.__hs || [],
      };
    });
    return { ...r, errors };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch();
let pass = 0, fail = 0;

console.log("correctness — caret vs live glyph position");
for (const c of CASES) {
  try {
    const r = await runCase(browser, c);
    const dx = Math.abs(r.caretX - r.charX);
    const dy = r.caretY - r.charY;
    // Caret is a thin bar at the char's leading edge. 3px covers sub-pixel
    // rounding; Y allows for the caret variants' own em nudges. Tape drives
    // Y through its own interpolator, so only X is meaningful there.
    const ok = dx < 3 && (r.tape || Math.abs(dy) < 12) && r.errors.length === 0;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name}  dx=${dx.toFixed(2)}px dy=${dy.toFixed(2)}px${r.errors.length ? "  errors=" + r.errors.join(" | ") : ""}`);
    ok ? pass++ : fail++;
  } catch (e) {
    console.log(`  FAIL  ${c.name}  ${e.message.split("\n")[0]}`);
    fail++;
  }
}

console.log("\nlayout reads during typing — the invariant that matters");
/* A wall-clock budget is a weak guard: on fast desktop hardware the old
   getBoundingClientRect-per-keystroke code passes it too. The real
   invariant is structural — a keystroke must not read layout at all.

   The renderer mutates classes/textContent immediately before placing the
   caret, so any rect read in that path forces a synchronous layout. We
   instrument getBoundingClientRect, type N chars, and require the call
   count to stay flat rather than scale with keystrokes. Measurement reads
   (setText, appendText, resize, font swap) are expected and bounded. */
for (const c of [CASES[0], LONG_CASE]) {
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(BASE + c.url, { waitUntil: "networkidle" });
    await page.waitForSelector(".tt-char", { timeout: 10000 });
    await page.click(".tt-stage").catch(() => {});
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      window.__gbcr = 0;
      const orig = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        window.__gbcr++;
        return orig.apply(this, arguments);
      };
    });

    const target = await page.$$eval(".tt-char", els =>
      els.slice(0, 600).map(e => e.classList.contains("tt-char--space") ? " " : e.textContent).join(""));
    // Reset after the $$eval above, which itself reads rects.
    await page.evaluate(() => { window.__gbcr = 0; });
    for (const ch of target.slice(0, c.type)) await page.keyboard.type(ch, { delay: 4 });
    const reads = await page.evaluate(() => window.__gbcr);

    const perKey = reads / c.type;
    const ok = perKey < 0.5; // was ~2-3/key before the position cache
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name}  keys=${c.type} rect_reads=${reads} (${perKey.toFixed(2)}/key, must be < 0.50)`);
    ok ? pass++ : fail++;
    await page.close();
  } catch (e) {
    console.log(`  FAIL  ${c.name}  ${e.message.split("\n")[0]}`);
    fail++;
  }
}

console.log("\nlayout stability — a test that jumps reads as cheap");
/* CLS during typing must be effectively zero. The char states only change
   colour/decoration/background (none of which reflow), so the realistic
   source is the HUD: tabular-nums equalizes digit WIDTH but not digit
   COUNT, so a wpm climbing 9 -> 10 -> 100 changes its box and nudges
   neighbours in the centred row. live-stats__value reserves 4ch for that. */
for (const c of [CASES[0], CASES[1], CASES[2]]) {
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(BASE + c.url, { waitUntil: "networkidle" });
    await page.waitForSelector(".tt-char", { timeout: 10000 });
    await page.click(".tt-stage").catch(() => {});
    await page.waitForTimeout(500);
    // Observe AFTER load settles so we measure typing, not first paint.
    await page.evaluate(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: false });
    });
    const target = await page.$$eval(".tt-char", (els) =>
      els.slice(0, 400).map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
    for (const ch of target.slice(0, c.type)) await page.keyboard.type(ch, { delay: 5 });
    await page.waitForTimeout(500);
    const cls = await page.evaluate(() => window.__cls);
    // 0.1 is Google's "good" threshold; we hold two orders tighter.
    const ok = cls < 0.001;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name}  CLS=${cls.toFixed(5)} (must be < 0.00100)`);
    ok ? pass++ : fail++;
    await page.close();
  } catch (e) {
    console.log(`  FAIL  ${c.name}  ${e.message.split("\n")[0]}`);
    fail++;
  }
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
