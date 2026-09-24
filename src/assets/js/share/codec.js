/* The keystroke log: engine -> bytes -> a URL fragment, and back.
 *
 * Why this file exists at all. `engine.typed[]` is truncated every
 * time you press backspace, so it cannot tell you what a session
 * actually looked like -- only what survived. A replay needs the
 * append-only record, which is `engine.keylog`: one `[op, delta]` pair
 * per keystroke, delta being the milliseconds since the previous pair.
 *
 * Where the bytes are allowed to travel is the whole point. A replay
 * is a reconstruction of what somebody typed, and what somebody typed
 * is theirs. So the encoded log rides in the URL **fragment**, after
 * the "#", which browsers never put on the wire. Nothing in this file
 * may ever be put in a query string by a caller -- share/result-link.js
 * is the only caller and it keeps that line.
 *
 * Wire format (before compression):
 *
 *     byte 0      version, currently 1
 *     byte 1      quantum in ms: 1, 2, 4 or 8
 *     varint      number of entries
 *     entries     [op][delta varint] repeated
 *
 *   op 0x01  backspace          op 0x02  word backspace
 *   op 0x03  pause              op 0x04  session ended (Esc / Stop)
 *   op 0x1F  the next varint is a Unicode code point (anything that is
 *            not printable ASCII: accents, CJK, tab, newline)
 *   op 0x20-0x7E  that ASCII character, as itself
 *
 * `delta` is stored as round(ms / quantum), so a coarser quantum is
 * how the budget ladder buys space: it costs timing precision and
 * nothing else. Deltas are small, repeated and highly skewed, which is
 * exactly what deflate is good at -- a 100-word run compresses to
 * roughly a third.
 *
 * Everything here is pure: no DOM, no globals beyond CompressionStream
 * (feature-detected), so scripts/check-share-page.mjs runs the round
 * trip in Node against the same file the browser loads.
 */

/* -- op codes, and the markers the engine pushes ------------------
   typing-engine.js imports the MARK_* constants and pushes them as
   single-character strings, so the engine never has to know about
   byte values and there is exactly one table. */
export const OP_BACKSPACE = 0x01;
export const OP_WORD_BACKSPACE = 0x02;
export const OP_PAUSE = 0x03;
export const OP_END = 0x04;
export const OP_UNICODE = 0x1f;

export const MARK_BACKSPACE = String.fromCharCode(OP_BACKSPACE);
export const MARK_WORD_BACKSPACE = String.fromCharCode(OP_WORD_BACKSPACE);
export const MARK_PAUSE = String.fromCharCode(OP_PAUSE);
export const MARK_END = String.fromCharCode(OP_END);

export const VERSION = 1;
/* Finest first: the ladder walks this array upward and stops at the
   first quantum whose fragment fits the budget. */
export const QUANTA = [1, 2, 4, 8];

/* -- preference bitmask -------------------------------------------
   The five settings that change what a keystroke MEANS. Replaying a
   run recorded with stopOnError through an engine without it produces
   a different screen from the same keys, so the mask travels with the
   replay (in the fragment, as "o"). Nothing here identifies a person;
   it is five booleans about how the engine was configured. */
export const PREF_BITS = [
  ["stopOnError", 1],
  ["spaceSkipsWords", 2],
  ["forgiveErrors", 4],
  ["ignoreCapitalization", 8],
  ["skipPunctuation", 16],
];

export function prefsMask(prefs) {
  const p = prefs || {};
  let m = 0;
  for (const [key, bit] of PREF_BITS) if (p[key]) m |= bit;
  return m;
}

export function prefsFromMask(mask) {
  const m = Number(mask) || 0;
  const out = {};
  for (const [key, bit] of PREF_BITS) out[key] = (m & bit) !== 0;
  return out;
}

/* -- varint (unsigned LEB128) ------------------------------------ */
function pushVarint(out, n) {
  let v = Math.max(0, Math.floor(Number(n) || 0));
  for (;;) {
    const byte = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) out.push(byte | 0x80);
    else { out.push(byte); return; }
  }
}

function readVarint(bytes, pos) {
  let v = 0, shift = 1, i = pos;
  for (;;) {
    if (i >= bytes.length) throw new Error("truncated varint");
    const b = bytes[i++];
    v += (b & 0x7f) * shift;
    if ((b & 0x80) === 0) break;
    shift *= 128;
    if (shift > 2 ** 49) throw new Error("varint too long");
  }
  return [v, i];
}

