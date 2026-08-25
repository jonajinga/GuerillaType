/* IndexedDB, wrapped just enough to be pleasant. No dependencies.

   Why this exists: localStorage is a single ~5 MB budget shared by
   everything on the origin, and most browsers store it as UTF-16, so a
   character costs about two bytes. That is fine for settings and stats.
   It is hopeless for books -- the plain text of a novel averages ~610 KB
   and War and Peace is 3.2 MB, so one import could evict a year of
   practice history.

   IndexedDB is typically allowed a large share of free disk instead of a
   fixed few megabytes, and it stores structured values without the
   JSON.stringify round trip on every read. Custom texts live here now;
   everything else stays in localStorage, where it is small and where
   synchronous reads genuinely help (the no-flash theme script, for one).
*/

const DB_NAME = "guerillatype";
const DB_VERSION = 1;
export const STORE_TEXTS = "custom-texts";

let dbPromise = null;

/* Cached because open() is not free and every page that touches custom
   text would otherwise reopen it. A failed open resets the cache so a
   later call can retry rather than being poisoned forever. */
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      dbPromise = null;
      return reject(e);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TEXTS)) {
        db.createObjectStore(STORE_TEXTS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
    // Firefox in permanent-private mode neither resolves nor rejects.
    req.onblocked = () => { dbPromise = null; reject(new Error("IndexedDB blocked")); };
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/* Is IndexedDB usable here at all? Safari in private mode and some
   locked-down enterprise profiles say no, and the answer decides whether
   custom text falls back to localStorage. Cached after the first check. */
let availability = null;
export async function idbAvailable() {
  if (availability !== null) return availability;
  try {
    if (typeof indexedDB === "undefined") { availability = false; return false; }
    await open();
    availability = true;
  } catch {
    availability = false;
  }
  return availability;
}

export async function idbGetAll(store = STORE_TEXTS) {
  const db = await open();
  return (await wrap(tx(db, store, "readonly").getAll())) || [];
}

export async function idbGet(id, store = STORE_TEXTS) {
  const db = await open();
  return (await wrap(tx(db, store, "readonly").get(id))) || null;
}

export async function idbPut(value, store = STORE_TEXTS) {
  const db = await open();
  return wrap(tx(db, store, "readwrite").put(value));
}

/* One transaction for the whole batch: a half-written migration is worse
   than one that failed outright, because the caller can retry a failure. */
export async function idbPutMany(values, store = STORE_TEXTS) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    const os = t.objectStore(store);
    for (const v of values) os.put(v);
    t.oncomplete = () => resolve(values.length);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("aborted"));
  });
}

export async function idbDelete(id, store = STORE_TEXTS) {
  const db = await open();
  return wrap(tx(db, store, "readwrite").delete(id));
}

export async function idbClear(store = STORE_TEXTS) {
  const db = await open();
  return wrap(tx(db, store, "readwrite").clear());
}

/* Rough usage, for the settings page. navigator.storage.estimate covers
   the whole origin (IndexedDB, caches, service worker), so it is a
   ceiling rather than a per-store number -- reported as such. */
export async function storageEstimate() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage || 0, quota: quota || 0 };
  } catch { return null; }
}
