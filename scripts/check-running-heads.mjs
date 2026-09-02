#!/usr/bin/env node
/* What commit 0a7d854 -- "rescue: uncommitted CJK chunking + running-head
   stripping from an abandoned session" -- actually does.

   Nobody wrote a test for that commit and nobody verified it, so this
   file is written to find out rather than to confirm. It covers the two
   independent changes in it:

     1. stripRunningLines() in engine/import-parsers.js, which is meant to
        drop the book title and folio that a scanned page repeats at its
        edge, reported from a real import as
          "...mon gros pere, >>Avex?..*
           10 LE JOURNAL D'UNE FEMME DE CHAMBRE
           Il me poussa du coude..."

     2. CJK sentence chunking in engine/custom-text.js: splitLong() plus a
        widened boundary regex in chunk(), because Japanese and Chinese
        put no space after a full stop and a whole book was arriving as
        one segment.

   READ THIS BEFORE CHANGING THE EXPECTATIONS. Sections A-G were
   originally written to PIN the rescued code's defects -- they asserted
   the buggy behaviour, so that fixing it would turn them red rather than
   let it be forgotten. The fix has now been made (see the block comment
   above stripRunningLines) and those assertions have been rewritten to
   the correct behaviour. What each one now says:

     - B: on the real 530-page scan, 112 lines are removed and every one
       is a running head (106) or a bare arabic folio (6). Before the
       fix it removed 22, ten of them roman chapter numbers, and not one
       of them the head. The head's commonest spelling reaches 106 pages
       and the old bar was 132, so none of it went.
     - B, C2, E: roman numerals are no longer folios unless the document
       demonstrably paginates in them. IV VI VIII IX X XI XIII XIV XV
       XVI survive, and so do "Il", "did", "mix", "civil", "mild",
       "vivid", "livid".
     - D: a refrain on three pages of twelve, a speaker name on four of
       ten and a salutation on three of eight all survive. D2 is the
       other half: a head carrying its folio still goes at three of
       twelve, a head with no folio goes at twenty of twenty, and a line
       that appears at the top of half the pages and the foot of the
       other half is left alone.

   Two defects are still pinned, and still assert the wrong behaviour on
   purpose:

     - D2, last check: norm() erases digits before comparing, so a short
       document whose every page opens with a dated entry loses its
       dates. The real book escapes it only on the 15% share.
     - B: 340 of the 530 pages still keep a head, because scanner noise
       splits it across roughly fifty spellings and no single one of
       those reaches the bar. Fixing that needs fuzzy matching, which is
       a different change.
     - K: chunk() inserts a space after a Unicode ellipsis in Latin text.
       "He waited...and waited." (with U+2026) comes back with a space
       that was not in the source. Untouched by this fix.

     - A2: the rescue commit's claim that removing the header repairs
       "m'expli- quer" is misattributed; the repair comes from the
       de-hyphenation merged at 5df7f09. Asserted, not a defect.

   Vacuity: sections C, D2, E and I assert what must SURVIVE and what
   must still GO, so neither a stripper that deletes everything nor one
   that deletes nothing can pass. Section G re-runs the OLD pipeline to
   show the bug was real.

   Usage: node scripts/check-running-heads.mjs   (no server needed) */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as ip from "../src/assets/js/engine/import-parsers.js";
import * as ct from "../src/assets/js/engine/custom-text.js";

/* Off the namespace, not by name. With the rescued commit reverted these
   do not exist, and a named import would turn the whole file into a
   module error -- a suite that cannot start looks nothing like a suite
   that failed, and the second is the useful signal. */
