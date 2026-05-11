---
layout: layouts/article.njk
title: "Tech stack"
eyebrow: "Under the hood"
lede: "How GuerillaType is built. A static site, vanilla JavaScript, no frameworks, no backend, no database. Open source under MIT."
description: "Tech stack: Eleventy v3, Nunjucks, vanilla CSS, vanilla JS, Cloudflare Pages, Bunny Fonts. No frameworks, no build tooling beyond Eleventy itself."
cta:
  title: "Source on GitHub"
  body: "Fork it, host your own copy, contribute back. MIT licensed."
  actions:
    - { label: "Open repo", url: "https://github.com/jonajinga/GuerillaType", primary: true }
    - { label: "Read the changelog", url: "/changelog/" }
---

## Site generator

[Eleventy v3](https://www.11ty.dev/) (ESM mode) with Nunjucks templates and Markdown content. Why Eleventy:

- No client-side framework runtime. Pages ship as static HTML.
- ESM data files let us share types and helpers between build and runtime.
- A custom `.css` extension concatenates partials at build time and minifies via [LightningCSS](https://lightningcss.dev/) — no `@import` waterfall.
- HTML is minified through [`@sardine/eleventy-plugin-tinyhtml`](https://www.npmjs.com/package/@sardine/eleventy-plugin-tinyhtml).
- Builds in ~320 ms cold for the entire site (~80 files, ~46 passthrough assets).

## Frontend

- **[instant.page](https://instant.page)** — ~1 KB script that preloads internal links on hover/touchstart so in-site navigation feels instant. No config; loaded once in `base.njk`.
- **CSS** — Vanilla, custom properties, no frameworks. ~37 partials concatenated into a single `global.css`. Tokens defined in [`tokens.css`](#); all themeable values land there.
- **Typography** — [Lora](https://fonts.bunny.net/fonts/fraunces) for display, [Inter](https://fonts.bunny.net/fonts/inter) for body, [JetBrains Mono](https://fonts.bunny.net/fonts/jetbrains-mono) for the typing surface and code. Served by [Bunny Fonts](https://fonts.bunny.net) (privacy-friendly Google Fonts mirror, GDPR-compliant, cookieless).
- **JavaScript** — Native ES modules. No bundler. Imported directly via `<script type="module">`.
- **No frameworks** — no React, Vue, Svelte, Tailwind, jQuery. The total runtime JS is ~24 modules totaling under 30 KB before compression.

## Typing engine internals

The engine has six small modules under [`src/assets/js/engine/`](#):

| Module | Responsibility |
| --- | --- |
| `input-capture.js` | Keystroke capture: `keydown` events, IME composition, paste-blocker, Backspace, Escape |
| `renderer.js` | Span-by-span DOM diff for the typing surface, caret positioning, line-scroll |
| `metrics.js` | Net wpm, raw wpm, accuracy, consistency (1 - coefficient-of-variation) |
| `typing-engine.js` | Orchestrator: state machine, end conditions, results bundle |
| `adaptive.js` | Per-character and per-bigram rolling model with Laplace smoothing |
| `wordpicker.js` | Weighted roulette-wheel sampler over a 1k/5k/10k word list |

## Data persistence

Everything in [`localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) under `tt:*` keys:

- `tt:profiles` — array of profile objects (name, settings, preferences, sessions, daily, hourly, perKey, perBigram, perFinger, perCharDetail, lessonResults, achievements, challengeBests, **bookProgress**, **corpusProgress**)
- `tt:active-profile` — currently active profile id
- `tt:custom-texts` — saved user-uploaded texts (each carries optional `meta: { kind, sourceId, author, year, source, meaning }` so corpus-page click-throughs can report completion back to the right item)
- `tt:meta` — schema version + migration record
- `tt:theme` — light/dark preference
- `tt:contribute-draft-<kind>` — auto-saved form drafts for the eight contribute pages
- `tt:testimonial-prompt-dismissed` — single flag, set when user dismisses the post-session "leave a testimonial" prompt
- `tt:lesson-best-<id>` — per-lesson personal bests (one key per cleared lesson)

Schema is versioned (currently v4) with forward-only migrations: v1→v2 adds `perFinger`, `perCharDetail`, `lessonResults`, `sessionsByLesson`, `hourly`, `bookProgress`, and a `preferences` subtree; v2→v3 resets `whitespaceMark` to `none` (the v2 default was too noisy); v3→v4 flips `showVirtualKeyboard` and `keyboardFingerColors` to `true` by default. `corpusProgress` is added lazily on read so existing profiles need no further migration.

Sessions are capped at 500 per profile (oldest dropped). Custom texts cap at 200 KB total per profile.

## Visualizations

Five hand-rolled SVG components, no chart library:

- **Keyboard heatmap** — `<rect>` per key from a layout matrix; fill interpolates from muted → accent → bad based on error rate or avg key time.
- **Trend line** — `path d="M..."` over the last 30 sessions, with min/max axis labels.
- **Contribution grid** — 53 × 7 `<rect>` cells, each fill bucketed by daily practice minutes.
- **Per-key bar chart** — top-12 horizontal bars sorted by avg key time.
- **Progress ring** — `stroke-dasharray = 2πr`, `stroke-dashoffset = 2πr * (1 − pct)`.

## Hosting

- **Cloudflare Pages** — static asset hosting, free tier covers more bandwidth than this site will ever need.
- **Cloudflare DNS** — already free.
- **Cloudflare Web Analytics** — optional, privacy-friendly, no cookies.
- **Umami** — optional self-hosted alternative if you bring your own.
- **Bunny Fonts** — free CDN for my two web fonts. No Google Fonts.

## Build tooling

- [`@11ty/eleventy@^3`](https://www.npmjs.com/package/@11ty/eleventy)
- [`@11ty/eleventy-plugin-rss@^2`](https://www.npmjs.com/package/@11ty/eleventy-plugin-rss)
- [`@sardine/eleventy-plugin-tinyhtml`](https://www.npmjs.com/package/@sardine/eleventy-plugin-tinyhtml)
- [`lightningcss`](https://lightningcss.dev/) — for production CSS minification
- [`luxon`](https://moment.github.io/luxon/) — date filters
- [`playwright`](https://playwright.dev/) — viewport audit + smoke tests
- [`rimraf`](https://www.npmjs.com/package/rimraf) — cross-platform `rm -rf`

## Performance budgets

| Asset | Budget | Notes |
| --- | --- | --- |
| Critical HTML | < 12 KB gz | Above-the-fold content + inlined no-flash theme script |
| `global.css` | < 25 KB gz | All partials, minified by LightningCSS |
| Engine bundle | < 18 KB gz | All `engine/` modules combined |
| Total page weight (home, cold) | < 80 KB gz | Including font subsets |

Target: 95–100 PageSpeed across all four categories on `/`, `/practice/`, and `/stats/`.

## License

MIT. See [GitHub](https://github.com/jonajinga/GuerillaType) for the full text. Fork freely; attribution appreciated but not required.
