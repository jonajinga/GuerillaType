---
title: "No em-dashes"
description: "Why the corpus replaces — with -- everywhere, plus the related rules for smart quotes and ellipses."
date: 2026-05-08
tags: [decisions]
eyebrow: "Decisions"
---

The em-dash is not on the keyboard.

This is a small fact, easily forgotten by anyone who relies on word processors that insert one whenever you type two hyphens. On macOS the em-dash is `Option+Shift+-`. On Windows it requires either an Alt code or a third-party utility. Most writers simply paste it.

For a typing tutor the situation is different. The user has to produce every character on screen with their fingers. If a target line contains a glyph the keyboard cannot make, the user is stuck. They either give up or learn a key combination they will not transfer to any other context.

So the corpus uses two hyphens.

## Two, not one

A single hyphen is also typeable, so why two? Two reasons.

A single hyphen already has a job. `Self-aware` is a hyphenated compound; it is not an interrupted clause. Collapsing every em-dash to a single hyphen would make compound words and clause breaks look identical, and it would make some sentences read as typos.

Double-hyphen is the older convention. Before word processors gained the em-dash glyph, English typing used `--` for exactly this purpose. It is what the typewriter did. It is not a workaround for a missing key. It is the original key for that mark.

## The same rule for quotes and ellipses

Smart quotes (`"`, `'`) become straight ASCII (`"`, `'`). The horizontal ellipsis (`…`) becomes three periods. The book ingest script applies this normalization automatically when a Project Gutenberg text is added.

The cost is a small one. The corpus reads less polished than it would with proper typography. The benefit is that everything in it can be typed without thinking. For a typing tutor the second is worth more than the first.

If you are sending a suggestion through the [contribute forms](/contribute/), the same rule applies. Use what your fingers can produce.
