#!/usr/bin/env node
/* The branches check-custom-large-import.mjs does not reach: the
   no-IndexedDB fallback, migrating pre-IndexedDB saved texts, the
   corpus save path, the pinned-lesson card, and the settings wipe.

   Usage: node scripts/check-custom-storage-branches.mjs  (needs _site served on 8765) */
import { chromium } from "playwright";
const B = process.env.BASE_URL || "http://localhost:8765";
let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };
/* Service workers are BLOCKED in every context below. pwa.js calls
   location.reload() on controllerchange, and when that reload lands
   mid-test the page is rebuilt underneath whatever was being driven --
   panels detach, elements go stale, and a healthy build gets accused at
   random. These gates are about custom-text behaviour, not the service
   worker, so the honest thing is to take it out of the picture. */
const b = await chromium.launch();

/* Bodies in the IndexedDB store, or -1 when the store does not exist.
   -1 is what a build that never uses IndexedDB looks like, so this is
   what separates "fell back after trying" from "never tried". */
const bodyCount = (page) => page.evaluate(() => new Promise((res) => {
  let req;
  try { req = indexedDB.open("tt-custom"); } catch { res(-1); return; }
  req.onerror = req.onblocked = () => res(-1);
  req.onsuccess = () => {
    try {
      const g = req.result.transaction("segments", "readonly").objectStore("segments").getAllKeys();
      g.onsuccess = () => res(g.result.length);
      g.onerror = () => res(-1);
    } catch { res(-1); }
  };
}));

// ── 1. IndexedDB refused: must fall back and SAY it trimmed ──────
{
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { get() { return undefined; }, configurable: true });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  PAGEERROR(fallback):", String(e).slice(0, 160)));
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});

  const big = Array.from({ length: 8000 }, (_, i) =>
    `Fallback sentence ${i} with enough words to be prose rather than filler.`).join(" ");
  await p.setInputFiles("#uploader-file", { name: "fb.txt", mimeType: "text/plain", buffer: Buffer.from(big, "utf8") });
  await p.waitForFunction(() => document.querySelector("#paste-text").value.length > 0, null, { timeout: 30000 });
  await p.click("#paste-save");
  await p.waitForSelector(".saved-item", { timeout: 60000 });
  const t = await p.textContent("#toast");
  chk(/Trimmed/i.test(t || ""), "no-IndexedDB browser is TOLD the text was trimmed", JSON.stringify((t || "").slice(0, 90)));
  // Trimming and saying so is what the OLD build did too. What is new is
  // naming the reason, so assert that -- otherwise this whole section
  // passes with the fix reverted and proves nothing.
  chk(/does not give the site a database/i.test(t || ""),
    "...and told WHY, not just that it happened", JSON.stringify((t || "").slice(0, 110)));
  const it = await p.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0]);
  chk(!!it && Array.isArray(it.segments) && it.segments.length > 0, "fallback keeps segments inline in localStorage",
    it ? `${(it.segments || []).length} segments` : "(none)");
  chk(!!it && it.bytes <= 512 * 1024, "fallback respects the old ceiling", it ? `${it.bytes} chars` : "");

  // ...and it must still be typeable.
  await p.goto(`${B}/practice/?mode=custom&custom=${it.id}&seg=3`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".tt-char", { timeout: 30000 });
  const target = (await p.$$eval(".tt-char", (els) => els.slice(0, 30).map((e) => e.textContent).join("")))
    .replace(/\s+/g, " ");
  chk(/Fallback sentence/.test(target), "fallback text still types", JSON.stringify(target.slice(0, 40)));
  // New-shape index record, and the picker exists at all — neither is
  // true of the old build.
  chk(typeof it.segCount === "number" && it.segCount === it.segments.length,
    "fallback record still carries segCount", `segCount=${it.segCount}`);
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.click('[data-action="segments"]');
  await p.waitForSelector(".seg-picker__item", { timeout: 30000 }).catch(() => {});
  const fbRows = await p.$$eval(".seg-picker__item", (e) => e.length).catch(() => 0);
  chk(fbRows > 0, "a fallback text is still segment-pickable", `${fbRows} rows`);
  await ctx.close();
}

