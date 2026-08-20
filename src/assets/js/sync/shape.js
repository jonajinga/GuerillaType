/* Flat <-> slotted conversion.

   The app reads and writes FLAT counters, because that is what the engine
   wants and what every stats view already renders:

       perKey: { a: { n, errors, sumMs } }

   The merge rule (merge.js) needs SLOTTED counters, because replacing one
   device's slot is the only shape where a replayed push is a no-op:

       perKey: { a: { <deviceId>: { n, errors, sumMs } } }

   Rather than force the whole app onto the slotted shape, we convert at
   the boundary: lift on push, fold on pull. Nothing in the engine, the
   recorder or the stats pages has to change.
*/

import { flattenSlots, mergeSlots, toSlots } from "./merge.js";

/* Field specs, one per slotted map.

   perCharDetail is deliberately NOT the plain model spec: it also carries
   lastSeen and lastError, and folding with the model spec alone would
   silently drop them -- the adaptive engine uses lastSeen to decay stale
   characters, so losing it would quietly change what gets drilled. */
export const SPECS = {
  perKey:        { n: "sum", errors: "sum", sumMs: "sum" },
  perBigram:     { n: "sum", errors: "sum", sumMs: "sum" },
  perFinger:     { n: "sum", errors: "sum", sumMs: "sum" },
  perCharDetail: { n: "sum", errors: "sum", sumMs: "sum", lastSeen: "max", lastError: "max" },
  daily:         { sessions: "sum", timeMs: "sum", chars: "sum" },
  hourly:        { sessions: "sum", timeMs: "sum", chars: "sum" },
  missedWords:   { n: "sum", last: "max" },
};

export const SLOTTED_FIELDS = Object.keys(SPECS);

/* Local (flat) -> sync (slotted). Everything this device knows becomes
   this device's slot. */
export function toSyncProfile(profile, deviceId) {
  if (!profile) return profile;
  const out = { ...profile };
  for (const f of SLOTTED_FIELDS) out[f] = toSlots(profile[f] || {}, deviceId);
  return out;
}

/* Sync (slotted) -> local (flat), for handing a merged profile back to
   the app. */
export function toLocalProfile(profile) {
  if (!profile) return profile;
  const out = { ...profile };
  for (const f of SLOTTED_FIELDS) out[f] = flattenSlots(profile[f] || {}, SPECS[f]);
  return out;
}

/* True when a profile is already in the slotted shape. Used so a claim or
   a pull can be run twice without double-lifting -- lifting an already
   slotted map would nest it a level deeper and quietly zero every counter
   (the fold would find no numeric fields). */
export function isSlotted(profile) {
  for (const f of SLOTTED_FIELDS) {
    const map = profile && profile[f];
    if (!map) continue;
    for (const k of Object.keys(map)) {
      const v = map[k];
      if (!v || typeof v !== "object") return false;
      // Flat entries hold numbers; slotted entries hold objects.
      return Object.values(v).some((x) => x && typeof x === "object");
    }
  }
  return false;
}

/* Idempotent lift: safe to call on either shape. */
export const ensureSync = (profile, deviceId) =>
  isSlotted(profile) ? profile : toSyncProfile(profile, deviceId);

/* Fold two slotted maps for one field, honouring that field's spec. Thin
   wrapper so callers don't have to remember which spec goes with which
   field. */
export const mergeField = (field, a, b) => mergeSlots(a, b);
export const foldField = (field, slotted) => flattenSlots(slotted || {}, SPECS[field]);
