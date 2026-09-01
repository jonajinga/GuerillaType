/* Word picker — given a word list and an AdaptiveModel, generates a
   stream of words that bias toward the user's weak chars/bigrams.
   Cold-start (no model data yet) falls back to uniform sampling.

   Two rankings, one picker:
     - no `opts.allowed`  → weakness ranked across the WHOLE keyboard
                            (top-15 chars / top-30 bigrams). This is the
                            whole-keyboard adaptive review, unchanged.
     - `opts.allowed` set → weakness ranked WITHIN that key set, so a
                            lesson over "fj" or "fjdksla;eitn" gets a
                            real signal instead of an empty top-15.
   Same weak() scores underneath either way. */
import { scoreWord, scoreInKeySet } from "./adaptive.js";
import { sampleN, shuffle, weightedChooser } from "../util/rng.js";

const POOL_SIZE = 500;

export function buildPicker(words, model, opts = {}) {
  if (opts.allowed) return keySetPicker(words, model, opts.allowed);
  const weakChars = model.weakChars(15);
  const weakBigrams = model.weakBigrams(30);
  const weakMap = new Map(weakChars);
  const weakBgMap = new Map(weakBigrams);
  const cold = weakMap.size === 0;

  if (cold) {
    return {
      cold: true,
      next(n) { return sampleN(words, n).join(" "); }
    };
  }

  const scored = [];
  for (const w of words) {
    const s = scoreWord(w, weakMap, weakBgMap);
    if (s > 0) scored.push([w, s]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  const pool = scored.slice(0, POOL_SIZE);
  const total = pool.reduce((s, [, v]) => s + v, 0);

  function pickOne() {
    if (!pool.length) return words[Math.floor(Math.random() * words.length)];
    let r = Math.random() * total;
    for (const [w, s] of pool) {
      r -= s;
      if (r <= 0) return w;
    }
    return pool[0][0];
  }

  return {
    cold: false,
    weakChars, weakBigrams,
    next(n) {
      const out = [];
      let last = "";
      for (let i = 0; i < n; i++) {
        let w = pickOne();
        // Avoid two-in-a-row repeats.
        let tries = 0;
        while (w === last && tries < 4) { w = pickOne(); tries++; }
        out.push(w);
        last = w;
      }
      return out.join(" ");
    }
  };
}

/* Weighted picker over a list already restricted to one lesson's keys.
   No POOL_SIZE truncation here: every weight is >= 1 so no word is
   ever starved, and dropping the "cleanest" tail would quietly shrink
   the lesson's own key coverage — the opposite of the point. */
function keySetPicker(words, model, allowed) {
  const list = words || [];
  const keyMap = model.keyWeights(allowed);
  const bgMap = model.bigramWeights(allowed);
  const flat = !hasSpread(keyMap) && !hasSpread(bgMap);
  // flat === no usable in-set signal yet. All-1 weights make the
  // weighted draw identical to a uniform one, so there is no separate
  // cold branch to keep in sync — only an honest `cold` flag.
  const weights = list.map((w) => (flat ? 1 : scoreInKeySet(w, keyMap, bgMap)));
  const pickOne = weightedChooser(list, weights);

  return {
    cold: flat,
    keyWeights: keyMap,
    next(n) {
      const out = [];
      let last = "";
      for (let i = 0; i < n; i++) {
        let w = pickOne();
        // Avoid two-in-a-row repeats.
        let tries = 0;
        while (w === last && tries < 4) { w = pickOne(); tries++; }
        out.push(w);
        last = w;
      }
      return out.join(" ");
    }
  };
}

function hasSpread(map) {
  for (const v of map.values()) if (v > 1 + 1e-9) return true;
  return false;
}

/* Drill text: every word at least once, then extra repetitions weighted
   toward the weakest material IN THIS DRILL.

   A drill is not a lesson. Its word set IS the curriculum -- the
   character inventory was chosen deliberately -- so coverage is not
   negotiable, and both obvious approaches get that wrong.

   buildPicker draws with replacement, so it simply misses part of the
   set. And its whole-keyboard ranking is the wrong ranking: it scores
   against the user's global top-15 weak chars, which for a restricted
   drill usually contains none of the drill's own keys. What survives
   then is scoreWord's 0.05-per-character length term, so the draw is
   biased by word LENGTH and carries no signal about the drill at all.

   So: shuffle the full list for coverage, then top up to `target` with
   draws weighted inside the drill's own key set, where every weight is
   >= 1 and no word is ever starved. 69 of the 71 bundled drills hold
   fewer than 40 words, so today every one of them shows each word
   exactly once -- which leaves adaptation nothing to do unless the
   session gets longer. The extra reps are the adaptation.

   Returns null when there is no in-set signal yet, and the caller keeps
   the old uniform behaviour. That matters: lengthening a drill buys a
   beginner nothing, so a drill only grows once the model has something
   to say about it. */
export function drillText(words, model, allowed, target) {
  const list = (words || []).filter(Boolean);
  if (!list.length) return null;

  const keyMap = model.keyWeights(allowed);
  const bgMap = model.bigramWeights(allowed);
  if (!hasSpread(keyMap) && !hasSpread(bgMap)) return null;

  const covered = shuffle(list).slice(0, target);
  const need = Math.max(0, target - covered.length);
  if (!need) return covered.join(" ");

  const weights = list.map((w) => scoreInKeySet(w, keyMap, bgMap));
  const pickOne = weightedChooser(list, weights);

  /* Cap repetitions per word. Unbounded weighting let one word take
     more than half the slots, which makes back-to-back repeats
     arithmetically unavoidable and turns the drill into a stutter. At a
     quarter of the session no word can ever force an adjacency, and the
     weighting still has plenty of room to express itself. */
  const maxPer = Math.max(2, Math.ceil(target / 4));
  const count = new Map(covered.map((w) => [w, (0)]));
  for (const w of covered) count.set(w, (count.get(w) || 0) + 1);
  const reps = [];
  for (let i = 0; i < need; i++) {
    let w = pickOne(), tries = 0;
    while ((count.get(w) || 0) >= maxPer && tries < 12) { w = pickOne(); tries++; }
    if ((count.get(w) || 0) >= maxPer) {
      // Weighted draw kept landing on words already at the cap; take
      // any word still under it rather than exceeding it.
      const room = list.filter((x) => (count.get(x) || 0) < maxPer);
      if (!room.length) break;
      w = room[Math.floor(Math.random() * room.length)];
    }
    count.set(w, (count.get(w) || 0) + 1);
    reps.push(w);
  }
  const bag = shuffle(covered.concat(reps));

  /* Lay them out with no adjacent duplicates. Emitting coverage first
     and the reps after would front-load the unique words and leave a
     tail of repeats, which reads as a stutter rather than practice.

     Always take the word with the most copies LEFT that is not the one
     just emitted. Greedily taking any different word is not enough: it
     happily spends the scarce words early and strands the last two
     copies of a frequent one side by side, which is what it did in
     roughly one run in ten. Draining the most common first guarantees
     no adjacency whenever no word holds more than half the slots, and
     maxPer caps it at a quarter. */
  const remaining = new Map();
  for (const w of bag) remaining.set(w, (remaining.get(w) || 0) + 1);

  const out = [];
  let last = "";
  for (let k = 0; k < bag.length; k++) {
    let best = null, bestN = 0;
    for (const [w, n] of remaining) {
      if (n <= 0 || w === last) continue;
      if (n > bestN) { best = w; bestN = n; }
    }
    if (best === null) break;      // only `last` is left; stop rather than stutter
    out.push(best);
    remaining.set(best, bestN - 1);
    last = best;
  }
  return out.join(" ");
}

export function uniformText(words, n) {
  return shuffle(words).slice(0, n).join(" ");
}
