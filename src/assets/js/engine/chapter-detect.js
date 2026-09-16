/* Chapter detection for texts the USER imported.

   The library's 271 curated books are split by scripts/ingest-books.mjs
   at build time. A custom text has no build step -- it arrives in the
   browser as one string -- so the same job has to be done at import
   time, in the browser, with no Node.

   WHY THE REGEXES ARE COPIED RATHER THAN IMPORTED. scripts/ingest-books
   .mjs is a build script: it reads from disk, writes JSON, and is
   guarded by scripts/check-book-chapters.mjs, which pins the shape of
   the 271 books that already shipped. Importing from it would put the
   curated corpus one edit away from a change made for a user's PDF.
   The regexes below are the ones from ingest-books.mjs lines 106-136,
   copied verbatim, plus the pieces of splitChapters() that decide which
   candidate heads are real: the bare-roman suppression, the restarting
   numeric-sequence drop, the table-of-contents cluster filter, the
   caps-head merge, the duplicate-title drop, and the rule that a
   chapter's body has to exceed 80 characters.

   WHAT IS DELIBERATELY DIFFERENT FROM ingest-books.mjs:

     1. Markdown. A user's .md file heads its sections with `# `, `## `
        or `### `, which no Project Gutenberg plain text ever does.
        Two or more of those and they win outright -- mixing them with
        the all-caps prose rules splits the same document twice.

     2. Text before the first heading is KEPT, as a chapter titled
        "Opening". ingest-books drops it because in a Gutenberg file it
        is the licence banner and the title page. In a text someone
        imported themselves it is their own writing, and dropping it
        would mean the chapter view silently held less than the segment
        view of the same document.

     3. No smartTitleCase and no stripLeadingChapterMarker. The library
        renders "Chapter 4" from the position and wants only the
        descriptive half of the title; a custom text has no such frame,
        so the heading is shown as the document wrote it.

   KNOWN LIMIT, inherited from the port: CHAPTER_HEAD only recognises a
   chapter label followed by a ROMAN OR ARABIC numeral, so "Chapter One"
   spelled out is not a heading unless it is long enough to pass the
   all-caps rule. A document that numbers its chapters in words comes
   back as a single "Full text" chapter. That is the safe direction --
   the segment view is unaffected and the reader still works -- but it
   is a gap, not a decision. */

/* ── the heading patterns, verbatim from ingest-books.mjs:106-136 ── */

