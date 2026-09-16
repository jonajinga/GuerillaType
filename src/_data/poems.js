/* Poetry data — src/data/poetry.json -> the paginated /poetry/<id>/
   pages. Default export only; see quotes.js.

   The variable is `poems` (not `poetry`) because it is a list of
   poems; the JSON file keeps its own name because /data/poetry.json is
   already fetched by corpus-boot.js and practice-boot.js and renaming
   it would break both.

   `lines` is the poem split on newlines with BLANK LINES KEPT. A poem
   is not prose: the line breaks are the form, and the blank lines are
   stanza breaks. The detail template renders one <p class="poem-line">
   per entry and an empty entry becomes the stanza gap. Dropping the
   blanks here (which the practice page's poemToLines does, for a
   different reason -- it must not ask anyone to type an empty line)
   would silently glue stanzas together on the page. */

import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("src/data/poetry.json");

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
  .map((it) => ({
    ...it,
    permalink: `/poetry/${it.id}/`,
    lines: String(it.text).replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/, "")),
  }));
