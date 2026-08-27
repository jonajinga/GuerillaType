#!/usr/bin/env node
/* Ingest public-domain book texts (Project Gutenberg .txt) into the
   structured per-paragraph JSON the /library/{slug}/ pages render.

   Usage:
     node scripts/ingest-books.mjs
   reads every .txt in src/content/books/ and writes:
     src/data/books/<slug>.json     # { slug, title, author, year,
                                     #   chapters: [{title, paragraphs:[{id,text}]}] }
   then updates src/data/library.json with the catalog index.

   Heading detection covers four formats:
     CHAPTER_HEAD       Chapter / Part / Book / Section + Roman or digits,
                        plus all-caps treatise/section titles. Trailing
                        comma not allowed (rejects plaque inscriptions
                        and continuation fragments).
     NUMERIC_HEAD       "01 My Early Home", "1. The Hunt". Requires a
                        blank line both before and after, otherwise
                        numbered footnotes / chronology entries / verse
                        numbers in translations false-positive.
     ROMAN_TITLE_HEAD   "I. A SCANDAL IN BOHEMIA" -- Roman numeral and
                        title on a single line.
     ROMAN_HEAD         Bare "I.", "II." section markers. Suppressed
                        when a strong signal of one of the above
                        formats is present (sub-section dividers).

   After detection, adjacent caps-kind heads within 2 lines merge into
   a single heading ("Chapter I." + "THE THREE PRESENTS..." → one).
   Tables of contents are stripped via a cluster filter -- 4+ heads
   packed within an 8-line window with little body between them. */

import fs from "node:fs";
import path from "node:path";

const SRC_DIR  = "src/content/books";
const OUT_DIR  = "src/data/books";
const INDEX    = "src/data/library.json";

const PG_START = /\*+ ?START OF (?:THIS |THE )?PROJECT GUTENBERG.*?\*+\s*/i;
const PG_END   = /\*+ ?END OF (?:THIS |THE )?PROJECT GUTENBERG.*?\*+/i;

