/* Practice page bootstrap. Wires the typing-engine, mode bar, results
   card, and adaptive engine. Reads ?mode= ?duration= ?words= ?quote=
   from the URL on load to support deep links from the homepage. */

import { TypingEngine } from "../engine/typing-engine.js";
import { AdaptiveModel } from "../engine/adaptive.js";
import { buildPicker, uniformText } from "../engine/wordpicker.js";
import { recordSession } from "../engine/session-recorder.js";
import { setSegProgress, getSaved as getSavedCustom, listSaved as listSavedCustom, getSegments as getCustomSegments } from "../engine/custom-text.js";
import { byId as achievementById } from "../engine/achievements.js";
import { fingerForKey } from "../engine/layouts.js";
import { bookStructureSig } from "../engine/book-structure.js";
import { setSoundPrefs, playKey, playMistake, playFinish } from "../engine/sounds.js";
import { getActive, updateActive } from "../profiles.js";
import { loadQuotes, pickQuote, dailyQuote } from "../engine/quotes.js";
import { getLesson, lessonText } from "../engine/lesson-text.js";
import { buildSourceText, evaluateGoal } from "../engine/challenge-runner.js";
import { mountLiveKeyboard, showLiveKeyboard, highlightChar } from "../viz/live-keyboard.js";
import { mountLiveTicker, showLiveTicker, recordKeystroke, resetTicker, updateWpm as updateTickerWpm } from "../viz/live-ticker.js";
import { mountVirtualKeyboard, unmountVirtualKeyboard, highlightNextKey as vkbdNext } from "../engine/virtual-keyboard.js";
import { Analytics } from "../analytics.js";

/* Inlined bucket helpers. These also live in analytics.js as named
   exports, but importing them from there would tie practice-boot
   to a specific version of analytics.js -- and browsers heavily
   cache /assets/js/analytics.js (1-year immutable, set on a prior
   deploy). The stale cached analytics.js doesn't export these,
   which kills the whole import chain and leaves the page stuck on
   "Loading...". Defining them locally severs that dependency. */
function _wpmBucket(wpm) {
  const v = Math.max(0, Math.round(wpm || 0));
  if (v < 10) return "0-10";
  if (v < 20) return "10-20";
  if (v < 30) return "20-30";
  if (v < 40) return "30-40";
  if (v < 50) return "40-50";
  if (v < 60) return "50-60";
  if (v < 70) return "60-70";
  if (v < 80) return "70-80";
  if (v < 90) return "80-90";
  if (v < 100) return "90-100";
  if (v < 120) return "100-120";
  if (v < 140) return "120-140";
  if (v < 150) return "140-150";
  return "150+";
}
function _accBucket(acc) {
  const v = Math.max(0, Math.round(acc || 0));
  if (v < 80) return "<80";
  if (v < 85) return "80-85";
  if (v < 90) return "85-90";
  if (v < 92) return "90-92";
  if (v < 94) return "92-94";
  if (v < 95) return "94-95";
  if (v < 96) return "95-96";
  if (v < 97) return "96-97";
  if (v < 98) return "97-98";
  if (v < 99) return "98-99";
  return "99-100";
}
function _practiceVolumeBucket(sessions) {
  const v = Math.max(0, Math.round(sessions || 0));
  if (v < 6) return "1-5";
  if (v < 11) return "5-10";
  if (v < 26) return "10-25";
  if (v < 51) return "25-50";
  if (v < 101) return "50-100";
  if (v < 201) return "100-200";
  if (v < 501) return "200-500";
  if (v < 1001) return "500-1000";
  return "1000+";
}
import { $, htmlEscape, toast } from "../util/dom.js";

let _challengesCache = null;
async function loadChallenges() {
  if (_challengesCache) return _challengesCache;
  const res = await fetch("/data/challenges.json", { cache: "default" });
  _challengesCache = await res.json();
  return _challengesCache;
}

const stage = $("#tt-stage");
const inputEl = $("#tt-input");
const textEl = $("#tt-text");
const liveEl = $("#tt-live");
const hintEl = $("#tt-hint");
const timerFill = document.getElementById("tt-progress-fill") || $("#tt-timer-fill");
const resultsEl = $("#tt-results");

// Guard: if any required element is missing, the practice surface
// isn't on this page. Bail out cleanly instead of crashing.
if (!stage || !inputEl || !textEl || !hintEl || !resultsEl) {
  console.warn("[practice-boot] required elements missing; bailing.");
  // Stop module evaluation. Re-export nothing so callers get a no-op.
  // eslint-disable-next-line no-throw-literal
  throw new Error("__practice_boot_no_surface__");
}

const params = new URLSearchParams(location.search);
const profile = getActive();
const settings = profile.settings;

const prefs = profile.preferences || {};
// Apply body classes for prefs that hide chrome -- CSS does the work.
// Hide UI implies hiding the toolbar (it's the broader option).
document.body.classList.toggle("is-hide-toolbar", !!(prefs.hideToolbar || prefs.hideUI));
document.body.classList.toggle("is-hide-ui", !!prefs.hideUI);
const bookSlug = params.get("book") || null;
const bookCh = params.get("ch") != null ? parseInt(params.get("ch"), 10) : null;
const bookParaId = params.get("p") || null;
const bookPage = params.get("page") != null ? parseInt(params.get("page"), 10) : null;
const PARAS_PER_PAGE = 6;
const state = {
  mode: params.get("mode") || "time",
  duration: parseInt(params.get("duration") || "30", 10),
  words: parseInt(params.get("words") || "25", 10),
  quote: params.get("quote") || "medium",
  quoteTag: params.get("tag") || "",
  language: params.get("lang") || settings.language || "en-1k",
  layout: settings.layout || "qwerty",
  // stopOnError preference overrides freedom: when on, freedom is false
  // (cursor refuses to advance until you hit the right key).
  freedom: prefs.stopOnError ? false : settings.freedom !== false,
  spaceSkipsWords: !!prefs.spaceSkipsWords,
  forgiveErrors: !!prefs.forgiveErrors,
  ignoreCapitalization: !!prefs.ignoreCapitalization,
  skipPunctuation: !!prefs.skipPunctuation,
  customId: params.get("custom") || null,
  customSeg: parseInt(params.get("seg") || "0", 10),
  bookSlug, bookCh, bookParaId, bookPage,
  lessonId: params.get("lesson") ? parseInt(params.get("lesson"), 10) : null,
  drillId: params.get("drill") || null,
};
// If a lesson was requested, override mode to "lesson" so the runner knows.
if (state.lessonId) state.mode = "lesson";
if (state.drillId) state.mode = "drill";
if (state.bookSlug) state.mode = "book";

// "Corpus" modes have an attribution card above the typing surface
// (idiom title + meaning, quote source, book chapter, etc.). They
// shouldn't get the big top-padding push that plain word modes use
// when chrome is hidden -- the card already takes up that space.
const CORPUS_MODES = new Set(["idiom", "quote", "parable", "poem", "book", "custom", "lesson", "drill", "fable"]);
document.body.classList.toggle("is-corpus-mode", CORPUS_MODES.has(state.mode));

const challengeId = params.get("challenge");
let activeChallenge = null;

const wordlistCache = {};
async function loadWordlist(id) {
  // Special case: the "missed" list is sourced from the user's own
  // profile.missedWords map -- words they've typed wrong recently,
  // weighted by miss count and recency so the words they're worst at
  // appear most often. Cold-start (no missed words yet) falls back to
  // the static missed.json which has a sane mix of common words.
  if (id === "missed") {
    const fresh = readMissedWordsFromProfile();
    if (fresh && fresh.length >= 12) return fresh;
    // Fall through to fetch the bootstrap fallback.
  }
  if (wordlistCache[id]) return wordlistCache[id];
  const res = await fetch(`/data/words/${id}.json`, { cache: "default" });
  if (!res.ok) throw new Error(`Failed to load wordlist ${id}`);
  const list = await res.json();
  wordlistCache[id] = list;
  return list;
}

/* Read the active profile's missedWords map and return a flat array
   of words sorted by recency-weighted miss score. The result is
   skewed toward the worst offenders -- each word appears in the list
   N times proportional to its score, so uniform sampling from this
   list naturally biases practice toward your weak spots. */
function readMissedWordsFromProfile() {
  try {
    const p = profile;
    const map = p && p.missedWords;
    if (!map) return null;
    const now = Date.now();
    const halfLifeMs = 14 * 24 * 60 * 60 * 1000;
    const scored = Object.entries(map).map(([word, entry]) => {
      const ageMs = Math.max(0, now - (entry.last || 0));
      const decay = Math.pow(0.5, ageMs / halfLifeMs);
      return [word, (entry.n || 0) * decay];
    }).filter(([w, s]) => w && s > 0.05);
    if (!scored.length) return null;
    // Build a weighted bag: each word repeats `round(score * 4)` times
    // (capped 1-12 per word). Uniform sampling from the bag then
    // approximates proportional sampling.
    const bag = [];
    for (const [w, s] of scored) {
      const reps = Math.max(1, Math.min(12, Math.round(s * 4)));
      for (let i = 0; i < reps; i++) bag.push(w);
    }
    return bag;
  } catch {
    return null;
  }
}

const model = new AdaptiveModel(profile, { layout: state.layout });

let engine = null;

