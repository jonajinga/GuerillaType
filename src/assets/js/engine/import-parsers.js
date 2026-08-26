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
    pages.push(tc.items.map((it) => it.str || "").join(" "));
    // Release the page's operator list and font data. Holding all 600
    // pages of a large PDF resident is how the tab runs out of memory
    // partway through and the import comes back short.
    if (typeof p.cleanup === "function") p.cleanup();
    if (onProgress && (i === 1 || i % 10 === 0 || i === doc.numPages)) {
      onProgress(i, doc.numPages, "page");
      await breathe();
    }
  }
  const text = pages.join("\n\n").replace(/\s+\n/g, "\n").trim();
  if (!text) {
    throw new Error("This PDF has no extractable text — looks like a scanned image. Run OCR first, then upload the .txt.");
  }
  return { title: file.name.replace(/\.[^.]+$/, ""), text };
}

function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
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
