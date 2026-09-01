/* Punctuation Storm -- the fragment pool and the scoring rule.

   Lives here rather than inside pages/storm-boot.js (where boss-boot
   keeps FALLBACK_WORDS) for one reason: storm-boot.js queries the DOM
   at module scope, so importing it anywhere but the game page throws.
   The pool and the score formula are the two things a check script most
   needs to read directly, so they sit in a module with no DOM contact.

   SITE RULE, load-bearing here: typeable content is ASCII only. There
   is no smart punctuation anywhere in this file -- no em-dash, no curly
   quote, no ellipsis character. See the asciify() note in
   engine/import-parsers.js. A fragment a user cannot type without
   hunting option-key combinations is not a typing target, it is a
   trick. isTypeable() below is the machine-checkable form of that rule
   and scripts/check-punctuation-storm.mjs runs it over the whole pool. */

/* Every fragment is punctuation-heavy on purpose: the whole point of
   the game is the characters most typists are weakest on. Grouped by
   the shape of the punctuation so the pool is easy to extend without
   accidentally producing forty variations of the same thing. */

// Quoted speech -- straight quotes and the apostrophe.
const QUOTED = [
  '"Don\'t!"',
  '"Why?"',
  '"No," I said.',
  '"Stop!" -- Ann',
  '"Wait," he said',
  '"It\'s fine."',
  '"Who? Me?"',
  '"Yes; and no."',
];

// Parentheses and citation shorthand.
const PARENS = [
  '("wait,")',
  '(cf. p. 9)',
  '(see n. 4);',
  '(a, b, c)',
  '(1999--2001)',
  '(ibid., 12)',
  '(sic!)',
  '(e.g. this)',
];

// Square brackets -- editorial marks and indexing.
const BRACKETS = [
  '[see p. 12];',
  '[sic]',
  '[...]',
  '[ed. note]',
  'arr[i] += 2;',
  'a[0], a[1]',
  '[Ch. 3, s. 2]',
];

// Code punctuation -- braces, operators, paths.
const CODE = [
  'x = {a: 1};',
  'if (x != y)',
  'foo(bar, baz);',
  'a && b || c',
  'n /= 2;',
  'x <= y ? 1 : 0',
  '#include <t.h>',
  '~/.bashrc',
  's = "ok";',
  'p->next = 0;',
  'i++; j--;',
  '{ "k": [1] }',
];

// Ordinary prose that is mostly punctuation.
const PROSE = [
  "it's --",
  'well, then...',
  'no; not yet.',
  'wait -- what?',
  'Mr. & Mrs. J',
  'yes/no?',
  '50% off!',
  're: your note',
  'A.M. / P.M.',
  '$0.99 + tax',
  '#1 (again!)',
  'a -> b -> c',
  'e-mail: a@b.c',
  'one, two, ...',
  'half-past 2:15',
];

export const FRAGMENT_GROUPS = { QUOTED, PARENS, BRACKETS, CODE, PROSE };

export const FRAGMENTS = [...QUOTED, ...PARENS, ...BRACKETS, ...CODE, ...PROSE];

/* Printable ASCII only, and at least one character that is neither a
   letter, a digit nor a space -- otherwise it is a word, not a
   punctuation fragment, and it does not belong in this game. */
export function isTypeable(frag) {
  const s = String(frag);
  return /^[\x20-\x7E]+$/.test(s) && punctuationCount(s) > 0;
}

export function punctuationCount(frag) {
  return (String(frag).match(/[^A-Za-z0-9 ]/g) || []).length;
}

/* THE SCORING RULE, stated once and shown on the page:
     base   = 10 points per punctuation character + 1 per character
     combo  = +10% per fragment already cleared in this streak
   The first clear of a streak therefore scores exactly its base, which
   is what makes the rule checkable against a hand-computed number. */
export function baseScore(frag) {
  return 10 * punctuationCount(frag) + String(frag).length;
}

export function scoreFor(frag, streakAfterClear) {
  const n = Math.max(1, streakAfterClear | 0);
  return Math.round(baseScore(frag) * (1 + 0.1 * (n - 1)));
}

/* THE STORM. Difficulty is a function of elapsed time only -- not of
   how well you are playing. Two reasons. A player who is clearing fast
   should not be punished for it (Catch-the-Word already does that and
   it feels bad), and a rate that depends on the player's own actions
   cannot be measured by a test without the test's own typing speed
   becoming part of the result. */
export const STORM = {
  SPAWN_START_MS: 1600,
  SPAWN_RAMP_MS_PER_SEC: 55,
  SPAWN_FLOOR_MS: 420,
  FALL_START_PX_S: 55,
  FALL_RAMP_PX_S2: 2.2,
  FALL_MAX_PX_S: 130,
  MAX_ON_SCREEN: 12,
  SHIELDS: 3,
};

export function spawnIntervalMs(elapsedSec) {
  const t = Math.max(0, Number(elapsedSec) || 0);
  return Math.max(STORM.SPAWN_FLOOR_MS, STORM.SPAWN_START_MS - t * STORM.SPAWN_RAMP_MS_PER_SEC);
}

export function fallSpeedPxPerSec(elapsedSec) {
  const t = Math.max(0, Number(elapsedSec) || 0);
  return Math.min(STORM.FALL_MAX_PX_S, STORM.FALL_START_PX_S + t * STORM.FALL_RAMP_PX_S2);
}

/* Pick a fragment, avoiding whatever is already on screen so the player
   never has two identical targets (which would make "type the exact
   text" ambiguous -- and would make the clear-one-remove-one rule
   impossible to state honestly). */
export function pickFragment(excluded = []) {
  const taken = new Set(excluded);
  const free = FRAGMENTS.filter((f) => !taken.has(f));
  const pool = free.length ? free : FRAGMENTS;
  return pool[Math.floor(Math.random() * pool.length)];
}