async function buildText() {
  // Clear stale per-source metadata before resolving a fresh target.
  // _customMeta + _customTitle are only repopulated inside the
  // corpus-mode branches (quote/custom/idiom/parable/poem/book);
  // without this reset, switching from a corpus mode to a plain
  // mode (time/words/zen/adaptive) would carry the previous
  // attribution title forward and renderAttributionHeader would
  // keep showing it. Same for the book-specific page metadata.
  state._customMeta = null;
  state._customTitle = null;
  state._pageParaIds = null;
  state._pageParaEnds = null;
  state._totalPages = null;
  state._bookTitle = null;
  state._bookAuthor = null;

  // Resolve the challenge first — it overrides mode + source.
  if (challengeId && !activeChallenge) {
    const all = await loadChallenges();
    activeChallenge = all.find((c) => c.id === challengeId) || null;
    if (activeChallenge) {
      state.mode = activeChallenge.mode || state.mode;
      if (activeChallenge.durationSec) state.duration = activeChallenge.durationSec;
      if (activeChallenge.words) state.words = activeChallenge.words;
    }
  }
  if (activeChallenge) {
    const wordlist = await loadWordlist(activeChallenge.source && activeChallenge.source.id ? activeChallenge.source.id : "en-1k");
    let pangrams, numbers;
    try {
      if (activeChallenge.source.type === "pangrams") pangrams = await (await fetch("/data/pangrams.json")).json();
    } catch {}
    try {
      if (activeChallenge.source.type === "numbers") numbers = await loadWordlist("numbers");
    } catch {}
    return buildSourceText(activeChallenge.source, { wordlist, pangrams, numbers });
  }
  if (state.mode === "quote") {
    const all = await loadQuotes();
    let q;
    if (params.get("qid")) {
      q = all.find((x) => x.id === params.get("qid"));
    } else if (params.get("collection")) {
      const { getCollection, getActiveIndex, advanceActiveIndex, setActiveCollection } = await import("../engine/collections.js");
      const collId = params.get("collection");
      // Activate the collection if it's not already active.
      const cur = (function(){ try { return JSON.parse(localStorage.getItem("tt:active-collection") || "null"); } catch { return null; } })();
      if (cur !== collId) setActiveCollection(collId);
      const c = getCollection(collId);
      if (c && c.ids.length) {
        const idx = getActiveIndex();
        const qid = c.ids[idx % c.ids.length];
        q = all.find((x) => x.id === qid);
        // Pre-advance for next session.
        advanceActiveIndex();
      }
    } else {
      // Non-daily quote mode (length bucket / tag): re-pick on every
      // restart and ALSO skip the previously-served quote so Next
      // test reliably produces a different one. pickQuote already
      // accepts an exclude-id arg; we feed it state._lastCorpusId.quote.
      const lastId = (state._lastCorpusId && state._lastCorpusId.quote) || null;
      q = state.quote === "daily"
        ? dailyQuote(all)
        : pickQuote(all, state.quote, state.quoteTag || "", lastId);
    }
    // Fallback: if no quote resolved (qid not found, daily empty,
    // pickQuote miss), grab any quote from the corpus.
    if (!q && all.length) {
      const lastId = state._lastCorpusId && state._lastCorpusId.quote;
      const pool = all.length > 1 && lastId ? all.filter((x) => x.id !== lastId) : all;
      q = pool[Math.floor(Math.random() * pool.length)];
    }
    // Remember which quote we just served so the next pick can
    // explicitly skip it.
    if (q && q.id) {
      state._lastCorpusId = state._lastCorpusId || {};
      state._lastCorpusId.quote = q.id;
    }
    if (q) {
      // Stash meta so the attribution header can render — author,
      // year, source/work as available from the quote record. The
      // sourceId is required to record corpus-item completion when
      // the session finishes cleanly.
      state._customMeta = {
        kind: "quote",
        sourceId: q.id || null,
        author: q.author || null,
        year: q.year || null,
        source: q.source || null,
      };
    }
    return q ? q.text : "the quick brown fox jumps over the lazy dog";
  }
  // Random idiom / poem modes -- pick from the public-domain
  // corpus and surface as a typing session with attribution.
  // pickFresh excludes the previously-shown item (state._lastCorpusId)
  // when the pool has more than one entry, so "Next test" actually
  // shows a different one instead of a repeat by Math.random() coincidence.
  /* Convert a multi-line poem source string into an array of
     non-empty lines. Empty lines (stanza breaks) collapse to a
     single visual gap in the rendered output, NOT extra blank
     paragraphs the engine would try to make the user type. Lines
     are trimmed of trailing whitespace but leading indentation is
     preserved -- many poems indent every other line (Keats, Frost)
     and that visual indent is part of the intended formatting. */
  function poemToLines(text) {
    if (!text) return [];
    const lines = String(text)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.replace(/[ \t]+$/, ""));
    // Drop pure-whitespace lines so the renderer doesn't try to
    // make the user type them. A blank line in the source becomes
    // a stanza break carried via the previous line's trailing
    // visual gap; preserved indentation handles the rest.
    const out = [];
    let prevWasBlank = false;
    for (const l of lines) {
      if (!l.trim()) {
        // Mark the previous line as "stanza-end" so the renderer
        // can add a bigger margin after it. We piggy-back this on
        // a trailing marker -- but for now, just collapse blanks.
        prevWasBlank = true;
        continue;
      }
      // Tag stanza-start lines with a non-breaking marker that the
      // renderer strips when displaying. Simpler approach: just
      // emit the line. Stanza breaks remain implicit (one extra
      // empty line between paragraph blocks isn't a visual win,
      // but at least line breaks within stanzas are correct).
      out.push(l);
      prevWasBlank = false;
    }
    return out;
  }

  function pickFresh(all, kind) {
    if (!all || !all.length) return null;
    const lastId = state._lastCorpusId && state._lastCorpusId[kind];
    const pool = (all.length > 1 && lastId)
      ? all.filter((x) => x.id !== lastId)
      : all;
    const item = pool[Math.floor(Math.random() * pool.length)];
    if (item && item.id) {
      state._lastCorpusId = state._lastCorpusId || {};
      state._lastCorpusId[kind] = item.id;
    }
    return item;
  }
  if (state.mode === "idiom") {
    try {
      const res = await fetch("/data/idioms.json", { cache: "default" });
      const all = await res.json();
      const item = pickFresh(all, "idiom");
      if (item) {
        state._customMeta = {
          kind: "idiom",
          sourceId: item.id || null,
          // No "source" field for idioms -- the renderer would
          // print "from <source>" which doesn't make sense for an
          // idiom. The meaning shows below via the meaning slot.
          meaning: item.meaning || null,
        };
        state._customTitle = item.text;
        return item.text;
      }
    } catch {}
    return "the early bird catches the worm";
  }
  if (state.mode === "poem") {
    try {
      const res = await fetch("/data/poetry.json", { cache: "default" });
      const all = await res.json();
      const item = pickFresh(all, "poem");
      if (item) {
        state._customMeta = {
          kind: "poem",
          sourceId: item.id || null,
          author: item.author || null,
          year: item.year || null,
          source: item.source || null,
        };
        state._customTitle = item.title;
        // Preserve intended line / stanza formatting. Source poems
        // carry newlines that mark line breaks and double-newlines
        // that mark stanza breaks. Splitting the text into an array
        // of lines lets the renderer render each line as its own
        // paragraph block -- visual line breaks land in the right
        // places and the user types a space between lines (same
        // mechanic as inter-paragraph spaces in book mode).
        return poemToLines(item.text);
      }
    } catch {}
    return "Hope is the thing with feathers";
  }
  if (state.mode === "custom") {
    // The bodies live in IndexedDB now (custom-store.js) -- reading
    // localStorage directly here would see the index record only and
    // report every imported book as empty.
    const item = getSavedCustom(state.customId) || listSavedCustom()[0];
    if (!item) return "Add a custom text on the /custom/ page first.";
    const segments = await getCustomSegments(item.id);
    if (!segments.length) return "That text could not be read back from this browser's storage. Re-import it on the /custom/ page.";
    // Stash meta + title so renderAttributionHeader can paint
    // author/year/source above the typing surface.
    state._customTitle = item.title;
    state._customMeta = item.meta || null;
    // Corpus content (quote / idiom / parable / poem) was stored
    // through the same chunk() pipeline as user-uploaded text, but
    // these are short pieces meant to be typed in full. Concatenate
    // every segment back into one continuous target so the user
    // sees the WHOLE parable / quote / poem on the typing surface.
    const corpusKinds = ["quote","idiom","parable","poem"];
    if (item.meta && corpusKinds.indexOf(item.meta.kind) !== -1) {
      const body = segments.join(" ").trim();
      // Poems: preserve line/stanza formatting by passing an array
      // of lines instead of one flat string. Each line becomes its
      // own paragraph block in the renderer.
      if (item.meta.kind === "poem") {
        const lines = poemToLines(body);
        if (lines.length > 1) return lines;
        return body;
      }
      // Parables: when a moral exists, render it as its own paragraph
      // (centered, italic) at the end of the body. The renderer
      // accepts an array of paragraph strings; the engine joins them
      // with spaces in the typing target so the user types through
      // both. The visual paragraph break + centering comes from CSS.
      if (item.meta.kind === "parable" && item.meta.moral) {
        return [body, String(item.meta.moral).trim()];
      }
      return body;
    }
    // Remember the shape of this text so the results screen can offer
    // "Next segment" and show progress. Without these, a 481-segment
    // import was navigable only by hand-editing ?seg= in the URL.
    state._customSegCount = segments.length;
    state._customLastSeg = segments.length - 1;
    const idx = Math.min(Math.max(0, state.customSeg), segments.length - 1);
    state.customSeg = idx;
    return segments[idx];
  }
  if (state.mode === "lesson") {
    const lesson = await getLesson(state.lessonId);
    if (!lesson) return "Lesson not found.";
    const list = await loadWordlist("en-1k");
    // Pure-adaptive lesson (no key restriction): bias across the whole
    // wordlist via the engine's adaptive model.
    if (lesson.adaptive && !lesson.keys) {
      const picker = buildPicker(list, model);
      return picker.next(50);
    }
    const sources = {};
    if (lesson.source === "punctuation") sources.punctuation = await loadWordlist("punctuation");
    if (lesson.source === "numbers") sources.numbers = await loadWordlist("numbers");
    // Pass the model so lessonText() can adapt within the lesson's
    // restricted key set (Phase 2.2 — adaptive lessons).
    return lessonText(lesson, list, sources, model);
  }
  if (state.mode === "book" && state.bookSlug) {
    // Public-domain library — fetch the book's JSON (cached on state
    // so renderResults can compute next-page URLs without a refetch).
    if (!state._book) {
      const res = await fetch(`/data/books/${encodeURIComponent(state.bookSlug)}.json`, { cache: "default" }).catch(() => null);
      if (!res || !res.ok) return "Book not found.";
      state._book = await res.json();
    }
    const book = state._book;
    const ch = (state.bookCh != null && book.chapters[state.bookCh]) ? book.chapters[state.bookCh] : book.chapters[0];
    if (!ch) return "Chapter not found.";
    // Cache chapter context so the reader header in renderBookHeader()
    // has it without another lookup.
    state._chapterTitle = ch.title;
    state._bookTitle = book.title;
    state._bookAuthor = book.author;
    const pages = Math.max(1, Math.ceil(ch.paragraphs.length / PARAS_PER_PAGE));
    state._totalPages = pages;

    // Page mode: type the whole page (all paragraphs joined with a
    // Unicode paragraph separator so the engine + renderer can show
    // visible paragraph breaks while the user types continuously
    // across them — the engine auto-skips the separator chars.
    if (state.bookPage != null) {
      const start = state.bookPage * PARAS_PER_PAGE;
      const slice = ch.paragraphs.slice(start, start + PARAS_PER_PAGE);
      if (!slice.length) return "Page out of range.";
      state._pageParaIds = slice.map((p) => p.id);
      // Cumulative end-cursor for each paragraph in the joined target
      // (paragraphs are joined with one space). Used at finish time to
      // mark only paragraphs the user ACTUALLY typed past, not all of
      // them on Esc.
      const ends = [];
      let acc = 0;
      slice.forEach((p, i) => {
        if (i > 0) acc += 1;     // inter-paragraph join space
        acc += p.text.length;
        ends.push(acc);
      });
      state._pageParaEnds = ends;
      return slice.map((p) => p.text);
    }

    // Single-paragraph mode (legacy click-a-paragraph).
    const para = state.bookParaId
      ? ch.paragraphs.find((p) => p.id === state.bookParaId)
      : ch.paragraphs[0];
    if (!para) return "Paragraph not found.";
    state._pageParaIds = [para.id];
    return para.text;
  }
  if (state.mode === "drill") {
    // Drill content always comes from the drill's own words array. We
    // explicitly do NOT use state.language here — that would cause every
    // drill to render whatever wordlist the user last practiced
    // (typically "numbers"), which was the bug.
    const res = await fetch("/data/drills.json", { cache: "no-cache" }).catch(() => null);
    let drills = [];
    if (res && res.ok) drills = await res.json();
    const drill = drills.find((d) => d.id === state.drillId);
    if (drill && Array.isArray(drill.words) && drill.words.length) {
      // Ordered drills (A→Z, Z→A) preserve sequence — uniformText
      // would shuffle and defeat the purpose.
      if (drill.ordered) return drill.words.slice(0, 40).join(" ");
      return uniformText(drill.words, 40);
    }
    // Drill missing or malformed — defensive fallback to en-1k, never
    // to the active language.
    return uniformText((await loadWordlist("en-1k")), 25);
  }
  const list = await loadWordlist(state.language);
  if (state.mode === "adaptive") {
    const picker = buildPicker(list, model);
    return picker.next(60);
  }
  if (state.mode === "words") return uniformText(list, state.words);
  if (state.mode === "zen") return uniformText(list, 50);
  // Tape mode: same word stream as time mode but rendered as a
  // horizontal scrolling ticker. Default to 15s only if duration
  // is genuinely missing -- a user's explicit duration=30 / 60 / etc
  // must NOT be coerced back to 15.
  if (state.mode === "tape") {
    if (!state.duration) state.duration = 15;
    return uniformText(list, 120);  // long stream so it never runs out
  }
  // Tape Zen: tape rendering + untimed (zen-like). User stops via
  // the Stop button or Esc. Long word stream so the ticker can
  // keep scrolling indefinitely.
  if (state.mode === "tape-zen") {
    return uniformText(list, 200);
  }
  // time mode — give a long stream that we'll extend if needed
  return uniformText(list, 80);
}