const stripRunningLines = ip.stripRunningLines || ((pages) => pages);
const chunk = ct.chunk || ((t) => [String(t || "")]);

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
  ok ? pass++ : fail++;
};
const eq = (got, want, label) =>
  chk(got === want, label, got === want ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
const eqJ = (got, want, label) => eq(JSON.stringify(got), JSON.stringify(want), label);

const FIX = (n) => fileURLToPath(new URL("./fixtures/" + n, import.meta.url));
const PARSERS_SRC = readFileSync(fileURLToPath(new URL("../src/assets/js/engine/import-parsers.js", import.meta.url)), "utf8");

/* Read one section of a page fixture back into the array of page strings
   that parsePdf would have had in hand. See the fixture header for the
   format. */
function loadPages(file, section) {
  const out = [];
  let cur = null, inSec = false;
  for (const line of readFileSync(FIX(file), "utf8").split("\n")) {
    if (line.startsWith("### ")) { inSec = line.slice(4).trim() === section; continue; }
    if (line === "#PAGE") { if (inSec) { cur = []; out.push(cur); } continue; }
    if (line.startsWith("#")) continue;
    if (inSec && cur) cur.push(line);
  }
  return out.map((ls) => ls.join("\n").replace(/\n+$/, ""));
}

/* The rest of parsePdf, copied verbatim from the line that calls
   stripRunningLines. Copied rather than imported because parsePdf needs
   pdf.js and a browser; the anti-drift check below fails if the copy
   stops matching the original. */
const pagesToText = (pages) =>
  stripRunningLines(pages).join("\n\n").replace(/\s+\n/g, "\n")
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .trim();
/* And the same thing with no stripping at all: the pipeline as it stood
   at 0f52988, the commit before the rescue. */
const oldPagesToText = (pages) =>
  pages.join("\n\n").replace(/\s+\n/g, "\n")
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .trim();

/* The lines each page lost, in page order. */
function removedLines(before, after) {
  const r = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    const keep = new Set(String(after[i]).split("\n"));
    for (const l of before[i].split("\n")) if (!keep.has(l)) r.push(l.trim());
  }
  return r;
}
const removedFrom = (pages) => removedLines(pages, stripRunningLines(pages));

/* Build a plausible multi-page document out of paragraphs. */
const page = (...lines) => lines.join("\n");

console.log("\n## 0. The helper is actually wired into parsePdf");
/* A stripper that exists and is never called is invisible to every other
   check in this file, because they all call it directly. */
chk(/stripRunningLines\(pages\)\.join\("\\n\\n"\)/.test(PARSERS_SRC),
  "parsePdf runs the page array through stripRunningLines");
chk(PARSERS_SRC.includes('.replace(/\\s+\\n/g, "\\n")')
  && PARSERS_SRC.includes('.replace(/(\\p{Ll})-\\n(\\p{Ll})/gu, "$1$2")'),
  "…and the join/de-hyphenate steps this file copies still read the same in the source");

console.log("\n## A. The reported passage — seven real pages of the scan");

const REPORTED = loadPages("running-heads-lejournal.txt", "reported-passage");
chk(REPORTED.length === 7, "fixture loaded", `${REPORTED.length} pages`);

const repBefore = oldPagesToText(REPORTED);
const repAfter = pagesToText(REPORTED);

eq(repBefore.slice(repBefore.indexOf("que vous me demandez"), repBefore.indexOf("que vous me demandez") + 173),
  "que vous me demandez-là, mon gros père,\n»Avex?..*\n10 LE JOURNAL D'UNE FEMME DE CHAMBRE\nIl me poussa du coude légèrement et, glissant\nsur moi un regard étrange dont je ne pus",
  "before: the running head sits in the middle of the sentence, exactly as reported");

eq(repAfter.slice(repAfter.indexOf("que vous me demandez"), repAfter.indexOf("que vous me demandez") + 136),
  "que vous me demandez-là, mon gros père,\n»Avex?..*\nIl me poussa du coude légèrement et, glissant\nsur moi un regard étrange dont je ne pus",
  "after: on this seven-page run the head is gone and the sentence reads straight through");

eqJ(removedFrom(REPORTED),
  ["10 LE JOURNAL D'UNE FEMME DE CHAMBRE", "14 LE JOURNAL D'UNE FEMME DE CHAMBRE", "LE JOURNAL D'UNE FEMME DE CHAMBRE 15"],
  "…and the only lines it removed here are three spellings of that head");

chk(repBefore.length - repAfter.length === 111,
  "exactly 111 characters left the document — the three head lines and nothing else",
  `delta ${repBefore.length - repAfter.length}`);

console.log("\n## A2. The de-hyphenation claim in the commit message is not this change's doing");
/* The commit says the head landed BETWEEN "m'expli-" and "quer" so
   de-hyphenation could not see the two halves. In the real scan it does
   not: both halves are on page 16, lines 3 and 4, and the head is line 1.
   The word is already rejoined before stripRunningLines runs, by the
   \p{Ll} de-hyphenation added in 5df7f09. */
chk(repBefore.includes("je ne pus m'expliquer la double expression"),
  "\"m'expli-\" + \"quer\" is already rejoined WITHOUT the running-head fix");
chk(repAfter.includes("je ne pus m'expliquer la double expression"),
  "…and is still rejoined with it");
