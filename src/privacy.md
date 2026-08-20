---
layout: layouts/article.njk
title: "Privacy"
eyebrow: "Your data"
lede: "What I collect (almost nothing), what stays on your device (everything else), what your rights are."
description: "Privacy policy for GuerillaType — local-first by design. Sign-in is optional; no tracking, no ads, no third parties."
---

## Privacy at a glance

- **Signing in is optional.** Everything works signed out, exactly as it always has. There is no wall, no trial, no locked feature.
- If you don't sign in: no account, no email, no session cookie. Nothing about your typing leaves the device.
- If you do sign in: your own progress syncs to your own account so you can practise on more than one machine. Nobody else can see it.
- No third-party trackers. No Google Analytics, no Facebook Pixel, no Hotjar, no Segment. No ads, ever.
- Nothing you type is ever public. There are no public profiles and no shared text.

## What stays on your device

Whether or not you sign in, your browser holds the working copy:

- Profiles, settings, sessions, daily activity, custom texts.
- Per-key and per-bigram timing data used by the adaptive engine.
- Theme preference, keyboard layout selection.

This is in your browser's `localStorage` under keys prefixed `tt:`. Open dev tools → Application → Local Storage to see it. Clearing browser storage clears the local copy — and if you're signed in, signing in again brings it back.

## If you sign in

Sign-in exists for one reason: so a new laptop doesn't mean starting over, and clearing your browser doesn't lose a year of practice.

**How you sign in.** Google or GitHub. There is no password to choose, forget, or leak, because we never handle one. We ask your provider for your email address, your display name and your avatar URL — nothing else. We never receive your password, and we have no access to anything else in your Google or GitHub account.

**What the server stores.**

- Your email address, used to recognise you and to link a Google and a GitHub sign-in to the same account.
- A **generated** display handle, like `BrassKestrel482`. You can reroll it; you cannot type one. That's deliberate — see below.
- Your display name and avatar URL, as your provider reported them.
- Your practice data: profiles, session history, the adaptive model, achievements, settings and saved custom texts. Stored as compressed blobs, one per device, and readable only by you.

**One cookie.** A session cookie named `__Host-gt_session`. It is `HttpOnly`, so no script can read it, and it exists only to keep you signed in. It is not used for tracking and is not shared with anyone. That's the only cookie the site sets.

**Why handles are generated.** A username you can type is a username someone has to moderate — impersonation, slurs, harassment. Generating them removes that whole category rather than policing it. It also means there's no name of yours on our server that you didn't choose from a list.

## Your data, your call

- **Export** — Settings → Export JSON gives you your full profile, signed in or not.
- **Import** — Settings → Import JSON brings it back on another device.
- **Sign out everywhere** — Settings → Account. Ends every session on every device at once.
- **Delete your account** — removes your account, your sign-in links, every session, and every byte of practice data on the server. It is immediate and it is not recoverable. The copy in your browser is untouched, so you can carry on signed out.
- **Clear this device** — Settings → Clear all data wipes every `tt:` key from this browser.

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
- **Any link to your account.** Signing in does not change what analytics sees. Your account and your page views are never joined up — that was a deliberate decision when accounts were added, not an oversight.
- Cross-site tracking. Nothing follows you off this domain.
- Keystroke content or accuracy of individual characters.

Umami can be blocked by any privacy extension or by adding `umami.is` to a host blocklist; doing so does not affect the typing experience.

Cloudflare Web Analytics is wired in but disabled by default.

## Cookies

Signed out, this site sets no cookies at all. Your settings live in `localStorage`, which is functionally similar but stays on your device and is not sent with HTTP requests.

Signed in, there is exactly one: the `__Host-gt_session` cookie described above. It keeps you signed in and does nothing else. No tracking cookies, no third-party cookies, no advertising cookies — signed in or out.