function startEngine(target) {
  if (engine) {
    if (engine.tickHandle) cancelAnimationFrame(engine.tickHandle);
  }
  resultsEl.hidden = true;
  resultsEl.innerHTML = "";
  resetTicker();

  // Apply layout-affecting classes BEFORE the engine renders, so the
  // first call to renderer.moveCaretTo(0) sees the correct padding /
  // sizing. Otherwise the caret lands at (0,0) of the unstyled box.
  // target may be a string OR an array of paragraphs (book pages).
  const targetLen = Array.isArray(target)
    ? target.reduce((n, s) => n + s.length, 0)
    : (target || "").length;
  const isLongFormPre = state.mode === "custom" || state.mode === "book"
    || state.mode === "quote" || state.mode === "idiom" || state.mode === "poem"
    || (state.mode === "lesson" && targetLen > 200);
  textEl.classList.toggle("tt-text--full", !!isLongFormPre);
  // Apply the "reader" book-page styling to every literary target:
  // books, quotes, and corpus content (idioms / parables / poems) that
  // the corpus pages route through custom mode with kind metadata.
  const isLiterary = state.mode === "book"
    || state.mode === "quote"
    || state.mode === "idiom"
    || state.mode === "poem"
    || (state.mode === "custom" && state._customMeta && ["quote","idiom","parable","poem"].indexOf(state._customMeta.kind) !== -1);
  textEl.classList.toggle("tt-text--reader", !!isLiterary);
  // Tape mode: single horizontal line that scrolls left as the
  // caret advances. CSS handles the layout via .tt-text--tape.
  // Both "tape" and "tape-zen" use the same scroll renderer; the
  // only difference is whether there's a duration deadline.
  textEl.classList.toggle("tt-text--tape", state.mode === "tape" || state.mode === "tape-zen");
  // Tag the typing surface with the literary kind so kind-specific
  // styling (e.g. a centered, italic moral on parables) can target
  // just the last .tt-paragraph block via CSS.
  if (state.mode === "custom" && state._customMeta && state._customMeta.kind) {
    textEl.dataset.kind = state._customMeta.kind;
  } else if (state.mode === "quote") {
    textEl.dataset.kind = "quote";
  } else if (state.mode === "book") {
    textEl.dataset.kind = "book";
  } else {
    delete textEl.dataset.kind;
  }

  // Wrap the per-keystroke callback so it also drives the live aids:
  // the model still gets every sample, the ticker pushes a green/red
  // cell, and the live keyboard re-highlights the next expected char.
  const onCharShared = (prev, ch, ok, ms) => {
    model.record(prev, ch, ok, ms);
    recordKeystroke(ok, ms);
    // Per-keystroke audio feedback. setSoundPrefs is called once
    // at boot from the user's settings so playKey/playMistake know
    // which theme + volume to use.
    if (ok) playKey(); else playMistake();
    // After advancement (engine.cursor moved), the next expected char
    // is at engine.targetArr[engine.cursor]. Defer to next tick so the
    // engine has finished updating the cursor.
    requestAnimationFrame(() => {
      if (!engine || !engine.targetArr) return;
      const nextCh = engine.targetArr[engine.cursor] || null;
      highlightChar(nextCh);
      vkbdNext(nextCh);
    });
  };

  const adaptiveStream = state.mode === "adaptive" || state.mode === "zen" ? {
    onChar: onCharShared,
    nextWords: (n) => {
      const list = wordlistCache[state.language];
      if (!list) return null;
      const picker = buildPicker(list, model);
      return picker.next(n);
    },
  } : {
    onChar: onCharShared,
  };

  engine = new TypingEngine({
    host: stage,
    inputEl,
    textEl,
    liveEl,
    hintEl,
    timerEl: timerFill,
    mode: state.mode,
    durationSec: state.duration,
    words: state.words,
    freedom: state.freedom,
    caret: settings.caret || "line",
    spaceSkipsWords: state.spaceSkipsWords,
    forgiveErrors: state.forgiveErrors,
    ignoreCapitalization: state.ignoreCapitalization,
    skipPunctuation: state.skipPunctuation,
    adaptive: adaptiveStream,
    onTick: ({ wpm }) => updateTickerWpm(wpm),
    onFinish: handleFinish,
    onRestart: () => boot(),
    onEscape: () => {
      // Esc commits a session and pops the results modal, even if
      // the user never typed a single keystroke. The previous logic
      // only fired when `engine.running` (set on first keystroke),
      // leaving the user stranded on a fresh practice surface with
      // no way to back out. Mirrors window.ttFinish so the Stop
      // button and Esc share the same permissive semantics.
      if (!engine) return;
      const st = stage.dataset.state;
      if (st !== "running" && st !== "ready") return;
      if (engine.startTs === 0) engine.startTs = performance.now();
      if (engine._pauseAt) engine.resumeTimer();
      engine._stopped = true;
      engine.finish();
    },
  });
  engine.start(target);
  hintEl.textContent = "";
  hintEl.dataset.state = "ready";
  renderChallengeHud();

  // Each startEngine() reassigns this so the global Stop listener
  // (bound once below at module load) always finds the current
  // engine. Direct closure references would go stale on restart.
  window.__tt = engine;

  // Reader header for book mode (chapter title + page counter).
  // Layout classes were already applied before engine.start() so the
  // caret is positioned correctly within the padded reader card.
  renderBookReaderHeader();
  renderBackLink();
  renderAttributionHeader();

  // Live aids — driven by per-profile preferences. Re-read profile
  // fresh each start so toggles made in Settings (potentially in a
  // different tab) apply on next session boot. URL param ?vkbd=1
  // forces the mobile keyboard on even if the preference is off,
  // useful for quick testing without going through Settings.
  const freshProfile = getActive();
  const prefs = (freshProfile && freshProfile.preferences) || profile.preferences || {};
  const forceVkbd = params.get("vkbd") === "1";
  if (prefs.showVirtualKeyboard) {
    mountLiveKeyboard(state.layout || "qwerty");
    showLiveKeyboard(true);
    // target may be a string or paragraph array — derive first char.
    const firstCh = Array.isArray(target) ? (target[0] && target[0][0]) : (target && target[0]);
    highlightChar(firstCh || null);
  } else {
    showLiveKeyboard(false);
  }
  if (prefs.showTicker) {
    mountLiveTicker();
    showLiveTicker(true);
  } else {
    showLiveTicker(false);
  }

  // Mobile tap-to-type keyboard. Defaults OFF -- mobile users have
  // a native soft keyboard already and the on-page tap-to-type
  // visual is opt-in. Settings -> Mobile keyboard turns it on.
  // forceVkbd via ?vkbd=1 bypasses the preference for testing.
  const mobileKbdEnabled = prefs.mobileKeyboard === true;
  if (mobileKbdEnabled || forceVkbd) {
    mountVirtualKeyboard();
    const firstCh2 = Array.isArray(target) ? (target[0] && target[0][0]) : (target && target[0]);
    if (firstCh2) vkbdNext(firstCh2);
  } else {
    unmountVirtualKeyboard();
  }
}