chk(!repBefore.includes("m'expli- quer") && !repBefore.includes("m'expli-\nquer"),
  "…so no stray hyphen and no inserted space were ever there to fix");

console.log("\n## B. The same function on the whole 530-page scan");
/* Same code, same book, twenty times as many pages. This is where the
   old bar -- a flat 25% of the page count -- failed from both ends at
   once: it was too high for the head (106 pages of 530) and low enough
   at twelve pages to eat a refrain. */

const EDGES = loadPages("running-heads-lejournal-edges.txt", "edges");
chk(EDGES.length === 530, "all 530 pages loaded", `${EDGES.length}`);

/* The arithmetic, spelled out. norm() is private to the module, so this
   is a copy of it -- used only to describe the corpus. Every assertion
   that decides anything calls the real function. */
const norm = (l) => l.replace(/\d+/g, " ").replace(/[^\p{L}]+/gu, " ").trim().toLowerCase();
const DOMINANT = "le journal d une femme de chambre";
const edgeHas = (pgs, key) => pgs.filter((p) => String(p).split("\n")
  .map((l) => l.trim()).filter(Boolean).some((l) => norm(l) === key)).length;

chk(Math.max(3, Math.floor(EDGES.length * 0.15)) === 79,
  "a line with a folio beside it has to recur on 79 pages here — 15% of 530");
chk(Math.max(8, Math.ceil(EDGES.length * 0.5)) === 265,
  "one with no folio near it has to recur on 265 — half the book");
chk(edgeHas(EDGES, DOMINANT) === 106,
  "the commonest spelling of the head reaches 106 pages, which clears the first bar",
  `${edgeHas(EDGES, DOMINANT)}`);
chk(EDGES.filter((p) => /JOURNAL/i.test(p)).length === 445,
  "445 pages carry the head in SOME spelling — scanner noise splits it about fifty ways",
  `${EDGES.filter((p) => /JOURNAL/i.test(p)).length}`);

const strippedEdges = stripRunningLines(EDGES);
chk(edgeHas(strippedEdges, DOMINANT) === 0,
  "after stripping, not one of those 106 is left",
  `${edgeHas(strippedEdges, DOMINANT)}`);
chk(strippedEdges.filter((p) => /JOURNAL/i.test(String(p))).length === 340,
  "STILL UNFIXED: 340 pages keep a head in one of the misspelt forms — no single one of them reaches 79",
  `${strippedEdges.filter((p) => /JOURNAL/i.test(String(p))).length}`);

const removedReal = removedFrom(EDGES);
chk(removedReal.length === 112, "112 lines leave the book", `${removedReal.length}`);
chk(removedReal.filter((l) => /JOURNAL/i.test(l)).length === 106,
  "106 of them are the running head this was written to remove",
  `${removedReal.filter((l) => /JOURNAL/i.test(l)).length}`);
eqJ(removedReal.filter((l) => !/JOURNAL/i.test(l)), ["111", "7", "13", "5,,", "11", "2364"],
  "…and every other one is a bare arabic folio — six of them, all real page numbers");

/* The roman half. isFolio() used to match any line built only from the
   letters i v x l c d m, so these all went. */
const chapters = ["IV", "VI", "VIII", "IX", "X", "XI", "XIII", "XIV", "XV", "XVI"];
chk(chapters.every((c) => !removedReal.includes(c)),
  "every roman chapter number survives",
  chapters.filter((c) => removedReal.includes(c)).join(",") || "all ten kept");
const linePresent = (c) => strippedEdges.some((p) => String(p).split("\n").map((l) => l.trim()).includes(c));
chk(chapters.every(linePresent), "…and each one is still there in the output, not merely absent from the removal list");
chk(!removedReal.includes("Il") && linePresent("Il"),
  "\"Il\" — the French pronoun ending page 327 mid-sentence — survives");

/* Why the roman test has to be a SHARE of the pages and not a
   comparison. These two counts are of the corpus, not of the function;
   the assertion that decides anything is the one above. */
const ROMAN_ONLY = /^[\s.,\-–—]*[ivxlcdm]{1,7}[\s.,\-–—]*$/i;
const ARABIC_ONLY = /^[\s.,\-–—]*\d{1,4}[\s.,\-–—]*$/;
const edgeLines = (p) => { const s = String(p).split("\n").map((l) => l.trim()).filter(Boolean);
  return [...new Set([...s.slice(0, 2), ...s.slice(-2)])]; };
