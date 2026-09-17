/* Idioms data — src/data/idioms.json -> the paginated /idioms/<id>/
   pages. Default export only; see the note in quotes.js for why a
   named export next to it would produce zero pages without an error. */

import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("src/data/idioms.json");

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
  .map((it) => ({ ...it, permalink: `/idioms/${it.id}/` }));