function renderChallengeHud() {
  // Tear down any old banner / toolbar pill left over from prior
  // versions. The challenge HUD now renders as a stage-attribution
  // header above the typing surface (same shelf as the book title
  // / quote author header) so the toolbar stays narrow.
  const oldBanner = document.getElementById("tt-challenge-hud");
  if (oldBanner) oldBanner.remove();
  const oldPill = document.getElementById("tt-challenge-pill");
  if (oldPill) oldPill.remove();

  const id = "tt-challenge-header";
  const existing = document.getElementById(id);
  if (!activeChallenge) {
    if (existing) existing.remove();
    return;
  }
  const goalParts = [];
  if (activeChallenge.goal && activeChallenge.goal.wpm) goalParts.push(`${activeChallenge.goal.wpm} wpm`);
  if (activeChallenge.goal && activeChallenge.goal.acc) goalParts.push(`${activeChallenge.goal.acc}% accuracy`);
  const html = `
    <p class="tt-attribution__eyebrow">Challenge</p>
    <h2 class="tt-attribution__title">${htmlEscape(activeChallenge.name)}</h2>
    ${goalParts.length ? `<p class="tt-attribution__cite">Goal: ${goalParts.join(" · ")}</p>` : ""}
    ${activeChallenge.blurb ? `<p class="tt-attribution__source">${htmlEscape(activeChallenge.blurb)}</p>` : ""}
  `.trim();
  if (existing) {
    existing.innerHTML = html;
  } else {
    const wrap = document.createElement("header");
    wrap.id = id;
    wrap.className = "tt-attribution tt-attribution--challenge";
    wrap.innerHTML = html;
    stage.parentNode.insertBefore(wrap, stage);
  }
}

