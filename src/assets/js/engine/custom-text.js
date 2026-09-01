/* Custom text ingestion. Sanitizes user-supplied content and chunks it
   into ~500-char segments at sentence boundaries.

   Where the text lives (changed 2026-08-26):

     - the SEGMENT BODIES go to IndexedDB (see custom-store.js), which
       is measured in hundreds of megabytes;
     - a small INDEX RECORD per text stays in localStorage: id, title,
       created date, character count, segment count, bookmark, and the
       optional source metadata.

   Before this split, whole books sat in localStorage -- a shared ~5 MB
   origin budget that also holds profiles, sessions, the adaptive model
   and every stats bucket, stored as UTF-16 so each character costs
   about two bytes. The per-text ceiling that fell out of that was 512k
   characters, so a 600-page PDF was cut off roughly a third of the way
   in. The index record is a couple of hundred bytes, so localStorage is
   now back to holding only what it is good at.

   For scale: the plain text of a full novel averages ~610 KB across the
   271 books bundled with this site, and War and Peace -- the longest --
   is 3.2 MB. The ceiling below is about four times that, and exists
   only so a pathological paste cannot lock the browser up in chunk().

   If IndexedDB is unavailable (a locked-down private window, an ancient
   browser), saving falls back to the old inline-in-localStorage path
   with the old small ceiling, and says so rather than pretending. */

import { read, write, KEY_CUSTOM, KEY_CUSTOM_SAMPLE } from "../storage.js";
import {
  idbSupported,
  putSegments as idbPut,
  getSegments as idbGet,
  deleteSegments as idbDelete,
  clearAll as idbClearAll,
} from "./custom-store.js";

/* Limits, in CHARACTERS -- not file bytes. What gets stored is the
   extracted, sanitized text, so a 6 MB PDF full of fonts and images is
   often only a few hundred KB of actual prose; measuring the file would
   reject things that fit comfortably. */
const MAX_TEXT_CHARS = 12 * 1000 * 1000;   // one saved text, IndexedDB path
const MAX_TOTAL_CHARS = 60 * 1000 * 1000;  // everything saved, combined

/* The old ceilings. Only reachable now when IndexedDB refuses us. */
const FALLBACK_TEXT_CHARS = 512 * 1024;
const FALLBACK_TOTAL_CHARS = 1024 * 1024;

/* Whitespace and invisible characters, reduced to what a keyboard can
   actually produce.

   Imported books are full of characters that LOOK like a space and are
   not one: a non-breaking space between "Mr." and "Smith", a thin space
   before a semicolon, an ideographic space, a zero-width joiner left
   behind by an EPUB's typesetting. Every one of them used to survive
   into the typing target, where it renders as a gap the spacebar cannot
   satisfy -- the user types a space, is marked wrong, and reports that
   the import "added extra spaces".

   The other half of that report is hyphenation. A word broken across a
   line arrives as "short-\nened", and turning that newline into a space
   -- which the display layer does -- puts a space INSIDE the word:
   "short- ened". Joining without a space keeps every character typeable
   and never destroys a real compound: "post-\noffice" stays
   "post-office". parsePdf drops the hyphen as well for a
   lowercase-to-lowercase break, because in a PDF text layer that is soft
   hyphenation; plain text wraps at spaces rather than with soft hyphens,
   so there the hyphen is usually real and is kept.

   Exported so both ends use it: sanitize() cleans text on the way in,
   and the practice page runs it again on the way out, which is what
   repairs the books someone imported before this existed. */
