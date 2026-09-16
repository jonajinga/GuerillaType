#!/usr/bin/env node
/* The "Saved texts" card on /custom/.

   This gate exists because of one screenshot: an imported PDF on a
   phone, and four separate things wrong with the card showing it.

     - "826.8 KB" sat inside the <h3> as a flex sibling of the title,
       pushed apart by justify-content:space-between. On a narrow card
       the two children could not share a line and the SIZE broke:
       "826.8" on one line, "KB" on the next. A measured value is one
       token and a layout is not allowed to hyphenate it.
     - the title was the raw download filename,
       "The-Odyssey-Homer-Full-text-pdf".
     - "Save as lesson" and "Delete" were the tail of the BY SEGMENT
       row, so on a phone they wrapped underneath it and read as two
       more segment controls. They act on the whole text.
     - the two ways of reading the same text did not look like a pair:
       different primary buttons, non-parallel labels, and eyebrows
       reading BY SEGMENT / BY CHAPTER in caps at body size, wide
       enough to push the buttons onto a second line.

   WHAT IS ASSERTED, and why none of it passes by accident:

     A. At 430 css px the size is ONE line box. Measured with a Range
        over its text and counting client rects, so a value split
        across two lines is counted as two and fails. Its width is
        held under its container's and under the card's, and it is
        asserted NOT to be a descendant of the heading -- the shape
        that caused the break in the first place.
     B. The two rows' primary buttons share a computed background
        colour and a left edge, to the pixel. Same colour with
        different x is two buttons that do not line up; same x with
        different colour is a primary and an afterthought. Both are
        required. At 1100 px every button in a row shares one top,
        i.e. the row is on one line.
     C. Save as lesson, Rename and Delete are outside BOTH way-to-read
        rows and inside the text-level row, which sits below them. The
        delete path is then exercised for real, confirm modal included.
     D. At 375 px no element of the card sticks out of the card, with a
        title that is one unbreakable 40-character token -- the worst
        case a filename can produce. The page itself must not scroll
        sideways. The label column survives: both labels are visible,
        the same width, and both button groups start at the same x.
     E. Rename, driven by the KEYBOARD only: Tab-focus, Enter to open,
        type, Enter to save. The stored record changes, the card
        changes without a reload, it survives a reload, and the
        practice page shows the new title in both its headers -- the
        segment reader's and the chapter reader's. Escape cancels and
        returns focus. Whitespace-only is refused, surrounding
        whitespace is trimmed.
     F. Default titles at import. The pure function is asserted on the
        names from the report AND on a name it must leave alone
        ("How to read a PDF.pdf" -- the last word is the subject, not
        a leftover). Then two REAL imports through the real file input,
        a .txt and an EPUB with no <dc:title>, prove the function is
        actually wired into the parser rather than merely exported.
        And the shipped module is read to prove no filename fallback
        was left behind: a helper wired into two of three call sites
        is this codebase's signature near-miss.
        The PDF path is covered by the function assertion and by that
        call-site sweep, NOT by a real PDF import -- pdfjs comes from
        a CDN and hand-rolling a PDF with an extractable text layer
        would test the fixture, not the card. Said out loud because a
        verifier should know which of the seven is indirect.
     G. The chapters-unavailable hint still belongs to the chapter row.

   NETWORK. Section F's EPUB needs fflate from esm.sh, the way
   scripts/check-custom-chapters.mjs does. With no network that section
   aborts loudly rather than passing quietly.

   Serves _site itself on a port derived from this task id, and refuses
   to run until the server has proved it is THIS project answering. A
   200 from a sibling worker's build is not evidence.

   Usage:
     OG_SKIP=1 npm run build     # not optional: this reads _site
     npm run custom-card
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const TASK = "custom-card";
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
/* Two measurements agree when they agree to within half a device
   pixel. Sub-pixel layout means "the same left edge" is never an
   exact float match, and rounding to integers would let a genuine
   one-pixel misalignment through. */
