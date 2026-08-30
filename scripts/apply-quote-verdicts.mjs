#!/usr/bin/env node
/* Apply the attribution audit to the quotation corpus.

   Four agents judged all 747 entries against one standard: a quotation
   is CONFIRMED only if it can be traced to a specific work, speech,
   letter or documented occasion. "Widely attributed to X" does not
   count -- that is precisely the sediment this removes.

   Two outcomes for a failed entry:
     - discard, where no source exists for anyone
     - reattribute, where the quotation is real but filed under the
       wrong name and the true author IS documented. Those are kept,
       corrected, rather than thrown away.

   The verdicts live in scripts/quotes-verification.json so the
   editorial decision is reviewable and re-runnable, not buried here.

   Run: node scripts/apply-quote-verdicts.mjs [--write] */

import { readFileSync, writeFileSync } from "node:fs";

const WRITE = process.argv.includes("--write");
const quotes = JSON.parse(readFileSync("src/data/quotes.json", "utf8"));
const v = JSON.parse(readFileSync("scripts/quotes-verification.json", "utf8"));

const discard = new Set(v.discard);
const reattribute = v.reattribute;

const byId = new Map(quotes.map((q) => [q.id, q]));
const missingDiscard = v.discard.filter((id) => !byId.has(id));
const missingReattr = Object.keys(reattribute).filter((id) => !byId.has(id));

let moved = 0;
for (const [id, author] of Object.entries(reattribute)) {
  const q = byId.get(id);
  if (!q) continue;
  q.author = author;
  moved++;
}

const kept = quotes.filter((q) => !discard.has(q.id));

console.log(`quotes:            ${quotes.length} -> ${kept.length}`);
console.log(`discarded:         ${quotes.length - kept.length}`);
console.log(`reattributed:      ${moved}`);
if (missingDiscard.length) console.log(`WARNING discard ids not found: ${missingDiscard.length}  ${missingDiscard.slice(0, 5).join(", ")}`);
if (missingReattr.length) console.log(`WARNING reattribute ids not found: ${missingReattr.length}  ${missingReattr.slice(0, 5).join(", ")}`);

// Nothing may survive that is still listed for discard.
const leak = kept.filter((q) => discard.has(q.id));
console.log(`discard leakage:   ${leak.length}${leak.length ? "  <-- BUG" : ""}`);

if (WRITE) {
  writeFileSync("src/data/quotes.json", JSON.stringify(kept, null, 2) + "\n");
  console.log(`\nWROTE src/data/quotes.json`);
} else {
  console.log(`\n(dry run -- pass --write to apply)`);
}