const romanPages = EDGES.filter((p) => edgeLines(p).some((l) => ROMAN_ONLY.test(l))).length;
const arabicPages = EDGES.filter((p) => edgeLines(p).some((l) => ARABIC_ONLY.test(l))).length;
chk(romanPages === 16 && arabicPages === 6,
  "16 pages of the book have a roman-only edge line and 6 an arabic-only one — so \"roman outnumbers arabic\" alone would wrongly call this a roman-paginated book",
  `roman ${romanPages}, arabic ${arabicPages}`);
chk(romanPages < Math.max(5, Math.ceil(EDGES.length * 0.5)),
  "…and 16 is nowhere near half of 530, which is the test that actually holds");

console.log("\n## C. What must SURVIVE — the anti-vacuity half");
/* Every check above would also pass if stripRunningLines deleted whole
   pages, or every short line, or the entire book. These say it did not. */

const repPagesAfter = stripRunningLines(REPORTED);
chk(repPagesAfter.length === REPORTED.length, "no page is dropped");
chk(removedFrom(REPORTED).length === 3, "exactly three lines leave the seven-page run, not more");
eq(repPagesAfter[0], REPORTED[0], "a page with no running head is returned byte-identical");
chk(repAfter.includes("Farceuse va... sacrée farceuse !"), "ordinary prose lines are untouched");
chk(repAfter.includes("»Avex?..*"), "…including the garbled ones — this is not an OCR cleaner");
chk(repAfter.split("\n").length === repBefore.split("\n").length - 3,
  "the line count drops by three and no more",
  `${repBefore.split("\n").length} -> ${repAfter.split("\n").length}`);
chk(removedFrom(EDGES).length === 112, "and 112 lines from the 530-page corpus, not 22,000");
chk(strippedEdges.length === EDGES.length, "…across the same 530 pages, none of them dropped");
chk(EDGES.join("").length === 86016 && strippedEdges.join("").length === 81997,
  "the 530-page corpus goes from 86,016 characters to 81,997 — 4,019 gone, not 86,016",
  `${EDGES.join("").length} -> ${strippedEdges.join("").length}`);

console.log("\n## C2. Real chapter text keeps its heading");

const CHAP = loadPages("running-heads-lejournal.txt", "chapter-iv");
chk(CHAP.length === 6, "fixture loaded", `${CHAP.length} pages`);
const chapBefore = oldPagesToText(CHAP), chapAfter = pagesToText(CHAP);
eq(chapBefore.slice(chapBefore.indexOf("boude Monsieur"), chapBefore.indexOf("boude Monsieur") + 45),
  "boude Monsieur...\nIV\n26 septembre.\nDepuis une", "before: the chapter opens \"IV\" then the diary date");
eq(chapAfter.slice(chapAfter.indexOf("boude Monsieur"), chapAfter.indexOf("boude Monsieur") + 45),
  "boude Monsieur...\nIV\n26 septembre.\nDepuis une", "after: byte-identical — the chapter number stays, and so does the date");
eqJ(removedFrom(CHAP),
  ["LE JOURNAL D'UNE FEMME DE CHAMBRE 87", "90 LE JOURNAL D'UNE FEMME DE CHAMBRE",
   "LE JOURNAL D'UNE FEMME DE CHAMBRE . »("],
  "three heads leave this run and nothing else");

console.log("\n## D. The recurrence rule — what it may and may not delete");
/* The old bar was Math.max(3, floor(pages * 0.25)): a bar on how LONG
   the document is, not on how much evidence there is that the line is
   furniture. Three occurrences was enough in anything up to twelve
   pages, so short documents were gutted.

   The filler prose below is deliberately worded differently on every
   page. Numbering the pages "page 1", "page 2" would not do it: norm()
   erases digits before comparing, so those lines are the SAME line to
   this code and the document would be gutted for a second reason,
   masking the one under test. That second reason is real and is still
   asserted, as a defect, at the end of this section. */
const NTH = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth",
  "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth",
  "eighteenth", "nineteenth", "twentieth", "twenty-first", "twenty-second", "twenty-third",
  "twenty-fourth", "twenty-fifth", "twenty-sixth", "twenty-seventh", "twenty-eighth", "twenty-ninth",
  "thirtieth", "thirty-first", "thirty-second", "thirty-third", "thirty-fourth", "thirty-fifth",
  "thirty-sixth", "thirty-seventh", "thirty-eighth", "thirty-ninth", "fortieth"];
