#!/usr/bin/env node
/* Nothing untypeable should ever reach the typing surface.

   Asked for after the third time a user reported a character they
   could not type. Each one was found by a human looking at a screen:

     1. whitespace look-alikes (no-break, narrow, figure, zero-width)
        -- fixed in normalizeTypeable();
     2. "™", a misread superscript in a scanned French novel -- added
        to the OCR cleaner's noise class;
     3. "« marcher»." -- the guillemet was mapped, the narrow space
        French sets inside it was not, and the gap stayed on screen.

   The pattern is the problem: there is no reason to expect the fourth
   one to be found any faster. So this is a census rather than a list
   of known offenders. It walks everything this app can put in front of
   a typist, through the pipeline that text really travels, and fails
   on any character outside what a keyboard can send.

   THE RULE
     allowed  ASCII printable, plus \n and \t
     allowed  any Unicode LETTER or MARK, any script -- \p{L}, \p{M}.
              é, ü, ñ, Cyrillic, Greek, CJK ideographs. All of these
              are typeable on the right keyboard, and banning them
              would mean banning whole languages.
     banned   any non-ASCII punctuation or symbol. Guillemets, ™, °,
              §, ¶, †, ‡, •, curly quotes, en/em dashes, ellipsis,
              primes, vulgar fractions.
     allowed  ONE short, explicit list of CJK punctuation (below),
              because a Japanese or Chinese IME sends those as
              routinely as a US keyboard sends a comma.

   TWO TIERS, and the difference matters.

     Tier 1 -- the cleaner's output. Everything that goes through
       cleanOcrNoise(): an imported custom text, the bundled Alice
       sample, and the real extraction from the scanned PDF. Zero
       banned characters, no exceptions, no baseline. If the cleaner
       lets one through, that is the bug this file exists to catch.

     Tier 2 -- the bundled book corpus. 271 books that reach the
       surface through normalizeTypeable() only; the OCR cleaner is
       deliberately not in that path (it has no off-switch there --
       see scripts/check-ocr-cleanup.mjs section G). Those books
       contain 18 banned characters TODAY, and several of them are
       real content rather than damage: the Gold-Bug cryptogram in
       Poe is written in †, ‡ and ¶, and deleting them would destroy
       the puzzle the story turns on. Removing any of them is an
       editorial decision, not a refactor.

       So tier 2 is pinned rather than cleaned: the set below is what
       ships today, each entry with what it is and where it came from,
       and this gate fails the moment a character appears that is NOT
       on it. A new kind of untypeable character stops being something
       a user has to notice.

   Usage: node scripts/check-typeable-census.mjs
          (no browser, no server, no node_modules) */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* saveText/listSaved touch localStorage at import time in some paths;
   custom-text.js is imported for its pipeline, not its storage. */
if (typeof globalThis.localStorage === "undefined") {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => mem.clear(),
  };
}

const ct = await import("../src/assets/js/engine/custom-text.js");
const normalizeTypeable = ct.normalizeTypeable || ((x) => String(x || ""));
const cleanOcrNoise = ct.cleanOcrNoise || ((x) => String(x || ""));

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
  ok ? pass++ : fail++;
};
const U = (ch) => "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");

/* ── the rule ──────────────────────────────────────────────────────
   Written as one predicate so the census and the vacuity checks at
   the bottom cannot test different rules. */

/* Typeable on a Japanese or Chinese IME, and every one of them is
   sentence-level punctuation with no ASCII equivalent that reads
   right in running CJK text. Kept short on purpose: this is an
   allowlist, and every entry is a hole in the rule.

     。 U+3002  ideographic full stop  -- the CJK period
     、 U+3001  ideographic comma      -- the CJK comma
     ，U+FF0C  fullwidth comma        -- Chinese prose uses this one
     ？U+FF1F  fullwidth question mark
     ！U+FF01  fullwidth exclamation mark
     ：U+FF1A  fullwidth colon
     ；U+FF1B  fullwidth semicolon
     「」U+300C/D  corner brackets     -- Japanese quotation marks
     『』U+300E/F  white corner brackets -- quotes inside quotes
     （）U+FF08/9  fullwidth parentheses
     《》U+300A/B  double angle brackets -- Chinese title marks

   NOT included, deliberately: U+3000 (ideographic space), which is
   whitespace and belongs to normalizeTypeable, not here; and U+30FB
   (katakana middle dot), which appears in the corpus only as scanner
   damage inside an English Sherlock Holmes story. */
const CJK_PUNCTUATION = "。、，？！：；「」『』（）《》";

const ASCII_PRINTABLE = /[\x20-\x7E]/;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
function typeable(ch) {
  if (ch === "\n" || ch === "\t") return true;
  if (ASCII_PRINTABLE.test(ch)) return true;
  if (LETTER_OR_MARK.test(ch)) return true;
  return CJK_PUNCTUATION.includes(ch);
}

/* ── walking the data ──────────────────────────────────────────── */
const R = (p) => fileURLToPath(new URL("../" + p, import.meta.url));

