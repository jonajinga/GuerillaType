#!/usr/bin/env node
/* Builds src/data/custom-sample.json — the full public-domain book that
   /custom/ seeds as its sample text.

   Source is src/content/books/alice-in-wonderland.txt, the Project
   Gutenberg plain text already bundled with this site. This does NOT
   reuse src/data/books/alice-in-wonderland.json: that file is built for
   the book reader and its chapter split is off by one (its "Chapter 1"
   opens with chapter 2's title and it has 11 chapters, not 12), so it
   would seed a sample missing the opening.

   What it strips: the Gutenberg header and licence footer, the title /
   edition / contents front matter, [Illustration] markers, and the
   underscores the plain text uses for italics — typeable, but noise.
   Chapter headings are KEPT, so searching the picker for "CHAPTER VII"
   lands you there.

   Usage: node scripts/build-custom-sample.mjs   (also runs in prebuild) */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SRC = resolve("src/content/books/alice-in-wonderland.txt");
const OUT = resolve("src/data/custom-sample.json");

/* Same fold the site's own book pipeline uses (ingest-books.mjs), so the
   sample and the library's copy of this book agree. The typing engine
   compares characters exactly -- no folding at type time -- so a single
   accented letter is a wall a US-keyboard user cannot get past. */
const ACCENT_MAP = {
  "À":"A","Á":"A","Â":"A","Ã":"A","Ä":"A","Å":"A",
  "à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a",
  "Ç":"C","ç":"c",
  "È":"E","É":"E","Ê":"E","Ë":"E",
  "è":"e","é":"e","ê":"e","ë":"e",
  "Ì":"I","Í":"I","Î":"I","Ï":"I",
  "ì":"i","í":"i","î":"i","ï":"i",
  "Ñ":"N","ñ":"n",
  "Ò":"O","Ó":"O","Ô":"O","Õ":"O","Ö":"O","Ø":"O",
  "ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o",
  "Ù":"U","Ú":"U","Û":"U","Ü":"U",
  "ù":"u","ú":"u","û":"u","ü":"u",
  "Ý":"Y","ý":"y","ÿ":"y","Æ":"AE","æ":"ae","Œ":"OE","œ":"oe","ß":"ss",
};

/* Site-wide rule: typeable content has no smart punctuation, so the
   characters are ones a keyboard actually produces. */
const asciify = (s) => s
  .replace(/—/g, "--").replace(/–/g, "-")
  .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/…/g, "...")
  .replace(/[À-ſ]/g, (c) => ACCENT_MAP[c] || c);

const raw = await readFile(SRC, "utf8");
const lines = raw.split(/\r?\n/);

const startMarker = lines.findIndex((l) => /^\*\*\* START OF THE PROJECT GUTENBERG/.test(l));
const endMarker = lines.findIndex((l) => /^\*\*\* END OF THE PROJECT GUTENBERG/.test(l));
if (startMarker < 0 || endMarker < 0 || endMarker <= startMarker) {
  throw new Error("Could not find the Gutenberg start/end markers — refusing to guess.");
}

// Front matter sits between the start marker and the first chapter head.
const inner = lines.slice(startMarker + 1, endMarker);
const firstChapter = inner.findIndex((l) => /^CHAPTER I\.\s*$/.test(l));
if (firstChapter < 0) throw new Error("Could not find 'CHAPTER I.' — refusing to guess.");

let body = inner.slice(firstChapter);
const theEnd = body.findIndex((l) => /^THE END\s*$/.test(l));
if (theEnd >= 0) body = body.slice(0, theEnd + 1);

let text = body.join("\n")
  .replace(/^\s*\[Illustration[^\]]*\]\s*$/gim, "");

// Rejoin hard-wrapped lines into paragraphs FIRST. Stripping the
// Gutenberg italics markers before this missed every _span that
// crossed a line break_, and shipped those underscores as text.
const paras = text.split(/\n\s*\n/)
  .map((p) => p.replace(/\s+/g, " ").trim())
  .filter(Boolean);

text = asciify(paras.join("\n\n")).replace(/_([^_\n]+)_/g, "$1");

// Guard rails. A sample that ships with licence boilerplate in it, or
// with characters nobody can type, is worse than no sample.
const leaked = /PROJECT GUTENBERG|MILLENNIUM FULCRUM|www\.gutenberg\.org/i.exec(text);
if (leaked) throw new Error(`Boilerplate leaked into the sample: ${leaked[0]}`);
/* This used to test for [''""--...] -- exactly the class asciify had
   just removed -- so it could not fire, and an accented letter sailed
   through it. Assert the property that actually matters: every
   character is one a plain keyboard produces. */
const untypeable = [...new Set(text.replace(/[\n\t]/g, "").split("").filter((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126))];
if (untypeable.length) {
  throw new Error(`${untypeable.length} untypeable character(s) survived: ${JSON.stringify(untypeable.join(""))}`);
}
const strays = text.match(/_/g);
if (strays) throw new Error(`${strays.length} italics underscore(s) survived`);
const chapters = (text.match(/^CHAPTER [IVX]+\./gm) || []).length;
if (chapters !== 12) throw new Error(`Expected 12 chapter headings, found ${chapters}`);
if (text.length < 100000) throw new Error(`Only ${text.length} characters — that is not the whole book`);

/* Content-derived, so changing the sample changes the version without
   anyone having to remember to bump one. /custom/ compares this against
   the copy a browser already seeded and replaces it when they differ. */
const version = createHash("sha256").update(text).digest("hex").slice(0, 12);

await writeFile(OUT, JSON.stringify({
  version,
  title: "Alice's Adventures in Wonderland",
  author: "Lewis Carroll",
  year: "1865",
  source: "Project Gutenberg",
  chars: text.length,
  text,
}, null, 0) + "\n", "utf8");

console.log(`[custom-sample] ${text.length.toLocaleString()} chars, ${paras.length} paragraphs, ${chapters} chapters, v=${version} -> src/data/custom-sample.json`);