export function normalizeTypeable(input) {
  let s = String(input || "");
  /* Compose accents onto their letters. Extraction hands back decomposed
     text more often than not -- "u" followed by a combining diaeresis
     rather than a single "u-umlaut" -- and a combining mark is not
     something a keyboard can send on its own, so the typing surface
     asked for a character that could not be typed at all. NFC is the
     form a keyboard actually produces. */
  s = s.normalize("NFC");
  // Invisible: soft hyphen, zero-width space / non-joiner / joiner,
  // word joiner, BOM. None of these has a key on any keyboard.
  s = s.replace(/[\u00AD\u200B\u200C\u200D\u2060\uFEFF]/g, "");
  // Every other Unicode space becomes the one the spacebar makes.
  s = s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  s = s.replace(/\t/g, " ");
  s = s.replace(/\r\n?/g, "\n");
  /* A word broken across a line closes up. No space is invented.

     \p{L}, not [A-Za-z]: with the ASCII class a German "Pru-\nfer" or a
     French "pre-\ncis" did not match, so the newline survived and the
     display layer folded it to a space -- "Pru- fer". That is the
     reported bug, in the reported language, and the English case beside
     it worked fine, which is why it stayed hidden. */
  s = s.replace(/(\p{L}|\p{N})-[ ]*\n[ ]*(\p{L}|\p{N})/gu, "$1-$2");
  // Runs of spaces collapse -- but only after a non-space, because
  // leading indentation is load-bearing in verse.
  s = s.replace(/(\S) {2,}/g, "$1 ");
  s = s.replace(/ +\n/g, "\n");
  return s;
}

