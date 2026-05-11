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
  ["wpmByMode",      "wpm_bucket",             "mode"],
  ["accByMode",      "acc_bucket",             "mode"],
  ["modes",          "mode_completed",         "mode"],
  ["speedMilestones","speed_milestone",        "tier"],
  ["books",          "book_completion",        "book"],
  ["bookEvents",     "book_completion",        "event"],
  ["practiceVolume", "practice_volume_bucket", "bucket"],
  ["langs",          "lang_used",              "lang"],
  // Most-missed surface — community-wide weakest spots.
  ["worstChars",     "worst_char",             "char"],
  ["worstWords",     "worst_word",             "word"],
  ["worstFingers",   "worst_finger",           "finger"],
  ["fingerAccBuckets","finger_acc",            "bucket"],
  ["fingerAccByFinger","finger_acc",           "finger"],
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

// ── Cross-tabs from session_dist (wpm × acc × mode × volume) ─────
// Pull every raw row of the session_dist event so we can compute
// avg accuracy per wpm-bucket, fast-typist %, etc.
try {
  const sdRaw = await get(`/websites/${SITE}/event-data/events?startAt=${START}&endAt=${END}&event=session_dist`);
  // The endpoint returns one row per (event, property, value, total).
  // Rebuild a per-session view by joining property values for the
  // same event (Umami doesn't expose session IDs through this
  // endpoint, so we approximate with grouped counts).
  // Easier: pull the underlying events list (with hasData=1) and
  // build sessions from their bundled property maps.
  const rows = await get(`/websites/${SITE}/events?startAt=${START}&endAt=${END}&pageSize=1000&event=session_dist`);
  const sessions = [];
  for (const r of (rows.data || rows || [])) {
    if (r.eventName !== "session_dist") continue;
    // Each event has its properties on a separate endpoint -- skip
    // the per-event property fetch (too slow) and rely on
    // event-data cross-aggregations below.
    sessions.push(r);
  }
  snapshot.sessionDistCount = sessions.length;
} catch (e) {
  console.warn("  session_dist raw fetch failed:", e.message);
  snapshot.sessionDistCount = 0;
}

// ── Derived numerics (computed from bucket maps) ─────────────────
// These don't need any extra Umami calls -- they're math on the
// bucket totals we already pulled.

function bucketMidpoint(label) {
  if (label === "150+") return 160;
  if (label === "<80") return 75;
  // "40-50" -> 45, "92-94" -> 93, "99-100" -> 99.5
  const m = label.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
}

function summarize(bucketMap) {
  let total = 0, sum = 0;
  for (const [label, n] of Object.entries(bucketMap)) {
    const mid = bucketMidpoint(label);
    if (mid == null) continue;
    total += n;
    sum += mid * n;
  }
  const mean = total > 0 ? sum / total : 0;
  // Median: walk buckets in numeric order, find where cumulative
  // count crosses total/2.
  const ordered = Object.entries(bucketMap)
    .map(([label, n]) => [label, n, bucketMidpoint(label)])
    .filter(([_, __, mid]) => mid != null)
    .sort((a, b) => a[2] - b[2]);
  let cum = 0, medianLabel = null, medianMid = null;
  const half = total / 2;
  for (const [label, n, mid] of ordered) {
    cum += n;
    if (cum >= half) { medianLabel = label; medianMid = mid; break; }
  }
  return { total, mean: +mean.toFixed(1), medianLabel, median: medianMid };
}

snapshot.wpmSummary = summarize(snapshot.wpm);
snapshot.accSummary = summarize(snapshot.acc);

