#!/usr/bin/env node
/* Guards the library's chapter splitting.

   Two bugs this pins down, both of which were invisible in the UI
   because the reader numbers chapters by position, so a book that had
   silently lost one just looked like a shorter book:

   1. A chapter head written as a bare label ("CHAPTER I.") with its
      title on the next line left that title in the body as a stray
      one-line paragraph the reader asked you to type, and stripped the
      chapter's own title to empty.
   2. A contents page ending within 8 lines of the book's first chapter
      head swept that head into the contents run and dropped it, losing
      chapter one outright.

   It also guards something that has already gone wrong once: the data
   under src/data/books/ is NOT the output of ingest-books.mjs alone. It
   is the output of a pipeline --

     ingest-books -> polish-books -> fix-book-metadata
                  -> patch-meta-batch4..7

   -- and committing raw ingest output silently reverts curated
   metadata. When that happened it cost 115 books their author, 74 their
   title, and left 2,689 chapter titles blank, and every browser gate
   still passed because none of them looks at an author or a chapter
   title. The two zero-tolerance checks at the bottom are the cheapest
   thing that catches it: raw ingest output cannot satisfy them.

   No browser needed -- this reads the committed data.

   Usage: node scripts/check-book-chapters.mjs */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

const DATA = resolve("src/data/books");
const read = (slug) => {
  try { return JSON.parse(readFileSync(`${DATA}/${slug}.json`, "utf8")); }
  catch { return null; }
};

/* Chapter counts that are checkable facts about the book, not whatever
   the parser currently emits. Where the ingest also emits a
   front-matter section the expected number says so. */
const EXPECTED = [
  { slug: "alice-in-wonderland", chapters: 12, firstTitle: "Down the Rabbit-Hole" },
  { slug: "a-tale-of-two-cities", chapters: 45 },
  { slug: "sign-of-four", chapters: 12 },
  { slug: "call-of-the-wild", chapters: 7 },
];

for (const want of EXPECTED) {
  const book = read(want.slug);
  if (!book) { chk(false, `${want.slug}: data file present`); continue; }
  chk(book.chapters.length === want.chapters, `${want.slug}: ${want.chapters} chapters`,
    `got ${book.chapters.length}`);
  if (want.firstTitle) {
    const t = (book.chapters[0] || {}).title || "";
    chk(t === want.firstTitle, `${want.slug}: opens with the right chapter`,
      JSON.stringify(t));
  }
  const blank = book.chapters.filter((c) => !String(c.title || "").trim()).length;
  chk(blank === 0, `${want.slug}: every chapter is titled`, `${blank} blank`);
  // A first paragraph that is short with no terminal punctuation is a
  // heading that leaked into the body.
  const leaked = book.chapters.filter((c) => {
    const t = ((c.paragraphs || [])[0] || {}).text || "";
    return t.length > 0 && t.length < 60 && !/[.!?]$/.test(t);
  });
  chk(leaked.length === 0, `${want.slug}: no heading left in the body`,
    leaked.length ? `${leaked.length} chapter(s)` : "");
}

/* Corpus-wide floors. Absolute numbers rather than ratios so a
   regression cannot hide behind a growing library -- if these move,
   someone changed the parser and should say why. */
const index = (() => {
  try { return JSON.parse(readFileSync(resolve("src/data/library.json"), "utf8")); }
  catch { return []; }
})();
chk(index.length > 0, "library index readable", `${index.length} books`);

let allBlank = 0, totalChapters = 0, unknownAuthors = 0, blankTitles = 0;
for (const row of index) {
  const book = read(row.slug);
  if (!book) continue;
  totalChapters += book.chapters.length;
  const blank = book.chapters.filter((c) => !String(c.title || "").trim()).length;
  blankTitles += blank;
  if (blank === book.chapters.length && book.chapters.length > 1) allBlank++;
  if (!book.author || book.author === "Unknown") unknownAuthors++;
}
/* Zero tolerance, both of them. The polish and metadata stages leave no
   blank chapter title and no unknown author anywhere in the corpus, so
   any number above zero means the data was regenerated without them. An
   earlier version of this gate allowed up to 21 untitled books, which
   baked exactly that regression in as acceptable. */
chk(allBlank === 0, "no book has untitled chapters", `${allBlank} book(s)`);
chk(unknownAuthors === 0, "no book has an unknown author", `${unknownAuthors} book(s)`);
chk(blankTitles === 0, "no chapter anywhere is untitled", `${blankTitles} chapter(s)`);
// Floor, not an equality -- more books may be added.
chk(totalChapters >= 11904, "corpus chapter count has not gone backwards", `${totalChapters}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
