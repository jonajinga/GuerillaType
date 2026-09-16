# Vendored fonts

Two separate things live here, and they are not used the same way:

1. **`iosevka-*.woff2`** — the only font the *browser* self-hosts.
   Everything else the page loads (the Lora / Inter chrome, every other
   typing-surface option, Cascadia Code included) is served from Bunny
   Fonts via the `<link>` in `src/_includes/layouts/base.njk`.
2. **`og/*.ttf`** — Lora, Inter and JetBrains Mono, used **only by the
   Open Graph image renderer** (`lib/og/`, `scripts/gen-og-images.mjs`).
   No stylesheet references them, no `@font-face` rule points at them,
   and no browser ever downloads them. satori needs real font bytes in
   the process that draws the card, and it cannot read woff2 — hence
   TTF, hence a second directory. See the section near the bottom.

The rest of this file is about Iosevka unless it says otherwise.

## Iosevka

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

## The Open Graph renderer's fonts (`og/`)

`og/` holds six Latin-subset TTFs. They exist for one consumer:
`lib/og/card.js`, which builds share cards with
[satori](https://github.com/vercel/satori) and rasterises them with
`@resvg/resvg-wasm`. That runs in Node at build time
(`scripts/gen-og-images.mjs`) and is written so the same code can run in
a Cloudflare Worker later. **Nothing here is ever loaded by a browser.**

| File | Family / face | Bytes |
|---|---|---|
| `og/lora-600.ttf` | Lora SemiBold | 39 988 |
| `og/lora-500-italic.ttf` | Lora MediumItalic | 42 952 |
| `og/inter-400.ttf` | Inter Regular | 32 384 |
| `og/inter-600.ttf` | Inter SemiBold | 33 132 |
| `og/jetbrains-mono-400.ttf` | JetBrains Mono Regular | 18 784 |
| `og/jetbrains-mono-500.ttf` | JetBrains Mono Medium | 18 792 |

186 KB in total. All three families are SIL Open Font License 1.1;
`licenses/Lora-OFL.txt`, `licenses/Inter-OFL.txt` and
`licenses/JetBrainsMono-OFL.txt` ship next to them for the same reason
Iosevka's does.

### Why TTF and not woff2

satori parses fonts itself (via opentype.js) and supports `ttf`, `otf`
and `woff`. It does **not** support `woff2`, so the trick used for
Iosevka — Brotli-compressed woff2, 12 KB — is not available. Subsetting
is what keeps these small instead.

### Where they came from

Downloaded with `curl`, then subset locally. Upstream:

    # Lora — static instances, not the variable font (satori renders a
    # variable font at its default instance, which would be weight 400).
    curl -L -o lora.zip https://github.com/cyrealtype/Lora/archive/refs/heads/main.zip
    #   Lora-Cyrillic-main/fonts/ttf/Lora-SemiBold.ttf      -> lora-600.ttf
    #   Lora-Cyrillic-main/fonts/ttf/Lora-MediumItalic.ttf  -> lora-500-italic.ttf

    # Inter v4.1
    curl -L -O https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip
    #   extras/ttf/Inter-Regular.ttf   -> inter-400.ttf
    #   extras/ttf/Inter-SemiBold.ttf  -> inter-600.ttf

    # JetBrains Mono v2.304
    curl -L -O https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip
    #   fonts/ttf/JetBrainsMono-Regular.ttf -> jetbrains-mono-400.ttf
    #   fonts/ttf/JetBrainsMono-Medium.ttf  -> jetbrains-mono-500.ttf

Subsetting (`fonttools` 4.60.2, run by hand in a throwaway venv — it is
not a project dependency, same as for Iosevka):

    OG_LATIN='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,\
    U+2010-2015,U+2018-201A,U+201C-201E,U+2020-2022,U+2026,U+2030,U+2039-203A,\
    U+2044,U+2052,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+25CF,U+FEFF,U+FFFD'

    pyftsubset raw/Lora-SemiBold.ttf --unicodes="$OG_LATIN" \
      --layout-features='kern' --no-hinting --desubroutinize \
      --drop-tables+=DSIG --name-IDs='*' --output-file=og/lora-600.ttf

1.79 MB of raw TTF becomes 186 KB. The range is Latin-1 plus the
punctuation the corpus actually uses — curly quotes, en/em dash,
ellipsis, bullet, the `·` separator the cards are built around. A
character outside it renders as a blank box in the card, so widen the
range rather than dropping the character if that ever happens.

`--layout-features='kern'` keeps pair kerning (satori applies it) and
drops everything else; satori does no ligature or contextual shaping, so
`liga`/`calt` would be bytes nothing can reach. `--name-IDs='*'` keeps
the name table, which is how satori matches a face to the `name` in the
font descriptor in `lib/og/theme.js` — strip it and matching breaks.

### Changing one of these

Unlike the Iosevka woff2s, these are not fetched over HTTP by anything,
so the "give it a new filename" rule does not apply. But `lib/og/theme.js`
names each file, and `scripts/check-og-render.mjs` renders a fixed model
and asserts the PNG is byte-identical across two runs — swap a face and
the card's pixels change. That is intended: look at the output.
