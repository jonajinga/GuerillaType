#!/usr/bin/env node
/* Strip poems from src/data/poetry.json that are not in the
   public domain in every major jurisdiction (US 95-year rule
   AND life+70 worldwide), plus any explicitly-flagged removals.
   Re-runnable; idempotent on an already-cleaned corpus. */

import fs from "node:fs";

const FILE = "src/data/poetry.json";

/* Authors whose works are not yet fully public domain worldwide.
   They died after 1955 -- life+70 rule means they are still under
   copyright in EU/UK/AU/CA. US 95-year rule is a separate gate
   that some early works pass and most later works do not. We
   remove ALL works by these authors to be conservative. */
const NON_PD_AUTHORS = new Set([
  "Robert Frost",          // d. 1963
  "T. S. Eliot",           // d. 1965
  "T.S. Eliot",
  "E. E. Cummings",        // d. 1962
  "E.E. Cummings",
  "William Carlos Williams", // d. 1963
  "Carl Sandburg",         // d. 1967
  "Ezra Pound",            // d. 1972
  "Langston Hughes",       // d. 1967
  "Dylan Thomas",          // d. 1953, but US 95-yr keeps 1947+ works copyrighted
]);

/* Explicit removals by id -- user request for any reason
   (content, accuracy, attribution, copyright concerns, etc.). */
const EXPLICIT_REMOVE_IDS = new Set([
  "po-hopkins-gods-grandeur",  // user-requested removal
]);

const poems = JSON.parse(fs.readFileSync(FILE, "utf8"));
const kept = [];
const removed = [];
for (const x of poems) {
  if (NON_PD_AUTHORS.has(x.author)) {
    removed.push({ id: x.id, title: x.title, author: x.author, reason: "author still under copyright (life+70)" });
    continue;
  }
  if (EXPLICIT_REMOVE_IDS.has(x.id)) {
    removed.push({ id: x.id, title: x.title, author: x.author, reason: "user-requested removal" });
    continue;
  }
  kept.push(x);
}
fs.writeFileSync(FILE, JSON.stringify(kept, null, 2));
console.log(`poems before: ${poems.length}, removed: ${removed.length}, kept: ${kept.length}`);
console.log("\nRemoved:");
const byReason = removed.reduce((acc, r) => { (acc[r.reason] = acc[r.reason] || []).push(r); return acc; }, {});
for (const reason of Object.keys(byReason)) {
  console.log("  -- " + reason + " (" + byReason[reason].length + ") --");
  for (const r of byReason[reason]) console.log("     [" + r.id + "] " + r.title + " / " + r.author);
}
