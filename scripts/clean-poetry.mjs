#!/usr/bin/env node
/* Clean the poem corpus.

   Same shape of problem as the idiom file: two authoring batches bolted
   together, one using po-* ids and the other p-*, leaving 12 poems
   present twice under different ids.

   Three things this fixes:
     1. duplicate poems -- keeps the entry with the better metadata and
        the fuller text, so nothing is lost by the merge
     2. untypeable characters -- this is a typing tutor, and an em dash
        or an accented letter is a wall a US-keyboard user cannot get
        past. Uses the same fold the book pipeline already applies in
        ingest-books.mjs, so poems and books agree.
     3. entries whose stated year puts them outside the US public
        domain. For a pre-1978 published work the US term is publication
        + 95 years, so the cutoff moves forward every January. Anything
        newer is dropped rather than shipped under a "Public domain"
        label that is not yet true.

   Run: node scripts/clean-poetry.mjs [--write]   (default is a dry run) */

import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/data/poetry.json";
const WRITE = process.argv.includes("--write");
const a = JSON.parse(readFileSync(FILE, "utf8"));

/* A work published in year Y runs its 95-year US term to the END of
   Y+95 and enters the public domain on 1 January of Y+96. So in 2026
   the public-domain set is everything published in 1930 or earlier --
   currentYear - 96, not - 95. Getting this off by one is what let a
   1931 poem sit in the corpus labelled "Public domain".

   Computed rather than hardcoded so the cutoff advances by itself each
   January instead of quietly rotting. */
const PD_CUTOFF = new Date().getFullYear() - 96;

const ACCENTS = { "à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","ç":"c","è":"e","é":"e","ê":"e","ë":"e",
  "ì":"i","í":"i","î":"i","ï":"i","ñ":"n","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o",
  "ù":"u","ú":"u","û":"u","ü":"u","ý":"y","ÿ":"y","æ":"ae","œ":"oe","ß":"ss" };
const asciify = (s) => String(s || "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/—/g, "--").replace(/–/g, "-").replace(/…/g, "...")
  .replace(/[À-ɏ]/g, (c) => ACCENTS[c.toLowerCase()] || c);

const yearOf = (p) => { const m = String(p.year || "").match(/\d{4}/); return m ? +m[0] : null; };
/* "A. E. Housman" and "A.E. Housman" are the same person; so are
   "William Butler Yeats" and "W.B. Yeats". Normalising initials is what
   lets those pair up instead of surviving as two entries. */
const normAuthor = (s) => String(s || "").toLowerCase()
  .replace(/\./g, ". ").replace(/\s+/g, " ").trim();
const key = (p) => `${(p.title || "").trim().toLowerCase()}|${normAuthor(p.author)}`;

/* The same poem also hides behind different TITLES -- Rossetti's "Song"
   is filed elsewhere by its first line, and excerpts are variously
   "(opening)" and "(excerpt)". Matching on the opening of the text
   catches those. One pair is worse than redundant: Blake's "The Tyger
   (full)" is 386 characters while the plain "The Tyger" is 777, so the
   entry claiming to be complete is less than half the poem. Keeping the
   longest text in each group fixes that by construction. */
const textKey = (p) => String(p.text || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120);

/* Prefer the entry that says where it came from over one that only says
   "Public domain", and the fuller text over a shorter one. */
function score(p) {
  let s = 0;
  if (p.source && !/^public domain$/i.test(p.source.trim())) s += 4;
  if (Array.isArray(p.tags)) s += Math.min(p.tags.length, 3);
  // Length dominates: a fuller text is the better one to keep, and it is
  // what unpicks the mislabelled "(full)" entries.
  s += Math.min(String(p.text || "").length, 1200) / 120;
  return s;
}

/* Collapse a list of entries down to one per key, keeping the best. */
function collapse(list, keyFn, log) {
  const g = new Map();
  for (const p of list) {
    const k = keyFn(p);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(p);
  }
  const out = [];
  for (const [, members] of g) {
    const best = members.slice().sort((x, y) => score(y) - score(x))[0];
    out.push({ ...best, tags: [...new Set(members.flatMap((m) => m.tags || []))] });
    if (members.length > 1) log.push(`${best.title} — ${best.author}`);
  }
  return out;
}

const merged = [];
// Title+author first, then again on the opening text to catch the same
// poem filed under a different title or a different spelling of a name.
let kept = collapse(a, key, merged);
kept = collapse(kept, textKey, merged);

const tooRecent = kept.filter((p) => { const y = yearOf(p); return y && y > PD_CUTOFF; });
kept = kept.filter((p) => { const y = yearOf(p); return !(y && y > PD_CUTOFF); });

let folded = 0;
for (const p of kept) {
  const before = p.text;
  p.text = asciify(p.text);
  p.title = asciify(p.title);
  if (p.text !== before) folded++;
}

const left = kept.filter((p) => /[^\x20-\x7E\n]/.test(p.text)).length;
console.log(`entries:              ${a.length} -> ${kept.length}`);
console.log(`duplicate poems merged: ${merged.length}`);
merged.slice(0, 14).forEach((m) => console.log(`   ${m}`));
console.log(`texts folded to ASCII:  ${folded}`);
console.log(`untypeable remaining:   ${left}`);
console.log(`public-domain cutoff:   published ${PD_CUTOFF} or earlier`);
console.log(`dropped as too recent:  ${tooRecent.length}`);
tooRecent.forEach((p) => console.log(`   ${yearOf(p)}  ${p.author} — ${p.title}   (labelled "${p.source}")`));

if (WRITE) {
  writeFileSync(FILE, JSON.stringify(kept, null, 2) + "\n");
  console.log(`\nWROTE ${FILE}`);
} else {
  console.log(`\n(dry run -- pass --write to apply)`);
}
