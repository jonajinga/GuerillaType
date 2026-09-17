/* /r/ -- the page a shared run lands on.

   Read the address carefully, because the two halves of it are not
   the same kind of thing:

     ?query    numbers, and at most a public id. The browser sent this
               to Cloudflare, and functions/r/index.js used it to build
               the preview card a scraper sees. Validated here again,
               with the same lib/og/validate.js the Function used, so
               a hand-edited link cannot put anything on this page that
               the card renderer would have refused.

     #fragment the text that was typed, when it is not public, and the
               keystroke replay. Browsers do not put a fragment on the
               wire -- not in the request line, not in Referer -- so
               this half has never left the reader's device and must
               not be helped to. Nothing here puts it in a fetch, an
               analytics call or an intent URL.

   An invalid query is a plain sentence, not a crash and not an empty
   card: a link that got cut in half by a chat app is the normal way
   this page is reached in error.
*/

import { validate } from "../og/validate.js";
import { MODES, LANGS, LAYOUTS, KIND_EYEBROW, durationLabel } from "../og/labels.js";
import { resolveSrc } from "../og/resolve.js";
import { rMeta, canonicalQuery, resultCardPath } from "../og/r-meta.js";
import { unpackLog, prefsFromMask } from "../share/codec.js";
import { openShareSheet } from "../share/share.js";
import { mountReplay } from "../share/replay.js";

const $ = (sel) => document.querySelector(sel);
const byRole = (name) => document.querySelector(`[data-r="${name}"]`);

const cardEl = $("#tt-shared");
const invalidEl = $("#tt-invalid");

/* Everything below assumes the /r/ markup. On any other page this
   module is a no-op rather than a console full of nulls. */
if (cardEl && invalidEl) boot();

function showInvalid() {
  cardEl.hidden = true;
  invalidEl.hidden = false;
}

/* The practice URL that re-runs the same thing. Mirrors srcFor() in
   share/result-link.js from the other direction; a text of the
   sharer's own has no public URL, so it opens custom mode empty. */
export function tryUrl(model) {
  const src = model && model.src;
  if (!src) {
    const mode = model && model.mode;
    if (!mode || mode === "custom" || mode === "book") return "/practice/?mode=custom";
    if (mode === "time") return `/practice/?mode=time${model.dur ? `&duration=${Math.round(model.dur)}` : ""}`;
    return `/practice/?mode=${encodeURIComponent(mode)}`;
  }
  const id = encodeURIComponent(src.id);
  switch (src.prefix) {
    case "q": return `/practice/?mode=quote&quote=id&qid=${id}`;
    case "id": return `/practice/?mode=idiom&iid=${id}`;
    case "po": return `/practice/?mode=poem&pid=${id}`;
    case "pa": return `/practice/?mode=parable&pid=${id}`;
    case "ls": return `/practice/?lesson=${id}`;
    case "ch": return `/practice/?challenge=${id}`;
    case "dr": return `/practice/?drill=${id}`;
    case "bk": {
      const [slug, a, b] = src.parts;
      if (a === "p") return `/practice/?book=${encodeURIComponent(slug)}&p=${encodeURIComponent(b || "")}`;
      return `/practice/?book=${encodeURIComponent(slug)}&ch=${encodeURIComponent(a || "0")}&page=${encodeURIComponent(b || "0")}`;
    }
    default: return "/practice/";
  }
}

/* Public content only, by id, from the JSON the site already ships.
   Never from the query: the id selects a file, the file supplies the
   words. */
function fetchJson(name) {
  const path = /^books\//.test(name) ? `/data/${name}.json` : `/data/${name}.json`;
  return fetch(path, { cache: "default" }).then((r) => (r.ok ? r.json() : null));
}

function setText(role, value) {
  const el = byRole(role);
  if (el) el.textContent = value;
}

function paintNumbers(model) {
  const wpm = String(Math.round(model.wpm));
  setText("wpm", wpm);
  setText("wpm2", wpm);
  setText("raw", model.raw == null ? "—" : String(Math.round(model.raw)));
  setText("acc", model.acc == null ? "—" : `${Math.round(model.acc)}%`);
  setText("con", model.con == null ? "—" : `${Math.round(model.con)}%`);

  const meta = [];
  if (model.modeLabel) meta.push(model.modeLabel);
  if (model.dur) meta.push(durationLabel(model.dur));
  if (model.langLabel) meta.push(model.langLabel);
  if (model.layLabel && model.lay !== "qwerty") meta.push(model.layLabel);
  if (model.date) meta.push(model.date);
  setText("meta", meta.join(" · "));

  const pb = byRole("pb");
  if (pb && model.pb) {
    pb.textContent = model.pb === 2 ? "NEW LIFETIME BEST" : "NEW MODE BEST";
    pb.hidden = false;
  }
  const ok = byRole("ok");
  if (ok && model.ok !== null) {
    ok.textContent = model.ok ? "✓ Challenge cleared" : "✗ Challenge missed";
    ok.classList.toggle("results__challenge--pass", !!model.ok);
    ok.classList.toggle("results__challenge--fail", !model.ok);
    ok.hidden = false;
  }

  const sub = $("#tt-shared-sub");
  if (sub) {
    const n = model.n == null ? null : Math.round(model.n);
    const e = model.err == null ? null : Math.round(model.err);
    sub.textContent = n == null
      ? "Their numbers are in the link. Nothing else about them is."
      : `${n} keystrokes${e == null ? "" : `, ${e} of them wrong`}. Their numbers are in the link; nothing else about them is.`;
  }
}

/* The kinds whose resolved `text` really is the string the engine was
   typing against. A lesson, a challenge and a drill resolve to a
   title and a blurb -- useful on a preview card, and nothing like the
   words that were typed -- so a replay is not offered for those
   rather than played against the wrong target. */
