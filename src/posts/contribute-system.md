---
title: "The contribute hub"
description: "What the eight contribute forms do, where the data goes, and how a suggestion becomes a published quote."
date: 2026-05-08
tags: [features]
eyebrow: "What changed"
---

There is now a contribute hub at [/contribute/](/contribute/). It holds eight forms.

Six of them suggest content for the library: a quote, a book, a parable, an idiom, a poem, or a drill. Two are for feedback: a testimonial and a thank-you note.

Each form posts directly to [Web3Forms](https://web3forms.com). The submission lands in the project inbox. There is no account, no captcha, and no backend. The honeypot field handles spam.

Three small things make the forms easier to fill out.

The first is URL prefill. Every corpus list page (quotes, idioms, parables, poetry, library, drills) has a "Suggest a..." link at the bottom. Clicking it carries `?from=<page>` into the form so the confirmation page can point back to where you started.

The second is draft autosave. The form remembers what you have typed. If you close the tab or refresh, it is still there when you return. The draft clears on submit.

The third is the confirmation page. Every form redirects to `/thank-you/?for=<kind>`, and that single page reads the kind from the URL and tailors its message. A quote suggestion gets one response, a testimonial gets another. There is only one thank-you page to maintain.

## Why approval is required for testimonials and thanks notes

Reviews and thanks notes do not auto-publish. They arrive in the inbox. I read them. The ones the author opted in to publish are added to a small data file (`_data/reviews.js` or `_data/thanks_notes.js`) and rebuilt onto the site. This costs me a few minutes per submission and removes the risk of spam appearing on the wall. For a project of this size, it is the right tradeoff.

## What you can do today

If you have been using the site and want to give back, the most useful thing you can do is leave a [testimonial](/contribute/testimonial/). Reviews are how a free, no-account project earns trust with people who have not heard of it yet.

If you have a public-domain quote or book in mind, [send it](/contribute/). I will verify the source and add it to the next content batch.
