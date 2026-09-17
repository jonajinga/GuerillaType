/* Parables data — src/data/parables.json -> the paginated
   /parables/<id>/ pages. Default export only; see quotes.js.

   Only 71 of the 269 parables carry a `moral`. The template treats it
   as optional and the practice page appends it as a second paragraph
   only when it exists, so nothing here invents one. */

import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("src/data/parables.json");

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
  .filter((it) => it && it.id && it.text)
  .map((it) => ({ ...it, permalink: `/parables/${it.id}/` }));
