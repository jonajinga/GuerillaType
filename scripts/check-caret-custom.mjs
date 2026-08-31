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
  return { n, dx: c.left - t.left, dy: c.top - t.top, w: t.width, h: t.height,
           next: cs[n].classList.contains("tt-char--space") ? " " : cs[n].textContent };
});


/* At a line wrap the caret legitimately sits at the end of the previous
   line while the next character starts the following one, so their left
   edges differ by a whole line width. Comparing those is meaningless --
   it manufactured several false readings while this bug was being
   chased. Only samples on the same visual line are comparable; the
   counts below assert the skipped ones stay a small minority, so this
   filter can never quietly swallow the whole run. */
const sameLine = (s) => s && s.w > 0 && Math.abs(s.dy) <= s.h * 0.5;

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

let worst = 0, samples = 0, skipped = 0;
for (let i = 0; i < 60; i++) {
  const s = await read();
  if (!s) break;
  if (sameLine(s)) { samples++; if (Math.abs(s.dx) > Math.abs(worst)) worst = s.dx; } else if (s) skipped++;
  await p.keyboard.type(s.next === "\n" || s.next === "\r" ? " " : s.next, { delay: 1 });
}
chk(samples > 30, "caret was sampled past the break", `${samples} samples`);
const charW = atBreak?.w || 19.7;
chk(Math.abs(worst) <= 6, "caret stays on its character across a paragraph break",
  `worst ${worst.toFixed(2)}px (${(worst / 19.7).toFixed(2)} chars; -19.68px before the fix)`);

/* Backspacing restores the target glyph, which reflows the line exactly
   as much as substituting it did -- setUntyped refreshed nothing either.

   This has to walk back PAST the substituted character at the break. An
   earlier version of this check backspaced only a few places, over
   characters that had been typed correctly; setUntyped leaves those
   alone (it only rewrites textContent when the glyph was swapped), so
   nothing reflowed and the assertion passed even with the setUntyped
   fix deleted. Verified by deleting it: this now fails, that did not. */
const before = await read();
const back = (before ? before.n : 0) - (shape.zeroAt - 2);
let worstBack = 0, backSamples = 0;
for (let i = 0; i < back; i++) {
  await p.keyboard.press("Backspace");
  await p.waitForTimeout(25);
  const s = await read();
  if (sameLine(s)) { backSamples++; if (Math.abs(s.dx) > Math.abs(worstBack)) worstBack = s.dx; } else if (s) skipped++;
}
chk(backSamples > 10, "caret was sampled while backspacing", `${backSamples} samples over ${back} deletions`);
chk(Math.abs(worstBack) <= 6, "caret stays on its character while backspacing past a substitution",
  `worst ${worstBack.toFixed(2)}px`);

/* Undoing the substitution collapses the break back to 0px and pulls the
   rest of the line LEFT again -- but only characters AFTER the break
   move, and backspacing never visits those. So retype forward over them:
   that is where a cache left stale by setUntyped shows up. Without the
   setUntyped invalidation this reads +19.7px, the mirror image of the
   original defect. */
let worstFwd = 0, fwdSamples = 0;
for (let i = 0; i < 45; i++) {
  const s = await read();
  if (!s) break;
  await p.keyboard.type(s.next === "\n" || s.next === "\r" ? " " : s.next, { delay: 1 });
  await p.waitForTimeout(20);
  const t = await read();
  if (sameLine(t)) { fwdSamples++; if (Math.abs(t.dx) > Math.abs(worstFwd)) worstFwd = t.dx; } else if (t) skipped++;
}
chk(fwdSamples > 20, "caret was sampled retyping over the restored break", `${fwdSamples} samples`);
chk(Math.abs(worstFwd) <= 6, "caret stays on its character after an undone substitution",
  `worst ${worstFwd.toFixed(2)}px`);

chk(skipped < samples + backSamples + fwdSamples, "wrap-boundary samples are a minority",
  `${skipped} skipped vs ${samples + backSamples + fwdSamples} compared`);

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
