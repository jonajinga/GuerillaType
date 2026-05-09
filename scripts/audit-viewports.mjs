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

const browser = await chromium.launch();
const ctx = await browser.newContext();

for (const vp of VIEWPORTS) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: vp.w, height: vp.h });
  for (const url of URLS) {
    try {
      await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(250);
      const slug = url.replace(/^\/|\/$/g, "").replace(/\//g, "_") || "home";
      await page.screenshot({ path: path.join(OUT, `${slug}-${vp.name}.png`), fullPage: true });
      console.log(`  ${slug} @ ${vp.name}`);
    } catch (err) {
      console.warn(`  fail ${url} @ ${vp.name}: ${err.message}`);
    }
  }
  await page.close();
}
await browser.close();
console.log("done — screenshots in ./audit/");