const near = (a, b, name, tol = 0.5) =>
  chk(Math.abs(a - b) <= tol, name, Math.abs(a - b) <= tol ? "" : `${a} vs ${b}`);

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
  await stat(join(ROOT, "custom", "index.html"));
} catch {
  console.log("  FAIL  _site is not built — run `OG_SKIP=1 npm run build` first");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
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

const probe = await fetch(B + "/custom/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe)
  && /id=["']?uploader-file["'\s>]/.test(probe);
chk(isThisProject, `server on ${PORT} is this project's /custom/`,
  isThisProject ? "" : `got ${probe.length} bytes`);
if (!isThisProject) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  process.exit(1);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const pageErrors = [];
const page = await browser.newPage({ viewport: { width: 430, height: 940 }, serviceWorkers: "block" });
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

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

/* An empty /custom/ with the bundled sample dismissed, so "the first
   card" below is always the one this gate put there. */
async function freshCustomPage() {
  await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    await new Promise((r) => {
      const q = indexedDB.deleteDatabase("tt-custom");
      q.onsuccess = q.onerror = q.onblocked = () => r();
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await need(".saved-item, .stats-empty", "/custom/ finished booting");
}

/* Put an index record on the page without an import. Layout sections
   want a card with exact, reproducible numbers -- the ones from the
   screenshot -- and an import cannot produce 826.8 KB on demand. */
async function seedRecords(records) {
  await page.evaluate(async (recs) => {
    localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    localStorage.setItem("tt:custom-texts", JSON.stringify(recs));
  }, records);
  await page.reload({ waitUntil: "domcontentloaded" });
  await need(".saved-item", "the seeded record rendered a card");
}

/* Import through the real file input and the real save button. */
async function importFile(name, mimeType, buffer) {
  await page.waitForSelector("#uploader-file", { state: "attached", timeout: 30000 });
  await page.setInputFiles("#uploader-file", { name, mimeType, buffer });
  await page.waitForFunction(() => document.querySelector("#paste-text").value.length > 50, { timeout: 60000 })
    .catch(() => {});
  await page.click("#paste-save");
  await need(".saved-item", `the import of ${name} produced a saved text`);
  return page.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0]);
}

const ODY = {
  id: "c_ody",
  title: "The-Odyssey-Homer-Full-text-pdf",
  createdAt: "2026-09-16T09:00:00.000Z",
  bytes: 846643,          // 826.8 KB, the figure from the screenshot
  segCount: 2010,
  chapCount: 21,
  lastSeg: 0,
  meta: null,
};

// ══════════════════════════════════ A. the size, at phone width
console.log("\n## A. 430 px: the size is one line and stays inside the card");
await freshCustomPage();
await seedRecords([ODY]);

const sizeBox = await page.evaluate(() => {
  const card = document.querySelector(".saved-item");
  const el = card.querySelector(".saved-item__size");
  if (!el) return null;
  const r = document.createRange();
  r.selectNodeContents(el);
  const lines = [...r.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
  const b = el.getBoundingClientRect();
  const parent = el.parentElement.getBoundingClientRect();
  const cs = getComputedStyle(card);
  const cb = card.getBoundingClientRect();
  return {
    text: el.textContent.trim(),
    lines: lines.length,
    height: b.height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight) || 0,
    width: b.width,
    parentWidth: parent.width,
    right: b.right,
    contentRight: cb.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth),
    whiteSpace: getComputedStyle(el).whiteSpace,
    insideHeading: !!el.closest(".saved-item__title, h3"),
  };
});
chk(!!sizeBox, "A. the card has a size element of its own");
/* Deliberately NOT an abort. A build without the fix has no size
   element, and a gate that stops at the first missing node tells a
   verifier one thing when it could tell them seven. Every measurement
   below is written against a stand-in that fails each assertion on its
   own, so the reverted run reports the true breadth of the damage
   instead of a single line. */
const S = sizeBox || {
  text: null, lines: 0, height: Infinity, lineHeight: 0, width: Infinity,
  parentWidth: 0, right: Infinity, contentRight: 0, whiteSpace: null, insideHeading: true,
};
eq(S.text, "826.8 KB", "A. it reads the size the screenshot showed");
eq(S.lines, 1, "A. …as ONE line box — a value split over two lines counts as two");
chk(S.height <= S.lineHeight * 1.5 + 1,
  "A. …and is one line tall by measurement too",
  `height=${S.height.toFixed(1)} line-height=${S.lineHeight.toFixed(1)}`);
eq(S.whiteSpace, "nowrap", "A. it is told not to wrap, so a narrower card cannot break it either");
chk(S.width <= S.parentWidth + 0.5,
  "A. it is no wider than the line it sits on",
  `${S.width.toFixed(1)} vs ${S.parentWidth.toFixed(1)}`);
chk(S.right <= S.contentRight + 0.5,
  "A. …and does not reach past the card's padding",
  `right=${S.right.toFixed(1)} limit=${S.contentRight.toFixed(1)}`);
chk(!S.insideHeading,
  "A. it is NOT inside the heading — the arrangement that broke it");

const metaLine = ((await page.textContent(".saved-item__meta")) || "").replace(/\s+/g, " ").trim();
chk(/^2,010 segments · 21 chapters · Saved /.test(metaLine),
  "A. the meta line carries both counts and a save date", JSON.stringify(metaLine));
chk(/[A-Za-z]{3}/.test(metaLine.replace(/^.*Saved /, "")),
  "A. …and the date has a month NAME, so 9/16 and 16/9 cannot be confused",
  JSON.stringify(metaLine.replace(/^.*Saved /, "")));

// ══════════════════════════════════ B. the two ways read as a pair
console.log("\n## B. The segment and chapter rows are a matched pair");
const pair = await page.evaluate(() => {
  const card = document.querySelector(".saved-item");
  const rows = [...card.querySelectorAll(".saved-item__actions")];
  const read = (row) => {
    const prims = [...row.querySelectorAll(".btn--primary")];
    const p = prims[0];
    return {
      label: row.querySelector(".saved-item__how")
        ? row.querySelector(".saved-item__how").textContent.trim() : null,
      primaries: prims.length,
      text: p ? p.textContent.trim() : null,
      bg: p ? getComputedStyle(p).backgroundColor : null,
      left: p ? p.getBoundingClientRect().left : null,
      labelWidth: row.querySelector(".saved-item__how")
        ? row.querySelector(".saved-item__how").getBoundingClientRect().width : null,
    };
  };
  return { count: rows.length, rows: rows.map(read) };
});
eq(pair.count, 2, "B. the card offers exactly two ways to read");
eq(pair.rows[0] && pair.rows[0].label, "Segments", "B. the first row is labelled quietly, in sentence case");
eq(pair.rows[1] && pair.rows[1].label, "Chapters", "B. …and so is the second");
eq(pair.rows[0] && pair.rows[0].primaries, 1, "B. the segment row has one primary");
eq(pair.rows[1] && pair.rows[1].primaries, 1, "B. the chapter row has one primary");
eq(pair.rows[0] && pair.rows[0].text, "Type", "B. and the two labels are the same word");
eq(pair.rows[1] && pair.rows[1].text, "Type", "B. …on both rows");
eq(pair.rows[1] && pair.rows[1].bg, pair.rows[0] && pair.rows[0].bg,
  "B. the two primaries are the same computed colour");
chk(pair.rows[0].bg !== "rgba(0, 0, 0, 0)" && pair.rows[0].bg !== "transparent",
  "B. …and that colour is a real fill, not both of them being transparent", String(pair.rows[0].bg));
near(pair.rows[0].left, pair.rows[1].left, "B. the two primaries share a left edge");
near(pair.rows[0].labelWidth, pair.rows[1].labelWidth, "B. the label column is one width for both rows");

// ══════════════════════════════════ C. the text-level actions
console.log("\n## C. Pin, rename and delete are not segment controls");
const manage = await page.evaluate(() => {
  const card = document.querySelector(".saved-item");
  const of = (a) => {
    const el = card.querySelector(`[data-action="${a}"]`);
    if (!el) return null;
    return {
      inWayRow: !!el.closest(".saved-item__actions"),
      inManage: !!el.closest(".saved-item__manage"),
      text: el.textContent.trim(),
      top: el.getBoundingClientRect().top,
    };
  };
  const rows = [...card.querySelectorAll(".saved-item__actions")];
  return {
    pin: of("pin"), del: of("delete"), rename: of("rename"),
    lastRowBottom: rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom : 0,
  };
});
chk(manage.pin && !manage.pin.inWayRow, "C. ‘Save as lesson’ is not inside a way-to-read row");
chk(manage.del && !manage.del.inWayRow, "C. ‘Delete’ is not inside a way-to-read row");
chk(manage.rename && !manage.rename.inWayRow, "C. ‘Rename’ is not inside a way-to-read row");
chk(manage.pin && manage.pin.inManage, "C. …‘Save as lesson’ is on the text-level row");
chk(manage.del && manage.del.inManage, "C. …so is ‘Delete’");
chk(manage.rename && manage.rename.inManage, "C. …so is ‘Rename’");
eq(manage.pin && manage.pin.text, "Save as lesson", "C. the pin control still says what it does");
chk(manage.del && manage.del.top >= manage.lastRowBottom - 0.5,
  "C. the text-level row comes after both ways of reading, not between them",
  manage.del ? `${manage.del.top.toFixed(1)} vs ${manage.lastRowBottom.toFixed(1)}` : "");

// The delete path itself — confirm modal and all — still works.
page.once("dialog", (d) => d.accept());
await page.click('[data-action="delete"][data-id="c_ody"]');
const confirmBtn = await page.waitForSelector(".modal button, dialog button, [data-confirm]", { timeout: 4000 })
  .catch(() => null);
if (confirmBtn) {
  const btns = await page.$$eval("button", (els) =>
    els.map((e, i) => ({ i, t: e.textContent.trim() })).filter((x) => x.t === "Delete"));
  const target = btns[btns.length - 1];
  if (target != null) await page.$$eval("button", (els, i) => els[i].click(), target.i);
}
const goneEmpty = await page.waitForFunction(
  () => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]").length === 0,
  null, { timeout: 8000 }).then(() => true).catch(() => false);
chk(goneEmpty, "C. Delete still deletes — confirm dialog and the real deleteSaved path");

// ══════════════════════════════════ D. 375 px: nothing sticks out
console.log("\n## D. 375 px: no overflow, and the label column survives");
await page.setViewportSize({ width: 375, height: 940 });
/* The worst case a filename can produce: seventy-odd characters with
   no space and no hyphen, so nothing in the string offers a break and
   the only thing that can save the card is overflow-wrap. */
const NASTY = "TheOdysseyHomerFullTextUnabridgedTranslatedCompleteEditionScannedCopy";
await seedRecords([
  { ...ODY, title: NASTY },
  { ...ODY, id: "c_two", title: "Second one", bytes: 12345, segCount: 4, chapCount: 3, lastSeg: 1 },
]);
const narrow = await page.evaluate(() => {
  const out = [];
  for (const card of document.querySelectorAll(".saved-item")) {
    const cb = card.getBoundingClientRect();
    for (const el of card.querySelectorAll("*")) {
      if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") continue;
      const b = el.getBoundingClientRect();
      if (b.width < 0.5 && b.height < 0.5) continue;
      if (b.right > cb.right + 0.5 || b.left < cb.left - 0.5) {
        out.push(`${el.className || el.tagName} ${b.left.toFixed(0)}..${b.right.toFixed(0)} (card ${cb.left.toFixed(0)}..${cb.right.toFixed(0)})`);
      }
    }
  }
  const hows = [...document.querySelectorAll(".saved-item")[0].querySelectorAll(".saved-item__how")];
  const ways = [...document.querySelectorAll(".saved-item")[0].querySelectorAll(".saved-item__ways")];
  return {
    over: out,
    doc: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    /* The card measured against what HOLDS it, not against itself.
       Everything above compares a child to its card -- and on the build
       this gate was written against, the card was the thing that blew
       out: an unbreakable 69-character title stretched the grid column
       to 689 px inside a 375 px viewport, so every child was still
       "inside the card" and the card was off the side of the screen.
       A containment check whose reference frame moves with the failure
       measures nothing. */
    cards: [...document.querySelectorAll(".saved-item")].map((c) => ({
      w: c.getBoundingClientRect().width,
      right: c.getBoundingClientRect().right,
    })),
    listW: document.querySelector(".saved-list").getBoundingClientRect().width,
    /* The saved date, measured the same way the size is. At 375 px the
       meta line was breaking after "Sep 16," and leaving "2026" alone
       on a line -- the same fault as the size, one measurement torn in
       half by a line break that cannot tell it is one. The meta line
       may still wrap BEFORE the date; the date itself may not. */
    when: (() => {
      const el = document.querySelector(".saved-item__when");
      if (!el) return null;
      const r = document.createRange();
      r.selectNodeContents(el);
      return {
        text: el.textContent.trim(),
        lines: [...r.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5).length,
        whiteSpace: getComputedStyle(el).whiteSpace,
      };
    })(),
    viewportW: document.documentElement.clientWidth,
    hows: hows.map((h) => ({ w: h.getBoundingClientRect().width, vis: h.getBoundingClientRect().width > 1, t: h.textContent.trim() })),
    wayLefts: ways.map((w) => w.getBoundingClientRect().left),
    /* A Range over the CONTENTS, not the element. An <h3> is a block
       box and getClientRects() on the element returns exactly one rect
       however many lines of text are inside it -- which is how this
       assertion first read a wrapped title as unwrapped. */
    title: (() => {
      const r = document.createRange();
      r.selectNodeContents(document.querySelector(".saved-item__title"));
      const rects = [...r.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
      return {
        lines: rects.length,
        widest: rects.reduce((m, x) => Math.max(m, x.right), 0),
      };
    })(),
  };
});
eq(narrow.over.length, 0, "D. nothing in either card reaches past the card's own edge");
chk(narrow.cards.every((c) => c.w <= narrow.listW + 0.5),
  "D. …and no card is wider than the list holding it",
  JSON.stringify({ cards: narrow.cards.map((c) => Math.round(c.w)), list: Math.round(narrow.listW) }));
chk(narrow.cards.every((c) => c.right <= narrow.viewportW + 0.5),
  "D. …nor off the right edge of a 375 px screen",
  JSON.stringify({ rights: narrow.cards.map((c) => Math.round(c.right)), viewport: narrow.viewportW }));
if (narrow.over.length) console.log("        " + narrow.over.slice(0, 6).join("\n        "));
chk(narrow.doc.scrollWidth <= narrow.doc.clientWidth + 0.5,
  "D. and the page itself does not scroll sideways",
  `${narrow.doc.scrollWidth} vs ${narrow.doc.clientWidth}`);
eq(narrow.hows.length, 2, "D. both way-to-read labels are still rendered");
chk(narrow.hows.every((h) => h.vis), "D. …and both still take up room — the column did not collapse",
  JSON.stringify(narrow.hows));
near(narrow.hows[0].w, narrow.hows[1].w, "D. …at the same width");
near(narrow.wayLefts[0], narrow.wayLefts[1], "D. both button groups still start at the same x");
chk(narrow.title.lines >= 2, "D. the unbreakable title wrapped instead of running on",
  `${narrow.title.lines} line boxes`);
chk(!!narrow.when, "D. the saved date is an element of its own, so it can be held together");
eq(narrow.when ? narrow.when.lines : 0, 1,
  "D. …and it is ONE line box at 375 px — not ‘Sep 16,’ over ‘2026’");
eq(narrow.when ? narrow.when.whiteSpace : null, "nowrap",
  "D. …because it is told not to wrap");
chk(narrow.title.widest <= narrow.viewportW + 0.5,
  "D. …and no line of it reaches off the screen",
  `widest right=${Math.round(narrow.title.widest)} viewport=${narrow.viewportW}`);

console.log("\n## D(b). 1100 px: each way-to-read row is one line");
await page.setViewportSize({ width: 1100, height: 940 });
await page.waitForTimeout(120);
const wide = await page.evaluate(() => {
  const card = document.querySelector(".saved-item");
  return [...card.querySelectorAll(".saved-item__ways")].map((w) => {
    const bs = [...w.querySelectorAll(".btn")].map((b) => b.getBoundingClientRect());
    /* Centres, not tops. The row centres its items, so two controls of
       different heights on the SAME line have different tops -- which
       is exactly what this used to measure, and it read a level row as
       a wrapped one. Heights are asserted separately below, because
       two controls the same height is the thing the eye actually
       notices. */
    const mids = bs.map((b) => Math.round(b.top + b.height / 2));
    const heights = bs.map((b) => Math.round(b.height));
    return { n: bs.length, lines: [...new Set(mids)].length, heights: [...new Set(heights)].length };
  });
});
chk(wide.length === 2 && wide.every((w) => w.n >= 2 && w.lines === 1),
  "D(b). every button in a row sits on one line — the row did not wrap", JSON.stringify(wide));
chk(wide.length === 2 && wide.every((w) => w.heights === 1),
  "D(b). …and every control in a row is the same height, link or button", JSON.stringify(wide));

// ══════════════════════════════════ E. rename, from the keyboard
console.log("\n## E. Rename, driven by the keyboard only");
await page.setViewportSize({ width: 1100, height: 940 });
await freshCustomPage();
const paras = (word, n) =>
  Array.from({ length: n }, (_, i) => `${word} paragraph ${i + 1} of this chapter, written plainly.`);
const TXT = [
  "CHAPTER I. THE ARRIVAL", "", paras("Alpha", 7).join("\n\n"), "",
  "CHAPTER II. THE DEPARTURE", "", paras("Bravo", 7).join("\n\n"), "",
].join("\n");
const imported = await importFile("A-Borrowed-Book-txt.txt", "text/plain", Buffer.from(TXT, "utf8"));
const RID = imported.id;
eq(imported.title, "A Borrowed Book",
  "E. the import is titled from its filename, so the rename below has something to change");

/* A soft check, not need(). A build without Rename should report every
   other thing this gate knows how to measure -- sections F and G do not
   depend on it -- so a missing button skips this section instead of
   ending the run. */
const hasRename = await page.$(`[data-action="rename"][data-id="${RID}"]`) !== null;
chk(hasRename, "E. the card offers Rename");
if (!hasRename) {
  chk(false, "E. SKIPPED — every rename assertion below needs that button");
} else {
  await page.focus(`[data-action="rename"][data-id="${RID}"]`);
  await page.keyboard.press("Enter");
  await need(`#rename-${RID}:not([hidden])`, "E. Enter on Rename opens the field");
  const focusedId = await page.evaluate(() => document.activeElement.id);
  eq(focusedId, `rename-field-${RID}`, "E. …and focus moves into it, so a keyboard user can just type");
  await page.keyboard.type("  Notes On A Borrowed Book  ");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);

  const afterSave = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0].title);
  eq(afterSave, "Notes On A Borrowed Book", "E. Enter saves the new title, trimmed");
  eq((await page.textContent(".saved-item__title")).trim(), "Notes On A Borrowed Book",
    "E. …and the card says so without a reload");
  const savedToast = ((await page.textContent("#toast")) || "").trim();
  chk(/Renamed to "Notes On A Borrowed Book"/.test(savedToast),
    "E. …with a toast naming the new title", JSON.stringify(savedToast));
  await page.reload({ waitUntil: "domcontentloaded" });
  await need(".saved-item__title", "E. the list came back after a reload");
  eq((await page.textContent(".saved-item__title")).trim(), "Notes On A Borrowed Book",
    "E. the new title survives a reload — it was really written, not just painted");

  await page.goto(`${B}/practice/?mode=custom&custom=${encodeURIComponent(RID)}&seg=0`,
    { waitUntil: "domcontentloaded" });
  await need("#tt-custom-header .tt-custom-title", "E. the practice page painted its custom header");
  eq((await page.textContent("#tt-custom-header .tt-custom-title")).trim(), "Notes On A Borrowed Book",
    "E. the segment reader's header shows the renamed title");
  await page.goto(`${B}/practice/?book=custom:${encodeURIComponent(RID)}&ch=0&page=0`,
    { waitUntil: "domcontentloaded" });
  await need("#tt-book-header", "E. the chapter reader painted its header");
  const bookHdr = (await page.textContent("#tt-book-header")).replace(/\s+/g, " ").trim();
  chk(bookHdr.includes("Notes On A Borrowed Book"),
    "E. the chapter reader's header shows it too", JSON.stringify(bookHdr.slice(0, 80)));

  await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await need(`[data-action="rename"][data-id="${RID}"]`, "E. back on /custom/");
  await page.focus(`[data-action="rename"][data-id="${RID}"]`);
  await page.keyboard.press("Enter");
  await need(`#rename-${RID}:not([hidden])`, "E. the field opened again");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Something Else Entirely");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const afterEsc = await page.evaluate(() => ({
    title: JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0].title,
    hidden: document.querySelector(".saved-item__rename").hidden,
    focus: document.activeElement.getAttribute("data-action"),
  }));
  eq(afterEsc.title, "Notes On A Borrowed Book", "E. Escape throws the edit away");
  eq(afterEsc.hidden, true, "E. …and closes the field");
  eq(afterEsc.focus, "rename", "E. …and gives focus back to the button that opened it");

  await page.keyboard.press("Enter");
  await need(`#rename-${RID}:not([hidden])`, "E. the field opened a third time");
  await page.fill(`#rename-field-${RID}`, "     ");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const afterBlank = await page.evaluate(() => ({
    title: JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0].title,
    toast: (document.getElementById("toast") || {}).textContent || "",
  }));
  eq(afterBlank.title, "Notes On A Borrowed Book", "E. a blank title is refused, not saved");
  chk(/empty/i.test(afterBlank.toast), "E. …and the refusal is said out loud",
    JSON.stringify(afterBlank.toast.trim()));
  await page.keyboard.press("Escape");
}

