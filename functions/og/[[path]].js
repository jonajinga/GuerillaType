/* GET /og/* -- nothing is drawn here. 404, always, on the Free plan.
 *
 * NO IMPORTS. Not one, not even a pure module from lib/og, and this is
 * a rule rather than a style: Cloudflare Pages bundles Functions with
 * esbuild, and esbuild resolves `import("satori")` STATICALLY even when
 * it sits inside `if (env.OG_DYNAMIC !== "1") return 404`. The first
 * version of this file did exactly that, and the whole Functions build
 * failed with `Could not resolve "fs"` from harfbuzzjs underneath
 * satori -- taking /r/, the one Function this site needs, down with
 * it. A verifier found it with `wrangler pages dev`; reading the file
 * would never have shown it.
 *
 * So the renderer now lives in lib/og/dynamic-card.js, on the other
 * side of that line, with the instructions for wiring it up when the
 * project moves to a Paid plan. scripts/check-share-page.mjs walks
 * every file under functions/ and its whole import graph and fails on
 * any import outside lib/og/{validate,labels,r-meta}.js.
 *
 * Note this Function is not reachable today in any case: src/_routes.json
 * includes only /r and /r/, so Cloudflare serves every /og/* URL from
 * the static bucket that scripts/gen-og-images.mjs filled at build
 * time. This file is the belt to that pair of braces -- if /og/* is
 * ever routed here by accident, a scraper gets a clean 404 rather than
 * a stack trace or a CPU bill.
 */
export async function onRequestGet() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-og-dynamic": "off",
    },
  });
}
