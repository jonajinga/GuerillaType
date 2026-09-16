/* The share card, drawn in the browser, for results the server may
   never see.

   A run on a text of your own gets the Free-plan grid card
   /og/result/<wpm>-<band>.png, which shows a number and an accuracy
   band and nothing else. It cannot show the text, and that is not a
   gap to be closed server-side: the text never leaves the device, so
   there is nothing at guerillatype.com that could draw it. The only
   place a picture of your result can include your words is here.

   This is NOT a second implementation of the card. It is the same one:

     lib/og/card.js      the element tree           <- passthrough-copied
     lib/og/theme.js     colours, geometry, fonts      to /assets/vendor/og/
     lib/og/labels.js    every string a card draws     by eleventy.config.js
     lib/og/render.js    satori -> SVG -> raster
     lib/og/validate.js  query string -> card model

   render.js was written with a seam for exactly this (its header says
   "a Cloudflare Worker would import the wasm as a module and fetch
   fonts from its own assets"); this file is the browser's host for that
   seam. Feeding the same model through the same files produces a
   byte-identical SVG to the one `npm run build` renders -- asserted in
   scripts/check-share-local-png.mjs, section E -- which is the only way
   to be sure the two cards cannot drift apart.

   Two things the browser host does differently from Node's:

   1. NO resvg. Node rasterises the SVG with @resvg/resvg-wasm, which is
      a 2.4 MB wasm binary. Every browser already ships an SVG
      rasteriser, so `ensureResvg` here hands render.js a class shaped
      like resvg's that draws the SVG onto a canvas instead. That is the
      difference between 915 KB and 3.3 MB on the first click, and the
      grid card is the thing that must be pixel-stable across machines,
      not this one.

   2. Nothing here loads until it is needed. share.js imports this file
      dynamically, on the click, and this file's own imports are what
      pull in the 542 KB satori bundle and HarfBuzz's wasm. A page visit
      costs nothing -- scripts/check-typing-perf.mjs would notice.
*/
import satori from "../../vendor/satori/satori.browser.js";
import { createRenderer } from "../../vendor/og/render.js";
import { validate } from "../../vendor/og/validate.js";
import { CARD } from "../../vendor/og/theme.js";

/* The same Latin-subset faces the build-time cards use, already
   passthrough-copied for satori's sake. Named from theme.js rather than
   listed here: a face added there must not silently go missing. */
const FONT_DIR = "/assets/fonts/og/";

const fontCache = new Map();
async function loadFont(basename) {
  if (!fontCache.has(basename)) {
    fontCache.set(basename, (async () => {
      const res = await fetch(FONT_DIR + basename);
      if (!res.ok) throw new Error(`font ${basename}: HTTP ${res.status}`);
      return res.arrayBuffer();
    })());
  }
  return fontCache.get(basename);
}

/* ── the browser's rasteriser, wearing resvg's shape ───────────────
   render.js does `new Resvg(svg, opts).render()` then `.asPng()`, and
   awaits whatever comes back. resvg's asPng() is synchronous; decoding
   an image in a browser is not, so this one returns a promise. An async
   function resolves it on the way out and render.js never notices. */
class CanvasRasterizer {
  constructor(svg, opts) {
    this.svg = repairForBrowsers(String(svg));
    this.width = (opts && opts.fitTo && opts.fitTo.value) || CARD.width;
  }
  render() {
    const { svg, width } = this;
    return {
      asPng() {
        return rasterize(svg, width);
      },
    };
  }
}

/* satori draws a border as a stroked path clipped to the box, and the
   clip is a <clipPath> that itself carries clip-path="url(#parent)".
   WebKit renders nothing at all for those paths: in Safari the excerpt
   panel lost its coral left rule and the footer lost its hairline,
   while Chromium drew both. Dropping the nested attribute restores them
   on WebKit and changes not one byte of Chromium's PNG (measured both
   ways). The clip that is dropped is the element's PARENT box, and
   satori only ever nests a child inside its parent, so intersecting
   with it was a no-op on this card anyway.

   This runs on the copy handed to the rasteriser, never on the SVG
   renderCardSvg() returns -- that one has to stay identical to Node's. */
function repairForBrowsers(svg) {
  return svg.replace(/(<clipPath id="[^"]*")\s+clip-path="url\(#[^"]*\)"/g, "$1");
}

async function rasterize(svg, width) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise((ok, no) => {
      img.onload = ok;
      img.onerror = () => no(new Error("the browser would not decode the card"));
      img.src = url;
    });
    const height = Math.round(width * (img.naturalHeight / img.naturalWidth)) || CARD.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0, width, height);
    /* satori emits every glyph as a <path> and loads no external
       image, so the canvas is not tainted and toBlob is allowed. */
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
    if (!blob) throw new Error("canvas.toBlob returned nothing");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

let renderer = null;
function ensure() {
  if (!renderer) {
    renderer = createRenderer({
      satori,
      ensureResvg: async () => CanvasRasterizer,
      loadFont,
    });
  }
  return renderer;
}

/* ── the model ─────────────────────────────────────────────────────
   Built by lib/og/validate.js, which is the same function that turns a
   share link into a card server-side. Passing the run's numbers as the
   canonical query rather than as an object is what keeps the two
   honest: a number out of range, a mode that is not in the label map,
   an accuracy with four decimals -- all rejected here exactly as they
   would be rejected by a /og/result.png request, and a rejected model
   falls back to the grid card rather than drawing something odd.

   `text` is the only thing that does not come through validate(), and
   it is the only thing that must never reach a URL. It is passed
   in-process, from practice-boot to share.js to here. */
export function resultModel(src) {
  const stats = String((src && src.stats) || "");
  const model = validate(stats);
  if (!model) throw new Error("local-card: these numbers do not validate");
  const text = String((src && src.text) || "").replace(/\s+/g, " ").trim();
  if (text) model.content = { kind: "custom", text };
  return model;
}

/* The SVG, before rasterising. Exported because it is the seam the gate
   compares against a Node render of the same model. */
export async function renderCardSvg(src) {
  return ensure().renderSvg(resultModel(src));
}

export async function renderCardPng(src) {
  const bytes = await ensure().renderPng(resultModel(src));
  if (!bytes || bytes.length < 8) throw new Error("local-card: empty render");
  return new Blob([bytes], { type: "image/png" });
}
