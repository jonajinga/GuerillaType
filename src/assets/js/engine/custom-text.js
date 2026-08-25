/* Custom text ingestion. Sanitizes user-supplied content and chunks it
   into ~500-char segments at sentence boundaries. */

import { read, write, KEY_CUSTOM } from "../storage.js";

/* Size limits, in CHARACTERS -- not file bytes.

   What gets stored is the extracted, sanitized text, so a 6 MB PDF full
   of fonts and images might be 400 KB of actual prose. Measuring the file
   would reject things that fit comfortably.

   Why not simply raise this to "a whole book": localStorage is a shared
   ~5 MB budget per origin, and it holds the user's ACTUAL practice
   history too -- profiles, sessions, the adaptive model, daily and hourly
   buckets. Custom text competing with that is how someone loses a year of
   stats to a novel they typed once.

   Worse, most browsers store localStorage as UTF-16, so a character costs
   roughly two bytes. The numbers below are chosen against that: 512k
   chars is about 1 MB of real quota, and 1M chars total is about 2 MB --
   leaving room for everything else.

   For reference, the plain text of a full novel averages ~610 KB across
   the 271 books bundled with this site, and War and Peace is 3.2 MB. So
   this ceiling still cuts a long book short. Supporting whole books
   properly means moving custom text to IndexedDB, which is measured in
   hundreds of megabytes rather than five. That is the real fix; this is
   an honest interim raise. */
const MAX_TEXT_BYTES = 512 * 1024;    // one saved text
const MAX_TOTAL_BYTES = 1024 * 1024;  // everything saved, combined

// Kept for older imports.
const MAX_BYTES = MAX_TEXT_BYTES;

export function sanitize(raw) {
  let s = String(raw || "");
  // Strip script/style blocks entirely
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Strip remaining HTML tags
  s = s.replace(/<\/?[a-z][^>]*>/gi, "");
  // Decode common entities
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Normalize line endings + collapse blank-line runs
  s = s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  // Strip control chars except \t \n
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Trim only. Truncation used to happen here and silently -- a 900 KB
  // PDF became 200 KB with nothing to tell the user their book had been
  // cut off two thirds of the way through. saveText decides now, and
  // reports it.
  return s.trim();
}

/* Clip to a sentence boundary near the limit, so a truncated text ends
   mid-thought rather than mid-word. Falls back to a hard cut only if no
   sentence end is anywhere close. */
export function clipToSentence(text, limit) {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const m = head.match(/[\s\S]*[.!?][”"')\]]?\s/);
  return (m && m[0].length > limit * 0.8) ? m[0].trim() : head.trim();
}

export function chunk(text, maxLen = 500) {
  const out = [];
  const re = /[.!?][”"')\]]?\s+/g;
  let last = 0, m;
  let buf = "";
  const sentences = [];
  while ((m = re.exec(text))) {
    sentences.push(text.slice(last, m.index + m[0].length).trim());
    last = m.index + m[0].length;
  }
  if (last < text.length) sentences.push(text.slice(last).trim());

  for (const s of sentences) {
    if ((buf + " " + s).trim().length > maxLen && buf) {
      out.push(buf.trim());
      buf = s;
    } else {
      buf = (buf ? buf + " " : "") + s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

export function listSaved() {
  return read(KEY_CUSTOM, []);
}

export function saveText({ title, raw, meta }) {
  const content = sanitize(raw);
  if (!content) throw new Error("Empty after sanitization");

  // Truncate here rather than in sanitize, so the result can say so.
  const truncatedFrom = content.length > MAX_TEXT_BYTES ? content.length : 0;
  const body = truncatedFrom ? clipToSentence(content, MAX_TEXT_BYTES) : content;

  const segments = chunk(body);
  const item = {
    id: "c_" + Math.random().toString(36).slice(2, 8),
    title: (title || "Untitled").slice(0, 80),
    createdAt: new Date().toISOString(),
    bytes: body.length,
    segments,
    // Where the reader got to. Without this, coming back to a 481-segment
    // import drops you at segment 1 every time.
    lastSeg: 0,
    // Optional source metadata (author, year, source/work, kind) so
    // the practice page can render an attribution header when typing
    // imported corpus items.
    meta: meta || null,
  };

  const previous = listSaved();
  const list = [item, ...previous];

  // Evicting the oldest saved texts to make room used to happen in
  // silence. Report it -- deleting something the user saved is not a
  // detail they should discover later.
  const evicted = [];
  let total = list.reduce((s, x) => s + x.bytes, 0);
  while (total > MAX_TOTAL_BYTES && list.length > 1) {
    const drop = list.pop();
    total -= drop.bytes;
    evicted.push(drop.title);
  }

  // write() returns false when the browser refuses the quota, and the
  // old code ignored it -- the toast said "Saved" whether or not
  // anything had been. Put the previous list back and say what happened.
  if (!write(KEY_CUSTOM, list)) {
    write(KEY_CUSTOM, previous);
    throw new Error("Your browser is out of storage for this site. Delete a saved text and try again.");
  }

  return { ...item, truncatedFrom, evicted };
}

/* Remember where the reader got to, so returning to a long import
   resumes instead of restarting. Best-effort: losing a bookmark must
   never cost someone the text itself. */
export function setSegProgress(id, seg) {
  const list = listSaved();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list[i].lastSeg = Math.max(0, seg | 0);
  write(KEY_CUSTOM, list);
}

export function getSegProgress(id) {
  const item = getSaved(id);
  return item ? (item.lastSeg | 0) : 0;
}

export const LIMITS = { perText: MAX_TEXT_BYTES, total: MAX_TOTAL_BYTES };

export function deleteSaved(id) {
  const list = listSaved().filter((x) => x.id !== id);
  write(KEY_CUSTOM, list);
}

export function getSaved(id) {
  return listSaved().find((x) => x.id === id) || null;
}

/* Pin a saved custom text as a personal lesson — appears on the
   /lessons/ page in a "Your custom lessons" section. */
export function togglePinAsLesson(id) {
  const list = listSaved();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  list[i].forLesson = !list[i].forLesson;
  write(KEY_CUSTOM, list);
  return list[i];
}

export function listLessonPinned() {
  return listSaved().filter((x) => x.forLesson);
}
