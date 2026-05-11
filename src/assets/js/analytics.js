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
  sessionRestart: (props) => track("session_restart", props),
  sessionPaused: (props) => track("session_paused", props),
  sessionResumed: (props) => track("session_resumed", props),
  autoAdvance: (props) => track("auto_advance", props),
  autoAdvanceCancelled: (props) => track("auto_advance_cancelled", props),
  perfectSession: (props) => track("perfect_session", props),       // 100 % accuracy

  // Mode / config UI
  modeSelected: (props) => track("mode_selected", props),
  variantSelected: (props) => track("variant_selected", props),     // duration/words/quote-length
  sourceSelected: (props) => track("source_selected", props),       // lang / wordlist
  dropdownOpened: (props) => track("dropdown_opened", props),
  dropdownOptionSelected: (props) => track("dropdown_option_selected", props),
  randomMode: (props) => track("random_mode", props),
  mobileSheetOpened: (props) => track("mobile_sheet_opened", props),

  // Game
  gameStart: (props) => track("game_start", props),
  gameOver: (props) => track("game_over", props),
  gameModeSwitched: (props) => track("game_mode_switched", props),
  gameSpeedChanged: (props) => track("game_speed_changed", props),
  gameNewBest: (props) => track("game_new_best", props),

  // Library + corpus
  bookOpened: (props) => track("library_book_opened", props),       // book detail page view
  bookStarted: (props) => track("library_book_started", props),     // begin typing a chapter
  bookContinued: (props) => track("library_book_continued", props), // resume via "continue"
  bookChapterFinished: (props) => track("library_chapter_finished", props),
  corpusOpened: (props) => track("corpus_opened", props),           // /quotes/, /idioms/, /poetry/, /parables/
  corpusItemSelected: (props) => track("corpus_item_selected", props),
  corpusCompleted: (props) => track("corpus_completed", props),

  // Wordlists + drills + lessons + challenges
  wordlistOpened: (props) => track("wordlist_opened", props),
  drillStarted: (props) => track("drill_started", props),
  lessonStarted: (props) => track("lesson_started", props),
  lessonPassed: (props) => track("lesson_passed", props),
  lessonFailed: (props) => track("lesson_failed", props),
  challengeStarted: (props) => track("challenge_started", props),
  challengeCompleted: (props) => track("challenge_completed", props),
  challengeFailed: (props) => track("challenge_failed", props),

  // Achievements + streaks
  achievementUnlocked: (props) => track("achievement_unlocked", props),
  streakMilestone: (props) => track("streak_milestone", props),     // 7 / 30 / 100 / 365
  speedMilestone: (props) => track("speed_milestone", props),       // 50 / 75 / 100 wpm

  // Stats / dashboard
  statsViewed: (props) => track("stats_viewed", props),
  statsTabSwitched: (props) => track("stats_tab_switched", props),
  contribDayOpened: (props) => track("contrib_day_opened", props),
  statsExported: (props) => track("stats_exported", props),
  statsImported: (props) => track("stats_imported", props),
  statsReset: (props) => track("stats_reset", props),
  statsPrinted: (props) => track("stats_printed", props),

  // Profile management
  profileCreated: (props) => track("profile_created", props),
  profileSwitched: (props) => track("profile_switched", props),
  profileRenamed: (props) => track("profile_renamed", props),

  // Settings + theme + identity
  themeChanged: (props) => track("theme_changed", props),
  fontChanged: (props) => track("font_changed", props),
  caretStyleChanged: (props) => track("caret_style_changed", props),
  layoutChanged: (props) => track("layout_changed", props),
  prefToggled: (props) => track("pref_toggled", props),
  settingsViewed: (props) => track("settings_viewed", props),

  // Custom text
  customTextSaved: (props) => track("custom_text_saved", props),
  customTextLoaded: (props) => track("custom_text_loaded", props),
  customTextDeleted: (props) => track("custom_text_deleted", props),

  // Contributions + feedback
  contributeFormOpened: (props) => track("contribute_form_opened", props),
  contributeFormSubmitted: (props) => track("contribute_form_submitted", props),
  feedbackSent: (props) => track("feedback_sent", props),
  testimonialSubmitted: (props) => track("testimonial_submitted", props),
  thanksNoteSubmitted: (props) => track("thanks_note_submitted", props),

  // Navigation + discovery
  searchOpened: (props) => track("search_opened", props),
  searchPerformed: (props) => track("search_performed", props),
  megaMenuOpened: (props) => track("megamenu_opened", props),
  navItemClicked: (props) => track("nav_item_clicked", props),
  ctaClicked: (props) => track("cta_clicked", props),               // hero CTAs
  externalLinkClicked: (props) => track("external_link_clicked", props),

  // PWA / offline
  pwaInstalled: (props) => track("pwa_installed", props),
  offlineFallbackShown: (props) => track("offline_fallback_shown", props),

  // Daily ritual
  dailyQuoteCompleted: (props) => track("daily_quote_completed", props),
  dailyIdiomCompleted: (props) => track("daily_idiom_completed", props),
  dailyChallengeCompleted: (props) => track("daily_challenge_completed", props),

  // Performance / health
  perfTiming: (props) => track("perf_timing", props),               // LCP / FCP / TTI buckets
  jsError: (props) => track("js_error", props),

  // Catch-all for ad-hoc tracking. Use only with stable schemas.
  custom: (name, props) => track(name, props),
};

// Expose for inline onclicks in markup that want one-line tracking.
try { window.tt_track = (name, props) => track(name, props || {}); } catch {}
