---
layout: layouts/article.njk
title: "Features"
eyebrow: "What ships"
lede: "Everything that's built into GuerillaType today. No paywalls, no premium tier — every feature is available to every visitor, signed in or not."
description: "Complete feature list: practice modes, adaptive engine, custom text, stats dashboard, profiles, themes, keyboard layouts."
cta:
  title: "Try it now"
  body: "All features are available immediately. No signup, no install."
  actions:
    - { label: "Start a quick test", url: "/practice/", primary: true }
    - { label: "Take a lesson", url: "/lessons/" }
---

## Practice modes

Pick one from the toolbar above the typing surface, or land directly via deep-link from anywhere on the site. On mobile, tap the "current mode" summary chip to open the full picker as a bottom sheet.

- **Time** — type for 15, 30, 60, 120, or 300 seconds. The most common test format.
- **Words** — type a fixed count of 10, 25, 50, or 100 words.
- **Quote** — type a curated literary quote in short, medium, long, or "epic" length buckets.
- **Tape** — single horizontal line of words that scrolls left as the caret advances. 15-second sprint by default; reads like a ticker.
- **Idiom** — random English idiom with attribution.
- **Poem** — random public-domain poem.
- **Zen** — untimed, endless. Stop when you stop. Good for warm-ups.
- **Adaptive** — generates words biased toward the keys and bigrams you struggle with most.
- **Custom** — type your own text. Drop a `.txt`, paste a chapter, or save a URL.

## Games

Mini-games built on your missed-words list — sustained engagement when deliberate practice feels like a chore. Per-mode high scores saved locally.

- **Catch the Word** — words fall from the top, type each one before it hits the bottom. Three misses ends the round.
- **Word Shooter** — words drift across the screen horizontally; type each to shoot it down before it leaves the frame. Plane-crash explosion on catch.
- **Endless** — no 3-miss cap, spawn rate ramps faster. Personal high score tracked.

Visible combo multiplier (1.5x at 5 caught, 2x at 10, 3x at 20, 5x at 40) and score-pulse animation on every catch. "New best!" overlay at round end when you beat your record.

## Lessons

Twenty-four progressive lessons taking you from the home-row anchors through the full keyboard, common bigrams, and finally adaptive review. Each lesson restricts the typing surface to a focused key cluster and generates synthetic drills or filtered words from those keys only. Clear 90% accuracy at 18 wpm to unlock the next.

## Drills

Quick finger-row practice — home row, top row, bottom row, vowels, left hand, right hand. Targeted muscle-memory exercises in 30 seconds.

## Eleven challenges

- **Sprint** — 60 s at 60 wpm, 95% accuracy.
- **Marathon** — 5 min at 50 wpm, 96%.
- **100 Words / 500 Words** — endurance tests.
- **Quote Chase** — type a literary quote at speed.
- **Mountain Climb** — words get progressively harder as you climb.
- **Pangram Run** — every letter, every time.
- **Numbers Gauntlet** — numbers only.
- **Punctuation Gauntlet** — apostrophes, hyphens, periods.
- **Code Mode** — function, const, return.
- **Zen** — no goal, no end, no judgment.

Bests are tracked per profile.

## Adaptive engine

A rolling per-character and per-bigram model. Every keystroke records:

- error rate (Laplace-smoothed for low-sample keys)
- average key-down time normalized against your overall average
- bigram timing for transition pairs (`th`, `er`, `qu`)

The word picker uses a weighted roulette-wheel sampler against a 1k/5k/10k common-word list, biasing toward words that contain your weakest keys and bigrams.

Cold start (no data yet)? Falls back to uniform sampling.

## Custom text

Drop a `.txt` or `.md` file, paste any text into the textarea, or fetch a URL. Sanitized (HTML and scripts stripped, entities decoded), normalized (line endings, blank-line runs collapsed), and chunked into ~500-character segments at sentence boundaries. Cap of 200 KB per profile.

## Stats dashboard

D3-driven visualizations, lazy-loaded; hand-rolled SVG fallback if D3 fails to fetch.

