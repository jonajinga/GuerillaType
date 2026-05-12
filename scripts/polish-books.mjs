#!/usr/bin/env node
/* Post-ingestion polish pass for src/data/books/*.json.
   The goal: strip the parts a typing user doesn't want (front
   matter, back matter, empty shells) and normalize chapter titles
   so they actually describe what comes next.

   Run: node scripts/polish-books.mjs
   Re-runnable -- idempotent on already-polished books.

   What it does, per book:

     1. Drop chapters whose title matches a front/back-matter
        keyword list (Preface, Foreword, Introduction, Contents,
        Index, Appendix, Dedication, Acknowledgements, Notes,
        Endnotes, Bibliography, Glossary, Translator's Note,
        Editor's Preface, Transcriber's Note, About the Author,
        Copyright, Title Page, Half-Title, Frontispiece, Errata,
        Illustrations, Plates, Colophon).

     2. Drop chapters with no body text (paragraphs missing or
        sum-of-paragraph-chars < 80). Empty chapters were ingestion
        artifacts where the splitter found a heading but no body.

     3. Normalize chapter titles:
          - strip trailing dots / commas / whitespace
          - strip "Chapter I -- " / "Book II:" prefixes when the
            chapter ALREADY has a descriptive title after them
            (keeps "Chapter I" when that's all there is)
          - truncate over-long titles at the first dash, colon, or
            period (caps a title at ~80 chars)
          - replace empty titles with "Chapter N" (per book index)

     4. Renumber consecutive bare "Chapter" / "Book" / "Part"
        chapters so they read 1, 2, 3 instead of carrying the
        original ingestion's Roman / mixed numbering.

     5. Recompute the per-book chapterCount / paragraphCount /
        charCount totals so the catalog stays correct.

   What it does NOT do:
     - Edit paragraph BODY text. Surgery on body text is risky;
       the ingestion script is the right place for that.
     - Hand-fix individual books. If a book has 100 chapters all
       called "Chapter" with no descriptive title, the polish pass
       can't invent one -- that needs a per-book ingestion fix. */

import fs from "node:fs";
import path from "node:path";

const BOOKS_DIR = "src/data/books";
const INDEX_FILE = "src/data/library.json";

// ── Front / back matter heuristics ─────────────────────────────
// A chapter is dropped when its title matches ANY of these regexes
// at the start (case-insensitive). Patterns are deliberately
// conservative -- only the obvious cases. Things like "A note on
// the text" are NOT in this list; if the user later flags one,
// add it.
const FRONT_BACK_MATTER = [
  /^preface\b/i,
  /^author'?s?\s+preface\b/i,
  /^editor'?s?\s+preface\b/i,
  /^translator'?s?\s+preface\b/i,
  /^translator'?s?\s+note\b/i,
  /^foreword\b/i,
  /^introduction\b/i,           // covers "Introduction" + "Introduction to ..."
  /^introductory\s+note\b/i,
  /^prolegomena\b/i,
  /^prefatory\s+note\b/i,
  /^contents\b/i,
  /^table\s+of\s+contents\b/i,
  /^list\s+of\s+(illustrations|plates|figures|tables|characters)\b/i,
  /^illustrations\b/i,
  /^plates\b/i,
  /^figures\b/i,
  /^dramatis\s+person/i,        // "Dramatis Personae" -- play character list
  /^cast\s+of\s+characters\b/i,
  /^index\b/i,
  /^appendix\b/i,               // covers "Appendix" + "Appendix A" etc.
  /^endnotes?\b/i,
  /^notes?\s+(to|on|by|for|of)\b/i,    // "Notes to Caesar and Cleopatra", "Notes on the text"
  /^translator'?s?\s+notes?\b/i,
  /^author'?s?\s+notes?\b/i,
  /^publisher'?s?\s+notes?\b/i,
  /^bibliography\b/i,
  /^bibliography\s+of\b/i,
  /^glossary\b/i,
  /^transcriber'?s?\s+notes?\b/i,
  /^about\s+the\s+author\b/i,
  /^about\s+this\s+(book|edition|text)\b/i,
  /^copyright\b/i,
  /^title\s*page\b/i,
  /^half[-\s]?title\b/i,
  /^frontispiece\b/i,
  /^colophon\b/i,
  /^errata\b/i,
  /^dedication\b/i,
  /^to\s+(my|the)\s+/i,         // "To my mother", "To the reader" -- dedications
  /^acknowledgements?\b/i,
  /^acknowledgments?\b/i,
  /^advertisement\b/i,
  /^advertis[ei]ment\s+(to|by|for)\b/i,
  /^etext\s+/i,
  /^end\s+of\s+(the\s+)?project\s+gutenberg/i,
  /^project\s+gutenberg/i,
  /^license\b/i,
  /^afterword\b/i,              // back-matter essay
  /^bibliographical\s+note\b/i,
  /^postscript\b/i,
  /^historical\s+note\b/i,
  /^biographical\s+note\b/i,
  /^chronology\b/i,
  /^chronological\s+table\b/i,
  /^critical\s+(note|essay|introduction)\b/i,
];

