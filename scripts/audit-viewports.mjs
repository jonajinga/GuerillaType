#!/usr/bin/env node
/* Playwright sweep of every page at canonical breakpoints. Run after
   `npm run build && npx serve _site`. Saves screenshots to ./audit/. */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:8080";
const VIEWPORTS = [
  { w: 360, h: 740, name: "360" },
  { w: 480, h: 800, name: "480" },
  { w: 768, h: 1024, name: "768" },
  { w: 1024, h: 768, name: "1024" },
  { w: 1280, h: 800, name: "1280" },
];
const URLS = [
  "/", "/practice/", "/lessons/", "/challenges/", "/drills/", "/custom/",
  "/stats/", "/settings/", "/about/", "/faq/", "/changelog/", "/privacy/", "/terms/",
];

const OUT = "audit";
fs.mkdirSync(OUT, { recursive: true });

// THIS SCRIPT COULD NOT FAIL, and it is the project's main gate.
//
// Four separate reasons, all fixed below:
//   1. Every navigation was wrapped in try/catch that called console.warn and
//      carried on. Nothing counted the warnings.
//   2. There were zero `process.exit` calls, so the script always exited 0 —
//      even if all 65 pages failed.
//   3. `page.goto` resolves for a 404 as happily as for a 200, so a missing
//      page produced a screenshot of an error page and a cheerful log line.
//   4. Nothing listened for console errors or uncaught page exceptions, so a
//      page whose JavaScript died still screenshotted and still "passed".
//
// A gate that cannot fail is worse than no gate: it is a green light nobody
// wired up, and every task that ran it believed it had been checked.
const failures = [];

const browser = await chromium.launch();
const ctx = await browser.newContext();

for (const vp of VIEWPORTS) {
  const page = await ctx.newPage();

  // A page can load, screenshot cleanly, and be completely broken. Capture it.
  const pageErrors = [];
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push("pageerror: " + e.message));

  await page.setViewportSize({ width: vp.w, height: vp.h });
  for (const url of URLS) {
    const where = `${url} @ ${vp.name}`;
    pageErrors.length = 0;
    try {
      const res = await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 15000 });

      // `goto` resolving is not the same as the page being there.
      const status = res ? res.status() : 0;
      if (!res || status >= 400) {
        failures.push(`${where}: HTTP ${status || "no response"}`);
        console.warn(`  FAIL ${where}: HTTP ${status || "no response"}`);
        continue;
      }

      await page.waitForTimeout(250);
      const slug = url.replace(/^\/|\/$/g, "").replace(/\//g, "_") || "home";
      await page.screenshot({ path: path.join(OUT, `${slug}-${vp.name}.png`), fullPage: true });

      if (pageErrors.length) {
        failures.push(`${where}: ${pageErrors.length} console/page error(s) — ${pageErrors[0]}`);
        console.warn(`  FAIL ${where}: ${pageErrors[0]}`);
        continue;
      }

      console.log(`  ok   ${slug} @ ${vp.name}`);
    } catch (err) {
      failures.push(`${where}: ${err.message}`);
      console.warn(`  FAIL ${where}: ${err.message}`);
    }
  }
  await page.close();
}
await browser.close();

if (failures.length) {
  console.error(`\naudit FAILED — ${failures.length} of ${VIEWPORTS.length * URLS.length} checks:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`\naudit passed — ${VIEWPORTS.length * URLS.length} checks, screenshots in ./audit/`);
