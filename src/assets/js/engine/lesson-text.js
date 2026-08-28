/* Lesson text generator. Given a lesson { keys, source } definition and
   a wordlist, produces a typing target restricted to the lesson's keys.

   Adaptive within key set: when a model is provided, EVERY key-set
   lesson is weighted toward the user's weakest *allowed* keys — the
   synthetic drills and the mixed drills as well as the word-list ones.
   Each key is scored directly against the lesson's own set (see
   AdaptiveModel.keyWeights), which is what lets one picker serve a
   two-key drill and a twenty-six-key one. Lessons that opt out
   (`adaptive: false`) stay uniform permanently.

   WHAT A COLD USER SEES. A model with no samples yields flat weights,
   so the draw is uniform — but it is NOT byte-for-byte what these
   lessons produced before, and an earlier version of this comment
   wrongly claimed it was. The fifteen synthetic and mixed lessons are
   in fact identical. The five that reach buildPicker (5, 6, 7, 8, 15)
   differ on 4.9%–44.9% of generations, 6.79% across all key-set
   lessons over 20 x 2000 seeds. The whole difference is consecutive
   duplicate words: the old cold branch was `sampleN`, which had no
   repeat suppression, while the old WARM branch did suppress — so the
   old code only stopped repeating words once you had typing history.
   Cold lesson 5 averaged 0.616 duplicate pairs per 40-word generation;
   it now averages 0. Always suppressing is both the better drill and
   one less discontinuity between cold and warm.

   - 1-3 keys → pure synthetic drill, chars drawn by allowed-set weight.
   - 4+ keys → filter wordlist for words composed only of those letters,
              then weight by allowed-set weakness if a model is given.
              Too few matches → the synthetic filler is weighted too.
   - source: "short" / "long" / "punctuation" / "numbers" → use the named
              wordlist verbatim, no key restriction (and no key set to
              weight within, so these stay uniform).
*/

import { uniformText, buildPicker } from "./wordpicker.js";
import { shuffle, weightedChooser } from "../util/rng.js";

const TARGET_WORDS = 40;

export function lessonText(lesson, wordlist, sourceWordlists = {}, model = null) {
  if (!lesson) return "";
  // Literal lessons render their text verbatim — used for prose
  // excerpts, code samples, and specialized formats. The engine still
  // measures wpm/accuracy normally; it just doesn't pick from a list.
  if (lesson.source === "literal" && lesson.text) {
    return String(lesson.text).trim();
  }
  // Special sources override key-restricted drills
  if (lesson.source === "short") {
    const list = (wordlist || []).filter((w) => w.length >= 2 && w.length <= 4);
    return uniformText(list.length ? list : wordlist || [], TARGET_WORDS);
  }
  if (lesson.source === "long") {
    const list = (wordlist || []).filter((w) => w.length >= 7);
    return uniformText(list.length ? list : wordlist || [], TARGET_WORDS);
  }
  if (lesson.source === "punctuation" && sourceWordlists.punctuation) {
    return uniformText(sourceWordlists.punctuation, 25);
  }
  if (lesson.source === "numbers" && sourceWordlists.numbers) {
    return uniformText(sourceWordlists.numbers, 30);
  }
  if (lesson.adaptive && !lesson.keys) {
    // Pure-adaptive lesson — caller handles via buildPicker(wordlist, model).
    return "";
  }

  const keys = lesson.keys || "";
  if (!keys) return uniformText(wordlist || [], TARGET_WORDS);

  const lower = keys.toLowerCase();
  const set = new Set(Array.from(lower));
  const allowed = Array.from(set);

  // One weighting decision for the whole function: is there a model,
  // and has this lesson opted out? Everything below shares it, so the
  // synthetic, mixed and word-list paths all adapt or all don't.
  const adapt = model && lesson.adaptive !== false;
  const keyMap = adapt ? model.keyWeights(allowed) : null;

  if (allowed.length <= 3) {
    return synthetic(allowed, TARGET_WORDS, keyMap);
  }

  // Filter wordlist to words made entirely of allowed keys.
  const filtered = (wordlist || []).filter((w) => {
    const s = w.toLowerCase();
    if (s.length < 2 || s.length > 9) return false;
    for (const c of s) if (!set.has(c)) return false;
    return true;
  });

  if (filtered.length >= 30) {
    // ADAPTIVE WITHIN KEY SET. `allowed` is what makes the picker rank
    // weakness inside this lesson's keys; without it the picker falls
    // back to its global top-15, which for a restricted lesson is
    // usually empty of in-set keys and so weights nothing at all.
    if (adapt) {
      const picker = buildPicker(filtered, model, { allowed });
      return picker.next(TARGET_WORDS);
    }
    return uniformText(filtered, TARGET_WORDS);
  }
  // Mix filtered words + synthetic groupings. Every filtered word is
  // used once (there are fewer than 30 of them), so the weighting has
  // to land on the synthetic filler — which is the bulk of the drill.
  const need = TARGET_WORDS - filtered.length;
  const syntheticPart = synthetic(allowed, Math.max(8, need), keyMap);
  return shuffle(filtered.concat(syntheticPart.split(" "))).join(" ");
}

/* Random groupings of the lesson's keys. `keyMap` (from
   AdaptiveModel.keyWeights) biases the per-char draw toward the keys
   the user is worst at *within this set*; pass null for uniform.
   normalizeWeights caps the spread at the set size, so a two-key drill
   holds at 2:1 and keeps both keys in play instead of degenerating
   into one letter repeated.

   `?? 1` rather than `|| 1`: a weight is falsy only if it is 0 or NaN,
   and coercing either of those to 1 would silently hand the key the
   MINIMUM weight. normalizeWeights guarantees finite weights >= 1, so
   this is belt-and-braces, but the `||` form is the exact shape of the
   inversion bug fixed in sanitizeWeakness and should not come back. */
function synthetic(keys, n, keyMap = null) {
  const choose = weightedChooser(keys, keys.map((c) => (keyMap ? keyMap.get(c) ?? 1 : 1)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const len = 2 + Math.floor(Math.random() * 4);
    let w = "";
    for (let j = 0; j < len; j++) w += choose();
    out.push(w);
  }
  return out.join(" ");
}

let _lessonsCache = null;
export async function loadLessons() {
  if (_lessonsCache) return _lessonsCache;
  const res = await fetch("/data/lessons.json", { cache: "default" });
  if (!res.ok) throw new Error("Failed to load lessons");
  _lessonsCache = await res.json();
  return _lessonsCache;
}

export async function getLesson(id) {
  const list = await loadLessons();
  const n = parseInt(id, 10);
  return list.find((l) => l.id === n) || null;
}
