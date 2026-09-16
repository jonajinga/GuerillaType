/* harfbuzzjs, re-pointed at a wasm the site actually serves.
 *
 * satori 0.33 shapes every run of text with HarfBuzz and imports it as
 * `harfbuzzjs`, whose index.js starts the emscripten module immediately
 * with no way to say where hb.wasm lives. In Node it is found next to
 * the package; in a browser the emscripten loader falls back to the
 * page's own directory and fetches /hb.wasm, which is a 404 on every
 * page of this site.
 *
 * scripts/build-og-browser-bundle.mjs aliases `harfbuzzjs` to this file,
 * so the bundle gets the same default export (a promise of the hbjs
 * API) with locateFile pointing next to the bundle itself:
 * /assets/vendor/satori/hb.wasm.
 *
 * The node_modules paths are relative on purpose. esbuild's alias
 * rewrites SUBPATHS of an aliased package too, so `harfbuzzjs/hb.js`
 * here would be remapped to this file's own path + "/hb.js". */
import hbjs from "../../node_modules/harfbuzzjs/hbjs.js";
import hb from "../../node_modules/harfbuzzjs/hb.js";

/* The ?v= the build stamped onto the bundle's own URL is carried over
   to the wasm. new URL(file, import.meta.url) drops the query, and the
   service worker caches /assets/vendor/ cache-first, so without this a
   browser could pair a new bundle with a year-old hb.wasm. */
export default (async () => hbjs(await hb({
  locateFile: (file) => {
    const here = new URL(import.meta.url);
    return new URL(file + here.search, here).href;
  },
})))();
