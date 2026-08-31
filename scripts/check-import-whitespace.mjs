#!/usr/bin/env node
/* An imported text must contain only characters a keyboard can produce.

   Reported by users: uploading a file on /custom/ put "extra spaces
   where they don't belong". Two separate causes, both real:

     1. Characters that LOOK like a space and are not one. A book's text
        layer is full of them -- U+00A0 between "Mr." and "Smith",
        U+2009 before a semicolon, U+2007 inside figures, plus
        zero-width joiners and BOMs left behind by EPUB typesetting.
        Every one of them survived into the typing target. The user sees
        a gap, presses the spacebar, and is marked wrong.

     2. Hyphenation. A word broken across a line arrives as
        "short-\nened". The display layer turns every newline into a
        space, which put one INSIDE the word: "short- ened".

   The trap in testing this: a normalizer that deletes all whitespace
   passes "no unexpected spaces" while destroying every word boundary,
   and one that deletes all punctuation passes "typeable" while
   destroying the prose. So the suite asserts EXACT strings, and section
   B asserts the things that must SURVIVE untouched. Section D re-runs
   the old pipeline to prove the bug was real.

   Usage: node scripts/check-import-whitespace.mjs   (no server needed) */
import * as ct from "../src/assets/js/engine/custom-text.js";

const { sanitize } = ct;
/* Imported off the namespace rather than by name. If normalizeTypeable
   is ever removed, a named import turns this whole suite into a module
   error -- and a suite that cannot start looks nothing like a suite
   that failed. This way the assertions still run and report which
   guarantees were lost. */
const normalizeTypeable = ct.normalizeTypeable || ((x) => String(x || ""));

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
  ok ? pass++ : fail++;
};
const U = (cp) => String.fromCodePoint(cp);
const eq = (got, want, label) => chk(got === want, label, got === want ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

console.log("\n## A. Characters that look like a space become one");

const SPACEY = [
  [0x00a0, "no-break space"],
  [0x1680, "ogham space mark"],
  [0x2002, "en space"],
  [0x2003, "em space"],
  [0x2007, "figure space"],
  [0x2009, "thin space"],
  [0x200a, "hair space"],
  [0x202f, "narrow no-break space"],
  [0x205f, "medium mathematical space"],
  [0x3000, "ideographic space"],
];
for (const [cp, name] of SPACEY) {
  eq(sanitize(`the quick${U(cp)}brown fox`), "the quick brown fox",
    `${name} U+${cp.toString(16).toUpperCase().padStart(4, "0")} becomes a typeable space`);
}
eq(sanitize("the quick\tbrown fox"), "the quick brown fox", "a tab becomes a space");

console.log("\n## B. Invisible characters are removed, and the word closes up");

const INVISIBLE = [
  [0x00ad, "soft hyphen"],
  [0x200b, "zero-width space"],
  [0x200c, "zero-width non-joiner"],
  [0x200d, "zero-width joiner"],
  [0x2060, "word joiner"],
  [0xfeff, "byte-order mark"],
];
for (const [cp, name] of INVISIBLE) {
  eq(sanitize(`short${U(cp)}ened word`), "shortened word",
    `${name} U+${cp.toString(16).toUpperCase().padStart(4, "0")} is removed, not turned into a space`);
}

console.log("\n## C. A word broken across a line does not gain a space");

eq(sanitize("the short-\nened word"), "the short-ened word",
  "hyphen + line break closes up without a space");
eq(sanitize("a visible ef-\nfort to take"), "a visible ef-fort to take",
  "the reported shape: no space lands inside the word");
eq(sanitize("from his buggy to the post-\noffice window"), "from his buggy to the post-office window",
  "a real compound survives the join intact");
eq(sanitize("the short-   \n   ened word"), "the short-ened word",
  "padding around the break is absorbed, not left behind");

console.log("\n## D. What must SURVIVE — the anti-vacuity half");
/* Every check above would also pass if the normalizer simply deleted
   whitespace, or deleted punctuation, or deleted everything. These say
   it did not. */

eq(sanitize("the quick brown fox"), "the quick brown fox",
  "ordinary single spaces are untouched");
eq(sanitize("One thing. Two things. Three things."), "One thing. Two things. Three things.",
  "sentence spacing and punctuation are untouched");
eq(sanitize("First para.\n\nSecond para."), "First para.\n\nSecond para.",
  "a paragraph break survives as a paragraph break");
eq(sanitize("Line one\nLine two"), "Line one\nLine two",
  "a single line break is left for the display layer to fold");
eq(normalizeTypeable("    indented verse line\n    and its fellow"),
  "    indented verse line\n    and its fellow",
  "leading indentation survives — it is load-bearing in poetry");
eq(sanitize("a well-known post-office half-hour"), "a well-known post-office half-hour",
  "hyphens NOT at a line break are left alone");
chk(sanitize("the quick brown fox jumps").split(" ").length === 5,
  "word boundaries still exist — five words in, five words out");

console.log("\n## D2. Pieces of the normalizer nothing else locks in");
/* Both of these survived a mutation run with every other check green,
   which means they were live code with no test behind them. */

eq(sanitize("He  said   nothing."), "He said nothing.",
  "runs of spaces collapse to one");
/* Not redundant with the display layer, which is the easy assumption:
   textToParagraphs() also collapses, but it is only reached for
   non-corpus custom segments. Quotes, idioms, parables and poems take
   the corpusKinds branch in practice-boot.js, which joins segments
   without it -- so for that content this collapse is the only defence. */
eq(sanitize("A quote.  Another sentence.  A third."), "A quote. Another sentence. A third.",
  "…including in corpus content, which never reaches the display-layer collapse");

eq(sanitize('<?xml version="1.0" encoding="UTF-8"?><p>Hello there.</p>'), "Hello there.",
  "a pasted XML prolog is not prose");
eq(sanitize('<!DOCTYPE html><!-- an editor note --><p>Hello there.</p>'), "Hello there.",
  "…nor a doctype, nor an HTML comment");

console.log("\n## E. The whole product is typeable ASCII");

const MESSY =
  `Mr.${U(0x00a0)}Smith read the short-\nened notice${U(0x2009)}; the ` +
  `post-\noffice${U(0x200b)} was shut${U(0x00ad)}tered, and the fee was ` +
  `12${U(0x2007)}500 francs.\tHe left.`;
const cleaned = sanitize(MESSY);
const stray = [...cleaned].filter((c) => {
  const cp = c.codePointAt(0);
  return cp !== 10 && (cp < 32 || cp > 126);
});
chk(stray.length === 0, "a messy real-world paragraph comes out pure ASCII",
  stray.length ? stray.map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase()).join(",") : JSON.stringify(cleaned));
