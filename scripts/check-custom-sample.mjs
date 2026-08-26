#!/usr/bin/env node
/* The bundled sample text: it must be there on a fresh browser, be
   typeable and segment-pickable like any import, and -- the part that
   is easy to get wrong -- STAY deleted once the user deletes it.

   Usage: node scripts/check-custom-sample.mjs  (needs _site served on 8765) */
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:8765";
let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err?.message ?? err}`);
  console.log("\nRUN ABORTED — counts below are partial.");
  process.exit(1);
});

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
p.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 200)));

/* Waiting on network idle is flaky here — the page boots through a
   chain of module imports and the idle window gets missed under load,
   which fails the run for a reason that has nothing to do with the
   sample. Wait for the list to have actually rendered instead: a card
   or the empty state both mean custom-boot finished. */
const openCustom = async () => {
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 }).catch(() => {});
};

const wipe = async () => {
  await p.evaluate(async () => {
    localStorage.clear();
    await new Promise((r) => { const q = indexedDB.deleteDatabase("tt-custom"); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  });
};
const saved = () => p.evaluate(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]"));

// ── A fresh browser gets it ──────────────────────────────────────
await openCustom();
await wipe();
await openCustom();

let list = await saved();
chk(list.length === 1 && list[0].sample === true, "a fresh browser is seeded with the sample",
  list.length ? `${list.length} text(s), sample=${list[0].sample}` : "(none)");
chk(list.length === 1 && list[0].segCount > 200, "the sample is a whole book, not an excerpt",
  list.length ? `${list[0].segCount} segments` : "");
chk(list.length === 1 && list[0].bytes > 100000, "the whole book is stored",
  list.length ? `${list[0].bytes.toLocaleString()} chars` : "");

const badge = await p.textContent(".saved-item__sample").catch(() => "");
chk(/sample/i.test(badge || ""), "the card is labelled a sample", JSON.stringify((badge || "").trim()));

const emptyMsg = await p.$(".stats-empty");
chk(!emptyMsg, "the 'no saved texts yet' empty state is gone");

// ── It behaves like any other import ─────────────────────────────
const sampleId = list.length ? list[0].id : "none";
const hadSample = list.length === 1 && list[0].sample === true;
chk(!!(await p.$('[data-action="segments"]')), "the sample is segment-pickable");
await p.click('[data-action="segments"]').catch(() => {});
await p.waitForSelector(".seg-picker__item", { timeout: 30000 }).catch(() => {});
const rows = await p.$$eval(".seg-picker__item", (e) => e.length).catch(() => 0);
chk(rows > 1, "the picker lists its segments", `${rows} rows`);
const pager = (await p.textContent(".seg-picker__page").catch(() => "")) || "";
const pages = parseInt((pager.match(/of\s+([\d,]+)/) || [])[1]?.replace(/,/g, "") || "0", 10);
chk(pages > 1, "a whole book paginates the picker", JSON.stringify(pager.trim()));

// The last chapter is the part an excerpt would not have.
/* The filter is debounced and renderPicker rewrites the panel's HTML,
   replacing the input element. Typing into it can therefore land while
   the node is being swapped and be lost, so drive it until the count
   line proves the query took effect rather than assuming one fill did. */
const applyFilter = async (q) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await p.fill(".seg-picker__filter", q).catch(() => {});
    const took = await p.waitForFunction(
      (needle) => {
        const input = document.querySelector(".seg-picker__filter");
        const count = document.querySelector(".seg-picker__count");
        return !!input && input.value === needle && !!count && /matching/.test(count.textContent);
      },
      q, { timeout: 5000 }).then(() => true).catch(() => false);
    if (took) return true;
  }
  return false;
};
const filtered = await applyFilter("CHAPTER XII");
chk(filtered, "the picker's search applies", filtered ? "" : "the filter never took effect");
const lastCh = await p.evaluate(() => {
  const a = [...document.querySelectorAll(".seg-picker__item")].find((x) => /CHAPTER XII/.test(x.textContent));
  return a ? { seg: Number(a.dataset.seg), href: a.getAttribute("href") } : null;
});
chk(!!lastCh && lastCh.seg > 200, "search reaches the final chapter",
  lastCh ? `segment ${lastCh.seg + 1}` : "(CHAPTER XII not found)");
if (lastCh) {
  await p.goto(B + lastCh.href, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".tt-char", { timeout: 30000 }).catch(() => {});
  // Scan the WHOLE rendered segment. chunk() packs sentences up to ~500
  // characters, so a chapter heading usually sits mid-segment rather
  // than at its start -- checking only the first 40 characters failed on
  // a segment that did contain what was searched for.
  const t = (await p.$$eval(".tt-char", (els) => els.map((e) => e.textContent).join("")).catch(() => "")).replace(/\s+/g, " ");
  chk(/CHAPTER XII/.test(t), "the final chapter types",
    `${t.length} chars rendered, heading ${t.indexOf("CHAPTER XII") >= 0 ? "at " + t.indexOf("CHAPTER XII") : "absent"}`);
  await openCustom();
  await p.click('[data-action="segments"]').catch(() => {});
  await p.waitForSelector(".seg-picker__item", { timeout: 30000 }).catch(() => {});
}

const segs = await p.evaluate((id) => new Promise((res) => {
  let req;
  try { req = indexedDB.open("tt-custom"); } catch { res([]); return; }
  req.onerror = req.onblocked = () => res([]);
  req.onsuccess = () => {
    try {
      const g = req.result.transaction("segments", "readonly").objectStore("segments").get(id);
      g.onsuccess = () => res(g.result ? g.result.segments : []);
      g.onerror = () => res([]);
    } catch { res([]); }
  };
}), sampleId);

await p.goto(`${B}/practice/?mode=custom&custom=${sampleId}&seg=2`, { waitUntil: "domcontentloaded" });
await p.waitForSelector(".tt-char", { timeout: 30000 }).catch(() => {});
const typed = (await p.$$eval(".tt-char", (els) => els.slice(0, 40).map((e) => e.textContent).join("")).catch(() => "")).replace(/\s+/g, " ");
// Compare against the STORED segment. "longer than 20 characters" passed
// on the page's own "Add a custom text on the /custom/ page first."
const want = (segs[2] || "").replace(/\s+/g, " ").slice(0, 40);
chk(!!want && typed.startsWith(want.slice(0, 30)), "the sample actually types, and types segment 3",
  JSON.stringify(typed.slice(0, 44)));

// Site rule: typeable content carries no smart punctuation.
const full = segs.join(" ");
const smart = (full.match(/[‘’“”–—…]/g) || []);
chk(full.length > 100000 && smart.length === 0, "the sample carries no smart punctuation",
  `${full.length.toLocaleString()} chars, ${smart.length} smart`);
// Licence boilerplate would be shipped as something to type.
const leaked = /PROJECT GUTENBERG|MILLENNIUM FULCRUM|gutenberg\.org/i.exec(full);
chk(!leaked, "no Project Gutenberg boilerplate in the text", leaked ? leaked[0] : "");
const chapters = (full.match(/CHAPTER [IVX]+\./g) || []).length;
chk(chapters === 12, "all twelve chapters are present", `${chapters} chapter headings`);

// ── Deleting it must STICK ───────────────────────────────────────
await openCustom();
await p.waitForSelector('[data-action="delete"]', { timeout: 30000 }).catch(() => {});
await p.click('[data-action="delete"]').catch(() => {});
// confirmModal() builds a <dialog> with [data-title] / [data-message].
await p.waitForSelector("dialog[open] [data-message]", { timeout: 15000 }).catch(() => {});
const dTitle = (await p.textContent("dialog[open] [data-title]").catch(() => "")) || "";
const dMsg = (await p.textContent("dialog[open] [data-message]").catch(() => "")) || "";
chk(/sample/i.test(dTitle), "the confirm names it as the sample", JSON.stringify(dTitle.trim()));
chk(/not come back/i.test(dMsg), "the confirm says it will not come back", JSON.stringify(dMsg.trim().slice(0, 70)));
await p.click("dialog[open] [data-ok]").catch(() => {});
await p.waitForFunction(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]").length === 0, null, { timeout: 30000 }).catch(() => {});
chk(hadSample && (await saved()).length === 0, "deleting the sample removes it",
  hadSample ? "" : "nothing was seeded, so there was nothing to delete");

// The whole point: reload, and it must not grow back.
await openCustom();
await p.waitForTimeout(1200);
list = await saved();
chk(hadSample && list.length === 0, "it does NOT come back on reload",
  hadSample ? `${list.length} text(s)` : "nothing was seeded, so this proves nothing");
const empty = await p.$(".stats-empty");
chk(hadSample && !!empty, "the empty state is shown instead");

// ── It does not elbow in on someone who already has texts ────────
await wipe();
await p.evaluate(() => localStorage.setItem("tt:custom-texts", JSON.stringify([{
  id: "c_mine", title: "My own text", createdAt: new Date().toISOString(),
  bytes: 40, segCount: 1, lastSeg: 0, segments: ["Something I saved myself."], meta: null,
}])));
await openCustom();
await p.waitForTimeout(800);
list = await saved();
chk(list.length === 1 && list[0].id === "c_mine", "no sample is seeded when the user already has texts",
  `${list.length} text(s)`);

// ── An out-of-date sample is replaced, not left to rot ───────────
// This is the bug that shipped: a browser holding the early 7,100-char
// excerpt kept it forever, because the sample only ever seeded into an
// empty list.
await wipe();
await p.evaluate(() => {
  const segments = ["Alice was beginning to get very tired.", "So she considered in her own mind."];
  localStorage.setItem("tt:custom-texts", JSON.stringify([{
    id: "c_oldsample", title: "Old excerpt (sample)", createdAt: new Date().toISOString(),
    bytes: 7117, segCount: 18, lastSeg: 4, sample: true, segments, meta: null,
  }]));
});
await openCustom();
await p.waitForFunction(() => {
  const it = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0];
  return it && it.sample && (it.segCount | 0) > 200;
}, null, { timeout: 30000 }).catch(() => {});
list = await saved();
chk(list.length === 1 && (list[0].segCount | 0) > 200, "a stale sample is replaced with the current one",
  list.length ? `${list[0].segCount} segments` : "(none)");
chk(list.length === 1 && list[0].id !== "c_oldsample" && !!list[0].sampleVersion,
  "the replacement records which version it is", list.length ? String(list[0].sampleVersion) : "");
chk(list.length === 1 && (list[0].lastSeg | 0) === 4, "the bookmark survives the replacement",
  list.length ? `lastSeg=${list[0].lastSeg}` : "");

// Replacing must not count as the user deleting it.
await openCustom();
list = await saved();
chk(list.length === 1 && list[0].sample === true, "replacing does not dismiss the sample", `${list.length} text(s)`);

// ── Replacing a stale sample leaves the user's own texts alone ────
await wipe();
await p.evaluate(() => {
  localStorage.setItem("tt:custom-texts", JSON.stringify([
    { id: "c_oldsample", title: "Old excerpt (sample)", createdAt: new Date().toISOString(),
      bytes: 7117, segCount: 18, lastSeg: 0, sample: true, segments: ["Old sample text here."], meta: null },
    { id: "c_mine2", title: "My own text", createdAt: new Date().toISOString(),
      bytes: 40, segCount: 1, lastSeg: 0, segments: ["Something I saved myself."], meta: null },
  ]));
});
await openCustom();
await p.waitForFunction(() => JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")
  .some((x) => x.sample && (x.segCount | 0) > 200), null, { timeout: 30000 }).catch(() => {});
list = await saved();
chk(list.some((x) => x.id === "c_mine2"), "the user's own text survives a sample replacement",
  list.map((x) => x.title).join(" | "));
chk(list.filter((x) => x.sample).length === 1, "exactly one sample afterwards",
  `${list.filter((x) => x.sample).length} sample(s), ${list.length} total`);

// ── A stale sample the user DELETED stays deleted ────────────────
// The upgrade path must never undo a deletion.
await wipe();
await p.evaluate(() => {
  localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
});
await openCustom();
await p.waitForTimeout(1500);
list = await saved();
chk(list.length === 0, "an upgrade never resurrects a deleted sample", `${list.length} text(s)`);

// ── A wiped browser is a fresh browser ───────────────────────────
await wipe();
await openCustom();
list = await saved();
chk(list.length === 1 && list[0].sample === true, "a full wipe brings the sample back", `${list.length} text(s)`);

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
