# Vendored typing fonts

Four opt-in typing-surface fonts, self-hosted. Picking one of these
in Settings costs a single same-origin request; nothing here touches
Google Fonts, Bunny, or any other third party. They are also the only
typing fonts `sw.njk` is able to cache at all -- it skips cross-origin
responses on purpose, so a Bunny font can never enter the cache.

That is a property of the font layer only. Do not read it as "these
work offline": the practice page does not currently work offline for
any font, because the same service worker passes `/assets/js/*.js`
straight through to the network, so with the network gone the boot
modules never arrive and the typing surface never renders. Verified
2026-08-25 with the network cut in Chromium.

The `@font-face` rules live in
`src/assets/css/partials/fonts.css`. The `--font-typing` /
`--typing-advance` bindings live in `src/assets/css/partials/tokens.css`
under `[data-typing-font="…"]`.

## What is here

| Family        | Files                                         | Licence                     | Upstream |
|---------------|-----------------------------------------------|-----------------------------|----------|
| Fira Code     | `fira-code-latin{,-ext}.woff2`                | OFL-1.1, `licenses/FiraCode-OFL.txt`     | https://github.com/tonsky/FiraCode |
| IBM Plex Mono | `ibm-plex-mono-latin{,-ext}.woff2`            | OFL-1.1, `licenses/IBMPlexMono-OFL.txt`  | https://github.com/IBM/plex |
| Iosevka       | `iosevka-latin{,-ext}.woff2`                  | OFL-1.1, `licenses/Iosevka-OFL.txt`      | https://github.com/be5invis/Iosevka |
| Cascadia Code | `cascadia-code-latin{,-ext}.woff2`            | OFL-1.1, `licenses/CascadiaCode-OFL.txt` | https://github.com/microsoft/cascadia-code |

All four are SIL Open Font License 1.1. The OFL requires the licence
to travel with the font, which is why `licenses/` ships to the site
rather than being stripped at build time.

Total: 8 woff2 files, 84 136 bytes. Licences add 18 670 bytes.

## Weight 400 only

The typing surface is the only consumer of `--font-typing`
(`.tt-text` and `.tt-text--tape` in
`css/partials/components/typing-surface.css`) and it never renders
bold or italic. Shipping 500/700 or italics would be four to eight
more files that nothing can ever request.

## How these were built

Source is the upstream `@fontsource` 5.3.0 release for each family
(which repackages the vendor's own release), re-subset locally.
Requires `fonttools[woff]`; it is not a project dependency because
this runs by hand, roughly never.

    npm pack @fontsource/fira-code@5.3.0 @fontsource/ibm-plex-mono@5.3.0 \
             @fontsource/iosevka@5.3.0 @fontsource/cascadia-code@5.3.0
    # extract, then for each family:
    pyftsubset <pkg>/files/<family>-latin-400-normal.woff2 \
      --unicodes="$LATIN" \
      --layout-features='ccmp,mark,mkmk,rlig' \
      --flavor=woff2 --no-hinting --desubroutinize --drop-tables+=DSIG \
      --output-file=<family>-latin.woff2

`LATIN` and the `-ext` range are the two `unicode-range` values in
`fonts.css` — keep the three in sync or the browser will pick a face
that cannot serve the character.

Two things worth knowing about that command:

- **`--layout-features` drops the programming ligatures.** Fira Code,
  Cascadia Code and Iosevka all ship `liga`/`calt` rules that fuse
  `->` or `!=` into one glyph. The renderer already puts every
  character in its own `<span class="tt-char">`, and shaping does not
  cross element boundaries, so they could never fire — but carrying
  the GSUB tables cost real bytes for nothing.
- **Subsetting Iosevka is not optional.** Fontsource's `latin` file
  for Iosevka is 984 KB, roughly forty times the other three, because
  it is one bucket holding the whole superfamily repertoire. Subset to
  the ranges above it is 12 KB. Shipping the unsubset file would have
  been the single largest asset on the site.

The ext range is trimmed relative to Google's: `U+1D00-1DBF`
(phonetic extensions) and `U+1E00-1EFF` (Latin Extended Additional)
are dropped. A scan of every file under `src/data` and `src/content`
— 370 million characters — found zero uses of either block, and
keeping them pushed the Iosevka ext file from 22 KB to 40 KB on its
own.

## Changing a file

`/assets/fonts/*` is served `max-age=31536000, immutable` (see
`src/_headers`) and these URLs carry no `?v=` cache-bust — CSS
partials are concatenated raw, never run through Nunjucks, so there
is no `cssVersion` to interpolate. **If a font file's contents ever
change, give it a new filename.** Editing one in place leaves it
frozen at the Cloudflare edge, and in visitors' caches, for a year.
