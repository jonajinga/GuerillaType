/* Home page boot. Three jobs:
     1. Animate the hero -- one-time fade-in-up + rotating accent word.
     2. Boot a slim TypingEngine in tape mode (15s sprint) so the
        visitor can jump straight into typing without leaving the home
        page.
     3. On finish, show an inline results popup with WPM / accuracy /
        chars and a row of next-action buttons (run-again, longer
        tape, tape-zen, switch mode). No redirect -- the visitor
        decides what's next without losing the home context. */

import { TypingEngine } from "../engine/typing-engine.js";
import { uniformText } from "../engine/wordpicker.js";
import { recordSession } from "../engine/session-recorder.js";
import { AdaptiveModel } from "../engine/adaptive.js";
import { getActive } from "../profiles.js";
import { Analytics } from "../analytics.js";

/* ── Hero animation ──────────────────────────────────────────────
   Trip the CSS fade-in-up by setting data-hero-title="ready", then
   start a 4-second word-swap on the accent rotor. Reduced-motion
   users get the static state with no rotation. */
(function initHeroAnimation() {
  const title = document.querySelector("[data-hero-title]");
  if (!title) return;
  requestAnimationFrame(() => { title.dataset.heroTitle = "ready"; });

  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const word = title.querySelector("[data-rotor-word]");
  if (!word || reduced) return;

  const WORDS = ["better", "faster", "cleaner", "smoother", "sharper", "calmer"];
  let i = 0;
  setInterval(() => {
    i = (i + 1) % WORDS.length;
    word.style.opacity = "0";
    setTimeout(() => { word.textContent = WORDS[i]; word.style.opacity = "1"; }, 220);
  }, 4000);
})();

/* ── Tape sprint engine ──────────────────────────────────────── */
const stage = document.getElementById("tt-stage");
const inputEl = document.getElementById("tt-input");
const textEl = document.getElementById("tt-text");
const hintEl = document.getElementById("tt-hint");
const liveEl = document.getElementById("home-typing-live");
const timerEl = document.getElementById("tt-progress-fill");
const resultsEl = document.getElementById("home-results");
const closeBtn = document.getElementById("home-results-close");
const againBtn = document.getElementById("home-results-again");

if (stage && inputEl && textEl && hintEl) {
  const profile = getActive();
  const layout = (profile.settings && profile.settings.layout) || "qwerty";
  const model = new AdaptiveModel(profile, { layout });

  let engine = null;

  function loadWords() {
    return fetch("/data/words/en-1k.json", { cache: "default" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));
  }

  function buildTarget(words) {
    // 80 random common words -- well over 15 seconds of typing at
    // any plausible speed, so the user never runs out of text mid-
    // sprint.
    return uniformText(words, 80);
  }

  function showResults(result) {
    if (!resultsEl) return;
    const wpm = Math.round(result.wpm || 0);
    const acc = Math.round(result.accuracy || 0);
    const chars = result.chars || result.correctChars || 0;
    const setVal = (sel, v) => {
      const el = resultsEl.querySelector(`[data-metric="${sel}"]`);
      if (el) el.textContent = v;
    };
    setVal("wpm", wpm);
    setVal("acc", acc + "%");
    setVal("chars", chars);
    resultsEl.hidden = false;
    requestAnimationFrame(() => resultsEl.classList.add("home-results--open"));
  }

  function hideResults() {
    if (!resultsEl) return;
    resultsEl.classList.remove("home-results--open");
    setTimeout(() => { resultsEl.hidden = true; }, 220);
  }

  function startSprint(words) {
    const target = buildTarget(words);
    if (engine) {
      try { engine.start(target); } catch {}
      return;
    }
    engine = new TypingEngine({
      host: stage,
      inputEl,
      textEl,
      liveEl,
      hintEl,
      timerEl,
      mode: "tape",
      duration: 15,
      freedom: profile.settings && profile.settings.freedom !== false,
      caret: (profile.preferences && profile.preferences.cursorStyle) || (profile.settings && profile.settings.caret) || "line",
      adaptive: { onChar: (prev, ch, ok, ms) => model.record(prev, ch, ok, ms) },
      onFinish: (result) => {
        result.lang = "en-1k";
        result.layout = layout;
        result.mode = "tape";
        result.duration = 15;
        try { recordSession(result, model.serialize()); } catch (e) { console.warn(e); }
        try {
          Analytics.sessionFinish({
            mode: "tape", lang: "en-1k", layout,
            wpm: Math.round(result.wpm || 0),
            acc: Math.round(result.accuracy || 0),
            duration: 15, chars: result.chars || 0,
            source: "home_sprint",
          });
        } catch {}
        showResults(result);
      },
      onRestart: () => { hideResults(); startSprint(words); },
    });
    engine.start(target);
  }

  loadWords()
    .then((words) => {
      // Boot the engine. The user clicks/taps the stage to focus,
      // first keystroke arms the timer -- same flow as /practice/.
      startSprint(words);
      // Restart wiring.
      if (againBtn) {
        againBtn.addEventListener("click", () => {
          hideResults();
          // Mark stopped so the engine restart path resets state.
          if (engine) engine._stopped = true;
          startSprint(words);
        });
      }
    })
    .catch((err) => {
      console.warn("[home-tape]", err);
      if (textEl) textEl.textContent = "Couldn't load the word list. Refresh to try again.";
    });

  if (closeBtn) closeBtn.addEventListener("click", hideResults);
}
