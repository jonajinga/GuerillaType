/* Quote collections — user-named ordered playlists of quote IDs.
   Persisted in localStorage as tt:collections. Each collection is
   { id, name, ids: [quoteId,...], createdAt }. The active collection
   pointer is tt:active-collection — when set, /practice/?mode=quote
   will iterate through that collection in order. */

const KEY_COLLS = "tt:collections";
const KEY_ACTIVE_COLL = "tt:active-collection";
const KEY_ACTIVE_COLL_IDX = "tt:active-collection-index";

function read(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn(e); } }

export function listCollections() { return read(KEY_COLLS, []) || []; }
export function getCollection(id) { return listCollections().find((c) => c.id === id) || null; }

export function createCollection(name) {
  const list = listCollections();
  const c = {
    id: "c_" + Math.random().toString(36).slice(2, 8),
    name: (name || "Untitled").slice(0, 80),
    ids: [],
    createdAt: new Date().toISOString(),
  };
  list.unshift(c);
  write(KEY_COLLS, list);
  return c;
}

export function renameCollection(id, name) {
  const list = listCollections();
  const c = list.find((x) => x.id === id);
  if (!c) return;
  c.name = name.slice(0, 80);
  write(KEY_COLLS, list);
}

export function deleteCollection(id) {
  const list = listCollections().filter((c) => c.id !== id);
  write(KEY_COLLS, list);
  if (getActiveCollectionId() === id) clearActive();
}

export function addToCollection(collId, quoteId) {
  const list = listCollections();
  const c = list.find((x) => x.id === collId);
  if (!c) return;
  if (!c.ids.includes(quoteId)) c.ids.push(quoteId);
  write(KEY_COLLS, list);
}

export function removeFromCollection(collId, quoteId) {
  const list = listCollections();
  const c = list.find((x) => x.id === collId);
  if (!c) return;
  c.ids = c.ids.filter((x) => x !== quoteId);
  write(KEY_COLLS, list);
}

export function reorderCollection(collId, fromIdx, toIdx) {
  const list = listCollections();
  const c = list.find((x) => x.id === collId);
  if (!c) return;
  if (fromIdx < 0 || fromIdx >= c.ids.length) return;
  const moved = c.ids.splice(fromIdx, 1)[0];
  const insertAt = Math.max(0, Math.min(c.ids.length, toIdx));
  c.ids.splice(insertAt, 0, moved);
  write(KEY_COLLS, list);
}

export function setActiveCollection(id) {
  if (id) write(KEY_ACTIVE_COLL, id);
  else { try { localStorage.removeItem(KEY_ACTIVE_COLL); } catch {} }
  write(KEY_ACTIVE_COLL_IDX, 0);
}
export function clearActive() {
  try { localStorage.removeItem(KEY_ACTIVE_COLL); localStorage.removeItem(KEY_ACTIVE_COLL_IDX); } catch {}
}
export function getActiveCollectionId() { return read(KEY_ACTIVE_COLL, null); }
export function getActiveIndex() { return read(KEY_ACTIVE_COLL_IDX, 0) || 0; }
export function advanceActiveIndex() {
  const c = getCollection(getActiveCollectionId());
  if (!c) return null;
  let i = getActiveIndex() + 1;
  if (i >= c.ids.length) i = 0;
  write(KEY_ACTIVE_COLL_IDX, i);
  return i;
}
