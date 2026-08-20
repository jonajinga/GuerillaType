/* The sync scheduler.

   Three rules, and the first one is why this file exists at all:

   1. NEVER on the keystroke path. Autosave already runs on a debounce and
      typing must never wait on the network. Sync flushes on quiet
      boundaries: a finished test, the tab going away, coming back online.

   2. Survive the tab closing. A user finishes a test and immediately
      closes the laptop -- the single most common moment to lose data.
      visibilitychange + sendBeacon is the only combination browsers
      actually honour there; unload handlers are not reliable.

   3. Retry must be free. The server stores one blob per device and a
      device only writes its own, so re-sending is a no-op by
      construction. That means the queue can be dumb: mark dirty, try,
      and if it fails leave it dirty. No sequence numbers, no
      reconciliation, no partial-state bookkeeping.
*/

import { getDeviceId } from "../storage.js";
import { apiFetch, ApiError } from "../net/api.js";
import { toSyncProfile } from "./shape.js";

// Debounce after a finished test. Long enough that a burst of quick
// restarts coalesces into one push, short enough to feel immediate.
const QUIET_MS = 4000;

const dirty = new Set();
let timer = null;
let inFlight = false;
let lastError = null;

/* Mark a profile as having unsynced changes. Cheap by design -- it must
   be safe to call from the hot path, so it does no serialisation, no
   storage access and no network. */
export function markDirty(profileId) {
  if (!profileId) return;
  dirty.add(profileId);
  schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void flush(); }, QUIET_MS);
}

/* Push every dirty profile. Safe to call at any time; overlapping calls
   collapse because a push is idempotent. */
export async function flush(getProfiles) {
  if (inFlight || !dirty.size) return { pushed: 0, skipped: dirty.size };
  const source = getProfiles || defaultGetProfiles;
  if (!source) return { pushed: 0, skipped: dirty.size };

  inFlight = true;
  const deviceId = getDeviceId();
  let pushed = 0;

  try {
    const profiles = source();
    for (const id of [...dirty]) {
      const profile = profiles.find((p) => p && p.id === id);
      if (!profile) { dirty.delete(id); continue; }
      try {
        const body = JSON.stringify(toSyncProfile(profile, deviceId));
        await apiFetch(
          `/sync/${encodeURIComponent(id)}?device=${encodeURIComponent(deviceId)}&name=${encodeURIComponent(profile.name || "")}`,
          { method: "PUT", body, quiet: true },
        );
        // Only clear on success. A failure leaves it dirty, and the next
        // trigger retries -- which is free.
        dirty.delete(id);
        pushed++;
        lastError = null;
      } catch (e) {
        lastError = e;
        // Offline or a server problem: stop trying the rest now, they
        // will go together on the next trigger.
        if (e instanceof ApiError && (e.offline || e.status >= 500)) break;
        // A 401 means signed out; there is nothing useful to retry.
        if (e instanceof ApiError && e.status === 401) { dirty.clear(); break; }
      }
    }
  } finally {
    inFlight = false;
  }
  return { pushed, skipped: dirty.size, error: lastError };
}

let defaultGetProfiles = null;

/* Wire the scheduler to the app's profile store and to the browser
   lifecycle. Called once at boot, and only when signed in -- signed-out
   users never touch the network. */
export function startSync(getProfiles) {
  defaultGetProfiles = getProfiles;

  /* The tab is going away. This is the moment data gets lost, so it gets
     the treatment that actually survives: sendBeacon, which the browser
     completes after the document is gone. fetch() here is unreliable and
     unload is worse. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || !dirty.size) return;
    const deviceId = getDeviceId();
    const profiles = getProfiles();
    for (const id of [...dirty]) {
      const profile = profiles.find((p) => p && p.id === id);
      if (!profile) continue;
      try {
        const blob = new Blob([JSON.stringify(toSyncProfile(profile, deviceId))], { type: "application/json" });
        // No credentials control on sendBeacon: it sends cookies for
        // same-site requests, which is exactly our setup.
        const ok = navigator.sendBeacon(
          `/sync/${encodeURIComponent(id)}?device=${encodeURIComponent(deviceId)}&name=${encodeURIComponent(profile.name || "")}`,
          blob,
        );
        if (ok) dirty.delete(id);
      } catch { /* keep it dirty; the next load will retry */ }
    }
  });

  // Coming back online is the other natural boundary.
  window.addEventListener("online", () => { void flush(getProfiles); });
}

export const pendingCount = () => dirty.size;
export const lastSyncError = () => lastError;

/* Test seam — the module holds state, so tests need a way back to zero. */
export function __reset() {
  dirty.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  inFlight = false;
  lastError = null;
  defaultGetProfiles = null;
}
