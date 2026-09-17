/* harfbuzzjs for the browser, with its wasm handed to it rather than
 * fetched by it.
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
 * API) for the wasm at /assets/vendor/satori/hb.wasm.
 *
 * WHY THE BYTES ARE FETCHED HERE instead of letting emscripten do it
 * with locateFile, which is what this file did first:
 *
 *   emscripten's abort() calls readyPromiseReject(e) AND then throws the
 *   same error from inside an async continuation nobody awaits. So a
 *   blocked or 404 hb.wasm produced two failures: one our caller caught
 *   and handled, and one orphan that reached window.onunhandledrejection
 *   -- which on this site is main.js's reporter, so a user whose proxy
 *   blocks wasm silently posted `js_error: "Aborted(both async and sync
 *   fetching of the wasm failed)"` to analytics while the UI behaved
 *   perfectly. Verified on Chromium, Firefox and WebKit.
 *
 *   Module.wasmBinary short-circuits getWasmBinary() before it ever
 *   calls readAsync, so emscripten has nothing to fail at. A wasm that
 *   cannot be fetched, or that comes back as an HTML error page, now
 *   fails in OUR async function, whose promise our caller already
 *   awaits. No orphan.
 *
 * The node_modules paths are relative on purpose. esbuild's alias
 * rewrites SUBPATHS of an aliased package too, so `harfbuzzjs/hb.js`
 * here would be remapped to this file's own path + "/hb.js".
 */
import hbjs from "../../node_modules/harfbuzzjs/hbjs.js";
import hb from "../../node_modules/harfbuzzjs/hb.js";

/* The ?v= the build stamped onto the bundle's own URL is carried over to
   the wasm. new URL(file, import.meta.url) drops the query, and without
   this a browser could pair a new bundle with a stale hb.wasm. */
function wasmUrl() {
  const here = new URL(import.meta.url);
  return new URL("hb.wasm" + here.search, here).href;
}

async function loadWasm() {
  const url = wasmUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`hb.wasm: HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  /* A 200 is not evidence it is wasm: a captive portal or a rewritten
     404 hands back HTML with a cheerful status. Checked here so the
     error says what happened, rather than inside emscripten where it
     becomes an abort that throws past everyone. */
  const magic = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  if (bytes.byteLength < 1024 || magic[0] !== 0x00 || magic[1] !== 0x61 || magic[2] !== 0x73 || magic[3] !== 0x6d) {
    throw new Error(`hb.wasm is not WebAssembly (${bytes.byteLength} bytes)`);
  }
  return bytes;
}

/* locateFile is belt to wasmBinary's braces. With the bytes supplied,
   getWasmBinary() never calls readAsync and this is never used -- but
   if a future harfbuzzjs stops honouring Module.wasmBinary, the
   fallback fetch should at least go to the right URL rather than to
   /hb.wasm relative to whatever page the user is on. */
const ready = (async () => hbjs(await hb({
  wasmBinary: await loadWasm(),
  locateFile: (file) => (file === "hb.wasm" ? wasmUrl() : file),
})))();

/* Owned here and now. satori awaits this promise the first time it
   shapes text, which is one fetch later than the rejection; without a
   handler attached at module scope the browser would report it as
   unhandled in the gap. Attaching one does not consume the rejection --
   whoever awaits `ready` still gets the error, which is the point. */
ready.catch(() => {});

export default ready;
