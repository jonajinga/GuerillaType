#!/usr/bin/env node
/* The caret must stay on its character when the surface is proportional.

   The renderer caches every character's position once and deliberately
   does NOT refresh that cache when a mistyped glyph is swapped in. The
   justification in the code was "the typing font is monospace, so
   swapping one glyph for another keeps the same advance width".

   True of the monospace typing surface. False of the reader surface,
   which renders books, quotes, idioms, poems and parables in Lora -- a
   proportional serif with 21 distinct advance widths. Substituting a
   narrow glyph for a wide one there shifts every character after it,
   and the caret stayed where the stale positions put it: measured at
   646px to the LEFT of its character after 24 substitutions, worsening
   with every further mistake.

   Usage: node scripts/check-caret-proportional.mjs  (needs _site on 8765) */
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:8765";
let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

process.on("unhandledRejection", (e) => {
  console.log(`  FAIL  unhandled rejection — ${e?.message ?? e}`);
  console.log("\nRUN ABORTED — counts below are partial.");
  process.exit(1);
});

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
p.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 140)));

await p.goto(`${B}/practice/?book=alice-in-wonderland&ch=0`, { waitUntil: "domcontentloaded" });
const rendered = await p.waitForSelector(".tt-char", { timeout: 25000 }).then(() => true).catch(() => false);
chk(rendered, "reader passage renders");
await p.waitForTimeout(1200);   // let the webfont settle before measuring

/* If the surface were monospace this whole check would be vacuous, so
   assert the precondition rather than assume it. */
const widths = await p.$$eval(".tt-char", (els) => {
  const w = new Set();
  els.forEach((e) => { if (/[a-z]/i.test(e.textContent)) w.add(+e.getBoundingClientRect().width.toFixed(1)); });
  return [...w];
}).catch(() => []);
chk(widths.length > 1, "the reader surface is proportional", `${widths.length} distinct advance widths`);

await p.click(".tt-stage").catch(() => {});
const keys = await p.$$eval(".tt-char", (els) =>
  els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)));

const probe = () => p.evaluate(() => {
  const cs = [...document.querySelectorAll(".tt-char")];
  const caret = document.querySelector(".tt-caret");
  const n = cs.findIndex((e) => !e.classList.contains("tt-char--correct") && !e.classList.contains("tt-char--incorrect"));
  if (!caret || n < 0) return null;
  const c = caret.getBoundingClientRect(), t = cs[n].getBoundingClientRect();
  return { dx: c.left - t.left, dy: c.top - t.top };
});

let worst = 0, errs = 0, samples = 0;
for (let i = 0; i < Math.min(keys.length - 1, 200); i++) {
  // Substitute a narrow glyph for whatever was there: the exact case
  // the cache assumed could not happen.
  const wrong = i % 6 === 2 && /[a-z]/i.test(keys[i]);
  await p.keyboard.type(wrong ? "i" : keys[i], { delay: 1 });
  if (wrong) errs++;
  const r = await probe();
  if (!r) continue;
  samples++;
  if (Math.abs(r.dx) > Math.abs(worst)) worst = r.dx;
}

chk(errs >= 15, "enough substitutions to accumulate drift", `${errs} substitutions`);
chk(samples > 100, "caret was sampled throughout", `${samples} samples`);
// A couple of pixels is sub-glyph rounding; a character width is not.
chk(Math.abs(worst) <= 6, "caret stays on its character despite mistyping",
  `worst ${worst.toFixed(1)}px (646px before the fix)`);

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
