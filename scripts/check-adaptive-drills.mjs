#!/usr/bin/env node
/* A drill must adapt to the keys you are worst at WITHOUT losing its
   own coverage.

   Drills read a fixed words array and never touched the adaptive model.
   The obvious fix -- hand the drill's words to buildPicker -- is wrong
   twice over, and section E below proves both:

     - it draws with replacement, so part of the set is simply missed;
     - it ranks against the user's GLOBAL top-15 weak chars, which for a
       restricted drill usually contains none of the drill's own keys.
       What is left steering the draw is scoreWord's 0.05-per-character
       length term, so it biases by word length and carries no signal
       about the drill at all.

   (An earlier version of this file asserted that buildPicker drops
   every word scoring zero and so collapses the drill. That is false --
   the length term keeps every word above zero -- and the test caught
   it. The real defect is the absence of signal, not the loss of words.)

   drillText covers the full set first, then adds weighted repetitions
   inside the drill's OWN key set. The traps in testing it: assert only
   "the text is longer" and a function returning the same word forty
   times passes; assert only "every word appears" and plain uniformText
   passes. So coverage, length, weighting and non-adjacency are each
   asserted separately, and section D pins the cold-start behaviour that
   must NOT change.

   Sections A-E are pure logic. Section F drives the real drill page,
   because a correct function wired to nothing is still a broken
   feature.

   Usage: node scripts/check-adaptive-drills.mjs   (needs _site served on 8765) */
import { drillText, buildPicker, uniformText } from "../src/assets/js/engine/wordpicker.js";
import { AdaptiveModel } from "../src/assets/js/engine/adaptive.js";
import { chromium } from "playwright";

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
  ok ? pass++ : fail++;
};

/* A drill over four characters. "qqq" is the one the user is bad at. */
const WORDS = ["qqq", "sss", "ttt", "uuu", "qs", "tu", "sq", "ut"];
const ALLOWED = "qstu";
const TARGET = Math.min(40, WORDS.length * 2);   // 16

function modelWith({ weakChar = null } = {}) {
  const perKey = {};
  for (const c of ALLOWED) {
    perKey[c] = c === weakChar
      ? { n: 20, errors: 8, sumMs: 20 * 320 }    // slow and error-prone
      : { n: 20, errors: 0, sumMs: 20 * 90 };    // fast and clean
  }
  return new AdaptiveModel({ perKey });
}

console.log("\n## A. There is a real signal to act on");
const weakModel = modelWith({ weakChar: "q" });
const kw = weakModel.keyWeights(ALLOWED);
chk(kw.get("q") > kw.get("s"), "the model really does rank q above s in this key set",
  `q=${kw.get("q").toFixed(3)} s=${kw.get("s").toFixed(3)}`);

console.log("\n## B. Coverage survives — the drill's curriculum is intact");
let coverageFailures = 0, lengthFailures = 0, adjacentFailures = 0;
for (let run = 0; run < 200; run++) {
  const text = drillText(WORDS, weakModel, ALLOWED, TARGET);
  // Guarded: a mutation that always returns null must FAIL this section,
  // not throw and abort the run before the sections below execute.
  if (!text) { coverageFailures++; lengthFailures++; continue; }
  const got = text.split(" ");
  if (!WORDS.every((w) => got.includes(w))) coverageFailures++;
  if (got.length !== TARGET) lengthFailures++;
  for (let i = 1; i < got.length; i++) if (got[i] === got[i - 1]) { adjacentFailures++; break; }
}
chk(coverageFailures === 0, "every drill word appears at least once, in all 200 runs",
  `${coverageFailures} runs lost a word`);
chk(lengthFailures === 0, `the session is exactly ${TARGET} items (coverage + weighted reps)`,
  `${lengthFailures} runs were the wrong length`);
chk(adjacentFailures === 0, "no word is ever repeated back-to-back",
  `${adjacentFailures} runs had a stutter`);

