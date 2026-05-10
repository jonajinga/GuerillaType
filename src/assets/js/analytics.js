/* Umami analytics wrapper.
   No-op when umami isn't loaded (which is the default). Call
   sites stay clean; if site.umami.enabled is toggled on in
   _data/site.js + an umami snippet appears in <head>, every
   wrapped track() / pageview() reaches umami.

   Privacy contract: NEVER send user-typed content. NEVER send
   PII. Only mode names, structural keys (mode/lang/layout),
   numeric metrics, and stable public identifiers (book slugs,
   lesson IDs, achievement IDs). Anything that smells like
   user-generated text gets dropped at the call site, not here. */

let _debug = false;
try { _debug = localStorage.getItem("tt:analytics-debug") === "true"; } catch {}

function track(name, props) {
  if (_debug) console.log("[analytics]", name, props || {});
  try {
    if (window.umami && typeof window.umami.track === "function") {
      window.umami.track(name, props || {});
    }
  } catch {}
}

/* Convenience helpers for the most common events the codebase
   wants to fire. Keeping them as named functions makes the call
   sites self-documenting and centralises the schema. */
export const Analytics = {
  // Engine lifecycle
  sessionStart: (props) => track("session_start", props),
  sessionFinish: (props) => track("session_finish", props),
  sessionStopped: (props) => track("session_stopped", props),
  autoAdvance: (props) => track("auto_advance", props),
  autoAdvanceCancelled: (props) => track("auto_advance_cancelled", props),

  // Mode / config UI
  modeSelected: (props) => track("mode_selected", props),
  dropdownOpened: (props) => track("dropdown_opened", props),
  dropdownOptionSelected: (props) => track("dropdown_option_selected", props),
  randomMode: (props) => track("random_mode", props),

  // Game
  gameStart: (props) => track("game_start", props),
  gameOver: (props) => track("game_over", props),

  // Library + corpus
  bookStarted: (props) => track("library_book_started", props),
  bookContinued: (props) => track("library_book_continued", props),
  corpusCompleted: (props) => track("corpus_completed", props),

  // Curriculum
  lessonPassed: (props) => track("lesson_passed", props),
  achievementUnlocked: (props) => track("achievement_unlocked", props),

  // Settings + theme + identity
  themeChanged: (props) => track("theme_changed", props),
  prefToggled: (props) => track("pref_toggled", props),

  // Contributions
  feedbackSent: (props) => track("feedback_sent", props),

  // Daily ritual
  dailyQuoteCompleted: (props) => track("daily_quote_completed", props),

  // Catch-all for ad-hoc tracking. Use only with stable schemas.
  custom: (name, props) => track(name, props),
};

// Expose for inline onclicks in markup that want one-line tracking.
try { window.tt_track = (name, props) => track(name, props || {}); } catch {}
