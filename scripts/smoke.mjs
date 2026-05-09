#!/usr/bin/env node
/* End-to-end smoke test. Verifies: typing engine works, backspace recovery
   doesn't freeze, megamenu opens/closes, sticky TOC populates, all
   informative pages render. */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:8080";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${detail ? " — " + detail : ""}`); fail++; }
}

// 1. Home loads with hero + daily quote + typing surface
await page.goto(BASE + "/");
await page.waitForTimeout(1200);
const heroTitle = await page.$(".hero__title");
check("home: editorial hero present", !!heroTitle);
const dailyQuote = await page.$eval("#daily-quote", (el) => el.textContent);
check("home: daily quote loaded", dailyQuote && !dailyQuote.includes("Loading"), `got "${dailyQuote.slice(0, 40)}..."`);
const stage = await page.$("#tt-stage");
check("home: typing surface present", !!stage);

// 2. Megamenu opens on click and shows mega items
const trigger = await page.$('[data-mega-trigger="practice"]');
check("megamenu: trigger exists", !!trigger);
if (trigger) {
  await trigger.click();
  await page.waitForTimeout(220);
  const open = await page.$eval('.site-nav__item[data-mega="practice"]', (el) => el.dataset.open === "true");
  check("megamenu: opens on click", open);
  const items = await page.$$eval('[data-mega="practice"] .mega__item', (els) => els.length);
  check("megamenu: shows menu items", items >= 6, `got ${items}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(180);
}

// 3. Practice — type + backspace + retype must continue working
await page.goto(BASE + "/practice/?mode=words&words=10");
await page.waitForTimeout(900);
// Renderer uses &nbsp; for spaces; normalize back to plain space for typing.
const target = await page.$eval("#tt-text", (el) => el.textContent.replace(/ /g, " ").slice(0, 12));
const input = await page.$("#tt-input");
await input.focus();
await page.keyboard.type(target.slice(0, 6), { delay: 30 });
await page.waitForTimeout(150);
await page.keyboard.press("Backspace");
await page.keyboard.press("Backspace");
await page.waitForTimeout(120);
await page.keyboard.type(target.slice(4, 10), { delay: 30 });
await page.waitForTimeout(400);
const wpm = await page.$eval('[data-live="wpm"]', (el) => el.textContent);
const correctClass = await page.$$eval(".tt-char--correct", (els) => els.length);
const stageState = await page.$eval("#tt-stage", (el) => el.dataset.state);
check("practice: backspace recovery — wpm accumulates", parseInt(wpm, 10) > 0, `wpm=${wpm}`);
check("practice: backspace recovery — chars marked", correctClass >= 6, `correct=${correctClass}`);
check("practice: stage state 'running' after backspace", stageState === "running", `state=${stageState}`);

// 4. Sticky TOC populates on a long page
await page.goto(BASE + "/tech-stack/");
await page.waitForTimeout(700);
const tocLinks = await page.$$eval(".article-toc__list a", (els) => els.length);
check("tech-stack: sticky TOC populated", tocLinks >= 5, `got ${tocLinks}`);

await page.goto(BASE + "/cost/");
await page.waitForTimeout(500);
const costTocLinks = await page.$$eval(".article-toc__list a", (els) => els.length);
const statRows = await page.$$eval(".stat-row__cell", (els) => els.length);
check("cost: TOC populated", costTocLinks >= 4, `got ${costTocLinks}`);
check("cost: stat row cells render", statRows >= 5, `got ${statRows}`);

// 5. Features + analytics pages render
await page.goto(BASE + "/features/");
await page.waitForTimeout(400);
const featuresHeads = await page.$$eval(".article-body h2", (els) => els.length);
check("features: sections present", featuresHeads >= 8, `got ${featuresHeads}`);

await page.goto(BASE + "/analytics/");
await page.waitForTimeout(400);
const analyticsHeads = await page.$$eval(".article-body h2", (els) => els.length);
check("analytics: sections present", analyticsHeads >= 4, `got ${analyticsHeads}`);

// 6. Lessons page links to lesson runner
await page.goto(BASE + "/lessons/");
await page.waitForTimeout(400);
const lessonLinks = await page.$$eval('a[href*="/practice/?lesson="]', (els) => els.length);
check("lessons: cards link to lesson runner", lessonLinks >= 24, `got ${lessonLinks}`);

// 7. Run lesson 3 — should restrict to home-row keys only
await page.goto(BASE + "/practice/?lesson=3");
await page.waitForTimeout(1000);
const lessonText = await page.$eval("#tt-text", (el) => el.textContent);
// Renderer uses &nbsp; for spaces — textContent yields  .
const allowed = new Set("fjdkslar;  ".split(""));
const bad = Array.from(lessonText.toLowerCase()).filter((c) => !allowed.has(c));
check("lesson 3: text uses only home-row keys", bad.length === 0, bad.length ? `disallowed: ${[...new Set(bad)].slice(0, 10).join(",")}` : "");

// 8. Type past line 3 — verify renderer keeps moving the caret
await page.goto(BASE + "/practice/?mode=time&duration=60");
await page.waitForTimeout(900);
const longTarget = await page.$eval("#tt-text", (el) => el.textContent.replace(/ /g, " "));
const inp2 = await page.$("#tt-input");
await inp2.focus();
// Compare longTarget against what the engine actually has stored.
const engineTarget = await page.evaluate(() => {
  // The engine instance isn't globally exposed. Read targetArr via DOM.
  return Array.from(document.querySelectorAll("#tt-text .tt-char")).map((el) => el.textContent.replace(/ /g, " ")).join("");
});
console.log(`  engineTarget[0..40]: "${engineTarget.slice(0, 40)}"`);
console.log(`  longTarget[0..40]:   "${longTarget.slice(0, 40)}"`);
console.log(`  match: ${engineTarget.slice(0, 40) === longTarget.slice(0, 40)}`);
const phase1 = engineTarget.slice(0, 30);
console.log(`  phase1 target: "${phase1}"`);
await page.keyboard.type(phase1, { delay: 25 });
await page.waitForTimeout(400);
const p1correct = await page.$$eval(".tt-char--correct", (els) => els.length);
const p1incorrect = await page.$$eval(".tt-char--incorrect", (els) => els.length);
console.log(`  phase1 result: correct=${p1correct}, incorrect=${p1incorrect}`);
const phase2 = engineTarget.slice(30, 180);
await page.keyboard.type(phase2, { delay: 40 });
await page.waitForTimeout(800);
const correctClass2 = await page.$$eval(".tt-char--correct", (els) => els.length);
const incorrectClass2 = await page.$$eval(".tt-char--incorrect", (els) => els.length);
const stageState2 = await page.$eval("#tt-stage", (el) => el.dataset.state);
const scrollDebug = await page.evaluate(() => {
  const inner = document.querySelector(".tt-text__inner");
  return { transform: inner ? inner.style.transform : null };
});
console.log(`  scroll state:`, scrollDebug);
check("practice: typing past 3 lines keeps marking chars", correctClass2 >= 140, `correct=${correctClass2}, incorrect=${incorrectClass2} (typed 180)`);
check("practice: stage still 'running' after long input", stageState2 === "running", `state=${stageState2}`);

// 9. Megamenu panels — equal height / equal width.
// Open from the /about/ page where there's no typing engine grabbing focus.
await page.goto(BASE + "/about/");
await page.waitForTimeout(800);
const sizes = [];
// Programmatically force-open each panel by toggling data-open directly,
// which is how the user's hover-or-click flow ends up — but we skip the
// event chain entirely so test timing doesn't introduce noise.
for (const slug of ["practice", "learn", "compete", "insights"]) {
  const info = await page.$eval(`[data-mega="${slug}"]`, (el) => {
    el.dataset.open = "true";
    const mega = el.querySelector(".mega");
    // Force a layout read so getBoundingClientRect resolves the new display.
    void mega.offsetHeight;
    return { box: mega.getBoundingClientRect().toJSON() };
  });
  sizes.push({ slug, w: Math.round(info.box?.width || 0), h: Math.round(info.box?.height || 0) });
  await page.$eval(`[data-mega="${slug}"]`, (el) => { el.dataset.open = "false"; });
  await page.waitForTimeout(60);
}
const widthsEqual = sizes.every((s) => s.w === sizes[0].w);
const heightsEqual = sizes.every((s) => s.h === sizes[0].h);
check("megamenu: all panels same width", widthsEqual, JSON.stringify(sizes.map((s) => s.w)));
check("megamenu: all panels same height", heightsEqual, JSON.stringify(sizes.map((s) => s.h)));

// 10. User guide loads with TOC populated
await page.goto(BASE + "/guide/");
await page.waitForTimeout(700);
const guideToc = await page.$$eval(".article-toc__list a", (els) => els.length);
check("guide: TOC populated", guideToc >= 8, `got ${guideToc}`);

// 11. Human sitemap loads
await page.goto(BASE + "/sitemap/");
await page.waitForTimeout(400);
const siteHeads = await page.$$eval(".article-body h2", (els) => els.length);
check("sitemap: section heads present", siteHeads >= 5, `got ${siteHeads}`);

// 12. Mode-bar fieldset legends visible
await page.goto(BASE + "/practice/?mode=words");
await page.waitForTimeout(700);
const legends = await page.$$eval(".mode-bar__legend", (els) => els.map((e) => e.textContent.trim()));
check("mode-bar: legends present", legends.length >= 2 && legends[0].toLowerCase().includes("mode"), JSON.stringify(legends));

// 13. Words-mode shows the word-count group, hides duration group
const durationHidden = await page.$eval('.mode-bar__field[data-group="duration"]', (el) => el.hasAttribute("hidden"));
const wordsVisible = await page.$eval('.mode-bar__field[data-group="words"]', (el) => !el.hasAttribute("hidden"));
check("mode-bar: hides irrelevant groups (words mode)", durationHidden && wordsVisible);

// 14. Shortcuts overlay opens with '?' (must use a non-typing page —
// the engine claims the input on practice and now lets ? pass through
// as a typed char per WCAG / a11y).
await page.goto(BASE + "/about/");
await page.waitForTimeout(400);
await page.keyboard.press("Shift+/");
await page.waitForTimeout(300);
const overlayOpen = await page.evaluate(() => {
  const el = document.getElementById("shortcuts-overlay");
  return el && el.open;
});
check("shortcuts: overlay opens with ?", overlayOpen);
if (overlayOpen) await page.keyboard.press("Escape");

// 15. TOC click scrolls near the heading (within 130px)
await page.goto(BASE + "/guide/");
await page.waitForTimeout(700);
// Find a TOC link past the first ~5 sections so there's room to scroll.
const tocClickInfo = await page.evaluate(async () => {
  const links = Array.from(document.querySelectorAll(".article-toc__list a"));
  const target = links[6] || links[3] || links[0];
  if (!target) return null;
  target.click();
  await new Promise((r) => setTimeout(r, 700));
  const headId = target.dataset.target;
  const head = document.getElementById(headId);
  if (!head) return null;
  return { y: Math.round(head.getBoundingClientRect().top), id: headId };
});
check("toc: clicked link scrolls heading near top of viewport", tocClickInfo && Math.abs(tocClickInfo.y - 100) < 60, `top=${tocClickInfo ? tocClickInfo.y : "n/a"} (target ~100±60)`);

// 16. No console errors anywhere
check("no console errors", consoleErrors.length === 0, consoleErrors.length ? "\n     " + consoleErrors.slice(0, 6).join("\n     ") : "");

await browser.close();
console.log(`\nResult: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
