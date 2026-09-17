/* Lazy-loaded parsers for EPUB and PDF imports on /custom/.
   - .txt / .md / paste → no parser needed; consumer handles directly.
   - .epub → fflate (ESM CDN, ~10 KB) unzips the package, we walk the
            spine, strip HTML, concat chapters.
   - .pdf  → pdfjs-dist (ESM CDN, ~300 KB) extracts text per page
            via getTextContent(). Scanned image-only PDFs return empty
            and we surface a friendly error.
   The CDN imports are deferred via dynamic import() so the cost is
   only paid when the user actually drops a file of that type. */

import { detectChapters } from "./chapter-detect.js";

const FFLATE_CDN = "https://esm.sh/fflate@0.8.2";
const PDFJS_CDN = "https://esm.sh/pdfjs-dist@4.5.136/build/pdf.mjs";
const PDFJS_WORKER = "https://esm.sh/pdfjs-dist@4.5.136/build/pdf.worker.mjs";

let _fflate = null;
async function fflate() {
  if (!_fflate) _fflate = await import(/* @vite-ignore */ FFLATE_CDN);
  return _fflate;
}
let _pdfjs = null;
async function pdfjs() {
  if (!_pdfjs) {
    _pdfjs = await import(/* @vite-ignore */ PDFJS_CDN);
    if (_pdfjs.GlobalWorkerOptions) {
      _pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    }
  }
  return _pdfjs;
}

/* Site-wide rule: typeable content has no smart punctuation. Em-dash
   becomes "--", en-dash "-", curly quotes/ellipsis become straight
   ASCII. Run on every imported text so users can actually type the
   characters without hunting for option-dash combinations. */
