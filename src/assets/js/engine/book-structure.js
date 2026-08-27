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
