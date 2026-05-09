---
layout: layouts/article.njk
title: "Features"
eyebrow: "What ships"
lede: "Everything that's built into GuerillaType today. No paywalls, no premium tier — every feature is available to every visitor on every device."
description: "Complete feature list: practice modes, adaptive engine, custom text, stats dashboard, profiles, themes, keyboard layouts."
cta:
  title: "Try it now"
  body: "All features are available immediately. No signup, no install."
  actions:
    - { label: "Start a quick test", url: "/practice/", primary: true }
    - { label: "Take a lesson", url: "/lessons/" }
---

## Practice modes

Six core modes. Pick one from the toolbar above the typing surface, or land directly via deep-link from anywhere on the site.

- **Time** — type for 15, 30, 60, 120, or 300 seconds. The most common test format.
- **Words** — type a fixed count of 10, 25, 50, or 100 words.
- **Quote** — type a curated literary quote in short, medium, long, or "epic" length buckets.
- **Zen** — untimed, endless. Stop when you stop. Good for warm-ups.
- **Adaptive** — generates words biased toward the keys and bigrams you struggle with most.
- **Custom** — type your own text. Drop a `.txt`, paste a chapter, or save a URL.

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

- **Lifetime totals** — sessions, characters typed, total practice time, best wpm, best accuracy, daily streak.
- **WPM trend** — last 30 sessions, hand-rolled SVG line chart.
- **Daily contribution grid** — 53 weeks × 7 days, GitHub-style heatmap of practice time.
- **Keyboard heatmap** — per-key error rate or speed, toggleable, themed via CSS custom properties.
- **Slowest keys** — top-12 horizontal bar chart sorted by avg key-down time.
- **Recent sessions** — last 12 with mode, wpm, accuracy, consistency.

All visualizations are vanilla SVG. No chart library.

## Profiles

Multi-profile per device. Each profile has its own settings, stats, model, and custom texts. Switch via the settings page; export the full dataset to JSON; import on another device.

## Themes &amp; layouts

Light + dark + system preference, with a no-flash inline script in `<head>`. Four keyboard layouts for the heatmap visualization (QWERTY, Dvorak, Colemak, Workman) — input handling always uses `KeyboardEvent.key`, so OS-level layout choice is what governs actual typing.

## Privacy by default

No accounts. No backend. No cookies. Everything lives in your browser's localStorage on this device. Privacy-friendly Umami and Cloudflare Web Analytics are optional and disabled by default.

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