function asciify(s) {
  return String(s || "")
    .replace(/—/g, "--")
    .replace(/–/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...");
}

/* Document formats whose name turns up as the last word of a download
   filename. Matched case-insensitively, and NEVER against a name that
   already contains a space -- see below.

   Deliberately not "any three or four letters". "The-Odyssey-Full-text"
   must keep its "text"; "My-Book-pdf" must lose its "pdf". The only
   way to tell those apart is a list of the things a file format is
   actually called, so this is that list and nothing more. */
const FORMAT_WORDS = new Set([
  "pdf", "epub", "txt", "md", "doc", "docx", "rtf", "html", "htm", "mobi", "azw3",
]);

/* Words that make the thing after them the SUBJECT of a sentence
   rather than a leftover from a download.

   Round two read the trailing word of a spaceless filename as a format
   name and dropped it. That is right for "My-Book-pdf" and wrong for
   "Read-the-doc", "How-to-read-a-pdf" and "Intro-to-html" -- which are
   sentences someone typed, joined with hyphens instead of spaces, and
   whose last word is what they are about. The round-two comment
   already defended exactly that sentence in its SPACED form
   ("How to read a PDF.pdf") and then regressed its hyphenated twin,
   which is a fair description of how narrowly that fix was tested.

   An article or a preposition immediately before the format word is
   what tells the two apart. "Book pdf" is a filename; "the doc", "to
   html", "a pdf" are English. No part of speech beyond this short
   list is worth guessing at from a filename. */
const SUBJECT_MARKERS = new Set([
  "a", "an", "the", "to", "of", "on", "in", "about", "with", "from", "into",
  "your", "my",
]);

/* The title a file gets when nothing inside it supplies one.

   The old rule was "drop the extension", which is how an import landed
   on /custom/ called "The-Odyssey-Homer-Full-text-pdf". Downloaded
   files are named for URLs, not for people: the words are joined with
   hyphens or underscores, and the format is very often repeated as the
   last word before the real extension.

   So: strip the real extension. Then, ONLY if what is left has no
   spaces of its own, read runs of - and _ as word breaks and drop a
   trailing word that names a document format.

   Against the FORMAT_WORDS list, not against the file's own extension.
   That distinction is the whole of round two of this fix: the first
   version only dropped a trailing word that matched the REAL
   extension, so "My-Book-pdf.pdf" came out right and
   "My-Book-pdf.txt" came out "My Book pdf". The second is the common
   case, not the rare one -- this importer's own error message tells
   people with a scanned PDF to "run OCR first, then upload the .txt",
   so a .txt whose name still says pdf is the path the product asks
   for.

   The "no spaces" condition is the whole safety of this. A name that
   already contains a space was typed by a person, and a person's
   "How to read a PDF.pdf" must keep its last word -- there the "PDF"
   is the subject, not a leftover from a download. A name with no
   spaces at all cannot be a sentence, so re-reading its separators
   cannot destroy one.

   And only when the word BEFORE it is not a SUBJECT_MARKER. That is
   round three: "Read-the-doc" is a sentence and keeps its "doc";
   "My-Book-pdf" is a filename and loses its "pdf". The article or
   preposition is the whole signal.

   What this still gets wrong, knowingly: "Learning-html.txt" becomes
   "Learning". There is no marker before "html" and nothing else in a
   filename says whether that word is the subject or the format. A
   list of verbs would be guessing at grammar from a download name,
   which is a larger promise than this function should make. Rename on
   the card is the fix for the case it gets wrong.

   One trailing word, not a run of them: "My-Book-pdf-txt" keeps its
   "pdf". Two stacked format words is not a shape real downloads
   produce, and stripping greedily would eat a title that ends in a
   word this list happens to contain.

   Nothing is lowercased or title-cased: "The Odyssey" and "the odyssey"
   are different titles and this function has no business choosing.
   Rename on the card is how a title gets edited.

   EVERY filename fallback goes through here. There are four, and the
   fourth is not in this file: pages/custom-boot.js writes the parser's
   title into #paste-title and has its own fallback for when the parser
   supplies none. Round one wired the three in this file and swept only
   this file for stragglers, so the sweep reported "none left" while
   one was left. parseFile() below now guarantees a non-blank title so
   that fallback is belt to this braces, and the gate sweeps both
   files. */
export function cleanFilenameTitle(filename) {
  const raw = String(filename || "");
  const dot = raw.lastIndexOf(".");
  let base = dot > 0 ? raw.slice(0, dot) : raw;
  if (!/\s/.test(base)) {
    const words = base.replace(/[-_]+/g, " ").trim().split(" ").filter(Boolean);
    // Never down to nothing: a file honestly called "pdf.pdf" keeps
    // the only word it has.
    const last = words[words.length - 1];
    const before = words.length > 1 ? words[words.length - 2] : "";
    if (words.length > 1
        && FORMAT_WORDS.has(last.toLowerCase())
        && !SUBJECT_MARKERS.has(before.toLowerCase())) {
      words.pop();
    }
    base = words.join(" ");
  }
  return base.trim();
}

/* parseFile(file, onProgress): { title, text, chapters } — works for
   .txt, .md, .epub, .pdf. Throws on parse failure; caller renders the
   message.

   `text` is the whole document as one string and is exactly what it
   always was: it is what gets sanitized and cut into ~500-character
   segments, and scripts/check-import-extraction.mjs holds it to a
   word-for-word round trip. Nothing below changes it.

   `chapters` is new, and is the same document divided: [{title, body}].
   Where the format knows its own divisions -- an EPUB's spine items ARE
   its chapters -- they are taken from the file. Otherwise they are
   detected from the text (engine/chapter-detect.js). A format that
   knows better than the detector but only found one section falls back
   to detection too, because a single-file EPUB is a book in one blob
   and its headings are still in the prose.

   onProgress(done, total, unit) is optional and fires while a long
   document is being walked. A 600-page PDF takes a while, and "Parsing
   PDF…" sitting still for a minute is indistinguishable from a hang. */
export async function parseFile(file, onProgress) {
  const name = (file.name || "").toLowerCase();
  let result;
  if (name.endsWith(".epub")) result = await parseEpub(file, onProgress);
  else if (name.endsWith(".pdf")) result = await parsePdf(file, onProgress);
  else result = { title: cleanFilenameTitle(file.name), text: await file.text() };
  const text = asciify(result.text);
  const supplied = Array.isArray(result.chapters) ? result.chapters : [];
  const chapters = supplied.length >= 2
    ? supplied.map((c) => ({ title: asciify(c.title), body: asciify(c.body) }))
    : detectChapters(text);
  /* Whatever the format handed back, a blank is not a title. An EPUB
     can carry `<dc:title>   </dc:title>` and a PDF carries none at
     all, and a caller that gets "" has to invent one -- which is how
     pages/custom-boot.js came to hold a fourth copy of the
     strip-the-extension rule. Answer it here instead, once, so no
     caller ever needs its own. */
  const ownTitle = asciify(result.title).trim();
  return { title: ownTitle || cleanFilenameTitle(file.name), text, chapters };
}

/* An EPUB chapter's own name. The <head><title> is the one the
   producer wrote for that file; a first h1/h2/h3 is the one the reader
   sees. Both are read from the RAW xhtml, before htmlToText() deletes
   the whole <head> and flattens the headings into ordinary lines --
   after that pass the title is either gone or indistinguishable from
   the first sentence. */
function epubItemTitle(html) {
  const head = html.match(/<head\b[\s\S]*?<\/head>/i);
  const inHead = head && head[0].match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  const raw = (inHead && inHead[1]) || (h && h[1]) || "";
  return htmlToText(raw).replace(/\s+/g, " ").trim().slice(0, 120);
}

/* Spine items that are apparatus rather than text: the navigation
   document (EPUB 3 marks it properties="nav"), and the cover, contents
   or title page, which are short files with telling names. They stay
   in `text` -- that is deliberately unchanged -- but a chapter list
   that opens on "Cover" and "Table of Contents" is a worse list. */
const FRONT_MATTER_NAME = /(?:^|\/)(?:nav|toc|contents|cover|title(?:page)?)[^/]*$/i;
function isApparatusItem(item, body) {
  if (/\bnav\b/i.test(item.props || "")) return true;
  if (!body || body.trim().length < 40) return true;
  return body.trim().length < 200 && FRONT_MATTER_NAME.test(item.href || "");
}

/* An h1 taken as the chapter title is still sitting at the top of the
   body; leaving it there asks the user to type the heading twice. A
   <head><title> is not in the body at all, so the comparison simply
   finds nothing and the body is returned untouched. */
function dropLeadingTitle(body, title) {
  if (!title) return body;
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && lines[i].trim() === title) {
    return lines.slice(i + 1).join("\n").replace(/^\n+/, "");
  }
  return body;
}

