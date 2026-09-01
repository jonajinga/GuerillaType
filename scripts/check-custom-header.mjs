#!/usr/bin/env node
/* The custom-text reader header.

   Reported: practising an imported text showed the segment body with
   nothing above it but "← Back to your custom texts". No title, and no
   way to tell segment 4 of 380 from segment 300.

   What this gate holds down, and why each one is here:

   1. A multi-segment import gets a header at all, carrying the title
      the user gave it.
   2. The counter tracks state.customSeg. Asserted at TWO different
      segments of the SAME text, with exact numbers — "Segment 1 of 4"
      alone is satisfied by a hardcoded string, and an off-by-one is
      invisible until you look at a segment that is not the first.
   3. A corpus item (quote / idiom / parable / poem) travels the same
      custom pipeline but is typed whole. It must NOT gain a segment
      counter, and it must KEEP its attribution header — the stand-down
      that stops double headers is one over-broad condition away from
      deleting the quote header entirely.
   4. A text WITH author metadata gets exactly ONE header. The bundled
      sample is such a text (meta.kind "sample", author + year), so two
      stacked headers would have shipped. Asserted three ways: one
      header element exists, it is the custom one, and the author
      survived the move.
   5. A single-segment import shows the title but no counter. "Segment
      1 of 1" labels navigation that does not exist.

   ANTI-VACUITY. Every case waits for .tt-char before reading anything,
   so a page that failed to boot fails loudly instead of quietly
   reporting "no second header found". Every "must not contain" check is
   paired with a "must contain" on the same element, so an empty or
   missing header cannot satisfy it.

   Serves _site itself on a port derived from this task id, and refuses
   to run until the server has proved it is THIS project answering — a
   200 from a sibling worker's site is not evidence.

   Usage:
     npm run build          # not optional: this reads _site, not src
     node scripts/check-custom-header.mjs
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

/* Port from the task id, not from habit. 8080 is never ours, and 8765
   is the shared default every other gate in this repo uses — attaching
   to whatever is already on it is how a suite ends up driving a
   different application and reporting green. */
const TASK = "custom-header";
const PORT = Number(process.env.PORT)
  || 8100 + ([...TASK].reduce((a, c) => a + c.charCodeAt(0), 0) % 600);
const ROOT = resolve("_site");

let pass = 0, fail = 0;
const chk = (ok, name, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
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
    // Contain the path inside _site. normalize() collapses ".." before
    // the join, so a crafted URL cannot walk out of the build.
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
});
const B = `http://127.0.0.1:${PORT}`;

/* Prove what is answering before believing anything it says. */
const probe = await fetch(B + "/practice/").then((r) => r.text()).catch(() => "");
/* Both markers, because either alone is weak: a title can be copied,
   and #tt-stage exists on other pages. The build minifies attributes
   (id=tt-stage, unquoted), so match with and without quotes. */
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe)
  && /id=["']?tt-stage["'\s>]/.test(probe);
chk(isThisProject, `server on ${PORT} is this project's /practice/`,
  isThisProject ? "" : `got ${probe.length} bytes, title=${(probe.match(/<title>[^<]*<\/title>/) || ["(none)"])[0]}`);
if (!isThisProject) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  process.exit(1);
}

// ---------------------------------------------------------------- browser
/* Service worker blocked: pwa.js reloads the page on controllerchange,
   and a reload landing mid-run rebuilds the DOM under the assertions. */
const browser = await chromium.launch();
const pageErrors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 180)));

const SEGS = ["Alpha segment one.", "Bravo segment two.", "Charlie segment three.", "Delta segment four."];

/* Seed the custom index directly. getSegments() reads inline `segments`
   off the index record before it reaches IndexedDB, which is the same
   fallback path a browser with no IDB uses — so this is a real record,
   not a test-only shape. */
async function seed(items) {
  await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await page.evaluate((list) => localStorage.setItem("tt:custom-texts", JSON.stringify(list)), items);
}

/* Load a practice session and read back everything above the stage. */
async function readHeader(url) {
  await page.goto(B + url, { waitUntil: "domcontentloaded" });
  const booted = await page.waitForSelector(".tt-char", { timeout: 20000 }).then(() => true).catch(() => false);
  if (!booted) return { booted: false };
  return await page.evaluate(() => {
    const custom = document.getElementById("tt-custom-header");
    const attribution = document.getElementById("tt-attribution");
    const book = document.getElementById("tt-book-header");
    const txt = (el, sel) => {
      const n = el && el.querySelector(sel);
      return n ? n.textContent.trim() : null;
    };
    return {
      booted: true,
      headerCount: [custom, attribution, book].filter(Boolean).length,
      hasCustom: !!custom,
      hasAttribution: !!attribution,
      eyebrow: txt(custom, ".tt-custom-eyebrow"),
      title: txt(custom, ".tt-custom-title"),
      author: txt(custom, ".tt-custom-author"),
      seg: txt(custom, ".tt-custom-seg"),
      attrTitle: txt(attribution, ".tt-attribution__title"),
      attrCite: txt(attribution, ".tt-attribution__cite"),
      // The whole header region as flat text, so "no counter anywhere"
      // can be asserted without guessing which class it landed in.
      aboveStage: [custom, attribution]
        .filter(Boolean).map((e) => e.textContent.replace(/\s+/g, " ").trim()).join(" | "),
    };
  });
}

