---
title: "Practice with your own text"
description: "How to feed the practice surface anything you want, and why it is worth doing."
date: 2026-04-09
tags: [features]
eyebrow: "Features"
---

The [/custom/](/custom/) page lets you paste text and type it. The text stays on your device unless you share a run of it, and then it travels only in the part of the link after the `#`, which browsers never send to this site, and then only where you send the link. [What a share link carries](/privacy/#sharing-a-result-or-a-page). It is the most flexible mode in the site, and the most underused.

## What it does

Paste text, or drop a `.txt`, `.md`, `.epub` or `.pdf` file in. Whole books are fine -- the bodies go to IndexedDB, so nothing is trimmed at the old 512 KB ceiling.

Every saved text can then be read **two ways, and both are always available**:

**By segment.** The site chunks the text into typable segments at sentence and paragraph boundaries -- never mid-word. Each segment is about 500 characters and becomes one practice session. Good for chipping away at anything.

**By chapter.** The same text, divided at its own headings and read six paragraphs to a page -- the same reader the [library](/library/) uses for its public-domain books, with the same page counter, the same per-paragraph progress, and the same "next page" flow. An EPUB brings its own chapter list. A plain file is split on `CHAPTER I`, `Part 2`, roman numerals, all-caps headings and `#` markdown headings. If a text has no headings at all, the chapter view is simply the whole thing, six paragraphs at a time -- which is still a nicer way to read a long document than a segment counter.

Chapter progress is per paragraph, and it survives re-importing the same book: if the chapters come out differently the old marks are dropped rather than pointed at the wrong paragraphs.

One caveat worth knowing: a text you saved before this existed has only its segments stored, and segments are sentence chunks with the line breaks already taken out. The chapter view will find no headings in one of those and give you the whole text. Re-import the file and the real chapters come back.

## Why it is useful

The built-in word lists are good for benchmarks. Real text is different. Real text has names, technical terms, the same word three times in a row, your own particular grammatical tics. The benchmark word list cannot give you any of that.

Three things custom text does that nothing else does:

**It teaches your fingers your own writing.** Your name. Your company's name. The phrases you use a hundred times a week. Drill these once and they become automatic.

**It makes long-form practice tolerable.** A 2,000-word session of word-list typing is exhausting. The same 2,000 words from a book you like is something you can sit through.

**It works on any source.** A speech you are memorizing. A journal entry. A song lyric. A code review you wrote. The site does not care.

## Pin a text as a lesson

After saving, you can pin a custom text. It then appears at the bottom of the [/lessons/](/lessons/) page, alongside the built-in curriculum. Useful when you want to chip away at a long text over many sessions.

## Tips

**Strip page numbers and headers** before pasting from a PDF, or the typing surface will treat them as content. (A PDF dropped in as a file gets running heads and folios removed automatically; a copy-paste does not.)

**Keep the headings** if you want the chapter view. Deleting `CHAPTER I` lines from a pasted book leaves nothing to split on, and the import preview will tell you so before you save: it says how many chapters it found, or that it found none.

**Keep paragraphs together** -- the segmenter respects paragraph breaks, so a clean source produces clean segments. Run-on text gets chopped at sentence boundaries, which is fine but makes the breaks less natural.

**Avoid em-dashes and smart quotes.** The corpus rule for the site applies here too: replace `—` with `--`, `'` with `'`, `"` with `"`. The typing surface accepts the smart versions but they are harder to type.

## What it does not do

**It does not phone home.** The custom-text feature uses local storage, full stop. There is no upload, no sync, no telemetry. The one way the words travel is a share link you build yourself, and then they ride after the `#` -- the part of a link a browser never sends to this site, decoded in the browser of whoever opens it. It rides along with the link, so it goes wherever you send it, and anyone with that link can read the text. Share one only if you would publish it.

**It does not OCR images.** PDFs need to have a text layer. If a PDF was scanned but never OCR'd, you will get garbage. Run it through a tool that adds the text layer first.

**It does not format your text.** What you paste is what you type. If you want bold, italics, or headings rendered with style, the practice surface ignores them. It is a typing tutor, not a word processor.