/* Hand the main thread back so a progress message can actually paint.
   Without this the whole parse runs in one task and the UI is frozen
   until it finishes. */
const breathe = () => new Promise((r) => setTimeout(r, 0));

async function parseEpub(file, onProgress) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const { unzipSync, strFromU8 } = await fflate();
  const files = unzipSync(buf);
  // Locate the OPF (package) file via container.xml.
  const containerBytes = files["META-INF/container.xml"];
  if (!containerBytes) throw new Error("Not a valid EPUB (no container.xml).");
  const container = strFromU8(containerBytes);
  const opfMatch = container.match(/full-path="([^"]+)"/);
  if (!opfMatch) throw new Error("EPUB container missing OPF path.");
  const opfPath = opfMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opf = strFromU8(files[opfPath] || new Uint8Array());

  // Title from OPF metadata.
  const titleMatch = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  // `(titleMatch ? ... : ...)` is not enough: a package can carry
  // `<dc:title>   </dc:title>`, which matches and trims to nothing.
  const title = (titleMatch && titleMatch[1].trim()) || cleanFilenameTitle(file.name);

  // Build manifest id → { href, props }. `properties` is how EPUB 3
  // marks the navigation document, which is apparatus, not a chapter.
  const manifest = new Map();
  const itemRe = /<item\b[^>]*\/>/g;
  let im;
  while ((im = itemRe.exec(opf))) {
    const tag = im[0];
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
    const href = (tag.match(/\bhref="([^"]+)"/) || [])[1];
    const type = (tag.match(/\bmedia-type="([^"]+)"/) || [])[1] || "";
    const props = (tag.match(/\bproperties="([^"]*)"/) || [])[1] || "";
    if (id && href && /xhtml|html/.test(type)) manifest.set(id, { href: opfDir + href, props });
  }

  // Spine order.
  const spine = [];
  const itemrefRe = /<itemref\b[^>]*\bidref="([^"]+)"/g;
  let sm;
  while ((sm = itemrefRe.exec(opf))) {
    const ref = manifest.get(sm[1]);
    if (ref) spine.push(ref);
  }

  /* Walk the spine once, keeping BOTH readings.

     `chunks` is what it always was and is joined into the text the
     segments are cut from -- every spine item, in order, nothing
     dropped. `chapters` is the same walk with the file's own divisions
     kept: one entry per spine item, titled from its <head><title> or
     its first heading, with the navigation document and the short
     cover/contents files left out.

     The title has to be read from the RAW xhtml, because htmlToText()
     deletes <head> outright and turns <h1> into a plain line. That is
     why the chapter boundaries the EPUB already had have been thrown
     away until now: by the time anything looked, they were gone. */
  const chunks = [];
  const chapters = [];
  for (let i = 0; i < spine.length; i++) {
    const bytes = files[spine[i].href];
    if (bytes) {
      const html = strFromU8(bytes);
      const body = htmlToText(html);
      chunks.push(body);
      if (!isApparatusItem(spine[i], body)) {
        const t = epubItemTitle(html);
        chapters.push({
          title: t || `Section ${chapters.length + 1}`,
          body: dropLeadingTitle(body, t),
        });
      }
    }
    if (onProgress && (i === 0 || i % 5 === 4 || i === spine.length - 1)) {
      onProgress(i + 1, spine.length, "chapter");
      await breathe();
    }
  }
  const text = chunks.filter(Boolean).join("\n\n");
  if (!text.trim()) throw new Error("EPUB had no readable text content.");
  return { title, text, chapters };
}