function isFrontBackMatter(title) {
  const t = String(title || "").trim();
  if (!t) return false;
  return FRONT_BACK_MATTER.some((re) => re.test(t));
}

// ── Title normalization ────────────────────────────────────────

/* Strip the trailing-dot / trailing-comma artifacts that survived
   ingestion ("Book II The Argument." -> "Book II The Argument"). */
function trimTrailingPunct(s) {
  return String(s || "")
    // Trailing brackets / parens left dangling from ingestion
    // ("Chapter I.]", "Chapter II)") -- strip them along with
    // the punctuation block that usually precedes them.
    .replace(/[\s.,;:\]\)\}>]+$/g, "")
    .replace(/^[\s\-–—\[\(\{<]+/, "")
    .trim();
}

/* Many ingestion artifacts produced titles like:
     "Chapter I -- The Three Presents"
     "Book II: The Argument"
     "CHAPTER IV. The Hunt"
   Reduce these to just the descriptive tail when it exists. If
   the tail is empty, keep the chapter/book marker as-is. */
function normalizeTitle(raw) {
  let t = trimTrailingPunct(raw);
  if (!t) return t;
  // Common pattern: "<MARKER> <NUMBER>[.:-]+ <TITLE>"
  const m = t.match(/^(chapter|book|part|section|canto|act|scene|stave|epoch|letter|lecture|tale)\b\s*[\divxlcdmIVXLCDM]*\s*[.\-:–—]+\s*(.+)$/i);
  if (m && m[2] && m[2].trim().length >= 3) {
    return trimTrailingPunct(m[2]);
  }
  return t;
}

/* If the FIRST WORD repeats the chapter index (Aesop's fables came
   in this way with each fable as its own "chapter" titled "The
   Fox and the Grapes" etc., perfectly fine -- left alone). This
   function is here in case future ingestion outputs " The Fox and
   the Grapes." with leading whitespace + trailing dot; trimTrailingPunct
   already handles both. */

/* Truncate over-long titles at the first natural break. */
function truncateTitle(t, maxLen = 80) {
  if (t.length <= maxLen) return t;
  // Find the first natural break in [40, maxLen] range.
  const breakChars = [". ", "; ", " -- ", " - ", ": ", ", "];
  for (const sep of breakChars) {
    const ix = t.indexOf(sep, 40);
    if (ix > 0 && ix < maxLen) return t.slice(0, ix).trim();
  }
  // Hard-cut at maxLen, back off to last space.
  const cut = t.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + "...";
}

// ── Body-content check ────────────────────────────────────────
function bodyCharCount(chapter) {
  if (!chapter || !Array.isArray(chapter.paragraphs)) return 0;
  let n = 0;
  for (const p of chapter.paragraphs) {
    if (!p) continue;
    if (typeof p === "string") n += p.length;
    else if (p.text) n += String(p.text).length;
  }
  return n;
}

// ── Main ──────────────────────────────────────────────────────
const files = fs.readdirSync(BOOKS_DIR).filter((f) => f.endsWith(".json"));
let stats = {
  booksProcessed: 0,
  booksChanged: 0,
  booksLeftEmpty: [],
  chaptersDroppedFrontBack: 0,
  chaptersDroppedEmpty: 0,
  titlesNormalized: 0,
  titlesTruncated: 0,
  titlesFilled: 0,
};
const droppedByBook = {};

for (const f of files) {
  const fp = path.join(BOOKS_DIR, f);
  const src = JSON.parse(fs.readFileSync(fp, "utf8"));
  const orig = JSON.stringify(src);
  stats.booksProcessed++;
  const dropped = [];

  let chapters = Array.isArray(src.chapters) ? src.chapters.slice() : [];

  // Pass 1: drop front/back matter by title pattern -- but ONLY
  // when the chapter is short. A "Contents" chapter with 156,000
  // characters of body text is the book itself wearing a wrong
  // label (the ingestion splitter mis-attributed everything to
  // the first heading). Drop those only when the body is small
  // enough that it really is just front matter; otherwise RENAME
  // the chapter to "Chapter 1" / "Chapter N" so the actual text
  // survives.
  const BODY_FRONTMATTER_THRESHOLD = 5000; // chars
  chapters = chapters.filter((ch) => {
    if (!isFrontBackMatter(ch.title)) return true;
    const chars = bodyCharCount(ch);
    if (chars >= BODY_FRONTMATTER_THRESHOLD) {
      // Substantial body under a misleading title -- KEEP the
      // chapter, but clear the title so the renumbering pass
      // gives it a generic "Chapter N" name.
      dropped.push({ reason: "RENAMED (kept; large body under " + ch.title + ")", title: ch.title });
      ch.title = "";
      return true;
    }
    dropped.push({ reason: "front/back-matter", title: ch.title });
    stats.chaptersDroppedFrontBack++;
    return false;
  });

  // Pass 1b: drop the FIRST chapter when it has the shape of a
  // table-of-contents / illustrations listing -- many very short
  // paragraphs, modest total body length, and no narrative prose.
  if (chapters.length > 1) {
    const first = chapters[0];
    if (first && Array.isArray(first.paragraphs)) {
      const totalChars = bodyCharCount(first);
      const paraN = first.paragraphs.length;
      const avgLen = paraN > 0 ? totalChars / paraN : 0;
      const longCount = first.paragraphs.filter((p) => {
        const t = typeof p === "string" ? p : (p && p.text) || "";
        return t.length > 200;
      }).length;
      // Detect listing-shape: many short paragraphs and no real prose.
      const isShortListing = paraN >= 8 && avgLen < 90 && longCount < 2 && totalChars < 4000;
      // Detect captions/illustrations: body literally contains
      // "ILLUSTRATIONS." or "PUBLISHER'S NOTICE." or similar markers
      // in the first three paragraphs and the chapter is short.
      const firstFew = first.paragraphs.slice(0, 4)
        .map((p) => typeof p === "string" ? p : (p && p.text) || "")
        .join(" ").toUpperCase();
      const CAPTION_MARKERS = /\b(ILLUSTRATIONS|FRONTISPIECE|TITLE\s*PAGE|TABLE\s+OF\s+CONTENTS|NOTICE|EXPLANATORY|LIST\s+OF\s+PLATES|HALF-?TITLE)\b/;
      const looksLikeCaptions = totalChars < 5000 && CAPTION_MARKERS.test(firstFew);
      // Detect mis-ordered "Chapter the Last" / "Final Chapter" at
      // index 0 -- some ingestions parsed an end-marker reference
      // out of front matter and put it at the head of the list.
      const t = String(first.title || "");
      const looksLikeMisorderedLast = /^(chapter\s+the\s+last|final\s+chapter|the\s+end)\b/i.test(t)
        && chapters.length > 4;
      if (isShortListing || looksLikeCaptions || looksLikeMisorderedLast) {
        const reason = looksLikeMisorderedLast
          ? "misordered end-marker at index 0"
          : looksLikeCaptions
            ? "caption/listing markers in first paragraphs"
            : "TOC-shape first chapter (" + paraN + " short paras, avg " + Math.round(avgLen) + " chars)";
        dropped.push({ reason, title: first.title });
        stats.chaptersDroppedFrontBack++;
        chapters.shift();
      }
    }
  }

  // Pass 2: drop empty / near-empty chapters.
  chapters = chapters.filter((ch) => {
    const chars = bodyCharCount(ch);
    if (chars < 80) {
      dropped.push({ reason: "empty/sparse body (" + chars + " chars)", title: ch.title });
      stats.chaptersDroppedEmpty++;
      return false;
    }
    return true;
  });

  // Pass 3: normalize + fill titles.
  let chapterIdx = 0;
  for (const ch of chapters) {
    chapterIdx++;
    const before = String(ch.title || "");
    let after = normalizeTitle(before);
    if (after.length > 80) {
      after = truncateTitle(after, 80);
      stats.titlesTruncated++;
    }
    if (!after) {
      after = "Chapter " + chapterIdx;
      stats.titlesFilled++;
    }
    if (after !== before) {
      ch.title = after;
      stats.titlesNormalized++;
    }
  }

  src.chapters = chapters;
  // Recompute summary counts.
  src.chapterCount = chapters.length;
  src.paragraphCount = chapters.reduce((n, ch) => n + (Array.isArray(ch.paragraphs) ? ch.paragraphs.length : 0), 0);
  src.charCount = chapters.reduce((n, ch) => n + bodyCharCount(ch), 0);

  const next = JSON.stringify(src);
  if (next !== orig) {
    fs.writeFileSync(fp, JSON.stringify(src, null, 2));
    stats.booksChanged++;
    if (dropped.length) droppedByBook[src.slug] = dropped;
  }
  if (chapters.length === 0) {
    stats.booksLeftEmpty.push(src.slug);
  }
}

// ── Update the index totals ───────────────────────────────────
if (fs.existsSync(INDEX_FILE)) {
  const idx = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  if (Array.isArray(idx.books)) {
    for (const meta of idx.books) {
      const bp = path.join(BOOKS_DIR, meta.slug + ".json");
      if (!fs.existsSync(bp)) continue;
      const b = JSON.parse(fs.readFileSync(bp, "utf8"));
      meta.chapterCount = b.chapterCount;
      meta.paragraphCount = b.paragraphCount;
      meta.charCount = b.charCount;
    }
    fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2));
  }
}

console.log("=== polish-books ===");
console.log("books processed:", stats.booksProcessed);
console.log("books changed:  ", stats.booksChanged);
console.log("chapters dropped (front/back matter):", stats.chaptersDroppedFrontBack);
console.log("chapters dropped (empty body):      ", stats.chaptersDroppedEmpty);
console.log("titles normalized:                   ", stats.titlesNormalized);
console.log("titles truncated to <=80 chars:      ", stats.titlesTruncated);
console.log("titles filled (empty -> Chapter N):  ", stats.titlesFilled);
console.log("books left with zero chapters:       ", stats.booksLeftEmpty.length);
if (stats.booksLeftEmpty.length) {
  console.log("  ", stats.booksLeftEmpty.join(", "));
}
// Sample of what was dropped (for spot-check).
const slugs = Object.keys(droppedByBook).slice(0, 6);
if (slugs.length) {
  console.log("\nSample drops:");
  for (const s of slugs) {
    console.log("  " + s + ":");
    for (const d of droppedByBook[s].slice(0, 4)) {
      console.log("    [" + d.reason + "] " + d.title);
    }
  }
}