// "Chapter N", "Part N" etc., plus all-caps treatise heads. The
// all-caps clause must end with a letter or period -- never a comma --
// so plaque inscriptions like "SACRED TO THE MEMORY OF ROBERT LONG,"
// don't false-positive.
const CHAPTER_HEAD = /^\s*(?:(?:CHAPTER|Chapter|PART|Part|BOOK|Book|SECTION|Section)[\s\.]+(?:[IVXLCDM\d]+)\b.*|[A-Z][A-Z][A-Z ,'.\-]{12,88}[A-Z.])\s*$/;

/* A head that is nothing but a label and a numeral -- "CHAPTER I.",
   "Part 2". In the common Project Gutenberg layout the chapter's actual
   title sits on the very next line, and it is ordinary mixed case. */
const BARE_LABEL_HEAD = /^(?:CHAPTER|Chapter|PART|Part|BOOK|Book|SECTION|Section)[\s.]+[IVXLCDM\d]+\.?$/;

/* Same, but allowing a title after the numeral: "Chapter I. Into the
   Primitive" as well as "CHAPTER I.". Used to decide whether a head
   swept into a contents run is a real chapter worth rescuing. */
const CHAPTER_LABEL_PREFIX = /^(?:CHAPTER|Chapter|PART|Part|BOOK|Book|SECTION|Section)[\s.]+[IVXLCDM\d]+\b/;

// Numeric chapter heading: "01 My Early Home", "1. The Hunt".
const NUMERIC_HEAD = /^\s*(\d{1,3})[\s\.]+([A-Z][\w\s,.'"\-]{1,80})\s*$/;

// Roman numeral + all-caps title on one line: "I. A SCANDAL IN BOHEMIA".
const ROMAN_TITLE_HEAD = /^\s*([IVXLCDM]{1,6})\.?\s+([A-Z][A-Z\s,.'\-]{4,80})\s*$/;

// Bare Roman numeral standalone marker. Period optional.
const ROMAN_HEAD = /^\s*[IVXLCDM]{1,6}\.?\s*$/;

// Short all-caps line (3-90 chars) used as a continuation of a heading
// title that wraps across multiple lines.
const CAPS_FRAGMENT = /^\s*[A-Z][A-Z\s,.'\-]{2,88}\s*$/;

// Single-word all-caps essay/section title -- 4 to 15 letters, no
// spaces. Catches "FRIENDSHIP", "HEROISM", "GIFTS", "NATURE",
// "CONTENTS", "FOREWORD" etc. that fall under CHAPTER_HEAD's 16-char
// floor. Requires blank lines on both sides (handled in classifyLine)
// so random all-caps interjections in dialogue don't false-positive.
const SHORT_CAPS_HEAD = /^\s*[A-Z]{4,15}\s*$/;

const SMALL_WORDS = new Set([
  "a","an","and","as","at","but","by","en","for","if","in","of","on","or",
  "the","to","via","vs","with",
]);

function slugify(s) {
  return String(s).toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

function stripHeader(raw) {
  const startIx = raw.search(PG_START);
  const endIx = raw.search(PG_END);
  let body = raw;
  if (startIx >= 0) {
    body = body.slice(startIx).replace(PG_START, "");
  }
  if (endIx >= 0) {
    body = body.slice(0, body.search(PG_END));
  }
  return body.trim();
}

function detectMeta(raw) {
  const titleMatch = raw.match(/^\s*Title:\s*(.+)$/m);
  const authorMatch = raw.match(/^\s*Author:\s*(.+)$/m);
  const yearMatch = raw.match(/^\s*(?:Release date|Posting Date):\s*([^\[\n]+)/m);
  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    author: authorMatch ? authorMatch[1].trim() : null,
    yearText: yearMatch ? yearMatch[1].trim() : null,
  };
}

/* Replace fancy punctuation with typeable ASCII equivalents and fold
   accented Latin letters to their ASCII base. Done before regex
   matching so chapter titles with accented characters (TRÉVILLE,
   D'ARTAGNAN, Yüeh) survive the all-caps detection. The folding also
   makes content typeable -- a typing tutor can't expect users to type
   é or ü on a standard keyboard. */
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
  "Ý":"Y","ý":"y","ÿ":"y",
  "Ž":"Z","ž":"z",
  "ß":"ss",
  "Æ":"AE","æ":"ae",
  "Œ":"OE","œ":"oe",
  "Ŭ":"U","ŭ":"u","Ŏ":"O","ŏ":"o",
};
function asciify(text) {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[À-ſ]/g, (c) => ACCENT_MAP[c] || c)
    // Strip Project Gutenberg italics markers: _word_ -> word.
    // Keeps the text typeable and lets headings with an italicized
    // suffix ("JOURNAL--_continued_") still match the all-caps shape.
    .replace(/_([^_\n]+)_/g, "$1");
}

// Common front- and back-matter section keywords that mark a heading
// even when the line is only 2 words ("AUTHOR'S PREFACE", "FINAL EPILOGUE").
const SECTION_KEYWORDS = /\b(PREFACE|FOREWORD|INTRODUCTION|EPILOGUE|PROLOGUE|AFTERWORD|APPENDIX|CONCLUSION|DEDICATION)\b/i;

function isLikelyChapterHeading(line) {
  const t = line.trim();
  if (!CHAPTER_HEAD.test(t)) return false;
  if (/^(?:CHAPTER|Chapter|PART|Part|BOOK|Book|SECTION|Section)\b/.test(t)) return true;
  const wordCount = t.replace(/[^A-Za-z\s]/g, " ").trim().split(/\s+/).filter(Boolean).length;
  if (wordCount >= 3) return true;
  // 2-word fallback for common section headings.
  if (wordCount >= 2 && SECTION_KEYWORDS.test(t)) return true;
  return false;
}

function isBlankLine(s) {
  return !s || s.trim() === "";
}

function classifyLine(line, i, lines) {
  if (ROMAN_TITLE_HEAD.test(line)) return "roman-title";
  if (ROMAN_HEAD.test(line)) return "roman";
  if (NUMERIC_HEAD.test(line)) {
    // Numeric chapter headings live on their own line, surrounded by
    // blank lines. Without this, every "10. By _Method and discipline_..."
    // verse and "[33]" footnote in Sun Tzu becomes a chapter.
    const prev = i > 0 ? lines[i - 1] : "";
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    if (!isBlankLine(prev) || !isBlankLine(next)) return null;
    const m = line.match(NUMERIC_HEAD);
    const titleWords = m[2].trim().split(/\s+/);
    if (titleWords.length > 12) return null;
    return "numeric";
  }
  if (isLikelyChapterHeading(line)) return "caps";
  // Short single-word all-caps heading: only counts when isolated
  // between blank lines (Emerson essays: "FRIENDSHIP", "HEROISM").
  if (SHORT_CAPS_HEAD.test(line)) {
    const prev = i > 0 ? lines[i - 1] : "";
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    if (isBlankLine(prev) && isBlankLine(next)) return "caps";
  }
  return null;
}

function splitChapters(body) {
  const lines = body.split(/\n/);
  const heads = [];

  for (let i = 0; i < lines.length; i++) {
    const kind = classifyLine(lines[i], i, lines);
    if (!kind) continue;

    if (kind === "roman") {
      // Look ahead for a heading-like title line within 3 lines.
      let title = lines[i].trim();
      let lastI = i;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const t = lines[j].trim();
        if (!t) continue;
        if (classifyLine(lines[j], j, lines)) break;
        if (t.length > 90) break;
        if (!/^[A-Z]/.test(t)) break;
        if (/[!?:]/.test(t)) break;
        title = title.replace(/\.$/, "") + ". " + t;
        lastI = j;
        break;
      }
      heads.push({ kind, i, lastI, title });
      continue;
    }

    if (kind === "roman-title") {
      heads.push({ kind, i, lastI: i, title: lines[i].trim() });
      continue;
    }

    if (kind === "numeric") {
      const m = lines[i].match(NUMERIC_HEAD);
      const num = parseInt(m[1], 10);
      const t = m[2].trim().replace(/\s+/g, " ");
      heads.push({ kind, i, lastI: i, title: `${num}. ${t}` });
      continue;
    }

    if (kind === "caps") {
      heads.push({ kind, i, lastI: i, title: lines[i].trim() });
      continue;
    }
  }

  // Suppress bare Roman markers when a stronger signal is present --
  // they're intra-chapter dividers, not chapters.
  const counts = { caps: 0, numeric: 0, "roman-title": 0, roman: 0 };
  for (const h of heads) counts[h.kind]++;
  let filtered = heads;
  if (counts["roman-title"] >= 3) filtered = filtered.filter((h) => h.kind !== "roman");
  if (counts.numeric >= 3) filtered = filtered.filter((h) => h.kind !== "roman");

  // Drop numeric heads when they form multiple restarting sequences
  // (1..N then 1..M then 1..K) -- those are nested numbered verses or
  // footnotes inside a larger chapter, not chapter headings. A single
  // ascending sequence (Black Beauty: 1, 2, ..., 49) is preserved.
  const numericHeads = filtered.filter((h) => h.kind === "numeric");
  if (numericHeads.length >= 5) {
    let multipleSequences = false;
    let prev = 0;
    for (const h of numericHeads) {
      const n = parseInt(String(h.title).match(/^(\d+)/)?.[1] || "0", 10);
      if (n <= prev) { multipleSequences = true; break; }
      prev = n;
    }
    if (multipleSequences) filtered = filtered.filter((h) => h.kind !== "numeric");
  }

  // Drop TOC clusters first -- 4+ heads packed within an 8-line window
  // with <200 chars of body text between them. Run before merge so a
  // densely-packed TOC where each entry is "Chapter I. The Title" on
  // its own line doesn't collapse into a single mega-titled head that
  // the cluster filter would no longer recognize.
  const dropIxs = new Set();
  for (let i = 0; i < filtered.length; i++) {
    if (dropIxs.has(i)) continue;
    let runEnd = i;
    let totalBody = 0;
    while (runEnd + 1 < filtered.length) {
      const cur = filtered[runEnd];
      const nxt = filtered[runEnd + 1];
      const gap = nxt.i - (cur.lastI || cur.i);
      if (gap > 8) break;
      const slice = lines.slice((cur.lastI || cur.i) + 1, nxt.i).join("").trim();
      if (slice.length > 80) break;
      totalBody += slice.length;
      runEnd++;
    }
    // Allow ~50 chars of body per head in the cluster (TOCs commonly
    // have small fragments between entries -- punctuation, page numbers,
    // section sub-heads). Long TOCs need a higher absolute cap than a
    // flat 200, otherwise Aesop's 250-fable TOC and Don Quixote's
    // 100+ chapter TOC slip through with cumulative body in the
    // hundreds even though every individual gap is empty.
    const runLen = runEnd - i;
    if (runLen >= 3 && totalBody < 200 + runLen * 50) {
      /* The last head in the run is not necessarily a contents entry.
         When a contents page ends a few lines above the book's first
         chapter head -- Alice's sits 5 lines below the last entry, well
         inside the 8-line gap -- that real head is swept into the run
         and dropped with it, and the book silently loses chapter one.
         Nothing downstream can notice: the title strips to empty and
         the reader numbers chapters by position, so 11 chapters just
         looks like a book with 11 chapters.

         Tell them apart by what FOLLOWS. A contents entry is followed
         by the next entry or by whitespace; the real first chapter is
         followed by the chapter. */
      const last = filtered[runEnd];
      const afterEnd = runEnd + 1 < filtered.length ? filtered[runEnd + 1].i : lines.length;
      const after = lines.slice((last.lastI || last.i) + 1, afterEnd).join("").trim();
      /* Only rescue a head that is genuinely a chapter label -- "CHAPTER
         I.", "BOOK II". Measured: without this the rescue fires 165
         times, and the ones that cost body text are heads like PREFACE,
         a dedication, or a stray capitalised fragment, not chapters.
         Rescuing those does not recover a chapter; it promotes a scrap
         of front matter to a heading and the prose beneath it is
         reshaped around the mistake.

         A bare roman numeral is excluded for a second reason: the
         "roman" branch above carries a look-ahead that pulls the next
         line into the title, so rescuing one eats the first line of the
         following prose. */
      const rescuable = last.kind !== "roman" && CHAPTER_LABEL_PREFIX.test(String(last.title || "").trim());
      const dropTo = (rescuable && after.length > 400) ? runEnd - 1 : runEnd;
      // Still has to look like a cluster once the real head is excluded.
      if (dropTo - i >= 2) {
        for (let k = i; k <= dropTo; k++) dropIxs.add(k);
      }
      i = runEnd;
    }
  }
  const postCluster1 = filtered.filter((_, ix) => !dropIxs.has(ix));

  // Merge adjacent caps heads (within 2 lines): "Chapter I." +
  // "THE THREE PRESENTS..." → one heading.
  const merged = [];
  for (const h of postCluster1) {
    const prev = merged[merged.length - 1];
    if (
      prev && h.kind === "caps" && prev.kind === "caps" &&
      h.i - (prev.lastI || prev.i) <= 2
    ) {
      prev.title = prev.title.replace(/[,\s]+$/, "") + " " + h.title;
      prev.lastI = h.lastI;
      continue;
    }
    merged.push({ ...h });
  }
  let postCluster = merged;

  if (!postCluster.length) return [{ title: "Full text", body }];

  // Absorb continuation fragments: short all-caps lines immediately
  // after a heading get folded into the title. Handles 3-line chapter
  // titles like Three Musketeers Chapter IV's "THE SHOULDER OF ATHOS,
  // THE BALDRIC OF PORTHOS AND THE HANDKERCHIEF OF / ARAMIS".
  // Constrained: stops on 2+ consecutive blank lines (so a
  // CONTENTS heading doesn't pull in the entire TOC) and on any line
  // that itself classifies as a heading.
  const enriched = postCluster.map((h, ix) => {
    const next = postCluster[ix + 1];
    const stop = next ? next.i : lines.length;
    let title = h.title;
    let lastI = h.lastI;
    let blanks = 0;
    for (let j = lastI + 1; j < Math.min(lastI + 5, stop); j++) {
      const t = lines[j].trim();
      if (!t) {
        if (++blanks >= 2) break;
        continue;
      }
      if (classifyLine(lines[j], j, lines)) break;
      // Three acceptable shapes for a continuation:
      //   (1) clean all-caps fragment ("ARAMIS")
      //   (2) mostly-uppercase line under 90 chars with no terminal
      //       sentence punctuation ("JONATHAN HARKER'S JOURNAL--continued")
      //   (3) the title line of a bare label head (see below)
      const isCapsFrag = CAPS_FRAGMENT.test(lines[j]);
      let isMostlyUpper = false;
      if (!isCapsFrag && t.length <= 90 && !/[.!?]\s*$/.test(t) && /^[A-Z]/.test(t)) {
        const letters = t.replace(/[^A-Za-z]/g, "");
        if (letters.length >= 4) {
          const upper = letters.replace(/[^A-Z]/g, "").length;
          isMostlyUpper = upper / letters.length >= 0.5;
        }
      }
      /* (3) The head is nothing but "CHAPTER I." and this is the line
         glued directly beneath it. That line IS the chapter's title, in
         whatever case the book sets it -- an ordinary mixed-case title
         scores about 0.18 against the 0.5 uppercase test above, so it
         used to be left behind. The cost of leaving it: it stays in the
         body as a stray one-line paragraph the reader asks you to type,
         the bare label strips to an empty title, and identical empty
         titles let the contents-page dedupe drop a real chapter.

         Deliberately narrow. It fires only for the FIRST line after the
         head, only when nothing has been absorbed yet, and only when
         that line is glued to the head with no blank line between --
         which is what separates a title from the first line of prose.
         A trailing full stop still disqualifies it; "?" and "!" do not,
         because chapter titles are allowed to ask questions.

         The 48-character cap and the "--" test are measured, not
         guessed. Across the corpus 630 lines qualify on the other
         conditions. Every one that cost body text was 55 characters or
         longer, or carried a "--" -- those are not titles but the
         dash-separated chapter synopses in Twain's travel books, and
         folding one into a title took real prose out of the book. The
         cap rejects all 120 of those and keeps 483 of the 510 genuine
         titles. Erring this way is deliberate: a rejected fold merely
         forgoes an improvement, an accepted one deletes text. */
      const isBareLabelTitle =
        !isCapsFrag && !isMostlyUpper &&
        lastI === h.lastI && blanks === 0 && j === h.lastI + 1 &&
        BARE_LABEL_HEAD.test(title.trim()) &&
        t.length <= 48 && !/--/.test(t) &&
        !/\.\s*$/.test(t) && /^[A-Za-z"'(]/.test(t);
      if (!isCapsFrag && !isMostlyUpper && !isBareLabelTitle) break;
      if (title.toUpperCase().endsWith(t.toUpperCase())) break;
      title = title.replace(/[,\s]+$/, "") + " " + t;
      lastI = j;
      blanks = 0;
    }
    return { ...h, lastI, title };
  });

  // Drop earlier duplicates of the same title -- books often have a
  // Contents page that mirrors body chapter headings. The cluster
  // filter handles densely-packed TOCs; this catches the Black Beauty
  // case where Part I/II/III/IV in the TOC are too far apart to
  // cluster but match the body Parts verbatim.
  const titleIx = new Map();
  const dupDropped = new Set();
  for (let h = 0; h < enriched.length; h++) {
    const key = enriched[h].title.toLowerCase().replace(/\s+/g, " ").trim();
    if (titleIx.has(key)) dupDropped.add(titleIx.get(key));
    titleIx.set(key, h);
  }
  const dedupedHeads = enriched.filter((_, ix) => !dupDropped.has(ix));

  // Slice body between consecutive headings, dropping headings whose
  // body is too short to be a real chapter.
  const chapters = [];
  for (let h = 0; h < dedupedHeads.length; h++) {
    const cur = dedupedHeads[h];
    const startIx = (cur.lastI || cur.i) + 1;
    const endIx = h + 1 < dedupedHeads.length ? dedupedHeads[h + 1].i : lines.length;
    const slice = lines.slice(startIx, endIx).join("\n").trim();
    if (slice.length > 80) chapters.push({ title: cur.title.trim(), body: slice });
  }
  return chapters.length ? chapters : [{ title: "Full text", body }];
}

/* Title-case helper. Preserves Roman numerals and short all-caps
   abbreviations (M.A., H.L., U.S.A.) verbatim so they don't get
   mangled. Capitalizes after hyphens and apostrophes (Red-Headed,
   D'Artagnan, O'Brien). */
function smartTitleCase(s, { force = false } = {}) {
  if (!s) return s;
  if (!force) {
    const letters = s.replace(/[^A-Za-z]/g, "");
    if (!letters.length) return s;
    const upperRatio = letters.replace(/[^A-Z]/g, "").length / letters.length;
    if (upperRatio < 0.85) return s;
  }
  const tokens = s.split(/(\s+)/);
  let needsCap = true;
  return tokens.map((tok) => {
    if (/^\s+$/.test(tok)) return tok;
    // Roman numerals and bare numeric prefixes reset the title context
    // -- "Chapter I. THE..." should yield "Chapter I. The...", and
    // "2. the Hunt" should yield "2. The Hunt".
    if (/^[IVXLCDM]+\.?$/.test(tok)) { needsCap = true; return tok; }
    if (/^\d+\.?$/.test(tok)) { needsCap = true; return tok; }
    // Dotted abbreviations: "M.A.", "U.S.A.", "H.L." preserve as-is.
    if (/^[A-Z](?:\.[A-Z])+\.?$/i.test(tok) && tok.length <= 8) {
      needsCap = false;
      return tok.toUpperCase();
    }
    const lower = tok.toLowerCase();
    const stripped = lower.replace(/[^\w]/g, "");
    if (!stripped) return tok;
    if (!needsCap && SMALL_WORDS.has(stripped)) return lower;
    needsCap = false;
    return lower
      .replace(/^([^\w]*)(\w)/, (_, pre, ch) => pre + ch.toUpperCase())
      // Capitalize after hyphens (Red-Headed, Saint-Gervais).
      .replace(/-(\w)/g, (_, ch) => "-" + ch.toUpperCase())
      // Capitalize after apostrophe ONLY when 1-2 chars precede it
      // (D'Artagnan, O'Brien, L'Avenir). Possessive 's' stays lower.
      .replace(/^(\w{1,2})'(\w)/, (_, p, ch) => p + "'" + ch.toUpperCase());
  }).join("");
}

function chunkParagraphs(body, maxChars = 500) {
  const raw = body
    .replace(/\n{3,}/g, "\n\n")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out = [];
  for (const para of raw) {
    if (para.length <= maxChars) { out.push(para); continue; }
    const sentences = para.split(/([.!?]["')\]]?\s+)/);
    let buf = "";
    for (let i = 0; i < sentences.length; i += 2) {
      const s = sentences[i] + (sentences[i + 1] || "");
      if (!s.trim()) continue;
      if ((buf + s).length > maxChars && buf) {
        out.push(buf.trim()); buf = s;
      } else {
        buf += s;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

/* Drop leading position markers from a chapter title -- "1. My Early
   Home" becomes "My Early Home", "I. A Scandal..." becomes "A
   Scandal...", "Chapter I. The Three Presents..." becomes "The Three
   Presents...". The library detail page renders the absolute position
   via loop.index, so the title only needs the descriptive part.
   "Part I", "Epilogue", "Author's Preface" pass through unchanged. */
function stripLeadingChapterMarker(title) {
  const bare = title.trim();
  // Bare chapter labels with nothing else: collapse to empty so the
  // library dropdown renders just the position number.
  if (/^Chapter\s+[IVXLCDM]+\.?$/i.test(bare)) return "";
  if (/^Chapter\s+\d+\.?$/i.test(bare)) return "";
  if (/^[IVXLCDM]{1,6}\.?$/.test(bare)) return "";
  if (/^\d{1,3}\.?$/.test(bare)) return "";
  let t = title;
  t = t.replace(/^Chapter\s+[IVXLCDM]+\.?\s+/i, "");
  t = t.replace(/^Chapter\s+\d+\.?\s+/i, "");
  t = t.replace(/^[IVXLCDM]{1,6}\.\s+/, "");
  t = t.replace(/^\d{1,3}\.\s+/, "");
  return t.trim() || title.trim();
}

/* Strip noisy fragments commonly left in PG title fields. */
function cleanBookTitle(t) {
  return t
    .replace(/\s*;\s*(a new translation|being .+|or, .+|complete)\s*$/i, "")
    .replace(/\s*:\s*a play\s*$/i, "")
    .replace(/,\s*Complete\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* PG sometimes prefixes authors with biographical scaffolding lifted
   from the catalog ("active 6th century B.C. Sunzi", "Emperor of Rome
   Marcus Aurelius"). Drop those leading qualifiers. */
function cleanAuthor(a) {
  if (!a) return "Unknown";
  let s = String(a).replace(/\s+/g, " ").trim();
  s = s.replace(/^active\s+\d{1,4}(?:st|nd|rd|th)?\s+century\s+(?:B\.?C\.?|A\.?D\.?)\s+/i, "");
  s = s.replace(/^(Emperor|King|Queen|Prince|Princess|Pope|Saint)\s+of\s+\S+\s+/i, "");
  s = s.replace(/^Sir\s+/, "Sir ");
  // Specific common cases.
  s = s.replace(/^Sunzi$/i, "Sun Tzu");
  return s.trim();
}

function ingestFile(file) {
  const slug = path.basename(file, ".txt");
  const raw = fs.readFileSync(file, "utf8");
  const meta = detectMeta(raw);
  const body = asciify(stripHeader(raw));
  const chapters = splitChapters(body).map((c) => ({
    title: stripLeadingChapterMarker(
      smartTitleCase(asciify(c.title), { force: true }).replace(/\s+/g, " ").trim()
    ),
    paragraphs: chunkParagraphs(c.body).map((text, j) => ({ id: `p${j}`, text })),
  }));
  const totalParagraphs = chapters.reduce((n, c) => n + c.paragraphs.length, 0);
  const totalChars = chapters.reduce(
    (n, c) => n + c.paragraphs.reduce((m, p) => m + p.text.length, 0),
    0,
  );
  let title = meta.title
    ? smartTitleCase(asciify(meta.title), { force: true })
    : slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  title = cleanBookTitle(title);
  const author = cleanAuthor(meta.author ? asciify(meta.author) : null);
  return {
    slug,
    title,
    author,
    year: meta.yearText || null,
    chapters,
    chapterCount: chapters.length,
    paragraphCount: totalParagraphs,
    charCount: totalChars,
  };
}

function main() {
  if (!fs.existsSync(SRC_DIR)) { console.error("Missing", SRC_DIR); process.exit(1); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".txt"));
  if (!files.length) { console.log("No .txt sources found in", SRC_DIR); return; }
  const index = [];
  for (const f of files) {
    const out = ingestFile(path.join(SRC_DIR, f));
    fs.writeFileSync(path.join(OUT_DIR, out.slug + ".json"), JSON.stringify(out, null, 0));
    console.log(`  ${out.slug.padEnd(36)}  ${String(out.chapterCount).padStart(3)} chap | ${String(out.paragraphCount).padStart(5)} para | ${(out.charCount / 1000).toFixed(0)} k chars`);
    index.push({
      slug: out.slug, title: out.title, author: out.author, year: out.year,
      chapterCount: out.chapterCount, paragraphCount: out.paragraphCount,
      charCount: out.charCount,
    });
  }
  index.sort((a, b) => (a.author || "").localeCompare(b.author || "") || (a.title || "").localeCompare(b.title || ""));
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2));
  console.log(`\nWrote ${index.length} books -> ${INDEX}`);
}

main();