/* Join a page's text items into a line of text.

   pdf.js does not hand back words. It hands back positioned FRAGMENTS,
   and a single word is split wherever kerning, a font change or a
   ligature interrupts it. Joining every fragment with a space -- which
   this did -- manufactures a space at each of those seams, which is
   where "beca use" and "T he" come from. The spaces are not in the PDF;
   we were inventing them.

   So concatenate, and insert a space only where the geometry shows a
   real gap: the distance from the end of one fragment to the start of
   the next, measured against the font size. A space is about a quarter
   of an em in most faces, so a gap under ~0.18em is a kerning seam, not
   a word break. hasEOL marks a genuine line end.

   Exported for scripts/check-pdf-spacing.mjs, which feeds it recorded
   pdf.js item streams -- both kinds, so it cannot pass by refusing to
   emit spaces at all. */
export function joinTextItems(items) {
  let out = "";
  /* The RIGHTMOST edge reached on this line so far -- not the edge of
     the previous fragment.

     Accented letters are the reason. A PDF frequently draws "u" and
     then jumps BACKWARDS to stamp the diaeresis over it, so the accent
     fragment starts left of where the "u" ended and carries zero width.
     Taking the previous fragment's right edge then put prevRight behind
     the base letter, and the next fragment ("ber") looked like it
     started a whole glyph-width later -- a word gap. The result was
     "u<combining diaeresis> ber": a space inside the word, on exactly
     the accented text a non-English document is full of.

     A mark drawn over an earlier glyph cannot advance the pen, so the
     line's right edge only ever moves forward. */
  let prevRight = null;
  let prevY = null;
  for (const raw of items || []) {
    const it = raw || {};                 // a null item must not throw
    const s = typeof it.str === "string" ? it.str : "";
    const tr = (it && it.transform) || [];
    const x = typeof tr[4] === "number" ? tr[4] : 0;
    const y = typeof tr[5] === "number" ? tr[5] : 0;
    const w = typeof it.width === "number" ? it.width : 0;
    // Font size: pdf.js puts the scale in the transform; height is a
    // reasonable fallback and 10 keeps a malformed item from dividing
    // the threshold down to nothing.
    const em = Math.abs(tr[3] || tr[0] || 0) || Math.abs(it.height || 0) || 10;

    if (!s) {
      if (it.hasEOL) { out += "\n"; prevRight = null; prevY = null; }
      continue;
    }

    if (prevRight !== null) {
      if (prevY !== null && Math.abs(y - prevY) > em * 0.5) {
        out += "\n";                       // dropped to a new line
      } else if (!/\s$/.test(out) && !/^\s/.test(s) && x - prevRight > em * 0.18) {
        out += " ";                        // a real word gap
      }
    }
    out += s;
    // Never let an overlay glyph drag the edge backwards.
    prevRight = prevRight === null ? x + w : Math.max(prevRight, x + w);
    prevY = y;
    if (it.hasEOL) { out += "\n"; prevRight = null; prevY = null; }
  }
  return out;
}

