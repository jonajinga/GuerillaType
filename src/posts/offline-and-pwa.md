---
title: "Type without an internet connection"
description: "How the offline mode works, and what you give up when you use it."
date: 2026-04-20
tags: [features]
eyebrow: "Features"
---

The site works offline. Once you have visited it on a connected browser, the practice surface, the word lists, and your local profile are cached. You can practice on a plane, on a train, in a basement. The features that need the network simply degrade gracefully.

## What is cached

The first time you visit, a service worker stores:

- The HTML for every main page
- The single CSS file
- The JavaScript bundle
- The 1k, 5k, 10k, and 20k English word lists
- The code, punctuation, numbers, and themed word lists
- The font files for the typing surface
- The favicon and the icon set

Total cache size is roughly 6 MB. The browser holds it indefinitely.

## What is not cached

Two things require the network:

- **The library.** Each book is fetched on demand. If you have opened a book online, that book stays cached until the browser evicts it. If you have not, it will not load offline.
- **The 50k word list.** It is 480 KB; we do not pre-cache anything that large.

If you want a specific book offline, open it once while online. The same applies to the 50k list -- visit the [practice surface](/practice/?lang=en-50k) once with a connection and it will be there next time.

## How to install as a PWA

The site is a Progressive Web App. You can install it like a native app on most platforms.

**Chrome / Edge desktop:** click the install icon in the address bar.

**Safari iOS:** Share menu → Add to Home Screen.

**Chrome Android:** the menu offers "Add to Home Screen" or "Install app" depending on version.

**Firefox:** does not support PWA installation natively, but the offline cache still works.

After installation, the site opens in its own window without browser chrome. It launches faster because the cache is loaded before the network check.

## What changes after install

Almost nothing. The site behaves the same. Two small differences:

- Theme color matches your installed-app icon, so the title bar looks consistent.
- Browser-level shortcuts (Cmd-T, Cmd-W) are not intercepted by the browser, since there is no browser chrome. Native window-management shortcuts apply instead.

## When offline matters

For most typists, never. Internet is always there. The offline support is for:

- Travel, especially long flights.
- Slow hotel wifi where the site would load slowly otherwise.
- Power users who like to know their tools work without a network connection.
- Privacy-minded users who want to be sure no data is being uploaded -- the offline mode confirms it because there is nothing to upload to.

## Updating

When you reconnect, the service worker checks for updates in the background. If a new version is available, it caches it without interrupting you. The next page load picks up the new version.

If something looks wrong after an update, hard-refresh: Cmd-Shift-R on Mac, Ctrl-Shift-R on Windows / Linux. This forces a fresh fetch of everything.
