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

import { read, write, KEY_CUSTOM_SAMPLE } from "../storage.js";
import { listSaved, saveText } from "./custom-text.js";

const SAMPLE_URL = "/data/custom-sample.json";

/* True once the user has deleted the sample. Checked before seeding so
   it never comes back. */
export function sampleDismissed() {
  return read(KEY_CUSTOM_SAMPLE, null) === "dismissed";
}

export function dismissSample() {
  write(KEY_CUSTOM_SAMPLE, "dismissed");
}

/* Seed the sample if this browser has no saved texts and the user has
   not deleted it. Returns the new record, or null if it did nothing.

   Only seeding into an EMPTY list matters twice over: it keeps the
   sample out of the way of someone who already has their own texts, and
   it keeps it from appearing in the middle of a test that seeded its
   own fixture. */
export async function ensureSample() {
  if (sampleDismissed()) return null;
  if (listSaved().length) return null;

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

  // The fetch took time. If the user saved something of their own while
  // it was in flight, theirs is now the list and the sample stays out.
  if (sampleDismissed() || listSaved().length) return null;

  try {
    return await saveText({
      title: `${data.title || "Sample"} (sample)`,
      raw: data.text,
      sample: true,
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
}