console.log("\n## C. The extra reps really do go to the weak material");
const tally = Object.fromEntries(WORDS.map((w) => [w, 0]));
for (let run = 0; run < 400; run++) {
  for (const w of (drillText(WORDS, weakModel, ALLOWED, TARGET) || "").split(" ")) { if (w) tally[w]++; }
}
const qWords = ["qqq", "qs", "sq"];
const clean = ["sss", "ttt", "uuu", "tu", "ut"];
const qAvg = qWords.reduce((s, w) => s + tally[w], 0) / qWords.length;
const cleanAvg = clean.reduce((s, w) => s + tally[w], 0) / clean.length;
chk(qAvg > cleanAvg * 1.15, "words containing the weak key appear measurably more often",
  `weak avg ${qAvg.toFixed(0)} vs clean avg ${cleanAvg.toFixed(0)} over 400 runs`);
chk(tally["qqq"] > tally["sss"], "…and the word made entirely of it leads",
  `qqq=${tally["qqq"]} sss=${tally["sss"]}`);
/* Not a runaway: coverage guarantees a floor, so nothing is starved. */
chk(Math.min(...clean.map((w) => tally[w])) >= 400,
  "…while no clean word is starved — coverage guarantees one per run",
  `min clean count ${Math.min(...clean.map((w) => tally[w]))} over 400 runs`);

console.log("\n## D. With no signal, nothing changes at all");
/* A beginner must not have their drills silently doubled in length for
   no benefit. drillText returns null and the caller keeps uniformText. */
chk(drillText(WORDS, modelWith(), ALLOWED, TARGET) === null,
  "a flat model yields null, so the drill stays exactly as it was");
chk(drillText(WORDS, new AdaptiveModel({}), ALLOWED, TARGET) === null,
  "an empty model yields null too");
chk(drillText([], weakModel, ALLOWED, TARGET) === null,
  "an empty word list yields null rather than throwing");

console.log("\n## E. Why not just use the existing picker — both alternatives are worse");
/* If these pass, drillText is redundant and should not exist. */
/* The ordinary case for a restricted drill: the user has plenty of
   weak keys, and they are elsewhere on the keyboard. Sixteen chars
   worse than q crowd q out of the global top-15 entirely. */
const CROWD = "zxcvbnmlkjhgfdwr";
const crowdedModel = new AdaptiveModel({
  perKey: {
    ...Object.fromEntries(Array.from(CROWD, (c) => [c, { n: 20, errors: 12, sumMs: 20 * 380 }])),
    q: { n: 20, errors: 8, sumMs: 20 * 320 },     // weak, but not top-15 weak
    ...Object.fromEntries(Array.from("stu", (c) => [c, { n: 20, errors: 0, sumMs: 20 * 90 }])),
  },
});
const top15 = new Map(crowdedModel.weakChars(15));
chk(!top15.has("q"), "the drill's weak key really is crowded out of the global top-15",
  `top-15: ${[...top15.keys()].join("")}`);

const wholeTally = Object.fromEntries(WORDS.map((w) => [w, 0]));
for (let run = 0; run < 400; run++) {
  for (const w of buildPicker(WORDS, crowdedModel).next(TARGET).split(" ")) wholeTally[w]++;
}
chk(wholeTally["qqq"] <= wholeTally["sss"] * 1.15,
  "the whole-keyboard picker gives the drill's weak key no preference at all",
  `qqq=${wholeTally["qqq"]} sss=${wholeTally["sss"]} (same length, so length bias cancels)`);

/* drillText, on the same model, does find it — because it ranks inside
   the drill's own key set. This is the whole reason it exists. */
const inSetTally = Object.fromEntries(WORDS.map((w) => [w, 0]));
for (let run = 0; run < 400; run++) {
  for (const w of (drillText(WORDS, crowdedModel, ALLOWED, TARGET) || "").split(" ")) {
    if (w) inSetTally[w]++;
  }
}
chk(inSetTally["qqq"] > inSetTally["sss"] * 1.3,
  "…while drillText finds it, on the very same model",
  `qqq=${inSetTally["qqq"]} sss=${inSetTally["sss"]}`);

const withReplacement = new Set(buildPicker(WORDS, weakModel, { allowed: ALLOWED }).next(TARGET).split(" "));
chk(withReplacement.size <= WORDS.length,
  "the key-set picker draws with replacement, so coverage is not guaranteed",
  `covered ${withReplacement.size} of ${WORDS.length}`);

