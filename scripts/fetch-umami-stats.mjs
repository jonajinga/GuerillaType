/* Fetch aggregate event data from Umami Cloud and write a snapshot
   to src/_data/communityStats.json. The /community-stats/ page
   reads this JSON at build time and renders real bar charts -- no
   iframes, no client-side API key.

   Usage:
     UMAMI_API_KEY=api_xxx node scripts/fetch-umami-stats.mjs

   The API key MUST be passed via env var. The script silently
   no-ops if the key is missing so eleventy.before can call it
   defensively without breaking builds on systems without
   credentials. The previous JSON (if any) is preserved when no
   key is available, so production builds on Cloudflare Pages
   only refresh data when the env var is configured. */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, "..", "src", "_data", "communityStats.json");
const SITE = "7627d387-9e08-4f42-92cd-a36f19785920";
const BASE = "https://api.umami.is/v1";
const KEY = process.env.UMAMI_API_KEY;

if (!KEY) {
  console.warn("[umami-stats] UMAMI_API_KEY not set -- skipping. The /community-stats/ page will use whatever JSON is already committed.");
  process.exit(0);
}

const HEADERS = { "x-umami-api-key": KEY, accept: "application/json" };

// 365-day window. Umami Cloud retains events for the trailing year
// on the free tier; longer windows return empty.
const END = Date.now();
const START = END - 365 * 86400 * 1000;

async function get(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

/* The event-data/events endpoint returns one row per
   (eventName, propertyName, propertyValue) tuple with a `total`
   count. Filter by event and property to get a clean
   bucket -> count map. */
async function bucketsFor(eventName, propertyName) {
  const rows = await get(`/websites/${SITE}/event-data/events?startAt=${START}&endAt=${END}&event=${encodeURIComponent(eventName)}`);
  const out = {};
  for (const row of rows || []) {
    if (row.propertyName !== propertyName) continue;
    out[row.propertyValue] = (out[row.propertyValue] || 0) + (row.total || 0);
  }
  return out;
}

async function siteStats() {
  return get(`/websites/${SITE}/stats?startAt=${START}&endAt=${END}`);
}

console.log("[umami-stats] fetching...");

const _now = new Date();
const snapshot = {
  updatedAt: _now.toISOString(),
  updatedAtDate: _now.toISOString().slice(0, 10),
  windowDays: 365,
};

try {
  snapshot.site = await siteStats();
} catch (e) {
  console.warn("[umami-stats] site stats failed:", e.message);
  snapshot.site = null;
}

const jobs = [
  ["wpm",            "wpm_bucket",             "bucket"],
  ["acc",            "acc_bucket",             "bucket"],
  ["modes",          "mode_completed",         "mode"],
  ["speedMilestones","speed_milestone",        "tier"],
  ["books",          "book_completion",        "book"],
  ["bookEvents",     "book_completion",        "event"],
  ["practiceVolume", "practice_volume_bucket", "bucket"],
  ["langs",          "lang_used",              "lang"],
];

for (const [key, eventName, propertyName] of jobs) {
  try {
    snapshot[key] = await bucketsFor(eventName, propertyName);
    console.log(`  ${key}: ${Object.keys(snapshot[key]).length} buckets`);
  } catch (e) {
    console.warn(`  ${key} failed:`, e.message);
    snapshot[key] = {};
  }
}

try {
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`[umami-stats] wrote ${OUT_FILE}`);
} catch (e) {
  console.error("[umami-stats] write failed:", e.message);
  process.exit(1);
}
