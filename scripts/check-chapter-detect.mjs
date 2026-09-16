#!/usr/bin/env node
/* Chapter detection for imported texts — src/assets/js/engine/chapter-detect.js.

   A custom text can now be read the way a library book is read: by
   chapter, six paragraphs to a page. Everything downstream of that —
   the chapter picker on /custom/, the reader header, auto-advance,
   bookProgress — is built on this one function being right about where
   the chapters are. It runs in the browser on a document nobody has
   seen before, so it gets a gate of its own that needs no browser.

   WHAT EACH SECTION IS FOR, and why "3 chapters" is never the whole
   assertion:

     A. Markdown. `#`, `##`, `###` are what a .md file uses and what no
        Gutenberg plain text ever does. Titles are asserted exactly,
        including that the hashes are gone from them.
     B. CHAPTER I / II / III — the commonest shape there is, and the
        shape the bundled Alice sample has.
     C. Bare roman numerals as the only marker.
     D. A table of contents that lists all four chapters must NOT
        become four chapters of its own. Asserted by COUNT and by
        BODY: the first chapter's body has to be the prose, not the
        contents listing.
     E. A document with no headings at all is one chapter called
        "Full text" — not zero chapters, and not a split invented out
        of paragraph breaks.

   ANTI-VACUITY, which is the point of the file. A detector that
   returned [] , or one that returned the right titles with empty
   bodies, would satisfy a count. So every section that asserts titles
   also asserts that THE TEXT SURVIVED: each sentence that went in comes
   back out, in one chapter, exactly once. Section F does the same for
   paragraphsOf — the ids are checked, and so is the text under them.

   Usage:  node scripts/check-chapter-detect.mjs      (no build, no server)
*/
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

