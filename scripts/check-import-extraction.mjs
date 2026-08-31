#!/usr/bin/env node
/* End-to-end import fidelity: does a real PDF and a real EPUB come back
   as the prose that went in, and is what comes back typeable?

   scripts/fixtures/extraction-torture.txt is the ground truth. It is
   ordinary prose chosen to be hostile to text extraction:

     - ligature clusters (office, difficult, waffle, affluent,
       scaffolding, daffodil, fifteen) -- pdf.js splits a word at every
       ligature, kern and font change, which is where "beca use" and
       "T he" came from;
     - long enough lines that a justified, hyphenated PDF breaks words
       across lines;
     - a figure group (12 500) that typesetting sets with a figure
       space rather than a real one;
     - em dashes and curly quotes, which must come back as ASCII.

   The generators below inject the typographic forms a real book has --
   em dash, curly quotes, no-break space, figure space, a soft hyphen
   and a zero-width space inside words, and inline <i>/<span> tags that
   cut words in half in the EPUB. The fixture is the ASCII the user
   should end up typing. If extraction is honest, the two agree word for
   word.

   NOT COVERED, deliberately: there is no OCR anywhere in this project.
   A scanned, image-only PDF has no text layer, and parsePdf rejects it
   with a message telling the user to OCR it themselves. This suite
   tests text-layer extraction only.

   Known limit, stated rather than hidden: PDF de-hyphenation cannot
   tell a soft break ("short-\nened") from a compound wrapped at its own
   hyphen ("post-\noffice"). The fixture therefore contains no
   hyphenated compounds, and the plain-text path -- which keeps the
   hyphen -- is covered by scripts/check-import-whitespace.mjs.

   Usage: node scripts/check-import-extraction.mjs   (needs _site served on 8765) */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const B = process.env.BASE_URL || "http://localhost:8765";
const FIXTURE = fileURLToPath(new URL("./fixtures/extraction-torture.txt", import.meta.url));
const GROUND = readFileSync(FIXTURE, "utf8").trim();

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
  ok ? pass++ : fail++;
};

process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err?.message ?? err}`);
  console.log("\nRUN ABORTED — counts below are partial.");
  process.exit(1);
});

const U = (cp) => String.fromCodePoint(cp);
const EM_DASH = U(0x2014), LDQUO = U(0x201c), RDQUO = U(0x201d);
const NBSP = U(0x00a0), FIGSP = U(0x2007), SHY = U(0x00ad), ZWSP = U(0x200b);

/* Turn the ASCII ground truth into what a typesetter would actually
   have produced, so extraction has something real to undo. */
function typeset(ascii) {
  let s = ascii
    .replace(/--/g, EM_DASH)
    .replace(/"([^"]*)"/g, (_, inner) => LDQUO + inner + RDQUO)
    .replace(/12 500/, "12" + FIGSP + "500")
    .replace(/beneath the scaffolding/, "beneath the" + NBSP + "scaf" + SHY + "folding")
    .replace(/the affidavit/, "the affi" + ZWSP + "davit");
  return s;
}

const words = (s) => s.replace(/\s+/g, " ").trim().split(" ");

/* Compare word sequences and report the FIRST divergence, with context.
   A boolean alone tells you nothing about a 250-word text. */
function diffWords(got, want, label) {
  const a = words(got), b = words(want);
  if (a.length === b.length && a.every((w, i) => w === b[i])) {
    chk(true, label + ` (${b.length} words, exact)`);
    return;
  }
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  chk(false, label,
    `first divergence at word ${i}: got ${JSON.stringify(a.slice(i, i + 4).join(" "))} ` +
    `want ${JSON.stringify(b.slice(i, i + 4).join(" "))} (${a.length} words vs ${b.length})`);
}

/* ── A minimal store-only ZIP writer, so an EPUB can be built with no
      dependency. fflate's unzipSync reads stored entries fine, and
      "stored" is what the EPUB spec requires for the mimetype entry
      anyway. ───────────────────────────────────────────────────────── */
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
    local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);   // no flags, stored
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

function buildEpub(ascii) {
  const typeset_ = typeset(ascii);
  /* Inline tags that cut words in half are the EPUB equivalent of
     pdf.js fragments: strip the tag and the halves must close up with
     no space between them. */
  const body = typeset_.split("\n").map((line, i) => {
    let l = line
      .replace(/efficient/, "eff<i>icient</i>")
      .replace(/corridors/, "corri<span>dors</span>");
    return i === 0 ? `<h1>${l}</h1>` : `<p>${l}</p>`;
  }).join("\n");
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Torture</title></head>
<body>${body}</body></html>`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>Extraction Torture</dc:title><dc:identifier id="id">urn:uuid:torture</dc:identifier>
</metadata>
<manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="ch1"/></spine>
</package>`;
  const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
  return zipStore([
    ["mimetype", "application/epub+zip"],
    ["META-INF/container.xml", container],
    ["OEBPS/content.opf", opf],
    ["OEBPS/ch1.xhtml", xhtml],
  ]);
}

/* ── Build the PDF from the same prose, justified and hyphenated so
      words genuinely break across lines. ───────────────────────────── */
async function buildPdf(browser, ascii) {
  const p = await browser.newPage();
  const paras = typeset(ascii).split("\n").map((l) => `<p>${l}</p>`).join("\n");
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>
    @page { size: A4; margin: 22mm; }
    body { font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.6; }
    p { text-align: justify; hyphens: auto; -webkit-hyphens: auto; margin: 0 0 1em; }
  </style><body lang="en">${paras}</body>`, { waitUntil: "load" });
  const buf = await p.pdf({ format: "A4", printBackground: true });
  await p.close();
  return buf;
}

