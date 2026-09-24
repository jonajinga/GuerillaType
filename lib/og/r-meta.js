/* A /r/ query string -> the five strings a link preview is made of.
 *
 * Split out from functions/r/index.js on purpose. A Cloudflare Pages
 * Function is awkward to test: it needs a Worker runtime, an ASSETS
 * binding and HTMLRewriter. The interesting part of it is not any of
 * those -- it is "given this query, what should the title say and
 * which card should the scraper fetch" -- and that is a pure function
 * of a string, so it lives here and scripts/check-share-page.mjs runs
 * it in Node.
 *
 * Nothing drawn or written here comes from the query as text. The
 * numbers are range-checked by validate.js, the mode / language /
 * layout are keys into the label maps, and `src` is a public id. A
 * link carrying mode=BUY-NOW produces the default card, not a title
 * with those words in it.
 */
import { validate } from "./validate.js";
import { MODES, LANGS, LAYOUTS, KIND_EYEBROW, BANDS, bandFor, durationLabel } from "./labels.js";

export const DEFAULT_IMAGE = "/assets/img/og-default.png";
export const SITE_NAME = "GuerillaType";
export const DEFAULT_TITLE = "GuerillaType";
export const DEFAULT_DESCRIPTION =
  "A free, open-source typing tutor for everyone. Lessons, drills, challenges, adaptive practice, custom text. No accounts.";

/* The query keys a /r/ link may carry, in the order they are written
   back out. Anything else -- utm tags, fbclid, a stray `t` somebody
   moved out of the fragment by hand -- is dropped here, so the card
   URL is stable and a cache entry means one thing. */
export const CANONICAL_KEYS = [
  "v", "wpm", "raw", "acc", "con", "dur", "n", "err",
  "mode", "lang", "lay", "pb", "ok", "d", "src",
];

function paramsOf(input) {
  if (input && typeof input.get === "function") return input;
  const s = String(input == null ? "" : input).replace(/^[?#]/, "");
  try { return new URLSearchParams(s); } catch { return new URLSearchParams(); }
}

/* The validated query, written back in a fixed key order. */
export function canonicalQuery(input) {
  const params = paramsOf(input);
  if (!validate(params)) return "";
  const out = new URLSearchParams();
  for (const k of CANONICAL_KEYS) {
    if (params.has(k)) out.set(k, params.get(k));
  }
  return out.toString();
}

/* wpm + accuracy -> the pre-rendered Free-plan card that
   scripts/gen-og-images.mjs wrote into _site/og/result/. The band
   thresholds are bandFor()'s, imported, never repeated: the file name
   is the only contract between the generator and the scraper, and two
   opinions about where 95% starts means a 404 preview. */
export function resultCardPath(wpm, acc) {
  const w = Math.max(0, Math.round(Number(wpm) || 0));
  const seg = w > 200 ? "200p" : String(w);
  return `/og/result/${seg}-${bandFor(acc)}.png`;
}

/* What the run was, in words, for the description line. Public content
   resolves to its kind ("a quote", "a page of a book"); anything else
   is named by its mode. */
function whatLabel(model) {
  if (model.src && KIND_EYEBROW[model.src.kind]) {
    const kind = model.src.kind;
    if (kind === "book") return "a page of a book";
    return `a ${kind}`;
  }
  if (model.mode && MODES[model.mode]) {
    const m = MODES[model.mode];
    if (model.mode === "time") return `a ${durationLabel(model.dur)} test`;
    if (model.mode === "words") return "a words test";
    return `a ${m.toLowerCase()} run`;
  }
  return "a typing run";
}

/* query -> { ok, title, description, image, alt, url, query }.
   options.origin   absolute origin for image and url ("https://guerillatype.com")
   options.dynamic  true to point og:image at the on-demand renderer
                    (/og/result.png?<canonical>) instead of the grid card */
export function rMeta(input, options = {}) {
  const origin = String(options.origin || "").replace(/\/+$/, "");
  const abs = (p) => (origin ? origin + p : p);
  const params = paramsOf(input);
  const model = validate(params);

  if (!model) {
    return {
      ok: false,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      image: abs(DEFAULT_IMAGE),
      alt: "GuerillaType, a free typing tutor for everyone",
      url: abs("/r/"),
      query: "",
    };
  }

  const wpm = Math.round(model.wpm);
  const acc = model.acc == null ? null : Math.round(model.acc);
  const band = BANDS[bandFor(acc == null ? 0 : acc)];
  const query = canonicalQuery(params);

  const accPhrase = acc == null ? "" : ` at ${acc}% accuracy`;
  const title = `${wpm} wpm${accPhrase} on ${SITE_NAME}`;

  const bits = [];
  bits.push(`${wpm} wpm${accPhrase} on ${whatLabel(model)}`);
  if (model.lay && LAYOUTS[model.lay] && model.lay !== "qwerty") bits.push(LAYOUTS[model.lay]);
  if (model.lang && LANGS[model.lang]) bits.push(LANGS[model.lang]);
  if (model.pb === 2) bits.push("a new lifetime best");
  else if (model.pb === 1) bits.push("a new best for this mode");
  if (model.ok === true) bits.push("challenge cleared");
  const description = `${bits.join(" · ")}. Open it to see the text and, if it travelled, play the run back.`;

  const image = options.dynamic && query
    ? abs(`/og/result.png?${query}`)
    : abs(resultCardPath(wpm, acc));

  return {
    ok: true,
    title,
    description,
    image,
    alt: `${wpm} wpm, ${band} accuracy, on a ${SITE_NAME} card`,
    url: abs(query ? `/r/?${query}` : "/r/"),
    query,
  };
}

export default rMeta;
