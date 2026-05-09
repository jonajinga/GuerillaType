---
layout: layouts/article.njk
title: "Privacy"
eyebrow: "Your data"
lede: "What I collect (almost nothing), what stays on your device (everything else), what your rights are."
description: "Privacy policy for Guerilla Type — privacy-first by design, no accounts, no cookies, no third-party tracking."
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

## Optional analytics

If the site operator has enabled them, this site may use:

- **Umami** — privacy-friendly, cookieless aggregate page-view analytics. No personal data, no cross-site tracking, no fingerprinting.
- **Cloudflare Web Analytics** — Cloudflare's privacy-focused analytics. No cookies, no personal data, GDPR-friendly.

Both are optional and disabled by default. Both can be blocked by any privacy extension; doing so does not affect the typing experience.

See the [Analytics page](/analytics/) for a full breakdown of what each one collects.

## Cookies

This site uses no cookies. Your settings live in `localStorage`, which is functionally similar but stays on your device and is not sent with HTTP requests.

## Your data, your call

- **Export** — Settings → Export JSON gives you your full profile.
- **Import** — Settings → Import JSON brings it back on another device.
- **Delete** — Settings → Clear all data wipes everything from this device.