// ── 1b. IndexedDB present but the write is refused (out of room) ──
{
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    // Exactly what a full disk looks like from here.
    const orig = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) {
      if (this.name === "segments") throw new DOMException("Quota exceeded", "QuotaExceededError");
      return orig.apply(this, a);
    };
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  PAGEERROR(quota):", String(e).slice(0, 160)));
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    await new Promise((r) => { const q = indexedDB.deleteDatabase("tt-custom"); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});

  const big = Array.from({ length: 8000 }, (_, i) =>
    `Refused sentence ${i} with enough words to be prose rather than filler.`).join(" ");
  await p.setInputFiles("#uploader-file", { name: "refused.txt", mimeType: "text/plain", buffer: Buffer.from(big, "utf8") });
  await p.waitForFunction(() => document.querySelector("#paste-text").value.length > 0, null, { timeout: 30000 });
  await p.click("#paste-save");
  await p.waitForSelector(".saved-item", { timeout: 60000 });
  const t = await p.textContent("#toast");
  chk(/Trimmed/i.test(t || ""), "a refused database is reported, not swallowed", JSON.stringify((t || "").slice(0, 70)));
  const it = await p.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0]);
  chk(!!it && Array.isArray(it.segments) && it.segments.length > 0,
    "refused write falls back to inline storage", it ? `${(it.segments || []).length} segments` : "(none)");
  chk(!!it && it.bytes <= 512 * 1024, "refused write respects the old ceiling", it ? `${it.bytes} chars` : "");
  // The store must EXIST and be EMPTY: the code opened the database,
  // was turned down, and fell back. A build that never touches
  // IndexedDB has no store at all and scores -1 here.
  const refusedBodies = await bodyCount(p);
  chk(refusedBodies === 0, "the database was opened and then refused, not skipped",
    refusedBodies === -1 ? "no segments store — IndexedDB was never used" : `${refusedBodies} bodies`);
  chk(/refused to store it/i.test(t || ""), "the refusal is named as a refusal, not a missing database",
    JSON.stringify((t || "").slice(0, 110)));
  await p.goto(`${B}/practice/?mode=custom&custom=${it.id}&seg=2`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".tt-char", { timeout: 30000 });
  const target = (await p.$$eval(".tt-char", (els) => els.slice(0, 30).map((e) => e.textContent).join("")))
    .replace(/\s+/g, " ");
  chk(/Refused sentence/.test(target), "the fallback copy still types", JSON.stringify(target.slice(0, 40)));
  await ctx.close();
}

// ── 2b. Body stored, then the index write fails: no orphan left ──
{
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  PAGEERROR(orphan):", String(e).slice(0, 160)));
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    await new Promise((r) => { const q = indexedDB.deleteDatabase("tt-custom"); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  });
  // localStorage full: the body reaches IndexedDB, the index record
  // cannot be written. Without the rollback the body is orphaned --
  // storage consumed forever by a text no page can list.
  await p.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "tt:custom-texts") throw new DOMException("Quota exceeded", "QuotaExceededError");
      return orig.call(this, k, v);
    };
  });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.fill("#paste-title", "Orphan");
  await p.fill("#paste-text", Array.from({ length: 60 }, (_, i) => `Orphan sentence ${i} here.`).join(" "));
  await p.click("#paste-save");
  await p.waitForFunction(() => /out of storage/i.test(document.getElementById("toast").textContent || ""), null, { timeout: 30000 }).catch(() => {});
  const t2 = await p.textContent("#toast");
  chk(/out of storage/i.test(t2 || ""), "a failed index write is reported, not swallowed", JSON.stringify((t2 || "").slice(0, 70)));
  const orphans = await bodyCount(p);
  chk(orphans === 0, "the stored body is rolled back, leaving no orphan",
    orphans === -1 ? "no segments store" : `${orphans} bodies left`);
  await ctx.close();
}

// ── 3. Corpus "Save" (saveText became async) ─────────────────────
{
  const p = await b.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
  p.on("pageerror", (e) => console.log("  PAGEERROR(corpus):", String(e).slice(0, 160)));
  await p.goto(B + "/parables/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  const saveBtn = await p.$('[data-action="save"]');
  chk(!!saveBtn, "parables: a save control exists");
  if (saveBtn) {
    await saveBtn.click();
    await p.waitForFunction(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]").length > 0, null, { timeout: 30000 }).catch(() => {});
    const n = await p.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]").length);
    chk(n >= 1, "corpus: saving to my texts still works", `${n} saved`);
  }
  await p.close();
}

