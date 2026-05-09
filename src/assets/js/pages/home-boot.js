/* Home page boot. Three jobs:
     1. Animate the hero -- one-time fade-in-up + rotating accent word.
     2. Fetch the daily quote and put it into the embedded typing card.
     3. Boot a slim TypingEngine instance so the user can type the
        quote inline. On finish, jump to /practice/?mode=quote&qid=<id>
        so the full results card + session record appear there. */

import { loadQuotes, dailyQuote } from "../engine/quotes.js";
import { TypingEngine } from "../engine/typing-engine.js";
import { recordSession } from "../engine/session-recorder.js";
import { AdaptiveModel } from "../engine/adaptive.js";
import { getActive } from "../profiles.js";

/* ── Hero animation ──────────────────────────────────────────────
   Trip the CSS fade-in-up by setting data-hero-title="ready", then
   start a 4-second word-swap on the accent rotor. Reduced-motion
   users get the static state with no rotation. */
(function initHeroAnimation() {
  const title = document.querySelector("[data-hero-title]");
  if (!title) return;
  // Defer to next frame so the initial style (opacity:0, translateY(12px))
  // applies before we swap to the "ready" state -- otherwise the browser
  // may collapse both into the final paint and the transition is skipped.
  requestAnimationFrame(() => { title.dataset.heroTitle = "ready"; });

  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const word = title.querySelector("[data-rotor-word]");
  if (!word || reduced) return;

  const WORDS = ["better", "faster", "cleaner", "smoother", "sharper", "calmer"];
  let i = 0;
  setInterval(() => {
    word.dataset.rotorState = "out";
    setTimeout(() => {
      i = (i + 1) % WORDS.length;
      word.textContent = WORDS[i];
      word.dataset.rotorState = "in";
    }, 380);  // matches the CSS transition duration
  }, 3400);
})();

const stage = document.getElementById("tt-stage");
const inputEl = document.getElementById("tt-input");
const textEl = document.getElementById("tt-text");
const hintEl = document.getElementById("tt-hint");
const liveEl = document.getElementById("home-typing-live");
const citeEl = document.getElementById("daily-cite");
const timerEl = document.getElementById("tt-progress-fill");

loadQuotes().then((qs) => {
  const q = dailyQuote(qs);
  if (!q) return;
  if (citeEl) citeEl.textContent = q.author ? `-- ${q.author}${q.year ? ` (${q.year})` : ""}` : "";

  if (!stage || !inputEl || !textEl || !hintEl) return;

  const profile = getActive();
  const model = new AdaptiveModel(profile, { layout: profile.settings && profile.settings.layout || "qwerty" });

  const engine = new TypingEngine({
    host: stage,
    inputEl,
    textEl,
    liveEl,
    hintEl,
    timerEl,
    mode: "quote",
    freedom: profile.settings && profile.settings.freedom !== false,
    caret: (profile.preferences && profile.preferences.cursorStyle) || (profile.settings && profile.settings.caret) || "line",
    adaptive: { onChar: (prev, ch, ok, ms) => model.record(prev, ch, ok, ms) },
    onFinish: (result) => {
      result.lang = "daily-quote";
      result.layout = (profile.settings && profile.settings.layout) || "qwerty";
      try { recordSession(result, model.serialize()); } catch (e) { console.warn(e); }
      // Hop into the full practice surface where the user can see the
      // proper results card, restart, or pick a longer quote.
      window.location.href = `/practice/?mode=quote&quote=id&qid=${encodeURIComponent(q.id)}&from=home`;
    },
    onRestart: () => {
      // Re-load the same quote on Tab+Enter restart.
      engine.start(q.text);
    },
  });
  engine.start(q.text);
}).catch((err) => {
  console.warn("[daily-quote]", err);
  if (textEl) textEl.textContent = "Couldn't load today's quote -- try refreshing.";
});
