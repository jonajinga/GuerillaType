#!/usr/bin/env node
/* Reading an imported text BY CHAPTER.

   A custom text used to be readable one way: ~500-character segments,
   "Segment 143 of 481". Now it can also be read the way the library's
   public-domain books are read — by chapter, six paragraphs to a page —
   and the two are always both available on the same text.

   The design that this gate exists to hold up: a custom text with
   chapters IS a book as far as /practice/ is concerned. The URL is
   ?book=custom:<id>, the JSON has the same shape as src/data/books/
   *.json, and every downstream piece — paging, the reader header,
   per-paragraph progress in profile.bookProgress, auto-advance — is the
   library code path with no second implementation. If that stops being
   true, something below breaks.

   WHAT IS ASSERTED, and why each one is not satisfiable by accident:

     A. A three-chapter .txt goes through the REAL file input on
        /custom/ — not a seeded localStorage record — and the import
        preview says how many chapters it found before anything is
        saved. chapCount lands on the index record and the chapters
        land in IndexedDB beside the segments.
     B. The chapter picker lists the titles, the page counts and a
        per-chapter progress figure. Titles are asserted exactly: a
        picker showing "Chapter 1, Chapter 2, Chapter 3" would pass a
        count and prove nothing about detection.
     C. The reader. The text on the typing surface is asserted to be
        the six paragraphs of page one, character for character, so a
        page that rendered the wrong text — or an empty one — cannot
        pass. The header reads "Page 1 of 2", which is only true if the
        chapter really was divided into pages.
     D. Auto-advance. The switch is the CUSTOM one (a custom text must
        not turn auto-advance on for the whole library), page 0 rolls
        into page 1 without showing the card, and the last page of a
        chapter rolls into the NEXT CHAPTER.
     E. bookProgress["custom:<id>"] grows by the paragraphs actually
        typed, keyed the same "<chapter>:<paragraphId>" a library book
        uses. Asserted at two points so a fixed number cannot pass.
     F. Without auto-advance the results card shows and its "Back to
        chapter list" button goes to /custom/#chapters-<id>, which
        opens the picker for that text.
     G. The segment path still works on the SAME text — this feature
        adds a way to read, it does not replace one.
     H. An EPUB brings its own chapter titles, read from each spine
        item's <head><title> before htmlToText deletes it. Built the
        way scripts/check-import-extraction.mjs builds one.

   TYPING PACE. 70 ms per key, never faster. TypingEngine.finish()
   flags anything over 250 wpm as suspect and auto-advance refuses a
   suspect result by design, so a 4 ms robot would "prove" auto-advance
   broken when it is working. See STATE.md.

   Serves _site itself on a port derived from this task id, and refuses
   to run until the server has proved it is THIS project answering.

   Usage:
     npm run build      # not optional: this reads _site, not src
     node scripts/check-custom-chapters.mjs
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const TASK = "custom-chapters";
const PORT = Number(process.env.PORT)
  || 8100 + ([...TASK].reduce((a, c) => a + c.charCodeAt(0), 0) % 600);
const ROOT = resolve("_site");

let pass = 0, fail = 0;
const chk = (ok, name, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
const eq = (got, want, name) =>
  chk(got === want, name, got === want ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err && err.message ? err.message : err}`);
  console.log("\nRUN ABORTED — the counts below are partial.");
  process.exit(1);
});

// ---------------------------------------------------------------- server
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon", ".xml": "application/xml; charset=utf-8",
};

try {
  await stat(join(ROOT, "practice", "index.html"));
} catch {
  console.log("  FAIL  _site is not built — run `npm run build` first");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    } catch {
      if (!extname(file)) file += ".html";
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});
await new Promise((ok, no) => {
  server.on("error", no);
  server.listen(PORT, "127.0.0.1", ok);
}).catch((e) => {
  console.log(`  FAIL  could not bind 127.0.0.1:${PORT} — ${e.code || e.message}`);
  console.log("\nRUN ABORTED — refusing to share a port with something else.");
  process.exit(1);
});
const B = `http://127.0.0.1:${PORT}`;

/* Prove what is answering before believing anything it says. A 200 from
   a sibling worker's site is not evidence. */