function handleFinish(result) {
  result.lang = state.language;
  result.layout = state.layout;
  const wpm = Math.round(result.wpm || 0);
  const acc = Math.round(result.accuracy || 0);
  const stopped = !!(engine && engine._stopped);
  // Two-note completion chime (respects sound-theme=off and the
  // volume preference; both checked inside playFinish).
  if (!stopped) playFinish();
  Analytics.sessionFinish({
    mode: state.mode,
    lang: state.language,
    layout: state.layout,
    wpm, acc,
    duration: state.duration || null,
    words: state.words || null,
    chars: result.chars || 0,
    stopped,
  });
  if (stopped) Analytics.sessionStopped({ mode: state.mode, wpm, acc });
  // Bucketed distribution events feeding /community-stats/. Wrapped
  // in try/catch + Analytics.custom fallback so a stale cached
  // analytics.js (without these named helpers) can't crash the
  // post-session flow. Even when Analytics.wpmBucket is undefined,
  // Analytics.custom always exists.
  try {
    const EMIT_FALLBACK_NAMES = {
      wpmBucket: "wpm_bucket",
      accBucket: "acc_bucket",
      modeCompleted: "mode_completed",
      langUsed: "lang_used",
      practiceVolume: "practice_volume_bucket",
      bookCompletion: "book_completion",
      sessionDist: "session_dist",
      worstChar: "worst_char",
      worstFinger: "worst_finger",
      fingerAcc: "finger_acc",
      worstWord: "worst_word",
    };
    const emit = (name, props) => {
      const fn = Analytics && Analytics[name];
      if (typeof fn === "function") fn(props);
      else if (Analytics && typeof Analytics.custom === "function") {
        Analytics.custom(EMIT_FALLBACK_NAMES[name] || name, props);
      }
    };
    emit("wpmBucket", { bucket: _wpmBucket(wpm), mode: state.mode });
    emit("accBucket", { bucket: _accBucket(acc), mode: state.mode });
    emit("modeCompleted", { mode: state.mode });
    if (state.language) emit("langUsed", { lang: state.language });
    const prof = profile || {};
    const sessions = ((prof.lifetime && prof.lifetime.sessions) || 0) + 1;
    const volumeBucket = _practiceVolumeBucket(sessions);
    emit("practiceVolume", { bucket: volumeBucket });
    // Compound event for cross-tab derivations -- avg accuracy per
    // wpm bracket, wpm distribution per practice tier, etc. Single
    // event with all four buckets so Umami's event-data view can
    // group on any combination.
    emit("sessionDist", {
      wpm: _wpmBucket(wpm),
      acc: _accBucket(acc),
      mode: state.mode,
      volume: volumeBucket,
    });
  // Bookmark where the reader got to in a long custom text, so returning
  // to a 481-segment import resumes rather than restarting. Best-effort:
  // losing a bookmark must never cost someone the session that earned it.
  if (state.mode === "custom" && state.customId && (state._customSegCount || 0) > 1) {
    try { setSegProgress(state.customId, (state.customSeg || 0) + 1); } catch {}
  }

  if (state.bookSlug) {
      const completed = (result.endCursor || 0) >= (result.targetLen || 0) && acc >= 80;
      emit("bookCompletion", { book: state.bookSlug, event: completed ? "finished" : "started" });
    }

    // ── Most-missed character / finger / word ──────────────────
    // Per-session "weakest spots". Each fires once at session-
    // finish; Umami's categorical aggregation turns the firehose
    // into a community-wide ranking on /community-stats/.
    const target = String(result.target || "");
    const errorCursors = Array.isArray(result.erroredCursors) ? result.erroredCursors : [];
    if (target && errorCursors.length) {
      // Worst character.
      const charMiss = {};
      for (const c of errorCursors) {
        const ch = target[c];
        if (!ch || ch === " ") continue;
        charMiss[ch] = (charMiss[ch] || 0) + 1;
      }
      let worstCh = null, worstChCount = 0;
      for (const k of Object.keys(charMiss)) {
        if (charMiss[k] > worstChCount) { worstCh = k; worstChCount = charMiss[k]; }
      }
      if (worstCh) emit("worstChar", { char: worstCh, missCount: worstChCount });

      // Per-finger totals + misses.
      const layout = state.layout || "qwerty";
      const fingerTotal = {}, fingerMiss = {};
      for (let i = 0; i < target.length; i++) {
        const f = fingerForKey(target[i], layout);
        if (!f) continue;
        fingerTotal[f] = (fingerTotal[f] || 0) + 1;
      }
      for (const c of errorCursors) {
        const f = fingerForKey(target[c], layout);
        if (!f) continue;
        fingerMiss[f] = (fingerMiss[f] || 0) + 1;
      }
      let worstFinger = null, worstFingerAcc = 101;
      for (const f of Object.keys(fingerTotal)) {
        const tot = fingerTotal[f];
        const errs = fingerMiss[f] || 0;
        const a = tot > 0 ? Math.round(((tot - errs) / tot) * 100) : 100;
        emit("fingerAcc", { finger: f, bucket: _accBucket(a) });
        if (a < worstFingerAcc) { worstFinger = f; worstFingerAcc = a; }
      }
      if (worstFinger) {
        emit("worstFinger", { finger: worstFinger, accBucket: _accBucket(worstFingerAcc) });
      }

      // Worst word.
      const wordRanges = [];
      let inW = false, wStart = 0;
      for (let i = 0; i <= target.length; i++) {
        const ch = i < target.length ? target[i] : " ";
        const isW = ch !== " " && i < target.length;
        if (isW && !inW) { wStart = i; inW = true; }
        else if (!isW && inW) { wordRanges.push([wStart, i]); inW = false; }
      }
      const wordMiss = {};
      for (const c of errorCursors) {
        for (let i = 0; i < wordRanges.length; i++) {
          const a = wordRanges[i][0], b = wordRanges[i][1];
          if (c >= a && c < b) {
            const w = target.slice(a, b).toLowerCase();
            if (w.length >= 2) wordMiss[w] = (wordMiss[w] || 0) + 1;
            break;
          }
        }
      }
      let worstWord = null, worstWordCount = 0;
      for (const k of Object.keys(wordMiss)) {
        if (wordMiss[k] > worstWordCount) { worstWord = k; worstWordCount = wordMiss[k]; }
      }
      if (worstWord) emit("worstWord", { word: worstWord, missCount: worstWordCount });
    }
  } catch {}
  // 100 % accuracy + non-trivial length is a celebration event.
  if (acc === 100 && (result.chars || 0) >= 80) {
    Analytics.perfectSession({ mode: state.mode, wpm, chars: result.chars });
  }
  // Speed milestones (50 / 75 / 100 / 125 / 150 wpm).
  if (wpm >= 50) {
    const tier = wpm >= 150 ? 150 : wpm >= 125 ? 125 : wpm >= 100 ? 100 : wpm >= 75 ? 75 : 50;
    Analytics.speedMilestone({ mode: state.mode, tier, wpm });
  }
  // Lesson + challenge outcome (passed/failed semantics derived from
  // the engine's pass criteria when state.lessonId or activeChallenge
  // is set).
  if (state.lessonId != null) {
    const passed = acc >= 90 && wpm >= 25;
    if (passed) Analytics.lessonPassed({ lesson: state.lessonId, wpm, acc });
    else Analytics.lessonFailed({ lesson: state.lessonId, wpm, acc });
  }
  if (activeChallenge && activeChallenge.id) {
    const passed = (!activeChallenge.goal || (
      (!activeChallenge.goal.wpm || wpm >= activeChallenge.goal.wpm) &&
      (!activeChallenge.goal.acc || acc >= activeChallenge.goal.acc)
    ));
    if (passed) Analytics.challengeCompleted({ challenge: activeChallenge.id, wpm, acc });
    else Analytics.challengeFailed({ challenge: activeChallenge.id, wpm, acc });
  }
  if (state.lessonId != null) result.lessonId = state.lessonId;
  if (state.drillId != null) result.drillId = state.drillId;
  if (state.bookSlug) {
    // Record per-paragraph progress, but ONLY for paragraphs the user
    // actually typed past. result.endCursor is how far the cursor
    // advanced into the joined target. We compare against each
    // paragraph's cumulative end offset (state._pageParaEnds) and
    // only mark paragraphs whose end is at-or-before endCursor.
    const ids = Array.isArray(state._pageParaIds) ? state._pageParaIds : [];
    const ends = Array.isArray(state._pageParaEnds) ? state._pageParaEnds : [];
    const reached = result.endCursor || 0;
    let completedIds = [];
    if (state.bookParaId && !ids.length) {
      // Single-paragraph mode — completed if cursor reached end.
      if (reached >= (result.targetLen || 0)) completedIds = [state.bookParaId];
    } else {
      // Page mode — walk paragraphs and check each end offset.
      ids.forEach((pid, i) => {
        if ((ends[i] || 0) <= reached) completedIds.push(pid);
      });
    }
    updateActive((p) => {
      p.bookProgress = p.bookProgress || {};
      let bp = p.bookProgress[state.bookSlug] = p.bookProgress[state.bookSlug] || { typed: {}, lastChapter: 0, lastParagraphId: null };
      // Same rule as the reader: marks saved against a different chapter
      // structure no longer point at the text they were made for.
      const sig = state._book ? bookStructureSig(state._book.chapters) : null;
      if (sig && bp.sig !== sig) {
        bp = p.bookProgress[state.bookSlug] = { typed: {}, lastChapter: 0, lastParagraphId: null, sig };
      }
      for (const pid of completedIds) {
        bp.typed[`${state.bookCh}:${pid}`] = { wpm: result.wpm, acc: result.accuracy, at: new Date().toISOString() };
      }
      bp.lastChapter = state.bookCh;
      if (completedIds.length) bp.lastParagraphId = completedIds[completedIds.length - 1];
      return p;
    });
  }
  // Auto-advance is disabled: every session ends at the results
  // card and waits for the user to pick what's next. The previous
  // "10s countdown then jump" flow was rushing users through
  // sessions; the explicit action buttons below cover every path.
  result._autoAdvance = false;
  // Corpus item completion (quotes / idioms / parables / poetry).
  // Recorded only when the user typed all the way through AND
  // accuracy was at least 80% — same threshold as book auto-advance.
  // Driven by state._customMeta which carries kind + sourceId from
  // the corpus page click-through (or from quote mode's qid resolver).
  const cm = state._customMeta;
  if (cm && cm.kind && cm.sourceId
      && (result.endCursor || 0) >= (result.targetLen || 0)
      && result.accuracy >= 80) {
    updateActive((p) => {
      p.corpusProgress = p.corpusProgress || {};
      const bucket = p.corpusProgress[cm.kind] = p.corpusProgress[cm.kind] || {};
      bucket[cm.sourceId] = { wpm: result.wpm, acc: result.accuracy, at: new Date().toISOString() };
      return p;
    });
  }
  const { meta } = recordSession(result, model.serialize());
  result._meta = meta || {};
  // Challenge: evaluate goal and update bests.
  if (activeChallenge) {
    const evalRes = evaluateGoal(activeChallenge.goal, result);
    result._challenge = { id: activeChallenge.id, name: activeChallenge.name, goal: activeChallenge.goal, passed: evalRes.passed, reasons: evalRes.reasons };
    updateActive((p) => {
      p.challengeBests = p.challengeBests || {};
      const cur = p.challengeBests[activeChallenge.id];
      if (evalRes.passed && (!cur || result.wpm > cur.wpm)) {
        p.challengeBests[activeChallenge.id] = { wpm: result.wpm, acc: result.accuracy, at: new Date().toISOString() };
      }
      return p;
    });
  }
  if (state.lessonId) {
    const key = `tt:lesson-best-${state.lessonId}`;
    let best = null;
    try { best = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
    const passed = result.accuracy >= 90 && result.wpm >= 18;
    if (passed && (!best || result.wpm > best.wpm)) {
      try { localStorage.setItem(key, JSON.stringify({ wpm: result.wpm, acc: result.accuracy, at: new Date().toISOString() })); } catch {}
    }
    result.lessonPassed = passed;
  }
  // Pass freshly-earned achievements through to the results card so
  // they render INSIDE the modal instead of as drifting toasts.
  result._earnedAchievements = ((meta && meta.achievementsEarned) || [])
    .map((id) => achievementById(id))
    .filter(Boolean);
  renderResults(result);
}

/* Show a contextual back link above the typing surface so the user
   can jump back to where they came from — the book reader, the
   quotes/idioms/parables/poetry index, the lessons grid, the drills
   grid, the challenges page, or the custom-text manager. Hidden in
   plain time/words/zen/adaptive modes (no clear source). */
function renderBackLink() {
  const el = document.getElementById("tt-back-link");
  if (!el) return;
  let label = "";
  let href = "";
  // ?from= tells us the corpus page the user came from when they
  // clicked "Type this" — overrides the generic /custom/ fallback.
  const from = params.get("from");
  if (from === "idiom") { label = "← Back to idioms"; href = "/idioms/"; }
  else if (from === "parable") { label = "← Back to parables"; href = "/parables/"; }
  else if (from === "poem") { label = "← Back to poetry"; href = "/poetry/"; }
  else if (from === "quote") { label = "← Back to quotes"; href = "/quotes/"; }
  else if (state.bookSlug) {
    label = "← Back to book";
    href = `/library/${encodeURIComponent(state.bookSlug)}/`;
  } else if (state.lessonId != null) {
    label = "← Back to lessons";
    href = "/lessons/";
  } else if (state.drillId) {
    label = "← Back to drills";
    href = "/drills/";
  } else if (state.customId) {
    label = "← Back to your custom texts";
    href = "/custom/";
  } else if (activeChallenge) {
    label = "← Back to challenges";
    href = "/challenges/";
  } else if (state.mode === "quote") {
    label = "← Back to quotes";
    href = "/quotes/";
  }
  if (!href) {
    el.hidden = true;
    el.removeAttribute("href");
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.href = href;
  el.textContent = label;
}

/* Attribution header — sits above the typing surface for quote /
   parable / poem / idiom / custom-with-meta sessions. Shows the
   work title, author, year, and any meaning/source info. Removes
   itself when the active session has no meta. */
function renderAttributionHeader() {
  const id = "tt-attribution";
  const existing = document.getElementById(id);
  const meta = state._customMeta;
  const customTitle = state._customTitle;
  // Skip when we already have the dedicated book reader header showing.
  if (state.mode === "book" || !meta || !(meta.author || meta.year || meta.source || meta.meaning || customTitle)) {
    if (existing) existing.remove();
    return;
  }
  const title = customTitle || meta.title || "";
  const cite = [meta.author, meta.year].filter(Boolean).join(" · ");
  const html = `
    ${title ? `<p class="tt-attribution__eyebrow">${meta.kind || "Source"}</p>
               <h2 class="tt-attribution__title">${htmlEscape(title)}</h2>` : ""}
    ${cite ? `<p class="tt-attribution__cite">${htmlEscape(cite)}</p>` : ""}
    ${meta.source ? `<p class="tt-attribution__source">from <em>${htmlEscape(meta.source)}</em></p>` : ""}
    ${meta.meaning ? `<p class="tt-attribution__meaning"><strong>Meaning:</strong> ${htmlEscape(meta.meaning)}</p>` : ""}
  `.trim();
  if (existing) {
    existing.innerHTML = html;
  } else {
    const wrap = document.createElement("header");
    wrap.id = id;
    wrap.className = "tt-attribution";
    wrap.innerHTML = html;
    stage.parentNode.insertBefore(wrap, stage);
  }
}

/* When in book mode, render a clean reader-style header above the
   typing surface — book + author eyebrow, big chapter title, page
   counter. Removes itself in non-book modes. */
function renderBookReaderHeader() {
  const id = "tt-book-header";
  const existing = document.getElementById(id);
  if (state.mode !== "book") {
    if (existing) existing.remove();
    return;
  }
  const totalPages = state._totalPages || 1;
  const pageNum = (state.bookPage != null ? state.bookPage : 0) + 1;
  const html = `
    <p class="tt-book-eyebrow">${htmlEscape(state._bookTitle || "")}</p>
    ${state._bookAuthor ? `<p class="tt-book-author">${htmlEscape(state._bookAuthor)}</p>` : ""}
    <h2 class="tt-book-chapter">${htmlEscape(state._chapterTitle || "")}</h2>
    <p class="tt-book-page">Page ${pageNum} of ${totalPages}</p>
  `;
  if (existing) {
    existing.innerHTML = html;
  } else {
    const wrap = document.createElement("header");
    wrap.id = id;
    wrap.className = "tt-book-header";
    wrap.innerHTML = html;
    stage.parentNode.insertBefore(wrap, stage);
  }
}

/* Compute the URL of the next page in the active book, wrapping
   chapter to chapter and bottoming out on the book index when the
   whole book is done. Returns "" when not in book mode. */
/* Next segment of a custom text, or null at the end. Mirrors
   nextBookUrl -- long imports need the same "keep going" affordance a
   book does, and previously had none at all. */
function nextCustomUrl() {
  if (state.mode !== "custom" || !state.customId) return null;
  const count = state._customSegCount || 0;
  const next = (state.customSeg || 0) + 1;
  if (count <= 1 || next >= count) return null;
  return `/practice/?mode=custom&custom=${encodeURIComponent(state.customId)}&seg=${next}`;
}

function nextBookUrl() {
  if (!state.bookSlug) return "";
  const book = state._book;
  const ch = state.bookCh != null ? state.bookCh : 0;
  const page = state.bookPage != null ? state.bookPage : 0;
  // No cached book yet — best-effort: increment within current chapter.
  if (!book) {
    return `/practice/?book=${encodeURIComponent(state.bookSlug)}&ch=${ch}&page=${page + 1}`;
  }
  const chapter = book.chapters[ch];
  if (!chapter) return `/library/${encodeURIComponent(state.bookSlug)}/`;
  const pagesInChapter = Math.max(1, Math.ceil(chapter.paragraphs.length / PARAS_PER_PAGE));
  if (page + 1 < pagesInChapter) {
    return `/practice/?book=${encodeURIComponent(state.bookSlug)}&ch=${ch}&page=${page + 1}`;
  }
  // End of chapter — walk to next chapter.
  if (ch + 1 < book.chapters.length) {
    return `/practice/?book=${encodeURIComponent(state.bookSlug)}&ch=${ch + 1}&page=0`;
  }
  // End of book — back to the index.
  return `/library/${encodeURIComponent(state.bookSlug)}/`;
}

function renderResults(r) {
  // Restrict the weak-keys callout to characters that actually appeared
  // in this session's target. The lifetime perKey store would otherwise
  // surface keys (e.g. digits) the user never even saw in this run,
  // which makes the feedback feel broken. The /practice/?mode=adaptive
  // CTA below is the place for lifetime weak-key practice.
  const targetStr = Array.isArray(r.target) ? r.target.join(" ") : (r.target || "");
  const inSession = new Set(targetStr.split(""));
  const weak = model.weakChars(40)
    .filter(([ch]) => inSession.has(ch))
    .slice(0, 8)
    .map(([ch]) => ch);
  const meta = r._meta || {};
  // Testimonial prompt removed -- the always-visible "Leave a
  // review" button in the actions row carries the same path.
  const testimonialPrompt = "";
  const prBadge = meta.newOverallBest
    ? `<span class="results__pr results__pr--lifetime" data-tip="New all-time best wpm across every mode you've practiced.">NEW LIFETIME BEST</span>`
    : meta.newModeBest
      ? `<span class="results__pr" data-tip="Your fastest run yet for this exact mode + duration + language combo.">NEW MODE BEST</span>`
      : "";
  // Human-readable key labels used in weak-key tooltips. Falls back to
  // the literal character.
  const keyLabel = (c) => {
    if (c === " ") return "space";
    if (c === "\t") return "tab";
    if (c === "\n") return "newline";
    return c;
  };
  resultsEl.innerHTML = `
    <header class="results__intro">
      <p class="results__eyebrow">— Session complete</p>
      <h2 class="results__heading">Here's how you did</h2>
      <p class="results__sub">Your keystrokes are saved to this profile. Adaptive mode and stats already reflect this run.</p>
    </header>
    <div class="results__head">
      <p class="results__title" data-tip="Net WPM: correct characters / 5 / minutes elapsed. The standard typing speed measure."><span class="results__title-num">${Math.round(r.wpm)}</span> <small class="results__title-unit">wpm</small></p>
      <div class="results__meta-wrap">
        ${prBadge}
        <span class="results__meta" data-tip="Mode · duration · language used for this session.">${r.mode} · ${r.duration ? r.duration + "s · " : ""}${r.lang || ""}${r.suspect ? ' · ⚠ flagged' : ''}</span>
      </div>
    </div>
    <div class="results__grid">
      <div class="results__metric results__metric--big" data-tip="Net WPM after errors. Correct characters / 5 / minutes."><span class="results__value">${Math.round(r.wpm)}</span><span class="results__label">wpm</span></div>
      <div class="results__metric" data-tip="Raw WPM ignoring errors -- every keystroke counts. Useful for comparing typing speed before accuracy is factored in."><span class="results__value">${Math.round(r.raw)}</span><span class="results__label">raw</span></div>
      <div class="results__metric" data-tip="Percentage of keystrokes that hit the correct key on the first try."><span class="results__value">${Math.round(r.accuracy)}%</span><span class="results__label">accuracy</span></div>
      <div class="results__metric" data-tip="Steadiness of your WPM across the session. Higher means you held a consistent pace; lower means big bursts and pauses."><span class="results__value">${Math.round(r.consistency)}%</span><span class="results__label">consistency</span></div>
    </div>
    ${r.perWordWpm && r.perWordWpm.length >= 2 ? `<div class="results__chart" aria-label="WPM over the session" data-tip="Per-word WPM across the session. Spikes show fast bursts, dips show stumbles."><svg id="results-wpm-chart" class="chart__svg"></svg></div>` : ""}
    ${weak.length ? `<div><strong style="color:var(--fg-2);font-size:var(--fs-200);text-transform:uppercase;letter-spacing:.06em" data-tip="Keys you typed slowly or missed most often this session. The adaptive picker will favor these next time.">Weak keys in this session</strong><div class="results__weakkeys">${weak.map((c) => `<span class="results__weakkey" data-tip="The '${htmlEscape(keyLabel(c))}' key was slow or error-prone this session.">${htmlEscape(c)}</span>`).join("")}</div></div>` : ""}
    ${state.lessonId ? `<p class="muted" style="margin-top:1rem">${r.lessonPassed ? '✓ Lesson passed — ready for the next one.' : 'Aim for 90% accuracy and 18 wpm to clear this lesson.'}</p>` : ''}
    ${r._challenge ? `<p class="results__challenge ${r._challenge.passed ? 'results__challenge--pass' : 'results__challenge--fail'}" data-tip="${r._challenge.passed ? 'You met the goal for this challenge.' : 'You came up short on this challenge target.'}">${r._challenge.passed ? '✓ Challenge cleared — ' + htmlEscape(r._challenge.name) : '✗ Challenge missed — ' + htmlEscape((r._challenge.reasons || []).join(", "))}</p>` : ''}
    ${(r._earnedAchievements && r._earnedAchievements.length) ? `
      <section class="results__achievements" aria-label="Achievements unlocked this session">
        <p class="results__achievements-eyebrow" data-tip="Achievements unlocked by this run -- your first time hitting these milestones.">★ Achievement${r._earnedAchievements.length === 1 ? '' : 's'} unlocked — ${r._earnedAchievements.length} new</p>
        <ul class="results__achievements-list">
          ${r._earnedAchievements.map((a) => `
            <li class="results__achievement" data-tip="${htmlEscape(a.desc || a.name)}">
              <span class="results__achievement-name">${htmlEscape(a.name)}</span>
              <span class="results__achievement-desc">${htmlEscape(a.desc || "")}</span>
            </li>
          `).join("")}
        </ul>
      </section>
    ` : ''}
    <div class="results__actions">
      ${(() => {
        // Each button gets an icon (rendered via inline SVG inside the
        // btn) AND a wrapping span.results__btn-label for the text.
        // CSS hides the label on mobile to leave just the icon. Icons
        // are stroke-based feather-style for visual consistency.
        const ICONS = {
          next:    `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
          check:   `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
          retry:   `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`,
          list:    `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>`,
          adaptive:`<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4 6v6c0 5 3.4 9.5 8 10 4.6-.5 8-5 8-10V6l-8-4z"/></svg>`,
          stats:   `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-7"/></svg>`,
          book:    `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
          lesson:  `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
          feedback:`<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>`,
          review:  `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15 9 22 9.5 16.5 14 18 21 12 17.5 6 21 7.5 14 2 9.5 9 9 12 2"/></svg>`,
        };
        const wrap = (icon, label, attrs, tip, primary) => `
          <${attrs.tag || "button"} class="btn results__btn ${primary ? "btn--primary" : ""}" ${attrs.attrs || ""} data-tip="${tip}" aria-label="${label}">
            ${icon}<span class="results__btn-label">${label}</span>
          </${attrs.tag || "button"}>`;
        // Book mode: Next page / Type page again / back to chapter list.
        if (state.bookSlug) {
          return wrap(ICONS.next, "Next page →", { tag: "a", attrs: `id="tt-next-page" href="${nextBookUrl()}"` }, "Move on to the next paragraph in this book.", true)
            + wrap(ICONS.retry, "Type page again", { attrs: `type="button" onclick="window.ttRestart && window.ttRestart()"` }, "Retype this same page from the start.")
            + wrap(ICONS.book, "Back to chapter list", { tag: "a", attrs: `href="/library/${encodeURIComponent(state.bookSlug)}/"` }, "Return to the book's chapter index.");
        }
        // Custom text with more than one segment: offer the next one.
        // "Next test" alone just restarted the SAME segment, which is why
        // a 481-segment PDF looked like it only had a first page.
        if (state.mode === "custom" && (state._customSegCount || 0) > 1) {
          const nextUrl = nextCustomUrl();
          const pos = (state.customSeg || 0) + 1;
          const total = state._customSegCount;
          const progress = `<p class="results__progress">Segment ${pos} of ${total}</p>`;
          const first = nextUrl
            ? wrap(ICONS.next, "Next segment →", { tag: "a", attrs: `id="tt-next-seg" href="${nextUrl}"` }, "Continue with the next part of this text.", true)
            : wrap(ICONS.check, "Text finished", { tag: "a", attrs: `href="/custom/"` }, "You have typed every segment of this text.", true);
          // Sequential "next" is no way to reach segment 3,900 of an
          // imported book. Deep-link into the picker on /custom/.
          const pickUrl = `/custom/#pick-${encodeURIComponent(state.customId)}`;
          return progress + first
            + wrap(ICONS.retry, "Type this segment again", { attrs: `type="button" onclick="window.ttRestart && window.ttRestart()"` }, "Retype this same segment from the start.")
            + wrap(ICONS.list, "Choose a segment", { tag: "a", attrs: `id="tt-pick-seg" href="${pickUrl}"` }, "Jump to any segment of this text.")
            + wrap(ICONS.book, "All saved texts", { tag: "a", attrs: `href="/custom/"` }, "Back to your saved custom texts.");
        }
        // Daily-quote mode: "Next test" -> fresh random quote.
        const isDaily = state.mode === "quote" && state.quote === "daily";
        const nextBtn = isDaily
          ? wrap(ICONS.next, "Next quote →", { tag: "a", attrs: `href="/practice/?mode=quote&quote=random"` }, "Pull a fresh random quote from the public-domain corpus.", true)
          : wrap(ICONS.retry, "Next test", { attrs: `type="button" onclick="window.ttRestart && window.ttRestart()"` }, "Restart with the same mode, duration, and language.", true);
        const tail = state.lessonId
          ? wrap(ICONS.lesson, "Next lesson", { tag: "a", attrs: `href="/practice/?lesson=${state.lessonId + 1}"` }, "Move on to the next lesson in the curriculum.")
            + wrap(ICONS.list, "All lessons", { tag: "a", attrs: `href="/lessons/"` }, "See every lesson available.")
          : wrap(ICONS.adaptive, "Practice weak keys", { tag: "a", attrs: `href="/practice/?mode=adaptive"` }, "Switch to adaptive mode -- the picker weights your weakest keys more heavily.")
            + wrap(ICONS.stats, "View stats", { tag: "a", attrs: `href="/stats/"` }, "Open your full performance dashboard with charts, heatmaps, and history.");
        // Always-visible feedback path: a "Send feedback" button
        // and a "Leave a review" link, regardless of mode. Keeps
        // user-feedback collection on the surface even when there's
        // no testimonial-prompt aside (which only fires after 10
        // lifetime sessions).
        const feedbackBtns =
          wrap(ICONS.feedback, "Send feedback", { attrs: `type="button" onclick="window.openFeedbackModal && window.openFeedbackModal()"` }, "Drop a quick note about anything -- bugs, ideas, things you wish worked differently.")
          + wrap(ICONS.review, "Leave a review", { tag: "a", attrs: `href="/contribute/testimonial/"` }, "Submit a short testimonial. Helps the project and may appear on the reviews page if you opt in.");
        return nextBtn + tail + feedbackBtns;
      })()}
    </div>
    ${testimonialPrompt}
    ${r._autoAdvance ? `<p class="muted" id="tt-autoadvance-note" style="margin-top:1rem;text-align:center">Auto-advancing in <span id="tt-autoadvance-count">10</span>s -- press Esc to stay.</p>` : ''}
  `;
  // Wire the testimonial-prompt dismiss button if rendered.
  const dismissBtn = document.getElementById("tt-testimonial-dismiss");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      try { localStorage.setItem("tt:testimonial-prompt-dismissed", "true"); } catch {}
      const el = document.getElementById("tt-testimonial-prompt");
      if (el) el.remove();
    });
  }
  resultsEl.hidden = false;
  // Paint the per-word WPM chart, if we have at least two samples.
  if (r.perWordWpm && r.perWordWpm.length >= 2) {
    drawSessionChart(document.getElementById("results-wpm-chart"), r.perWordWpm);
  }
  // Scroll the results card to the top of the viewport, accounting for
  // the sticky site header + practice toolbar so the card's heading isn't
  // hidden underneath them.
  requestAnimationFrame(() => {
    const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 58;
    const bar = document.querySelector(".practice-bar");
    const barH = bar ? bar.offsetHeight : 0;
    const top = resultsEl.getBoundingClientRect().top + window.scrollY - headerH - barH - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  });

  // Universal auto-advance: 10 s countdown, then either navigate to
  // a fresh URL (book/lesson/quote) or restart the same session
  // (time/words/practice). Esc cancels. Suppressed entirely when
  // the user pressed Stop (engine._stopped via handleFinish).
  if (r._autoAdvance) {
    const action = getAutoAdvanceAction();
    if (action) {
      const note = document.getElementById("tt-autoadvance-note");
      const counter = document.getElementById("tt-autoadvance-count");
      let remaining = 10;
      let cancelled = false;
      const tick = setInterval(() => {
        remaining--;
        if (cancelled) { clearInterval(tick); return; }
        if (counter) counter.textContent = String(remaining);
        if (remaining <= 0) {
          clearInterval(tick);
          if (cancelled) return;
          if (action.url) window.location.href = action.url;
          else if (action.restart && window.ttRestart) window.ttRestart();
        }
      }, 1000);
      const cancel = (e) => {
        if (e.key === "Escape") {
          cancelled = true; clearInterval(tick);
          if (note) note.textContent = "Auto-advance cancelled.";
          document.removeEventListener("keydown", cancel);
        }
      };
      document.addEventListener("keydown", cancel);
    }
  }
}

/* Resolve the next action for auto-advance based on current mode.
   Returns { url } to navigate, { restart: true } to re-boot in
   place, or null when no sensible auto-advance applies (zen,
   adaptive). */
function getAutoAdvanceAction() {
  if (state.bookSlug) return { url: nextBookUrl() };
  if (state.lessonId != null) return { url: `/practice/?lesson=${state.lessonId + 1}` };
  if (state.mode === "quote") {
    // Preserve the user's chosen length bucket (medium/long/etc.)
    // when auto-advancing; only daily mode forces "random". The
    // timestamp param defeats any browser/SW caching of the page.
    const bucket = state.quote && state.quote !== "daily" ? state.quote : "random";
    const tag = state.quoteTag ? `&tag=${encodeURIComponent(state.quoteTag)}` : "";
    return { url: `/practice/?mode=quote&quote=${bucket}${tag}&t=${Date.now()}` };
  }
  if (state.mode === "zen" || state.mode === "adaptive") return null;
  return { restart: true };
}

function drawSessionChart(svg, samples) {
  if (!svg || !samples || samples.length < 2) return;
  const W = 700, H = 160, PAD_L = 36, PAD_R = 12, PAD_T = 12, PAD_B = 22;
  const min = Math.max(0, Math.min(...samples) - 5);
  const max = Math.max(...samples) + 5;
  const span = max - min || 1;
  const x = (i) => PAD_L + (i / Math.max(1, samples.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v) => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B);
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]); return e; };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";
  // Axes
  svg.appendChild(el("line", { x1: PAD_L, y1: H - PAD_B, x2: W - PAD_R, y2: H - PAD_B, class: "chart__axis" }));
  svg.appendChild(el("line", { x1: PAD_L, y1: PAD_T, x2: PAD_L, y2: H - PAD_B, class: "chart__axis" }));
  for (const t of [min, (min + max) / 2, max]) {
    const yt = y(t);
    svg.appendChild(el("line", { x1: PAD_L, y1: yt, x2: W - PAD_R, y2: yt, class: "chart__axis", "stroke-dasharray": "2,4", "stroke-opacity": ".25" }));
    const tx = el("text", { x: PAD_L - 6, y: yt + 3, "text-anchor": "end", class: "chart__tick" });
    tx.textContent = Math.round(t);
    svg.appendChild(tx);
  }
  let path = "";
  samples.forEach((s, i) => { path += (i === 0 ? "M" : "L") + x(i) + "," + y(s); });
  const area = path + `L${x(samples.length - 1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;
  svg.appendChild(el("path", { d: area, class: "chart__area" }));
  svg.appendChild(el("path", { d: path, class: "chart__line" }));
  // Label
  const lab = el("text", { x: W - PAD_R, y: PAD_T + 4, "text-anchor": "end", class: "chart__tick" });
  lab.textContent = "wpm per word";
  svg.appendChild(lab);
}

function syncModeBar() {
  const presetDurations = new Set([15, 30, 60, 120, 300]);
  const presetWords = new Set([10, 25, 50, 100]);
  document.querySelectorAll('.mode-bar__btn[data-mode]').forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode));
  });
  document.querySelectorAll('.mode-bar__btn[data-duration]').forEach((b) => {
    b.setAttribute("aria-pressed", String(parseInt(b.dataset.duration, 10) === state.duration));
  });
  document.querySelectorAll('.mode-bar__btn[data-words]').forEach((b) => {
    b.setAttribute("aria-pressed", String(parseInt(b.dataset.words, 10) === state.words));
  });
  document.querySelectorAll('.mode-bar__btn[data-quote]').forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.quote === state.quote));
  });
  document.querySelectorAll('.mode-bar__btn[data-lang]').forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.lang === state.language));
  });
  document.querySelectorAll('.mode-bar__btn[data-tag]').forEach((b) => {
    b.setAttribute("aria-pressed", String((b.dataset.tag || "") === (state.quoteTag || "")));
  });
  // Reflect custom values in the inputs when the preset buttons don't
  // match -- so a user who set duration to 45s sees "45" in the input
  // and no preset button shows as active.
  const dInput = document.querySelector('.mode-bar__custom[data-custom="duration"]');
  if (dInput) dInput.value = presetDurations.has(state.duration) ? "" : String(state.duration);
  const wInput = document.querySelector('.mode-bar__custom[data-custom="words"]');
  if (wInput) wInput.value = presetWords.has(state.words) ? "" : String(state.words);
}