const filler = (i, slot) => `The ${NTH[i]} page, and the ${NTH[slot]} line of prose upon it.`;
const fillerPage = (i, n = 4) => page(...Array.from({ length: n }, (_, k) => filler(i, k)));

/* If this ever fails, every check in D, E and F below is measuring the
   filler rather than the thing it names. */
const allFiller = [];
for (let i = 0; i < 40; i++) for (let k = 0; k < 6; k++) allFiller.push(filler(i, k));
chk(new Set(allFiller.map((l) => l.replace(/\d+/g, " ").replace(/[^\p{L}]+/gu, " ").trim().toLowerCase())).size === allFiller.length,
  "the filler prose is genuinely distinct — no two lines collide under norm()");
chk(removedFrom(Array.from({ length: 12 }, (_, i) => fillerPage(i))).length === 0,
  "…and a twelve-page document made only of it loses nothing at all");

const REFRAIN = "And miles to go before I sleep";
const versePages = Array.from({ length: 12 }, (_, i) =>
  page(filler(i, 0), filler(i, 1), filler(i, 2), i % 4 === 3 ? REFRAIN : filler(i, 3)));
eqJ(removedFrom(versePages), [],
  "a refrain closing three pages of a twelve-page pamphlet survives — no page number is anywhere near it");

const longVerse = versePages.concat(Array.from({ length: 28 }, (_, i) => fillerPage(i + 12)));
eqJ(removedFrom(longVerse), [], "…and still survives in a forty-page one");

const playPages = Array.from({ length: 10 }, (_, i) =>
  page(i % 3 === 0 ? "MACBETH." : `${NTH[i].toUpperCase()} MURDERER.`, filler(i, 1), filler(i, 2), filler(i, 3)));
eqJ(removedFrom(playPages), [], "a speaker name heading four pages of a ten-page scene survives");

const letterPages = Array.from({ length: 8 }, (_, i) =>
  page(i % 3 === 0 ? "My dear Sir," : filler(i, 0), filler(i, 1), filler(i, 2), filler(i, 3)));
eqJ(removedFrom(letterPages), [], "the salutation opening three letters in a collection survives");

console.log("\n## D2. …and what it must still delete");
/* Section D would pass with the recurrence rule deleted outright. These
   are the two ways a line still qualifies as furniture. */

/* One: a folio sits in the line. Three pages of twelve is enough here —
   the same three-in-twelve that leaves the refrain alone — because the
   page number is the evidence the refrain has not got. */
const HEAD = "THE SONG OF ROLAND";
const foliohead = Array.from({ length: 12 }, (_, i) =>
  page(i % 4 === 3 ? `${20 + i} ${HEAD}` : filler(i, 0), filler(i, 1), filler(i, 2), filler(i, 3)));
eqJ(removedFrom(foliohead), ["23 THE SONG OF ROLAND", "27 THE SONG OF ROLAND", "31 THE SONG OF ROLAND"],
  "a head carrying its folio goes at three pages of twelve — the refrain's count, with a page number added");

/* Two: no folio anywhere, but the line is on half the book or more. */
const bare20 = Array.from({ length: 20 }, (_, i) => page(HEAD, filler(i, 1), filler(i, 2), filler(i, 3)));
eqJ(removedFrom(bare20), Array(20).fill(HEAD),
  "a head with no page number at all still goes when it tops every page of twenty");
const bare9 = Array.from({ length: 20 }, (_, i) =>
  page(i < 9 ? HEAD : filler(i, 0), filler(i, 1), filler(i, 2), filler(i, 3)));
eqJ(removedFrom(bare9), [],
  "…but not at nine pages of twenty — one under half, and with no folio there is nothing else to go on");

/* Three: positional consistency. A running head is at the same edge on
   every page it appears; a line that wanders is prose. */
const wander = Array.from({ length: 20 }, (_, i) => i % 2
  ? page(HEAD, filler(i, 1), filler(i, 2), filler(i, 3))
  : page(filler(i, 0), filler(i, 1), filler(i, 2), HEAD));
eqJ(removedFrom(wander), [],
  "the same line on all twenty pages — ten at the top, ten at the foot — is left alone; furniture does not move");
chk(stripRunningLines(wander).every((p, i) => p === wander[i]), "…those pages come back byte-identical");

/* Digits are erased before comparing -- deliberately, so "10 LE JOURNAL"
   and "14 LE JOURNAL" count as the same line. The cost is that any two
   lines differing only in a number are the same line too, and a dated
   entry at the top of a page is folio-associated by the leading number.
   The book this was written for is a DIARY. It survives at 530 pages
   only because 4 dates is under the 15% share -- see section B -- but a
   short document made entirely of dated entries still loses them. */