/* -- the log itself ---------------------------------------------- */

/* keylog: [[opString, deltaMs], ...] -> Uint8Array.
   `opString` is a single character: a typed character, or one of the
   MARK_* markers above. */
export function encodeLog(keylog, options = {}) {
  const quantum = QUANTA.includes(options.quantum) ? options.quantum : 1;
  const entries = Array.isArray(keylog) ? keylog : [];
  const out = [VERSION, quantum];
  pushVarint(out, entries.length);
  for (const entry of entries) {
    const ch = entry && entry[0];
    const delta = entry ? entry[1] : 0;
    const cp = typeof ch === "string" && ch.length ? ch.codePointAt(0) : (Number(ch) || 0);
    if ((cp >= 0x20 && cp <= 0x7e)
      || cp === OP_BACKSPACE || cp === OP_WORD_BACKSPACE
      || cp === OP_PAUSE || cp === OP_END) {
      out.push(cp);
    } else {
      out.push(OP_UNICODE);
      pushVarint(out, cp);
    }
    pushVarint(out, Math.round(Math.max(0, Number(delta) || 0) / quantum));
  }
  return Uint8Array.from(out);
}

/* Uint8Array -> { version, quantum, entries: [[char, deltaMs], ...] }.
   Throws on anything malformed; every caller treats a throw as "there
   is no replay in this link", never as a page error. */
export function decodeLog(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  if (b.length < 3) throw new Error("log too short");
  const version = b[0];
  if (version !== VERSION) throw new Error("unknown log version " + version);
  const quantum = b[1];
  if (!QUANTA.includes(quantum)) throw new Error("bad quantum " + quantum);
  let count, pos;
  [count, pos] = readVarint(b, 2);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (pos >= b.length) throw new Error("truncated log");
    const op = b[pos++];
    let ch;
    if (op === OP_UNICODE) {
      let cp;
      [cp, pos] = readVarint(b, pos);
      ch = String.fromCodePoint(cp);
    } else {
      ch = String.fromCharCode(op);
    }
    let q;
    [q, pos] = readVarint(b, pos);
    entries.push([ch, q * quantum]);
  }
  return { version, quantum, entries };
}

/* -- base64url, written out rather than borrowed ------------------
   btoa() is browser-only and Buffer is Node-only; this file has to run
   in both, unchanged, or the gate is testing a different codec from
   the one that ships. */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function toBase64Url(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  let out = "";
  for (let i = 0; i < b.length; i += 3) {
    const a0 = b[i], a1 = b[i + 1], a2 = b[i + 2];
    out += B64[a0 >> 2];
    out += B64[((a0 & 3) << 4) | ((a1 === undefined ? 0 : a1) >> 4)];
    if (a1 === undefined) break;
    out += B64[((a1 & 15) << 2) | ((a2 === undefined ? 0 : a2) >> 6)];
    if (a2 === undefined) break;
    out += B64[a2 & 63];
  }
  return out;
}

export function fromBase64Url(str) {
  const s = String(str || "");
  const out = [];
  let acc = 0, bits = 0;
  for (const c of s) {
    const v = B64.indexOf(c);
    if (v < 0) throw new Error("bad base64url character");
    acc = acc * 64 + v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      const div = 2 ** bits;
      out.push(Math.floor(acc / div) & 0xff);
      acc = acc % div;
    }
  }
  return Uint8Array.from(out);
}

/* -- compression --------------------------------------------------
   deflate-raw has no header and no checksum, which is 6-8 bytes we do
   not have to spend. Safari only learned CompressionStream in 16.4, so
   an uncompressed "ru" is the fallback rather than no replay at all. */
export function hasCompression() {
  try {
    return typeof CompressionStream === "function"
      && typeof DecompressionStream === "function";
  } catch { return false; }
}

async function pipeThrough(bytes, stream) {
  const src = new Blob([bytes]).stream().pipeThrough(stream);
  const buf = await new Response(src).arrayBuffer();
  return new Uint8Array(buf);
}

export async function deflateRaw(bytes) {
  return pipeThrough(bytes, new CompressionStream("deflate-raw"));
}