- **Lifetime totals** — sessions, characters typed, total practice time, best wpm, best accuracy, daily streak.
- **WPM trend** — last 30 sessions as a line + area chart with rolling-mean overlay.
- **Daily activity** — Year / Month / Week toggle. Click any day cell to drill into that day's session list with hourly breakdown.
- **Keyboard heatmap** — per-key error rate or speed, toggleable.
- **Per-finger errors** — error rate × avg key time for all 10 fingers.
- **Per-key bars** — slowest keys, sortable.
- **Character report** — sortable per-character table: samples, errors, error %, avg ms, last seen.
- **Lesson trends** — WPM line per lesson across attempts.
- **Missed words** — top 20 words you struggle with most. "Practice these" CTA routes to the adaptive picker over missed-only.
- **Recent sessions** — last 30 with mode, wpm, accuracy, sparklines.
- **Achievements grid** — ~120 unlocks across speed, accuracy, streaks, volume, endurance, variety, mastery, time-of-day, easter eggs.
- **Mode bests** — personal best wpm/accuracy per mode + duration.

## Profiles

Multi-profile per device. Each profile has its own settings, stats, model, and custom texts. Switch via the settings page; export the full dataset to JSON; import on another device.

## Themes &amp; layouts

Light + dark + system preference, with a no-flash inline script in `<head>`. Four keyboard layouts for the heatmap visualization (QWERTY, Dvorak, Colemak, Workman) — input handling always uses `KeyboardEvent.key`, so OS-level layout choice is what governs actual typing.

## Privacy by default

Everything lives in your browser's localStorage, so the site is fast and works offline. Accounts are optional: sign in with Google or GitHub and your progress follows you between devices; stay signed out and nothing leaves this one. Nothing you type is ever public either way. The site runs [Umami](https://umami.is/) for cookieless aggregate analytics — the full dashboard is public at [/analytics/](/analytics/) — and it is never linked to your account.

## Mobile

- World-class toolbar: stats row + "current mode" summary chip that opens a bottom-sheet picker covering every mode, variant, and source.
- OS soft keyboard typing on practice + games (`inputmode="text"`, never `inputmode="none"`).
- Pause guard at the engine level — soft-keyboard taps can never pause mid-typing.
- 44 × 44 px touch targets across every interactive element.
- Service-worker auto-update: new builds reach phones without manual cache clears.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Tab` then `Enter` | Restart current test (two-key combo, 2-second arming window) |
| `Esc` | End the session, save it, return to the toolbar |
| `Backspace` | Rewind one character |
| `Ctrl + Backspace` | Rewind whole word |
| `Ctrl + K` | Open site search |
| `Shift + ?` | Show full shortcut overlay |
| `Alt + T` | Toggle day / night theme |
| `Alt + H` / `P` / `L` / `D` / `C` / `Q` / `B` / `S` | Quick-jump to Home / Practice / Lessons / Drills / Challenges / Quotes / Library / Stats |
| any printable key | Refocus the input on practice screens |

## Library + per-paragraph book progress

The `/library/` corpus ships full Project Gutenberg books split into ~500-character paragraphs. Per-paragraph progress is tracked locally — open a book days later and "Continue typing" picks up where you left off. Reset button per book wipes that book's progress without touching the rest of your data.

## Completion tracking

Every quote, idiom, parable, poem, and book paragraph you type all the way through (at 80%+ accuracy) gets a green ✓ on the corpus list pages. Per-row "Reset" undoes individual completion; "Reset all (N)" clears every completion for that kind. Esc-bailing partway through never marks an item complete.

## Contribute hub

Eight Web3Forms-backed forms at [/contribute/](/contribute/) let users suggest content (quotes, books, parables, idioms, poems, drills) or send feedback (testimonials, thanks notes). No signup, draft autosave, URL-param prefill from corpus pages. Approved testimonials appear on [/reviews/](/reviews/), approved thanks notes on [/thanks-wall/](/thanks-wall/).

## Blog + RSS

Notes on building GuerillaType at [/blog/](/blog/) — feature announcements, design decisions, the occasional rabbit hole. Atom RSS feed at [/feed.xml](/feed.xml). Each post has a sticky TOC, reading-progress bar, social-share row, prev/next nav, and a drop cap on the first paragraph.

## Fullscreen

A fullscreen toggle button sits next to Settings in the site header. Uses the standard browser Fullscreen API; `F11` works too.

## Accessibility

- WCAG 2.2 AA: 4.5:1 contrast for normal text, 3:1 for large.
- 44×44 px touch targets across the entire UI.
- Visible focus rings on every interactive element.
- Skip link to main content.
- `aria-current="page"` on active nav. `aria-live` regions for live stats.
- `prefers-reduced-motion` respected globally.
- Tested with WAVE.
