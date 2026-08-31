#!/usr/bin/env node
/* Lesson trends must be a small-multiples grid showing WPM AND accuracy.

   It was one chart with every lesson overplotted into a single pair of
   axes, plotting WPM only -- accuracy existed nowhere but the hover
   tooltip -- and the legend cut off at 8 lessons, so a user working
   through a long curriculum got eight labelled lines and a tangle of
   unlabelled ones.

   The trap in testing this: count panels and stop. A build that renders
   a fixed grid of empty boxes would pass. So this seeds a KNOWN history
   and requires each panel to carry that lesson's own last reading, and
   requires the shared WPM scale to equal the real maximum across all
   lessons.

   Usage: node scripts/check-lesson-trends.mjs   (needs _site served on 8765) */
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

/* Twelve lessons — deliberately more than the old legend's cap of 8 --
   each with a distinguishable last reading. Lesson 7 carries the global
   WPM maximum so the shared scale can be checked against a known value. */
const LESSONS = 12;
const seeded = [];
for (let L = 1; L <= LESSONS; L++) {
  for (let a = 0; a < 3; a++) {
    seeded.push({
      lessonId: L,
      at: `2026-08-${String(10 + a).padStart(2, "0")}T10:00:00.000Z`,
      wpm: (L === 7 && a === 2) ? 99 : 20 + L + a * 2,
      acc: 90 + ((L + a) % 9),
      errors: 3, durMs: 60000, passed: true, sessionId: `s_${L}_${a}`,
    });
  }
}
const lastOf = (L) => seeded.filter((r) => r.lessonId === L).slice(-1)[0];
const GLOBAL_MAX_WPM = Math.max(...seeded.map((r) => r.wpm));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 1200 }, serviceWorkers: "block" });
p.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 200)));

async function seed(results) {
  await p.goto(B + "/stats/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(300);
  // Write through the real profile API rather than hand-rolling the
  // record shape, so a schema change breaks this loudly instead of
  // letting it test a shape the app no longer uses.
  await p.evaluate(async (rows) => {
    const prof = await import("/assets/js/profiles.js");
    prof.updateActive((x) => { x.lessonResults = rows; return x; });
  }, results);
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(700);
}

const readGrid = () => p.evaluate(() => {
  const svg = document.getElementById("lesson-trends-svg");
  const panels = [...svg.querySelectorAll(".chart__panel")].map((g) => ({
    title: (g.querySelector(".chart__panel-title") || {}).textContent || "",
    caption: (g.querySelector(".chart__panel-caption") || {}).textContent || "",
    wpmLines: g.querySelectorAll(".chart__line--wpm").length,
    accLines: g.querySelectorAll(".chart__line--acc").length,
    dots: g.querySelectorAll(".chart__dot").length,
  }));
  return {
    panels,
    ticks: [...svg.querySelectorAll(".chart__tick")].map((t) => t.textContent),
    text: svg.textContent.replace(/\s+/g, " ").trim(),
  };
});

console.log("\n## A panel per lesson — nothing truncated at 8");
await seed(seeded);
let g = await readGrid();
chk(g.panels.length === LESSONS, `${LESSONS} lessons practiced → ${LESSONS} panels`, `got ${g.panels.length}`);

console.log("\n## Every panel carries both curves");
chk(g.panels.length === LESSONS && g.panels.every((x) => x.wpmLines === 1), "each panel has exactly one WPM line",
  JSON.stringify(g.panels.map((x) => x.wpmLines)));
chk(g.panels.length === LESSONS && g.panels.every((x) => x.accLines === 1), "each panel has exactly one accuracy line — this is the half that did not exist",
  JSON.stringify(g.panels.map((x) => x.accLines)));

console.log("\n## Each panel shows ITS OWN data, not a shared or empty frame");
let mismatched = [];
for (let L = 1; L <= LESSONS; L++) {
  const want = lastOf(L);
  const panel = g.panels.find((x) => x.title.trim() === `Lesson ${L}`);
  if (!panel) { mismatched.push(`Lesson ${L}: no panel`); continue; }
  const cap = panel.caption.replace(/\s+/g, " ");
  if (!cap.includes(`${want.wpm} wpm`) || !cap.includes(`${want.acc}%`)) {
    mismatched.push(`Lesson ${L}: caption ${JSON.stringify(cap)} want ${want.wpm} wpm / ${want.acc}%`);
  }
}
chk(mismatched.length === 0, "every panel's caption is that lesson's own latest attempt",
  mismatched.slice(0, 3).join(" | "));
chk(g.panels.length === LESSONS && g.panels.every((x) => x.dots === 3), "each panel plots all three attempts",
  JSON.stringify(g.panels.map((x) => x.dots)));

console.log("\n## The WPM scale is shared, so panels are comparable");
chk(g.panels.length === LESSONS && g.ticks.includes(String(GLOBAL_MAX_WPM)),
  `the axis maximum is the global max (${GLOBAL_MAX_WPM}), not each panel's own`,
  JSON.stringify(g.ticks.filter((t) => /^\d+$/.test(t)).slice(0, 8)));
chk(/accuracy \(\d+-100%\)/.test(g.text), "the legend states the accuracy range it is drawn against",
  JSON.stringify(g.text.slice(0, 90)));

console.log("\n## Anti-vacuity — the grid follows the data, it is not a fixed frame");
await seed(seeded.filter((r) => r.lessonId === 3));
g = await readGrid();
chk(g.panels.length === 1, "one lesson practiced → exactly one panel", `got ${g.panels.length}`);
// Guarded: with the grid absent entirely there is no panels[0], and an
// exception here would abort the run before the checks below — a suite
// that stops early looks the same as one that passed.
chk(!!g.panels[0] && g.panels[0].title.trim() === "Lesson 3",
  "…and it is the lesson that was actually practiced",
  JSON.stringify(g.panels[0] ? g.panels[0].title : null));

await seed([]);
g = await readGrid();
chk(g.panels.length === 0, "no history → no panels", `got ${g.panels.length}`);
chk(/Complete a lesson/.test(g.text), "…and the empty state says so", JSON.stringify(g.text.slice(0, 60)));

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