function everyString(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) everyString(x, out);
  else if (v && typeof v === "object") for (const k of Object.keys(v)) everyString(v[k], out);
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/* One offender record per character, with the first place it was seen
   and enough of the sentence around it to judge whether it is content
   or damage. A bare count tells you nothing about what to do. */
function newCensus() {
  return { chars: new Map(), scanned: 0 };
}
function count(census, label, text) {
  census.scanned += text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (typeable(ch)) continue;
    if (!census.chars.has(ch)) census.chars.set(ch, { n: 0, where: label, sample: "" });
    const e = census.chars.get(ch);
    e.n++;
    if (!e.sample) {
      e.sample = text.slice(Math.max(0, i - 28), i + 28).replace(/\n/g, " ");
    }
  }
}
function report(census) {
  return [...census.chars.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([ch, e]) => `${U(ch)} ${JSON.stringify(ch)} ×${e.n} in ${e.where}: …${e.sample}…`);
}

console.log("\n## A. The rule itself — it must be able to fail");
/* A census whose predicate says yes to everything reports a clean
   corpus and means nothing. These are the cases the rule exists for. */

chk(!typeable("«") && !typeable("»"), "a guillemet is not typeable — the character the user reported");
chk(!typeable("™") && !typeable("•") && !typeable("†") && !typeable("‡") && !typeable("¶"),
  "™ • † ‡ ¶ are not typeable");
chk(!typeable("“") && !typeable("”") && !typeable("’"), "curly quotes are not typeable");
chk(!typeable("—") && !typeable("…") && !typeable("′"), "em dash, ellipsis and prime are not typeable");
chk(!typeable(" ") && !typeable(" ") && !typeable("​"),
  "no-break, narrow no-break and zero-width spaces are not typeable");
chk(!typeable("°") && !typeable("£") && !typeable("½"),
  "degree, pound and vulgar-fraction signs are not typeable either — the rule bans non-ASCII symbols, not just punctuation");

chk([..."café 日本語"].every(typeable),
  "\"café 日本語\" passes — accents and CJK ideographs are letters, and banning them would ban languages");
chk([..."Ελληνικά Русский हिन्दी العربية"].every(typeable),
  "…and Greek, Cyrillic, Devanagari and Arabic, marks and all");
/* Spelled out, not read back off CJK_PUNCTUATION. `[...""].every()`
   is TRUE, so asserting the allowlist against itself passes loudest
   exactly when the allowlist has been emptied -- which a mutation run
   caught this file doing. */
chk([..."。、，？！：；「」『』（）《》"].every(typeable),
  "…and the CJK punctuation a Japanese or Chinese IME sends: 。、，？！：；「」『』（）《》");
const japanese = newCensus();
count(japanese, "probe", "「こんにちは、世界。」と彼は言った（本当に）。");
chk(japanese.chars.size === 0,
  "…so a whole Japanese sentence, punctuation and all, passes the census",
  report(japanese).join(" | "));
chk([..."The quick brown fox; \"jumps\" (over) 5% of $40 & 3 -- done."].every(typeable),
  "…and every ASCII character a keyboard has");

/* The census machinery, not just the predicate: a string with a
   guillemet in it must come back as an offender. */
const probe = newCensus();
count(probe, "probe", "il dit « marcher » puis partit");
chk(probe.chars.size === 2 && probe.chars.has("«") && probe.chars.has("»"),
  "the census reports a guillemet as an offender, with its context",
  [...probe.chars.keys()].map(U).join(" ") || "(nothing flagged)");
const cleanProbe = newCensus();
count(cleanProbe, "probe", "café 日本語 and plain ASCII");
chk(cleanProbe.chars.size === 0, "…and reports nothing for text that is fine",
  report(cleanProbe).join(" | "));

console.log("\n## B. Tier 1 — everything the OCR cleaner touches. Zero, no baseline.");
/* The path: sanitize() runs normalizeTypeable then cleanOcrNoise on
   the way in, and practice-boot runs cleanForDisplay then
   normalizeTypeable on the way out. Composed here in that order, so
   what is censused is what a typist sees. */
const throughCleaner = (t) => normalizeTypeable(cleanOcrNoise(normalizeTypeable(t)));

const tier1 = newCensus();

const SAMPLE = R("src/data/custom-sample.json");
if (existsSync(SAMPLE)) {
  for (const s of everyString(readJson(SAMPLE))) count(tier1, "custom-sample.json", throughCleaner(s));
  chk(true, "the bundled Alice sample was censused");
} else {
  chk(false, "src/data/custom-sample.json exists", "run: npm run custom-sample-data");
}

const FIXTURE = R("scripts/fixtures/ocr-noise-lejournal.txt");
if (existsSync(FIXTURE)) {
  count(tier1, "ocr-noise-lejournal.txt", throughCleaner(readFileSync(FIXTURE, "utf8")));
  chk(true, "the real extraction from the scanned PDF was censused");
} else {
  chk(false, "scripts/fixtures/ocr-noise-lejournal.txt exists");
}

/* The corpus items that go through sanitize() rather than book mode.
   Small files, and they are what /practice/ serves for quotes,
   idioms, parables and poetry. */