// ══════════════════════════════════ F. default titles at import
console.log("\n## F. What a file is called when nothing inside it says");
const MOD = pathToFileURL(join(ROOT, "assets", "js", "engine", "import-parsers.js")).href;
let cleanFilenameTitle = null;
try {
  ({ cleanFilenameTitle } = await import(MOD));
} catch (e) {
  chk(false, "F. the shipped module exports a filename-title helper", String(e).slice(0, 120));
}
chk(typeof cleanFilenameTitle === "function",
  "F. cleanFilenameTitle is exported from engine/import-parsers.js");
if (typeof cleanFilenameTitle === "function") {
  eq(cleanFilenameTitle("My-Book-pdf.pdf"), "My Book",
    "F. ‘My-Book-pdf.pdf’ → ‘My Book’");
  /* The trailing word is matched against what a document format is
     CALLED, not against this file's own extension. The first version
     of this fix compared the two, so a name that said "pdf" on a .txt
     kept it -- and that is the ordinary case, because the importer's
     own error message tells people with a scanned PDF to run OCR and
     upload the .txt. */
  eq(cleanFilenameTitle("My-Book-pdf.txt"), "My Book",
    "F. ‘My-Book-pdf.txt’ → ‘My Book’ — the stray word need not match the real extension");
  eq(cleanFilenameTitle("The-Odyssey-Homer-Full-text-pdf.pdf"), "The Odyssey Homer Full text",
    "F. the name from the screenshot loses its hyphens and its stray ‘pdf’");
  eq(cleanFilenameTitle("The-Odyssey-Homer-Full-text-pdf.txt"), "The Odyssey Homer Full text",
    "F. …and so does the OCR’d .txt of the same book");
  eq(cleanFilenameTitle("My-Book-epub.txt"), "My Book",
    "F. any of the format words goes, whatever the file really is");
  eq(cleanFilenameTitle("Already Titled.txt"), "Already Titled",
    "F. a name with spaces is left exactly as it was");
  eq(cleanFilenameTitle("How to read a PDF.pdf"), "How to read a PDF",
    "F. …including one whose LAST WORD is the format — there it is the subject");
  eq(cleanFilenameTitle("war_and_peace.epub"), "war and peace",
    "F. underscores are separators too");
  eq(cleanFilenameTitle("pdf.pdf"), "pdf",
    "F. a name that is nothing but its format keeps the one word it has");
  eq(cleanFilenameTitle("The-Odyssey.txt"), "The Odyssey",
    "F. nothing is lowercased or title-cased on the way through");
  eq(cleanFilenameTitle("Full-text.txt"), "Full text",
    "F. ‘text’ is not a document format — a word that merely looks like one survives");
  /* An article or a preposition before the format word means the
     filename is a SENTENCE and that word is what it is about. Round
     two dropped it anyway, so the hyphenated twin of the very name
     round two's own comment defended ("How to read a PDF.pdf")
     regressed to "How to read a". */
  eq(cleanFilenameTitle("Read-the-doc.txt"), "Read the doc",
    "F. ‘the’ before the format word keeps it — a sentence, not a filename");
  eq(cleanFilenameTitle("How-to-read-a-pdf.txt"), "How to read a pdf",
    "F. …and so does ‘a’ — the hyphenated twin of ‘How to read a PDF.pdf’");
  eq(cleanFilenameTitle("Intro-to-html.txt"), "Intro to html",
    "F. …and ‘to’");
  eq(cleanFilenameTitle("notes-of-a-doc.txt"), "notes of a doc",
    "F. …and a marker that is two words back does not count, only the one before");
  /* Written down because it is wrong and known to be wrong: nothing in
     a filename says whether "html" after "Learning" is the subject or
     the format, and a list of verbs would be guessing at grammar. */
  eq(cleanFilenameTitle("Learning-html.txt"), "Learning",
    "F. the accepted edge: no marker, so ‘Learning-html’ still loses its ‘html’");
  eq(cleanFilenameTitle("My-Book-pdf-txt.txt"), "My Book pdf",
    "F. exactly one trailing word goes, not a run of them");
}

