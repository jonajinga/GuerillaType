#!/usr/bin/env node
/* The page must follow the caret while you type.

   The book reader, custom text, quotes, idioms, poems and long lessons
   all render the whole passage into the page and set .tt-text--full /
   --reader. That branch of the renderer deliberately does not slide
   lines up the way the default mode does, which is right for a short
   passage the reader wants to sit still. For a long one it meant the
   caret walked off the bottom of the window and the typist had to stop
   and scroll by hand to see what to type next.

   Measured on a 521-character poem in a 700px viewport before the fix:
   the caret ranged from -292px to 960px and sat outside the viewport in
   8 of 21 samples.

   Usage: node scripts/check-caret-follow.mjs  (needs _site served on 8765) */
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:8765";
const VH = 700;
let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

process.on("unhandledRejection", (e) => {
  console.log(`  FAIL  unhandled rejection — ${e?.message ?? e}`);
  console.log("\nRUN ABORTED — counts below are partial.");
  process.exit(1);
});

/* Service worker blocked: pwa.js reloads on controllerchange, and a
   reload mid-run resets scroll under the measurement. */
const b = await chromium.launch();

const MODES = [
  ["poem", "/practice/?mode=poem"],
  ["book", "/practice/?book=alice-in-wonderland&ch=0"],
  ["lesson", "/practice/?mode=lesson&lesson=57"],
];

for (const [name, url] of MODES) {
  const p = await b.newPage({ viewport: { width: 1100, height: VH }, serviceWorkers: "block" });
  p.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 140)));
  await p.goto(B + url, { waitUntil: "domcontentloaded" });
  const rendered = await p.waitForSelector(".tt-char", { timeout: 25000 }).then(() => true).catch(() => false);
  if (!rendered) { chk(false, `${name}: passage renders`); await p.close(); continue; }

  const isFull = await p.$eval("#tt-text", (e) =>
    e.classList.contains("tt-text--full") || e.classList.contains("tt-text--reader")).catch(() => false);
  chk(isFull, `${name}: uses the full/reader branch`);

  await p.click(".tt-stage").catch(() => {});
  const keys = await p.$$eval(".tt-char", (els) =>
    els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)));

  let offscreen = 0, samples = 0, lo = 1e9, hi = -1e9;
  for (let i = 0; i < keys.length; i++) {
    await p.keyboard.type(keys[i], { delay: 1 });
    if (i % 25 !== 0 || i === 0) continue;
    const y = await p.evaluate(() => {
      const c = document.querySelector(".tt-caret");
      return c ? Math.round(c.getBoundingClientRect().top) : null;
    });
    if (y === null) continue;
    samples++; lo = Math.min(lo, y); hi = Math.max(hi, y);
    // A caret flush with the bottom edge is already too late: the line
    // you are about to type has to be visible, not merely the cursor.
    if (y < 0 || y > VH - 40) offscreen++;
  }
  chk(samples > 0, `${name}: caret was sampled while typing`, `${samples} samples over ${keys.length} chars`);
  chk(offscreen === 0, `${name}: caret never left the readable area`,
    samples ? `range ${lo}..${hi} in a ${VH}px viewport, ${offscreen} outside` : "");
  await p.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