/* ── Drive the real page: upload, save, read back. ─────────────────── */
async function importAndRead(page, name, mimeType, buffer) {
  await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    await new Promise((res) => {
      const r = indexedDB.deleteDatabase("tt-custom");
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#uploader-file", { state: "attached", timeout: 30000 });

  await page.setInputFiles("#uploader-file", { name, mimeType, buffer });
  await page.waitForFunction(() => document.querySelector("#paste-text").value.length > 200, { timeout: 60000 });
  await page.click("#paste-save");
  await page.waitForSelector(".saved-item", { timeout: 30000 });

  const id = await page.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0].id);
  const segments = await page.evaluate(async (tid) => {
    const ct = await import("/assets/js/engine/custom-text.js");
    return await ct.getSegments(tid);
  }, id);

  // What the user is actually asked to type, straight off the surface.
  await page.goto(`${B}/practice/?mode=custom&custom=${id}&seg=0`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#tt-text .tt-char", { timeout: 30000 });
  const target = await page.evaluate(() =>
    [...document.querySelectorAll("#tt-text .tt-char")]
      .filter((el) => !el.classList.contains("tt-char--extra"))
      .map((el) => (el.classList.contains("tt-char--space") ? " " : el.textContent))
      .join(""));

  return { stored: segments.join(" "), target };
}

/* Everything the user must actually press must exist on a keyboard. */
function assertTypeable(target, label) {
  const stray = [...new Set([...target].filter((c) => {
    const cp = c.codePointAt(0);
    return cp !== 10 && (cp < 32 || cp > 126);
  }))];
  chk(stray.length === 0, `${label}: every character on the typing surface is typeable`,
    stray.length ? stray.map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase()).join(",") : "");
  const inside = [...target.matchAll(/[A-Za-z]- [A-Za-z]|[A-Za-z] {2,}[A-Za-z]/g)].map((m) => m[0]);
  chk(inside.length === 0, `${label}: no space was invented inside a word`,
    inside.length ? inside.join(" | ") : "");
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
page.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 200)));

console.log("\n## Plain text — the control. If this fails, nothing else means anything.");
{
  const { stored, target } = await importAndRead(page, "torture.txt", "text/plain", Buffer.from(GROUND, "utf8"));
  diffWords(stored, GROUND, "a .txt import round-trips word for word");
  assertTypeable(target, ".txt");
}

console.log("\n## EPUB — inline tags cut words in half, typography is real.");
{
  const { stored, target } = await importAndRead(page, "torture.epub", "application/epub+zip", buildEpub(GROUND));
  diffWords(stored, GROUND, "an .epub import round-trips word for word");
  assertTypeable(target, ".epub");
}

console.log("\n## PDF — justified and hyphenated, extracted from the text layer.");
{
  const pdf = await buildPdf(browser, GROUND);
  const { stored, target } = await importAndRead(page, "torture.pdf", "application/pdf", pdf);
  diffWords(stored, GROUND, "a .pdf import round-trips word for word");
  assertTypeable(target, ".pdf");
}

console.log("\n## The fixture is worth something — it really is hostile input.");
{
  const t = typeset(GROUND);
  chk(/[—“”  ­​]/.test(t),
    "the typeset form carries the characters extraction has to undo");
  chk(t !== GROUND, "the typeset form differs from the ground truth it must reduce to");
  chk(/office|difficult|waffle|scaffolding|daffodil/.test(GROUND),
    "the ground truth carries the ligature clusters that split PDF fragments");
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
