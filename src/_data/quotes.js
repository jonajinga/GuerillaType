/* Quotes data — reads src/data/quotes.json at build time and feeds the
   paginated /quotes/<id>/ detail pages.

   Mirrors books.js deliberately: a DEFAULT EXPORT ONLY. A named export
   alongside it turns the template variable into the module namespace
   object, and `pagination: { data: quotes }` then paginates over
   nothing -- silently, with no error and no pages. That failure mode
   has already cost this fleet a debugging session on another repo.

   The same JSON is also served verbatim to the browser at
   /data/quotes.json (eleventy.config.js copies src/data wholesale), so
   the practice page's ?qid= lookup and these pages always agree. */

import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("src/data/quotes.json");

function load() {
  if (!fs.existsSync(FILE)) return [];
  try {
    const items = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export default load()
  .filter((q) => q && q.id && q.text)
  .map((q) => ({ ...q, permalink: `/quotes/${q.id}/` }));
