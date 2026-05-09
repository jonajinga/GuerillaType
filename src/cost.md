---
layout: layouts/article.njk
title: "Cost"
eyebrow: "Real numbers"
lede: "What it costs to run a free typing tutor for everyone, every day. Spoiler: not much. Here's the breakdown."
description: "What Guerilla Type costs to host and operate. Cloudflare Pages + Bunny Fonts on the free tier — total monthly bill is near zero."
cta:
  title: "Help keep it free"
  body: "Star the repo, file good bugs, contribute a feature. That's the whole funding model."
  actions:
    - { label: "Star on GitHub", url: "https://github.com/jonajinga/GuerillaType", primary: true }
    - { label: "Contribute", url: "https://github.com/jonajinga/GuerillaType/blob/main/CONTRIBUTING.md" }
---

## Monthly running costs

<div class="stat-row">
  <div class="stat-row__cell"><strong>$0</strong><span>Hosting</span></div>
  <div class="stat-row__cell"><strong>$0</strong><span>CDN</span></div>
  <div class="stat-row__cell"><strong>$0</strong><span>Fonts</span></div>
  <div class="stat-row__cell"><strong>$0</strong><span>Analytics</span></div>
  <div class="stat-row__cell"><strong>$0</strong><span>Database</span></div>
  <div class="stat-row__cell"><strong>~$12/yr</strong><span>Domain</span></div>
</div>

The total cash cost to keep this site running is the price of a `.com` domain renewal — about twelve dollars a year. Everything else fits in free tiers I'd never realistically exceed.

## Why it's so cheap

### Static hosting

The site is pre-rendered to plain HTML at build time. Cloudflare Pages serves the resulting files from edge nodes. There's no application server to provision, scale, or pay for. Cloudflare Pages' free tier includes:

- Unlimited bandwidth
- Unlimited requests
- 500 builds/month (I use ~20)
- Free TLS, free DNS, free DDoS protection

### No database

There is no database. Every user's data lives in their browser's `localStorage`. I never touch it, never store it, never have to back it up. The cost of "user data" is zero because I don't have any.

### No backend

There's no API server, no auth service, no queue, no cache layer. Every interactive feature — typing, stats, adaptive learning — runs in the visitor's browser using vanilla JavaScript.

### Free fonts

[Bunny Fonts](https://fonts.bunny.net) hosts my two web fonts at no charge. They're a privacy-friendly Google Fonts mirror — same fonts, different (and better) hosting policy.

### Privacy-friendly analytics

Cloudflare Web Analytics is free. Umami can be self-hosted on a $5/month VPS if needed, but the project doesn't run its own — operators who fork can decide.

## What does cost something

### Development time

The expensive resource is human attention. A typing tutor with this level of polish and stats — done well — takes weeks of focused engineering and design work. That's the actual investment.

The maintainers' time is donated. Contributors' time is donated. If you find this site useful, the most useful thing you can do is contribute back: file a thoughtful bug report, submit a PR, suggest a feature with a clear use case.

### Domain renewals

`.com` domains run roughly $12–15/year through standard registrars (Cloudflare Registrar, Namecheap, Porkbun). If the project ever runs short, the maintainer covers it personally.

## What I *won't* do for money

- No ads. Ever.
- No premium tier. Every feature is available to every visitor.
- No "freemium" gating of stats, modes, or features.
- No selling data. There's no data to sell — see the [Analytics page](/analytics/).
- No newsletter signup walls.
- No "donate" guilt-trip popups.

The site is free because the cost of running it is genuinely zero. Not because I'm trying to monetize you later.

## If you want to support the project

In rough order of usefulness:

1. Use it. Tell a friend who can't type.
2. Star the repo on GitHub. The metric isn't vanity — it's what helps new visitors trust the project.
3. File a precise bug report when something breaks.
4. Open a PR for a feature, fix, or improvement.
5. Sponsor a contributor directly via [GitHub Sponsors](https://github.com/sponsors) once that's set up.

## Cost transparency

If a meaningful cost ever shows up — say, a feature that genuinely needs a paid service — it gets documented here, on this page, with a number. Until then, the bill is the domain.
