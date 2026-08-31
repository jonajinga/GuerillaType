#!/usr/bin/env node
/* A custom text pinned as a lesson must resume where the reader got to.

   The card on /lessons/ hard-coded seg=0, so a pinned 481-segment book
   restarted from segment 1 every time it was opened from there. The
   bookmark was being written on every finished segment (setSegProgress)
   and read on /custom/, and then thrown away by this one link.

   The trap in testing this: assert only "the href contains seg=2" and a
   card that hard-codes seg=2 passes. So the suite drives the bookmark
   to three different values, including 0, and requires the link to
   follow it each time.

   Usage: node scripts/check-lesson-resume.mjs   (needs _site served on 8765) */
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:8765";

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

/* Long enough to chunk into a good number of ~500-char segments, and
   each sentence numbered so a specific one is identifiable. */
const BOOK = Array.from({ length: 120 }, (_, i) =>
  `Sentence number ${i} of the pinned lesson, carrying enough words to look like real prose rather than filler.`
).join(" ");

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
p.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 200)));

await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await p.evaluate(async () => {
  localStorage.clear();
  localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
  await new Promise((res) => {
    const r = indexedDB.deleteDatabase("tt-custom");
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
});
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForSelector("#uploader-file", { state: "attached", timeout: 30000 });

await p.setInputFiles("#uploader-file", {
  name: "pinned.txt", mimeType: "text/plain", buffer: Buffer.from(BOOK, "utf8"),
});
await p.waitForFunction(() => document.querySelector("#paste-text").value.length > 500, { timeout: 30000 });
await p.click("#paste-save");
await p.waitForSelector(".saved-item", { timeout: 30000 });

// Pin it as a lesson through the real button.
await p.click('[data-action="pin"]');
await p.waitForTimeout(300);

const { id, count } = await p.evaluate(() => {
  const it = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0];
  return { id: it.id, count: it.segCount, pinned: !!it.forLesson };
});
const pinned = await p.evaluate(() => !!JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0].forLesson);
chk(pinned, "the text is pinned as a lesson", `id=${id} segments=${count}`);
chk(count >= 4, "the fixture really does chunk into several segments — otherwise resuming is untestable", `segments=${count}`);

async function cardHref() {
  await p.goto(B + "/lessons/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#user-lessons-grid .lesson-card", { timeout: 30000 });
  return p.evaluate(() => {
    const a = document.querySelector("#user-lessons-grid .lesson-card");
    return { href: a.getAttribute("href"), text: a.textContent.replace(/\s+/g, " ").trim() };
  });
}

console.log("\n## The card follows the bookmark, wherever it is");
for (const want of [3, 1, 0]) {
  // Write the bookmark the same way the practice page does.
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".saved-item", { timeout: 30000 });
  await p.evaluate(async (args) => {
    const [tid, seg] = args;
    const ct = await import("/assets/js/engine/custom-text.js");
    ct.setSegProgress(tid, seg);
  }, [id, want]);

  const { href, text } = await cardHref();
  chk(href.includes(`seg=${want}`), `bookmark at ${want} → the card links to seg=${want}`, href);
  if (want > 0) {
    chk(text.includes(`resuming at ${want + 1} of ${count}`),
      `…and says so on the card ("resuming at ${want + 1} of ${count}")`, JSON.stringify(text));
  } else {
    chk(!/resuming/i.test(text), "…and says nothing about resuming when at the start", JSON.stringify(text));
  }
}

console.log("\n## The link actually lands on that segment");
await p.evaluate(async (args) => {
  const [tid, seg] = args;
  const ct = await import("/assets/js/engine/custom-text.js");
  ct.setSegProgress(tid, seg);
}, [id, 3]);
const { href } = await cardHref();
await p.goto(B + href, { waitUntil: "domcontentloaded" });
await p.waitForSelector("#tt-text .tt-char", { timeout: 30000 });
const landed = await p.evaluate(() =>
  [...document.querySelectorAll("#tt-text .tt-char")]
    .map((el) => (el.classList.contains("tt-char--space") ? " " : el.textContent)).join(""));
const seg3 = await p.evaluate(async (tid) => {
  const ct = await import("/assets/js/engine/custom-text.js");
  return (await ct.getSegments(tid))[3];
}, id);
chk(landed.replace(/\s+/g, " ").trim() === seg3.replace(/\s+/g, " ").trim(),
  "following the card puts segment 3 on the typing surface, not segment 0",
  landed.slice(0, 60) + " …");

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