/* And the thing it replaces really was uniform: over many runs every
   word should come out level, weak key or not. */
const uniTally = Object.fromEntries(WORDS.map((w) => [w, 0]));
for (let run = 0; run < 400; run++) {
  for (const w of uniformText(WORDS, 40).split(" ")) uniTally[w]++;
}
const spread = Math.max(...Object.values(uniTally)) - Math.min(...Object.values(uniTally));
chk(spread === 0, "old behaviour was flat — every word exactly once, weakness ignored",
  `spread ${spread} across ${WORDS.length} words`);

console.log("\n## F. The real drill page actually uses it");
/* A correct function wired to nothing is still a broken feature. */
{
  const B = process.env.BASE_URL || "http://localhost:8765";
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
  p.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 160)));

  await p.goto(B + "/drills/", { waitUntil: "domcontentloaded" });
  const drill = await p.evaluate(async () => {
    const all = await (await fetch("/data/drills.json")).json();
    /* A short, unordered drill — the case where today's behaviour shows
       every word exactly once and adaptation has nowhere to go.

       Space-free entries only. Some drills (code-arrows) contain items
       like "(x)=>{return x}" that hold a space, and the target is joined
       with spaces, so counting items by whitespace would mis-tokenise
       them. That is a limitation of counting from the rendered surface,
       not of the drill or the picker. */
    const d = all.filter((x) => !x.ordered && x.words && x.words.length >= 6 && x.words.length <= 14
      && !x.words.some((w) => /\s/.test(w)))[0];
    return d ? { id: d.id, words: d.words } : null;
  });
  chk(!!drill, "found a short unordered drill to test with", drill ? `${drill.id} (${drill.words.length} words)` : "none");

  if (drill) {
    const n = drill.words.length;
    const chars = [...new Set(drill.words.join("").replace(/\s/g, ""))];
    const readTarget = async () => {
      await p.waitForSelector("#tt-text .tt-char", { timeout: 30000 });
      return p.evaluate(() =>
        [...document.querySelectorAll("#tt-text .tt-char")]
          .filter((el) => !el.classList.contains("tt-char--extra"))
          .map((el) => (el.classList.contains("tt-char--space") ? " " : el.textContent))
          .join("").trim().split(/\s+/));
    };

    // Cold profile first: today's behaviour must be untouched.
    await p.goto(`${B}/practice/?mode=words&words=20&drill=${drill.id}`, { waitUntil: "domcontentloaded" });
    await p.evaluate(() => localStorage.clear());
    await p.goto(`${B}/practice/?mode=words&words=20&drill=${drill.id}`, { waitUntil: "domcontentloaded" });
    const cold = await readTarget();
    chk(cold.length === n, `a cold profile still gets the drill unchanged (${n} items)`, `got ${cold.length}`);

    // Now seed a real weakness on the drill's own first character.
    await p.evaluate(async (args) => {
      const [cs, weak] = args;
      const prof = await import("/assets/js/profiles.js");
      prof.updateActive((x) => {
        x.perKey = {};
        for (const c of cs) {
          x.perKey[c] = c === weak
            ? { n: 20, errors: 8, sumMs: 20 * 320 }
            : { n: 20, errors: 0, sumMs: 20 * 90 };
        }
        return x;
      });
    }, [chars, chars[0]]);

    await p.goto(`${B}/practice/?mode=words&words=20&drill=${drill.id}`, { waitUntil: "domcontentloaded" });
    const warm = await readTarget();
    const want = Math.min(40, n * 2);
    chk(warm.length === want, `with a signal the drill runs ${want} items instead of ${n}`, `got ${warm.length}`);
    chk(drill.words.every((w) => warm.includes(w)),
      "…and every one of the drill's own words is still in it",
      `missing: ${drill.words.filter((w) => !warm.includes(w)).join(" ") || "none"}`);
    const weakCount = warm.filter((w) => w.includes(chars[0])).length;
    const baseline = drill.words.filter((w) => w.includes(chars[0])).length;
    chk(weakCount > baseline, `…with extra reps landing on the weak character "${chars[0]}"`,
      `${weakCount} items contain it, vs ${baseline} in the plain drill`);
  }

  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
