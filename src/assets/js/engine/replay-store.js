/* Keystroke logs for finished sessions, on this device only.

   Why a store at all. The log of a run is what makes a replay
   possible, and it is far too big for localStorage next to the
   profile (a 100-word run is a few thousand entries). It is also the
   most personal thing this app produces -- the exact rhythm of
   somebody's hands -- so it is written here and nowhere else. Nothing
   in this file talks to a network, and nothing that reads it may put
   a log anywhere except the URL fragment (see share/codec.js).

   Shape: { id, at, keylog, textHash, prefs, text }, keyed by the
   session id that session-recorder.js minted for the same run. The
   newest 50 are kept; 50 runs is roughly a fortnight of daily practice
   and about 2 MB, and the cap runs on every save so the store cannot
   creep.

   `text` is the target the run was typed against, and it is written
   only for the runs whose words no public id can ever name: a
   generated word stream, and a text of your own. The rule lives in
   replayTextFor() in share/session-link.js, which is also the only
   thing that reads it back. A quote, a book page or a lesson is not
   kept here -- /r/ resolves those from the `src` id instead. Storing
   it costs nothing this store was not already holding: the keylog
   beside it is every keystroke of the same passage, which is why the
   whole file says "on this device only" at the top. `textHash` stays,
   and stays the thing a replay checks itself against, because it is
   also written for the runs where `text` is not.

   No IndexedDB (private windows, locked-down browsers, old WebViews)
   means every function here is a no-op that resolves: save() resolves
   to false, get() to null, list() to an empty array. Losing a replay
   costs a nice-to-have; throwing at the end of somebody's session
   costs them the session. */

const DB_NAME = "tt-replays";
const DB_VERSION = 1;
const STORE = "replays";
export const KEEP = 50;

/* How long a target may be before this store stops keeping it.

   A book imported as one custom text can be millions of characters,
   and the practice page types it a page at a time -- but a single
   `target` of 5.4 MB was read back from this store during review, and
   fifty of those is a quarter of a gigabyte in somebody's browser for
   a link that could never carry them anyway (the fragment budget is
   8 KB). Over the cap, no text is kept: the run shares its numbers,
   its date and its replay is dropped with the words, because a replay
   with no target cannot be played. */
export const TEXT_MAX = 20000;

let _dbPromise = null;

/* Has this page already swept the shelf for records written before
   the cap existed? The cap is applied on the way in (see save), and a
   cap applied on the way in is not retroactive: a browser that stored
   a 5.4 MB target before this rule was written goes on holding it,
   goes on offering it to a share link that can never carry it, and
   goes on making every read of the whole store expensive. So the
   store forgets the words the first time it looks at everything it
   holds -- once per page, and only for the records that are actually
   over. Set before the write rather than after it: a readwrite
   transaction the browser refuses now will be refused again in two
   hundred milliseconds, and the point of "once" is that nobody pays
   for this twice. */
let _sweptOversized = false;

/* Drop the text of every record past the cap, and touch nothing else.

   `rows` is a getAll() the caller already had in hand, so this costs
   no extra read -- that is the whole reason it hangs off list() and
   prune() rather than running on a timer. The keystrokes stay: they
   are what the record is for, and the store has always kept them for
   runs whose target it does not hold. What goes with the text is the
   SHAREABILITY of the replay, and that falls out of the rule that was
   already there -- share/session-link.js will not put a keystroke log
   in a link that cannot also say what was typed, so the row shares
   its numbers and its date, exactly as it would if the target had
   been too long on the day it was written. */
async function sweepOversized(rows) {
  if (_sweptOversized) return 0;
  _sweptOversized = true;
  const over = (rows || []).filter((r) => r && typeof r.text === "string" && r.text.length > TEXT_MAX);
  if (!over.length) return 0;
  try {
    await tx("readwrite", (store) => {
      for (const r of over) store.put({ ...r, text: null });
    });
  } catch {
    return 0;
  }
  return over.length;
}

