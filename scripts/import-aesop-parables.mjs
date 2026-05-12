#!/usr/bin/env node
/* Populate src/data/parables.json from the 265 chapters in
   aesops-fables.json so the /parables/ surface and the random
   parable mode have a full fable library to draw from.

   Per fable:
     - title          chapter.title (preserved as-is)
     - text           all paragraphs except the moral, joined by space
     - moral          the trailing short paragraph if it looks like a
                      moral (< 180 chars, single short sentence)
     - source         "Aesop's Fables (V. S. Vernon Jones translation, public domain)"
     - tags           best-effort keyword extraction from the title
     - id             p-aesop-<slug-of-title>

   Re-runnable: skips fables whose slug or title is already in
   parables.json. */

import fs from "node:fs";

const BOOK = "src/data/books/aesops-fables.json";
const FILE = "src/data/parables.json";
const SOURCE = "Aesop's Fables (V. S. Vernon Jones translation, public domain)";

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim().replace(/\s+/g, "-")
    .replace(/^the-/, "")
    .slice(0, 60);
}

function pickTags(title) {
  // Very light keyword extraction from the title. Falls back to "fable".
  const t = title.toLowerCase();
  const tags = new Set();
  const ANIMAL = ["fox","wolf","lion","mouse","mice","crow","dog","cat","frog","ox","ass","donkey","sheep","goat","stag","hare","tortoise","goose","hen","cock","rooster","eagle","owl","raven","swan","fish","snake","viper","ant","grasshopper","bee","bull","horse","pig","boar","crab","bear","monkey","kid","calf","kite","lark","jackdaw","peacock","camel"];
  for (const a of ANIMAL) if (t.includes(a)) { tags.add("animals"); break; }
  if (/king|queen|prince|tyrant|crown|throne/.test(t)) tags.add("power");
  if (/farmer|shepherd|miller|fisherman|hunter/.test(t)) tags.add("labor");
  if (/wind|sun|river|sea|mountain|wood|tree/.test(t)) tags.add("nature");
  if (/gold|treasure|jewel|wealth|riches/.test(t)) tags.add("greed");
  if (!tags.size) tags.add("fable");
  return [...tags];
}

function bodyText(ch) {
  return (ch.paragraphs || [])
    .map((p) => typeof p === "string" ? p : (p && p.text) || "")
    .filter(Boolean);
}

function splitMoral(paragraphs) {
  if (!paragraphs.length) return { text: "", moral: null };
  const tail = paragraphs[paragraphs.length - 1].trim();
  // Real Aesop morals are short aphorisms. Reject anything that
  // looks like narrative or dialogue:
  //   - contains quote marks (almost always direct speech)
  //   - starts with "The X did Y" / "He/She/They..." (narration)
  //   - references a specific character ("the Fuller", "the Fox")
  //   - longer than 130 chars (real morals are tight)
  const NARRATIVE_START = /^(the\s+[a-z]+|he|she|they|then|so|and|but|on\s+hearing|when)\b/i;
  const HAS_QUOTE = /["“”]/;
  const HAS_CHARACTER_REF = /\bthe\s+(fox|wolf|lion|mouse|mice|crow|dog|cat|frog|ox|ass|donkey|sheep|goat|stag|hare|tortoise|goose|hen|cock|rooster|eagle|owl|raven|swan|fish|snake|viper|ant|grasshopper|bee|bull|horse|pig|boar|crab|bear|monkey|kid|calf|kite|lark|jackdaw|peacock|camel|farmer|shepherd|miller|fisherman|hunter|fuller|charcoal-burner|king|queen|tortoise)\b/i;
  const isMoral =
    tail.length >= 12 &&
    tail.length <= 130 &&
    paragraphs.length >= 2 &&
    /[.!?]$/.test(tail) &&
    (tail.match(/[.!?]/g) || []).length <= 2 &&
    /^[A-Z]/.test(tail) &&
    !HAS_QUOTE.test(tail) &&
    !NARRATIVE_START.test(tail) &&
    !HAS_CHARACTER_REF.test(tail);
  if (!isMoral) return { text: paragraphs.join(" "), moral: null };
  return { text: paragraphs.slice(0, -1).join(" "), moral: tail };
}

const book = JSON.parse(fs.readFileSync(BOOK, "utf8"));
const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
const existingIds = new Set(data.map((x) => x.id));
const existingTitles = new Set(data.map((x) => x.title.toLowerCase().trim()));

let added = 0, skipped = 0;
for (const ch of book.chapters) {
  const title = String(ch.title || "").trim();
  if (!title) { skipped++; continue; }
  const id = "p-aesop-" + slugify(title);
  if (existingIds.has(id) || existingTitles.has(title.toLowerCase())) { skipped++; continue; }
  const paras = bodyText(ch);
  if (!paras.length) { skipped++; continue; }
  const { text, moral } = splitMoral(paras);
  if (!text || text.length < 80) { skipped++; continue; }
  const entry = { id, title, source: SOURCE, tags: pickTags(title), text };
  if (moral) entry.moral = moral;
  data.push(entry);
  existingIds.add(id);
  existingTitles.add(title.toLowerCase());
  added++;
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log("parables: +" + added + " added, " + skipped + " skipped, total " + data.length);