const MONTHS = ["septembre", "octobre", "novembre"];
const diaryPages = Array.from({ length: 12 }, (_, i) =>
  page(`${i + 3} ${MONTHS[i % 3]}.`, filler(i, 1), filler(i, 2), filler(i, 3)));
eqJ(removedFrom(diaryPages),
  ["3 septembre.", "4 octobre.", "5 novembre.", "6 septembre.", "7 octobre.", "8 novembre.",
   "9 septembre.", "10 octobre.", "11 novembre.", "12 septembre.", "13 octobre.", "14 novembre."],
  "DEFECT, still unfixed: every date in a twelve-entry diary is deleted — \"3 septembre.\" and \"18 septembre.\" are one line once the digits go");

console.log("\n## E. Folios are digits — real words are not page numbers");
/* The old pattern was
     /^[\s.,\-–—]*(?:[ivxlcdm]{1,7}|\d{1,4})[\s.,\-–—]*$/i
   which matches ANY line built only from the letters i v x l c d m, up
   to seven of them. No recurrence was required and no threshold applied:
   one page ending on such a word was enough to lose it. */

const docWithLastLine = (word) => Array.from({ length: 6 }, (_, i) =>
  page(filler(i, 0), filler(i, 1), filler(i, 2), i === 2 ? word : filler(i, 3)));
for (const w of ["did", "mix", "civil", "mild", "vivid", "livid", "Il", "MIX", "the", "and", "was", "sept", "mixed", "Yes", "No."]) {
  eqJ(removedFrom(docWithLastLine(w)), [], `a page ending on the single word "${w}" keeps it`);
}
/* Anti-vacuity: a page ending on an actual number still loses it. */
for (const w of ["7", "42", "1904"]) {
  eqJ(removedFrom(docWithLastLine(w)), [w], `…but a page ending on "${w}" alone loses it — that is a folio`);
}

console.log("\n## E2. Roman numerals count only where roman pagination is the norm");
/* The escape hatch: a document that really is paginated i, ii, iii. The
   bar is deliberately steep — half the pages must carry a roman-only
   edge line, and more pages must carry a roman one than an arabic one —
   because getting this wrong costs real words (section E) and getting
   it too strict only costs a stray "xii" on some front matter. */

const ROMANS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
const romanBook = ROMANS.map((r, i) => page(filler(i, 0), filler(i, 1), filler(i, 2), r));
eqJ(removedFrom(romanBook), ROMANS,
  "ten pages footed i…x: roman pagination is the norm here, so all ten go");

/* The same roman lines in a book that paginates in digits: kept. This is
   the real scan's shape in miniature (section B: 16 roman, 6 arabic). */
const mixedBook = Array.from({ length: 10 }, (_, i) =>
  page(filler(i, 0), filler(i, 1), filler(i, 2), i < 4 ? ROMANS[i + 5] : String(100 + i)));
eqJ(removedFrom(mixedBook), ["104", "105", "106", "107", "108", "109"],
  "four roman lines against six arabic folios: the digits go, the romans stay");

console.log("\n## F. The under-five-page bail-out");
/* stripRunningLines returns immediately for a document of fewer than
   five pages. Defensible for the recurrence test -- three of four pages
   is not evidence -- but isFolio needs no evidence at all, so a four-page
   pamphlet keeps its page numbers while a five-page one loses them. The
   two halves are asserted together so neither can pass on its own. */

const folioPage = (i, n) => page(filler(i, 0), filler(i, 1), String(n));
const four = [11, 12, 13, 14].map((n, i) => folioPage(i, n));
const five = [11, 12, 13, 14, 15].map((n, i) => folioPage(i, n));
eqJ(stripRunningLines(four), four, "four pages: returned untouched, page numbers and all");
eqJ(removedFrom(five), ["11", "12", "13", "14", "15"],
  "add a fifth page and every folio in the document disappears");

console.log("\n## F2. EDGE = 2 — two lines at each end, no more and no fewer");
/* EDGE is a bare constant with nothing holding it in place. These two
   documents fix it from both sides. */

/* A running head is often NOT the first line: a scanned page frequently
   sets the folio on a line of its own above it, which is exactly the
   layout of pages 16 and 20 of the real scan. Reaching it needs EDGE >= 2. */
