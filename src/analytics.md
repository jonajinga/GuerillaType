---
layout: layouts/base.njk
title: "Analytics"
description: "GuerillaType's analytics dashboard. Pageviews, sessions, top pages, geography, devices, browsers, and tracked events — all baked from the Umami API at build time."
pageSlug: analytics
---

{% set d = communityStats %}
{% set site = d.site %}

<header class="page__head">
  <p class="page__eyebrow">What I track</p>
  <h1>Analytics</h1>
  <p class="page__subtitle">Live dashboard of GuerillaType visitor activity. Powered by <a href="https://umami.is" target="_blank" rel="noopener">Umami</a>, rendered with D3. No PII, no cookies, no third-party trackers.</p>
  <p class="page__sub muted">
    Site totals: trailing 365 days. Time-series chart: trailing 30 days (hourly &rarr; daily). Snapshot taken {{ d.updatedAt or "&mdash;" }}.
    Community-facing summary lives at <a href="/community-stats/">/community-stats/</a>.
  </p>
</header>

<section class="ac-summary">
  <div class="ac-summary__cards">
    <div class="ac-summary__card">
      <span class="ac-summary__label">Visitors</span>
      <span class="ac-summary__value">{{ site.visitors if site else 0 }}</span>
      <span class="ac-summary__sub">unique visitors over the trailing 365 days. Hash-based grouping, no cookies.</span>
    </div>
    <div class="ac-summary__card">
      <span class="ac-summary__label">Sessions</span>
      <span class="ac-summary__value">{{ site.visits if site else 0 }}</span>
      <span class="ac-summary__sub">total visits across all visitors. A new session opens after 30 min of inactivity.</span>
    </div>
    <div class="ac-summary__card">
      <span class="ac-summary__label">Pageviews</span>
      <span class="ac-summary__value">{{ site.pageviews if site else 0 }}</span>
      <span class="ac-summary__sub">every route a visitor lands on, across all sessions.</span>
    </div>
    <div class="ac-summary__card">
      <span class="ac-summary__label">Avg session</span>
      <span class="ac-summary__value">{{ ((site.totaltime / (site.visits or 1)) | round) if site else 0 }}s</span>
      <span class="ac-summary__sub">mean time on site per session, in seconds.</span>
    </div>
  </div>
</section>

<div class="ac-stack">

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>01 &middot; Pageviews + sessions over time</h2>
      <p class="muted">Daily activity from the trailing 365 days. <strong>Solid line</strong> = pageviews, <strong>dashed line</strong> = unique sessions. <strong>X</strong> = date, <strong>Y</strong> = count.</p>
    </header>
    <div class="ac-chart" data-chart="timeLine"></div>
    <div class="ac-legend">
      <span class="ac-legend__item"><span class="ac-legend__swatch ac-legend__swatch--primary"></span>Pageviews</span>
      <span class="ac-legend__item"><span class="ac-legend__swatch ac-legend__swatch--secondary"></span>Sessions</span>
    </div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>02 &middot; Top pages</h2>
      <p class="muted">URL paths ranked by pageviews. The bar width reflects raw pageview count.</p>
    </header>
    <div class="ac-chart" data-chart="horizontalBars" data-series="pages"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>03 &middot; Tracked events</h2>
      <p class="muted">Named events fired by the practice surface, ranked by total count. See the full list of tracked events in <a href="/privacy/">privacy</a>.</p>
    </header>
    <div class="ac-chart" data-chart="horizontalBars" data-series="topEvents"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>04 &middot; Top countries</h2>
      <p class="muted">Visitors by ISO country code, derived from IP at request time and then discarded. No IP is stored.</p>
    </header>
    <div class="ac-chart" data-chart="horizontalBars" data-series="countries"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>05 &middot; Devices</h2>
      <p class="muted">Proportional share of visitors by device class (desktop / mobile / tablet). Coarse User-Agent fingerprint, no persistent tracking.</p>
    </header>
    <div class="ac-chart" data-chart="donut" data-series="devices"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>06 &middot; Browsers</h2>
      <p class="muted">Proportional share of visitors by browser engine.</p>
    </header>
    <div class="ac-chart" data-chart="donut" data-series="browsers"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>07 &middot; Operating systems</h2>
      <p class="muted">Proportional share of visitors by OS.</p>
    </header>
    <div class="ac-chart" data-chart="donut" data-series="os"></div>
  </section>

  <section class="ac-panel">
    <header class="ac-panel__head">
      <h2>08 &middot; Top referrers</h2>
      <p class="muted">External sites sending traffic. Direct visits (no referrer) aren't counted here.</p>
    </header>
    <div class="ac-chart" data-chart="horizontalBars" data-series="referrers"></div>
  </section>

</div>

<section class="prose ac-prose">

## What is tracked

- **Pageviews** &mdash; every route a visitor lands on.
- **Sessions** &mdash; anonymous, hash-based grouping of one visitor's pageviews. No cookies, no persistent identifier.
- **Events** &mdash; named user actions emitted by the practice surface: session lifecycle, mode picks, library opens, achievements, settings changes, and a few perf timings. Each event carries up to a handful of categorical properties. See [`src/assets/js/analytics.js`](https://github.com/jonajinga/GuerillaType/blob/main/src/assets/js/analytics.js) for the full list.
- **Geography** &mdash; country from IP, then IP discarded.
- **Device / browser / OS** &mdash; coarse fingerprint from User-Agent, no persistent tracking.

## What is NOT tracked

- The character stream you type. None of it leaves your browser.
- Cookies. Umami is cookieless.
- Cross-site activity. Nothing follows you off `guerillatype.com`.
- Identifiers tied to a real person (name, email, IP).

## Want the user-facing summary?

The community-typing stats live at [/community-stats/](/community-stats/) &mdash; WPM distributions, accuracy curves, top books typed, all bucketed and anonymized.

</section>

<script>window.__analyticsData = {{ d | dump | safe }};</script>
<script type="module">
  import { paintAll } from "/assets/js/viz/analytics-charts.js?v={{ cssVersion }}";
  paintAll(window.__analyticsData);
</script>
