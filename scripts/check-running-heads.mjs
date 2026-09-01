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

   READ THIS BEFORE CHANGING THE EXPECTATIONS. Sections marked DEFECT
   assert what the code DOES today, not what it should do. They are here
   because the behaviour is wrong and was not previously written down
   anywhere. If you fix stripRunningLines, these go red -- that is the
   point, and the expectation should then be rewritten to the new,
   correct behaviour rather than deleted.

   The three findings the DEFECT sections record:

     - On the real 530-page scan the running head is NEVER removed. The
       most common spelling of it reaches only 106 pages, and the
       threshold is floor(530 * 0.25) = 132. Scanner noise splits the
       head across roughly fifty spellings, so no single one clears the
       bar. The reported passage comes out byte-identical to the old
       pipeline. It DOES work on a short excerpt, which is presumably how
       it looked correct while being written.
     - The only thing it removes from the real book is 22 lines, and ten
       of those are chapter numbers -- IV, VI, VIII, IX, X, XI, XIII,
       XIV, XV, XVI -- destroyed by isFolio(), which matches any line
       made only of the letters i v x l c d m. It also eats the French
       pronoun "Il" at the foot of page 327.
     - chunk() now inserts a space after a Unicode ellipsis in Latin
       text. "He waited...and waited." (with U+2026) comes back with a
       space that was not in the source.

   Vacuity: sections C and I assert what must SURVIVE untouched, so a
   stripper that deleted everything and a chunker that split at every
   character could not pass. Section G re-runs the OLD pipeline to show
   which bugs were real and -- for the running head -- that one of them
   still is.

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

console.log("\n## B. DEFECT — the same function on the whole 530-page scan");
/* Same code, same book, twenty times as many pages. The threshold is a
   fraction of the page count, so growing the document makes the head
   HARDER to remove, not easier. */

const EDGES = loadPages("running-heads-lejournal-edges.txt", "edges");
chk(EDGES.length === 530, "all 530 pages loaded", `${EDGES.length}`);

/* The arithmetic, spelled out. norm() is private to the module, so this
   is a copy of it -- used only to describe the corpus. Every assertion
   that decides anything calls the real function. */
const norm = (l) => l.replace(/\d+/g, " ").replace(/[^\p{L}]+/gu, " ").trim().toLowerCase();
const DOMINANT = "le journal d une femme de chambre";
const edgeHas = (pgs, key) => pgs.filter((p) => String(p).split("\n")
  .map((l) => l.trim()).filter(Boolean).some((l) => norm(l) === key)).length;

chk(Math.max(3, Math.floor(EDGES.length * 0.25)) === 132, "the bar is 132 pages — a quarter of 530");
chk(edgeHas(EDGES, DOMINANT) === 106,
  "the commonest spelling of the head reaches 106 pages, which is under it", `${edgeHas(EDGES, DOMINANT)}`);
chk(EDGES.filter((p) => /JOURNAL/i.test(p)).length === 445,
  "though 445 pages carry the head in SOME spelling — scanner noise splits it about fifty ways",
  `${EDGES.filter((p) => /JOURNAL/i.test(p)).length}`);

const strippedEdges = stripRunningLines(EDGES);
chk(edgeHas(strippedEdges, DOMINANT) === 106,
  "DEFECT: after stripping, all 106 are still there — not one head is removed",
  `${edgeHas(strippedEdges, DOMINANT)}`);
chk(strippedEdges.filter((p) => /JOURNAL/i.test(String(p))).length === 445,
  "DEFECT: and so are the other 339", `${strippedEdges.filter((p) => /JOURNAL/i.test(String(p))).length}`);

eqJ(removedFrom(EDGES),
  ["111", "IV", "VI", "vil", "7", "VIII", "IX", "X", "XI", "Il", "XIII", "XIV",
   "m", "XV", "13", "I", "XVI", "mmm", "i", "5,,", "11", "2364"],
  "DEFECT: the 22 lines it does remove — ten of them chapter numbers, one a French pronoun");

const removedReal = removedFrom(EDGES);
const chapters = ["IV", "VI", "VIII", "IX", "X", "XI", "XIII", "XIV", "XV", "XVI"];
chk(chapters.every((c) => removedReal.includes(c)),
  "DEFECT: every chapter number in the run is destroyed",
  chapters.filter((c) => !removedReal.includes(c)).join(",") || "all ten gone");
chk(removedReal.includes("Il"),
  "DEFECT: \"Il\" — the French pronoun ending page 327 mid-sentence — is destroyed as a folio");
chk(!removedReal.some((l) => /JOURNAL/i.test(l)),
  "DEFECT: not one of the removed lines is the running head this was written to remove");

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
chk(removedFrom(EDGES).length === 22, "and 22 lines from the 530-page corpus, not 22,000");
chk(EDGES.join("").length === 86016 && strippedEdges.join("").length === 85943,
  "the 530-page corpus goes from 86,016 characters to 85,943 — 73 gone, not 86,016",
  `${EDGES.join("").length} -> ${strippedEdges.join("").length}`);

console.log("\n## C2. Real chapter text, with the heading it loses");

const CHAP = loadPages("running-heads-lejournal.txt", "chapter-iv");
chk(CHAP.length === 6, "fixture loaded", `${CHAP.length} pages`);
const chapBefore = oldPagesToText(CHAP), chapAfter = pagesToText(CHAP);
eq(chapBefore.slice(chapBefore.indexOf("boude Monsieur"), chapBefore.indexOf("boude Monsieur") + 45),
  "boude Monsieur...\nIV\n26 septembre.\nDepuis une", "before: the chapter opens \"IV\" then the diary date");
