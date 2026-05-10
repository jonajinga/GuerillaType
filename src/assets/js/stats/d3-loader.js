/* Shared d3 loader for the stats page.
   Single import-promise so multiple viz modules can await the same
   fetch without triggering parallel network requests. Returns null
   on failure so each caller can fall back to its hand-rolled viz. */

let _d3Promise = null;

export function loadD3() {
  if (!_d3Promise) {
    _d3Promise = import("https://esm.sh/d3@7").catch((e) => {
      console.warn("[stats] d3 load failed:", e);
      return null;
    });
  }
  return _d3Promise;
}
