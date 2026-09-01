#!/usr/bin/env node
/* A custom text pinned as a lesson must be TRACKED like a lesson.

   Pinning and resuming already worked. What a pinned text never got was
   any of the things that make it a lesson: sessions from it were not
   recorded against a lesson id, so profile.lessonResults never gained
   an entry, sessionsByLesson was never indexed, no best-run was stored,
   and it could never show a mastery state or a panel on the stats page.

   Two traps, and the suite is built around them:

     - Assert only "a lessonResults entry appeared" and a build that
       records EVERY custom session passes — which would fill the
       lesson history with every book anyone reads. Section C types an
       UNPINNED text and requires nothing to be recorded.
     - The namespacing is load-bearing, not cosmetic. achievements.js
       counts tt:lesson-best-<n> for numeric n only, over 1..500, and
       megamenu.js scans the same range for the next unstarted lesson.
       If a custom text landed on a numeric key it would count toward
       "finish every lesson". Section D checks the numeric range is
       untouched.

   Usage: node scripts/check-custom-lesson-progress.mjs  (needs _site served on 8765) */
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

/* Short enough to chunk to one segment and be typed in full quickly. */
const BODY = "The clerk offered no explanation at all. He shrugged once and produced a form.";
const TITLE = "The Reclassified File";

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
p.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 200)));

const readProfile = () => p.evaluate(async () => {
  const prof = await import("/assets/js/profiles.js");
  const x = prof.getActive();
  return {
    lessonResults: x.lessonResults || [],
    sessionsByLesson: x.sessionsByLesson || {},
    sessions: (x.sessions || []).length,
  };
});

async function reset() {
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
}

async function importText(title, body, { pin }) {
  await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#uploader-file", { state: "attached", timeout: 30000 });
  await p.evaluate((t) => { document.querySelector("#paste-title").value = t; }, title);
  await p.evaluate((t) => {
    const el = document.querySelector("#paste-text");
    el.value = t;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, body);
  /* Wait for the COUNT to grow, not for ".saved-item" to exist — with a
     text already saved the selector matches instantly and the read below
     races the write. */
  const wasCount = await p.$$eval(".saved-item", (els) => els.length).catch(() => 0);
  await p.click("#paste-save");
  await p.waitForFunction((n) => document.querySelectorAll(".saved-item").length > n,
    wasCount, { timeout: 30000 });
  const found = await p.evaluate((t) => {
    const all = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]");
    const hit = all.find((x) => x.title === t);
    return { id: hit ? hit.id : null, titles: all.map((x) => x.title) };
  }, title);
  if (!found.id) throw new Error(`saved text "${title}" not found; stored titles: ${JSON.stringify(found.titles)}`);
  const id = found.id;
  if (pin) {
    await p.click(`#text-${id} [data-action="pin"]`);
    /* Wait for the flag to actually flip, not for a fixed 300ms. The
       list re-renders after the click, and under load the sleep was
       finishing first — which silently ran the whole suite against an
       UNPINNED text and reported the feature broken. A fixed sleep is
       not a synchronisation primitive. */
    await p.waitForFunction((tid) => {
      try {
        const it = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]").find((x) => x.id === tid);
        return !!(it && it.forLesson);
      } catch { return false; }
    }, id, { timeout: 15000 });
  }
  return id;
}

/* Type the whole target so the run actually completes and is recorded.
   The surface renders spaces as U+00A0; the keyboard sends U+0020. */
