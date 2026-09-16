/* Fingerprint of a book's chapter structure, computed from the data
   itself rather than stamped at build time -- polish-books.mjs drops
   chapters after ingest, so a stamped field would describe a structure
   that no longer exists and every later pipeline stage would have to
   remember to refresh it.

   Reading progress is keyed "chapterIndex:paragraphId", so re-splitting
   a book moves both halves of every saved key. Measured on the chapter
   fix that introduced this: of 702,223 possible keys corpus-wide, 15.7%
   would have resolved to DIFFERENT text and 5.1% to nothing -- the
   reader would have shown paragraphs marked typed that never were. */
export function bookStructureSig(chapters) {
  const s = (chapters || []).map((c) => `${c.title}\u0000${(c.paragraphs || []).length}`).join("\u0001");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

/* A custom text read by chapter is a book as far as the reader is
   concerned: ?book=custom:<id>, and its progress goes into the same
   profile.bookProgress map a library book uses, under this prefix.

   The prefix lives HERE, next to the fingerprint, because three
   unrelated files have to agree about it and the cost of them
   disagreeing is silent: practice-boot.js decides where the chapters
   come from by it, custom-text.js deletes the progress by it, and
   achievements.js excludes it from every "public-domain library" badge.
   That last one is why a second copy of the string would be a bug and
   not a duplication -- a badge saying you read a library book when you
   read your own PDF is wrong, and nothing would report it. */
export const CUSTOM_BOOK_PREFIX = "custom:";
export const isCustomBookSlug = (slug) =>
  typeof slug === "string" && slug.startsWith(CUSTOM_BOOK_PREFIX);
export const customBookSlug = (id) => CUSTOM_BOOK_PREFIX + String(id || "");
export const customBookId = (slug) => String(slug || "").slice(CUSTOM_BOOK_PREFIX.length);