const twoLineHead = Array.from({ length: 10 }, (_, i) =>
  page(String(40 + i), "THE MILL ON THE FLOSS", filler(i, 1), filler(i, 2), filler(i, 3)));
eqJ(removedFrom(twoLineHead),
  [40, 41, 42, 43, 44, 45, 46, 47, 48, 49].flatMap((n) => [String(n), "THE MILL ON THE FLOSS"]),
  "the folio AND the head below it both go — one line at each end would miss the head");

/* And the other side: a line that recurs in the BODY of the page is not
   furniture and must be left alone. A play sets a character cue every
   few lines, not only at the top. */
const bodyCue = Array.from({ length: 10 }, (_, i) =>
  page(filler(i, 0), filler(i, 1), "MACBETH.", filler(i, 2), filler(i, 3), filler(i, 4)));
eqJ(removedFrom(bodyCue), [],
  "a line recurring in the MIDDLE of every page is untouched — it is prose, not furniture");
chk(stripRunningLines(bodyCue).every((p, i) => p === bodyCue[i]),
  "…and those pages come back byte-identical");

console.log("\n## G. The old pipeline — the bug was real, and is gone");
/* Section F of check-import-whitespace.mjs in spirit: run the code as it
   stood before any of this, at 0f52988, and show what it did. */

chk(oldPagesToText(REPORTED).includes("»Avex?..*\n10 LE JOURNAL D'UNE FEMME DE CHAMBRE\nIl me poussa"),
  "old: the running head really did land in the middle of the reported sentence");
chk(oldPagesToText(CHAP).includes("boude Monsieur...\nIV\n26 septembre."),
  "old: the chapter number \"IV\" was in the text, where it belongs");
chk(pagesToText(CHAP).includes("boude Monsieur...\nIV\n26 septembre."),
  "…and it still is");
const oldFull = oldPagesToText(EDGES), newFull = pagesToText(EDGES);
const oi = oldFull.indexOf("»Avex?..*"), ni = newFull.indexOf("»Avex?..*");
chk(oldFull.slice(oi, oi + 70) === "»Avex?..*\n10 LE JOURNAL D'UNE FEMME DE CHAMBRE\nIl me poussa du coude l",
  "old: on the real 530-page book the head is there at the reported passage");
chk(newFull.slice(ni, ni + 70) === "»Avex?..*\nIl me poussa du coude légèrement et, glissant\n;\nici, instant",
  "new: it is gone, and the sentence reads through",
  JSON.stringify(newFull.slice(ni, ni + 70)));
chk(oldFull.length - newFull.length === 4045,
  "4,045 characters leave the 530-page book — where the version before this fix removed 73, and they were the wrong 73",
  `delta ${oldFull.length - newFull.length}`);

console.log("\n## H. CJK — a book must stop arriving as one segment");

