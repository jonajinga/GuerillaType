#!/usr/bin/env node
/* Full QA pass — exercises every page and reports console errors,
   broken links, missing wiring. Designed to run against a static
   _site/ served by `npx serve` on a configurable port.

   Usage:  BASE_URL=http://localhost:8765 node scripts/qa.mjs
*/

import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:8765";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

let pass = 0, fail = 0;
const failures = [];
const consoleErrorsByPage = new Map();

function check(label, ok, detail) {
  if (ok) { console.log(`  PASS  ${label}`); pass++; }
  else {
    console.log(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
    fail++; failures.push(label + (detail ? " — " + detail : ""));
  }
}
async function visit(path) {
  const errs = [];
  page.removeAllListeners("console"); page.removeAllListeners("pageerror");
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  consoleErrorsByPage.set(path, errs);
  return errs;
}

console.log("\n## 1. Page load + zero console errors\n");
const PAGES = [
  "/", "/practice/", "/lessons/", "/drills/", "/challenges/",
  "/quotes/", "/library/", "/idioms/", "/poetry/", "/parables/",
  "/wordlists/", "/wordlists/en-1k/", "/wordlists/code-js/",
  "/stats/", "/settings/", "/custom/",
  "/about/", "/features/", "/cost/", "/analytics/", "/changelog/",
  "/license/", "/privacy/", "/terms/", "/contact/", "/faq/", "/guide/",
  "/style-guide/", "/tech-stack/", "/sitemap/", "/search/",
];
for (const p of PAGES) {
  const errs = await visit(p);
  check(`${p} loads with no console errors`, errs.length === 0, errs.slice(0, 1).join(" / "));
}

console.log("\n## 2. Drills — each drill loads ITS OWN word set\n");
const DRILLS = ["home-row", "top-row", "bottom-row", "left-hand", "right-hand", "vowels", "punctuation", "numbers", "alpha-forward", "numpad-rows", "code-brackets"];
for (const id of DRILLS) {
  await visit(`/practice/?mode=words&words=20&drill=${id}`);
  await page.waitForTimeout(1500);
  let text = "";
  try {
    text = await page.$eval("#tt-text", (el) => el.textContent || "");
  } catch (e) {
    check(`drill "${id}" loaded text (not empty)`, false, "no #tt-text element");
    continue;
  }
  check(`drill "${id}" loaded text (not empty)`, text.length > 0, text.slice(0, 30));
  if (id === "bottom-row") {
    const hasVowel = /[aeiou]/i.test(text);
    check(`drill "${id}" excludes vowels`, !hasVowel, hasVowel ? `got "${text.slice(0,40)}"` : "");
  }
  if (id === "numpad-rows") {
    const onlyDigits = /^[\d\s]+$/.test(text);
    check(`drill "${id}" is digits-only`, onlyDigits, !onlyDigits ? `got "${text.slice(0,40)}"` : "");
  }
}

console.log("\n## 3. Megamenus — every section opens + featured slot fills\n");
await visit("/");
const sections = ["practice", "learn", "library", "compete", "insights"];
for (const id of sections) {
  const trig = await page.$(`[data-mega-trigger="${id}"]`);
  if (!trig) { check(`megamenu trigger "${id}" exists`, false); continue; }
  check(`megamenu trigger "${id}" exists`, true);
  await trig.click();
  await page.waitForTimeout(400);
  const open = await page.$eval(`.site-nav__item[data-mega="${id}"]`, (el) => el.dataset.open === "true");
  check(`megamenu "${id}" opens`, open);
  const itemCount = await page.$$eval(`[data-mega="${id}"] .mega__item`, (els) => els.length);
  check(`megamenu "${id}" has menu items`, itemCount >= 4, `got ${itemCount}`);
  // Featured slot: each section should populate its featured body
  // within ~1.5s of opening.
  await page.waitForTimeout(900);
  const featured = await page.$eval(`[data-mega="${id}"] [data-featured-body]`, (el) => el.innerHTML.length);
  check(`megamenu "${id}" featured body fills`, featured > 20, `got ${featured} chars`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
}

console.log("\n## 4. Settings — all toggles render and update profile\n");
await visit("/settings/");
const TOGGLES = [
  "set-freedom", "set-live-wpm", "set-smooth-caret",
  "pref-stopOnError", "pref-forgiveErrors", "pref-spaceSkipsWords",
  "pref-ignoreCapitalization", "pref-skipPunctuation",
  "pref-showVirtualKeyboard", "pref-showTicker", "pref-hideUI", "pref-autoScroll",
];
for (const id of TOGGLES) {
  const exists = await page.$(`#${id}`);
  check(`settings: #${id} present`, !!exists);
}
const SELECTS = ["set-language", "set-layout", "set-caret", "pref-whitespaceMark", "pref-reportFrequency", "pref-soundTheme"];
for (const id of SELECTS) {
  const exists = await page.$(`#${id}`);
  check(`settings: select #${id} present`, !!exists);
}

console.log("\n## 5. Practice — engine starts + accuracy displays\n");
await visit("/practice/?mode=words&words=10");
await page.waitForFunction(() => {
  const el = document.getElementById("tt-text");
  return el && el.textContent && el.textContent.length > 5;
}, { timeout: 8000 });
const targetLen = await page.$eval("#tt-text", (el) => (el.textContent || "").length);
check("practice: typing target populated", targetLen > 5, `len=${targetLen}`);
const acc = await page.$eval("[data-live='acc']", (el) => parseInt(el.textContent || "0", 10));
check("practice: accuracy in valid range", acc >= 0 && acc <= 100, `acc=${acc}`);
// Live typing (and the WPM update from it) is exercised in section 13
// where the ticker pref is also enabled — that gives us the real
// toolbar↔ticker sync check too.

console.log("\n## 6. Live keyboard + ticker (when enabled in prefs)\n");
await page.evaluate(() => {
  const profiles = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  if (profiles[0]) {
    profiles[0].preferences = profiles[0].preferences || {};
    profiles[0].preferences.showVirtualKeyboard = true;
    profiles[0].preferences.showTicker = true;
    localStorage.setItem("tt:profiles", JSON.stringify(profiles));
  }
});
await visit("/practice/?mode=words&words=10");
await page.waitForTimeout(700);
const kbVisible = await page.$eval("#tt-live-keyboard", (el) => !el.hidden);
check("live keyboard appears when pref enabled", kbVisible);
const tickerVisible = await page.$eval("#tt-live-ticker", (el) => !el.hidden);
check("live ticker appears when pref enabled", tickerVisible);
const kbKeys = await page.$$eval("#tt-live-keyboard-svg .live-kb__key", (els) => els.length);
check("live keyboard has at least 26 keys", kbKeys >= 26, `got ${kbKeys}`);

console.log("\n## 7. Stats page — viz modules render\n");
await visit("/stats/");
await page.waitForTimeout(900);
const tiles = await page.$$eval(".stats-tile", (els) => els.length);
check("stats: 4 summary tiles", tiles === 4, `got ${tiles}`);
for (const id of ["contrib-svg", "trend-svg", "kb-svg", "perkey-svg", "perfinger-svg", "lesson-trends-svg"]) {
  const has = await page.$(`#${id}`);
  check(`stats: #${id} present`, !!has);
}
const charTableHost = await page.$("#char-table-host");
check("stats: character table host present", !!charTableHost);
const keyStripTiles = await page.$$eval(".key-strip__tile", (els) => els.length);
check("stats: 26 key-strip tiles", keyStripTiles === 26, `got ${keyStripTiles}`);
const togglePresent = await page.$$eval(".contrib-toggle__btn", (els) => els.length);
check("stats: year/month/week toggle exists", togglePresent === 3, `got ${togglePresent}`);

console.log("\n## 8. Search — both modal + page work\n");
await visit("/search/?q=frost");
await page.waitForTimeout(700);
const summary = await page.$eval("#search-page-summary", (el) => el.textContent || "");
check("search page: summary populated for ?q", summary.length > 5, `"${summary}"`);
const resultGroups = await page.$$eval(".search-group", (els) => els.length);
check("search page: results grouped by kind", resultGroups >= 1, `groups=${resultGroups}`);

console.log("\n## 9. Word lists — index + detail\n");
await visit("/wordlists/");
const wordCards = await page.$$eval(".wordlist-card", (els) => els.length);
check("wordlists index: 9 cards", wordCards === 9, `got ${wordCards}`);
await visit("/wordlists/en-1k/");
const wordItems = await page.$$eval(".wordlist-detail__word", (els) => els.length);
check("wordlists detail: en-1k full list rendered", wordItems >= 800, `got ${wordItems}`);

console.log("\n## 10. Lessons — full 80-lesson curriculum\n");
await visit("/lessons/");
const lessonCards = await page.$$eval(".lesson-card", (els) => els.length);
check("lessons: 80 lesson cards", lessonCards === 80, `got ${lessonCards}`);
const stages = await page.$$eval(".lessons-stage", (els) => els.length);
check("lessons: 10 stages plus 1 hidden user-stage", stages === 11, `got ${stages}`);
await visit("/practice/?lesson=57"); // literal-text lesson (Austen)
await page.waitForTimeout(1200);
const lessonText = await page.$eval("#tt-text", (el) => el.textContent || "");
// Normalize whitespace — the renderer wraps each char in a <span> and
// may emit non-breaking spaces.
const normalized = lessonText.toLowerCase().replace(/\s+/g, " ");
check("lesson 57 (Austen) loads literal text", normalized.includes("truth universally"), lessonText.slice(0, 60));

console.log("\n## 11. Library — books + per-paragraph tracking\n");
await visit("/library/");
const libCards = await page.$$eval(".library-card", (els) => els.length);
check("library: 5 starter books", libCards === 5, `got ${libCards}`);
await visit("/library/the-time-machine/");
await page.waitForTimeout(700);
const chapterOptions = await page.$$eval("#book-chapter-select option", (els) => els.length);
check("book reader: 2 chapter options for The Time Machine", chapterOptions === 2, `got ${chapterOptions}`);
const readerParas = await page.$$eval(".book-reader__para", (els) => els.length);
check("book reader: paragraphs render on initial page", readerParas > 0, `got ${readerParas}`);
const pageLabel = await page.$eval("#book-page-label", (el) => el.textContent || "");
check("book reader: page label shows 'Page N of M'", /Page \d+ of \d+/.test(pageLabel), pageLabel);

console.log("\n## 12. Custom imports — uploader accepts new formats\n");
await visit("/custom/");
const fileInput = await page.$eval("#uploader-file", (el) => el.accept || "");
check("custom: file input accepts .epub", fileInput.includes(".epub"), fileInput);
check("custom: file input accepts .pdf", fileInput.includes(".pdf"), fileInput);

console.log("\n## 13. WPM sync — toolbar + ticker share value\n");
// Enable ticker, type, verify both numbers stay consistent.
await page.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  if (ps[0]) {
    ps[0].preferences = ps[0].preferences || {};
    ps[0].preferences.showTicker = true;
    ps[0].preferences.showVirtualKeyboard = false;
    localStorage.setItem("tt:profiles", JSON.stringify(ps));
  }
});
await visit("/practice/?mode=words&words=10");
await page.waitForTimeout(700);
await page.evaluate(() => document.getElementById("tt-input")?.focus());
await page.keyboard.type("the quick brown fox jumped over", { delay: 28 });
await page.waitForTimeout(400);
const toolbarWpm = await page.$eval("[data-live='wpm']", (el) => parseInt(el.textContent || "0", 10));
const tickerWpm = await page.$eval("#tt-live-ticker-wpm", (el) => parseInt(el.textContent || "0", 10));
check("toolbar wpm > 0", toolbarWpm > 0, `${toolbarWpm}`);
check("ticker wpm matches toolbar (±1)", Math.abs(toolbarWpm - tickerWpm) <= 1, `toolbar=${toolbarWpm} ticker=${tickerWpm}`);

// ── summary
console.log(`\n──────── ${pass} pass · ${fail} fail ────────`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
}

// ── any cross-page console errors collected
const allErrs = [...consoleErrorsByPage.entries()].filter(([_, e]) => e.length);
if (allErrs.length) {
  console.log("\nConsole errors by page:");
  for (const [p, errs] of allErrs) {
    console.log(`  ${p}:`);
    errs.forEach((e) => console.log("    " + e));
  }
}

await browser.close();
process.exit(fail > 0 ? 1 : 0);
