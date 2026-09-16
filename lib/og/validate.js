/* URLSearchParams -> a card model, or null.
 *
 * Every share link ends up here before anything is drawn. The contract
 * is deliberately blunt: **any violation returns null**, it never
 * "cleans up" a parameter and carries on. A card built from a
 * half-trusted query is exactly the bug this file exists to prevent --
 * the image is served from guerillatype.com and looks like the site
 * said it.
 *
 * Two things this does NOT do:
 *   - It does not reject unknown parameters. Links get utm tags stapled
 *     to them by every platform on earth; dropping the card because
 *     Facebook added fbclid would break sharing for no gain.
 *   - It does not resolve content. `src` is parsed and range-checked
 *     here; turning `q:q-do-love` into a quote is resolve.js's job,
 *     against the repo's own data.
 */
import { MODES, LANGS, LAYOUTS, KINDS } from "./labels.js";

/* Digits, optionally with up to two decimals. Deliberately NOT
   Number()/parseFloat: those accept "1e9", " 12", "0x20", "Infinity",
   and parseFloat("12abc") is 12. */
const NUM = /^\d{1,7}(\.\d{1,2})?$/;
const INT = /^\d{1,7}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/* One segment of a `src`. Lowercase, digits, hyphen. No dots, so
   `q:../../x` cannot survive; no slashes, so it can never leave a
   directory or become a second path segment. */
const ID = /^[a-z0-9-]{1,80}$/;

const MAX_SRC = 200;

/* A number in [lo, hi] or null. Absent -> `fallback` (null by default),
   present-but-wrong -> the BAD sentinel so the caller can tell the
   difference between "not given" and "given as rubbish". */
const BAD = Symbol("bad");

function num(params, key, lo, hi, { integer = false } = {}) {
  if (!params.has(key)) return null;
  const raw = params.get(key);
  if (!(integer ? INT : NUM).test(raw)) return BAD;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < lo || v > hi) return BAD;
  return v;
}

function pick(params, key, map) {
  if (!params.has(key)) return null;
  const raw = params.get(key);
  if (!Object.prototype.hasOwnProperty.call(map, raw)) return BAD;
  return raw;
}

/* "YYYY-MM-DD" that is a real day. 2026-13-40 and 2026-02-30 are not. */
function date(params, key) {
  if (!params.has(key)) return null;
  const raw = params.get(key);
  if (!DATE.test(raw)) return BAD;
  const [y, m, d] = raw.split("-").map(Number);
  if (y < 2015 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return BAD;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return BAD;
  return raw;
}

/* `<kind>:<id>[:<id>…]` — e.g. q:q-do-love, bk:alice-in-wonderland:0:3,
   bk:alice-in-wonderland:p:p12. Returns {kind, id, parts, raw}. */
export function parseSrc(raw) {
  if (typeof raw !== "string" || !raw || raw.length > MAX_SRC) return null;
  const parts = raw.split(":");
  if (parts.length < 2 || parts.length > 4) return null;
  const prefix = parts[0];
  if (!Object.prototype.hasOwnProperty.call(KINDS, prefix)) return null;
  const rest = parts.slice(1);
  for (const p of rest) if (!ID.test(p)) return null;
  return { kind: KINDS[prefix], prefix, id: rest[0], parts: rest, raw };
}

export function validate(input) {
  let params = input;
  if (typeof input === "string") {
    try { params = new URLSearchParams(input.replace(/^[?#]/, "")); }
    catch { return null; }
  }
  if (!params || typeof params.get !== "function") return null;

  if (params.get("v") !== "1") return null;

  const out = {
    layout: "result",
    v: 1,
    wpm: num(params, "wpm", 0, 400),
    raw: num(params, "raw", 0, 600),
    acc: num(params, "acc", 0, 100),
    con: num(params, "con", 0, 100),
    dur: num(params, "dur", 0, 3600),
    n: num(params, "n", 0, 1000000, { integer: true }),
    err: num(params, "err", 0, 1000000, { integer: true }),
    mode: pick(params, "mode", MODES),
    lang: pick(params, "lang", LANGS),
    lay: pick(params, "lay", LAYOUTS),
    pb: num(params, "pb", 1, 2, { integer: true }),
    ok: num(params, "ok", 0, 1, { integer: true }),
    date: date(params, "d"),
    src: null,
  };

  for (const k of Object.keys(out)) if (out[k] === BAD) return null;

  /* wpm is the one thing a result card cannot be drawn without. */
  if (out.wpm === null) return null;

  if (params.has("src")) {
    const src = parseSrc(params.get("src"));
    if (!src) return null;
    out.src = src;
  }

  out.modeLabel = out.mode ? MODES[out.mode] : null;
  out.langLabel = out.lang ? LANGS[out.lang] : null;
  out.layLabel = out.lay ? LAYOUTS[out.lay] : null;
  out.ok = out.ok === null ? null : out.ok === 1;

  return out;
}

export default validate;
