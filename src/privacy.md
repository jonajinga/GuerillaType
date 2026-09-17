---
layout: layouts/article.njk
title: "Privacy"
eyebrow: "Your data"
lede: "What I collect (almost nothing), what stays on your device (everything else), what a share link carries, what your rights are."
description: "Privacy policy for GuerillaType — privacy-first by design, no accounts, no cookies, no third-party tracking."
---

## Privacy at a glance

- No accounts. No signup. No email collection.
- No cookies for tracking, sessions, or anything else.
- No third-party trackers (no Google Analytics, Facebook Pixel, Hotjar, Segment).
- Nothing leaves your device unless you press Share. The one thing running in the background is cookieless page-view analytics, and it never carries what you typed.

## What stays on your device

All of it:

- Profiles, settings, sessions, daily activity, custom texts.
- Per-key and per-bigram timing data used by the adaptive engine.
- Theme preference, keyboard layout selection.

This is in your browser's `localStorage` under keys prefixed `tt:`. Open dev tools → Application → Local Storage to see it. Clearing browser storage clears it.

<h2 id="sharing-a-result-or-a-page">Sharing a result or a page</h2>

Pressing Share is the only way anything about your typing leaves this device. Nothing is shared until you press it, and what gets built is a link.

**What the link carries where a server can see it.** Numbers: wpm, raw wpm, accuracy, consistency, duration and character counts. Then the mode, the word list, the keyboard layout, whether the run was a personal best, whether a challenge was cleared, the date, and a public content id saying which quote, book page, poem, idiom, parable, lesson, challenge or drill you typed. That is everything the site puts before the `#`. It never carries the text you typed, the title of a custom text, or your keystrokes.

**What travels after the `#`.** When the text is not something this site already has -- a custom text of your own -- the words ride in the fragment, the part of a link after `#`. So does the keystroke replay, when a run has one. Browsers never send that part to any server: it goes to the share page and is decoded there, in the browser of whoever opened it. Which is the other half of the point: anyone holding the link can read everything in it. A share link is public. Treat it that way.

**The preview image.** The card that X, Slack or iMessage shows is a file written when the site is built. There is one per public quote, idiom, parable, poem, book, lesson, challenge and drill, plus a grid of result cards covering every whole number of wpm up to 200, one card for anything faster, each crossed with an accuracy band. Nothing is drawn per visitor, so no server ever receives your run in order to paint a picture of it. Cloudflare's standard edge logs record the request for a share link the same way they record the request for any other page on the site.

**Analytics and the share page.** The page a share link opens loads no analytics at all, so nothing about a shared result is counted or reported. Everywhere else on this site, the analytics script is told to record a page's address without its query and without the part after the `#`.

**Custom texts.** A custom text lives only on the device that made it, so only you can share it, and only your link carries the words, in the fragment. The pre-built preview image can never show a custom text: the machine that drew it never had the text.

## Optional aggregate analytics — currently active

This site runs **[Umami](https://umami.is/)** — a privacy-friendly, cookieless aggregate analytics platform. The full dashboard is public: see [/analytics/](/analytics/) for the live view, no login required.

**What Umami records:**

- The address of the page, without its query and without the part after `#`. The tracker is loaded with `data-exclude-search` and `data-exclude-hash`, so `/practice/?book=custom:c_9f3a1b` is recorded as `/practice/`.
- Referrer URL (where you came from).
- Browser + OS (e.g. "Chrome on macOS").
- Screen size bucket.
- Country (derived from IP, then IP discarded).
- Event names + structural properties: which modes are picked, when sessions start / finish, which library books are opened, which settings get toggled. None of these include user-typed text, the actual quote / paragraph content, or any string the user input. That still holds for a shared result, and the share page goes further: it loads no analytics at all, so nothing on it is counted or reported.

**What Umami does NOT record:**

- Cookies (none — Umami uses anonymous hash-based session keys).
- IP address (discarded after country lookup).
- Name, email, account, or any persistent identifier.
- Cross-site tracking. Nothing follows you off this domain.
- Keystroke content or accuracy of individual characters.

Umami can be blocked by any privacy extension or by adding `umami.is` to a host blocklist; doing so does not affect the typing experience.

Cloudflare Web Analytics is wired in and switched off. Umami is the only analytics this site runs.

## Cookies

This site uses no cookies. Your settings live in `localStorage`, which is functionally similar but stays on your device and is not sent with HTTP requests.

## Your data, your call

- **Export** — Settings → Export JSON gives you your full profile.
- **Import** — Settings → Import JSON brings it back on another device.
- **Delete** — Settings → Clear all data wipes everything from this device.