// ── 4. Pinned lesson card shows a segment count (segCount split) ──
{
  const p = await b.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
  p.on("pageerror", (e) => console.log("  PAGEERROR(lessons):", String(e).slice(0, 160)));
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    await new Promise((r) => { const q = indexedDB.deleteDatabase("tt-custom"); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.fill("#paste-title", "Pinned thing");
  await p.fill("#paste-text", Array.from({ length: 40 }, (_, i) => `Pinned sentence ${i} here.`).join(" "));
  await p.click("#paste-save");
  await p.waitForSelector('[data-action="pin"]', { timeout: 30000 });
  await p.click('[data-action="pin"]');
  await p.waitForTimeout(300);
  await p.goto(B + "/lessons/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(700);
  const card = await p.textContent("#user-lessons-grid").catch(() => "");
  chk(/\d+ segments/.test(card || "") && !/undefined|NaN/.test(card || ""),
    "pinned lesson card shows a real segment count", JSON.stringify((card || "").replace(/\s+/g, " ").trim().slice(0, 60)));
  await p.close();
}

// ── 4b. Pre-IndexedDB saved texts migrate, and hand the quota back ──
{
  const p = await b.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
  p.on("pageerror", (e) => console.log("  PAGEERROR(migrate):", String(e).slice(0, 160)));
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    await new Promise((r) => { const q = indexedDB.deleteDatabase("tt-custom"); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  });
  // Seed a record in the OLD shape: bodies inline in localStorage.
  await p.evaluate(() => {
    const segments = Array.from({ length: 900 }, (_, i) => `Legacy segment ${i}. ` + "x".repeat(400));
    localStorage.setItem("tt:custom-texts", JSON.stringify([{
      id: "c_legacy", title: "Old import", createdAt: new Date().toISOString(),
      bytes: segments.join(" ").length, lastSeg: 5, segments, meta: null,
    }]));
  });
  const before = await p.evaluate(() => localStorage.getItem("tt:custom-texts").length);
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.waitForSelector(".saved-item", { timeout: 30000 });
  await p.waitForFunction(() => {
    const it = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0];
    return it && !it.segments;
  }, null, { timeout: 30000 }).catch(() => {});
  const after = await p.evaluate(() => localStorage.getItem("tt:custom-texts").length);
  chk(after < before / 100, "legacy inline text moves out of localStorage", `${before} chars -> ${after}`);
  const meta = await p.textContent(".saved-item__meta").catch(() => "");
  chk(/900 segments/.test(meta || ""), "migrated text still reports its segment count", JSON.stringify((meta || "").trim().slice(0, 50)));
  // And it must still be typeable at the segment it was left on.
  await p.goto(B + "/practice/?mode=custom&custom=c_legacy&seg=700", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".tt-char", { timeout: 30000 });
  const t = (await p.$$eval(".tt-char", (els) => els.slice(0, 24).map((e) => e.textContent).join(""))).replace(/\s+/g, " ");
  chk(/Legacy segment 700/.test(t), "migrated text types at a late segment", JSON.stringify(t.slice(0, 30)));
  await p.close();
}

// ── 5. Settings wipe clears the IndexedDB bodies too ─────────────
{
  const p = await b.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
  p.on("pageerror", (e) => console.log("  PAGEERROR(settings):", String(e).slice(0, 160)));
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    await new Promise((r) => { const q = indexedDB.deleteDatabase("tt-custom"); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
  await p.fill("#paste-title", "Wipe me");
  await p.fill("#paste-text", Array.from({ length: 60 }, (_, i) => `Wipe sentence ${i} here.`).join(" "));
  await p.click("#paste-save");
  await p.waitForSelector(".saved-item", { timeout: 30000 });
  const before = await p.evaluate(() => new Promise((res) => {
    const q = indexedDB.open("tt-custom");
    q.onerror = q.onblocked = () => res(-1);
    q.onsuccess = () => {
      try {
        const g = q.result.transaction("segments", "readonly").objectStore("segments").getAllKeys();
        g.onsuccess = () => res(g.result.length); g.onerror = () => res(-1);
      } catch { res(-1); }
    };
  }));
  // Not an exact count: /custom/ also seeds a sample text into an empty
  // list, so the store legitimately holds more than the one just saved.
  chk(before >= 1, "a body is in IndexedDB before the wipe", `${before}`);
  await p.goto(B + "/settings/", { waitUntil: "domcontentloaded" });
  await p.click("#reset-all");
  // confirmModal() builds a <dialog> with [data-ok]. The old selector
  // list guessed at three class names, two of which exist nowhere, and
  // swallowed a failed click — so a wipe that never got confirmed would
  // have looked like a wipe that did not work.
  await p.waitForSelector("dialog[open] [data-ok]", { timeout: 15000 });
  await p.click("dialog[open] [data-ok]");
  await p.waitForTimeout(2500);
  const after = await p.evaluate(() => new Promise((res) => {
    const q = indexedDB.open("tt-custom");
    q.onerror = q.onblocked = () => res(-1);
    q.onsuccess = () => {
      try {
        const g = q.result.transaction("segments", "readonly").objectStore("segments").getAllKeys();
        g.onsuccess = () => res(g.result.length); g.onerror = () => res(-1);
      } catch { res(-1); }
    };
  }));
  chk(after === 0, "wipe removed the IndexedDB body too", `${after} left`);
  await p.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
