---
layout: layouts/article.njk
title: "FAQ"
eyebrow: "Common questions"
lede: "How the engine works, where your data lives, why the keyboard heatmap shows what it shows. If your question isn't here, open a GitHub issue."
description: "Frequently asked questions about GuerillaType — how it works, what's stored, where it runs."
---

## What's the keyboard shortcut to restart?

`Tab` then `Enter` — two keys, in that order. Tab arms a "press Enter to restart" prompt; Enter within 2 seconds confirms; any other key cancels. The two-key combo prevents accidental restarts and avoids collisions with overlay tools (NVIDIA GeForce, etc.) that grab Alt+letter combinations. Old `Alt+R` no longer works.

## How does completion tracking work for books, quotes, idioms, parables, and poems?

A session marks an item complete only when **both** are true:

1. The cursor reached the end of the target (`endCursor >= targetLen`)
2. Accuracy was at least 80%

Type two characters and hit Esc, the item stays unticked. Type all the way through at 90%, it gets a green ✓. Per-item and bulk reset are available on every corpus list and book detail page.

## Why no em-dashes anywhere?

Em-dashes (`—`) aren't on a normal keyboard, so a typing tutor can't use them — the user can't physically produce the character. We replace them with `--` (typewriter convention). Same treatment for smart quotes (`""`, `''`) and ellipsis (`…`) which become straight ASCII. See the [blog post](/blog/why-no-emdash/) for the full rationale.

## How do I suggest a quote, drill, or other content?

Use the [Contribute hub](/contribute/). Eight forms cover quotes, books, parables, idioms, poems, drills, testimonials, and thanks notes. All free, no signup, powered by Web3Forms. Submissions come straight to me; approved testimonials appear on [/reviews/](/reviews/) and approved thanks notes on [/thanks-wall/](/thanks-wall/).

## Where is my data stored?

In your browser's `localStorage`, always. That's the working copy, and the editor never waits on the network — it's why typing stays instant and why the site works on a plane.

If you sign in, a copy also syncs to your account so a lost laptop isn't a lost year of practice. If you don't, nothing leaves the device. Either way, clearing browser storage clears the local copy — signed in, signing in again restores it. See [Privacy](/privacy/) for exactly what the server holds.

## Why does the heatmap show wrong keys for Dvorak / Colemak?

Input handling uses `KeyboardEvent.key`, which is whatever character your OS produces. The layout selector in Settings only controls how the heatmap visually arranges the keys. If you're typing in Dvorak with the OS, set the layout to Dvorak so the heatmap matches.

## Why is paste disabled?

Pasting would let you "type" thousands of words instantly and skew your stats. The keys you actually press are what builds the adaptive model. I block `paste` events and reject `inputType === "insertFromPaste"` — both belt and suspenders.

## Can I sync between devices?

Yes — sign in from Settings → Account, with Google or GitHub. Your profiles, stats, adaptive model, achievements and settings follow you to any device you sign in on.

Signing in is optional and always will be. Everything works signed out exactly as before, and Export/Import JSON still works if you'd rather move your data by hand.

The first time you sign in we'll offer to move this device's existing progress into your account. Nothing is deleted either way — the local copy stays put.

## What's the maximum custom text size?

200 KB total per profile. Long files are chunked into ~500-character segments at sentence boundaries so you can practice in pieces.

## Why an editorial style instead of pure mono?

Reading speed for long-form content (the lessons, FAQ, about) is highest with serif display headers and a generous line-height. The typing surface itself stays in monospace because typing tests need exact-width characters. The hybrid is intentional.

## I'm typing 250+ wpm and it says "flagged"

Sessions over 250 wpm are flagged as suspect and excluded from "best" totals. If you're genuinely that fast (legend), please open a GitHub issue — I'll raise the cap.

## Does the adaptive engine actually work?

Yes — type a few sessions and check `/stats/`. The keyboard heatmap will visibly redden the keys you struggle with most. Switch to `/practice/?mode=adaptive` and the words generated will be heavily weighted toward those keys. I use a per-character + per-bigram rolling model, EMA-blended with Laplace smoothing for low-sample keys. Read [Tech stack](/tech-stack/) for specifics.

## Can I use this offline?

Once loaded, mostly yes — the engine, all stats, and saved custom texts work without a network connection. Loading a fresh quote needs network, but everything else (practice, adaptive, custom, drills) runs locally.

## Why no leaderboards?

Accounts exist now, so the old answer ("they'd require a backend") no longer holds. The remaining reason still does: a global leaderboard rewards a different game than the one that makes you type better. Chasing a number on a 15-second burst is not practice.

If leaderboards do land, they'll be scoped to a **daily seeded challenge** — everyone gets the same text, the board resets tomorrow, and the server can verify the result. That's a fair contest rather than an all-time table nobody can catch. Your own personal bests will always work without any of it.

## Can I contribute?

Yes — [open an issue or PR](https://github.com/jonajinga/GuerillaType). Especially welcome:

- Better word lists (current ones are placeholder — looking for properly curated 1k/5k/10k common English).
- Additional keyboard layouts (BÉPO, Norman, etc.).
- Translations for non-English typing practice.
- Bug reports with reproducer steps.
