/* Drawing a result card per request, for the day this project is on a
 * Paid Workers plan.
 *
 * WHY THIS IS IN lib/ AND NOT IN functions/.
 *
 * It used to be functions/og/[[path]].js, with satori and
 * @resvg/resvg-wasm behind a `dynamic import` inside an
 * `if (env.OG_DYNAMIC !== "1") return 404` guard. That looked safe and
 * was not. Cloudflare Pages bundles a Function with esbuild, and
 * esbuild resolves `import("satori")` statically whatever guard it sits
 * behind. satori reaches harfbuzzjs, harfbuzzjs reaches `fs`, and the
 * whole Functions build died:
 *
 *     ✘ [ERROR] Could not resolve "fs"
 *       node_modules/harfbuzzjs/hbjs.js:...
 *
 * That is not "the dynamic card does not work". That is **every**
 * Function failing to build, including /r/, which is the one this site
 * actually needs. A verifier caught it with `wrangler pages dev`; no
 * amount of reading the file would have.
 *
 * So the rule now, enforced by scripts/check-share-page.mjs section G:
 * nothing under functions/ may import anything except
 * lib/og/validate.js, lib/og/labels.js and lib/og/r-meta.js, and no
 * node: builtin, statically or dynamically. This file is deliberately
 * on the other side of that line.
 *
 * HOW TO WIRE IT WHEN THE PLAN MOVES TO PAID
 *
 * 1. Give the Pages project a `nodejs_compat` compatibility flag and
 *    confirm `npx wrangler@3 pages dev _site` still builds. satori's
 *    `fs` reach may still need an esbuild alias; test before believing.
 * 2. Replace functions/og/[[path]].js with a handler that imports
 *    satori and @resvg/resvg-wasm itself and calls drawResultCard()
 *    below with them. Keep the OG_DYNAMIC guard: a flag is how this
 *    gets turned off again in a hurry.
 * 3. Add "/og/result.png" to `include` in src/_routes.json, and only
 *    then. Until it is there Cloudflare never invokes the Function and
 *    every /og/* URL comes from the static bucket.
 * 4. Point functions/r/index.js at it by setting OG_DYNAMIC=1; rMeta()
 *    already switches og:image to /og/result.png?<canonical> when it
 *    sees that.
 * 5. Add a rate-limit rule on /og/*. A renderer anyone can call with
 *    any query is a CPU bill with a URL.
 *
 * Everything here is injected, the same seam lib/og/render.js uses:
 * this file imports no renderer, no wasm and no font loader, so it
 * stays as portable as the rest of lib/og.
 */
import { validate } from "./validate.js";
import { canonicalQuery } from "./r-meta.js";
import { bandFor } from "./labels.js";
import { createRenderer } from "./render.js";
import { FONT_FILES } from "./theme.js";

export const DAY = 86400;

/* The pre-rendered grid card for these numbers. Duplicated from
   r-meta.resultCardPath deliberately? No -- imported thresholds,
   local formatting, and the two agree because bandFor() is the only
   opinion about where a band starts. */
export function fallbackCardPath(wpm, acc) {
  const w = Math.max(0, Math.round(Number(wpm) || 0));
  return `/og/result/${w > 200 ? "200p" : String(w)}-${bandFor(acc)}.png`;
}

/* drawResultCard({ request, env, ctx, satori, Resvg, initWasm, wasm })
     -> Response
   `satori` and the resvg pieces are the host's; everything else is
   this module's. Returns the pre-rendered card on any failure, because
   the caller is a scraper drawing a preview and an error page in that
   slot is a broken share. */
export async function drawResultCard(deps) {
  const { request, env, ctx, satori, Resvg, initWasm, wasm } = deps || {};
  const url = new URL(request.url);

  if (!env || env.OG_DYNAMIC !== "1") {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "x-og-dynamic": "off" },
    });
  }

  const model = validate(url.searchParams);
  if (!model) return staticFallback(env, url, "invalid query");

  /* One cache entry per canonical query: utm tags and the like cannot
     multiply the number of cards we draw. */
  const canonical = canonicalQuery(url.searchParams);
  const cacheKey = new Request(`${url.origin}/og/result.png?${canonical}`, { method: "GET" });
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let png;
  try {
    let resvgReady = null;
    const ensureResvg = async () => {
      if (!resvgReady) {
        resvgReady = (async () => { await initWasm(wasm); return Resvg; })()
          .catch((e) => { resvgReady = null; throw e; });
      }
      return resvgReady;
    };

    /* Fonts come out of the site's own static bucket -- the same seven
       Latin-subset TTFs the build renders with, so a card drawn here
       and a card drawn there are the same card. */
    if (!Array.isArray(FONT_FILES) || !FONT_FILES.length) throw new Error("no fonts declared");
    const fontCache = new Map();
    const loadFont = async (file) => {
      if (fontCache.has(file)) return fontCache.get(file);
      const res = await env.ASSETS.fetch(new Request(`${url.origin}/assets/fonts/og/${file}`));
      if (!res || !res.ok) throw new Error(`font ${file}: HTTP ${res ? res.status : "?"}`);
      const buf = await res.arrayBuffer();
      fontCache.set(file, buf);
      return buf;
    };

    png = await createRenderer({ satori, ensureResvg, loadFont }).renderPng(model);
  } catch (err) {
    return staticFallback(env, url, String((err && err.message) || err));
  }

  const res = new Response(png, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": `public, max-age=${DAY}`,
      "x-og-dynamic": "on",
    },
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function staticFallback(env, url, why) {
  const path = fallbackCardPath(url.searchParams.get("wpm"), Number(url.searchParams.get("acc")));
  try {
    const res = await env.ASSETS.fetch(new Request(url.origin + path));
    if (res && res.ok) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", `public, max-age=${DAY}`);
      headers.set("x-og-fallback", String(why).slice(0, 80));
      return new Response(res.body, { status: 200, headers });
    }
  } catch { /* fall through */ }
  return new Response("Not found", { status: 404, headers: { "x-og-fallback": String(why).slice(0, 80) } });
}

export default drawResultCard;
