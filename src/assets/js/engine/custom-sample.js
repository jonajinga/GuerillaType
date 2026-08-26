/* The sample custom text.

   /custom/ used to open on "No saved texts yet.", which shows nothing
   about what the page does: that a whole book is split into segments,
   that you pick the one you want, and that it remembers where you
   stopped. So a real book ships with the app -- the whole of Alice's
   Adventures in Wonderland (Lewis Carroll, 1865, public domain), about
   143,000 characters across 12 chapters.

   It is FETCHED, not embedded. custom-boot.js imports this module on
   every visit to /custom/, so 143 KB of book baked into it would be 143
   KB every visitor downloads forever, including the ones who deleted
   the sample a year ago. The fetch happens only in the one case where
   the text is actually about to be seeded. After the first hit the
   service worker serves it from the runtime cache.

   It is seeded ONLY into an empty list, and only until the user deletes
   it. Deleting writes a tombstone (KEY_CUSTOM_SAMPLE) so it stays gone
   -- a sample that grows back is not deletable, it is a nuisance.

   The JSON is built by scripts/build-custom-sample.mjs, which strips the
   Project Gutenberg boilerplate and the smart punctuation. */

import { read, write, KEY_CUSTOM, KEY_CUSTOM_SAMPLE } from "../storage.js";

const writeList = (list) => write(KEY_CUSTOM, list);
import { listSaved, saveText, deleteSaved } from "./custom-text.js";

const SAMPLE_URL = "/data/custom-sample.json";

/* True once the user has deleted the sample. Checked before seeding so
   it never comes back. */
export function sampleDismissed() {
  return read(KEY_CUSTOM_SAMPLE, null) === "dismissed";
}

export function dismissSample() {
  write(KEY_CUSTOM_SAMPLE, "dismissed");
}

/* Seed the sample, or replace an out-of-date copy of it.

   Three rules, in this order:

     1. If the user deleted it, do nothing. Ever. An upgrade must never
        undo a deletion -- that is the one way this could become a
        nuisance rather than a convenience.
     2. If they already have texts of their own and no sample, stay out
        of the way.
     3. If the sample they have was built from different content than
        the one shipping now, replace it. Without this, the browser that
        seeded an early 7,100-character excerpt would keep that excerpt
        forever, and the fix would only reach people with fresh storage.

   Returns the new record, or null if it did nothing. */
export async function ensureSample() {
  if (sampleDismissed()) return null;

  const list = listSaved();
  const existing = list.find((x) => x && x.sample) || null;
  if (!existing && list.length) return null;

  let data;
  try {
    const res = await fetch(SAMPLE_URL, { cache: "default" });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    // Offline on a first visit. No sample this time, no error in the
    // user's face about a text they did not ask for; the next visit
    // with a connection seeds it.
    return null;
  }
  if (!data || typeof data.text !== "string" || data.text.length < 1000) return null;

  // Already have this exact sample.
  if (existing && data.version && existing.sampleVersion === String(data.version)) return null;

  // The fetch took time. Re-check both guards: the user may have deleted
  // the sample or saved something of their own while it was in flight.
  if (sampleDismissed()) return null;
  const now = listSaved();
  const stillThere = now.find((x) => x && x.sample) || null;
  if (!stillThere && now.length && !existing) return null;

  // Carry the bookmark and the lesson pin across an upgrade. The new
  // text opens with the same words, so an early bookmark still points
  // somewhere sensible; anything past the end falls back to the start.
  const carriedSeg = stillThere ? (stillThere.lastSeg | 0) : 0;
  const carriedPin = !!(stillThere && stillThere.forLesson);

  // Remove the stale copy WITHOUT tombstoning it -- this is a
  // replacement, not the user deleting the sample.
  if (stillThere) deleteSaved(stillThere.id, { remember: false });

  let seeded;
  try {
    seeded = await saveText({
      title: `${data.title || "Sample"} (sample)`,
      raw: data.text,
      sample: true,
      sampleVersion: data.version || null,
      meta: {
        kind: "sample",
        author: data.author || null,
        year: data.year || null,
        source: data.source || null,
      },
    });
  } catch {
    // A browser that cannot store the sample is not a browser we should
    // interrupt about a sample. The user's own imports report properly.
    return null;
  }

  if (seeded && (carriedSeg || carriedPin)) {
    const fresh = listSaved();
    const i = fresh.findIndex((x) => x.id === seeded.id);
    if (i >= 0) {
      if (carriedSeg) fresh[i].lastSeg = Math.min(carriedSeg, Math.max(0, (fresh[i].segCount | 0) - 1));
      if (carriedPin) fresh[i].forLesson = true;
      writeList(fresh);
    }
  }
  return seeded;
}