// Fast-typist percentages from the wpm bucket counts.
function pctAtOrAbove(bucketMap, threshold) {
  let total = 0, hit = 0;
  for (const [label, n] of Object.entries(bucketMap)) {
    const mid = bucketMidpoint(label);
    if (mid == null) continue;
    total += n;
    if (mid >= threshold) hit += n;
  }
  return total > 0 ? +((hit / total) * 100).toFixed(1) : 0;
}
snapshot.fastTypists = {
  "60+": pctAtOrAbove(snapshot.wpm, 60),
  "80+": pctAtOrAbove(snapshot.wpm, 80),
  "100+": pctAtOrAbove(snapshot.wpm, 100),
  "120+": pctAtOrAbove(snapshot.wpm, 120),
};

// Top books typed (sorted desc, top 10) plus completion-rate proxy.
{
  const sorted = Object.entries(snapshot.books)
    .sort((a, b) => b[1] - a[1]).slice(0, 10);
  snapshot.topBooks = Object.fromEntries(sorted);
}

console.log(`[umami-stats] derived: wpmMean=${snapshot.wpmSummary.mean}, accMean=${snapshot.accSummary.mean}, fast60+=${snapshot.fastTypists["60+"]}%`);

// ── Site dimensions for the /analytics/ dashboard ────────────────
// Pull top metrics across each Umami dimension. These power the
// D3 charts on the operator-facing dashboard.
async function metric(type, limit = 12) {
  try {
    const rows = await get(`/websites/${SITE}/metrics?startAt=${START}&endAt=${END}&type=${type}&limit=${limit}`);
    return (rows || []).map((r) => ({ label: r.x || "(unknown)", count: r.y || 0 }));
  } catch (e) {
    console.warn(`  metric ${type} failed:`, e.message);
    return [];
  }
}

// Pageview time series -- daily buckets across the window. Umami
// omits days with zero events, so we backfill those rows with y=0
// to give D3 a continuous daily series that renders as a visible
// line across the whole window.
async function pageviewSeries() {
  try {
    // The /pageviews endpoint returns two parallel series:
    // pageviews (visits) and sessions (visitors). Each is
    // [{ x: timestamp, y: count }]. Unit=day gives a clean daily
    // series we can line-chart with D3.
    const rows = await get(`/websites/${SITE}/pageviews?startAt=${START}&endAt=${END}&unit=day&timezone=UTC`);
    if (!rows || (!rows.pageviews && !rows.sessions)) return rows;

    function backfill(series) {
      if (!Array.isArray(series) || series.length === 0) return series || [];
      const byDay = new Map();
      for (const p of series) {
        const d = new Date(p.x);
        // Snap to UTC day boundary so we don't double-up partial days.
        const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        byDay.set(key, (+p.y) || 0);
      }
      const first = Math.min(...byDay.keys());
      // End at the LATER of (first data point + 1 day) and START / END
      // window. We anchor the start of the rendered series at the
      // earliest day with real data; ending at END renders the chart
      // up through today so the user sees the most recent activity.
      const start = first;
      const end = END;
      const out = [];
      const oneDay = 86400 * 1000;
      for (let t = start; t <= end; t += oneDay) {
        const iso = new Date(t).toISOString();
        out.push({ x: iso, y: byDay.get(t) || 0 });
      }
      return out;
    }

    rows.pageviews = backfill(rows.pageviews);
    rows.sessions = backfill(rows.sessions);
    return rows;
  } catch (e) {
    console.warn("  pageviews series failed:", e.message);
    return null;
  }
}

snapshot.dimensions = {
  pages: await metric("url", 12),
  countries: await metric("country", 12),
  devices: await metric("device", 6),
  browsers: await metric("browser", 8),
  os: await metric("os", 8),
  referrers: await metric("referrer", 10),
  topEvents: await metric("event", 15),
};
snapshot.pageviewSeries = await pageviewSeries();
console.log(`[umami-stats] dashboard dims: ${Object.entries(snapshot.dimensions).map(([k, v]) => `${k}=${v.length}`).join(" ")}`);

try {
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`[umami-stats] wrote ${OUT_FILE}`);
} catch (e) {
  console.error("[umami-stats] write failed:", e.message);
  process.exit(1);
}