for (const f of ["idioms.json", "parables.json", "poetry.json", "quotes.json", "pangrams.json"]) {
  const path = R("src/data/" + f);
  if (!existsSync(path)) { chk(false, `src/data/${f} exists`); continue; }
  for (const s of everyString(readJson(path))) count(tier1, f, throughCleaner(s));
}
chk(true, "the quote / idiom / parable / poetry / pangram corpus was censused");

chk(tier1.chars.size === 0,
  `nothing untypeable survives the cleaner (${tier1.scanned.toLocaleString()} characters censused)`,
  tier1.chars.size === 0 ? "" : "\n          " + report(tier1).join("\n          "));

console.log("\n## C. Tier 2 — the book corpus, pinned to what ships today");
/* These 271 books reach the typing surface through normalizeTypeable
   only. Every entry below was measured, read in context, and left
   alone on purpose: mapping them away is an editorial decision about
   somebody's book, and this gate is not the place to take it. What it
   IS for is the 10th character. */
const PINNED = {
  "£": "£  currency, real, and typeable on a UK keyboard (20000-leagues: \"its value at not less than £1000\")",
  "°": "°  degrees, real (20000-leagues, earth-to-moon: latitudes, \"42° 15' N. lat.\"). No faithful ASCII -- \"deg\" is a word, not the mark the author set",
  "§": "§  section mark, real (art-of-war, beowulf: scholarly cross-references, \"Chapter V. § 19\")",
  "‡": "‡  double dagger. Footnote marker in Marlowe -- and part of the GOLD-BUG CRYPTOGRAM in Poe, which is the puzzle the story turns on",
  "†": "†  dagger. Same two uses (count-of-monte-cristo: \"Caes...ar † Spada\")",
  "・": "・ katakana middle dot, inside an ENGLISH story -- the Dancing Men dot code (return-of-sherlock-holmes)",
  "¶": "¶  pilcrow -- part of the Gold-Bug cryptogram (short-stories-poe)",
  "✠": "✠  maltese cross, real -- Joyce's episcopal signature joke (ulysses: \"William ✠. Ascot meeting\")",
  "•": "•  bullet, and it is CONTENT, not licence boilerplate. The nine that were boilerplate went with the Gutenberg purge; this one is the whole of Ithaca's last answer -- \"Where?\" / \"•\" -- the full stop Joyce set as the end of the episode (ulysses)",
};

const BOOKS = R("src/data/books");
const tier2 = newCensus();
let bookCount = 0;
if (existsSync(BOOKS)) {
  for (const f of readdirSync(BOOKS)) {
    if (!f.endsWith(".json")) continue;
    bookCount++;
    for (const s of everyString(readJson(BOOKS + "/" + f))) {
      count(tier2, "books/" + f.replace(/\.json$/, ""), normalizeTypeable(s));
    }
  }
}
chk(bookCount > 200, "the book corpus was censused", `${bookCount} books, ${tier2.scanned.toLocaleString()} characters`);

const unknown = [...tier2.chars.entries()].filter(([ch]) => !(ch in PINNED));
chk(unknown.length === 0,
  "no untypeable character reaches book mode that is not already pinned and explained",
  unknown.length === 0 ? "" : "\n          NEW, and nobody has looked at these:\n          " +
    unknown.sort((a, b) => b[1].n - a[1].n)
      .map(([ch, e]) => `${U(ch)} ${JSON.stringify(ch)} ×${e.n} in ${e.where}: …${e.sample}…`)
      .join("\n          "));

/* The pin is only worth something if it is still describing reality.
   An entry with nothing behind it means a book was fixed or removed
   and the note should go with it -- otherwise the list grows into
   folklore. */
const stale = Object.keys(PINNED).filter((ch) => !tier2.chars.has(ch));
chk(stale.length === 0,
  "every pinned character is still really in the corpus — the list has not drifted into folklore",
  stale.length === 0 ? "" : stale.map((c) => `${U(c)} ${JSON.stringify(c)} is pinned but no longer present`).join(", "));

console.log(`\n  (tier 2 inventory, ${tier2.chars.size} characters, all pinned:)`);
for (const line of report(tier2)) console.log("   " + line);

console.log("\n## D. The census cannot pass by looking at nothing");
/* Two ways this file could be green and worthless: scanning an empty
   set, or a predicate that says yes to everything. */
chk(tier1.scanned > 100000, "tier 1 really read a corpus", `${tier1.scanned.toLocaleString()} characters`);
chk(tier2.scanned > 10000000, "tier 2 really read the books", `${tier2.scanned.toLocaleString()} characters`);
chk(tier2.chars.size > 0,
  "tier 2 found something — a census of 271 books that flags nothing at all is not a census");

/* Feed the real pipeline text it must reject, and confirm the census
   built from it is not empty. If this passes with an empty result the
   cleaner has started deleting the evidence rather than the noise. */
const sabotage = newCensus();
count(sabotage, "sabotage", normalizeTypeable("il dit « marcher » — M™ la comtesse †"));
chk(sabotage.chars.size >= 3,
  "a string of exactly the characters that were reported three times is caught",
  [...sabotage.chars.keys()].map(U).join(" ") || "(nothing flagged)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
