---
layout: layouts/article.njk
title: "Analytics"
eyebrow: "What I track"
lede: "Almost nothing leaves your device. The public Umami dashboard is embedded below — same view I look at, never paywalled."
description: "What GuerillaType's analytics actually track, plus the live public Umami dashboard. Privacy-first by design — no cookies, no personal data, full transparency."
cta:
  title: "Read the privacy policy"
  body: "Full statement on what stays on-device and what (if anything) is transmitted."
  actions:
    - { label: "Privacy policy", url: "/privacy/", primary: true }
    - { label: "Tech stack", url: "/tech-stack/" }
---

## Live dashboard

<div class="umami-embed">
  <iframe
    src="https://cloud.umami.is/share/Go6W5bgtCW47V4Gf"
    title="GuerillaType public Umami analytics dashboard"
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade"
    allow="clipboard-write"></iframe>
</div>

Open the dashboard in its own tab: [cloud.umami.is/share/Go6W5bgtCW47V4Gf](https://cloud.umami.is/share/Go6W5bgtCW47V4Gf).

## What I *don't* collect

- **No accounts** — there's nothing to sign up for.
- **No emails** — I never ask for one.
- **No cookies** — not for tracking, not for sessions, not for anything.
- **No fingerprinting** — no canvas tricks, no font enumeration, no audio API probing.
- **No third-party tracking pixels** — Google Analytics, Facebook Pixel, Hotjar, Segment: not present.
- **No keystroke logging** — your typing data lives in `localStorage` on this device. Not transmitted. Not aggregated. Not analyzed by us.

## What stays on your device

All of it:

- Your profiles, sessions, daily activity, streaks
- Per-character and per-bigram timing and error data
- Custom texts you upload
- Settings (theme, layout, language preference)

This is in your browser's `localStorage` under keys prefixed `tt:`. Open dev tools → Application → Local Storage to see it. Clearing browser storage clears it. Switching browsers means a fresh start (use the JSON export to bring it with you).

## Optional aggregate analytics

Two privacy-first analytics are wired into the site but **disabled by default**. The site operator can enable either or both by editing [`src/_data/site.js`](https://github.com/jonajinga/GuerillaType/blob/main/src/_data/site.js).

### Umami

[Umami](https://umami.is/) is a self-hosted, open-source, cookieless analytics platform. If enabled, it logs:

- Page URL visited (e.g. `/practice/`)
- Referrer URL (where you came from)
- Browser + OS (e.g. "Chrome on macOS")
- Screen size bucket
- Country (from IP, then IP discarded)

Umami does **not** log:

- IP addresses (discarded after country lookup)
- User agents in full
- Personal identifiers (no cookies, no localStorage)
- Cross-site behavior

### Cloudflare Web Analytics

[Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) is similar in scope. If enabled, it logs aggregate page views and Core Web Vitals (LCP, FID, CLS) for performance monitoring. No cookies, no personal data, GDPR-compliant.

## Why I have any analytics at all

Two reasons:

1. **Performance monitoring** — knowing if real users on real devices have a bad time loading the site. The Web Vitals data Cloudflare provides flags regressions I can't see in lab tests.
2. **Knowing if anyone uses it** — for an open-source project, aggregate page views tell us whether anyone is using the site at all. That informs where I put effort.

Neither requires identifying any individual visitor.

## How to opt out

Beyond running an ad-blocker (which already blocks both):

- Browser settings → Privacy → "Block third-party tracking" or equivalent.
- Add `umami.is` and `static.cloudflareinsights.com` to your blocklist.
- Use a privacy-respecting browser (Brave, Firefox with strict mode, etc.).
- Run [`uBlock Origin`](https://ublockorigin.com/) — recommended regardless.

None of these affect the typing experience.

## Server logs

Cloudflare Pages keeps short-lived edge access logs (standard for any web host). These are aggregate and used only for abuse mitigation. I don't query, mine, or correlate them.

## Data export

Settings → Export JSON gives you everything you've generated in a single file. You're free to take it elsewhere or delete it.

## Data deletion

Settings → Clear all data wipes everything from this device. Or just clear browser storage for this domain.

## Questions

Open an issue on [GitHub](https://github.com/jonajinga/GuerillaType/issues). I'll answer in public.