/* Cheap capability probe. Some browsers expose `indexedDB` and then
   throw on open(); a rejected open is treated as "not available" too. */
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
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        /* Pruning wants the oldest first and nothing else does, so one
           index on the timestamp is the whole schema. */
        store.createIndex("at", "at");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open the replay database."));
    req.onblocked = () => reject(new Error("The replay database is blocked by another tab."));
  });
  _dbPromise = p;
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
    t.onabort = t.onerror = () => reject(t.error || new Error("The replay database refused the write."));
  }));
}

/* A short, stable fingerprint of the text a run was typed against.
   It is NOT the text: this is stored so a replay can refuse to play
   against a target that has changed underneath it, and a hash cannot
   be read back into the sentence somebody typed. FNV-1a, base 36. */
export function textHash(text) {
  const s = Array.isArray(text) ? text.join(" ") : String(text || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36) + ":" + s.length;
}

/* save({id, keylog, textHash, prefs, at?, text?}) -> Promise<boolean>.
   Resolves false when the browser has no IndexedDB, or when the entry
   has no id or no keystrokes to keep. */
export async function save(entry) {
  const e = entry || {};
  if (!e.id || !Array.isArray(e.keylog) || !e.keylog.length) return false;
  if (!idbSupported()) return false;
  const record = {
    id: String(e.id),
    at: e.at || new Date().toISOString(),
    keylog: e.keylog,
    textHash: e.textHash || null,
    prefs: Number(e.prefs) || 0,
    /* Absent, not empty: a record written before this field existed,
       a run whose target is not kept, and a target too long to keep
       must all read the same way. */
    text: typeof e.text === "string" && e.text && e.text.length <= TEXT_MAX ? e.text : null,
  };
  try {
    await tx("readwrite", (store) => { store.put(record); });
    await prune();
    return true;
  } catch {
    return false;
  }
}

/* One record by session id, or null. */
export async function get(id) {
  if (!id || !idbSupported()) return null;
  try {
    return await tx("readonly", (store) => {
      const req = store.get(String(id));
      return () => req.result || null;
    });
  } catch {
    return null;
  }
}

/* Newest first, without the logs: the id, the time and the size. The
   caller that wants to draw a list of past runs does not need several
   megabytes of keystrokes to do it. */
export async function list() {
  if (!idbSupported()) return [];
  try {
    const all = await tx("readonly", (store) => {
      const req = store.getAll();
      return () => req.result || [];
    });
    /* Everything is in hand here, so this is where the cap catches up
       with the records that predate it. Awaited: a caller that lists
       and then reads is entitled to read what the list left behind. */
    await sweepOversized(all);
    return all
      .map((r) => ({ id: r.id, at: r.at, keys: (r.keylog || []).length, textHash: r.textHash || null }))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  } catch {
    return [];
  }
}

/* Drop everything past the newest KEEP. Returns how many went. */
export async function prune(keep = KEEP) {
  if (!idbSupported()) return 0;
  try {
    const rows = await tx("readonly", (store) => {
      const req = store.getAll();
      return () => req.result || [];
    });
    /* Before the early return below, not after it: a store of three
       records with a book in one of them never reaches the keep
       limit, and it is the exact store this sweep exists for. prune()
       runs after every save(), so finishing one run is enough. */
    await sweepOversized(rows);
    if (rows.length <= keep) return 0;
    const doomed = rows
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(keep)
      .map((r) => r.id);
    await tx("readwrite", (store) => { for (const id of doomed) store.delete(id); });
    return doomed.length;
  } catch {
    return 0;
  }
}

/* Used by the tests and by "forget my data" in settings, later. */
export async function clear() {
  if (!idbSupported()) return false;
  try {
    await tx("readwrite", (store) => { store.clear(); });
    return true;
  } catch {
    return false;
  }
}

export default { save, get, list, prune, clear, textHash, idbSupported, KEEP, TEXT_MAX };
