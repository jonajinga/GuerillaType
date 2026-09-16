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

/* Indentation is part of a poem and the build was eating it.
   45 of the 122 poems indent at least one line; `.poem-line` is
   styled `white-space: pre-wrap` so the browser would have kept
   those spaces -- but the HTML minifier (html-minifier, via
   @sardine/eleventy-plugin-tinyhtml) runs first and collapses
   runs of whitespace in every text node, and trims the ones that
   sit against a tag. The page then disagreed with its own "Type
   this" surface about the shape of the poem.

   html-minifier handles U+00A0 specially -- see collapseWhitespace()
   in html-minifier/src/htmlminifier.js, where every whitespace regex
   keeps non-breaking spaces and only collapses the ordinary ones
   around them. So a space the minifier must not touch is written as
   a non-breaking space, and only in the positions it would otherwise
   destroy:

     - the leading run (trimmed away entirely against the <p>),
     - any inner run of two or more (collapsed to a single space).

   A lone inner space is left alone; nothing collapses it, and an
   nbsp there would stop the line wrapping where it should.

   Display only. `poem.text` is untouched, so what gets typed, saved
   and shared is still the JSON text, space for space. Minification
   stays on for the rest of the site. scripts/check-item-pages.mjs
   section L compares every rendered line against poetry.json with
   nbsp mapped back to a space, and fails if any page disagrees. */
const NBSP = " ";
const keepSpaces = (line) =>
  line
    .replace(/^ +/, (run) => NBSP.repeat(run.length))
    .replace(/(?<=\S) {2,}/g, (run) => NBSP.repeat(run.length));

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
    lines: String(it.text).replace(/\r\n?/g, "\n").split("\n")
      .map((l) => keepSpaces(l.replace(/[ \t]+$/, ""))),
  }));
