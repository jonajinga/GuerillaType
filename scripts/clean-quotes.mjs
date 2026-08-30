#!/usr/bin/env node
/* Clean the quotation corpus.

   Same two-batch seam as the idiom and poem files: 117 groups of
   duplicated text, most under the same author and a few under
   conflicting ones.

   The conflicts matter more than the redundancy. A quotation corpus
   that attributes one line to two different people is wrong in at least
   one place, and all three cases here are well-known misattributions
   rather than genuine scholarly disputes.

   Run: node scripts/clean-quotes.mjs [--write]   (default is a dry run) */

import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/data/quotes.json";
const WRITE = process.argv.includes("--write");
const a = JSON.parse(readFileSync(FILE, "utf8"));

const ACCENTS = { "à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","ç":"c","è":"e","é":"e","ê":"e","ë":"e",
  "ì":"i","í":"i","î":"i","ï":"i","ñ":"n","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o",
  "ù":"u","ú":"u","û":"u","ü":"u","ý":"y","ÿ":"y","æ":"ae","œ":"oe","ß":"ss" };
/* Text only. Author names keep their diacritics -- nobody types the
   attribution, and stripping accents from a person's name to no purpose
   is worse than leaving it. */
const asciify = (s) => String(s || "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/—/g, "--").replace(/–/g, "-").replace(/…/g, "...")
  .replace(/[À-ɏ]/g, (c) => ACCENTS[c.toLowerCase()] || c);

/* Where one line is filed under two names, the better-supported
   attribution wins. All three are documented misattributions:
     - the "excellence is a habit" line is Will Durant's own summary of
       Aristotle in The Story of Philosophy (1926); Aristotle did not
       write it
     - the thousand-mile line is Tao Te Ching ch. 64, so Lao Tzu is the
       more precise credit than "Chinese Proverb"
     - "the best way to predict the future" cannot be Lincoln; it is
       attributed to Drucker (and to Alan Kay) */
const PREFERRED = new Map([
  ["we are what we repeatedly do excellence then is not an act but a habit", "Will Durant"],
  ["a journey of a thousand miles begins with a single step", "Lao Tzu"],
  ["the best way to predict the future is to create it", "Peter Drucker"],
  ["the best way to predict the future is to invent it", "Peter Drucker"],
]);

const key = (q) => String(q.text || "").replace(/\s+/g, " ").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");

const groups = new Map();
for (const q of a) {
  const k = key(q);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(q);
}

const kept = [];
let mergedSame = 0, resolved = [];
for (const [k, members] of groups) {
  const authors = [...new Set(members.map((m) => String(m.author || "").trim()))];
  let winner = members[0];
  if (authors.length > 1) {
    const want = PREFERRED.get(k);
    const match = want && members.find((m) => String(m.author || "").trim() === want);
    winner = match || members.slice().sort((x, y) => String(y.text).length - String(x.text).length)[0];
    resolved.push(`${authors.join(" / ")}  ->  ${winner.author}${want ? "" : "  (NO RULE -- longest kept)"}`);
  } else if (members.length > 1) mergedSame++;
  kept.push({ ...winner, tags: [...new Set(members.flatMap((m) => m.tags || []))] });
}

/* Song lyrics from works still in copyright. Brief quotation of prose
   is ordinary practice for a quote collection; reproducing lyrics is
   not, and music publishers pursue it far more actively than book
   publishers pursue a sentence of prose.

   The "lyrics" tag found only three of these. Two more Lennon lines
   were filed under ordinary topic tags, so the tag is not a reliable
   handle and the list is explicit instead. */
const LYRICS = new Set([
  "q-dylan-blowing",                                    // Blowin' in the Wind, 1962
  "q-cohen-crack",                                      // Anthem, 1992
  "q-lennon-imagine",                                   // Imagine, 1971
  "q-john-lennon-imagine-all-the-people-living-life-in-pe",  // Imagine, 1971 (untagged)
  "q-john-lennon-life-is-what-happens-when-youre-busy-mak",  // Beautiful Boy, 1980 (untagged)
]);
const lyricsDropped = kept.filter((q) => LYRICS.has(q.id));
for (const q of lyricsDropped) kept.splice(kept.indexOf(q), 1);

/* An attribution nobody can check is not an attribution. One entry was
   filed under "Anonymous" -- a generic motivational aphorism rather
   than a notable quotation, so it goes rather than the invariant being
   softened to accommodate it. */
const before = kept.length;
const anonymous = kept.filter((q) => /^(anonymous|unknown|n\/?a|various)$/i.test(String(q.author || "").trim()));
for (const q of anonymous) kept.splice(kept.indexOf(q), 1);

let folded = 0;
for (const q of kept) {
  const before = q.text;
  q.text = asciify(q.text).trim();
  if (q.text !== before) folded++;
}

console.log(`entries:                 ${a.length} -> ${kept.length}`);
console.log(`same-author duplicates merged: ${mergedSame}`);
console.log(`conflicting attributions resolved: ${resolved.length}`);
resolved.forEach((r) => console.log(`   ${r}`));
console.log(`song lyrics removed:     ${lyricsDropped.length}` + (lyricsDropped.length ? `  (${lyricsDropped.map((q) => q.id.slice(0, 22)).join(", ")})` : ""));
console.log(`unattributed removed:    ${anonymous.length}` + (anonymous.length ? `  (${anonymous.map((q) => q.id).join(", ")})` : ""));
console.log(`texts folded to ASCII:   ${folded}`);
console.log(`untypeable remaining:    ${kept.filter((q) => /[^\x20-\x7E]/.test(q.text)).length}`);

if (WRITE) {
  writeFileSync(FILE, JSON.stringify(kept, null, 2) + "\n");
  console.log(`\nWROTE ${FILE}`);
} else {
  console.log(`\n(dry run -- pass --write to apply)`);
}
