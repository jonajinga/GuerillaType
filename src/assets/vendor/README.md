# Vendored third-party code

Everything here is checked in rather than installed, for the same reason
the subset TTFs in `src/assets/fonts/og/` are: the site has no bundler
and Cloudflare Pages runs Eleventy directly, so whatever the browser
needs has to already be a file in the repository.

Nothing in this directory is loaded on any page visit. It is fetched
only when someone clicks **Download PNG** in the share sheet on a
result typed from a text of their own — see
`src/assets/js/share/local-card.js`.

## `satori/satori.browser.js` — 542 KB

`satori@0.33.4`, MPL-2.0, bundled for the browser by
`scripts/build-og-browser-bundle.mjs` (`npm run og-bundle`).

`node_modules/satori/dist/index.js` is ESM but externalises its eleven
npm dependencies (`linebreak`, `fflate`, `harfbuzzjs`, …). A browser
cannot resolve a bare specifier and several of those packages are
CommonJS, so the published file cannot be served as-is. esbuild is a
devDependency and this is the only place it runs — by hand, never as
part of `npm run build`.

Regenerate after bumping satori:

    npm run og-bundle
    git add src/assets/vendor

## `satori/hb.wasm` — 373 KB

HarfBuzz, copied verbatim from `node_modules/harfbuzzjs/hb.wasm`
(harfbuzzjs 0.10.0, MIT). satori 0.33 shapes every run of text with it
and imports it eagerly, so it is not optional.

The upstream `harfbuzzjs` entry point starts its emscripten module with
no way to say where the wasm lives, and in a browser it would fetch
`/hb.wasm` relative to the *page*. `scripts/lib/harfbuzz-browser.js` is
aliased in its place and resolves the wasm next to the bundle instead.

## `licenses/satori-bundle-LICENSES.txt`

Generated from esbuild's metafile, so it lists every package that has
code in the bundle (17 as of satori 0.33.4) rather than a hand-kept
list that drifts. Yoga is in there as a base64 wasm blob inside
satori's own dist; `@resvg/resvg-wasm` is **not** — the browser card is
rasterised by the browser's own SVG renderer, which is why there is no
2.4 MB renderer here.

The Latin-subset fonts the card draws with are not duplicated here:
they are the ones already at `/assets/fonts/og/*.ttf` and their licences
are in `src/assets/fonts/licenses/`.

Neither is `lib/og`. Eleventy copies that whole directory to
`/assets/js/og/` for the `/r/` landing page, and the browser-drawn card
imports the same copy, so there is one `card.js` on the site and not
two.
