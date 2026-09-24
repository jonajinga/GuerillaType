/* GET /r/ -- a shared run, with a preview card a scraper can read.
 *
 * Cloudflare Pages runs this file for /r and /r/ (and only those: see
 * src/_routes.json, which is copied to the deploy root). Everything
 * else on the site is served straight from the static bucket.
 *
 * What it does is small on purpose, because the Workers Free plan
 * allows 10 ms of CPU per request: fetch the static /r/index.html
 * through the ASSETS binding and stream it through HTMLRewriter,
 * replacing eight <head> elements on the way past. HTMLRewriter is a
 * streaming parser written in Rust; this is one or two milliseconds.
 *
 * What it does NOT do is draw anything. On the Free plan og:image is
 * one of the ~1,200 cards `scripts/gen-og-images.mjs` pre-rendered
 * into /og/result/<wpm>-<band>.png at build time. When OG_DYNAMIC is
 * set (a Paid plan, where satori and resvg can afford the CPU), it
 * points at /og/result.png?<canonical query> instead and
 * functions/og/[[path]].js answers that.
 *
 * The privacy line runs straight through this file. A request for
 * /r/?... carries the query and nothing else: the fragment, which is
 * where the text and the keystroke replay live, is not sent by any
 * browser and is not available here. There is nothing to log even if
 * somebody wanted to.
 */
import { rMeta } from "../../lib/og/r-meta.js";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* One rewriter rule: replace the content attribute of a meta tag. */
function contentSetter(value) {
  return { element(el) { el.setAttribute("content", value); } };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  /* The static page. env.ASSETS.fetch resolves against the deployed
     bucket, so this is the file Eleventy built from src/r.njk -- the
     Function never has to know the markup. */
  const assetUrl = new URL("/r/", url.origin);
  let res;
  try {
    res = await env.ASSETS.fetch(new Request(assetUrl.toString(), { headers: request.headers }));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!res || !res.ok) return res || new Response("Not found", { status: 404 });

  const meta = rMeta(url.searchParams, {
    origin: url.origin,
    dynamic: env && env.OG_DYNAMIC === "1",
  });

  const rewritten = new HTMLRewriter()
    .on("title", {
      element(el) { el.setInnerContent(esc(meta.title), { html: true }); },
    })
    .on('meta[name="description"]', contentSetter(meta.description))
    .on('meta[property="og:title"]', contentSetter(meta.title))
    .on('meta[property="og:description"]', contentSetter(meta.description))
    .on('meta[property="og:url"]', contentSetter(meta.url))
    .on('meta[property="og:image"]', contentSetter(meta.image))
    .on('meta[property="og:image:alt"]', contentSetter(meta.alt))
    .on('meta[property="og:image:type"]', contentSetter("image/png"))
    .on('meta[name="twitter:card"]', contentSetter("summary_large_image"))
    .on('meta[name="twitter:title"]', contentSetter(meta.title))
    .on('meta[name="twitter:description"]', contentSetter(meta.description))
    .on('meta[name="twitter:image"]', contentSetter(meta.image))
    .on('meta[name="twitter:image:alt"]', contentSetter(meta.alt))
    .transform(res);

  /* _headers rules do not apply to Function responses, so the two that
     matter are set here. noindex because a /r/ link is one person's
     run and has no business in a search index; five minutes of cache
     because the same link really is the same page, and a scraper that
     retries should not re-run this. */
  const headers = new Headers(rewritten.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=300");
  headers.set("X-Robots-Tag", "noindex");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return new Response(rewritten.body, { status: 200, headers });
}