export async function inflateRaw(bytes) {
  return pipeThrough(bytes, new DecompressionStream("deflate-raw"));
}

/* keylog -> { key, value, bytes } where key is "r" (deflated) or "ru"
   (not). `bytes` is the length of the base64url text, which is what
   actually costs URL room. */
export async function packLog(keylog, options = {}) {
  const raw = encodeLog(keylog, options);
  if (hasCompression()) {
    try {
      const z = await deflateRaw(raw);
      /* Deflate can grow a very short log. Ship whichever is smaller;
         the key says which one it is, so there is nothing to guess. */
      if (z.length < raw.length) {
        const value = toBase64Url(z);
        return { key: "r", value, bytes: value.length, quantum: raw[1] };
      }
    } catch { /* fall through to the uncompressed form */ }
  }
  const value = toBase64Url(raw);
  return { key: "ru", value, bytes: value.length, quantum: raw[1] };
}

/* The reverse. Takes the two possible parameters; returns null when
   neither is present or the bytes do not decode. */
export async function unpackLog(input = {}) {
  const r = input && input.r;
  const ru = input && input.ru;
  try {
    if (r) return decodeLog(await inflateRaw(fromBase64Url(r)));
    if (ru) return decodeLog(fromBase64Url(ru));
  } catch { return null; }
  return null;
}

/* -- the budget ladder --------------------------------------------
   A URL no chat app will accept is worse than a URL with a coarser
   replay. When the fragment will not fit, give things up in this order
   and say what was given up:

     1. timing precision  (quantum 1 -> 2 -> 4 -> 8 ms)
     2. the replay        (the numbers and the text still travel)
     3. the text          (the numbers still travel)

   The text goes last because a shared result that cannot show what was
   typed is barely a shared result, and the replay is the bigger of the
   two by a wide margin.

   Returns { fragment, dropped, quantum, parts }. `fragment` has no
   leading "#". `dropped` is a subset of ["precision","replay","text"]
   in the order the ladder gave them up. */
export async function buildFragment(input = {}) {
  const budget = Number(input.budget) > 0 ? Number(input.budget) : 8192;
  const keylog = Array.isArray(input.keylog) ? input.keylog : [];
  const text = typeof input.text === "string" ? input.text : "";
  const mask = Number(input.prefs) || 0;
  const dropped = [];

  const compose = (log) => {
    const p = new URLSearchParams();
    p.set("v", "1");
    if (text) p.set("t", text);
    if (mask) p.set("o", String(mask));
    if (log) p.set(log.key, log.value);
    return p.toString();
  };

  let quantum = QUANTA[0];
  let packed = keylog.length ? await packLog(keylog, { quantum }) : null;
  let fragment = compose(packed);
  if (fragment.length <= budget) {
    return { fragment, dropped, quantum: packed ? packed.quantum : null, parts: partsOf(text, mask, packed) };
  }

  for (let i = 1; i < QUANTA.length && packed; i++) {
    quantum = QUANTA[i];
    packed = await packLog(keylog, { quantum });
    fragment = compose(packed);
    if (fragment.length <= budget) {
      dropped.push("precision");
      return { fragment, dropped, quantum: packed.quantum, parts: partsOf(text, mask, packed) };
    }
  }

  /* Still too big at 8 ms: the replay goes. */
  if (packed) {
    dropped.push("precision");
    dropped.push("replay");
    packed = null;
    fragment = compose(null);
    if (fragment.length <= budget) {
      return { fragment, dropped, quantum: null, parts: partsOf(text, mask, null) };
    }
  }

  /* And if the text alone will not fit, the text goes too. */
  const bare = new URLSearchParams();
  bare.set("v", "1");
  if (mask) bare.set("o", String(mask));
  if (text) dropped.push("text");
  return {
    fragment: bare.toString(),
    dropped,
    quantum: null,
    parts: partsOf("", mask, null),
  };
}

function partsOf(text, mask, packed) {
  return {
    text: !!text,
    prefs: !!mask,
    replay: packed ? packed.key : null,
    replayBytes: packed ? packed.bytes : 0,
  };
}

export default {
  encodeLog, decodeLog, packLog, unpackLog, buildFragment,
  toBase64Url, fromBase64Url, prefsMask, prefsFromMask,
};
