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

console.log("\n## The two curves are actually different colours");
/* The gate counted elements carrying .chart__line--acc without ever
   asking whether the class did anything. chart.css .chart__line sets
   `stroke`, and a CSS property beats an SVG presentation attribute, so
   deleting the new rules leaves both lines painted var(--accent) while
   every count still matches. */
for (const theme of ["dark", "light", "dracula"]) {
  await p.evaluate((t) => localStorage.setItem("tt:theme", t), theme);
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(600);
  const strokes = await p.evaluate(() => {
    const svg = document.getElementById("lesson-trends-svg");
    const w = svg.querySelector(".chart__line--wpm"), a = svg.querySelector(".chart__line--acc");
    return {
      wpm: w ? getComputedStyle(w).stroke : null,
      acc: a ? getComputedStyle(a).stroke : null,
    };
  });
  chk(!!strokes.wpm && !!strokes.acc && strokes.wpm !== strokes.acc,
    `${theme}: the accuracy line is a different colour from the WPM line`,
    `wpm=${strokes.wpm} acc=${strokes.acc}`);
}
await p.evaluate(() => localStorage.removeItem("tt:theme"));

console.log("\n## A single-attempt lesson gets a filled marker, not a hollow ring");
/* .chart__line sets fill:none, so the one-point fallback must not carry
   that class — the same override that catches `stroke` catches `fill`. */
await seed(seeded.filter((r) => r.lessonId === 5).slice(0, 1));
{
  const marker = await p.evaluate(() => {
    const svg = document.getElementById("lesson-trends-svg");
    const el = svg.querySelector(".chart__point--acc");
    return el ? { tag: el.tagName, fill: getComputedStyle(el).fill } : null;
  });
  chk(!!marker, "a one-attempt lesson renders an accuracy marker", JSON.stringify(marker));
  chk(!!marker && marker.fill !== "none", "…and it is filled, not a ring", JSON.stringify(marker));
}

console.log("\n## The grid is bounded — 300 lessons must not make a 14-screen chart");
{
  const many = [];
  for (let L = 1; L <= 40; L++) {
    many.push({
      lessonId: L, at: `2026-08-${String(1 + (L % 27)).padStart(2, "0")}T10:00:00.000Z`,
      wpm: 30 + L, acc: 95, errors: 1, durMs: 60000, passed: true, sessionId: `m_${L}`,
    });
  }
  await seed(many);
  const g2 = await readGrid();
  chk(g2.panels.length === 24, "40 lessons practiced → 24 panels, not 40", `got ${g2.panels.length}`);
  chk(/24 most recently practiced of 40 lessons/.test(g2.text),
    "…and the chart says which 24 it is showing", JSON.stringify(g2.text.slice(0, 120)));
  const h = await p.evaluate(() => document.getElementById("lesson-trends-svg").getBoundingClientRect().height);
  chk(h < 1200, "…so the section stays a readable height", `${Math.round(h)}px`);

  // Under the cap, nothing is hidden and nothing claims to be.
  await seed(many.filter((r) => r.lessonId <= 12));
  const g3 = await readGrid();
  chk(g3.panels.length === 12, "12 lessons → all 12 panels", `got ${g3.panels.length}`);
  chk(!/most recently practiced/.test(g3.text), "…with no truncation notice");
}

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
