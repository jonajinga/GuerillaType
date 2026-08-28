#!/usr/bin/env node
/* Invariants for the idiom corpus.

   The file was two corpora bolted together. That left 89 exactly
   duplicated phrases plus as many again differing only by an article, a
   possessor or a carrier verb -- which no exact-text check can see --
   two ids used twice (ids key corpusProgress, so a collision silently
   shares one user's progress between two idioms), and one phrase
   carrying an accented letter that a US keyboard cannot produce.

   No browser needed. Run: node scripts/check-idioms.mjs */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

const a = JSON.parse(readFileSync(resolve("src/data/idioms.json"), "utf8"));
chk(Array.isArray(a) && a.length > 0, "corpus loads", `${a.length} entries`);

/* Same normalisation the cleanup uses. Two entries that collapse to one
   key are the same idiom wearing different clothes. */
const normKey = (t) => String(t || "").toLowerCase().trim()
  .replace(/^(a|an|the)\s+/, "")
  .replace(/^(get|got|have|has|be|being|feeling|feel|go|going)\s+/, "")
  .replace(/\b(my|your|his|her|their|our|its|one's|ones|someone's|somebody's)\b/g, "")
  .replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

const ids = a.map((x) => x.id);
chk(new Set(ids).size === ids.length, "every id is unique",
  `${ids.length - new Set(ids).size} collision(s) -- ids key corpusProgress`);

const keys = a.map((x) => normKey(x.text));
const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
chk(dupKeys.length === 0, "no idiom appears twice, even reworded",
  dupKeys.length ? `${dupKeys.length}: ${[...new Set(dupKeys)].slice(0, 3).join(" / ")}` : "");

const nonAscii = a.filter((x) => /[^\x20-\x7E]/.test(x.text || ""));
chk(nonAscii.length === 0, "every phrase is typeable on a plain keyboard",
  nonAscii.length ? nonAscii.slice(0, 3).map((x) => x.id).join(", ") : "");

/* Ends on a preposition with nothing after it, so it cannot be typed as
   a phrase. The allow-list is verb particles and complete noun phrases,
   which a part-of-speech guess cannot tell apart from the real thing. */
const COMPLETE = new Set([
  "tide someone over", "give it the once-over", "dip your toes in",
  "a shoulder to cry on", "not have a leg to stand on",
  "keep your shirt on", "egg someone on",
]);
const dangling = a.filter((x) =>
  /\b(on|in|at|to|of|for|with|from|under|over|into|about|by)$/i.test((x.text || "").trim()) &&
  !COMPLETE.has((x.text || "").trim()));
chk(dangling.length === 0, "no phrase stops on a dangling preposition",
  dangling.length ? dangling.slice(0, 3).map((x) => `${x.id}: "${x.text}"`).join(", ") : "");

const noMeaning = a.filter((x) => !String(x.meaning || "").trim());
chk(noMeaning.length === 0, "every idiom is glossed", noMeaning.length ? `${noMeaning.length} missing` : "");

const noTags = a.filter((x) => !Array.isArray(x.tags) || !x.tags.length);
chk(noTags.length === 0, "every idiom is tagged", noTags.length ? `${noTags.length} untagged` : "");

/* House style, measured rather than assumed: lowercase start, no
   trailing full stop, and no "to " prefix (665 of the original 840
   already did it this way). */
const styleBreaks = a.filter((x) => {
  const m = String(x.meaning || "");
  return /^to\s/i.test(m) || /\.$/.test(m.trim()) || /^[A-Z]/.test(m.trim()) && !/^I\b/.test(m.trim());
});
chk(styleBreaks.length === 0, "glosses follow one style",
  styleBreaks.length ? `${styleBreaks.length}, e.g. ${styleBreaks[0].id}` : "");

/* A gloss that mostly repeats the idiom teaches nothing. */
const circular = a.filter((x) => {
  const w = new Set((String(x.text).toLowerCase().match(/[a-z]{4,}/g) || []));
  const mw = String(x.meaning).toLowerCase().match(/[a-z]{4,}/g) || [];
  if (!mw.length || !w.size) return false;
  return mw.filter((v) => w.has(v)).length / mw.length > 0.6;
});
chk(circular.length === 0, "no gloss merely restates its idiom",
  circular.length ? `${circular.length}, e.g. ${circular[0].id}` : "");

chk(a.length >= 715, "corpus has not shrunk unexpectedly", `${a.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