function bindModeBar() {
  document.querySelectorAll('.mode-bar__btn').forEach((b) => {
    b.addEventListener("click", () => {
      // Mobile: chips with a data-section-url (quote / idiom /
      // poem) navigate to the dedicated index page instead of
      // starting a practice session. Lets the user browse the
      // full library on phones where the small screen makes the
      // chevron dropdown experience less useful.
      if (b.dataset.sectionUrl &&
          window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
        window.location.href = b.dataset.sectionUrl;
        return;
      }
      // Switching to any mode chip ends the active challenge --
      // otherwise the CHALLENGE banner persists across non-
      // challenge sessions even though the engine has moved on.
      if (b.dataset.mode) {
        activeChallenge = null;
        state.mode = b.dataset.mode;
        Analytics.modeSelected({ mode: state.mode });
      }
      else if (b.dataset.duration) { state.duration = parseInt(b.dataset.duration, 10); Analytics.variantSelected({ kind: "duration", value: state.duration }); }
      else if (b.dataset.words) { state.words = parseInt(b.dataset.words, 10); Analytics.variantSelected({ kind: "words", value: state.words }); }
      else if (b.dataset.quote) { state.quote = b.dataset.quote; Analytics.variantSelected({ kind: "quote", value: state.quote }); }
      else if (b.dataset.lang !== undefined) { state.language = b.dataset.lang; Analytics.sourceSelected({ lang: state.language, mode: state.mode }); }
      else if (b.dataset.tag !== undefined) { state.quoteTag = b.dataset.tag; Analytics.variantSelected({ kind: "tag", value: state.quoteTag }); }
      syncModeBar();
      boot();
    });
  });
  // Custom number inputs: apply on Enter or blur. Clamp to [min, max].
  document.querySelectorAll('.mode-bar__custom').forEach((inp) => {
    function apply() {
      const raw = parseInt(inp.value, 10);
      if (!Number.isFinite(raw)) return;
      const min = parseInt(inp.min, 10) || 1;
      const max = parseInt(inp.max, 10) || 99999;
      const v = Math.min(max, Math.max(min, raw));
      if (inp.dataset.custom === "duration") state.duration = v;
      else if (inp.dataset.custom === "words") state.words = v;
      syncModeBar();
      boot();
    }
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); apply(); inp.blur(); }
    });
    inp.addEventListener("blur", () => { if (inp.value) apply(); });
  });
  // Wire dropdown chevrons.
  bindModeDropdowns();
}