// "Chapter N", "Part N" etc., plus all-caps treatise heads. The
// all-caps clause must end with a letter or period -- never a comma --
// so plaque inscriptions like "SACRED TO THE MEMORY OF ROBERT LONG,"
// don't false-positive.
const CHAPTER_HEAD = /^\s*(?:(?:CHAPTER|Chapter|PART|Part|BOOK|Book|SECTION|Section|STAVE|Stave)[\s\.]+(?:[IVXLCDM\d]+)\b.*|[A-Z][A-Z][A-Z ,'.\-]{12,88}[A-Z.])\s*$/;

/* Same, but allowing a title after the numeral: "Chapter I. Into the
   Primitive" as well as "CHAPTER I.". Used to decide whether a head
   swept into a contents run is a real chapter worth rescuing. */
const CHAPTER_LABEL_PREFIX = /^(?:CHAPTER|Chapter|PART|Part|BOOK|Book|SECTION|Section|STAVE|Stave)[\s.]+[IVXLCDM\d]+\b/;

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
// spaces. Requires blank lines on both sides (handled in classifyLine)
// so random all-caps interjections in dialogue don't false-positive.
const SHORT_CAPS_HEAD = /^\s*[A-Z]{4,15}\s*$/;

// Common front- and back-matter section keywords that mark a heading
// even when the line is only 2 words ("AUTHOR'S PREFACE").
const SECTION_KEYWORDS = /\b(PREFACE|FOREWORD|INTRODUCTION|EPILOGUE|PROLOGUE|AFTERWORD|APPENDIX|CONCLUSION|DEDICATION)\b/i;

// Markdown, which ingest-books has no reason to know about.
const MD_HEAD = /^\s{0,3}#{1,3}\s+\S/;

/* A chapter whose body is shorter than this is not a chapter -- it is a
   contents entry, a running head, or a stray capitalised line. Same
   number ingest-books uses. */
const MIN_BODY = 80;

/* The title shown when nothing was found, and the title given to
   whatever a document says before its first heading. Exported because
   two gates and two pages assert on them and a second copy of a string
   is a second place for it to drift. */
export const FULL_TEXT_TITLE = "Full text";
export const OPENING_TITLE = "Opening";

function isBlankLine(s) {
  return !s || s.trim() === "";
}

function isLikelyChapterHeading(line) {
  const t = line.trim();
  if (!CHAPTER_HEAD.test(t)) return false;
  if (/^(?:CHAPTER|Chapter|PART|Part|BOOK|Book|SECTION|Section|STAVE|Stave)\b/.test(t)) return true;
  const wordCount = t.replace(/[^A-Za-z\s]/g, " ").trim().split(/\s+/).filter(Boolean).length;
  if (wordCount >= 3) return true;
  // 2-word fallback for common section headings.
  if (wordCount >= 2 && SECTION_KEYWORDS.test(t)) return true;
  return false;
}

function classifyLine(line, i, lines) {
  if (ROMAN_TITLE_HEAD.test(line)) return "roman-title";
  if (ROMAN_HEAD.test(line)) return "roman";
  if (NUMERIC_HEAD.test(line)) {
    // Numeric chapter headings live on their own line, surrounded by
    // blank lines. Without this, every "10. By method and discipline..."
    // verse and "[33]" footnote becomes a chapter.
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
  // between blank lines ("FRIENDSHIP", "HEROISM").
  if (SHORT_CAPS_HEAD.test(line)) {
    const prev = i > 0 ? lines[i - 1] : "";
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    if (isBlankLine(prev) && isBlankLine(next)) return "caps";
  }
  return null;
}

/* Candidate heads, before any filtering. Each carries the line it
   starts on (i), the last line its title spans (lastI) and the title
   text itself. */
function collectHeads(lines) {
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

    if (kind === "numeric") {
      const m = lines[i].match(NUMERIC_HEAD);
      const num = parseInt(m[1], 10);
      const t = m[2].trim().replace(/\s+/g, " ");
      heads.push({ kind, i, lastI: i, title: `${num}. ${t}` });
      continue;
    }

    heads.push({ kind, i, lastI: i, title: lines[i].trim() });
  }
  return heads;
}

/* Bare roman markers are intra-chapter dividers when a stronger signal
   is present, and restarting numeric runs are numbered verses rather
   than chapters. Both drops are ingest-books'. */
function suppressWeakHeads(heads) {
  const counts = { caps: 0, numeric: 0, "roman-title": 0, roman: 0 };
  for (const h of heads) counts[h.kind]++;
  let filtered = heads;
  if (counts["roman-title"] >= 3) filtered = filtered.filter((h) => h.kind !== "roman");
  if (counts.numeric >= 3) filtered = filtered.filter((h) => h.kind !== "roman");

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
  return filtered;
}

/* Drop table-of-contents clusters -- 4+ heads packed within an 8-line
   window with almost no body text between them.

   The rescue clause matters and is kept: when a contents page ends a
   few lines above the book's real first chapter head, that head is
   inside the 8-line window and would be swept away with the contents,
   silently costing chapter one. A head that is a genuine chapter label
   AND is followed by 400+ characters of prose is the real one. */
function dropTocClusters(heads, lines) {
  const dropIxs = new Set();
  const droppedLines = new Set();
  for (let i = 0; i < heads.length; i++) {
    if (dropIxs.has(i)) continue;
    let runEnd = i;
    let totalBody = 0;
    while (runEnd + 1 < heads.length) {
      const cur = heads[runEnd];
      const nxt = heads[runEnd + 1];
      const gap = nxt.i - (cur.lastI || cur.i);
      if (gap > 8) break;
      const slice = lines.slice((cur.lastI || cur.i) + 1, nxt.i).join("").trim();
      if (slice.length > MIN_BODY) break;
      totalBody += slice.length;
      runEnd++;
    }
    const runLen = runEnd - i;
    if (runLen >= 3 && totalBody < 200 + runLen * 50) {
      const last = heads[runEnd];
      const afterEnd = runEnd + 1 < heads.length ? heads[runEnd + 1].i : lines.length;
      const after = lines.slice((last.lastI || last.i) + 1, afterEnd).join("").trim();
      const rescuable = last.kind !== "roman" && CHAPTER_LABEL_PREFIX.test(String(last.title || "").trim());
      const dropTo = (rescuable && after.length > 400) ? runEnd - 1 : runEnd;
      if (dropTo - i >= 2) {
        for (let k = i; k <= dropTo; k++) { dropIxs.add(k); droppedLines.add(heads[k].i); }
      }
      i = runEnd;
    }
  }
  return { heads: heads.filter((_, ix) => !dropIxs.has(ix)), droppedLines };
}

/* Merge adjacent caps heads (within 2 lines): "CHAPTER I." +
   "THE THREE PRESENTS" is one heading on two lines. */
function mergeCapsHeads(heads) {
  const merged = [];
  for (const h of heads) {
    const prev = merged[merged.length - 1];
    if (prev && h.kind === "caps" && prev.kind === "caps" && h.i - (prev.lastI || prev.i) <= 2) {
      prev.title = prev.title.replace(/[,\s]+$/, "") + " " + h.title;
      prev.lastI = h.lastI;
      continue;
    }
    merged.push({ ...h });
  }
  return merged;
}

/* Absorb short all-caps continuation lines into the title above them. */
function absorbFragments(heads, lines) {
  return heads.map((h, ix) => {
    const next = heads[ix + 1];
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
      if (!CAPS_FRAGMENT.test(lines[j])) break;
      if (title.toUpperCase().endsWith(t.toUpperCase())) break;
      title = title.replace(/[,\s]+$/, "") + " " + t;
      lastI = j;
      blanks = 0;
    }
    return { ...h, lastI, title };
  });
}

/* A contents page that is too spread out to cluster still repeats the
   body's headings word for word. Keep the later one. */
function dropDuplicateTitles(heads) {
  const titleIx = new Map();
  const dropped = new Set();
  for (let h = 0; h < heads.length; h++) {
    const key = heads[h].title.toLowerCase().replace(/\s+/g, " ").trim();
    if (titleIx.has(key)) dropped.add(titleIx.get(key));
    titleIx.set(key, h);
  }
  return heads.filter((_, ix) => !dropped.has(ix));
}

/* Markdown path: every `# `/`## `/`### ` line is a heading, full stop.
   No cluster filter and no minimum body -- somebody who wrote `## Notes`
   over two lines of text meant it to be a section. */
function splitMarkdown(lines) {
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    if (!MD_HEAD.test(lines[i])) continue;
    const title = lines[i].replace(/^\s{0,3}#{1,3}\s+/, "").replace(/\s+#+\s*$/, "").trim();
    heads.push({ i, lastI: i, title });
  }
  const out = [];
  for (let h = 0; h < heads.length; h++) {
    const end = h + 1 < heads.length ? heads[h + 1].i : lines.length;
    const body = lines.slice(heads[h].lastI + 1, end).join("\n").trim();
    if (body) out.push({ title: heads[h].title, body });
  }
  return { heads, chapters: out };
}

/* detectChapters(text) -> [{ title, body }]

   Always returns at least one chapter. Fewer than two real ones means
   the document has no usable structure, and the honest answer is the
   whole thing under one heading rather than an arbitrary split. */
export function detectChapters(text) {
  const raw = String(text || "").replace(/\r\n?/g, "\n");
  const whole = raw.trim();
  const full = () => [{ title: FULL_TEXT_TITLE, body: whole }];
  if (!whole) return full();

  const lines = raw.split("\n");

  // Markdown wins outright when the document really uses it.
  const mdCount = lines.filter((l) => MD_HEAD.test(l)).length;
  if (mdCount >= 2) {
    const { heads, chapters } = splitMarkdown(lines);
    const preamble = lines.slice(0, heads[0].i).join("\n").trim();
    const all = preamble.length > MIN_BODY
      ? [{ title: OPENING_TITLE, body: preamble }, ...chapters]
      : chapters;
    return all.length >= 2 ? all : full();
  }

  let heads = collectHeads(lines);
  if (!heads.length) return full();
  heads = suppressWeakHeads(heads);
  const toc = dropTocClusters(heads, lines);
  heads = toc.heads;
  heads = mergeCapsHeads(heads);
  heads = absorbFragments(heads, lines);
  heads = dropDuplicateTitles(heads);

  const chapters = [];
  for (let h = 0; h < heads.length; h++) {
    const cur = heads[h];
    const startIx = (cur.lastI || cur.i) + 1;
    const endIx = h + 1 < heads.length ? heads[h + 1].i : lines.length;
    const body = lines.slice(startIx, endIx).join("\n").trim();
    if (body.length > MIN_BODY) chapters.push({ title: cur.title.trim(), body, headLine: cur.i });
  }
  if (!chapters.length) return full();

  /* Whatever the document said before its first surviving heading is
     the user's text too. ingest-books throws this away because it is
     Gutenberg boilerplate; here it is not.

     Unless it is the table of contents. A contents page sits exactly
     there, and the cluster filter above has just spent its effort
     deciding those lines are not chapters -- handing them back as an
     "Opening" chapter to type would undo that. So: kept only when no
     head was dropped as a contents entry above the first chapter. */
  const firstHeadLine = chapters[0].headLine;
  let tocAbove = false;
  for (const ln of toc.droppedLines) if (ln < firstHeadLine) tocAbove = true;
  const preamble = tocAbove ? "" : lines.slice(0, firstHeadLine).join("\n").trim();
  const all = chapters.map(({ title, body }) => ({ title, body }));
  if (preamble.length > MIN_BODY) all.unshift({ title: OPENING_TITLE, body: preamble });

  return all.length >= 2 ? all : full();
}

/* paragraphsOf(body) -> [{ id, text }]

   Blank lines separate paragraphs; a paragraph longer than maxChars is
   cut at sentence boundaries, the way ingest-books' chunkParagraphs
   does, so the reader's six-paragraphs-a-page is a sane amount to type.
   Ids are positional within the chapter, exactly like the library's
   JSON: p0, p1, p2 -- which is what makes bookProgress keys
   ("<chapterIndex>:<paragraphId>") mean the same thing for a custom
   text as they do for a book. */
export function paragraphsOf(body, maxChars = 500) {
  const raw = String(body || "")
    .replace(/\r\n?/g, "\n")
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
  return out.map((text, j) => ({ id: `p${j}`, text }));
}

/* The library's book shape, built from anything: a plain string, or the
   [{title, body}] a parser already knows (EPUB spine items carry their
   own chapter boundaries, so throwing them away to re-detect them would
   be worse than useless).

   Returns [{ title, paragraphs: [{id, text}] }] -- byte for byte the
   shape of src/data/books/*.json, which is what lets the practice
   page's book reader open a custom text with no second code path. */
export function buildChapters(input) {
  const list = Array.isArray(input) ? input : detectChapters(input);
  const out = list
    .map((c) => ({ title: String(c.title || "").trim(), paragraphs: paragraphsOf(c.body) }))
    .filter((c) => c.paragraphs.length);
  if (!out.length) return [];
  // A parser-supplied list can collapse to one chapter once empty ones
  // are dropped; name it the same as the detector would.
  if (out.length === 1 && !out[0].title) out[0].title = FULL_TEXT_TITLE;
  return out;
}
