/* Every string a share card can draw that came from a URL.
 *
 * This is the privacy boundary of the whole sharing feature, so read
 * the rule before adding anything: **no text from a query string is
 * ever drawn on a card.** A query parameter can only select a key in
 * one of the maps below, and the card draws the map's VALUE. A link
 * carrying `lang=BUY%20CHEAP%20PILLS` cannot put those words on an
 * image served from guerillatype.com, because that key is not here.
 *
 * The other half of the rule lives in resolve.js: content text is
 * looked up from the repo's own JSON by a public id, never taken from
 * the URL.
 *
 * scripts/check-og-render.mjs asserts these maps cover every id in
 * src/_data/wordlists.js, src/_data/modes.js and
 * src/assets/js/engine/layouts.js. Adding a word list without adding it
 * here fails that gate rather than shipping a card with a blank chip.
 */

/* Mode ids the engine actually runs with (typing-engine.js:358-361,478
   plus practice-boot's CORPUS_MODES), not just the six on /modes/. */
export const MODES = {
  time: "Time",
  words: "Words",
  quote: "Quote",
  zen: "Zen",
  custom: "Custom",
  adaptive: "Adaptive",
  lesson: "Lesson",
  drill: "Drill",
  challenge: "Challenge",
  book: "Book",
  poem: "Poem",
  idiom: "Idiom",
  parable: "Parable",
  fable: "Fable",
  tape: "Tape",
  game: "Game",
};

/* Word lists. Keys are every id in src/_data/wordlists.js; the values
   are the short forms from modes.js LANGUAGES where one exists, because
   these are drawn in a chip with about 22 characters of room. */
export const LANGS = {
  "en-1k": "English 1k",
  "en-5k": "English 5k",
  "en-10k": "English 10k",
  "en-20k": "English 20k",
  "en-50k": "English 50k",
  "en-advanced": "English advanced",
  "code-js": "Code: JS",
  "code-ts": "Code: TypeScript",
  "code-py": "Code: Python",
  "code-html": "Code: HTML",
  "code-css": "Code: CSS",
  "code-rust": "Code: Rust",
  "code-sql": "Code: SQL",
  "code-bash": "Code: Bash",
  punctuation: "Punctuation",
  numbers: "Numbers",
  scrabble: "Scrabble",
  pangrams: "Pangrams",
  misspellings: "Misspelled words",
  "latin-phrases": "Latin phrases",
  countries: "Countries",
  capitals: "Capitals",
  missed: "Missed words",
};

/* Keyboard layouts — the keys of LAYOUTS in engine/layouts.js. */
export const LAYOUTS = {
  qwerty: "QWERTY",
  dvorak: "Dvorak",
  colemak: "Colemak",
  workman: "Workman",
  numpad: "Numpad",
};

/* `src` prefixes: the only kinds of public content a link may name. */
export const KINDS = {
  q: "quote",
  id: "idiom",
  po: "poem",
  pa: "parable",
  bk: "book",
  ls: "lesson",
  ch: "challenge",
  dr: "drill",
};

/* Eyebrow line on a content card, per resolved kind. */
export const KIND_EYEBROW = {
  quote: "QUOTE",
  idiom: "IDIOM",
  poem: "POEM",
  parable: "PARABLE",
  book: "FROM THE LIBRARY",
  lesson: "LESSON",
  challenge: "CHALLENGE",
  drill: "DRILL",
};

/* Accuracy bands for the Free-plan result grid. A pre-rendered card
   cannot carry "96.4%", so it carries the band the number falls in.
   Order matters: BANDS is iterated low to high by bandFor(). */
export const BANDS = {
  u80: "under 80%",
  80: "80–89%",
  90: "90–94%",
  95: "95–97%",
  98: "98–99%",
  100: "100%",
};

export const BAND_IDS = ["u80", "80", "90", "95", "98", "100"];

/* accuracy (0-100) -> band id. Anything not a finite number lands in
   the lowest band rather than throwing, because this runs in a request
   path in Phase D2. */
export function bandFor(acc) {
  const a = Number(acc);
  if (!Number.isFinite(a)) return "u80";
  if (a >= 100) return "100";
  if (a >= 98) return "98";
  if (a >= 95) return "95";
  if (a >= 90) return "90";
  if (a >= 80) return "80";
  return "u80";
}

/* Seconds -> the string the result row shows. 90 -> "1:30", 45 -> "45s". */
export function durationLabel(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
