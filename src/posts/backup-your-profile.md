---
title: "Back up your profile"
description: "Your data lives in your browser. Export it now and again."
date: 2026-04-18
tags: [features]
eyebrow: "Features"
---

Every session you run is stored on your computer. Not on a server. Not in a cloud. Just in your browser's local storage. If you clear your browser data, the profile goes with it.

The site has an export button. Use it.

## Where the profile lives

Your sessions, achievements, lesson bests, missed words, settings -- everything -- sits in `localStorage` under the key `tt:profiles`. It is one JSON blob. The site reads and writes it; nothing else does.

This is good for privacy. It is bad for portability. If you want the same profile on your laptop and your desktop, you have to move it yourself.

## Export

Open [Settings → Backup](/settings/). Click Export JSON. A file downloads. The filename is `guerillatype-profile-<date>.json`.

The file is small -- usually under 100 KB even after months of use. Save it where you save other backups. Email it to yourself. Whatever fits your habits.

## Import

On another browser, or after clearing data, open Settings and click Import JSON. Select the file. The profile loads.

Importing replaces the current profile. There is no merge. If you imported once and have since done more sessions, importing the same file again will lose those new sessions. Export before importing.

## What is in the file

The export is plain JSON. You can open it in any text editor. The schema is documented at the top of [src/assets/js/storage.js](https://github.com/jonajinga/GuerillaType/blob/main/src/assets/js/storage.js) if you are curious. The relevant fields:

- `sessions` -- every session, with timestamp, mode, wpm, accuracy, and the original target text.
- `lifetime` -- aggregate counters.
- `daily`, `hourly` -- date-keyed activity maps.
- `perKey`, `perFinger`, `perCharDetail` -- the data that drives the heatmap and per-character report.
- `lessonResults`, `challengeBests` -- which lessons and challenges you have cleared.
- `missedWords`, `missedWordsPeak` -- the running list of words you mistype most.
- `bookProgress` -- per-paragraph completion across the library.
- `preferences` -- your theme, font, and toggle settings.

If you ever want to delete just one part of your history, you can edit the JSON in a text editor and import it back. Most people will never need to.

## How often

If you practice every day, export once a week. If you practice a few times a month, once a month. If you only have a few sessions and would not miss them, never.

The risk is not high. Most browsers do not clear local storage unless you ask them to. But people accidentally clear data, switch browsers, change machines, or run cleanup tools. The export takes ten seconds. Do it before you need it.

## Why no cloud

The site stores nothing on its servers unless you ask it to. The trade-off is yours: you keep full control of your data, but you have to handle backups yourself.

**Update:** optional accounts have since shipped. Sign in with Google or GitHub and your progress syncs across your devices automatically, which is a backup in itself. Everything below still applies if you'd rather stay signed out — and exporting is still worth doing either way.

If you want cloud-synced profiles, the site is not for you. There are paid typing tutors that offer that. This is the one that does not.
