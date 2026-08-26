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
chk(list.length === 1 && list[0].segCount > 5, "the sample has enough segments to show the picker",
  list.length ? `${list[0].segCount} segments` : "");

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
chk(full.length > 1000 && smart.length === 0, "the sample carries no smart punctuation",
  `${full.length} chars, ${smart.length} smart`);

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

// ── A wiped browser is a fresh browser ───────────────────────────
await wipe();
await openCustom();
list = await saved();
chk(list.length === 1 && list[0].sample === true, "a full wipe brings the sample back", `${list.length} text(s)`);

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
