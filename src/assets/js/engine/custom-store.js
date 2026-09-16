/* IndexedDB store for custom-text bodies.

   Why this exists: custom texts used to live entirely in localStorage,
   which is a shared ~5 MB budget per origin -- and it holds the user's
   real practice history too (profiles, sessions, the adaptive model,
   daily and hourly buckets). Most browsers store localStorage as UTF-16,
   so a character costs about two bytes. That left roughly 512k
   characters for a whole imported book, and a 600-page PDF was being
   cut off around a third of the way through.

   IndexedDB is measured in hundreds of megabytes rather than five, and
   it is not competing with the stats. So the SEGMENT ARRAYS live here;
   the small index record (id, title, segment count, bookmark) stays in
   localStorage so the pages that only need metadata can still read it
   synchronously.

   Everything here is Promise-based and every failure is a rejection the
   caller can report. Silently losing someone's book is the bug this
   whole file is fixing -- it must not be reintroduced by swallowing an
   error here. */

const DB_NAME = "tt-custom";
const DB_VERSION = 1;
const STORE = "segments";

let _dbPromise = null;

/* Cheap capability probe. Private windows and locked-down browsers can
   expose `indexedDB` and then throw on open(); callers treat a rejected
   open as "not available" too. */
export function idbSupported() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb() {
  if (_dbPromise) return _dbPromise;
  const p = new Promise((resolve, reject) => {
    if (!idbSupported()) { reject(new Error("IndexedDB is not available in this browser.")); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open the text database."));
    req.onblocked = () => reject(new Error("The text database is blocked by another tab."));
  });
  _dbPromise = p;
  // A one-off failure (another tab mid-upgrade, a transient private-mode
  // refusal) must not poison every later call, so drop the cached
  // promise when it rejects and let the next caller try again.
  p.catch(() => { if (_dbPromise === p) _dbPromise = null; });
  return p;
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(STORE, mode); }
    catch (e) { reject(e); return; }
    let out;
    try { out = fn(t.objectStore(STORE)); }
    catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(typeof out === "function" ? out() : out);
    t.onabort = t.onerror = () => reject(t.error || new Error("The text database refused the write."));
  }));
}

/* Store one text's segments -- and, since 2026-09-16, its chapters.

   ONE RECORD, TWO STRUCTURES. A custom text is read two ways now: as
   ~500-character segments (the original) and as chapters of six
   paragraphs a page (the library reader's shape). Both are derived from
   the same document, so they live in the same record: { id, segments,
   chapters }. No store and no version bump -- an IndexedDB upgrade
   blocks every other tab on this origin, and there is nothing here that
   needs one: a record saved before chapters existed simply has no
   `chapters` field, and getChapters() computes it on first use.

   READ BEFORE WRITE, always. store.put() REPLACES a record; it does not
   merge. Writing { id, segments } over a record that already had
   chapters would silently throw the chapters away, and the caller who
   did it -- migrateInlineToIdb(), which knows only about segments --
   would have no idea. So both writers below fetch the existing record
   inside their own transaction and keep whatever half they were not
   asked to change.

   Rejects on quota, which the caller turns into a message rather than a
   truncated book. */
function putPart(id, part) {
  return tx("readwrite", (store) => {
    const key = String(id);
    const req = store.get(key);
    req.onsuccess = () => {
      const prev = req.result && typeof req.result === "object" ? req.result : {};
      store.put({ ...prev, id: key, ...part });
    };
    return true;
  });
}

export function putSegments(id, segments, chapters) {
  const part = { segments: segments || [] };
  if (Array.isArray(chapters)) part.chapters = chapters;
  return putPart(id, part);
}

/* Store the chapter structure for a text whose segments are already
   there -- the lazy computation for a text imported before chapters
   existed, and the only writer that must not disturb the segments. */
export function putChapters(id, chapters) {
  return putPart(id, { chapters: chapters || [] });
}

/* Returns the segment array, or null when this id has no body stored
   (a legacy record whose segments are still inline in localStorage). */
export function getSegments(id) {
  return tx("readonly", (store) => {
    const req = store.get(String(id));
    return () => (req.result && Array.isArray(req.result.segments)) ? req.result.segments : null;
  });
}

/* The chapter structure, or null when this text has none stored yet --
   which is every text imported before this feature, and every text
   whose body is still inline in localStorage. The caller (custom-text's
   getChapters) computes and stores one on the first read. */
export function getChapters(id) {
  return tx("readonly", (store) => {
    const req = store.get(String(id));
    return () => (req.result && Array.isArray(req.result.chapters) && req.result.chapters.length)
      ? req.result.chapters : null;
  });
}

export function deleteSegments(id) {
  return tx("readwrite", (store) => { store.delete(String(id)); return true; });
}

export function clearAll() {
  return tx("readwrite", (store) => { store.clear(); return true; });
}
