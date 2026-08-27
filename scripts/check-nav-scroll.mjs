#!/usr/bin/env node
/* The navbar dropdowns must fit the viewport and scroll.

   They were a fixed 760px tall with overflow:hidden, anchored below a
   58px header -- so they needed 818px of viewport before they fit. On a
   1440x768 laptop 71px of every panel hung below the fold with no way
   to reach it, and the Games panel overflowed internally on top of that.

   Checked at 768px tall, the height that broke it, plus a very short
   viewport to make sure the cap holds when there is almost no room.

   Usage: node scripts/check-nav-scroll.mjs  (needs _site served on 8765) */
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:8765";
let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

process.on("unhandledRejection", (e) => {
  console.log(`  FAIL  unhandled rejection — ${e?.message ?? e}`);
  console.log("\nRUN ABORTED — counts below are partial.");
  process.exit(1);
});

/* Service worker blocked: pwa.js reloads on controllerchange, and a
   reload landing mid-measurement rebuilds the DOM under it. */
const b = await chromium.launch();

for (const height of [768, 600]) {
  const p = await b.newPage({ viewport: { width: 1440, height }, serviceWorkers: "block" });
  p.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 140)));
  await p.goto(B + "/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".site-nav__item[data-mega]", { timeout: 20000 }).catch(() => {});

  const triggers = await p.$$(".site-nav__item[data-mega] [data-mega-trigger]");
  chk(triggers.length > 0, `${height}px: menu triggers found`, `${triggers.length}`);

  const heights = new Set();
  let clipped = 0, unreachable = 0, cueWrong = 0, checked = 0;

  for (const t of triggers) {
    await t.click();
    await p.waitForTimeout(120);
    const r = await p.evaluate(() => {
      const item = document.querySelector('.site-nav__item[data-mega][data-open="true"]');
      const panel = item && item.querySelector(".mega");
      if (!panel) return null;
      const box = panel.getBoundingClientRect();
      const links = [...panel.querySelectorAll(".mega__item")];
      const max = panel.scrollHeight - panel.clientHeight;
      const before = { over: panel.dataset.overflowing, top: panel.dataset.atTop, end: panel.dataset.atEnd };
      /* Jump to the end and measure. "instant" matters: nav.css turns on
         smooth scrolling, so assigning scrollTop animates and measuring
         in the same frame reads a position the panel has not reached
         yet -- which looked like unreachable links and was not. */
      try { panel.scrollTo({ top: max, behavior: "instant" }); }
      catch { panel.scrollTop = max; }
      const last = links[links.length - 1];
      const lb = last ? last.getBoundingClientRect() : null;
      return {
        panelH: Math.round(box.height),
        below: Math.round(box.bottom - window.innerHeight),
        overflows: max > 1,
        before,
        lastVisibleAfterScroll: lb ? (lb.bottom <= window.innerHeight + 1 && lb.top >= box.top - 1) : true,
        linkCount: links.length,
      };
    });
    if (!r) continue;
    checked++;
    heights.add(r.panelH);
    if (r.below > 0) clipped++;
    if (!r.lastVisibleAfterScroll) unreachable++;
    // The cue attributes must reflect reality: overflowing panels start
    // at the top and not at the end; non-overflowing ones claim neither.
    if (r.overflows) { if (r.before.over !== "true" || r.before.top !== "true" || r.before.end === "true") cueWrong++; }
    else if (r.before.over === "true") cueWrong++;
    await p.keyboard.press("Escape");
    await p.waitForTimeout(60);
  }

  chk(checked > 0, `${height}px: panels measured`, `${checked}`);
  chk(clipped === 0, `${height}px: no panel hangs below the viewport`, `${clipped} clipped`);
  chk(unreachable === 0, `${height}px: every link reachable by scrolling`, `${unreachable} unreachable`);
  chk(cueWrong === 0, `${height}px: scroll cues match reality`, `${cueWrong} wrong`);
  chk(heights.size === 1, `${height}px: all panels share one height`, `${[...heights].join(", ")}px`);
  const only = [...heights][0];
  chk(only !== undefined && only <= height, `${height}px: panel height fits the viewport`, `${only}px in ${height}px`);
  await p.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