/* Letters only, no spaces: the shape of a line with the scanner's
   punctuation and spacing damage taken off. "LE JOURNAL DUNE FEMME DE
   CHAMBtlE 11" and "10 LE JOURNAL D'UNE FEMME DE CHAMBRE" reduce to
   skeletons three edits apart. */
const skeleton = (key) => key.replace(/\s+/g, "");

/* Levenshtein distance, but only asked whether it is within a budget,
   so it bails out of a row that cannot come back under it and rejects
   on the length difference before doing any work at all. */
function within(a, b, budget) {
  if (Math.abs(a.length - b.length) > budget) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > budget) return false;
    prev = cur;
  }
  return prev[b.length] <= budget;
}

/* A skeleton must match a cluster's on at least 80% of its characters,
   and be at least this long before it is matched fuzzily at all. */
const FUZZY_RATIO = 0.2;
const FUZZY_MIN = 12;

/* Drop running heads, running feet and page numbers.

   A scanned book repeats the book's title, the chapter title and the
   folio at the edge of every page, and pdf.js hands them back inline
   with the prose. Reported from a real import: the middle of a sentence
   read "...dont je ne pus m'expli- 10 LE JOURNAL D'UNE FEMME DE CHAMBRE
   quer la double expression...". Removing the header repairs the
   sentence. (It does NOT repair the hyphen break -- the earlier commit
   message claimed that, and it is wrong: 5df7f09's \p{Ll} de-hyphenation
   had already rejoined "m'expli-" and "quer", which sit on consecutive
   lines of the same page. See section A2 of the gate.)

   Only the outermost EDGE lines of each page are candidates. Two things
   can make one of those lines furniture:

     1. It is a FOLIO -- a line that is nothing but a page number.
     2. It RECURS at the same edge across the book.

   Both rules were far too eager when this arrived, and both were
   measured against the real 530-page scan of "Le Journal d'une femme de
   chambre" (the fixtures in scripts/fixtures/ are that book) before
   being rewritten. The numbers below are from that measurement.

   FOLIOS ARE DIGITS ONLY, unless roman pagination is demonstrably the
   norm. The original pattern was /(?:[ivxlcdm]{1,7}|\d{1,4})/i, which
   treats any line built only from the letters i v x l c d m as a page
   number. In the real book that destroyed all ten roman chapter numbers
   (IV, VI, VIII, IX, X, XI, XIII, XIV, XV, XVI) and the French pronoun
   "Il" at the foot of page 327, mid-sentence. "did", "mix", "civil",
   "mild", "vivid" and "livid" are all "folios" to it too.
   So roman numerals count only when the document as a whole paginates
   in them: at least half its pages carry a roman-only edge line, and
   more pages carry a roman one than an arabic one. Measured on the real
   scan: 16 pages have a roman-only edge line and 6 have an arabic-only
   one -- so a rule of "roman outnumbers arabic" ALONE would have said
   yes and eaten the chapter numbers again. The half-the-pages share is
   what actually holds the line. The cost is that genuinely roman front
   matter in an otherwise arabic book keeps its "xii"; that is the cheap
   direction to be wrong in.

   RECURRENCE NEEDS EVIDENCE, NOT JUST A COUNT. The old bar was
   max(3, 25% of pages), which is a bar on the document's LENGTH rather
   than on the line, so it ate a refrain closing three pages of a
   twelve-page pamphlet and a speaker name heading four pages of a
   ten-page scene, while missing the running head of the 530-page book
   entirely (its commonest spelling reaches 106 pages; the bar was 132).
   A plain floor cannot fix that: the reported seven-page run needs a
   head seen on 3 pages to go, and the real book has diary dates
   ("15 septembre.", "3 novembre.") sitting at page tops on 4 pages that
   must stay. 3-must-go and 4-must-stay is not a floor, it is a
   different question. So a recurring line is furniture only when all of:

     - it sits at the SAME edge (top or bottom) on at least 80% of the
       pages it appears on -- a running head is positionally fixed, a
       refrain is not necessarily;
     - AND EITHER it is folio-associated on at least half of those pages
       -- the line itself starts or ends with a number, or the edge line
       next to it is a bare folio -- and recurs on at least
       max(3, 15% of pages);
     - OR, with no folio anywhere near it, it recurs on at least
       max(8, 50% of pages). Without a page number beside it there is
       little evidence a repeated line is furniture rather than text,
       so it has to be nearly everywhere before we believe it.

   THE SPELLING OF THE HEAD IS NOT STABLE. Comparing normalised strings
   exactly got only 106 of the real book's 445 headed pages, because the
   scanner renders the same line about fifty ways: JOUKNAL, JOI'RNAL,
   /OURNAL, JOUL.>AL, CHAMBtlE, FExMME. 340 pages kept their head. So
   the keys are CLUSTERED before they are counted:

     - reduce the normalised key to a letters-only skeleton (drop the
       spaces too, since the scanner drops and adds them);
     - a key joins a cluster when its skeleton is within an edit
       distance of the cluster's key, the budget being 20% of the longer
       skeleton -- i.e. at least 80% of the characters must match;
     - only a key that ALREADY recurs on max(3, 5% of pages) by itself
       may open a cluster. Variants attach to a frequent key; they never
       chain to each other.
     - skeletons under 12 characters are matched exactly and never
       fuzzily, because a one-character budget on a short line merges
       genuinely different ones -- "ANTONIO." and "ANTONIA." are one
       edit apart.

   The seed rule is the one holding this up, and it is not a nicety.
   Ordinary prose at a page edge is far closer together than it looks: 
   two different sentences of the gate's filler differ by 6 edits over a
   40-character skeleton, and the 20% budget for that length is 8. Left
   to cluster pairwise they merge, the merged cluster appears at both
   edges of every page, and the whole document is deleted. Requiring a
   frequent seed stops it: distinct prose lines occur once each, so
   nothing seeds and nothing clusters.

   Frequency, the folio test and the same-edge test then all apply to
   the CLUSTER rather than to the exact string.

   On the real scan the head is now removed from 503 of the 530 pages,
   against 106 for exact matching and none before any of this, and the
   chapter numbers, the pronoun and the diary dates are all still there.

   KNOWN AND STILL UNFIXED: norm() erases digits before comparing, so
   "3 septembre." and "18 septembre." are the same line to this code. A
   short document in which EVERY page opens with a dated entry therefore
   still loses its dates -- they are folio-associated and they recur.
   The real book survives only because 4 of 530 pages is under the 15%
   share. Section D of the gate pins this.

   ALSO STILL UNFIXED: 27 of the 530 pages keep something. Twenty are
   heads mangled past the 80% bar ("^Ij, LE JOURNAL FEMME DE ??HAMBRIt");
   three are the half-title "LE JOURNAL", whose skeleton is 9 characters
   and so is matched exactly; four are ordinary sentences that happen to
   contain the word, and those must stay. Loosening the budget to 25%
   reaches 22 pages and to 30% reaches 16, with no over-reach visible on
   this book -- but this book can only show over-reach it happens to
   contain, so the conservative end was taken.

   Exported for scripts/check-running-heads.mjs, the same way
   joinTextItems is exported for scripts/check-pdf-spacing.mjs: parsePdf
   cannot run outside a browser with pdf.js loaded, so the gate feeds
   this recorded page text straight in. Nothing else imports it. */
