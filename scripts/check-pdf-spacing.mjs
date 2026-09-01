#!/usr/bin/env node
/* Imported PDFs must not gain spaces the document never had.

   Reported by a user importing a book: the text came through with
   spaces inside words. pdf.js does not return words -- it returns
   positioned FRAGMENTS, split wherever kerning, a font change or a
   ligature interrupts one. parsePdf joined every fragment with a
   space, inventing one at each seam ("beca use", "T he").

   joinTextItems instead concatenates and inserts a space only where the
   geometry shows a real gap.

   The trap in testing this: a function that never emits a space passes
   "no invented spaces" while destroying every word boundary. So each
   case below asserts the EXACT expected string, and the suite checks
   both directions -- seams must close, real gaps must stay open.

   Usage: node scripts/check-pdf-spacing.mjs   (no server needed) */
import { joinTextItems } from "../src/assets/js/engine/import-parsers.js";

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

/* Build a pdf.js-shaped item. pdf.js gives transform [a,b,c,d,x,y] with
   the font size in a/d, plus `width` (the advance) and `hasEOL`. */
const F = 10;                                   // font size
const it = (str, x, width, hasEOL = false, y = 700) =>
  ({ str, width, height: F, hasEOL, transform: [F, 0, 0, F, x, y] });

/* 1. A word split by kerning. "because" broken after "beca": the next
      fragment starts exactly where the last one ended. */
const kerned = [it("beca", 100, 20), it("use", 120, 15)];
chk(joinTextItems(kerned) === "because",
  "a word split by kerning is rejoined without a space", JSON.stringify(joinTextItems(kerned)));

/* 2. Two real words. A space is ~0.25em; this gap is 0.4em. */
const spaced = [it("the", 100, 15), it("book", 119, 20)];
chk(joinTextItems(spaced) === "the book",
  "a real word gap still produces a space", JSON.stringify(joinTextItems(spaced)));

/* 3. The exact shape of the report: one word, three fragments. */
const three = [it("T", 100, 6), it("h", 106, 5), it("e", 111, 5)];
chk(joinTextItems(three) === "The",
  "a word split three ways is rejoined", JSON.stringify(joinTextItems(three)));

/* 4. Mixed: seams close, gaps open, in one line. */
const mixed = [it("mas", 100, 15), it("tery", 115, 18), it("is", 140, 8), it("prac", 152, 18), it("tice", 170, 16)];
chk(joinTextItems(mixed) === "mastery is practice",
  "seams close and gaps open in the same line", JSON.stringify(joinTextItems(mixed)));

/* 5. hasEOL ends the line. */
const eol = [it("first", 100, 22, true), it("second", 100, 28, false, 686)];
chk(joinTextItems(eol) === "first\nsecond",
  "hasEOL ends the line", JSON.stringify(joinTextItems(eol)));

/* 6. A y-drop ends the line even when hasEOL is missing, which some
      producers omit. */
const drop = [it("first", 100, 22, false, 700), it("second", 100, 28, false, 686)];
chk(joinTextItems(drop) === "first\nsecond",
  "a drop to the next line breaks even without hasEOL", JSON.stringify(joinTextItems(drop)));

/* 7. Never double a space the fragment already carries. */
const already = [it("the ", 100, 19), it("book", 119, 20)];
chk(joinTextItems(already) === "the book",
  "an existing trailing space is not doubled", JSON.stringify(joinTextItems(already)));

/* 8. Malformed items must not throw or emit undefined. */
let safe = true, got = "";
try { got = joinTextItems([{ str: "a" }, {}, { str: "b", transform: [] }, null]); }
catch { safe = false; }
chk(safe && !/undefined|NaN/.test(got), "malformed items neither throw nor leak undefined", JSON.stringify(got));

/* 9. The old behaviour must actually be wrong, or none of this matters. */
const old = (items) => items.map((i) => i.str || "").join(" ");
chk(old(kerned) === "beca use" && old(three) === "T h e",
  "the previous join really did invent the reported spaces", `${JSON.stringify(old(kerned))} / ${JSON.stringify(old(three))}`);

/* 10. Accented text. A PDF commonly draws the base letter, jumps BACK to
       stamp the accent over it, then carries on. Reported as spaces
       appearing inside words in a non-English document. */
const ACC = String.fromCodePoint(0x0308);           // combining diaeresis
const accented = [it("u", 100, 6), it(ACC, 101, 0), it("ber", 106, 18)];
chk(joinTextItems(accented) === "u" + ACC + "ber",
  "an accent drawn backwards over its letter does not split the word",
  JSON.stringify(joinTextItems(accented)));

/* 11. The same shape, mid-sentence, with a real word gap after it. If
       the fix were "never emit a space once a zero-width glyph appears",
       this would come back as one run-on word. */
const accentedGap = [it("u", 100, 6), it(ACC, 101, 0), it("ber", 106, 18), it("das", 130, 14)];
chk(joinTextItems(accentedGap) === "u" + ACC + "ber das",
  "…and a genuine word gap after it still opens",
  JSON.stringify(joinTextItems(accentedGap)));

/* 12. An accent that legitimately sits at the far right must still let
       the next word be separated -- the edge tracks the maximum, so a
       forward-placed mark advances it like anything else. */
const accentForward = [it("a", 100, 6), it(ACC, 106, 4), it("word", 130, 20)];
chk(joinTextItems(accentForward) === "a" + ACC + " word",
  "a forward-placed mark still advances the edge",
  JSON.stringify(joinTextItems(accentForward)));

/* 13. The previous rule really was wrong here, or 10 is testing nothing.
       Last-fragment-edge semantics put prevRight behind the base letter. */
function oldJoin(items) {
  let out = "", prevRight = null;
  for (const i of items) {
    const x = i.transform[4], w = i.width, em = Math.abs(i.transform[3]) || 10;
    if (prevRight !== null && !/\s$/.test(out) && !/^\s/.test(i.str) && x - prevRight > em * 0.18) out += " ";
    out += i.str;
    prevRight = x + w;                 // the bug: not a maximum
  }
  return out;
}
chk(oldJoin(accented) === "u" + ACC + " ber",
  "the previous edge rule really did put a space inside the accented word",
  JSON.stringify(oldJoin(accented)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