// ---- 1 + 2. a multi-segment import: header exists, counter tracks seg
await seed([{
  id: "c_multi", title: "Quarterly Field Notes", createdAt: new Date().toISOString(),
  bytes: 80, segCount: SEGS.length, lastSeg: 0, segments: SEGS, meta: null,
}]);

const s0 = await readHeader("/practice/?mode=custom&custom=c_multi&seg=0");
chk(s0.booted, "multi-segment import: the typing surface rendered");
chk(s0.hasCustom, "multi-segment import: a header appears above the segment");
chk(s0.title === "Quarterly Field Notes",
  "multi-segment import: the header shows the text's title", JSON.stringify(s0.title));
chk(s0.eyebrow === "Custom text",
  "multi-segment import: eyebrow reads ‘Custom text’", JSON.stringify(s0.eyebrow));
chk(s0.seg === "Segment 1 of 4",
  "seg=0 reads ‘Segment 1 of 4’", JSON.stringify(s0.seg));

const s2 = await readHeader("/practice/?mode=custom&custom=c_multi&seg=2");
chk(s2.booted, "seg=2: the typing surface rendered");
chk(s2.seg === "Segment 3 of 4",
  "seg=2 reads ‘Segment 3 of 4’ — the counter tracks the segment, it is not a fixed string",
  JSON.stringify(s2.seg));
chk(s0.title === s2.title && s2.title === "Quarterly Field Notes",
  "the title is the same on both segments", JSON.stringify(s2.title));
chk(s2.headerCount === 1,
  "a plain import gets exactly one header", `${s2.headerCount} header element(s)`);

// ---- 3. a corpus item keeps attribution and gains no counter
await seed([{
  id: "c_quote", title: "On patience", createdAt: new Date().toISOString(),
  bytes: 60, segCount: 1, lastSeg: 0,
  segments: ["Patience is bitter but its fruit is sweet."],
  meta: { kind: "quote", author: "Jean-Jacques Rousseau", year: "1762", source: "Emile", meaning: null },
}]);
const q = await readHeader("/practice/?mode=custom&custom=c_quote&seg=0");
chk(q.booted, "quote: the typing surface rendered");
chk(q.hasAttribution,
  "quote: still gets its attribution header — the stand-down did not swallow it");
chk(q.attrTitle === "On patience",
  "quote: attribution still names the piece", JSON.stringify(q.attrTitle));
chk(!!q.attrCite && q.attrCite.includes("Rousseau"),
  "quote: attribution still credits the author", JSON.stringify(q.attrCite));
chk(!q.hasCustom,
  "quote: does NOT get the segmented-import header");
// Paired with the two "must contain" checks above, so an empty header
// region cannot satisfy this by being empty.
chk(!/Segment\s+\d+\s+of\s+\d+/i.test(q.aboveStage),
  "quote: no ‘Segment 1 of 1’ over a piece typed whole", JSON.stringify(q.aboveStage));
chk(q.headerCount === 1, "quote: exactly one header", `${q.headerCount} header element(s)`);

// ---- 4. an import WITH author metadata: one header, not two
/* This is the bundled Alice sample's shape: segmented like any import,
   but carrying meta the attribution header also knows how to paint. */
await seed([{
  id: "c_meta", title: "Alice in Wonderland (sample)", createdAt: new Date().toISOString(),
  bytes: 80, segCount: SEGS.length, lastSeg: 0, segments: SEGS,
  meta: { kind: "sample", author: "Lewis Carroll", year: "1865", source: "Macmillan" },
}]);
const m = await readHeader("/practice/?mode=custom&custom=c_meta&seg=1");
chk(m.booted, "import with author meta: the typing surface rendered");
chk(m.headerCount === 1,
  "import with author meta: exactly ONE header, not two stacked",
  `${m.headerCount} header element(s): ${JSON.stringify(m.aboveStage)}`);
chk(m.hasCustom && !m.hasAttribution,
  "import with author meta: the one header is the segmented-import header",
  `custom=${m.hasCustom} attribution=${m.hasAttribution}`);
chk(m.seg === "Segment 2 of 4",
  "import with author meta: still counts segments", JSON.stringify(m.seg));
chk(!!m.author && m.author.includes("Lewis Carroll") && m.author.includes("1865"),
  "import with author meta: the author line survived the move", JSON.stringify(m.author));

// ---- 5. a single-segment paste: title, no counter
await seed([{
  id: "c_one", title: "A short paste", createdAt: new Date().toISOString(),
  bytes: 30, segCount: 1, lastSeg: 0,
  segments: ["One short pasted paragraph and nothing more."], meta: null,
}]);
const one = await readHeader("/practice/?mode=custom&custom=c_one&seg=0");
chk(one.booted, "single-segment import: the typing surface rendered");
chk(one.hasCustom, "single-segment import: still gets a header");
chk(one.title === "A short paste",
  "single-segment import: the title still shows", JSON.stringify(one.title));
chk(!/Segment\s+\d+\s+of\s+\d+/i.test(one.aboveStage),
  "single-segment import: no ‘Segment 1 of 1’", JSON.stringify(one.aboveStage));

// ---- the header must not leak into a mode that is not custom
const lesson = await readHeader("/practice/?mode=lesson&lesson=1");
chk(lesson.booted, "lesson mode: the typing surface rendered");
chk(!lesson.hasCustom, "lesson mode: no custom header left behind");

chk(pageErrors.length === 0, "no uncaught page errors", pageErrors.slice(0, 3).join(" ; "));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
