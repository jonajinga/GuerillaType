/* How old is the community-stats snapshot, as of this build?
   communityStats.json is a committed file refreshed weekly by
   .github/workflows/refresh-stats.yml (and at build time when
   UMAMI_API_KEY is set). When the refresh stops, the pages must say so
   instead of quietly showing months-old numbers, which is what happened
   between 2026-05-11 and late September 2026.
   STALE_AFTER_DAYS is mirrored in scripts/check-community-stats.mjs. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STALE_AFTER_DAYS = 45;

export default function () {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), "communityStats.json");
  let updatedAt = null;
  try { updatedAt = JSON.parse(readFileSync(file, "utf8")).updatedAt || null; } catch {}
  const taken = updatedAt ? Date.parse(updatedAt) : NaN;
  const ageDays = Number.isFinite(taken) ? Math.max(0, Math.floor((Date.now() - taken) / 86400000)) : null;
  return {
    updatedAt,
    ageDays,
    staleAfterDays: STALE_AFTER_DAYS,
    stale: ageDays == null || ageDays > STALE_AFTER_DAYS,
  };
}