const probe = await fetch(B + "/practice/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe)
  && /id=["']?tt-stage["'\s>]/.test(probe);
chk(isThisProject, `server on ${PORT} is this project's /practice/`,
  isThisProject ? "" : `got ${probe.length} bytes`);
if (!isThisProject) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  process.exit(1);
}

// ------------------------------------------------------------- fixtures
const paras = (word, n) =>
  Array.from({ length: n }, (_, i) => `${word} paragraph ${i + 1} of this chapter, written plainly.`);
const CH1 = paras("Alpha", 7);      // 7 paragraphs -> 2 pages
const CH2 = paras("Bravo", 7);      // 7 paragraphs -> 2 pages
const CH3 = paras("Charlie", 3);    // 3 paragraphs -> 1 page
const TXT = [
  "CHAPTER I. THE ARRIVAL", "", CH1.join("\n\n"), "",
  "CHAPTER II. THE DEPARTURE", "", CH2.join("\n\n"), "",
  "CHAPTER III. THE RETURN", "", CH3.join("\n\n"), "",
].join("\n");
const PAGE0 = CH1.slice(0, 6).join(" ");
const PAGE1 = CH1.slice(6).join(" ");

/* ── a store-only ZIP writer, so an EPUB needs no dependency. Lifted
      from scripts/check-import-extraction.mjs, which proved fflate
      reads what it writes. ──────────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function zipStore(entries) {
  const chunks = [], central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([Buffer.concat(chunks), cenBuf, end]);
}

/* Two real chapters plus an EPUB 3 navigation document, which is
   apparatus and must not become a chapter called "Table of Contents".
   Each chapter's name is in <head><title> ONLY — not in the body — so
   a title that comes back right can only have come from there. */
const EPUB_CH1 = paras("Zulu", 4);
const EPUB_CH2 = paras("Yankee", 4);
function buildEpub() {
  const doc = (title, ps) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head>
<body>${ps.map((p) => `<p>${p}</p>`).join("\n")}</body></html>`;
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">One</a></li><li><a href="ch2.xhtml">Two</a></li></ol></nav></body></html>`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>Two Chapter Book</dc:title><dc:identifier id="id">urn:uuid:two</dc:identifier>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="nav"/><itemref idref="ch1"/><itemref idref="ch2"/></spine>
</package>`;
  const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
  return zipStore([
    ["mimetype", "application/epub+zip"],
    ["META-INF/container.xml", container],
    ["OEBPS/content.opf", opf],
    ["OEBPS/nav.xhtml", nav],
    ["OEBPS/ch1.xhtml", doc("The Long Walk Home", EPUB_CH1)],
    ["OEBPS/ch2.xhtml", doc("What Came After", EPUB_CH2)],
  ]);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const pageErrors = [];
/* Desktop viewport, no touch: auto-advance is off on touch devices by
   design, so a coarse-pointer context would fail section D for the
   wrong reason. Service workers blocked: pwa.js reloads on
   controllerchange and a reload landing mid-run rebuilds the DOM. */
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block", hasTouch: false });
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

/* A reverted build cannot do any of this, and a gate that dies on a
   Playwright stack trace tells a verifier nothing about how far it
   got. Every wait that the rest of the run depends on goes through
   here: it records a FAIL, prints the counts so far, and stops. */
async function need(selector, why, timeout = 30000) {
  const el = await page.waitForSelector(selector, { timeout }).catch(() => null);
  if (el) return el;
  chk(false, why, `never saw ${selector}`);
  console.log("\nRUN ABORTED — the counts below are partial.");
  await browser.close().catch(() => {});
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

async function freshCustomPage() {
  await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    localStorage.clear();
    // The bundled sample seeds itself into an empty list; it would be a
    // second .saved-item and every "the first card" below would be it.
    localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    await new Promise((r) => {
      const q = indexedDB.deleteDatabase("tt-custom");
      q.onsuccess = q.onerror = q.onblocked = () => r();
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await need(".saved-item, .stats-empty", "/custom/ finished booting");
}

/* Import through the real file input and the real save button. */
async function importFile(name, mimeType, buffer) {
  await page.waitForSelector("#uploader-file", { state: "attached", timeout: 30000 });
  await page.setInputFiles("#uploader-file", { name, mimeType, buffer });
  await page.waitForFunction(() => document.querySelector("#paste-text").value.length > 100, { timeout: 60000 });
  const notice = (await page.textContent("#chapter-notice").catch(() => "")) || "";
  await page.click("#paste-save");
  await need(".saved-item", "the import produced a saved text");
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0].id);
  return { id, notice: notice.replace(/\s+/g, " ").trim() };
}

const surfaceText = () => page.$$eval("#tt-text .tt-char", (els) =>
  els.filter((e) => !e.classList.contains("tt-char--extra"))
    .map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));

/* 70 ms per key. Slower than a person, but never faster than the
   engine's suspect threshold. */
const typeAll = async (delay = 70) => {
  await page.click(".tt-stage").catch(() => {});
  const target = await surfaceText();
  for (const ch of target) await page.keyboard.type(ch, { delay });
  return target;
};

const readerHeader = () => page.evaluate(() => {
  const h = document.getElementById("tt-book-header");
  const t = (sel) => {
    const n = h && h.querySelector(sel);
    return n ? n.textContent.trim() : null;
  };
  return {
    exists: !!h,
    eyebrow: t(".tt-book-eyebrow"),
    chapter: t(".tt-book-chapter"),
    pageLine: t(".tt-book-page"),
    flat: h ? h.textContent.replace(/\s+/g, " ").trim() : null,
  };
});

const bookProgress = (id) => page.evaluate((tid) => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const active = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const p = ps.find((x) => x.id === active) || ps[0];
  const bp = (p && p.bookProgress && p.bookProgress["custom:" + tid]) || null;
  return bp ? { keys: Object.keys(bp.typed || {}).sort(), lastChapter: bp.lastChapter, lastPage: bp.lastPage, sig: bp.sig || null } : null;
}, id);

const achievementIds = () => page.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const active = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const p = ps.find((x) => x.id === active) || ps[0];
  return (p && p.achievements) || [];
});

const progressKeys = () => page.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const active = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const p = ps.find((x) => x.id === active) || ps[0];
  return Object.keys((p && p.bookProgress) || {});
});

const autoMap = () => page.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const active = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const p = ps.find((x) => x.id === active) || ps[0];
  return (p && p.preferences && p.preferences.autoAdvance) || {};
});

// ═══════════════════════════════ A. import a three-chapter .txt
console.log("\n## A. A three-chapter .txt, imported through the real file input");
await freshCustomPage();
const { id, notice } = await importFile("three-chapters.txt", "text/plain", Buffer.from(TXT, "utf8"));
chk(/^Found 3 chapters\b/.test(notice),
  "A. the import preview says how many chapters it found, before saving", JSON.stringify(notice));

const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0]);
eq(rec.chapCount, 3, "A. chapCount lands on the index record");
const cardMeta = ((await page.textContent(".saved-item__meta").catch(() => "")) || "").replace(/\s+/g, " ").trim();
chk(/·\s*3 chapters\b/.test(cardMeta) && /\bsegments\b/.test(cardMeta),
  "A. and the card says so, next to its segment count", JSON.stringify(cardMeta));
chk((rec.segCount | 0) >= 2, "A. and the segment count is still there — both readings exist",
  `segCount=${rec.segCount}`);
chk(!rec.chapters,
  "A. the chapter bodies are NOT inlined in localStorage when IndexedDB took them");

const idbChapters = await page.evaluate((tid) => new Promise((res) => {
  const q = indexedDB.open("tt-custom");
  q.onerror = q.onblocked = () => res(null);
  q.onsuccess = () => {
    try {
      const g = q.result.transaction("segments", "readonly").objectStore("segments").get(tid);
      g.onsuccess = () => res(g.result || null);
      g.onerror = () => res(null);
    } catch { res(null); }
  };
}), id);
chk(!!idbChapters && Array.isArray(idbChapters.chapters) && idbChapters.chapters.length === 3,
  "A. the chapters are in IndexedDB, in the same record as the segments",
  idbChapters ? `chapters=${(idbChapters.chapters || []).length} segments=${(idbChapters.segments || []).length}` : "no record");
chk(!!idbChapters && Array.isArray(idbChapters.segments) && idbChapters.segments.length >= 2,
  "A. …and writing the chapters did not clobber the segments");
const ch1rec = (idbChapters && Array.isArray(idbChapters.chapters) && idbChapters.chapters[0]) || null;
const ch1paras = (ch1rec && ch1rec.paragraphs) || [];
eq(ch1paras.length, 7, "A. chapter one kept all seven of its paragraphs");
eq(ch1paras[0] && ch1paras[0].id, "p0", "A. paragraph ids are the library's shape");
eq(ch1paras[0] && ch1paras[0].text, CH1[0], "A. and the text under them is the document's");

// ═══════════════════════════════════════════ B. the chapter picker
console.log("\n## B. The chapter picker on /custom/");
const chapBtn = `.saved-item [data-action="chapters"][data-id="${id}"]`;
const hasChapBtn = await page.isVisible(chapBtn).catch(() => false);
chk(hasChapBtn, "B. every saved text offers ‘Choose chapter’");
chk(await page.isVisible(`.saved-item [data-action="segments"][data-id="${id}"]`),
  "B. …and still offers ‘Choose segment’ — both ways, always");
if (!hasChapBtn) {
  console.log("\nRUN ABORTED — without the ‘Choose chapter’ button nothing below can run.");
  await browser.close().catch(() => {});
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}
await page.click(chapBtn);
await need(`#chapters-${id} .seg-picker__item`, "B. the chapter picker painted a list", 15000);
const rows = await page.$$eval(`#chapters-${id} .seg-picker__item`, (els) =>
  els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
eq(rows.length, 3, "B. three chapters listed");
chk(rows[0].includes("CHAPTER I. THE ARRIVAL"),
  "B. the first row names the chapter as the document wrote it", JSON.stringify(rows[0]));
chk(rows[1].includes("CHAPTER II. THE DEPARTURE") && rows[2].includes("CHAPTER III. THE RETURN"),
  "B. …and so do the other two", JSON.stringify(rows.slice(1)));
chk(/2 pages/.test(rows[0]) && /1 page\b/.test(rows[2]),
  "B. page counts are per chapter, six paragraphs to a page — 7 paragraphs is 2 pages, 3 is 1",
  JSON.stringify([rows[0], rows[2]]));
chk(/0% typed/.test(rows[0]), "B. nothing is typed yet", JSON.stringify(rows[0]));
const firstHref = await page.getAttribute(`#chapters-${id} .seg-picker__item[data-ch="0"]`, "href");
eq(firstHref, `/practice/?book=custom%3A${id}&ch=0&page=0`,
  "B. the row links into the reader as ?book=custom:<id>");

// ═════════════════════════════════════════════════ C. the reader
console.log("\n## C. The reader — the library's, pointed at an imported text");
await page.click(`#chapters-${id} .seg-picker__item[data-ch="0"]`);
await need("#tt-text .tt-char", "C. the reader rendered a typing surface for chapter one");
const h0 = await readerHeader();
chk(h0.exists, "C. the book reader header is on screen", h0.flat || "");
eq(h0.eyebrow, "Custom text", "C. the eyebrow says where the text came from");
eq(h0.chapter, "CHAPTER I. THE ARRIVAL", "C. the chapter title is the document's");
eq(h0.pageLine, "Page 1 of 2", "C. the page counter is real — 7 paragraphs make 2 pages");
/* "three chapters", not "three-chapters": a file that supplies no
   title of its own is now named by engine/import-parsers.js's
   cleanFilenameTitle(), which reads the hyphens in a spaceless
   download name as word breaks. The point of the assertion is
   unchanged -- the reader header still carries the text's OWN title
   next to the chapter's -- only the string the fixture produces has
   moved. See scripts/check-custom-card.mjs section F. */
chk((h0.flat || "").includes("three chapters"),
  "C. the text's own title is still shown", JSON.stringify(h0.flat));
/* THE assertion of this file: the six paragraphs on the surface are
   the six paragraphs of page one, character for character. */
eq(await surfaceText(), PAGE0, "C. page one holds exactly the first six paragraphs");
const back = await page.evaluate(() => {
  const a = document.getElementById("tt-back-link");
  return a && !a.hidden ? { text: a.textContent.trim(), href: a.getAttribute("href") } : null;
});
eq(back && back.text, "← Back to your custom texts", "C. the back link goes back to /custom/, not the library");
eq(back && back.href, `/custom/#chapters-${id}`, "C. …straight to this text's chapter list");

// ══════════════════════════════════════════════ D. auto-advance
console.log("\n## D. Auto-advance through the pages and into the next chapter");
chk(await page.isVisible("#tt-autoadvance"), "D. the Auto switch is offered");
eq(await page.getAttribute("#tt-autoadvance", "aria-pressed"), "false", "D. it starts off");
await page.click("#tt-autoadvance");
const map = await autoMap();
chk(map.custom === true,
  "D. the switch it turns on is the CUSTOM one, not the library's", JSON.stringify(map));
chk(map.book !== true,
  "D. reading your own text by chapter does not switch auto-advance on for the whole library",
  JSON.stringify(map));

const typed0 = await typeAll();
eq(typed0, PAGE0, "D. typed page one");
await page.waitForTimeout(1200);
chk(await page.$eval("#tt-results", (el) => el.hidden), "D. the results card did NOT show");
chk(/[?&]page=1\b/.test(page.url()), "D. the URL moved to page 1", page.url());
const h1 = await readerHeader();
eq(h1.pageLine, "Page 2 of 2", "D. the header moved with it");
eq(h1.chapter, "CHAPTER I. THE ARRIVAL", "D. still in chapter one");
eq(await surfaceText(), PAGE1, "D. and page two is the seventh paragraph");
const strip = (await page.textContent("#tt-last-run").catch(() => "")) || "";
chk(/Page 1 of 2 done/i.test(strip) && /wpm/.test(strip),
  "D. the last-run strip names what was finished", JSON.stringify(strip.replace(/\s+/g, " ").trim()));

const prog1 = await bookProgress(id);
chk(!!prog1, "E. bookProgress has a record under the custom slug");
eq(JSON.stringify(prog1 && prog1.keys), JSON.stringify(["0:p0", "0:p1", "0:p2", "0:p3", "0:p4", "0:p5"]),
  "E. six paragraphs marked, keyed <chapter>:<paragraphId> like a book");
chk(!!(prog1 && prog1.sig), "E. and the chapter structure is fingerprinted, so a re-import cannot mis-point them");

// The LAST page of a chapter has to roll into the next chapter.
await typeAll();
await page.waitForTimeout(1200);
chk(await page.$eval("#tt-results", (el) => el.hidden), "D. still no results card");
chk(/[?&]ch=1\b/.test(page.url()) && /[?&]page=0\b/.test(page.url()),
  "D. the last page of chapter one rolled into chapter two", page.url());
const h2 = await readerHeader();
eq(h2.chapter, "CHAPTER II. THE DEPARTURE", "D. the header is on the next chapter");
eq(h2.pageLine, "Page 1 of 2", "D. …at its first page");
eq(await surfaceText(), CH2.slice(0, 6).join(" "), "D. and the new page holds chapter two's paragraphs");

const prog2 = await bookProgress(id);
eq(JSON.stringify(prog2 && prog2.keys),
  JSON.stringify(["0:p0", "0:p1", "0:p2", "0:p3", "0:p4", "0:p5", "0:p6"]),
  "E. progress GREW by the seventh paragraph — not a fixed number");
eq(prog2 && prog2.lastChapter, 0, "E. lastChapter is where the finished run was");
eq(prog2 && prog2.lastPage, 1, "E. lastPage too, which is what /custom/ resumes from");

/* Resume, read off the same record, BEFORE anything else is typed.
   Asserted here and again in section G after a run in a different
   chapter, so a hardcoded href cannot satisfy both. */
await page.goto(`${B}/custom/`, { waitUntil: "domcontentloaded" });
await need(`.saved-item [data-action="chapter-resume"]`, "E. /custom/ offers a chapter resume after a chapter was read", 20000);
eq(await page.getAttribute(`.saved-item [data-action="chapter-resume"]`, "href"),
  `/practice/?book=custom%3A${id}&ch=0&page=1`,
  "E. /custom/ offers to resume at chapter 1, page 2 — where the reader is");

// ═══════════════════════════ F. the card, and the way back
console.log("\n## F. With the switch off, the card and its ‘Back to chapter list’");
await page.goto(`${B}/practice/?book=custom:${id}&ch=1&page=0`, { waitUntil: "domcontentloaded" });
await need("#tt-autoadvance", "F. the Auto switch is on the reader page", 20000);
await page.click("#tt-autoadvance");
eq(await page.getAttribute("#tt-autoadvance", "aria-pressed"), "false", "F. switched off again");
await page.goto(`${B}/practice/?book=custom:${id}&ch=2&page=0`, { waitUntil: "domcontentloaded" });
await need("#tt-text .tt-char", "F. chapter three rendered a typing surface");
const h3 = await readerHeader();
eq(h3.chapter, "CHAPTER III. THE RETURN", "F. deep-linked straight into chapter three");
eq(h3.pageLine, "Page 1 of 1", "F. which is one page long");
eq(await surfaceText(), CH3.join(" "), "F. holding all three of its paragraphs");
await typeAll();
await need("#tt-results:not([hidden])", "F. the results card appeared with the switch off", 15000);
chk(!(await page.$eval("#tt-results", (el) => el.hidden)), "F. the results card shows when the switch is off");
const cardHref = await page.getAttribute("#tt-results a:has-text('Back to chapter list')", "href");
eq(cardHref, `/custom/#chapters-${id}`, "F. ‘Back to chapter list’ goes to this text's chapter list");
const nextHref = await page.getAttribute("#tt-next-page", "href");
eq(nextHref, `/custom/#chapters-${id}`,
  "F. and at the end of the last chapter ‘next page’ goes there too, not to /library/");

const prog3 = await bookProgress(id);
eq((prog3 && prog3.keys || []).length, 10,
  "E. chapter three's three paragraphs took the total to ten",
  JSON.stringify(prog3 && prog3.keys));

/* ═══════ K. A custom text is not the public-domain library ═══════

   Everything above this point was a book as far as practice-boot is
   concerned: state.mode === "book", progress in bookProgress. That is
   the design, and it is also how an imported PDF came to unlock "Type
   your first paragraph from a public-domain book" -- the Library
   achievements count bookProgress entries, and there was nothing in
   the map to tell a library slug from a custom one.

   Three pages of a text of the profile's own have now been typed, on a
   profile that started empty, so any Library badge present here was
   not earned. */
console.log("\n## K. Reading your own text does not unlock the library's badges");
const LIBRARY_BADGES = [
  "library-first-paragraph", "library-first-chapter", "library-bookworm",
  "library-chars-10k", "library-chars-50k", "library-chars-200k",
  "library-books-10", "books-1", "books-5",
];
const afterCustom = await achievementIds();
const wrongly = LIBRARY_BADGES.filter((b) => afterCustom.includes(b));
chk(wrongly.length === 0,
  "K. no Library achievement unlocked by typing an imported text",
  wrongly.length ? `wrongly unlocked: ${wrongly.join(", ")}` : `${afterCustom.length} achievement(s), none of them the library's`);
chk((await progressKeys()).some((k) => k.startsWith("custom:")),
  "K. …and this is not because nothing was recorded — the custom progress IS there",
  JSON.stringify(await progressKeys()));
chk(afterCustom.length > 0,
  "K. …nor because achievements are not being evaluated at all",
  JSON.stringify(afterCustom.slice(0, 6)));

/* The control. Without it, deleting every Library achievement from the
   catalog would pass the three checks above. A real library book, one
   real paragraph, and the badge must appear. */
await page.goto(`${B}/practice/?book=house-of-mirth&ch=0&p=p0`, { waitUntil: "domcontentloaded" });
await need("#tt-text .tt-char", "K. a real library book still opens");
const libTarget = await typeAll();
chk(libTarget.startsWith("When Lily woke"),
  "K. control: typed a real paragraph from the library", JSON.stringify(libTarget.slice(0, 30)));
await page.waitForTimeout(1200);
const afterLibrary = await achievementIds();
chk(afterLibrary.includes("library-first-paragraph"),
  "K. control: the library badge DOES unlock for a library book — the filter is on the slug, not on the badge",
  JSON.stringify(afterLibrary.filter((a) => /^library|^books-/.test(a))));
chk(afterLibrary.includes("books-1"),
  "K. control: and so does ‘First chapter’, which counts bookProgress keys",
  JSON.stringify(afterLibrary.filter((a) => /^books-/.test(a))));

// ═══════════════════════════════ G. the hash opens the picker
console.log("\n## G. /custom/#chapters-<id> opens that text's chapter list");
await page.goto(`${B}/custom/#chapters-${id}`, { waitUntil: "domcontentloaded" });
await need(`#chapters-${id} .seg-picker__item`, "G. the hash opened the chapter picker", 20000);
const rows2 = await page.$$eval(`#chapters-${id} .seg-picker__item`, (els) =>
  els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
eq(rows2.length, 3, "G. the picker opened on its own");
chk(/100% typed/.test(rows2[0]),
  "G. chapter one now reads 100% typed — the progress is the reader's, read back",
  JSON.stringify(rows2[0]));
chk(/0% typed/.test(rows2[1]),
  "G. chapter two, which was only started, does not", JSON.stringify(rows2[1]));
chk(await page.isVisible(`.saved-item [data-action="chapter-resume"]`),
  "G. and the card now offers to resume where the reader stopped");
const resumeHref = await page.getAttribute(`.saved-item [data-action="chapter-resume"]`, "href");
eq(resumeHref, `/practice/?book=custom%3A${id}&ch=2&page=0`,
  "G. resume MOVED with the last run — it was chapter 1 page 2 above, it is chapter 3 page 1 now");

// ═════════════════════════════ H. the segment path still works
console.log("\n## H. The same text, still readable by segment");
await page.goto(`${B}/practice/?mode=custom&custom=${id}&seg=0`, { waitUntil: "domcontentloaded" });
await need("#tt-text .tt-char", "H. the segment path still renders a typing surface");
const segHeader = await page.evaluate(() => {
  const h = document.getElementById("tt-custom-header");
  const t = (sel) => { const n = h && h.querySelector(sel); return n ? n.textContent.trim() : null; };
  return { exists: !!h, eyebrow: t(".tt-custom-eyebrow"), seg: t(".tt-custom-seg"), book: !!document.getElementById("tt-book-header") };
});
chk(segHeader.exists, "H. the segment reader's own header is back");
eq(segHeader.eyebrow, "Custom text", "H. with its eyebrow");
chk(/^Segment 1 of \d+$/.test(segHeader.seg || ""),
  "H. and its segment counter", JSON.stringify(segHeader.seg));
chk(!segHeader.book, "H. the book reader header stood down");
const segText = await surfaceText();
chk(segText.startsWith("CHAPTER I. THE ARRIVAL"),
  "H. the segment holds the text from the top, headings and all",
  JSON.stringify(segText.slice(0, 40)));

// ══════════ L. deleting the text takes its chapter progress with it
console.log("\n## L. Deleting a text clears the progress the reader saved for it");
await page.goto(`${B}/custom/`, { waitUntil: "domcontentloaded" });
await need(`.saved-item [data-action="delete"][data-id="${id}"]`, "L. the text is still in the list", 20000);
const beforeDelete = await progressKeys();
chk(beforeDelete.includes(`custom:${id}`), "L. its progress is in bookProgress before the delete",
  JSON.stringify(beforeDelete));
await page.click(`.saved-item [data-action="delete"][data-id="${id}"]`);
await need("dialog[open] [data-ok]", "L. the delete confirmation opened", 15000);
await page.click("dialog[open] [data-ok]");
await page.waitForTimeout(800);
const afterDelete = await progressKeys();
chk(!afterDelete.includes(`custom:${id}`),
  "L. and it is gone afterwards — a deleted text leaves no progress behind",
  JSON.stringify(afterDelete));
chk(afterDelete.includes("house-of-mirth"),
  "L. …while the library book's progress is untouched", JSON.stringify(afterDelete));

// ═════════════ J. a text saved before chapters existed gets one anyway
console.log("\n## J. A text imported before this feature still opens by chapter");
await freshCustomPage();
/* The pre-chapters record shape: segments inline on the index record,
   no chapters anywhere. getChapters() has only the segments to work
   with, and segments are sentence chunks rejoined with spaces, so the
   document's line breaks — and with them its headings — are already
   gone. The honest answer is one "Full text" chapter, and the gate says
   so out loud rather than leaving the limit undocumented. */
await page.evaluate((segs) => {
  localStorage.setItem("tt:custom-texts", JSON.stringify([{
    id: "c_legacy", title: "Saved last month", createdAt: new Date().toISOString(),
    bytes: 400, segCount: segs.length, lastSeg: 0, segments: segs, meta: null,
  }]));
}, [CH1.slice(0, 4).join(" "), CH1.slice(4).join(" ")]);
await page.reload({ waitUntil: "domcontentloaded" });
await need(`.saved-item [data-action="chapters"][data-id="c_legacy"]`, "J. the old record still gets a By chapter row", 20000);
const legacyMetaBefore = ((await page.textContent(".saved-item__meta").catch(() => "")) || "").replace(/\s+/g, " ").trim();
chk(!/chapter/.test(legacyMetaBefore),
  "J. it claims no chapter count before anything has counted them", JSON.stringify(legacyMetaBefore));
await page.click(`.saved-item [data-action="chapters"][data-id="c_legacy"]`);
await need(`#chapters-c_legacy .seg-picker__item`, "J. the picker opened for the old record", 20000);
const legacyRows = await page.$$eval(`#chapters-c_legacy .seg-picker__item`, (els) =>
  els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
eq(legacyRows.length, 1, "J. one chapter — derived from the segments, which have no line breaks left");
chk(legacyRows[0].includes("Full text"), "J. …named ‘Full text’", JSON.stringify(legacyRows[0]));
const legacyMetaAfter = ((await page.textContent(".saved-item__meta").catch(() => "")) || "").replace(/\s+/g, " ").trim();
chk(/·\s*1 chapter\b/.test(legacyMetaAfter),
  "J. and the card learns the count without a reload", JSON.stringify(legacyMetaAfter));
const legacyStored = await page.evaluate(() => new Promise((res) => {
  const q = indexedDB.open("tt-custom");
  q.onerror = q.onblocked = () => res(null);
  q.onsuccess = () => {
    try {
      const g = q.result.transaction("segments", "readonly").objectStore("segments").get("c_legacy");
      g.onsuccess = () => res(g.result || null);
      g.onerror = () => res(null);
    } catch { res(null); }
  };
}));
chk(!!legacyStored && Array.isArray(legacyStored.chapters) && legacyStored.chapters.length === 1,
  "J. the derived structure was written back, so it is derived once and not on every visit",
  legacyStored ? `chapters=${(legacyStored.chapters || []).length}` : "no record");

// ══════════════════════════════════ I. an EPUB brings its own titles
console.log("\n## I. An EPUB's chapter titles come from the file");
await freshCustomPage();
const epub = await importFile("two-chapters.epub", "application/epub+zip", buildEpub());
chk(/^Found 2 chapters\b/.test(epub.notice),
  "I. two chapters found — the navigation document is not one of them", JSON.stringify(epub.notice));
const erec = await page.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0]);
eq(erec.chapCount, 2, "I. chapCount agrees");
await page.click(`.saved-item [data-action="chapters"][data-id="${epub.id}"]`);
await need(`#chapters-${epub.id} .seg-picker__item`, "I. the EPUB's chapter picker painted a list", 15000);
const erows = await page.$$eval(`#chapters-${epub.id} .seg-picker__item`, (els) =>
  els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
eq(erows.length, 2, "I. two rows");
chk(erows[0].includes("The Long Walk Home") && erows[1].includes("What Came After"),
  "I. titled from each spine item's <head><title> — which htmlToText deletes, so they can only have been read before that",
  JSON.stringify(erows));
chk(!erows.some((r) => /Table of Contents/i.test(r)),
  "I. the navigation document did not become a chapter", JSON.stringify(erows));
await page.goto(`${B}/practice/?book=custom:${epub.id}&ch=1&page=0`, { waitUntil: "domcontentloaded" });
await need("#tt-text .tt-char", "I. the EPUB's second chapter rendered a typing surface");
const eh = await readerHeader();
eq(eh.chapter, "What Came After", "I. the reader opens the second chapter by its own name");
eq(await surfaceText(), EPUB_CH2.join(" "),
  "I. and it holds that chapter's paragraphs, not the whole book");

/* ══ M. The header of a text that has an author ═════════════════════

   The bundled Alice sample is such a text: meta.author "Lewis Carroll",
   meta.year 1865. The first version of the chapter reader put the
   TEXT'S TITLE into .tt-book-author, so the sample's header showed
   "Alice's Adventures in Wonderland (sample)" and "Lewis Carroll" in
   identical italics, as though the book were written by its own name.
   Seeded with chapters inline on the index record, which is also the
   no-database read path getChapters() has to handle. */
console.log("\n## M. Title and author lines in the chapter reader");
await freshCustomPage();
await page.evaluate((body) => {
  localStorage.setItem("tt:custom-texts", JSON.stringify([{
    id: "c_meta", title: "A Book Of Mine", createdAt: new Date().toISOString(),
    bytes: 400, segCount: 1, lastSeg: 0, segments: [body],
    chapCount: 1, chapters: [{ title: "CHAPTER ONE", paragraphs: [{ id: "p0", text: body }] }],
    meta: { kind: "sample", author: "Lewis Carroll", year: "1865", source: "Macmillan" },
  }]));
}, CH3[0]);
await page.goto(`${B}/practice/?book=custom:c_meta&ch=0&page=0`, { waitUntil: "domcontentloaded" });
await need("#tt-text .tt-char", "M. the reader opened a text whose chapters are inline on the record");
const mh = await page.evaluate(() => {
  const h = document.getElementById("tt-book-header");
  const t = (sel) => { const n = h && h.querySelector(sel); return n ? n.textContent.trim() : null; };
  return {
    eyebrow: t(".tt-book-eyebrow"),
    customTitle: t(".tt-custom-title"),
    customAuthor: t(".tt-custom-author"),
    bookAuthor: t(".tt-book-author"),
    chapter: t(".tt-book-chapter"),
    pageLine: t(".tt-book-page"),
  };
});
eq(mh.eyebrow, "Custom text", "M. the eyebrow says what kind of text this is");
eq(mh.customTitle, "A Book Of Mine", "M. the text's title is in .tt-custom-title, as in the segment reader");
eq(mh.customAuthor, "Lewis Carroll · 1865", "M. the author line is in .tt-custom-author");
chk(mh.bookAuthor === null,
  "M. and NOT in .tt-book-author, which would render the title in the author's italics",
  JSON.stringify(mh.bookAuthor));
eq(mh.chapter, "CHAPTER ONE", "M. the chapter is still the headline");
eq(mh.pageLine, "Page 1 of 1", "M. and the page counter is there");
eq(await surfaceText(), CH3[0], "M. the inline chapter's paragraph is what gets typed");

/* ══ N. No database, and too long to carry the chapters inline ═════ */
console.log("\n## N. A browser with no database says so instead of pretending");
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { get() { return undefined; }, configurable: true });
  });
  const np = await ctx.newPage();
  np.on("pageerror", (e) => pageErrors.push("no-idb: " + String(e).slice(0, 160)));
  const seed = async () => {
    await np.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
    await np.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    });
    await np.reload({ waitUntil: "domcontentloaded" });
    await np.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  };
  const saveThrough = async (name, text) => {
    await np.setInputFiles("#uploader-file", { name, mimeType: "text/plain", buffer: Buffer.from(text, "utf8") });
    await np.waitForFunction(() => document.querySelector("#paste-text").value.length > 100, { timeout: 60000 });
    await np.click("#paste-save");
    await np.waitForSelector(".saved-item", { timeout: 60000 });
    return np.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0]);
  };

  // Over the 64 KB inline ceiling: the structure cannot be kept.
  await seed();
  const bigChapter = (mark) => Array.from({ length: 420 },
    (_, i) => `${mark} paragraph ${i} carrying enough ordinary prose to make a real page of a real chapter.`).join("\n\n");
  const bigText = ["CHAPTER I. THE ARRIVAL", "", bigChapter("Alpha"), "", "CHAPTER II. THE DEPARTURE", "", bigChapter("Bravo"), ""].join("\n");
  chk(bigText.length > 64 * 1024, "N. the fixture really is over the 64 KB inline limit", `${bigText.length} chars`);
  const bigRec = await saveThrough("big.txt", bigText);
  chk(bigRec && bigRec.chaptersUnavailable === true,
    "N. the record says its chapters could not be kept", JSON.stringify(bigRec && bigRec.chaptersUnavailable));
  chk(bigRec && !bigRec.chapters,
    "N. …and they were not crammed into localStorage beside the whole body anyway");
  const hint = await np.textContent('[data-hint="chapters-unavailable"]').catch(() => null);
  chk(!!hint && /no database/i.test(hint),
    "N. and the card says so, on the By chapter row", JSON.stringify((hint || "").slice(0, 80)));
  chk(await np.isVisible(`[data-action="chapters"][data-id="${bigRec.id}"]`).catch(() => false),
    "N. the row still works — the chapter view is degraded, not removed");

  // Under the ceiling: the chapters ARE kept, and there is no hint.
  await seed();
  const smallText = ["CHAPTER I. THE ARRIVAL", "", CH1.join("\n\n"), "", "CHAPTER II. THE DEPARTURE", "", CH2.join("\n\n"), ""].join("\n");
  const smallRec = await saveThrough("small.txt", smallText);
  chk(!smallRec.chaptersUnavailable,
    "N. control: a short text on the same no-database path keeps its chapters");
  eq(smallRec.chapCount, 2, "N. control: …two of them, inline on the index record");
  chk(Array.isArray(smallRec.chapters) && smallRec.chapters.length === 2,
    "N. control: …and they are really there");
  chk(!(await np.isVisible('[data-hint="chapters-unavailable"]').catch(() => false)),
    "N. control: no hint on a text that has its chapters");
  await ctx.close();
}

chk(pageErrors.length === 0, "no uncaught page errors", pageErrors.slice(0, 3).join(" ; "));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
