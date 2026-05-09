---
layout: layouts/article.njk
title: "Contact"
eyebrow: "Get in touch"
lede: "Bug reports, feature requests, or just typing notes. The form below sends straight to my inbox via Web3Forms — no account or backend on my side."
description: "Contact form for Guerilla Type. Sends to hello@guerillatype.com via Web3Forms."
cta:
  title: "Other ways to reach me"
  body: "Code-related discussion is best on GitHub Issues so the conversation is searchable."
  actions:
    - { label: "GitHub issues", url: "https://github.com/jonajinga/GuerillaType/issues", primary: true }
    - { label: "FAQ", url: "/faq/" }
---

## Send a message

<form id="contact-form" class="contact-form" action="{{ web3forms.endpoint }}" method="POST">
  <input type="hidden" name="access_key" value="{{ web3forms.accessKey }}">
  <input type="hidden" name="subject" value="Guerilla Type — contact form">
  <input type="hidden" name="from_name" value="guerillatype.com">
  <input type="hidden" name="contribution_kind" value="contact">
  <!-- Honeypot -->
  <input type="checkbox" name="botcheck" class="visually-hidden" tabindex="-1" autocomplete="off" aria-hidden="true">

  <div class="field">
    <label for="cf-name">Name</label>
    <input type="text" id="cf-name" name="name" required maxlength="120" autocomplete="name">
  </div>

  <div class="field">
    <label for="cf-email">Email</label>
    <input type="email" id="cf-email" name="email" required maxlength="200" autocomplete="email">
  </div>

  <div class="field">
    <label for="cf-topic">Topic</label>
    <select id="cf-topic" name="topic">
      <option value="bug">Bug report</option>
      <option value="feature">Feature request</option>
      <option value="content">Content suggestion (quote, book, lesson)</option>
      <option value="general">Just saying hello</option>
      <option value="other">Other</option>
    </select>
  </div>

  <div class="field">
    <label for="cf-message">Message</label>
    <textarea id="cf-message" name="message" required minlength="10" maxlength="4000" rows="6"></textarea>
    <span class="field__hint">Minimum 10 characters. Markdown is fine.</span>
  </div>

  <input type="hidden" name="redirect" value="{{ web3forms.redirectBase }}?for=contact">

  <button type="submit" class="btn btn--primary btn--big">Send</button>
  <p id="contact-status" class="contact-status" aria-live="polite"></p>
</form>

## Direct email

If you'd rather skip the form: [hello@guerillatype.com](mailto:hello@guerillatype.com).

## Response time

I read everything and reply when I can — usually within a few days. Bug reports with a clear reproducer get priority. Feature requests with a specific use case get priority too.

## What I'm looking for

- **Bug reports** — what you did, what happened, what you expected. Browser + OS helps.
- **Feature requests** — describe the user goal, not the implementation. "I want X so I can Y."
- **Curated content** — public-domain texts, additional quotes, language word-lists. PRs welcome.
- **Translation help** — if you'd like to add a non-English typing language, send a 1k common-words list.

## What I'm not doing

- Account systems, cloud sync, or anything that requires a backend.
- Multiplayer / leaderboards.
- Paid tiers.

If your idea fits within "free, open source, runs in the browser, no accounts" — it's probably welcome.