export function sanitize(raw) {
  let s = String(raw || "");
  // Strip script/style blocks entirely
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Prologs, doctypes and comments do not start with a letter, so the
  // tag pattern below never matched them and they survived into the
  // typing target.
  s = s.replace(/<\?[\s\S]*?\?>/g, "");
  s = s.replace(/<!DOCTYPE[^>]*>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  // Strip remaining HTML tags
  s = s.replace(/<\/?[a-z][^>]*>/gi, "");
  // Decode common entities
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Normalize line endings + collapse blank-line runs
  s = s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  // Strip control chars except \t \n
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Reduce whitespace and invisibles to what a keyboard can produce.
  s = normalizeTypeable(s);
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

/* How many segments a saved item has, whether it is a new index record
   (segCount) or a legacy one with the bodies still inline (segments). */
export function segCountOf(item) {
  if (!item) return 0;
  if (typeof item.segCount === "number") return item.segCount;
  return Array.isArray(item.segments) ? item.segments.length : 0;
}

/* The segment bodies for one saved text. Legacy records still carry
   them inline; everything saved since the IndexedDB split reads from
   there. Returns [] rather than throwing -- the caller renders a
   message, it does not crash the practice page. */
export async function getSegments(id) {
  const item = getSaved(id);
  if (item && Array.isArray(item.segments) && item.segments.length) return item.segments;
  if (!idbSupported()) return [];
  try {
    const segs = await idbGet(id);
    return Array.isArray(segs) ? segs : [];
  } catch {
    return [];
  }
}

export async function saveText({ title, raw, meta, sample, sampleVersion }) {
  const content = sanitize(raw);
  if (!content) throw new Error("Empty after sanitization");

  const useIdb = idbSupported();
  const perText = useIdb ? MAX_TEXT_CHARS : FALLBACK_TEXT_CHARS;

  // Truncate here rather than in sanitize, so the result can say so.
  let truncatedFrom = content.length > perText ? content.length : 0;
  let body = truncatedFrom ? clipToSentence(content, perText) : content;
  let segments = chunk(body);

  const id = "c_" + Math.random().toString(36).slice(2, 8);

  // Try IndexedDB first. A rejection here is a real event -- quota,
  // private mode, a corrupt database -- so fall back to the old inline
  // path at the old ceiling and let the caller say the text was cut.
  let storedInIdb = false;
  let fallbackReason = useIdb ? null : "unavailable";
  if (useIdb) {
    try {
      await idbPut(id, segments);
      storedInIdb = true;
    } catch {
      // The database exists and turned the write down -- almost always
      // out of room. That is a different sentence to the user than
      // "this browser has no database", so keep them apart.
      fallbackReason = "refused";
    }
  }
  if (!storedInIdb && body.length > FALLBACK_TEXT_CHARS) {
    truncatedFrom = content.length;
    body = clipToSentence(body, FALLBACK_TEXT_CHARS);
    segments = chunk(body);
  }

  const item = {
    id,
    title: (title || "Untitled").slice(0, 80),
    createdAt: new Date().toISOString(),
    bytes: body.length,
    segCount: segments.length,
    // Where the reader got to. Without this, coming back to a 481-segment
    // import drops you at segment 1 every time.
    lastSeg: 0,
    // Optional source metadata (author, year, source/work, kind) so
    // the practice page can render an attribution header when typing
    // imported corpus items.
    meta: meta || null,
  };
  // The bundled sample. Marked so the list can label it, so deleting it
  // can be remembered, and so a later build can tell that the copy in
  // this browser is out of date. See engine/custom-sample.js.
  if (sample) {
    item.sample = true;
    if (sampleVersion) item.sampleVersion = String(sampleVersion);
  }
  // Only the fallback path keeps bodies in the index record.
  if (!storedInIdb) item.segments = segments;

  const previous = listSaved();
  const list = [item, ...previous];

  // Evicting the oldest saved texts to make room used to happen in
  // silence. Report it -- deleting something the user saved is not a
  // detail they should discover later.
  const perTotal = useIdb ? MAX_TOTAL_CHARS : FALLBACK_TOTAL_CHARS;
  const evicted = [];
  const evictedIds = [];
  let total = list.reduce((s, x) => s + (x.bytes || 0), 0);
  while (total > perTotal && list.length > 1) {
    const drop = list.pop();
    total -= drop.bytes || 0;
    evicted.push(drop.title);
    evictedIds.push(drop.id);
  }

  // write() returns false when the browser refuses the quota, and the
  // old code ignored it -- the toast said "Saved" whether or not
  // anything had been. Put the previous list back and say what happened.
  if (!write(KEY_CUSTOM, list)) {
    write(KEY_CUSTOM, previous);
    if (storedInIdb) idbDelete(id).catch(() => {});
    throw new Error("Your browser is out of storage for this site. Delete a saved text and try again.");
  }

  // The index is committed, so the evicted bodies are now unreachable.
  for (const dead of evictedIds) idbDelete(dead).catch(() => {});

  return { ...item, truncatedFrom, evicted, storedInIdb, fallbackReason };
}

/* Move legacy records -- bodies inline in localStorage -- into
   IndexedDB, and drop the inline copies so the quota comes back.
   Best-effort per item: a text that fails to move keeps its inline
   segments and stays readable.

   Only /custom/ calls this, so someone who never opens that page keeps
   their inline bodies indefinitely. That is fine -- getSegments() reads
   both shapes -- it just means the quota comes back on a visit to
   /custom/, not on the next page load anywhere. */
export async function migrateInlineToIdb() {
  if (!idbSupported()) return 0;
  const list = listSaved();
  const stale = list.filter((x) => x && Array.isArray(x.segments) && x.segments.length);
  if (!stale.length) return 0;

  const moved = new Set();
  for (const item of stale) {
    try {
      await idbPut(item.id, item.segments);
      moved.add(item.id);
    } catch {
      // Leave this one inline; it still works, it just still costs quota.
    }
  }
  if (!moved.size) return 0;

  // Re-read rather than reusing `list`: another handler on this page may
  // have pinned or deleted something while the writes were in flight.
  const fresh = listSaved().map((x) => {
    if (!x || !moved.has(x.id)) return x;
    const { segments, ...rest } = x;
    return { ...rest, segCount: rest.segCount != null ? rest.segCount : segments.length };
  });
  write(KEY_CUSTOM, fresh);
  return moved.size;
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

export const LIMITS = {
  perText: MAX_TEXT_CHARS,
  total: MAX_TOTAL_CHARS,
  fallbackPerText: FALLBACK_TEXT_CHARS,
  fallbackTotal: FALLBACK_TOTAL_CHARS,
};

export function deleteSaved(id, { remember = true } = {}) {
  const gone = getSaved(id);
  const list = listSaved().filter((x) => x.id !== id);
  write(KEY_CUSTOM, list);
  if (idbSupported()) idbDelete(id).catch(() => {});
  // Deleting the bundled sample has to stick. Reseeding it on the next
  // visit would mean the Delete button did not work.
  //
  // remember:false is for replacing an out-of-date sample with a newer
  // one -- that is not the user deleting it, and tombstoning there would
  // make an upgrade look like a deletion.
  if (remember && gone && gone.sample) write(KEY_CUSTOM_SAMPLE, "dismissed");
}

/* Used by the settings "wipe everything" button -- clearing the
   localStorage keys alone would leave every imported book on disk. */
export async function deleteAllSaved() {
  if (!idbSupported()) return;
  try { await idbClearAll(); } catch {}
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
