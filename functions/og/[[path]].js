/* GET /og/result.png?<query> -- a result card drawn on demand.
 *
 * SHIPPED BUT OFF. This file returns 404 unless env.OG_DYNAMIC === "1",
 * and /og/result.png is deliberately NOT in src/_routes.json, so on the
 * current deploy Cloudflare never invokes it at all: every /og/* URL is
 * served from the static bucket that scripts/gen-og-images.mjs filled
 * at build time. It is here so that turning the feature on is a
 * variable and a routes line rather than a new piece of software.
 *
 * Why it is off. The Workers Free plan gives a request 10 ms of CPU.
 * satori laying out a card and resvg rasterising it is 60-250 ms. The
 * Free-plan answer is the pre-rendered grid: ~1,200 cards covering
 * every whole wpm from 0 to 200 (plus "200+") crossed with six
 * accuracy bands, which is what functions/r/index.js points a scraper
 * at. This path only becomes affordable on a Paid plan.
 *
 * When it is on: the Cache API does the real work. A card is a pure
 * function of its canonical query, so the second scraper to ask for
 * the same link gets an edge hit and no CPU at all.
 */
import { validate } from "../../lib/og/validate.js";
import { canonicalQuery } from "../../lib/og/r-meta.js";
import { FONT_FILES } from "../../lib/og/theme.js";

const DAY = 86400;

export async function onRequestGet(context) {
  const { request, env } = context;

  /* The flag first, before anything heavy is even reached for. */
  if (!env || env.OG_DYNAMIC !== "1") {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "x-og-dynamic": "off" },
    });
  }

  const url = new URL(request.url);
  if (!/\/og\/result\.png$/.test(url.pathname)) {
    return new Response("Not found", { status: 404 });
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
    /* Imported here rather than at the top so a deploy with the flag
       off never pays for the module graph. */
    const [{ createRenderer }, satoriMod, resvgMod] = await Promise.all([
      import("../../lib/og/render.js"),
      import("satori"),
      import("@resvg/resvg-wasm"),
    ]);
    const satori = satoriMod.default || satoriMod;
    const { Resvg, initWasm } = resvgMod;

    let resvgReady = null;
    const ensureResvg = async () => {
      if (!resvgReady) {
        resvgReady = (async () => {
          const wasm = await import("@resvg/resvg-wasm/index_bg.wasm");
          await initWasm(wasm.default || wasm);
          return Resvg;
        })().catch((e) => { resvgReady = null; throw e; });
      }
      return resvgReady;
    };

    /* Fonts come out of the site's own static bucket -- the same seven
       Latin-subset TTFs the build renders with, so a card drawn here
       and a card drawn there are the same card. */
    const fontCache = new Map();
    const loadFont = async (file) => {
      if (fontCache.has(file)) return fontCache.get(file);
      const res = await env.ASSETS.fetch(new Request(`${url.origin}/assets/fonts/og/${file}`));
      if (!res || !res.ok) throw new Error(`font ${file}: HTTP ${res ? res.status : "?"}`);
      const buf = await res.arrayBuffer();
      fontCache.set(file, buf);
      return buf;
    };
    /* Touching FONT_FILES here keeps the import honest: if theme.js
       ever names a face this runtime cannot reach, it fails loudly at
       the first render rather than drawing an italic card. */
    if (!Array.isArray(FONT_FILES) || !FONT_FILES.length) throw new Error("no fonts declared");

    const renderer = createRenderer({ satori, ensureResvg, loadFont });
    png = await renderer.renderPng(model);
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
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

/* Anything that goes wrong still has to answer with an image, because
   the caller is a scraper drawing a preview and an error page in that
   slot is a broken share. The pre-rendered grid card is the answer. */
async function staticFallback(env, url, why) {
  const wpm = Math.max(0, Math.round(Number(url.searchParams.get("wpm")) || 0));
  const seg = wpm > 200 ? "200p" : String(wpm);
  const acc = Number(url.searchParams.get("acc"));
  const band = !Number.isFinite(acc) ? "u80"
    : acc >= 100 ? "100" : acc >= 98 ? "98" : acc >= 95 ? "95"
    : acc >= 90 ? "90" : acc >= 80 ? "80" : "u80";
  const path = `/og/result/${seg}-${band}.png`;
  try {
    const res = await env.ASSETS.fetch(new Request(url.origin + path));
    if (res && res.ok) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", `public, max-age=${DAY}`);
      headers.set("x-og-fallback", why.slice(0, 80));
      return new Response(res.body, { status: 200, headers });
    }
  } catch { /* fall through */ }
  return new Response("Not found", { status: 404, headers: { "x-og-fallback": why.slice(0, 80) } });
}