/* Dropdown open/close. Exposed as window.ttToggleDropdown so the
   inline onclick on each chevron can call it directly -- bypasses
   any addEventListener timing/scope quirks that were preventing the
   panel from opening on mobile. */
function closeAllDropdowns() {
  document.querySelectorAll('.mode-bar__chev[data-dropdown-trigger]').forEach((t) => t.setAttribute("aria-expanded", "false"));
  document.querySelectorAll('.mode-bar__dropdown[data-dropdown]').forEach((p) => { p.hidden = true; });
}
window.ttToggleDropdown = function(mode, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const trigger = document.querySelector(`.mode-bar__chev[data-dropdown-trigger="${mode}"]`);
  const panel = document.querySelector(`.mode-bar__dropdown[data-dropdown="${mode}"]`);
  if (!trigger || !panel) return;
  const isOpen = trigger.getAttribute("aria-expanded") === "true";
  closeAllDropdowns();
  if (isOpen) return;
  trigger.setAttribute("aria-expanded", "true");
  panel.hidden = false;
  Analytics.dropdownOpened({ mode });
  // Wipe ALL inline styles first so a previous open-position from
  // a different viewport (e.g. desktop -> rotated to portrait)
  // can't carry over and shove the panel under the header. Then
  // apply the right anchoring for the current viewport.
  panel.removeAttribute("style");
  const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  if (!isMobile) {
    const r = trigger.getBoundingClientRect();
    const panelW = Math.min(420, window.innerWidth * 0.92);
    panel.style.top = (r.bottom + 6) + "px";
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8)) + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }
};