export function stripRunningLines(pages) {
  if (pages.length < 5) return pages;
  const EDGE = 2;
  const norm = (l) => l.replace(/\d+/g, " ").replace(/[^\p{L}]+/gu, " ").trim().toLowerCase();

  const ARABIC_FOLIO = /^[\s.,\-–—]*\d{1,4}[\s.,\-–—]*$/;
  const ROMAN_FOLIO = /^[\s.,\-–—]*[ivxlcdm]{1,7}[\s.,\-–—]*$/i;
  /* A number at the very start or the very end of the line -- the two
     places a typesetter puts a folio beside a running head. */
  const CARRIES_FOLIO = /^\s*\d{1,4}\b|\b\d{1,4}\s*[.,]?\s*$/;

  const perPage = pages.map((pg) => pg.split("\n"));
  const solidPer = perPage.map((lines) => lines.map((l) => l.trim()).filter(Boolean));
  const edgeIdx = (solid) => {
    const top = [], bot = [];
    for (let i = 0; i < Math.min(EDGE, solid.length); i++) top.push(i);
    for (let i = Math.max(0, solid.length - EDGE); i < solid.length; i++) bot.push(i);
    return { top, bot };
  };

  // 1. Does this document paginate in roman numerals?
  let romanPages = 0, arabicPages = 0;
  for (const solid of solidPer) {
    const { top, bot } = edgeIdx(solid);
    const edge = [...new Set([...top, ...bot])].map((i) => solid[i]);
    if (edge.some((l) => ARABIC_FOLIO.test(l))) arabicPages++;
    if (edge.some((l) => ROMAN_FOLIO.test(l))) romanPages++;
  }
  const romanIsNorm = romanPages >= Math.max(5, Math.ceil(pages.length * 0.5))
    && romanPages > arabicPages;
  const isFolio = (l) => ARABIC_FOLIO.test(l) || (romanIsNorm && ROMAN_FOLIO.test(l));

  // 2. What appears at which edge of which page, and with a folio near it.
  const counts = new Map();
  const perPageKeys = [];
  for (const solid of solidPer) {
    const { top, bot } = edgeIdx(solid);
    const seen = new Map();
    for (const [side, idxs] of [["top", top], ["bot", bot]]) {
      for (const i of idxs) {
        const key = norm(solid[i]);
        if (key.length < 4) continue;
        const folio = CARRIES_FOLIO.test(solid[i])
          || (i > 0 && ARABIC_FOLIO.test(solid[i - 1]))
          || (i + 1 < solid.length && ARABIC_FOLIO.test(solid[i + 1]));
        const cur = seen.get(key) || { top: false, bot: false, folio: false };
        cur[side] = true;
        cur.folio = cur.folio || folio;
        seen.set(key, cur);
      }
    }
    perPageKeys.push(seen);
    for (const key of seen.keys()) counts.set(key, (counts.get(key) || 0) + 1);
  }

  // 3. Cluster the misspellings of one line onto the frequent spelling.
  const cluster = new Map();
  const seeds = [];
  const seedMin = Math.max(3, Math.ceil(pages.length * 0.05));
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  for (const [key, n] of ordered) {
    const sk = skeleton(key);
    let hit = null;
    if (sk.length >= FUZZY_MIN) {
      for (const seed of seeds) {
        const budget = Math.max(1, Math.floor(Math.max(sk.length, seed.sk.length) * FUZZY_RATIO));
        if (within(sk, seed.sk, budget)) { hit = seed; break; }
      }
    }
    if (!hit && n >= seedMin && sk.length >= FUZZY_MIN) {
      hit = { key, sk };
      seeds.push(hit);
    }
    cluster.set(key, hit ? hit.key : key);
  }

  // 4. Count, and decide, per cluster.
  const stats = new Map();
  for (const seen of perPageKeys) {
    const perCluster = new Map();
    for (const [key, v] of seen) {
      const c = cluster.get(key);
      const p = perCluster.get(c) || { top: false, bot: false, folio: false };
      p.top = p.top || v.top;
      p.bot = p.bot || v.bot;
      p.folio = p.folio || v.folio;
      perCluster.set(c, p);
    }
    for (const [c, v] of perCluster) {
      const s = stats.get(c) || { n: 0, top: 0, bot: 0, folio: 0 };
      s.n++;
      if (v.top) s.top++;
      if (v.bot) s.bot++;
      if (v.folio) s.folio++;
      stats.set(c, s);
    }
  }

  const withFolio = Math.max(3, Math.floor(pages.length * 0.15));
  const withoutFolio = Math.max(8, Math.ceil(pages.length * 0.5));
  const running = new Set();
  for (const [c, s] of stats) {
    if (s.top < s.n * 0.8 && s.bot < s.n * 0.8) continue;
    const bar = s.folio * 2 >= s.n ? withFolio : withoutFolio;
    if (s.n >= bar) running.add(c);
  }

  return perPage.map((lines) => {
    const idx = lines.map((l, i) => [l.trim(), i]).filter(([l]) => l);
    const drop = new Set();
    const consider = [...idx.slice(0, EDGE), ...idx.slice(-EDGE)];
    for (const [l, i] of consider) {
      if (isFolio(l) || running.has(cluster.get(norm(l)))) drop.add(i);
    }
    return lines.filter((_, i) => !drop.has(i)).join("\n");
  });
}

