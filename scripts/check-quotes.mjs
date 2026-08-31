#!/usr/bin/env node
/* Invariants for the quotation corpus.

   The failure mode specific to quotations is misattribution. A corpus
   that files one line under two different names is wrong in at least
   one place, and it cannot tell you which. Three such conflicts shipped
   here, all of them well-known misattributions rather than genuine
   scholarly disputes.

   No browser needed. Run: node scripts/check-quotes.mjs */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

const a = JSON.parse(readFileSync(resolve("src/data/quotes.json"), "utf8"));
chk(Array.isArray(a) && a.length > 0, "corpus loads", `${a.length} quotes`);

const ids = a.map((q) => q.id);
chk(new Set(ids).size === ids.length, "every id is unique", `${ids.length - new Set(ids).size} collision(s)`);

const key = (q) => String(q.text || "").replace(/\s+/g, " ").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
const keys = a.map(key);
const dup = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
chk(dup.length === 0, "no quote appears twice", dup.length ? `${dup.length} duplicated` : "");

/* The one that matters: the same words filed under different names. */
const byText = new Map();
for (const q of a) {
  const k = key(q);
  if (!byText.has(k)) byText.set(k, new Set());
  byText.get(k).add(String(q.author || "").trim());
}
const conflicts = [...byText.entries()].filter(([, s]) => s.size > 1);
chk(conflicts.length === 0, "no quote is attributed to two different people",
  conflicts.length ? conflicts.slice(0, 3).map(([, s]) => [...s].join(" vs ")).join("; ") : "");

const untypeable = a.filter((q) => /[^\x20-\x7E]/.test(String(q.text || "")));
chk(untypeable.length === 0, "every quote is typeable on a plain keyboard",
  untypeable.length ? untypeable.slice(0, 3).map((q) => q.id).join(", ") : "");

const missing = a.filter((q) => !q.id || !String(q.text || "").trim()
  || !String(q.author || "").trim() || !Array.isArray(q.tags) || !q.tags.length);
chk(missing.length === 0, "every quote has text, an author and tags",
  missing.length ? missing.slice(0, 3).map((q) => q.id).join(", ") : "");

/* An attribution nobody can check is not an attribution. */
const vague = a.filter((q) => /^(anonymous|unknown|n\/?a|various)$/i.test(String(q.author || "").trim()));
chk(vague.length === 0, "no quote is filed as anonymous",
  vague.length ? vague.slice(0, 3).map((q) => q.id).join(", ") : "");

/* Brief quotation is ordinary practice, but a long extract from a
   modern work is a different proposition. This is a tripwire on length,
   not a copyright judgement -- it flags entries worth a human look. */
const longest = a.filter((q) => String(q.text || "").length > 260);
chk(longest.length === 0, "no quote has grown into a long extract",
  longest.length ? longest.map((q) => `${q.id} (${q.text.length} chars)`).join(", ") : "longest is under 260 chars");

/* Nothing that failed the attribution audit may come back. This is the
   check that matters most: the corpus was assembled from quote
   aggregators and inherited their canon of misattributions, so the
   pressure is always toward re-importing the same sediment. */
const verdicts = JSON.parse(readFileSync(resolve("scripts/quotes-verification.json"), "utf8"));
const returned = a.filter((q) => verdicts.discard.includes(q.id));
chk(returned.length === 0, "no discarded quotation has returned",
  returned.length ? returned.slice(0, 3).map((q) => q.id).join(", ") : `${verdicts.discard.length} on the list`);

/* And the corrected attributions must stay corrected.

   Both halves matter. Checking only the authors let a corrected entry
   pass by being DELETED -- `q &&` skipped the missing id and the message
   still announced the full count it had never checked. So assert the
   entries are present first, then that each carries its true author. */
const wanted = Object.entries(verdicts.reattribute);
const absent = wanted.filter(([id]) => !a.some((q) => q.id === id));
chk(absent.length === 0, "every reattributed quotation is still in the corpus",
  absent.length ? absent.slice(0, 3).map(([id]) => id).join(", ") : `all ${wanted.length} present`);

const reverted = wanted
  .map(([id, author]) => [a.find((q) => q.id === id), author])
  .filter(([q, author]) => q && q.author !== author);
chk(reverted.length === 0, "reattributed quotations kept their true author",
  reverted.length ? reverted.slice(0, 3).map(([q, w]) => `${q.id} should be ${w}`).join("; ")
                  : `${wanted.length - absent.length} verified`);

chk(a.length >= 441, "corpus has not shrunk unexpectedly", `${a.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
