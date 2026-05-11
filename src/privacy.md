---
layout: layouts/article.njk
title: "Privacy"
eyebrow: "Your data"
lede: "What I collect (almost nothing), what stays on your device (everything else), what your rights are."
description: "Privacy policy for GuerillaType — privacy-first by design, no accounts, no cookies, no third-party tracking."
---

## Privacy at a glance

- No accounts. No signup. No email collection.
- No cookies for tracking, sessions, or anything else.
- No third-party trackers (no Google Analytics, Facebook Pixel, Hotjar, Segment).
- No data leaves your device, except optional aggregate page-view analytics if the site operator has enabled them.

## What stays on your device

All of it:

- Profiles, settings, sessions, daily activity, custom texts.
- Per-key and per-bigram timing data used by the adaptive engine.
- Theme preference, keyboard layout selection.

This is in your browser's `localStorage` under keys prefixed `tt:`. Open dev tools → Application → Local Storage to see it. Clearing browser storage clears it.

## Optional aggregate analytics — currently active

This site runs **[Umami](https://umami.is/)** — a privacy-friendly, cookieless aggregate analytics platform. The full dashboard is public: see [/analytics/](/analytics/) for the live view, no login required.

**What Umami records:**

- Page URL visited (e.g. `/practice/`).
- Referrer URL (where you came from).
- Browser + OS (e.g. "Chrome on macOS").
- Screen size bucket.
- Country (derived from IP, then IP discarded).
- Event names + structural properties: which modes are picked, when sessions start / finish, which library books are opened, which settings get toggled. None of these include user-typed text, the actual quote / paragraph content, or any string the user input.

**What Umami does NOT record:**

- Cookies (none — Umami uses anonymous hash-based session keys).
- IP address (discarded after country lookup).
- Name, email, account, or any persistent identifier.
- Cross-site tracking. Nothing follows you off this domain.
- Keystroke content or accuracy of individual characters.

Umami can be blocked by any privacy extension or by adding `umami.is` to a host blocklist; doing so does not affect the typing experience.

Cloudflare Web Analytics is wired in but disabled by default.

## Cookies

This site uses no cookies. Your settings live in `localStorage`, which is functionally similar but stays on your device and is not sent with HTTP requests.

## Your data, your call

- **Export** — Settings → Export JSON gives you your full profile.
- **Import** — Settings → Import JSON brings it back on another device.
- **Delete** — Settings → Clear all data wipes everything from this device.
