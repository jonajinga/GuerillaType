/* Books data — reads every src/data/books/*.json at build time and
   exposes both the catalog index (for /library/) and the per-book
   detail (for paginated /library/{slug}/ pages). */

import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve("src/data/books");

function loadAll() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (a.author || "").localeCompare(b.author || "")
                 || (a.title  || "").localeCompare(b.title  || ""));
}

const books = loadAll();
export default books.map((b) => ({ ...b, permalink: `/library/${b.slug}/` }));