/* Every filename fallback has to go through it, and "every" means
   every FILE. Round one of this fix swept engine/import-parsers.js,
   found nothing left, and reported the job done -- while a fourth
   fallback sat in pages/custom-boot.js writing the parser's title
   into #paste-title, with its own copy of the strip-the-extension
   rule. A sweep that only looks where the author was looking cannot
   find the one they missed, so this one names both files. */
const SWEEP = [
  ["engine/import-parsers.js", join(ROOT, "assets", "js", "engine", "import-parsers.js")],
  ["pages/custom-boot.js", join(ROOT, "assets", "js", "pages", "custom-boot.js")],
];
let wiredTotal = 0;
for (const [label, file] of SWEEP) {
  const src = await readFile(file, "utf8").catch(() => "");
  chk(src.length > 0, `F. could read ${label} to sweep it`);
  /* Any `<something>.name.replace(` — file.name, f.name, whatever the
     local is called. Naming the variable would let the next copy hide
     behind a rename. */
  const bare = (src.match(/\.name\.replace\(/g) || []).length;
  eq(bare, 0, `F. ${label}: no filename fallback still strips the extension by hand`);
  wiredTotal += (src.match(/cleanFilenameTitle\(/g) || []).length;
}
/* Four call sites and the declaration: .txt/.md, the EPUB with no
   usable <dc:title>, the PDF, parseFile's own guarantee, and
   custom-boot's fallback. */
chk(wiredTotal >= 5, "F. every fallback in both files calls the helper", `${wiredTotal} calls`);

/* Real imports, through the real file input and the real save button.
   The names are the shapes the FIRST version of this fix got wrong: a
   .txt whose name still says "pdf". This section used to import
   "My-Book-txt.txt" -- the one shape where comparing the trailing word
   against the file's REAL extension happens to work -- so it could not
   tell the old rule from the new one and passed under both. */
const BODY = Buffer.from(paras("Gamma", 6).join("\n\n"), "utf8");
const IMPORTS = [
  ["My-Book-pdf.txt", "My Book",
    "F. a real .txt import named for a PDF is stored as ‘My Book’"],
  ["The-Odyssey-Homer-Full-text-pdf.txt", "The Odyssey Homer Full text",
    "F. …and the book from the screenshot, OCR’d to .txt, as ‘The Odyssey Homer Full text’"],
  ["Read-the-doc.txt", "Read the doc",
    "F. a real import of a hyphenated SENTENCE keeps its last word"],
  ["How-to-read-a-pdf.txt", "How to read a pdf",
    "F. …and so does the hyphenated twin of ‘How to read a PDF.pdf’"],
  ["Intro-to-html.txt", "Intro to html",
    "F. …and one whose marker is ‘to’"],
  ["Already Titled.txt", "Already Titled",
    "F. and ‘Already Titled.txt’ keeps its title untouched"],
];
for (const [name, want, why] of IMPORTS) {
  await freshCustomPage();
  const rec = await importFile(name, "text/plain", BODY);
  eq(rec.title, want, why);
}

/* ── a store-only ZIP writer, so an EPUB needs no dependency. Lifted
      from scripts/check-custom-chapters.mjs, which lifted it from
      check-import-extraction.mjs, which proved fflate reads what it
      writes. ──────────────────────────────────────────────────────── */
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
/* An EPUB whose package supplies no usable title, so the only title it
   can possibly get is the one derived from its filename.

   Two ways a package does that and they are not the same code path:
   no <dc:title> element at all, and a <dc:title> that is there but
   holds nothing but whitespace. The second one matched the regex and
   trimmed to "", which the parser handed back as the title -- and the
   caller, having been given a blank, invented its own from the raw
   filename. */
function buildUntitledEpub(titleEl = "") {
  const doc = (ps) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head>
<body>${ps.map((p) => `<p>${p}</p>`).join("\n")}</body></html>`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${titleEl}<dc:identifier id="id">urn:uuid:untitled</dc:identifier>
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
    ["OEBPS/ch1.xhtml", doc(paras("Epsilon", 8))],
  ]);
}
await freshCustomPage();
const epubRec = await importFile("My-Book-epub.epub", "application/epub+zip", buildUntitledEpub());
eq(epubRec.title, "My Book",
  "F. an EPUB with no <dc:title> falls back through the same helper");

await freshCustomPage();
const epubBlank = await importFile("My-Book-epub.epub", "application/epub+zip",
  buildUntitledEpub("<dc:title>   </dc:title>\n"));
eq(epubBlank.title, "My Book",
  "F. …and so does one whose <dc:title> is there but holds only whitespace");

/* A title already on disk is a title someone may have chosen. The
   import-time cleanup must not reach back and rewrite it. */
await seedRecords([{ ...ODY, id: "c_old", title: "An-Old-Record-pdf" }]);
eq((await page.textContent(".saved-item__title")).trim(), "An-Old-Record-pdf",
  "F. a title already stored is left exactly as it is");

// ══════════════════════════════════ G. the chapters-unavailable hint
console.log("\n## G. The chapters-unavailable hint still belongs to the chapter row");
await seedRecords([{ ...ODY, id: "c_nodb", chaptersUnavailable: true }]);
const hint = await page.evaluate(() => {
  const el = document.querySelector('[data-hint="chapters-unavailable"]');
  if (!el) return null;
  const row = el.closest(".saved-item__actions");
  return {
    text: el.textContent.replace(/\s+/g, " ").trim(),
    inChapterRow: !!(row && row.classList.contains("saved-item__actions--chapter")),
    chaptersBtn: !!document.querySelector('[data-action="chapters"][data-id="c_nodb"]'),
  };
});
chk(!!hint, "G. the hint is rendered");
chk(hint && /no database/i.test(hint.text), "G. …and says why",
  hint ? JSON.stringify(hint.text.slice(0, 60)) : "");
chk(hint && hint.inChapterRow, "G. …on the chapter row, not loose in the card");
chk(hint && hint.chaptersBtn, "G. the row still works — degraded, not removed");

chk(pageErrors.length === 0, "no uncaught page errors", pageErrors.slice(0, 3).join(" ; "));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
