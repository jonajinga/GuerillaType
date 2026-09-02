/* Lazy-loaded parsers for EPUB and PDF imports on /custom/.
   - .txt / .md / paste → no parser needed; consumer handles directly.
   - .epub → fflate (ESM CDN, ~10 KB) unzips the package, we walk the
            spine, strip HTML, concat chapters.
   - .pdf  → pdfjs-dist (ESM CDN, ~300 KB) extracts text per page
            via getTextContent(). Scanned image-only PDFs return empty
            and we surface a friendly error.
   The CDN imports are deferred via dynamic import() so the cost is
   only paid when the user actually drops a file of that type. */

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

/* parseFile(file, onProgress): { title, text } — works for .txt, .md,
   .epub, .pdf. Throws on parse failure; caller renders the message.

   onProgress(done, total, unit) is optional and fires while a long
   document is being walked. A 600-page PDF takes a while, and "Parsing
   PDF…" sitting still for a minute is indistinguishable from a hang. */
export async function parseFile(file, onProgress) {
  const name = (file.name || "").toLowerCase();
  let result;
  if (name.endsWith(".epub")) result = await parseEpub(file, onProgress);
  else if (name.endsWith(".pdf")) result = await parsePdf(file, onProgress);
  else result = { title: file.name.replace(/\.[^.]+$/, ""), text: await file.text() };
  return { title: asciify(result.title), text: asciify(result.text) };
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
  const title = (titleMatch ? titleMatch[1] : file.name.replace(/\.[^.]+$/, "")).trim();

  // Build manifest id → href.
  const manifest = new Map();
  const itemRe = /<item\b[^>]*\/>/g;
  let im;
  while ((im = itemRe.exec(opf))) {
    const tag = im[0];
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
    const href = (tag.match(/\bhref="([^"]+)"/) || [])[1];
    const type = (tag.match(/\bmedia-type="([^"]+)"/) || [])[1] || "";
    if (id && href && /xhtml|html/.test(type)) manifest.set(id, opfDir + href);
  }

  // Spine order.
  const spine = [];
  const itemrefRe = /<itemref\b[^>]*\bidref="([^"]+)"/g;
  let sm;
  while ((sm = itemrefRe.exec(opf))) {
    const ref = manifest.get(sm[1]);
    if (ref) spine.push(ref);
  }

  // Concatenate chapter text.
  const chunks = [];
  for (let i = 0; i < spine.length; i++) {
    const bytes = files[spine[i]];
    if (bytes) chunks.push(htmlToText(strFromU8(bytes)));
    if (onProgress && (i === 0 || i % 5 === 4 || i === spine.length - 1)) {
      onProgress(i + 1, spine.length, "chapter");
      await breathe();
    }
  }
  const text = chunks.filter(Boolean).join("\n\n");
  if (!text.trim()) throw new Error("EPUB had no readable text content.");
  return { title, text };
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

   On the real scan this removes the two commonest spellings of the
   running head -- 158 pages of it -- where the old code removed none,
   and leaves the chapter numbers, the pronoun, and the diary dates.

   KNOWN AND STILL UNFIXED: norm() erases digits before comparing, so
   "3 septembre." and "18 septembre." are the same line to this code. A
   short document in which EVERY page opens with a dated entry therefore
   still loses its dates -- they are folio-associated and they recur.
   The real book survives only because 4 of 530 pages is under the 15%
   share. Section D of the gate pins this.

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

  // 2. What recurs, where, and with a folio beside it?
  const stats = new Map();
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
    for (const [key, v] of seen) {
      const s = stats.get(key) || { n: 0, top: 0, bot: 0, folio: 0 };
      s.n++;
      if (v.top) s.top++;
      if (v.bot) s.bot++;
      if (v.folio) s.folio++;
      stats.set(key, s);
    }
  }

  const withFolio = Math.max(3, Math.floor(pages.length * 0.15));
  const withoutFolio = Math.max(8, Math.ceil(pages.length * 0.5));
  const running = new Set();
  for (const [key, s] of stats) {
    if (s.top < s.n * 0.8 && s.bot < s.n * 0.8) continue;
    const bar = s.folio * 2 >= s.n ? withFolio : withoutFolio;
    if (s.n >= bar) running.add(key);
  }

  return perPage.map((lines) => {
    const idx = lines.map((l, i) => [l.trim(), i]).filter(([l]) => l);
    const drop = new Set();
    const consider = [...idx.slice(0, EDGE), ...idx.slice(-EDGE)];
    for (const [l, i] of consider) {
      if (isFolio(l) || running.has(norm(l))) drop.add(i);
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
  return { title: file.name.replace(/\.[^.]+$/, ""), text };
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