let pass = 0, fail = 0;
const chk = (ok, name, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
const eq = (got, want, name) =>
  chk(got === want, name, got === want ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err && err.message ? err.message : err}`);
  console.log("\nRUN ABORTED — the counts below are partial.");
  process.exit(1);
});

/* The module under test may not exist — that is exactly the state a
   verifier puts the tree in when it reverts src/ — so a missing import
   has to be a loud failure and not a stack trace with exit code 1 that
   could be mistaken for an environment problem. */
const MOD = resolve("src/assets/js/engine/chapter-detect.js");
let detectChapters, paragraphsOf, buildChapters, FULL_TEXT_TITLE, OPENING_TITLE;
try {
  const m = await import(pathToFileURL(MOD).href);
  ({ detectChapters, paragraphsOf, buildChapters, FULL_TEXT_TITLE, OPENING_TITLE } = m);
} catch (e) {
  console.log(`  FAIL  src/assets/js/engine/chapter-detect.js could not be imported — ${e.message}`);
  console.log("\nRUN ABORTED — the module this gate exists for is not there.");
  process.exit(1);
}
for (const [name, fn] of [["detectChapters", detectChapters], ["paragraphsOf", paragraphsOf], ["buildChapters", buildChapters]]) {
  if (typeof fn !== "function") {
    console.log(`  FAIL  chapter-detect.js does not export ${name}()`);
    console.log("\nRUN ABORTED — nothing to test.");
    process.exit(1);
  }
}

/* Prose long enough to clear the 80-character minimum body and the
   400-character "this head is followed by a real chapter" rescue in the
   contents filter. Each block is uniquely marked so it can be traced to
   the chapter it ended up in. */
const para = (mark) =>
  `Sentence ${mark} opens the passage. ` +
  `The keeper walked the long corridor while the lamps guttered and the rain kept on against the glass. ` +
  `Nothing in the house moved, and the clock in the hall counted out the hour without hurry or complaint. ` +
  `Later, when the fire had burned down, the dog raised its head and listened to something out beyond the wall.`;
const chapterBody = (mark) => `${para(mark + "a")}\n\n${para(mark + "b")}`;

/* Every marker appears in exactly one chapter, and every chapter body
   is non-empty. This is what stops an empty-bodied pass. */
function assertNothingLost(chapters, markers, label) {
  const joined = chapters.map((c) => c.body).join("\n\n");
  const missing = markers.filter((m) => !joined.includes(`Sentence ${m} opens`));
  chk(missing.length === 0, `${label}: every paragraph that went in came back`,
    missing.length ? `missing ${missing.join(", ")}` : `${markers.length} markers`);
  const dupes = markers.filter((m) =>
    chapters.filter((c) => c.body.includes(`Sentence ${m} opens`)).length !== 1);
  chk(dupes.length === 0, `${label}: no paragraph landed in two chapters`,
    dupes.length ? dupes.join(", ") : "");
  const empty = chapters.filter((c) => !c.body || !c.body.trim()).length;
  chk(empty === 0, `${label}: no chapter came back with an empty body`, empty ? `${empty} empty` : "");
}

const titles = (chs) => chs.map((c) => c.title);

// ───────────────────────────────────────────── A. markdown headings
console.log("\n## A. Markdown headings — #, ##, ###");
{
  const md = [
    "# Introduction",
    "",
    chapterBody("1"),
    "",
    "## The Middle Part",
    "",
    chapterBody("2"),
    "",
    "### A Smaller Section ###",
    "",
    chapterBody("3"),
    "",
  ].join("\n");
  const chs = detectChapters(md);
  eq(chs.length, 3, "A. three markdown headings make three chapters");
  eq(JSON.stringify(titles(chs)),
    JSON.stringify(["Introduction", "The Middle Part", "A Smaller Section"]),
    "A. the titles are the heading text with the hashes stripped");
  chk(chs[0].body.startsWith("Sentence 1a opens"),
    "A. chapter one's body starts after its heading line, not with it",
    JSON.stringify(chs[0].body.slice(0, 30)));
  chk(!chs.some((c) => c.body.includes("#")),
    "A. no heading line survived into a body");
  assertNothingLost(chs, ["1a", "1b", "2a", "2b", "3a", "3b"], "A");
}

// ───────────────────────────────────────── B. CHAPTER I / II / III
console.log("\n## B. CHAPTER I. / CHAPTER II. / CHAPTER III.");
{
  const txt = [
    "CHAPTER I.", "", chapterBody("1"), "",
    "CHAPTER II.", "", chapterBody("2"), "",
    "CHAPTER III.", "", chapterBody("3"), "",
  ].join("\n");
  const chs = detectChapters(txt);
  eq(chs.length, 3, "B. three chapters");
  eq(JSON.stringify(titles(chs)),
    JSON.stringify(["CHAPTER I.", "CHAPTER II.", "CHAPTER III."]),
    "B. titles come back as the document wrote them");
  chk(chs[1].body.startsWith("Sentence 2a opens"),
    "B. chapter two's body is chapter two's prose", JSON.stringify(chs[1].body.slice(0, 30)));
  assertNothingLost(chs, ["1a", "1b", "2a", "2b", "3a", "3b"], "B");
}

// ───────────────────────────────────── C. bare roman numeral heads
console.log("\n## C. Roman numerals alone on a line");
{
  const txt = [
    "I", "", chapterBody("1"), "",
    "II", "", chapterBody("2"), "",
    "III", "", chapterBody("3"), "",
  ].join("\n");
  const chs = detectChapters(txt);
  eq(chs.length, 3, "C. three roman-numeral heads make three chapters");
  eq(JSON.stringify(titles(chs)), JSON.stringify(["I", "II", "III"]),
    "C. the numerals are the titles");
  assertNothingLost(chs, ["1a", "1b", "2a", "2b", "3a", "3b"], "C");
}

// ─────────────────────────────── D. a contents page must not split
console.log("\n## D. A table of contents is not four chapters");
{
  const txt = [
    "CONTENTS",
    "",
    "CHAPTER I. THE BEGINNING",
    "CHAPTER II. THE MIDDLE",
    "CHAPTER III. THE ENDING",
    "CHAPTER IV. THE AFTERWARD",
    "",
    "CHAPTER I. THE BEGINNING", "", chapterBody("1"), "",
    "CHAPTER II. THE MIDDLE", "", chapterBody("2"), "",
    "CHAPTER III. THE ENDING", "", chapterBody("3"), "",
    "CHAPTER IV. THE AFTERWARD", "", chapterBody("4"), "",
  ].join("\n");
  const chs = detectChapters(txt);
  eq(chs.length, 4, "D. four chapters, not eight and not nine");
  eq(JSON.stringify(titles(chs)),
    JSON.stringify(["CHAPTER I. THE BEGINNING", "CHAPTER II. THE MIDDLE",
                    "CHAPTER III. THE ENDING", "CHAPTER IV. THE AFTERWARD"]),
    "D. the titles are the chapters', once each");
  /* The count alone is satisfied by dropping the REAL first chapter
     and keeping the contents entry — which is the exact mistake the
     rescue clause in the cluster filter exists to prevent. So look at
     the body. */
  chk(chs[0].body.startsWith("Sentence 1a opens"),
    "D. chapter one's body is the prose, not the contents listing",
    JSON.stringify(chs[0].body.slice(0, 40)));
  chk(!chs.some((c) => c.title === "CONTENTS" || c.body.includes("CHAPTER IV. THE AFTERWARD\nCHAPTER")),
    "D. the contents block itself is not offered as a chapter");
  chk(!chs.some((c) => c.title === OPENING_TITLE),
    "D. and it does not come back as an ‘Opening’ chapter either",
    JSON.stringify(titles(chs)));
  assertNothingLost(chs, ["1a", "1b", "2a", "2b", "3a", "3b", "4a", "4b"], "D");
}

// ─────────────────────────────────────── E. no headings at all
console.log("\n## E. A document with no headings");
{
  const txt = [para("1a"), para("1b"), para("1c")].join("\n\n");
  const chs = detectChapters(txt);
  eq(chs.length, 1, "E. exactly one chapter — not zero, not one per paragraph");
  eq(chs[0].title, "Full text", "E. it is titled ‘Full text’");
  eq(FULL_TEXT_TITLE, "Full text", "E. the exported constant says the same thing");
  eq(chs[0].body, txt.trim(), "E. its body is the whole document, unchanged");
  // A single heading is still "fewer than two chapters".
  const one = detectChapters(["CHAPTER I.", "", chapterBody("2")].join("\n"));
  eq(one.length, 1, "E. one heading alone is still one chapter");
  eq(one[0].title, "Full text", "E. …and it is the ‘Full text’ chapter");
  chk(one[0].body.includes("CHAPTER I."),
    "E. …whose body keeps the heading line, because nothing was split on it");
  // Empty input must not throw and must not return [].
  const none = detectChapters("");
  eq(none.length, 1, "E. empty input returns one chapter rather than throwing");
  eq(none[0].body, "", "E. …with an empty body");
}

// ───────────── F. text before the first heading is the user's text
console.log("\n## F. Text above the first heading is kept");
{
  const txt = [
    para("0a"), "",
    "CHAPTER I.", "", chapterBody("1"), "",
    "CHAPTER II.", "", chapterBody("2"), "",
  ].join("\n");
  const chs = detectChapters(txt);
  eq(chs.length, 3, "F. the preamble is a chapter of its own");
  eq(chs[0].title, "Opening", "F. it is titled ‘Opening’");
  eq(OPENING_TITLE, "Opening", "F. the exported constant says the same thing");
  chk(chs[0].body.startsWith("Sentence 0a opens"),
    "F. and it holds the words that were above the first heading",
    JSON.stringify(chs[0].body.slice(0, 30)));
  assertNothingLost(chs, ["0a", "1a", "1b", "2a", "2b"], "F");
}

// ─────────────────────────────────────────────── G. paragraphsOf
console.log("\n## G. paragraphsOf — blank lines split, 500 chars cap, p0…pN ids");
{
  const body = `${para("1a")}\n\n${para("1b")}\n\n\n${para("1c")}`;
  const ps = paragraphsOf(body);
  chk(ps.length >= 3, "G. blank lines separate paragraphs", `${ps.length} paragraphs`);
  eq(JSON.stringify(ps.slice(0, 3).map((p) => p.id)), JSON.stringify(["p0", "p1", "p2"]),
    "G. ids are positional — p0, p1, p2");
  eq(ps[0].text, para("1a"), "G. the first paragraph is exactly what went in");
  const over = ps.filter((p) => p.text.length > 500);
  chk(over.length === 0, "G. no paragraph exceeds 500 characters",
    over.length ? `longest ${Math.max(...over.map((p) => p.text.length))}` : "");
  // A single 1,600-character paragraph has to be cut, and the cut must
  // not lose or duplicate a word.
  const long = Array.from({ length: 8 }, (_, i) => `This is sentence number ${i} and it runs along for a while before it finally stops.`).join(" ");
  const cut = paragraphsOf(long);
  chk(cut.length > 1, "G. an over-long paragraph is split", `${cut.length} pieces`);
  eq(cut.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim(), long.replace(/\s+/g, " ").trim(),
    "G. …and the pieces rejoin into exactly the original");
  eq(JSON.stringify(cut.map((p) => p.id)),
    JSON.stringify(cut.map((_, i) => `p${i}`)), "G. …with ids still positional");
  eq(JSON.stringify(paragraphsOf("")), "[]", "G. empty body gives no paragraphs");
}

// ───────────────────────────────── H. buildChapters — the book shape
console.log("\n## H. buildChapters — the same shape as src/data/books/*.json");
{
  const txt = [
    "CHAPTER I.", "", chapterBody("1"), "",
    "CHAPTER II.", "", chapterBody("2"), "",
  ].join("\n");
  const chs = buildChapters(txt);
  eq(chs.length, 2, "H. two chapters");
  eq(JSON.stringify(Object.keys(chs[0])), JSON.stringify(["title", "paragraphs"]),
    "H. a chapter is {title, paragraphs} and nothing else");
  eq(JSON.stringify(Object.keys(chs[0].paragraphs[0])), JSON.stringify(["id", "text"]),
    "H. a paragraph is {id, text} and nothing else");
  eq(chs[0].paragraphs.length, 2, "H. chapter one has its two paragraphs");
  eq(chs[0].paragraphs[0].id, "p0", "H. paragraph ids restart per chapter");
  eq(chs[1].paragraphs[0].id, "p0", "H. …in chapter two as well");
  eq(chs[1].paragraphs[1].text, para("2b"), "H. and the text under them is the document's");
  // Given a list the parser already knows (an EPUB's spine), the
  // detector is not run at all and the parser's titles are kept.
  const fromList = buildChapters([
    { title: "Spine One", body: chapterBody("9") },
    { title: "Spine Two", body: para("9c") },
  ]);
  eq(JSON.stringify(fromList.map((c) => c.title)), JSON.stringify(["Spine One", "Spine Two"]),
    "H. a parser-supplied chapter list keeps its own titles");
  eq(fromList[0].paragraphs.length, 2, "H. …and is paragraphed the same way");
  eq(JSON.stringify(buildChapters([])), "[]", "H. an empty list builds nothing");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
