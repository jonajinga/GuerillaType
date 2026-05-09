---
title: "Pick a theme that does not hurt your eyes"
description: "How to use the theme settings, font choices, and visual aids without overdoing it."
date: 2026-04-14
tags: [features]
eyebrow: "Features"
---

The site ships with twelve themes and ten typing fonts. The defaults are good. The other choices are good for some people. Here is when to change them.

## Light or dark

The first decision is light theme or dark. The toggle is in the header.

Most typists prefer dark. It produces less eye strain in low-light rooms, which is where most typing happens. Light is better in direct sunlight or with overhead fluorescents.

If your eyes are tired by mid-session, try the other one for a week. The "right" theme is the one that lets you type for thirty minutes without rubbing your eyes.

## Themed presets

Beyond light/dark there are eleven named presets in [Settings → Theme](/settings/) -- Solarized, Dracula, Nord, Gruvbox, One Dark, Tokyo Night, Catppuccin, Rose Pine, GitHub Dark, GitHub Light. They are color-palette swaps. They do not change anything functional.

Pick whichever matches the rest of your tools. If you use Solarized in your terminal, set Solarized here too. The continuity reduces the visual jolt when you switch contexts.

## Custom themes

Below the presets is a builder. Eight color pickers, one for each major token. Live preview to the right. You can save a custom theme and export it as JSON to share or import.

The builder runs a contrast check on every change. If you pick foreground and background colors that fail WCAG AA contrast (4.5:1 for normal text), you will see a warning and an auto-fix option that bumps lightness on whichever side preserves intent.

Use the builder if the preset palettes do not suit you. Skip it if they do.

## Typing font

The typing surface uses JetBrains Mono by default. The other fonts in [Settings → Typing font](/settings/) are:

- **Fira Code** -- ligatures (`==` becomes `≡`, `=>` becomes `⇒`, etc.). Some typists love them, some hate them. Try and see.
- **IBM Plex Mono** -- humanist, warmer.
- **Roboto Mono** -- neutral, narrow.
- **Source Code Pro** -- Adobe's classic, conservative.
- **Cascadia Code** -- Microsoft's terminal font.
- **Ubuntu Mono** -- softer geometry.
- **Comic Mono** -- Comic Sans in monospace. Surprisingly readable.
- **Iosevka** -- very narrow, dense.
- **System** -- whatever your OS provides as a default monospace.

The choice does not affect speed. It affects how long you can sit and type without the screen feeling cramped. If you find yourself squinting, your font is too narrow or too small. If letters blur together, your font is too dense.

## Visual aids

In [Settings → Visual aids](/settings/) there are toggles for:

- **Virtual keyboard** -- shows the next-expected key glowing on a small SVG keyboard below the typing surface. Useful for the first month of touch typing. Turn it off after that; otherwise you train your eyes to look at it instead of at the text.
- **Ticker** -- a strip of green/red cells showing your last 40 keystrokes. Useful if you want immediate feedback on accuracy. Distracting if you want flow.
- **Whitespace mark** -- show spaces and newlines as visible characters. Off by default. Turn on briefly if you suspect you are missing the spacebar.
- **Cursor style** -- block, line, underline, or none. Block cursors are easier to track on a busy screen. Line cursors blend in. None is for typists who do not want to see the cursor at all.

Default settings are tuned for new typists. Once you are running 60+ wpm, most of the visual aids are training wheels you can remove.