/* chunk() as it stood at 0f52988. */
function oldChunk(text, maxLen = 500) {
  const out = [];
  const re = /[.!?][”"')\]]?\s+/g;
  let last = 0, m;
  let buf = "";
  const sentences = [];
  while ((m = re.exec(text))) { sentences.push(text.slice(last, m.index + m[0].length).trim()); last = m.index + m[0].length; }
  if (last < text.length) sentences.push(text.slice(last).trim());
  for (const s of sentences) {
    if ((buf + " " + s).trim().length > maxLen && buf) { out.push(buf.trim()); buf = s; }
    else { buf = (buf ? buf + " " : "") + s; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/* Natsume Soseki, "I Am a Cat" (1905), and Lu Xun, "From the Hundred-Plant
   Garden" (1926) — both public domain, both repeated to the length of a
   real chapter. Neither contains a single space. */
const JA_UNIT = "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。";
const ZH_UNIT = "我家的后面有一个很大的园，相传叫作百草园。现在是早已并屋子一起卖给朱文公的子孙了。连那最末次的相见也已经隔了七八年。";
const JA = JA_UNIT.repeat(20);
const ZH = ZH_UNIT.repeat(20);

for (const [name, text] of [["Japanese", JA], ["Chinese", ZH]]) {
  const before = oldChunk(text), after = chunk(text);
  chk(before.length === 1, `old: ${name} arrived as ONE segment of ${before[0].length} characters`, `${before.length}`);
  chk(after.length > 1, `new: it splits into ${after.length} segments`, `${after.length}`);
  chk(after.every((s) => s.length <= 500), "…none of them over the 500-character segment size",
    JSON.stringify(after.map((s) => s.length)));
  eq(after.join(""), text, "…and putting them back together gives the source exactly — no space invented");
  chk(!after.some((s) => /\s/.test(s)), "…no whitespace anywhere in the output, as in the source");
  chk(!after.some((s) => !s.trim()), "…and no empty segment");
}

/* The boundary really is the ideographic full stop, not the length. */
eqJ(chunk(JA_UNIT, 40), [
  "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。",
  "何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。",
], "every segment ends on a full stop, exactly where the sentences end");

console.log("\n## I. Latin behaviour must not have changed");

const LATIN = [
  "One thing. Two things. Three things.",
  "Pi is 3.14 and e is 2.71 approximately. That is enough arithmetic.",
  '"Stop!" he said. "Now." She left without another word.',
  "Mr. Smith went to Washington. He did not enjoy it. He came home.",
  "Is it? Yes! It is. And that (finally) settles the question.",
  "A sentence ending in an abbreviation, e.g. this one. Then another.",
];
for (const t of LATIN) {
  /* 500 is production; 100 is well above the longest sentence here. Below
     the length of a sentence the new splitLong() cuts it, which is the
     intended change and is asserted in section J, not a Latin regression. */
  for (const maxLen of [100, 500]) {
    eqJ(chunk(t, maxLen), oldChunk(t, maxLen), `unchanged at maxLen ${maxLen}: ${JSON.stringify(t.slice(0, 34))}`);
  }
}
eqJ(chunk("3.14 is pi. And that is that.", 500), ["3.14 is pi. And that is that."],
  "a decimal point does not end a sentence");
/* And when splitLong DOES have to cut this sentence, it still cuts at
   spaces, never after the point in "4.5". */
eqJ(chunk("The score was 4.5 to 3.2 at half time.", 10),
  ["The score", "was 4.5 to", "3.2 at", "half time."],
  "…and a forced cut lands on spaces, never inside a decimal");

console.log("\n## J. splitLong — the new cut for an over-long sentence");

const RUNON = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec";
chk(oldChunk(RUNON, 60)[0].length === RUNON.length,
  "old: a sentence longer than the segment size came back whole, over the limit",
  `${oldChunk(RUNON, 60)[0].length} > 60`);
eqJ(chunk(RUNON, 60),
  ["alpha bravo charlie delta echo foxtrot golf hotel india", "juliet kilo lima mike november oscar papa quebec"],
  "new: it is cut, and cut at a space — no word is broken");
chk(chunk(RUNON, 60).every((s) => s.length <= 60), "…and every piece fits");
chk(chunk(RUNON, 60).every((s) => s.trim().length > 0), "…with no empty piece");
chk(RUNON.split(" ").every((w) => chunk(RUNON, 60).some((s) => s.split(" ").includes(w))),
  "…and every word of the source survives intact in some piece");

/* Documented, not accidental: with no space to cut at, the cut is hard.
   This is what makes the Japanese case work at all, and it is the honest
   fallback without a word-segmentation dictionary. */
const NOSPACE = "alpha " + "b".repeat(200);
chk(chunk(NOSPACE, 100).length === 3 && chunk(NOSPACE, 100)[1] === "b".repeat(100),
  "a 200-character run with nowhere to break is cut hard, mid-token",
  JSON.stringify(chunk(NOSPACE, 100).map((s) => s.length)));

console.log("\n## K. DEFECT — the widened regex adds a space to Latin text");
/* U+2026 was added to the sentence-ending class with \\s* rather than
   \\s+, so it ends a sentence with no space after it. chunk() then glues
   the two halves back with a space that was not in the source. sanitize()
   does not turn U+2026 into "...", so pasted text reaches chunk() with
   the real character in it. */
const ELL = "He waited…and waited. Then he left.";
eqJ(oldChunk(ELL), ["He waited…and waited. Then he left."],
  "old: an ellipsis with no space after it was not a sentence end");
eqJ(chunk(ELL), ["He waited… and waited. Then he left."],
  "DEFECT new: a space appears after the ellipsis that the author never typed");
chk(chunk(ELL).join("").length === ELL.length + 1,
  "…one character longer than the text that went in", `${chunk(ELL).join("").length} vs ${ELL.length}`);
/* The ASCII form is safe, which is why the import path never sees it. */
eqJ(chunk("He waited...and waited. Then he left."), ["He waited...and waited. Then he left."],
  "the ASCII \"...\" form is untouched — asciify() turns imported ellipses into these");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
