/* Generated handles -- the whole zero-moderation strategy in one file.

   Users may reroll as often as they like but can never TYPE a string, so
   there is no username to moderate, no impersonation vector, and no
   uniqueness-collision UX to design. The wordlists are deliberately
   bland: no proper nouns, no adjectives that combine into anything
   unfortunate. */

const ADJECTIVES = [
  "brass", "quiet", "amber", "north", "clever", "steady", "swift", "hollow",
  "bright", "copper", "silent", "keen", "wandering", "patient", "iron", "violet",
  "distant", "gentle", "rapid", "still", "crimson", "olive", "slate", "nimble",
];

const NOUNS = [
  "kestrel", "meridian", "lantern", "harbor", "compass", "ember", "thistle", "quill",
  "falcon", "beacon", "cypress", "current", "otter", "summit", "willow", "anchor",
  "heron", "marble", "orchard", "pine", "raven", "sable", "tundra", "vellum",
];

export function generateHandle(): string {
  const a = ADJECTIVES[randomIndex(ADJECTIVES.length)]!;
  const n = NOUNS[randomIndex(NOUNS.length)]!;
  // 3 digits keeps the space at ~576k combinations before the
  // discriminator, which is ample and still reads as a name.
  const d = String(randomIndex(1000)).padStart(3, "0");
  return `${cap(a)}${cap(n)}${d}`;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/* Rejection sampling -- `% n` on a uint32 skews toward low values when n
   does not divide 2^32 evenly. Overkill for a handle, but this is the
   kind of thing that gets copied into somewhere it matters. */
function randomIndex(n: number): number {
  const limit = Math.floor(0xffffffff / n) * n;
  const buf = new Uint32Array(1);
  let v: number;
  do { crypto.getRandomValues(buf); v = buf[0]!; } while (v >= limit);
  return v % n;
}