async function parsePdf(file, onProgress) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let lib;
  try {
    lib = await pdfjs();
  } catch (e) {
    throw new Error("Couldn't load the PDF parser. Check your network connection.");
  }
  const doc = await lib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    pages.push(joinTextItems(tc.items));
    // Release the page's operator list and font data. Holding all 600
    // pages of a large PDF resident is how the tab runs out of memory
    // partway through and the import comes back short.
    if (typeof p.cleanup === "function") p.cleanup();
    if (onProgress && (i === 1 || i % 10 === 0 || i === doc.numPages)) {
      onProgress(i, doc.numPages, "page");
      await breathe();
    }
  }
  /* De-hyphenate soft line breaks. A PDF text layer wraps by
     typesetting the page, so a hyphen at the end of a line is almost
     always a word broken in two -- "short-\nened" -- not a compound.
     Rejoin those. The test is lowercase-to-lowercase -- \p{Ll}, not
     [a-z], because [a-z] does not contain e-acute: French "pre-\ncis"
     and German "Pru-\nfer" were left with a stray hyphen in the middle
     of the word while the English case beside them was rejoined
     correctly. Found in a real French scan. It leaves
     "Anglo-\nSaxon" and "post-\nOffice" alone; anything this misses is
     closed up by normalizeTypeable() with the hyphen KEPT, so the word
     never gains a space either way -- it just keeps a hyphen that the
     typesetter meant as a line break. */
  const text = stripRunningLines(pages).join("\n\n").replace(/\s+\n/g, "\n")
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .trim();
  if (!text) {
    throw new Error("This PDF has no extractable text — looks like a scanned image. Run OCR first, then upload the .txt.");
  }
  return { title: cleanFilenameTitle(file.name), text };
}

function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  /* An EPUB chapter is an XHTML document: it opens with an XML prolog
     and a DOCTYPE, and its <head> carries a <title> that is the chapter
     name rather than prose. Stripping tags alone leaves the prolog
     (which starts "<?", so the tag pattern below never matched it) and
     the title TEXT, both of which landed in the text the user was asked
     to type -- every chapter began with `<?xml version="1.0" ...?>`. */
  s = s.replace(/<\?[\s\S]*?\?>/g, "");
  s = s.replace(/<!DOCTYPE[^>]*>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<head\b[\s\S]*?<\/head>/gi, "");
  // Treat block tags as paragraph breaks.
  s = s.replace(/<\/?(p|div|section|article|h[1-6]|li|blockquote|br)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/?[a-z][^>]*>/gi, "");
  // Decode entities — limited but covers the common cases.
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
       .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
       .replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”")
       .replace(/&lsquo;/g, "‘").replace(/&rsquo;/g, "’")
       .replace(/&hellip;/g, "…");
  // Collapse blank-line runs.
  s = s.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
