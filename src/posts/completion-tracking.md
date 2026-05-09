---
title: "Completion tracking"
description: "How the site decides a quote, idiom, parable, poem, or book paragraph counts as finished, and how to undo it."
date: 2026-05-08
tags: [features]
eyebrow: "What changed"
---

Until this week, completion was loose. Open a book page, type two characters, hit Esc, and the page would show as finished. The same was true for quotes, idioms, parables, and poems.

Completion now depends on two conditions. The cursor must reach the end of the target, and the accuracy must be at least eighty percent. If either is false, the item stays unfinished.

The engine reports two numbers at the end of a session: how far the cursor traveled and how long the target was. The completion code compares the two. For a book page that contains several paragraphs, each paragraph carries a cumulative end offset, and only the paragraphs the cursor passed are marked finished. Type the first two paragraphs of a page, escape, and the rest of the page stays open.

## How to undo

Once you can see what is finished, you may want to undo. Books have a "Reset progress" button on each book detail page; it clears the typing record for that title only. The corpus pages — quotes, idioms, parables, poetry — show a small "Reset" button next to any row marked complete. A summary at the top of the list shows the total and offers a "Reset all" link when there is more than one.

Every prompt that asks "are you sure" now uses the styled dialog instead of the browser's built-in `confirm()`. The cancel button is focused by default, so a stray Enter does not trigger a destructive action.

## What it changes

Two things, both small. First, the corpus pages now reflect what you have actually typed. "Forty-seven of three hundred and twelve idioms" means forty-seven items typed all the way through. Second, reset is a real option, which means starting over no longer carries a cost.