eq(chapAfter.slice(chapAfter.indexOf("boude Monsieur"), chapAfter.indexOf("boude Monsieur") + 42),
  "boude Monsieur...\n26 septembre.\nDepuis une", "DEFECT after: the chapter number is gone, the date is not");
eqJ(removedFrom(CHAP),
  ["LE JOURNAL D'UNE FEMME DE CHAMBRE 87", "IV", "90 LE JOURNAL D'UNE FEMME DE CHAMBRE",
   "LE JOURNAL D'UNE FEMME DE CHAMBRE . »("],
  "three heads and one chapter number");

console.log("\n## D. DEFECT — where the recurrence rule destroys real text");
/* The bar is Math.max(3, floor(pages * 0.25)), so for any document of
   twelve pages or fewer THREE occurrences at a page edge is enough.

   The filler prose below is deliberately worded differently on every
   page. Numbering the pages "page 1", "page 2" would not do it: norm()
   erases digits before comparing, so those lines are the SAME line to
   this code and the document would be gutted for a second reason,
   masking the one under test. That second reason is real and is asserted
   on its own at the end of this section. */
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
eqJ(removedFrom(versePages), [REFRAIN, REFRAIN, REFRAIN],
  "DEFECT: a refrain closing three pages of a twelve-page pamphlet is deleted as furniture");

/* The same refrain, the same three times, in a longer book: kept. The
   rule is not "is this furniture", it is "how long is the document" --
   which is the same reason it misses the head of the real 530-page
   scan, at the other end of the scale. */
const longVerse = versePages.concat(Array.from({ length: 28 }, (_, i) => fillerPage(i + 12)));
eqJ(removedFrom(longVerse), [],
  "…and survives untouched in a forty-page one, three occurrences and all");

const playPages = Array.from({ length: 10 }, (_, i) =>
  page(i % 3 === 0 ? "MACBETH." : `${NTH[i].toUpperCase()} MURDERER.`, filler(i, 1), filler(i, 2), filler(i, 3)));
eqJ(removedFrom(playPages), ["MACBETH.", "MACBETH.", "MACBETH.", "MACBETH."],
  "DEFECT: a speaker name heading four pages of a ten-page scene is deleted");

const letterPages = Array.from({ length: 8 }, (_, i) =>
  page(i % 3 === 0 ? "My dear Sir," : filler(i, 0), filler(i, 1), filler(i, 2), filler(i, 3)));
eqJ(removedFrom(letterPages), ["My dear Sir,", "My dear Sir,", "My dear Sir,"],
  "DEFECT: the salutation opening three letters in a collection is deleted");

/* Digits are erased before comparing -- deliberately, so "10 LE JOURNAL"
   and "14 LE JOURNAL" count as the same line. The cost is that any two
   lines differing only in a number are the same line too. The book this
   was written for is a DIARY: every entry opens with a date. */
const MONTHS = ["septembre", "octobre", "novembre"];
const diaryPages = Array.from({ length: 12 }, (_, i) =>
  page(`${i + 3} ${MONTHS[i % 3]}.`, filler(i, 1), filler(i, 2), filler(i, 3)));
eqJ(removedFrom(diaryPages),
  ["3 septembre.", "4 octobre.", "5 novembre.", "6 septembre.", "7 octobre.", "8 novembre.",
   "9 septembre.", "10 octobre.", "11 novembre.", "12 septembre.", "13 octobre.", "14 novembre."],
  "DEFECT: every date in a twelve-entry diary is deleted — \"3 septembre.\" and \"18 septembre.\" are one line once the digits go");

console.log("\n## E. DEFECT — isFolio() against real words");
/* /^[\s.,\-–—]*(?:[ivxlcdm]{1,7}|\d{1,4})[\s.,\-–—]*$/i
   matches ANY line built only from the letters i v x l c d m, up to
   seven of them. Plenty of real words are. No recurrence is required and
   no threshold applies: one page ending on the word is enough. */

const docWithLastLine = (word) => Array.from({ length: 6 }, (_, i) =>
  page(filler(i, 0), filler(i, 1), filler(i, 2), i === 2 ? word : filler(i, 3)));
for (const w of ["did", "mix", "civil", "mild", "vivid", "livid", "Il", "MIX"]) {
  eqJ(removedFrom(docWithLastLine(w)), [w], `DEFECT: a page ending on the single word "${w}" loses it`);
}
/* Anti-vacuity: it is not eating every short line. */
for (const w of ["the", "and", "was", "sept", "mixed", "Yes", "No."]) {
  eqJ(removedFrom(docWithLastLine(w)), [], `…but a page ending on "${w}" keeps it`);
}

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

console.log("\n## G. The old pipeline — which of these bugs were real");
/* Section F of check-import-whitespace.mjs in spirit: run the code as it
   stood before the rescued commit and show what it did. If these pass,
   the bug was real. The uncomfortable one is the last: for the running
   head, the old and new outputs are identical on the real book. */

chk(oldPagesToText(REPORTED).includes("»Avex?..*\n10 LE JOURNAL D'UNE FEMME DE CHAMBRE\nIl me poussa"),
  "old: the running head really did land in the middle of the reported sentence");
chk(oldPagesToText(CHAP).includes("boude Monsieur...\nIV\n26 septembre."),
  "old: the chapter number \"IV\" was in the text, where it belongs");
const oldFull = oldPagesToText(EDGES), newFull = pagesToText(EDGES);
const oi = oldFull.indexOf("»Avex?..*"), ni = newFull.indexOf("»Avex?..*");
eq(newFull.slice(ni, ni + 60), oldFull.slice(oi, oi + 60),
  "DEFECT: on the real 530-page book, old and new read identically at the reported passage");
chk(oldFull.length - newFull.length === 73,
  "the whole fix is worth 73 characters across 530 pages — and they are the wrong 73",
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
