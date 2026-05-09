/* Lesson text generator. Given a lesson { keys, source } definition and
   a wordlist, produces a typing target restricted to the lesson's keys.

   Adaptive within key set: when a model is provided, the filtered word
   list is biased toward words containing the user's weakest *allowed*
   keys/bigrams. Cold start (no samples in the model) falls back to
   uniform sampling. Lessons that opt out (`adaptive: false`) keep the
   old uniform behavior.

   - 1-3 keys → pure synthetic drill (random groupings of those letters).
   - 4+ keys → filter wordlist for words composed only of those letters,
              then weight by allowed-set weakness if a model is given.
   - source: "short" / "long" / "punctuation" / "numbers" → use the named
              wordlist verbatim, no key restriction.
*/

import { uniformText, buildPicker } from "./wordpicker.js";
import { shuffle } from "../util/rng.js";

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

  if (allowed.length <= 3) {
    return synthetic(allowed, TARGET_WORDS);
  }

  // Filter wordlist to words made entirely of allowed keys.
  const filtered = (wordlist || []).filter((w) => {
    const s = w.toLowerCase();
    if (s.length < 2 || s.length > 9) return false;
    for (const c of s) if (!set.has(c)) return false;
    return true;
  });

  if (filtered.length >= 30) {
    // ADAPTIVE WITHIN KEY SET. If we have a model with samples, bias
    // toward the lesson's weakest *allowed* keys. The picker only
    // weights chars present in the filtered list, so unused-by-this-
    // lesson weakness can't leak in.
    if (model && lesson.adaptive !== false) {
      const picker = buildPicker(filtered, model);
      return picker.next(TARGET_WORDS);
    }
    return uniformText(filtered, TARGET_WORDS);
  }
  // Mix filtered words + synthetic groupings.
  const need = TARGET_WORDS - filtered.length;
  const syntheticPart = synthetic(allowed, Math.max(8, need));
  return shuffle(filtered.concat(syntheticPart.split(" "))).join(" ");
}

function synthetic(keys, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const len = 2 + Math.floor(Math.random() * 4);
    let w = "";
    for (let j = 0; j < len; j++) w += keys[Math.floor(Math.random() * keys.length)];
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