function bindModeDropdowns() {
  // Click outside any panel closes all.
  document.addEventListener("click", (e) => {
    if (e.target.closest(".mode-bar__dropdown")) return;
    if (e.target.closest(".mode-bar__chev")) return;
    closeAllDropdowns();
  });
  // Esc closes.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const anyOpen = document.querySelector('.mode-bar__chev[data-dropdown-trigger][aria-expanded="true"]');
    if (anyOpen) {
      e.stopPropagation();
      closeAllDropdowns();
    }
  });
}

async function boot() {
  syncModeBar();
  // Refresh sound preferences from the live profile each boot so
  // a change made in Settings is picked up without a page reload.
  setSoundPrefs({
    theme: (prefs && prefs.soundTheme) || "off",
    volume: (prefs && typeof prefs.soundVolume === "number") ? prefs.soundVolume : 0.5,
  });
  hintEl.textContent = "Loading…";
  try {
    const target = await buildText();
    startEngine(target);
    Analytics.sessionStart({
      mode: state.mode,
      lang: state.language,
      layout: state.layout,
      duration: state.duration || null,
      words: state.words || null,
      quote: state.quote || null,
      lessonId: state.lessonId || null,
      drillId: state.drillId || null,
      challenge: (activeChallenge && activeChallenge.id) || null,
      bookSlug: state.bookSlug || null,
    });
  } catch (err) {
    console.error(err);
    hintEl.textContent = "Could not load — check console.";
  }
}

/* End the current session and commit a partial result. Same path as
   pressing Esc on desktop -- but exposed as window.ttFinish so a UI
   button (used on mobile, where there's no physical Esc key) can
   trigger it. Permissive: fires from "ready" or "running" states.
   In "ready" we stamp startTs to now so finish() doesn't compute a
   nonsense ms duration. In "idle" / "done" we no-op. */
/* Toggle pause state. Freezes the engine clock + live stats.
   Sets engine._userPaused so the auto-resume on input-focus
   (which fires constantly during virtual-keyboard refocus
   cycles) can't immediately unpause the session. The user
   stays paused until they explicitly hit Resume. */
window.ttPause = () => {
  const eng = window.__tt || engine;
  if (!eng) return;
  // Pre-session guard: if the engine hasn't received a first
  // keystroke yet (running === false), Pause is meaningless --
  // there's nothing to pause. Reject so a soft-keyboard tap that
  // bleeds onto the Pause button can't put the session in a
  // pre-typing-paused state the user can't escape from.
  if (!eng.running) return;
  // Definitive tap-to-type guard: if the user typed within the last
  // 450 ms, this Pause "click" is almost certainly a soft-keyboard
  // tap that bled onto the button. Refuse to pause -- AND if we're
  // currently in a paused state we resume, because the user clearly
  // never meant to pause in the first place.
  const lastTyped = eng._lastTypedAt || 0;
  const now = performance.now();
  if (lastTyped && now - lastTyped < 450) {
    if (eng._pauseAt) {
      eng._userPaused = false;
      eng.resumeTimer();
    }
    return;
  }
  if (eng._pauseAt && eng._userPaused) {
    // Currently user-paused -- resume.
    eng._userPaused = false;
    eng.resumeTimer();
    Analytics.sessionResumed({ mode: state.mode });
  } else {
    // Pause + mark as user-driven so onFocus can't auto-resume.
    // The "user-pause" reason token is the ONLY way pauseTimer
    // honors the call -- every other entry point is rejected at
    // the engine. See typing-engine.js pauseTimer().
    eng._userPaused = true;
    eng.pauseTimer("user-pause");
    Analytics.sessionPaused({ mode: state.mode });
  }
  const btn = document.getElementById("tt-pause");
  if (btn) {
    btn.setAttribute("aria-pressed", eng._userPaused ? "true" : "false");
    const label = btn.querySelector(".practice-bar__action-label, .tt-actions__label");
    if (label) label.textContent = eng._userPaused ? "Resume" : "Pause";
    btn.classList.toggle("is-paused", !!eng._userPaused);
    btn.classList.toggle("is-active", !!eng._userPaused);
  }
};

window.ttFinish = () => {
  const e = window.__tt || engine;
  if (!e) return false;
  const st = stage.dataset.state;
  if (st !== "running" && st !== "ready") return false;
  if (e.startTs === 0) e.startTs = performance.now();
  if (e._pauseAt) e.resumeTimer();
  e.finish();
  return true;
};

window.ttRestart = () => {
  resultsEl.hidden = true;
  boot();
  // Scroll the typing stage to the top of the viewport (accounting
  // for the sticky site header + practice toolbar) so the user sees
  // the fresh target instead of staying parked at the previous
  // results card. requestAnimationFrame defers until layout settles.
  requestAnimationFrame(() => {
    const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 58;
    const bar = document.querySelector(".practice-bar");
    const barH = bar ? bar.offsetHeight : 0;
    const top = stage.getBoundingClientRect().top + window.scrollY - headerH - barH - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  });
};

bindModeBar();

/* Stop chip wiring — bound ONCE at module load. Each startEngine()
   updates window.__tt with the live engine reference, so the
   handlers below always finish the current session even after
   restarts. Three event types in case one of them gets eaten on a
   given platform: click (desktop + most mobile), touchend (iOS
   sometimes prefers it), pointerup (Android Chrome edge cases). */
(function wireStopButton() {
  const stopBtn = document.getElementById("tt-stop");
  if (!stopBtn) return;
  // Desktop: prevent input blur on mousedown so the engine doesn't
  // pause when clicking the chip. Don't preventDefault on
  // touch/pointer down -- that suppresses the click on mobile.
  stopBtn.addEventListener("mousedown", (e) => { e.preventDefault(); });
  let lastFire = 0;
  const doFinish = (e) => {
    // Debounce double-fires (touchend + click on the same tap).
    const now = Date.now();
    if (now - lastFire < 300) { if (e) e.preventDefault(); return; }
    lastFire = now;
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const eng = window.__tt;
    if (!eng) return;
    const st = stage.dataset.state;
    if (st !== "running" && st !== "ready") return;
    if (eng.startTs === 0) eng.startTs = performance.now();
    if (eng._pauseAt) eng.resumeTimer();
    eng._stopped = true;
    eng.finish();
  };
  stopBtn.addEventListener("click", doFinish);
  stopBtn.addEventListener("touchend", doFinish, { passive: false });
  stopBtn.addEventListener("pointerup", doFinish);
})();

/* Random Mode button -- presents the user with a random mode +
   variant combo to keep practice fresh. Hooked to the toolbar. */
window.ttRandomMode = () => {
  const modes = [
    { mode: "time", duration: 30 },
    { mode: "time", duration: 60 },
    { mode: "time", duration: 120 },
    { mode: "words", words: 25 },
    { mode: "words", words: 50 },
    { mode: "words", words: 100 },
    { mode: "quote", quote: "short" },
    { mode: "quote", quote: "medium" },
    { mode: "quote", quote: "long" },
    { mode: "idiom" },
    { mode: "poem" },
    { mode: "zen" },
    { mode: "adaptive" },
  ];
  const pick = modes[Math.floor(Math.random() * modes.length)];
  const params = new URLSearchParams();
  params.set("mode", pick.mode);
  if (pick.duration) params.set("duration", String(pick.duration));
  if (pick.words) params.set("words", String(pick.words));
  if (pick.quote) params.set("quote", pick.quote);
  window.location.href = "/practice/?" + params.toString();
};

/* Document-level Escape fallback. The engine's input-capture
   listens for Escape on the inputEl only, so once focus moves away
   (e.g. user clicked Stop, then clicked outside, then tried Esc),
   the engine's handler stops firing. Catch Esc on document so the
   keystroke always gets a chance to end the session. */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!engine) return;
  const st = stage.dataset.state;
  if (st !== "running" && st !== "ready") return;
  e.preventDefault();
  if (engine.startTs === 0) engine.startTs = performance.now();
  engine._stopped = true;
  engine.finish();
});

boot();
