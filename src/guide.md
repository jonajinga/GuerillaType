---
layout: layouts/article.njk
title: "User guide"
eyebrow: "How to use the site"
lede: "A complete walkthrough of every mode, every page, every shortcut. Start anywhere, jump around with the table of contents on the left."
description: "Comprehensive user guide for GuerillaType — practice modes, lessons, drills, challenges, custom text, stats, settings, keyboard shortcuts."
cta:
  title: "Skip the guide"
  body: "Prefer to learn by doing? Jump straight in."
  actions:
    - { label: "Take a 30-second test", url: "/practice/?mode=time&duration=30", primary: true }
    - { label: "Open the lessons", url: "/lessons/" }
---

<div class="guide-search">
  <span class="guide-search__icon" aria-hidden="true">⌕</span>
  <input
    type="search"
    class="guide-search__input"
    id="guide-search-input"
    placeholder="Search this guide…"
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    aria-label="Search the user guide"
  >
  <span class="guide-search__count" id="guide-search-count" aria-live="polite"></span>
</div>
<script type="module" src="/assets/js/guide-search.js?v={{ cssVersion }}"></script>

## Quick start

If you want to skip ahead, here are the three fastest ways to begin.

- **Beginner** — open the [lessons](/lessons/), start with Lesson 1. Each lesson restricts the keyboard to a small key set so you can build muscle memory without distraction.
- **Casual** — hit the home page and type today's quote, or run a 30-second test from the top toolbar.
- **Pro** — jump into [adaptive mode](/practice/?mode=adaptive). The engine builds a model from a handful of sessions and starts targeting your weakest keys.

The site never asks you to sign up. Everything you do is saved to your browser's localStorage on this device.

## Practice modes

The typing surface lives at [/practice/](/practice/). The toolbar above the surface lets you switch modes without reloading.

### Time

Type for a fixed duration (15, 30, 60, 120, or 300 seconds). The most common test format. Words come from your current language list (default: English 1k common words).

Use this mode to measure your current speed.

### Words

Type a fixed count of words: 10, 25, 50, or 100. Ends after you finish the last word.

Use this mode when you want a defined finish line rather than a clock.

### Quote

Type a curated literary quote. Buckets: short (under 80 chars), medium (under 200), long (under 500), epic (over 500). One quote rotates per day across all visitors on the home page.

Use this mode when you want a more rewarding text than random words.

### Zen

Untimed and endless. Stops only when you press `Escape` or close the page. No score pressure, no goal.

Use this for warm-ups, recovery sessions, or just typing for its own sake.

### Custom

Type your own text. Drop a `.txt` or `.md`, paste a chapter into the textarea, or save a URL. Sanitized and chunked into ~500-character segments at sentence boundaries. Cap of 200 KB per profile.

Use this when you want to practice on something you actually want to read.

### Adaptive

The engine watches every keystroke you've ever typed on this device and generates words biased toward the keys and bigrams you struggle with most. Cold start (no data yet) falls back to uniform sampling.

Use this once you've done a few sessions in any other mode and want to drill your weak spots.

### Tape

Single horizontal line of words that scrolls left as the caret advances. Reads like a ticker — your eye locks onto the current word and the next one slides into the anchor position. 15-second sprint by default.

Use this when you want a focused, fast-burst session without the visual noise of multi-line wrapping.

### Idiom + Poem

Random English idiom (with meaning + region) or random public-domain poem. Each session draws a fresh item; tap the chevron next to the chip to open a length / era filter.

Use these for literary variety — typing a Frost stanza or a Shakespearean sonnet beats yet another lorem-ipsum drill.

## Games

Three typing mini-games at [/games/](/games/), all driven by your missed-words list. The picker pulls from your top mistypes (weighted by miss count) so playing IS targeted practice.

### Catch the Word

Words fall from the top of the stage. Type each one before it hits the bottom. Three misses ends the round. A streak multiplier (1.5x → 5x) builds with consecutive catches and color-escalates from accent → orange → red.

### Word Shooter

Words drift across the screen from left to right. Type each to shoot it down before it leaves the frame. Plane-crash explosion animation on catch.

### Endless

Same falling-word mechanic as Catch, but no 3-miss cap. Spawn rate ramps faster. Stops when you stop. Personal high score saved per device.

