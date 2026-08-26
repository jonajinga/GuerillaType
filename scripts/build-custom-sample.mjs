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

/* Site-wide rule: typeable content has no smart punctuation, so the
   characters are ones a keyboard actually produces. */
const asciify = (s) => s
  .replace(/—/g, "--").replace(/–/g, "-")
  .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/…/g, "...");

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
  .replace(/^\s*\[Illustration[^\]]*\]\s*$/gim, "")
  .replace(/_([^_\n]+)_/g, "$1");

// Rejoin hard-wrapped lines into paragraphs.
const paras = text.split(/\n\s*\n/)
  .map((p) => p.replace(/\s+/g, " ").trim())
  .filter(Boolean);

text = asciify(paras.join("\n\n"));

// Guard rails. A sample that ships with licence boilerplate in it, or
// with characters nobody can type, is worse than no sample.
const leaked = /PROJECT GUTENBERG|MILLENNIUM FULCRUM|www\.gutenberg\.org/i.exec(text);
if (leaked) throw new Error(`Boilerplate leaked into the sample: ${leaked[0]}`);
const smart = text.match(/[‘’“”–—…]/g);
if (smart) throw new Error(`${smart.length} smart-punctuation characters survived asciify`);
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
