/* Practice page bootstrap. Wires the typing-engine, mode bar, results
   card, and adaptive engine. Reads ?mode= ?duration= ?words= ?quote=
   from the URL on load to support deep links from the homepage. */

import { TypingEngine } from "../engine/typing-engine.js";
import { AdaptiveModel } from "../engine/adaptive.js";
import { buildPicker, uniformText } from "../engine/wordpicker.js";
import { recordSession } from "../engine/session-recorder.js";
import { byId as achievementById } from "../engine/achievements.js";
import { getActive, updateActive } from "../profiles.js";
import { loadQuotes, pickQuote, dailyQuote } from "../engine/quotes.js";
import { getLesson, lessonText } from "../engine/lesson-text.js";
import { buildSourceText, evaluateGoal } from "../engine/challenge-runner.js";
import { mountLiveKeyboard, showLiveKeyboard, highlightChar } from "../viz/live-keyboard.js";
import { mountLiveTicker, showLiveTicker, recordKeystroke, resetTicker, updateWpm as updateTickerWpm } from "../viz/live-ticker.js";
import { mountVirtualKeyboard, unmountVirtualKeyboard, highlightNextKey as vkbdNext } from "../engine/virtual-keyboard.js";
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
      q = state.quote === "daily" ? dailyQuote(all) : pickQuote(all, state.quote, state.quoteTag || "");
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
  if (state.mode === "custom") {
    const list = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]");
    const item = list.find((x) => x.id === state.customId) || list[0];
    if (!item) return "Add a custom text on the /custom/ page first.";
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
      const body = (item.segments || []).join(" ").trim();
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
    const seg = item.segments[state.customSeg % item.segments.length];
    return seg;
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
    || state.mode === "quote"
    || (state.mode === "lesson" && targetLen > 200);
  textEl.classList.toggle("tt-text--full", !!isLongFormPre);
  // Apply the "reader" book-page styling to every literary target:
  // books, quotes, and corpus content (idioms / parables / poems) that
  // the corpus pages route through custom mode with kind metadata.
  const isLiterary = state.mode === "book"
    || state.mode === "quote"
    || (state.mode === "custom" && state._customMeta && ["quote","idiom","parable","poem"].indexOf(state._customMeta.kind) !== -1);
  textEl.classList.toggle("tt-text--reader", !!isLiterary);
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
      // Esc commits a partial session -- useful for zen, adaptive, or
      // when the user wants to bail early and still save what they did.
      // _stopped flag prevents auto-advance from kicking in.
      if (engine && engine.running) {
        engine._stopped = true;
        engine.finish();
      }
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

  // Live aids — driven by per-profile preferences. Mounted on every
  // start so they pick up layout changes between sessions.
  const prefs = profile.preferences || {};
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

  // Mobile tap-to-type keyboard. Only mounts on touch devices and
  // only when the preference is on. Suppresses the OS soft
  // keyboard by setting inputmode="none" on the typing input.
  const isTouchLike = (() => {
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) return true;
      if (window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches) return true;
      if ("ontouchstart" in window) return true;
      if (navigator.maxTouchPoints > 0) return true;
    } catch {}
    return false;
  })();
  if (prefs.mobileKeyboard && isTouchLike) {
    mountVirtualKeyboard();
    document.body.classList.add("has-vkbd");
    const firstCh2 = Array.isArray(target) ? (target[0] && target[0][0]) : (target && target[0]);
    if (firstCh2) vkbdNext(firstCh2);
  } else {
    unmountVirtualKeyboard();
    document.body.classList.remove("has-vkbd");
  }
}

function renderChallengeHud() {
  // Tear down any old banner left over from previous versions.
  const oldBanner = document.getElementById("tt-challenge-hud");
  if (oldBanner) oldBanner.remove();

  const pill = document.getElementById("tt-challenge-pill");
  if (!pill) return;
  if (!activeChallenge) {
    pill.hidden = true;
    pill.innerHTML = "";
    pill.removeAttribute("data-tip");
    return;
  }
  const goalParts = [];
  if (activeChallenge.goal && activeChallenge.goal.wpm) goalParts.push(`${activeChallenge.goal.wpm} wpm`);
  if (activeChallenge.goal && activeChallenge.goal.acc) goalParts.push(`${activeChallenge.goal.acc}% accuracy`);
  pill.hidden = false;
  pill.innerHTML = `
    <span class="practice-bar__challenge-eyebrow">Challenge</span>
    <span class="practice-bar__challenge-name">${htmlEscape(activeChallenge.name)}</span>
    ${goalParts.length ? `<span class="practice-bar__challenge-goal">${goalParts.join(" · ")}</span>` : ""}
  `;
  // Surface the long blurb on hover via the existing tooltip system.
  if (activeChallenge.blurb) pill.setAttribute("data-tip", htmlEscape(activeChallenge.blurb));
  else pill.removeAttribute("data-tip");
}

