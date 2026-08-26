#!/usr/bin/env node
/* Reproduces the reported bug: uploading a whole book to /custom/ used
   to be silently cut off at the old 512k-character localStorage
   ceiling, and there was no way to pick which part of a long text to
   type other than hand-editing ?seg= in the URL.

   Drives the real UI -- real file input, real save button, real picker.
   Usage: node scripts/check-custom-large-import.mjs  (needs _site served on 8765) */
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:8765";
const OLD_CEILING = 512 * 1024;   // what the bug used to trim to
let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err?.message ?? err}`);
  console.log("\nRUN ABORTED — counts below are partial.");
  process.exit(1);
});

/* ~1.5M characters of distinguishable prose: well past the old ceiling,
   roughly what a 600-page PDF extracts to. Each sentence carries its own
   index so we can prove a specific late segment really is reachable. */
function buildBook() {
  const out = [];
  for (let i = 0; i < 26000; i++) {
    out.push(`Sentence number ${i} of the imported book, carrying enough words to look like real prose rather than filler.`);
  }
  return out.join(" ");
}
const BOOK = buildBook();
const NEEDLE = "Sentence number 25900 of the imported book";

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
p.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 200)));

console.log(`  (uploading ${BOOK.length.toLocaleString()} characters — old ceiling was ${OLD_CEILING.toLocaleString()})`);

await p.goto(B + "/custom/", { waitUntil: "networkidle" });
await p.evaluate(async () => {
  localStorage.clear();
  await new Promise((res) => {
    const r = indexedDB.deleteDatabase("tt-custom");
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
});
await p.reload({ waitUntil: "networkidle" });

// ── Upload through the real file input ──────────────────────────
await p.setInputFiles("#uploader-file", {
  name: "big-book.txt",
  mimeType: "text/plain",
  buffer: Buffer.from(BOOK, "utf8"),
});
await p.waitForFunction(() => document.querySelector("#paste-text").value.length > 0, null, { timeout: 30000 });

const notice = await p.textContent("#paste-notice").catch(() => "");
chk(/whole text is saved/i.test(notice || ""), "big upload says the whole text is kept, not the preview", JSON.stringify((notice || "").slice(0, 60)));

await p.click("#paste-save");
await p.waitForSelector(".saved-item", { timeout: 60000 });
await p.waitForFunction(() => !document.querySelector("#paste-save").disabled, null, { timeout: 60000 });

// ── The text was not cut off ────────────────────────────────────
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0] || null);
chk(!!saved, "the text saved at all");
chk(!!saved && saved.bytes > OLD_CEILING * 2, "stored size is past the old 512 KB ceiling",
  saved ? `${saved.bytes.toLocaleString()} chars` : "(none)");
chk(!!saved && Math.abs(saved.bytes - BOOK.length) < 200, "stored size matches what was uploaded",
  saved ? `${saved.bytes.toLocaleString()} of ${BOOK.length.toLocaleString()}` : "(none)");

// ── ...and it is not sitting in localStorage eating the 5 MB budget ──
const lsBytes = await p.evaluate(() => (localStorage.getItem("tt:custom-texts") || "").length);
chk(lsBytes < 4096, "the body left localStorage (index record only)", `${lsBytes} chars`);

const idbSegs = await p.evaluate((id) => new Promise((res) => {
  const req = indexedDB.open("tt-custom");
  req.onsuccess = () => {
    const g = req.result.transaction("segments", "readonly").objectStore("segments").get(id);
    g.onsuccess = () => res(g.result ? g.result.segments.length : 0);
    g.onerror = () => res(-1);
  };
  req.onerror = () => res(-1);
}), saved && saved.id);
chk(idbSegs > 2000, "segments are in IndexedDB", `${idbSegs} segments`);
chk(!!saved && saved.segCount === idbSegs, "the index record agrees with the stored body",
  saved ? `${saved.segCount} vs ${idbSegs}` : "");

const toastText = await p.textContent("#toast").catch(() => "");
chk(!/trim/i.test(toastText || ""), "nothing reported as trimmed", JSON.stringify((toastText || "").slice(0, 80)));

// ── The segment picker: choose which part to work on ────────────
const pickerBtn = await p.$('[data-action="segments"]');
chk(!!pickerBtn, "‘Choose segment’ control exists");
if (!pickerBtn) { await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

await pickerBtn.click();
await p.waitForSelector(".seg-picker__item", { timeout: 30000 });
const firstPreview = await p.textContent(".seg-picker__item .seg-picker__preview");
chk(!!firstPreview && firstPreview.trim().length > 10, "picker lists segments with previews",
  JSON.stringify((firstPreview || "").slice(0, 40)));

// Search finds a late segment — the part of the book the old build
// never even stored.
await p.fill(".seg-picker__filter", NEEDLE);
await p.waitForFunction(
  (needle) => {
    const items = [...document.querySelectorAll(".seg-picker__item .seg-picker__preview")];
    return items.length > 0 && items.some((e) => e.textContent.includes(needle));
  },
  NEEDLE, { timeout: 30000 });
const hitSeg = await p.evaluate((needle) => {
  const a = [...document.querySelectorAll(".seg-picker__item")]
    .find((x) => x.textContent.includes(needle));
  return a ? { seg: a.dataset.seg, href: a.getAttribute("href") } : null;
}, NEEDLE);
chk(!!hitSeg && Number(hitSeg.seg) > 2000, "search reaches a segment past the old ceiling",
  hitSeg ? `segment ${Number(hitSeg.seg) + 1}` : "(not found)");

// ── Clicking it actually types that part ────────────────────────
if (hitSeg) {
  await p.goto(B + hitSeg.href, { waitUntil: "networkidle" });
  await p.waitForSelector(".tt-char", { timeout: 30000 });
  const target = await p.$$eval(".tt-char", (els) =>
    els.slice(0, 60).map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
  chk(target.includes("25900") || target.includes("2590"), "that segment is what the practice page renders",
    JSON.stringify(target.slice(0, 50)));
}

// ── Jump-to-number, and survival across a reload ────────────────
await p.goto(B + "/custom/", { waitUntil: "networkidle" });
await p.waitForSelector('[data-action="segments"]', { timeout: 30000 });
const stillFull = await p.evaluate(() => {
  const it = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0];
  return it ? it.bytes : 0;
});
chk(stillFull > OLD_CEILING * 2, "still full size after a reload", `${stillFull.toLocaleString()} chars`);

await p.click('[data-action="segments"]');
await p.waitForSelector(".seg-picker__jumpnum", { timeout: 30000 });
await p.fill(".seg-picker__jumpnum", "1200");
await p.click('[data-picker="jump"]');
await p.waitForURL(/seg=1199/, { timeout: 30000 }).catch(() => {});
chk(/seg=1199/.test(p.url()), "‘Go to’ jumps straight to a chosen segment", p.url().split("?")[1] || p.url());

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
