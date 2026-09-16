/* satori -> SVG -> resvg -> PNG, with the host's bits injected.
 *
 * Nothing here imports satori, resvg or `fs`. The host passes them in:
 * Node reads fonts off disk and inits the wasm from node_modules
 * (scripts/lib/og-node.mjs); a Cloudflare Worker would import the wasm
 * as a module and fetch fonts from its own assets. Same card code, two
 * very different runtimes, one seam.
 *
 *   createRenderer({
 *     satori,        // (element, options) => Promise<svg string>
 *     ensureResvg,   // () => Promise<Resvg class>, wasm already inited
 *     loadFont,      // (basename) => Promise<ArrayBuffer|Buffer>
 *     fallbackPng,   // optional (err, model) => bytes; swallows failures
 *   })
 *
 * Returns { renderPng, renderSvg, fonts }. Fonts are loaded once and
 * cached on the closure: with ~3,200 cards per build, re-reading six
 * TTFs per card would dominate the run.
 */
import { buildCard } from "./card.js";
import { CARD, FONT_FILES } from "./theme.js";

export function createRenderer({ satori, ensureResvg, loadFont, fallbackPng } = {}) {
  if (typeof satori !== "function") throw new Error("createRenderer: satori is required");
  if (typeof ensureResvg !== "function") throw new Error("createRenderer: ensureResvg is required");
  if (typeof loadFont !== "function") throw new Error("createRenderer: loadFont is required");

  let fontsPromise = null;
  function fonts() {
    if (!fontsPromise) {
      fontsPromise = Promise.all(FONT_FILES.map(async (f) => ({
        name: f.name,
        weight: f.weight,
        style: f.style,
        data: await loadFont(f.file),
      })));
    }
    return fontsPromise;
  }

  async function renderSvg(model) {
    return satori(buildCard(model), {
      width: CARD.width,
      height: CARD.height,
      fonts: await fonts(),
      /* No remote images, no embedded fonts to fetch: a card must never
         make a network request while it is being drawn. */
      loadAdditionalAsset: async () => "",
    });
  }

  async function renderPng(model) {
    try {
      const svg = await renderSvg(model);
      const Resvg = await ensureResvg();
      const img = new Resvg(svg, {
        fitTo: { mode: "width", value: CARD.width },
        /* satori emits glyph outlines as <path>, so resvg needs no
           fonts at all. Saying so keeps the output identical on a
           machine with a different font book installed. */
        font: { loadSystemFonts: false },
      }).render();
      const png = img.asPng();
      if (typeof img.free === "function") img.free();
      return png;
    } catch (err) {
      if (fallbackPng) return fallbackPng(err, model);
      throw err;
    }
  }

  return { renderPng, renderSvg, fonts };
}

export default createRenderer;
