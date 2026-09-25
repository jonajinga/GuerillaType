/* The community-stats snapshot: is it whole, and is it fresh?

   src/_data/communityStats.json feeds /analytics/ and
   /community-stats/. It is written by scripts/fetch-umami-stats.mjs
   (weekly from .github/workflows/refresh-stats.yml, and at build time
   when UMAMI_API_KEY is set) and committed. Two ways to fail:

     - the shape: a refresh that came back half-empty must not be
       committed, so every section the two pages read has to be there
       and the site totals have to be real numbers;
     - the age: with --max-age-days N the snapshot must have been
       taken within N days. The workflow passes 2 right after a fetch.
       Without the flag, age is reported but only warns past 45 days,
       because a stale committed file is a fact about the world, not a
       broken tree.

   Also checks the built pages, when _site exists: both must carry the
   snapshot's date, and must carry the "snapshot is N days old" note
   exactly when the snapshot is older than the stale threshold in
   src/_data/communityStatsMeta.js.

   Usage:
     node scripts/check-community-stats.mjs                 # shape + built pages
     node scripts/check-community-stats.mjs --max-age-days 2
     node scripts/check-community-stats.mjs --file some.json # a fixture, shape only
*/
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import communityStatsMeta from "../src/_data/communityStatsMeta.js";
const STALE_AFTER_DAYS = communityStatsMeta().staleAfterDays; // one source of truth, the data file the pages read

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const FILE = resolve(flag("--file") || "src/_data/communityStats.json");
const MAX_AGE = flag("--max-age-days") != null ? Number(flag("--max-age-days")) : null;

let pass = 0, fail = 0;
const chk = (ok, name, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
const finish = () => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

// ------------------------------------------------------------- the file
let data;
try {
  data = JSON.parse(readFileSync(FILE, "utf8"));
  chk(true, "the snapshot parses as JSON", FILE);
} catch (e) {
  chk(false, "the snapshot parses as JSON", e.message);
  finish();
}

const REQUIRED = [
  "updatedAt", "updatedAtDate", "windowDays", "site", "wpm", "acc",
  "wpmByMode", "accByMode", "modes", "speedMilestones", "books",
  "bookEvents", "practiceVolume", "langs", "worstChars", "worstWords",
  "worstFingers", "fingerAccBuckets", "fingerAccByFinger",
  "sessionDistCount", "wpmSummary", "accSummary", "fastTypists",
  "topBooks", "dimensions", "pageviewSeries",
];
const missing = REQUIRED.filter((k) => !(k in data));
chk(missing.length === 0, "every section the two pages read is present", missing.length ? "missing " + missing.join(", ") : `${REQUIRED.length} keys`);

const site = data.site || {};
const nums = ["pageviews", "visitors", "visits"];
chk(nums.every((k) => Number.isFinite(site[k]) && site[k] >= 0), "site totals are numbers", JSON.stringify(nums.map((k) => site[k])));
chk(Number.isFinite(site.pageviews) && site.pageviews > 0, "the site has at least one pageview in the window (an empty answer is not a snapshot)", String(site.pageviews));

const taken = Date.parse(data.updatedAt);
chk(Number.isFinite(taken), "updatedAt is a real timestamp", String(data.updatedAt));
chk(typeof data.updatedAtDate === "string" && data.updatedAtDate === String(data.updatedAt).slice(0, 10), "updatedAtDate is the date of updatedAt", `${data.updatedAtDate} vs ${String(data.updatedAt).slice(0, 10)}`);
chk(data.windowDays === 365, "the window is the trailing 365 days the pages describe", String(data.windowDays));

/* Present is not enough: a snapshot with site totals and every
   section empty is what an event-data outage produces, and it would
   look fresh. The three sections a live site cannot lack over a year. */
const floors = [
  ["wpm", Object.keys(data.wpm || {}).length],
  ["modes", Object.keys(data.modes || {}).length],
  ["dimensions.pages", ((data.dimensions || {}).pages || []).length],
];
chk(floors.every(([, n]) => n > 0), "the sections the pages lead with are not empty (a hollow snapshot is an outage, not data)", floors.map(([k, n]) => `${k}=${n}`).join(" "));

const dims = data.dimensions || {};
const DIM_KEYS = ["pages", "countries", "devices", "browsers", "os", "referrers", "topEvents"];
chk(DIM_KEYS.every((k) => Array.isArray(dims[k])), "every dashboard dimension is an array", DIM_KEYS.map((k) => `${k}=${Array.isArray(dims[k]) ? dims[k].length : "?"}`).join(" "));
const series = data.pageviewSeries;
const seriesOk = series === null || (series && typeof series === "object" && Array.isArray(series.pageviews) && Array.isArray(series.sessions));
chk(seriesOk, "the pageview series has pageviews and sessions arrays (or is null when that fetch failed)", series && typeof series === "object" ? `pageviews[${(series.pageviews || []).length}] sessions[${(series.sessions || []).length}]` : String(series));

// -------------------------------------------------------------- the age
const ageDays = Number.isFinite(taken) ? (Date.now() - taken) / 86400000 : Infinity;
if (MAX_AGE != null) {
  chk(ageDays <= MAX_AGE, `the snapshot was taken within the last ${MAX_AGE} day(s)`, `${ageDays.toFixed(1)} days old`);
} else {
  console.log(`  ${ageDays > STALE_AFTER_DAYS ? "WARN" : "ok  "}  snapshot age ${ageDays.toFixed(0)} days (stale past ${STALE_AFTER_DAYS}; pass --max-age-days to make age a failure)`);
}

// ------------------------------------------------------- the built pages
if (!flag("--file") && existsSync(resolve("_site/analytics/index.html")) && existsSync(resolve("_site/community-stats/index.html"))) {
  const pages = {
    "/analytics/": readFileSync(resolve("_site/analytics/index.html"), "utf8"),
    "/community-stats/": readFileSync(resolve("_site/community-stats/index.html"), "utf8"),
  };
  const stale = ageDays > STALE_AFTER_DAYS;
  for (const [path, html] of Object.entries(pages)) {
    chk(html.includes(data.updatedAtDate), `${path} names the snapshot's date`, data.updatedAtDate);
    const hasNote = /snapshot is \d+ days old/i.test(html);
    chk(hasNote === stale, `${path} ${stale ? "warns that the snapshot is stale" : "carries no staleness warning"} (age ${ageDays.toFixed(0)} days, threshold ${STALE_AFTER_DAYS})`, hasNote ? html.match(/snapshot is \d+ days old[^<]{0,80}/i)[0] : "no note");
  }
  const cadence = pages["/community-stats/"];
  chk(/refreshed every week/i.test(cadence) && !/at each site deploy/i.test(cadence), "/community-stats/ describes the weekly refresh, not a deploy-time bake");
} else if (!flag("--file")) {
  console.log("  note  _site has no analytics pages; build first to check the rendered notes");
}

finish();
