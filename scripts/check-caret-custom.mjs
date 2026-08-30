#!/usr/bin/env node
/* The caret must stay on its character in CUSTOM text mode.

   check-caret-proportional.mjs covers the library reader (Lora, a
   proportional face) while mistyping. It never visits custom mode and
   never types at a paragraph break, so it stayed green while the caret
   was visibly one character out on the Alice sample.

   The defect: a paragraph break is stored as newline characters, and
   the second one renders ZERO pixels wide. Type a visible glyph against
   the first and the second expands to a full column, sliding every
   later character one column right. _glyphChanged declined to refresh
   the position cache because the surface is monospace -- sound only if
   every glyph has the same advance, which a 0px character breaks. The
   caret then sat exactly one character LEFT of its target, measured at
   -19.68px, and stayed wrong for the rest of the passage.

   Usage: node scripts/check-caret-custom.mjs   (needs _site on 8765) */
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

/* The sample's id is generated per browser profile, so discover the
   link rather than hard-coding an id that dies on the next profile. */
await p.goto(`${B}/custom/`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const href = await p.evaluate(() => document.querySelector('a[href*="mode=custom"]')?.getAttribute("href") || null);
chk(!!href, "the custom page offers a saved text to type");
if (!href) { await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

await p.goto(new URL(href, B).href, { waitUntil: "networkidle" });
const rendered = await p.waitForSelector(".tt-char", { timeout: 25000 }).then(() => true).catch(() => false);
chk(rendered, "custom passage renders");
await p.waitForTimeout(1400);   // let the webfont settle before measuring

const shape = await p.evaluate(() => {
  const cs = [...document.querySelectorAll(".tt-char")];
  const w = new Set();
  cs.forEach((e) => { if (/[a-z]/i.test(e.textContent)) w.add(+e.getBoundingClientRect().width.toFixed(1)); });
  const zero = cs.findIndex((e) => e.getBoundingClientRect().width === 0);
  return { widths: [...w].length, zeroAt: zero, count: cs.length };
});
/* Both preconditions, asserted rather than assumed: without a zero-width
   character there is nothing to reflow, and on a proportional surface a
   different code path handles it -- either way this check would pass
   while proving nothing. */
chk(shape.widths === 1, "the custom surface is monospace", `${shape.widths} advance width(s)`);
chk(shape.zeroAt >= 0, "the passage contains a zero-width paragraph break", `first at index ${shape.zeroAt}`);

const read = () => p.evaluate(() => {
  const cs = [...document.querySelectorAll(".tt-char")].filter((e) => !e.classList.contains("tt-char--extra"));
  const caret = document.querySelector(".tt-caret");
  const n = cs.findIndex((e) => !e.classList.contains("tt-char--correct") && !e.classList.contains("tt-char--incorrect"));
  if (!caret || n < 0) return null;
  const t = cs[n].getBoundingClientRect(), c = caret.getBoundingClientRect();
  return { n, dx: c.left - t.left, dy: c.top - t.top, w: t.width,
           next: cs[n].classList.contains("tt-char--space") ? " " : cs[n].textContent };
});

await p.click(".tt-stage").catch(() => {});

// Walk up to the first zero-width character, typing the text exactly.
let guard = 0;
while (guard++ < 400) {
  const s = await read();
  if (!s || s.w === 0) break;
  await p.keyboard.type(s.next === "\n" || s.next === "\r" ? " " : s.next, { delay: 1 });
}
const atBreak = await read();
chk(!!atBreak, "reached the paragraph break");

/* The trigger: a visible glyph typed against the break. This is what a
   reader does on hitting the blank line after a chapter title. */
await p.keyboard.type("A", { delay: 1 });
await p.waitForTimeout(120);

let worst = 0, samples = 0;
for (let i = 0; i < 60; i++) {
  const s = await read();
  if (!s) break;
  if (s.w > 0) { samples++; if (Math.abs(s.dx) > Math.abs(worst)) worst = s.dx; }
  await p.keyboard.type(s.next === "\n" || s.next === "\r" ? " " : s.next, { delay: 1 });
}
chk(samples > 30, "caret was sampled past the break", `${samples} samples`);
const charW = atBreak?.w || 19.7;
chk(Math.abs(worst) <= 6, "caret stays on its character across a paragraph break",
  `worst ${worst.toFixed(2)}px (${(worst / 19.7).toFixed(2)} chars; -19.68px before the fix)`);

/* Backspacing restores the target glyph, which reflows the line exactly
   as much as substituting it did -- setUntyped refreshed nothing. */
for (let i = 0; i < 6; i++) { await p.keyboard.press("Backspace"); await p.waitForTimeout(40); }
const after = await read();
chk(!!after && Math.abs(after.dx) <= 6, "caret stays on its character after backspacing",
  after ? `${after.dx.toFixed(2)}px` : "no reading");

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
