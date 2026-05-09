---
title: "Practice with your own text"
description: "How to feed the practice surface anything you want, and why it is worth doing."
date: 2026-04-09
tags: [features]
eyebrow: "Features"
---

The [/custom/](/custom/) page lets you paste text and type it. The text stays on your device. It is the most flexible mode in the site, and the most underused.

## What it does

Paste up to 200 KB of text. The site chunks it into typable segments at sentence and paragraph boundaries -- never mid-word. Each segment becomes one practice session. You move through them at your own pace, and your progress is saved locally.

Drag a .txt file in, and it does the same thing.

## Why it is useful

The built-in word lists are good for benchmarks. Real text is different. Real text has names, technical terms, the same word three times in a row, your own particular grammatical tics. The benchmark word list cannot give you any of that.

Three things custom text does that nothing else does:

**It teaches your fingers your own writing.** Your name. Your company's name. The phrases you use a hundred times a week. Drill these once and they become automatic.

**It makes long-form practice tolerable.** A 2,000-word session of word-list typing is exhausting. The same 2,000 words from a book you like is something you can sit through.

**It works on any source.** A speech you are memorizing. A journal entry. A song lyric. A code review you wrote. The site does not care.

## Pin a text as a lesson

After saving, you can pin a custom text. It then appears at the bottom of the [/lessons/](/lessons/) page, alongside the built-in curriculum. Useful when you want to chip away at a long text over many sessions.

## Tips

**Strip page numbers and headers** before pasting from a PDF, or the typing surface will treat them as content.

**Keep paragraphs together** -- the segmenter respects paragraph breaks, so a clean source produces clean segments. Run-on text gets chopped at sentence boundaries, which is fine but makes the breaks less natural.

**Avoid em-dashes and smart quotes.** The corpus rule for the site applies here too: replace `—` with `--`, `'` with `'`, `"` with `"`. The typing surface accepts the smart versions but they are harder to type.

## What it does not do

**It does not phone home.** Your text never leaves your browser. The custom-text feature uses local storage, full stop. There is no upload, no sync, no telemetry.

**It does not OCR images.** PDFs need to have a text layer. If a PDF was scanned but never OCR'd, you will get garbage. Run it through a tool that adds the text layer first.

**It does not format your text.** What you paste is what you type. If you want bold, italics, or headings rendered with style, the practice surface ignores them. It is a typing tutor, not a word processor.
