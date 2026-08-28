#!/usr/bin/env node
/* Clean the idiom corpus.

   The file is two corpora bolted together -- the seam is visible around
   index 449, where short ids and clipped glosses give way to
   full-phrase ids and "to ..." glosses. That merge left 89 exactly
   duplicated phrases and roughly as many again that differ only by an
   article, a possessor or a carrier verb, which no exact-text check can
   see.

   What this does, in order:
     1. groups entries by a normalised form of the text (articles,
        possessors and carrier verbs removed) and keeps ONE per group,
        taking the best text, the best meaning and the union of tags --
        these can come from different members, so nothing is thrown away
     2. keeps the surviving entry's original id wherever possible.
        corpusProgress is keyed by id, so regenerating ids would silently
        reset every user's idiom completion
     3. makes any duplicated id unique
     4. folds text to plain ASCII: this is a typing tutor, and one
        accented letter is a wall a US-keyboard user cannot get past
     5. normalises gloss style to the majority form (665 of 840 do not
        lead with "to ")

   Run: node scripts/clean-idioms.mjs [--write]   (default is a dry run) */

import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/data/idioms.json";
const WRITE = process.argv.includes("--write");
const a = JSON.parse(readFileSync(FILE, "utf8"));

const ACCENTS = { "à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","ç":"c","è":"e","é":"e","ê":"e","ë":"e",
  "ì":"i","í":"i","î":"i","ï":"i","ñ":"n","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o",
  "ù":"u","ú":"u","û":"u","ü":"u","ý":"y","ÿ":"y","æ":"ae","œ":"oe","ß":"ss" };
const asciify = (s) => String(s || "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/—/g, "--").replace(/–/g, "-").replace(/…/g, "...")
  .replace(/[À-ɏ]/g, (c) => ACCENTS[c.toLowerCase()] || c);

const normKey = (t) => String(t || "").toLowerCase().trim()
  .replace(/^(a|an|the)\s+/, "")
  .replace(/^(get|got|have|has|be|being|feeling|feel|go|going)\s+/, "")
  .replace(/\b(my|your|his|her|their|our|its|one's|ones|someone's|somebody's)\b/g, "")
  .replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

const DANGLING = /\b(on|in|at|to|of|for|with|from|under|over|into|about|by)$/i;

/* Texts that genuinely stop on a preposition with nothing after it.
   A typist is asked to type the phrase as shown, and "keep tabs on"
   is not something anyone says or writes on its own.

   The corpus already uses "someone"/"something" placeholders elsewhere
   ("breathe down someone's neck", "bring something to the table"), so
   these follow that convention rather than inventing a new one. */
const OBJECT_NEEDED = {
  "keep tabs on": "keep tabs on someone",
  "steer clear of": "steer clear of something",
  "beat the drum for": "beat the drum for something",
  "get a kick out of": "get a kick out of something",
  "have a soft spot for": "have a soft spot for someone",
  "throw cold water on": "throw cold water on something",
  "tighten the screws on": "tighten the screws on someone",
  "pull the rug out from under": "pull the rug out from under someone",
  "keep an eye on": "keep an eye on something",
};

/* Ends in a preposition but is already complete: the final word is a
   particle of the verb, or the phrase is a finished noun phrase.
   Listed so the gate can tell these apart from the ones above rather
   than guessing from the part of speech. */
const COMPLETE_DESPITE_ENDING = new Set([
  "tide someone over",
  "give it the once-over",
  "dip your toes in",
  "a shoulder to cry on",
  "not have a leg to stand on",
  "keep your shirt on",
  "egg someone on",
]);


/* A fuller citation form is the better one to type: it carries its
   article and does not end on a preposition with nothing after it. */
function textScore(t) {
  let s = 0;
  if (/^(a|an|the)\s/i.test(t)) s += 3;
  if (!DANGLING.test(t.trim())) s += 5;
  s += Math.min(t.length, 40) / 20;
  return s;
}
/* A gloss that mostly repeats the idiom teaches nothing. */
function meaningScore(m, text) {
  if (!m) return -99;
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) || []);
  const mw = (m.toLowerCase().match(/[a-z]+/g) || []);
  const overlap = mw.filter((w) => words.has(w) && w.length > 3).length;
  const circular = mw.length ? overlap / mw.length : 0;
  return Math.min(m.length, 70) / 10 - circular * 8;
}

const groups = new Map();
a.forEach((x, i) => {
  const k = normKey(x.text);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(i);
});

const out = [];
const merged = [];
for (const [, ix] of groups) {
  const members = ix.map((i) => a[i]);
  const best = members.slice().sort((p, q) => textScore(q.text) - textScore(p.text))[0];
  const bestMeaning = members.slice().sort((p, q) =>
    meaningScore(q.meaning, best.text) - meaningScore(p.meaning, best.text))[0];
  const tags = [...new Set(members.flatMap((m) => m.tags || []))];
  let text = asciify(best.text).trim();
  if (OBJECT_NEEDED[text.toLowerCase()]) text = OBJECT_NEEDED[text.toLowerCase()];
  const entry = { id: best.id, text, meaning: bestMeaning.meaning.trim(), tags };
  // Majority gloss style: 665 of 840 do not lead with "to ".
  entry.meaning = entry.meaning.replace(/^to\s+/i, "");
  if (members.length > 1) merged.push({ kept: entry.text, dropped: members.filter((m) => m !== best).map((m) => m.text) });
  out.push(entry);
}

// Any id collision left over gets a suffix rather than a regenerated id.
const seen = new Map();
let renamed = 0;
for (const e of out) {
  if (!seen.has(e.id)) { seen.set(e.id, 1); continue; }
  const n = seen.get(e.id) + 1; seen.set(e.id, n);
  e.id = `${e.id}-${n}`; renamed++;
}

const nonAscii = out.filter((e) => /[^\x20-\x7E]/.test(e.text)).length;
const dangling = out.filter((e) => DANGLING.test(e.text.trim()) && !COMPLETE_DESPITE_ENDING.has(e.text.trim()));
console.log(`entries:            ${a.length} -> ${out.length}   (${a.length - out.length} duplicates merged away)`);
console.log(`duplicate groups:   ${merged.length}`);
console.log(`ids made unique:    ${renamed}`);
console.log(`non-ASCII texts:    ${nonAscii} remaining`);
console.log(`gloss style:        ${out.filter((e) => /^to /i.test(e.meaning)).length} still lead with "to "`);
console.log(`incomplete texts:   ${dangling.length} remaining (particle endings are allow-listed)`);
dangling.slice(0, 20).forEach((e) => console.log(`   ${e.id}: ${JSON.stringify(e.text)}`));

if (WRITE) {
  writeFileSync(FILE, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWROTE ${FILE}`);
} else {
  console.log(`\n(dry run -- pass --write to apply)`);
}
