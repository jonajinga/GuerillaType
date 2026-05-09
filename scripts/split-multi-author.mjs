/* Split multi-author quotes into individual single-author entries +
   fix sentence-start casing across the corpus. The earlier corpus
   pass only capitalized the first letter of each whole quote -- it
   missed sentence-internal capitalization where the source quote
   spliced two attributed lines together with mid-sentence lowercase. */

import fs from "node:fs";

const path = "src/data/quotes.json";
const cur = JSON.parse(fs.readFileSync(path, "utf8"));

// Manually unpack each multi-author entry. The originals were
// composite quotes (multiple distinct lines from multiple people
// smushed into one record); each one becomes its own entry now.
const SPLITS = {
  "q-aristotle-friend": null, // Single quote, ignore -- the / was in tag form
};

// Build a list of replacements keyed by id.
const REPLACE = {
  // Socrates / Aristotle composite -> three separate quotes
  // (id varies; identify by exact text fingerprint)
};

const out = [];
let changed = 0;

for (const q of cur) {
  const author = (q.author || "").trim();
  const text = (q.text || "").trim();

  // Single-author? Keep as-is, just fix sentence casing inside.
  if (!/\s\/\s/.test(author)) {
    const fixed = fixSentenceCasing(text);
    if (fixed !== text) { out.push({ ...q, text: fixed }); changed++; continue; }
    out.push(q);
    continue;
  }

  // Multi-author. Match against known mashups; split accordingly.
  if (text.startsWith("The unexamined life is not worth living")) {
    out.push({ id: q.id + "-1", text: "The unexamined life is not worth living.", author: "Socrates", tags: q.tags });
    out.push({ id: q.id + "-2", text: "The secret of happiness is not found in seeking more, but in developing the capacity to enjoy less.", author: "Socrates", tags: q.tags });
    out.push({ id: q.id + "-3", text: "Happiness is the meaning and the purpose of life, the whole aim and end of human existence.", author: "Aristotle", tags: q.tags });
    changed += 3;
    continue;
  }
  if (text.startsWith("Do not go where the path may lead")) {
    out.push({ id: q.id + "-1", text: "Do not go where the path may lead, go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson", tags: q.tags });
    out.push({ id: q.id + "-2", text: "Always remember that you are absolutely unique. Just like everyone else.", author: "Margaret Mead", tags: q.tags });
    changed += 2;
    continue;
  }
  if (text.startsWith("The greatest glory in living")) {
    out.push({ id: q.id + "-1", text: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela", tags: q.tags });
    out.push({ id: q.id + "-2", text: "Our greatest weakness lies in giving up. The most certain way to succeed is always to try just one more time.", author: "Thomas Edison", tags: q.tags });
    out.push({ id: q.id + "-3", text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", tags: q.tags });
    changed += 3;
    continue;
  }
  if (text.startsWith("If I have seen further") || /^If i have seen further/.test(text)) {
    out.push({ id: q.id + "-1", text: "If I have seen further than others, it is by standing upon the shoulders of giants.", author: "Isaac Newton", tags: q.tags });
    out.push({ id: q.id + "-2", text: "Logic will get you from A to B. Imagination will take you everywhere.", author: "Albert Einstein", tags: q.tags });
    out.push({ id: q.id + "-3", text: "The important thing is not to stop questioning.", author: "Albert Einstein", tags: q.tags });
    changed += 3;
    continue;
  }

  // Unknown multi-author entry. Keep the first author only (cleanest
  // fallback) so no quote slips through with a slash list.
  const firstAuthor = author.split(/\s\/\s/)[0].trim();
  out.push({ ...q, author: firstAuthor, text: fixSentenceCasing(text) });
  changed++;
}

// Drop "(paraphrase)" / "(after Nietzsche)" / "(attributed)" suffixes
// and similar parenthetical author qualifiers. Keep the cleanest name.
for (const q of out) {
  if (!q.author) continue;
  const stripped = q.author.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (stripped !== q.author) { q.author = stripped; }
}

function fixSentenceCasing(s) {
  if (!s) return s;
  // Capitalize start of every sentence (after . ! ? + space).
  // Also capitalize the very first letter.
  let out = s;
  out = out.replace(/^([a-z])/, (m) => m.toUpperCase());
  out = out.replace(/([.!?]\s+)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
  return out;
}

fs.writeFileSync(path, JSON.stringify(out, null, 2));
console.log(`Total quotes: ${out.length}. Changed: ${changed}.`);
