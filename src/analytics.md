---
layout: layouts/article.njk
title: "Analytics"
eyebrow: "What I track"
lede: "Live dashboard of GuerillaType visitor activity. Powered by Umami, rendered with D3. No PII, no cookies, no third-party trackers."
description: "GuerillaType's analytics dashboard. Pageviews, sessions, top pages, geography, devices, browsers, and tracked events — all baked from the Umami API at build time."
cta:
  title: "Want the user-facing summary?"
  body: "Community typing data — WPM distributions, mode popularity, top books — lives at /community-stats/."
  actions:
    - { label: "Community stats", url: "/community-stats/", primary: true }
    - { label: "Privacy policy", url: "/privacy/" }
---

{% set d = communityStats %}
{% set dims = d.dimensions or {} %}
{% set site = d.site %}

<section class="ac-summary">
  <div class="ac-summary__cards">
    <div class="ac-summary__card">
      <span class="ac-summary__label">Visitors</span>
      <span class="ac-summary__value">{{ site.visitors if site else 0 }}</span>
      <span class="ac-summary__sub">unique, last 365 days</span>
    </div>
    <div class="ac-summary__card">
      <span class="ac-summary__label">Sessions</span>
      <span class="ac-summary__value">{{ site.visits if site else 0 }}</span>
      <span class="ac-summary__sub">total visits</span>
    </div>
    <div class="ac-summary__card">
      <span class="ac-summary__label">Pageviews</span>
      <span class="ac-summary__value">{{ site.pageviews if site else 0 }}</span>
      <span class="ac-summary__sub">across all pages</span>
    </div>
    <div class="ac-summary__card">
      <span class="ac-summary__label">Avg session</span>
      <span class="ac-summary__value">{{ ((site.totaltime / (site.visits or 1)) | round) if site else 0 }}s</span>
      <span class="ac-summary__sub">time on site</span>
    </div>
  </div>
</section>

<section class="ac-panel">
  <header class="ac-panel__head">
    <h2>Pageviews + sessions over time</h2>
    <p class="muted">Daily activity from the trailing 365 days. Solid line = pageviews, dashed line = unique sessions.</p>
  </header>
  <div class="ac-chart" data-chart="timeLine"></div>
  <div class="ac-legend">
    <span class="ac-legend__item"><span class="ac-legend__swatch ac-legend__swatch--primary"></span>Pageviews</span>
    <span class="ac-legend__item"><span class="ac-legend__swatch ac-legend__swatch--secondary"></span>Sessions</span>
  </div>
</section>

<div class="ac-grid">

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>Top pages</h2>
      <p class="muted">URL paths ranked by pageviews.</p>
    </header>
    <div class="ac-chart" data-chart="horizontalBars" data-series="pages"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>Tracked events</h2>
      <p class="muted">Named events fired by the practice surface, ranked by total count.</p>
    </header>
    <div class="ac-chart" data-chart="horizontalBars" data-series="topEvents"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>Top countries</h2>
      <p class="muted">Visitors by ISO country code (derived from IP, then IP discarded).</p>
    </header>
    <div class="ac-chart" data-chart="horizontalBars" data-series="countries"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>Devices</h2>
      <p class="muted">Proportional share of visitors by device class.</p>
    </header>
    <div class="ac-chart" data-chart="donut" data-series="devices"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>Browsers</h2>
      <p class="muted">Proportional share of visitors by browser engine.</p>
    </header>
    <div class="ac-chart" data-chart="donut" data-series="browsers"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>Operating systems</h2>
      <p class="muted">Proportional share of visitors by OS.</p>
    </header>
    <div class="ac-chart" data-chart="donut" data-series="os"></div>
  </section>

  <section class="ac-panel ac-panel--span-2">
    <header class="ac-panel__head">
      <h2>Top referrers</h2>
      <p class="muted">External sites sending traffic. Direct visits (no referrer) aren't counted here.</p>
    </header>
    <div class="ac-chart" data-chart="horizontalBars" data-series="referrers"></div>
  </section>

</div>

<script>window.__analyticsData = {{ d | dump | safe }};</script>
<script type="module">
  import { paintAll } from "/assets/js/viz/analytics-charts.js?v={{ cssVersion }}";
  paintAll(window.__analyticsData);
</script>

## What is tracked

- **Pageviews** — every route a visitor lands on.
- **Sessions** — anonymous, hash-based grouping of one visitor's pageviews. No cookies, no persistent identifier.
- **Events** — named user actions emitted by the practice surface: session lifecycle, mode picks, library opens, achievements, settings changes, and a few perf timings. Each event carries up to a handful of categorical properties. See [`src/assets/js/analytics.js`](https://github.com/jonajinga/GuerillaType/blob/main/src/assets/js/analytics.js) for the full list.
- **Geography** — country from IP, then IP discarded.
- **Device / browser / OS** — coarse fingerprint from User-Agent, no persistent tracking.

## What is NOT tracked

- The character stream you type. None of it leaves your browser.
- Cookies. Umami is cookieless.
- Cross-site activity. Nothing follows you off `guerillatype.com`.
- Identifiers tied to a real person (name, email, IP).

## Want the user-facing summary?

The community-typing stats live at [/community-stats/](/community-stats/) — WPM distributions, accuracy curves, top books typed, all bucketed and anonymized.