function handleFinish(result) {
  result.lang = state.language;
  result.layout = state.layout;
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
      const bp = p.bookProgress[state.bookSlug] = p.bookProgress[state.bookSlug] || { typed: {}, lastChapter: 0, lastParagraphId: null };
      for (const pid of completedIds) {
        bp.typed[`${state.bookCh}:${pid}`] = { wpm: result.wpm, acc: result.accuracy, at: new Date().toISOString() };
      }
      bp.lastChapter = state.bookCh;
      if (completedIds.length) bp.lastParagraphId = completedIds[completedIds.length - 1];
      return p;
    });
  }
  // Universal auto-advance: any naturally-completed clean session
  // queues an advance. Suppressed when the user pressed Stop / Esc
  // (engine._stopped) so they aren't whisked away after explicitly
  // bailing out.
  const naturallyCompleted = !engine._stopped && (
    state.mode === "time" ||
    (result.endCursor || 0) >= (result.targetLen || 0)
  );
  if (naturallyCompleted && result.accuracy >= 80) {
    result._autoAdvance = true;
  }
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
  // Show a one-time "leave a testimonial" prompt after 10 lifetime
  // sessions. The dismissal flag persists in localStorage so we never
  // re-prompt — even if the count keeps climbing.
  const lifetimeSessions = ((profile.lifetime && profile.lifetime.sessions) || 0) + 1;
  let testimonialPrompt = "";
  try {
    const dismissed = localStorage.getItem("tt:testimonial-prompt-dismissed") === "true";
    if (!dismissed && lifetimeSessions >= 10) {
      testimonialPrompt = `
        <aside class="results__testimonial-prompt" id="tt-testimonial-prompt">
          <p>Enjoying GuerillaType? <a href="/contribute/testimonial/" data-tip="Submit a short testimonial -- helps the project and may appear on the reviews page if you opt in.">Leave a testimonial →</a></p>
          <button type="button" class="results__testimonial-dismiss" id="tt-testimonial-dismiss" aria-label="Dismiss this prompt" data-tip="Dismiss this prompt for the rest of the session.">×</button>
        </aside>`;
    }
  } catch {}
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
          retry:   `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`,
          list:    `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>`,
          adaptive:`<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4 6v6c0 5 3.4 9.5 8 10 4.6-.5 8-5 8-10V6l-8-4z"/></svg>`,
          stats:   `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-7"/></svg>`,
          book:    `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
          lesson:  `<svg class="results__btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
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
        return nextBtn + tail;
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
      if (b.dataset.mode) state.mode = b.dataset.mode;
      else if (b.dataset.duration) state.duration = parseInt(b.dataset.duration, 10);
      else if (b.dataset.words) state.words = parseInt(b.dataset.words, 10);
      else if (b.dataset.quote) state.quote = b.dataset.quote;
      else if (b.dataset.lang !== undefined) state.language = b.dataset.lang;
      else if (b.dataset.tag !== undefined) state.quoteTag = b.dataset.tag;
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

/* Dropdown open/close. Each .mode-bar__chev with
   data-dropdown-trigger="<mode>" toggles the panel with the matching
   data-dropdown attribute. Click outside or Esc closes any open
   panel. Only one panel open at a time. */
function bindModeDropdowns() {
  const triggers = document.querySelectorAll('.mode-bar__chev[data-dropdown-trigger]');
  const panels = document.querySelectorAll('.mode-bar__dropdown[data-dropdown]');
  if (!triggers.length) return;
  function closeAll() {
    triggers.forEach((t) => t.setAttribute("aria-expanded", "false"));
    panels.forEach((p) => { p.hidden = true; });
  }
  function openPanel(mode) {
    closeAll();
    const trigger = Array.from(triggers).find((t) => t.dataset.dropdownTrigger === mode);
    const panel = Array.from(panels).find((p) => p.dataset.dropdown === mode);
    if (!trigger || !panel) return;
    trigger.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    // Position via getBoundingClientRect since the panel is
    // position:fixed (escapes the toolbar's overflow clipping).
    if (window.matchMedia && !window.matchMedia("(max-width: 768px)").matches) {
      const r = trigger.getBoundingClientRect();
      const panelW = Math.min(420, window.innerWidth * 0.92);
      const desired = r.left;
      const max = window.innerWidth - panelW - 8;
      panel.style.top = (r.bottom + 6) + "px";
      panel.style.left = Math.max(8, Math.min(desired, max)) + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    } else {
      // Mobile bottom-sheet: clear top/left so the CSS rules win.
      panel.style.top = "";
      panel.style.left = "";
      panel.style.right = "";
      panel.style.bottom = "";
    }
  }
  triggers.forEach((trigger) => {
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = trigger.getAttribute("aria-expanded") === "true";
      if (isOpen) closeAll();
      else openPanel(trigger.dataset.dropdownTrigger);
    });
  });
  // Click outside any panel closes all.
  document.addEventListener("click", (e) => {
    if (e.target.closest(".mode-bar__dropdown")) return;
    if (e.target.closest(".mode-bar__chev")) return;
    closeAll();
  });
  // Esc closes.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const anyOpen = Array.from(triggers).some((t) => t.getAttribute("aria-expanded") === "true");
      if (anyOpen) {
        e.stopPropagation();
        closeAll();
      }
    }
  });
}

async function boot() {
  syncModeBar();
  hintEl.textContent = "Loading…";
  try {
    const target = await buildText();
    startEngine(target);
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
