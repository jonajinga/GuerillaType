# Vendored font: Iosevka

Iosevka is the **only** font this site self-hosts. Everything else —
the Lora / Inter chrome and every other typing-surface option,
Cascadia Code included — is served from Bunny Fonts via the `<link>`
in `src/_includes/layouts/base.njk`.

Iosevka is here because Bunny does not carry it. Asking for it
returns HTTP 200 with an error body and zero `@font-face` rules:

    $ curl 'https://fonts.bunny.net/css?family=iosevka'
    /*
        Error: API Error
        Details: Please specify a valid icon font on the 'family' parameter.
    */

For contrast, `family=cascadia-code` returns 10 real `@font-face`
rules, so Cascadia Code needs no local copy. **Check Bunny before
adding any font here.** The default should always be Bunny; this
directory is the exception, not the pattern.

The `@font-face` rules live in `src/assets/css/partials/fonts.css`.
The `--font-typing` / `--typing-advance` binding lives in
`src/assets/css/partials/tokens.css` under `[data-typing-font="iosevka"]`.

## What is here

| File | Bytes |
|---|---|
| `iosevka-latin.woff2` | 12 304 |
| `iosevka-latin-ext.woff2` | 22 736 |
| `licenses/Iosevka-OFL.txt` | 4 493 |

Iosevka is SIL Open Font License 1.1, Copyright 2015-2023 Renzhi Li
(Belleve Invis). Upstream: https://github.com/be5invis/Iosevka. The
OFL requires the licence to travel with the font, which is why
`licenses/` ships to the site rather than being stripped at build
time.

Only `iosevka-latin.woff2` is fetched in normal use; the ext file is
requested only when a passage actually contains Latin Extended
characters.

## Weight 400 only

The typing surface is the only consumer of `--font-typing`
(`.tt-text` and `.tt-text--tape` in
`css/partials/components/typing-surface.css`) and it never renders
bold or italic. A 500/700 or italic face would be a file nothing
could ever request.

## How this was built

Source is the upstream `@fontsource/iosevka` 5.3.0 release, re-subset
locally. Requires `fonttools[woff]`; it is not a project dependency
because this runs by hand, roughly never.

    npm pack @fontsource/iosevka@5.3.0
    # extract, then:
    pyftsubset <pkg>/files/iosevka-latin-400-normal.woff2 \
      --unicodes="$LATIN" \
      --layout-features='ccmp,mark,mkmk,rlig' \
      --flavor=woff2 --no-hinting --desubroutinize --drop-tables+=DSIG \
      --output-file=iosevka-latin.woff2
    # and again with "$EXT" for iosevka-latin-ext.woff2

`LATIN` and `EXT` are the two `unicode-range` values in `fonts.css` —
keep them in sync or the browser will pick a face that cannot serve
the character.

Two things worth knowing about that command:

- **`--layout-features` drops the programming ligatures.** Iosevka
  ships `liga`/`calt` rules that fuse `->` or `!=` into one glyph. The
  renderer already puts every character in its own
  `<span class="tt-char">`, and shaping does not cross element
  boundaries, so they could never fire — but carrying the GSUB tables
  cost real bytes for nothing.
- **Subsetting is not optional here.** Fontsource's `latin` file for
  Iosevka is 984 KB, because it is one bucket holding the whole
  superfamily repertoire. Subset to the ranges above it is 12 KB.
  Shipping the unsubset file would have made it the largest asset on
  the site by a wide margin.

The ext range is trimmed relative to Bunny's: `U+1D00-1DBF` (phonetic
extensions) and `U+1E00-1EFF` (Latin Extended Additional) are
dropped. A scan of every file under `src/data` and `src/content` —
370 million characters — found zero uses of either block, and keeping
them pushed the ext file from 22 KB to 40 KB.

## Offline

Being same-origin, this file is the only typing font `sw.njk` is able
to cache at all; it skips cross-origin responses on purpose, so a
Bunny face never enters the cache.

Do not read that as "Iosevka works offline". The practice page does
not currently work offline for any font, because the same service
worker passes `/assets/js/*.js` straight through to the network, so
with the network gone the boot modules never arrive and the typing
surface never renders. Verified 2026-08-25 with the network cut in
Chromium: `chars: 0`. With the other three fonts on Bunny, an offline
claim is now even less true than it was.

## Changing a file

`/assets/fonts/*` is served `max-age=31536000, immutable` (see
`src/_headers`) and these URLs carry no `?v=` cache-bust — CSS
partials are concatenated raw, never run through Nunjucks, so there
is no `cssVersion` to interpolate. **If a font file's contents ever
change, give it a new filename.** Editing one in place leaves it
frozen at the Cloudflare edge, and in visitors' caches, for a year.