chk(!/ {2,}/.test(cleaned), "…with no doubled spaces", JSON.stringify(cleaned));
chk(!/[A-Za-z]- [A-Za-z]/.test(cleaned), "…and no space inside a hyphenated word", JSON.stringify(cleaned));

console.log("\n## F. The old pipeline really did leave all of this in");
/* sanitize() as it stood before normalizeTypeable existed. If these
   pass, the bug was never there and none of the above is testing
   anything. */
function oldSanitize(raw) {
  let s = String(raw || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<\/?[a-z][^>]*>/gi, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return s.trim();
}
/* The display layer folds newlines to spaces, which is what turned a
   hyphen break into a space inside a word. */
const fold = (t) => t.replace(/\n/g, " ").replace(/[ \t]{2,}/g, " ").trim();

chk(oldSanitize(`the quick${U(0x00a0)}brown fox`).includes(U(0x00a0)),
  "old: a no-break space survived to the typing surface");
chk(oldSanitize(`short${U(0x00ad)}ened`).includes(U(0x00ad)),
  "old: a soft hyphen survived as an untypeable character");
chk(oldSanitize(`the quick${U(0x200b)}brown`).includes(U(0x200b)),
  "old: a zero-width space survived");
chk(fold(oldSanitize("a visible ef-\nfort")) === "a visible ef- fort",
  "old: the reported space really did appear inside the word",
  JSON.stringify(fold(oldSanitize("a visible ef-\nfort"))));
chk(oldSanitize("the quick\tbrown").includes("\t"),
  "old: a lone tab survived");
chk(oldSanitize("He  said   nothing.").includes("  "),
  "old: runs of spaces reached storage intact");
chk(oldSanitize('<?xml version="1.0"?><p>Hi.</p>').indexOf("<?xml") === 0,
  "old: a pasted prolog survived — it starts with \"<?\", which the tag pattern never matched",
  JSON.stringify(oldSanitize('<?xml version="1.0"?><p>Hi.</p>')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