async function typeThrough(id) {
  const before = (await readProfile()).sessions;
  await p.goto(`${B}/practice/?mode=custom&custom=${id}&seg=0`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#tt-text .tt-char", { timeout: 30000 });
  const target = await p.evaluate(() =>
    [...document.querySelectorAll("#tt-text .tt-char")]
      .filter((el) => !el.classList.contains("tt-char--extra"))
      .map((el) => (el.classList.contains("tt-char--space") ? " " : el.textContent))
      .join(""));
  await p.click("#tt-stage").catch(() => {});
  await p.focus("#tt-input").catch(() => {});
  await p.keyboard.type(target, { delay: 6 });
  await p.waitForFunction((n) => {
    try {
      const list = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
      const act = JSON.parse(localStorage.getItem("tt:active-profile") || '""');
      const prof = list.find((x) => x.id === act) || list[0];
      return ((prof && prof.sessions) || []).length > n;
    } catch { return false; }
  }, before, { timeout: 30000 });
  return target;
}

console.log("\n## A. A pinned text is recorded as a lesson");
await reset();
const pinnedId = await importText(TITLE, BODY, { pin: true });
await typeThrough(pinnedId);
const after = await readProfile();
const key = "custom:" + pinnedId;

const entries = after.lessonResults.filter((r) => r.lessonId === key);
chk(entries.length === 1, "a lessonResults entry was appended under the namespaced id",
  `${entries.length} entries; ids seen: ${[...new Set(after.lessonResults.map((r) => r.lessonId))].join(",") || "none"}`);
chk(Array.isArray(after.sessionsByLesson[key]) && after.sessionsByLesson[key].length === 1,
  "…and sessionsByLesson indexed it", JSON.stringify(Object.keys(after.sessionsByLesson)));
chk(entries[0] && entries[0].wpm > 0 && entries[0].acc > 0,
  "…carrying real wpm and accuracy, not placeholders",
  entries[0] ? `wpm=${entries[0].wpm} acc=${entries[0].acc}` : "no entry");

console.log("\n## B. It shows as mastery on the lessons page and by name on stats");
const best = await p.evaluate((k) => {
  try { return JSON.parse(localStorage.getItem(`tt:lesson-best-${k}`) || "null"); } catch { return null; }
}, key);
chk(!!best && best.wpm > 0, "a best run was stored under the namespaced key", JSON.stringify(best));

await p.goto(B + "/lessons/", { waitUntil: "domcontentloaded" });
await p.waitForSelector("#user-lessons-grid .lesson-card", { timeout: 30000 });
const card = await p.evaluate(() => {
  const a = document.querySelector("#user-lessons-grid .lesson-card");
  return { mastered: a.dataset.mastered || null, text: a.textContent.replace(/\s+/g, " ").trim() };
});
chk(card.mastered === "true", "the card is marked mastered", JSON.stringify(card));
chk(/best \d+ wpm/.test(card.text), "…and shows the best run", JSON.stringify(card.text));

await p.goto(B + "/stats/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(800);
const trends = await p.evaluate(() => {
  const svg = document.getElementById("lesson-trends-svg");
  return [...svg.querySelectorAll(".chart__panel-title")].map((t) => t.textContent);
});
chk(trends.some((t) => t.startsWith("The Reclassified")),
  "the stats panel is titled with the text, not with its internal id",
  JSON.stringify(trends));
chk(!trends.some((t) => /custom:/.test(t)), "…and no panel leaks the raw id", JSON.stringify(trends));

console.log("\n## C. An UNPINNED text is not recorded — the anti-vacuity half");
/* Without this, a build recording every custom session would pass every
   check above while filling the lesson history with every book read. */
const beforeUnpinned = (await readProfile()).lessonResults.length;
const looseId = await importText("Just Reading", BODY, { pin: false });
await typeThrough(looseId);
const afterUnpinned = await readProfile();
chk(afterUnpinned.lessonResults.length === beforeUnpinned,
  "no lessonResults entry was added for an unpinned text",
  `${beforeUnpinned} → ${afterUnpinned.lessonResults.length}`);
chk(!afterUnpinned.sessionsByLesson["custom:" + looseId],
  "…and it was not indexed either");
chk((await readProfile()).sessions > 0, "…while the session itself was still recorded normally");

console.log("\n## D. The curriculum is not polluted");
/* achievements.js counts tt:lesson-best-<n> for numeric n over 1..500,
   and megamenu.js scans the same range. A custom text landing on one of
   those keys would count toward "finish every lesson". */
const numericKeys = await p.evaluate(() => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/^tt:lesson-best-\d+$/.test(k)) out.push(k);
  }
  return out;
});
chk(numericKeys.length === 0, "no numeric lesson-best key was written by a custom text",
  numericKeys.join(",") || "(none)");
const customKeys = await p.evaluate(() => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/^tt:lesson-best-custom:/.test(k)) out.push(k);
  }
  return out;
});
chk(customKeys.length === 1, "exactly one namespaced key exists — the pinned text",
  customKeys.join(","));

console.log("\n## E. Curriculum-only behaviour is untouched");
/* state.lessonId still drives the "next lesson" link (lessonId + 1),
   the back-link and the lesson analytics events. A custom text must not
   reach any of them — "?lesson=custom:c_ab1" would be nonsense. */
await p.goto(`${B}/practice/?mode=custom&custom=${pinnedId}&seg=0`, { waitUntil: "domcontentloaded" });
await p.waitForSelector("#tt-text .tt-char", { timeout: 30000 });
const backLink = await p.evaluate(() => {
  const a = document.getElementById("tt-back-link");
  return { href: a ? a.getAttribute("href") : null, hidden: a ? a.hidden : true };
});
chk(backLink.href === "/custom/", "the back link still points at the custom page, not /lessons/",
  JSON.stringify(backLink));
const html = await p.content();
chk(!/lesson=custom/.test(html), "no \"?lesson=custom:...\" link was generated anywhere on the page");

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