const REPLAYABLE_KINDS = new Set(["quote", "idiom", "parable", "poem", "book"]);

function targetFromPiece(piece) {
  if (!piece || !REPLAYABLE_KINDS.has(piece.kind)) return "";
  if (piece.kind === "poem") return (piece.lines || []).join("\n");
  return piece.text || "";
}

/* The words on screen. Three possible sources, in this order:
     1. the fragment's `t` -- what they typed, carried by the link
     2. the public piece named by `src`, fetched from /data/
     3. nothing at all, and the block stays hidden

   Returns the string the replay player should type against, which is
   NOT what is painted here: the panel shows a title and a byline round
   the words, and the engine only ever saw the words. */
async function paintText(model, fragText) {
  const box = byRole("text");
  const label = byRole("text-label");
  if (!box) return "";

  if (fragText) {
    box.textContent = fragText;
    box.hidden = false;
    if (label) { label.textContent = "What they typed"; label.hidden = false; }
    return fragText;
  }
  if (!model.src) return "";
  let piece = null;
  try { piece = await resolveSrc(model.src, fetchJson); } catch { piece = null; }
  if (!piece) return "";

  const bits = [];
  if (piece.title) bits.push(piece.title);
  const body = piece.lines ? piece.lines.join("\n") : (piece.text || "");
  if (body) bits.push(body);
  if (piece.moral) bits.push(piece.moral);
  if (piece.meaning) bits.push(piece.meaning);
  const by = [piece.author, piece.year, piece.source].filter(Boolean).join(" · ");
  if (by) bits.push(by);
  if (!bits.length) return "";

  box.textContent = bits.join("\n\n");
  box.style.whiteSpace = "pre-wrap";
  box.hidden = false;
  if (label) {
    label.textContent = KIND_EYEBROW[piece.kind]
      ? `What they typed — ${KIND_EYEBROW[piece.kind].toLowerCase()}`
      : "What they typed";
    label.hidden = false;
  }
  return targetFromPiece(piece);
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const model = validate(params);
  if (!model) { showInvalid(); return; }

  /* The fragment, read once and never passed on. URLSearchParams on
     location.hash: the values are already percent-decoded for us. */
  let frag = null;
  try { frag = new URLSearchParams(location.hash.replace(/^#/, "")); } catch { frag = null; }
  const fragText = (frag && frag.get("t")) || "";
  const prefs = prefsFromMask(frag && frag.get("o"));

  cardEl.hidden = false;
  invalidEl.hidden = true;
  paintNumbers(model);
  /* Started here, awaited at the bottom. The card must not wait on a
     fetch of /data/, and the player must not be built before the text
     it replays against is known. */
  const textReady = paintText(model, fragText)
    .catch((err) => { console.warn("[share] text", err); return ""; });

  const tryLink = $("#tt-try");
  if (tryLink) tryLink.setAttribute("href", tryUrl(model));

  /* Re-sharing a shared link. The short URL is this page's query, the
     full one is this page's address exactly as it stands -- fragment
     included, because that is where the text and the replay live and
     a reshare that dropped them would hand on an emptier link than the
     one that arrived. */
  const meta = rMeta(params, { origin: location.origin });
  const short = `${location.origin}/r/?${canonicalQuery(params) || params.toString()}`;
  const reshare = $("#tt-reshare");
  if (reshare) {
    reshare.addEventListener("click", () => {
      openShareSheet({
        title: meta.title,
        text: `${meta.title} · GuerillaType`,
        shortUrl: short,
        fullUrl: location.href,
        imageUrl: location.origin + resultCardPath(model.wpm, model.acc),
        kind: "result",
        mode: model.mode || "",
        surface: "share-landing",
        opener: reshare,
      });
    });
  }

  /* The replay. Decoding here rather than in the player keeps the "is
     there a replay in this link at all" question in one place, and it
     is what decides whether the Play button is ever shown: no `r` or
     `ru` in the fragment, or nothing to type against, and the page
     stays exactly as it was without a replay panel promising a run it
     cannot show. */
  const log = frag ? await unpackLog({ r: frag.get("r"), ru: frag.get("ru") }) : null;
  const root = $("#tt-replay-root");
  const playButton = $("#tt-replay-play");
  const replayText = await textReady;

  let player = null;
  try {
    player = mountReplay({
      root,
      button: playButton,
      entries: log ? log.entries : null,
      text: replayText,
      prefs,
      model,
      /* Deliberately a no-op. This page loads no analytics -- see its
         own footnote -- so there is nothing to report to and nothing
         here may become a network call. */
      onEvent: () => {},
    });
  } catch (err) {
    console.warn("[share] replay", err);
    player = null;
  }
  if (!player && root) root.hidden = true;

  /* The namespace the /r/ gate drives, and the shape D2 reserved.
     Every method is safe to call when there is no player: a link with
     no replay answers "no" rather than throwing. */
  window.__ttReplay = {
    version: 1,
    ready: !!player,
    entries: log ? log.entries : null,
    quantum: log ? log.quantum : null,
    prefs,
    text: fragText || null,
    target: replayText || null,
    model,
    root,
    playButton,
    player,
    play: (speed) => (player ? player.play(speed) : false),
    pause: () => (player ? player.pause() : false),
    seek: (k) => (player ? player.seek(k) : -1),
    restart: () => (player ? player.restart() : false),
    setSpeed: (s) => (player ? player.setSpeed(s) : 1),
    state: () => (player ? player.state() : {
      ready: false, playing: false, index: 0,
      total: log ? log.entries.length : 0, finished: false,
    }),
  };
}

export default boot;
