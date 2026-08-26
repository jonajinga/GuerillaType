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

/* Store one text's segments. Rejects on quota, which the caller turns
   into a message rather than a truncated book. */
export function putSegments(id, segments) {
  return tx("readwrite", (store) => {
    store.put({ id: String(id), segments: segments || [] });
    return true;
  });
}

/* Returns the segment array, or null when this id has no body stored
   (a legacy record whose segments are still inline in localStorage). */
export function getSegments(id) {
  return tx("readonly", (store) => {
    const req = store.get(String(id));
    return () => (req.result && Array.isArray(req.result.segments)) ? req.result.segments : null;
  });
}

export function deleteSegments(id) {
  return tx("readwrite", (store) => { store.delete(String(id)); return true; });
}

export function clearAll() {
  return tx("readwrite", (store) => { store.clear(); return true; });
}