## Mobile

On phones, the practice toolbar shrinks to two rows: live stats on top, a single "current mode" summary chip below (e.g. `time · 30s · en-1k`). Tap the chip to open a full bottom sheet with every mode, variant, and source on tap-friendly 44 px chips. Tap the chevron next to time / words / quote in the sheet to expand its options inline.

Typing uses the OS soft keyboard (`inputmode="text"` on the input). Sessions never pause while you're typing — the engine refuses any pause request within 450 ms of the last keystroke.

## Lessons

Twenty-four progressive lessons take you from two-key home-row drills to fluent typing across the full keyboard, common bigrams, numbers, punctuation, and capitals.

Each lesson restricts the typing surface to its declared key set. Words come either from a filtered dictionary (every letter must be in the lesson's key set) or, for very small key sets, synthetic random groupings. To clear a lesson and unlock the next, hit at least 90% accuracy at 18 wpm.

The five stages:

1. **Home row** — the foundation. Lessons 1–7.
2. **Top + bottom rows** — adding the rest of the alphabet. Lessons 8–9.
3. **Numbers, punctuation, capitals** — Lessons 10–15.
4. **Common bigrams** — `th`, `er`, `ed`, `qu`, etc. Lessons 16–19.
5. **Review &amp; speed** — adaptive review and speed builders. Lessons 20–24.

Open the [lessons page](/lessons/) to see the whole curriculum at once.

## Drills

Drills are short, repetitive, focused practice on a single key cluster. The seven drills are:

- **Home row** — `asdfjkl;`
- **Top row** — `qwertyuiop`
- **Bottom row** — `zxcvbnm,./`
- **Left hand** — `qwertasdfgzxcvb`
- **Right hand** — `yuiopjklhnm`
- **Vowels** — `aeiou`
- **Alpha mix** — full alphabet, common-word emphasis

Use drills as warm-ups (30 seconds each) or to recover muscle memory after a slump.

## Challenges

Challenges are practice tests with concrete goals. You either hit the goal or you don't. Bests are tracked locally per profile.

- **Sprint** — 60 seconds, 60 wpm, 95% accuracy.
- **Marathon** — 5 minutes, 50 wpm, 96%.
- **100 Words / 500 Words** — endurance.
- **Quote Chase** — type a literary quote at speed.
- **Mountain Climb** — words get progressively harder as you climb.
- **Pangram Run** — every letter in the alphabet, in one sentence.
- **Numbers Gauntlet** — numbers only.
- **Punctuation Gauntlet** — apostrophes, hyphens, periods.
- **Code Mode** — function, const, return.
- **Zen** — no goal, no end.

Open the [challenges page](/challenges/) to see goals and your current bests.

## Custom text

The [custom text page](/custom/) is where you upload, paste, or save text to type. Three input methods:

- **Drop a file** — `.txt` or `.md`. Drag it onto the dashed box.
- **Paste** — copy text from anywhere, paste into the textarea, click Save.
- **Title** — give it a name so you can find it later.

What happens to your text:

1. **Sanitized** — `<script>` and `<style>` blocks removed. HTML tags stripped. Entities decoded. Control characters removed.
2. **Normalized** — line endings unified. Runs of three or more blank lines collapsed to two.
3. **Chunked** — split into roughly 500-character segments at sentence boundaries (`.`, `!`, `?` plus optional closing quote/bracket). You'll never split mid-word.
4. **Saved** — to your browser's localStorage under the active profile. Cap of 200 KB total per profile (across all texts).

To type a saved text: click the "Type" button on its card. Each segment is one practice round.

## Stats dashboard

The [stats page](/stats/) summarizes everything you've typed. Six components:

### Lifetime tiles

Total sessions completed, best wpm, best accuracy, current daily streak.

### Daily activity grid

GitHub-style heatmap with a Year / Month / Week toggle. Cells are bucketed by total practice time that day. Click any cell to drill into that day's session list with an hourly heat strip showing exactly when you typed.

### WPM trend

Last 30 sessions plotted as a line chart. Useful for spotting plateaus.

### Keyboard heatmap

Per-key error rate or speed (toggle), rendered on a layout matrix. Red keys are weak. Green/muted keys are strong.

### Slowest keys

Top-12 horizontal bar chart sorted by avg key-down time. The keys to focus on next.

### Recent sessions

Last 12 with mode, wpm, accuracy, and consistency.

## Settings

The [settings page](/settings/) groups everything tunable.

### Profile

- **Active profile** — switch between profiles (multiple per device).
- **New / Rename / Delete** — basic profile management.
- **Export JSON** — download your full profile as a single file.
- **Import JSON** — load a previously exported profile (merges by id).

### Practice

#### Word list

The pool the engine pulls from in **time**, **words**, and **adaptive** modes. Each option is a different vocabulary:

- **English 1k** — the 1,000 most common English words. The default. Best for warm-ups and pure speed.
- **English 5k** — top 5,000. Adds vocabulary like *infrastructure*, *paragraph*, *generally*. More variety, slightly slower.
- **English 10k** — top 10,000. Includes rarer words. Realistic prose-like distribution; harder for raw wpm but better for sustained reading-speed typing.
- **Code: JavaScript** — real JS tokens. `function`, `const`, `=>`, `return`, `=== null`. Includes braces, semicolons, indentation.
- **Code: Python** — `def`, `if __name__`, `lambda`, `import`. Pythonic syntax with colons, decorators, indentation.
- **Code: HTML** — tags, attributes, common patterns. `<div class="...">`, `<a href="...">`.
- **Punctuation** — focused drill on `. , ; : ? ! ' " ( ) [ ] { } - —`. Use this if your error rate spikes on quotes / parens.
- **Numbers** — focused drill on the digit row. Phone numbers, mixed integers, decimals.

Quote, custom-text, lesson, drill, and challenge modes ignore this setting — they use their own source.

#### Keyboard layout

QWERTY, Dvorak, Colemak, Workman. **Heatmap visualization only.** The typing engine reads `KeyboardEvent.key` directly from your OS, so it always knows what you actually pressed regardless of this setting. Set it to whatever layout you physically use so the heatmap key positions match your fingers.

#### Other

- **Caret style** — Line / Block / Underline. Visual cursor preference.
- **Allow forward typing past errors** — When off, you must correct mistakes before advancing.
- **Show live wpm during test** — Toggle the live counter in the toolbar.
- **Smooth caret motion** — Subtle animation between characters. Off feels lower-latency.

### Theme

Light / dark toggle. Auto-respects `prefers-color-scheme` on first visit; your choice is remembered.

### Danger zone

- **Reset model** — clear per-key and bigram data while keeping sessions and bests.
- **Clear all data** — wipe everything from this device.

## Keyboard shortcuts

### Practice surface

| Shortcut | Action |
| --- | --- |
| `Tab` then `Enter` | Restart current test. Tab arms a "press Enter to restart" prompt; Enter within 2 seconds confirms; any other key cancels |
| `Esc` | End the session, save it, return to the toolbar |
| `Backspace` | Rewind one character |
| `Ctrl + Backspace` | Rewind whole word |
| any printable key | Refocus the typing input |

### Site (works anywhere)

| Shortcut | Action |
| --- | --- |
| `Shift + ?` | Open the keyboard shortcuts overlay |
| `Ctrl + /` | Open the keyboard shortcuts overlay (alternate) |
| `Ctrl + K` | Open site search |
| `Esc` | Close any open overlay or modal |
| `Alt + T` | Toggle day / night theme |

### Quick navigation (Alt + letter)

| Shortcut | Action |
| --- | --- |
| `Alt + H` | Home |
| `Alt + P` | Practice surface |
| `Alt + L` | Lessons |
| `Alt + D` | Drills |
| `Alt + C` | Challenges |
| `Alt + Q` | Quotes |
| `Alt + B` | Library |
| `Alt + S` | Stats dashboard |
| `Alt + U` | User guide |
| `Alt + X` | Custom text |

`Alt + R` (the legacy restart shortcut) was retired because it collides with overlay tools like NVIDIA GeForce. Use `Tab` then `Enter` instead.

## Fullscreen

There's a fullscreen toggle in the site header (immediately right of the Settings cog). It calls the standard browser Fullscreen API and works on the home page, practice surface, library, and any other page. `F11` is also honored by the browser.

## Contribute hub

[/contribute/](/contribute/) is where you suggest content or send feedback. Eight forms, all powered by Web3Forms (no signup, no captcha):

- **Suggest a quote** — public-domain line, with author + source.
- **Suggest a book** — public-domain classic with a Project Gutenberg URL.
- **Suggest a parable** — Aesop, Zen, biblical, folk.
- **Suggest an idiom** — phrase, meaning, origin, region.
- **Suggest a poem** — pre-1929 sonnet, lyric, narrative.
- **Suggest a drill** — key cluster, bigram, finger isolation.
- **Leave a testimonial** — five-star rating; opt in to publish on [/reviews/](/reviews/).
- **Send a thanks note** — short message; opt in to publish on [/thanks-wall/](/thanks-wall/).

Every corpus list page (quotes, idioms, parables, poetry, library, drills) has a "Suggest a..." CTA at the bottom. The forms autosave drafts to localStorage so a refresh doesn't lose your work.

## Completion tracking + reset

When you finish typing a quote, idiom, parable, poem, or book paragraph the corresponding corpus item gets marked complete on your profile — but only if you actually typed all the way through (`endCursor >= targetLen`) at 80%+ accuracy. The two-condition gate prevents partial sessions from racking up false ✓ marks.

- On corpus list pages, completed rows show a green ✓ + a "Type again" button + a per-row "Reset" action.
- A summary at the top of each list shows total completed and offers a "Reset all (N)" affordance when applicable.
- On book detail pages, a "Reset progress" button next to "Continue typing" wipes all paragraph progress for that book.

All confirmation prompts use the styled modal system (focus-trapped, theme-aware, cancel button auto-focused on destructive actions).

## Profiles

Multiple profiles per device. Each profile has its own:

- Settings (theme, layout, language, freedom, caret style)
- Lifetime totals (sessions, chars, time, best wpm, streaks)
- Per-key and per-bigram timing model
- Session history (last 500)
- Daily activity buckets
- Achievements
- Saved custom texts

Switch profiles in Settings. The active profile is what the typing surface reads from and writes to.

To move profiles between devices: Export JSON on device A → Import JSON on device B. Profiles merge by id; new ones get appended.

## Privacy

Nothing leaves your device unless the site operator has enabled optional aggregate analytics, and even those don't carry personal data.

- Accounts are optional. Signed out, there's no signup and no email collected; signed in, your progress syncs across your devices and nothing is ever public.
- No cookies for tracking, sessions, or fingerprinting.
- No third-party tracking scripts.
- Optional Umami / Cloudflare Web Analytics (page-views only, no personal data, disabled by default).

See [Analytics](/analytics/) and [Privacy](/privacy/) for the full breakdown.

## Troubleshooting

### The typing surface is blurry

Click the surface or press any key — the input has lost focus. The blur is intentional so you know to refocus.

### Paste doesn't work

Paste is intentionally blocked. Pasting would let you "type" thousands of words instantly and skew your stats.

### My session was flagged as "suspect"

Sessions over 250 wpm are flagged and excluded from "best" totals. If you're genuinely that fast, [open a GitHub issue](https://github.com/jonajinga/GuerillaType/issues).

### The heatmap shows the wrong keys

Set Settings → Keyboard layout to match your actual OS layout (Dvorak, Colemak, Workman). Input always uses what your OS produces; the layout setting only positions the heatmap visually.

### My data disappeared

Browser data clears can wipe localStorage. Always Export JSON if you want a backup. Switching browsers also means a fresh start (bring your JSON across).

### The site won't load

Try a hard refresh (Ctrl+Shift+R). If that doesn't help, open dev tools, check for errors, and [file a bug](https://github.com/jonajinga/GuerillaType/issues) with the error text and your browser version.

## Where to go next

- New here? Open [Lesson 1](/practice/?lesson=1).
- Looking for a quick warm-up? [30-second test](/practice/?mode=time&duration=30).
- Curious how it's built? [Tech stack](/tech-stack/).
- Concerned about privacy? [Analytics](/analytics/).
- Found a bug? [GitHub issues](https://github.com/jonajinga/GuerillaType/issues).
