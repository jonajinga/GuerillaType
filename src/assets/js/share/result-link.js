/* The link a finished run turns into.

   One run produces three URLs and the difference between them is the
   privacy rule of this whole feature, so it is worth stating plainly:

     shortUrl   /r/?v=1&wpm=..&acc=..&src=q:q-do-love
                Numbers, and at most a PUBLIC id. This is what goes to
                X, Bluesky, Threads, Facebook, LinkedIn, Reddit,
                Mastodon and WhatsApp -- the places a crawler reads.
     fullUrl    shortUrl + "#v=1&t=<the text>&r=<the replay>&o=<prefs>"
                Everything after the "#" is never sent to any server by
                any browser. Copy link, the native share sheet, email
                and Telegram carry this, because those go to a person.
     imageUrl   /og/result/<wpm>-<band>.png, the card the build
                pre-rendered. Free plan: no image is drawn per request.

   What may appear in the query is fixed by lib/og/validate.js and
   nothing else: v wpm raw acc con dur n err mode lang lay pb ok d src.
   A value that is not in the label maps, or an id that is not
   [a-z0-9-], is left out rather than sent -- so a query this file
   builds always survives validate(). `src` names public content only;
   a text of your own has no public id and never gets one, and its
   title never leaves the device at all.

   Deliberately NOT here: any custom-text id, any custom-text title,
   any analytics. share.js decides what analytics see. */

import { resultImagePath, setLocalCard } from "./share.js";
import { buildFragment, prefsMask } from "./codec.js";
/* The label maps, from the same file the server-side card renderer
   reads. lib/og is passthrough-copied to /assets/js/og/, so this is
   the file, not a copy of it: a mode id added in one place cannot go
   missing in the other. */
import { MODES, LANGS, LAYOUTS } from "../og/labels.js";
import { isCustomBookSlug } from "../engine/book-structure.js";

/* Must stay identical to ID in lib/og/validate.js. Lowercase, digits,
   hyphen: no dots, so "q:../../x" cannot survive; no slashes, so an id
   can never become a second path segment. */
const ID_RE = /^[a-z0-9-]{1,80}$/;

/* The modes whose text really is a stream from the chosen word list.
   Everywhere else the language chip would describe a setting that had
   nothing to do with what was on screen.

   Exported since share/session-link.js needs the same answer for a
   different question: which past runs have a target worth keeping on
   this device, because no public id can ever name it. */
export const WORD_STREAM = new Set(["time", "words", "zen", "adaptive", "tape", "game"]);

/* `src` prefixes, mirroring KINDS in lib/og/labels.js from the other
   direction: kind -> prefix. */
const PREFIX = {
  quote: "q", idiom: "id", poem: "po", parable: "pa",
  book: "bk", lesson: "ls", challenge: "ch", drill: "dr",
};

const okId = (v) => ID_RE.test(String(v == null ? "" : v));

function clampInt(n, lo, hi) {
  const v = Math.round(Number(n) || 0);
  return Math.max(lo, Math.min(hi, v));
}

/* yyyy-mm-dd in local time -- the day the person typing would call it,
   not UTC's idea of it. Matches DATE in lib/og/validate.js. */
export function todayStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Is this a text of the reader's own?

   THE definition, not a copy of one. practice-boot.js's isOwnText()
   calls this, because it needs exactly the same answer before it lets
   analytics say anything about a run, and a privacy predicate with two
   implementations is a privacy predicate with two answers.

   Two URL shapes reach the same private import: ?mode=custom&custom=<id>
   reads it a segment at a time, ?book=custom:<id>&ch=N&page=M reads it
   by chapter -- and the second sets state.mode = "book", so neither
   test alone covers both. */
export function isOwnText(state) {
  const s = state || {};
  return isCustomBookSlug(s.bookSlug) || s.mode === "custom";
}

/* Which public thing was typed, as "<prefix>:<id>", or null when
   nothing public was. Null is the normal answer for random words, a
   timed test and anything of the reader's own. */
export function srcFor(ctx) {
  const { result = {}, state = {} } = ctx || {};
  const cm = state._customMeta || {};
  const kind = cm.kind || null;
  const sourceId = cm.sourceId || null;

  /* A text of your own read by chapter arrives as book=custom:<id>.
     The slug IS the private id, so it is checked first and never
     becomes a src. */
  if (isCustomBookSlug(state.bookSlug)) return null;

  if (state.bookSlug) {
    const slug = String(state.bookSlug);
    if (!okId(slug)) return null;
    if (state.bookPage != null) {
      const ch = state.bookCh != null ? state.bookCh : 0;
      if (!okId(String(ch)) || !okId(String(state.bookPage))) return null;
      return `bk:${slug}:${ch}:${state.bookPage}`;
    }
    if (state.bookParaId && okId(state.bookParaId)) return `bk:${slug}:p:${state.bookParaId}`;
    const ch = state.bookCh != null ? state.bookCh : 0;
    return okId(String(ch)) ? `bk:${slug}:${ch}:0` : null;
  }
  if (result._challenge && okId(result._challenge.id)) return `ch:${result._challenge.id}`;
  if (state.lessonId != null && okId(String(state.lessonId))) return `ls:${state.lessonId}`;
  if (state.drillId && okId(state.drillId)) return `dr:${state.drillId}`;
  if (kind && PREFIX[kind] && sourceId && okId(sourceId)) return `${PREFIX[kind]}:${sourceId}`;
  return null;
}

/* The mode id the card should name. A poem or an idiom runs through
   custom mode internally; "Custom" would be a lie on the card and
   "Poem" is what was on screen. Anything not in the label map is left
   out entirely -- validate.js would reject it and a card with a blank
   chip helps nobody. */
export function modeFor(ctx) {
  const { result = {}, state = {} } = ctx || {};
  if (isCustomBookSlug(state.bookSlug)) return "custom";
  const cm = state._customMeta || {};
  const candidates = [cm.kind, state.mode, result.mode];
  for (const m of candidates) {
    if (m && Object.prototype.hasOwnProperty.call(MODES, m)) return m;
  }
  return null;
}

/* result + state -> the query string, already in the order the /r/
   page and the card renderer read it. Pure and synchronous: the
   fragment is the part that needs a compressor. */
export function buildQuery(ctx) {
  const { result = {}, state = {} } = ctx || {};
  const meta = result._meta || {};
  const p = new URLSearchParams();
  p.set("v", "1");
  p.set("wpm", String(clampInt(result.wpm, 0, 400)));
  p.set("raw", String(clampInt(result.raw, 0, 600)));
  p.set("acc", String(clampInt(result.accuracy, 0, 100)));
  p.set("con", String(clampInt(result.consistency, 0, 100)));
  p.set("dur", String(clampInt((result.ms || 0) / 1000, 0, 3600)));
  p.set("n", String(clampInt(result.chars, 0, 1000000)));
  p.set("err", String(clampInt(result.errors, 0, 1000000)));

  const mode = modeFor(ctx);
  if (mode) p.set("mode", mode);

  const lang = result.lang || state.language;
  if (mode && WORD_STREAM.has(mode) && lang && Object.prototype.hasOwnProperty.call(LANGS, lang)) {
    p.set("lang", lang);
  }
  const lay = result.layout || state.layout;
  if (lay && Object.prototype.hasOwnProperty.call(LAYOUTS, lay)) p.set("lay", lay);

  /* 2 beats 1: a lifetime best is the one worth the badge. */
  if (meta.newOverallBest) p.set("pb", "2");
  else if (meta.newModeBest) p.set("pb", "1");

  if (result._challenge) p.set("ok", result._challenge.passed ? "1" : "0");
  /* `at` is the day a PAST run happened, for a link built from the
     stored record of one (share/session-link.js). Absent -- which is
     every caller that shares a run as it finishes -- means today. An
     unparseable date falls back to today rather than writing
     "NaN-NaN-NaN", which validate.js would refuse and which would
     take the whole link down with it. */
  const atRaw = (ctx || {}).at;
  const at = atRaw == null ? null : new Date(atRaw);
  p.set("d", todayStamp(at && !Number.isNaN(at.getTime()) ? at : undefined));

  const src = srcFor(ctx);
  if (src) p.set("src", src);
  return p;
}

/* The one-line summary the share sheet shows and the intents carry.
   Numbers and a mode name: never a title, never a sentence that was
   typed. */
export function shareText(ctx) {
  const { result = {}, state = {} } = ctx || {};
  const wpm = clampInt(result.wpm, 0, 400);
  const acc = clampInt(result.accuracy, 0, 100);
  const own = isOwnText(state);
  const mode = modeFor(ctx);
  const label = own ? "custom text"
    : state.mode === "time" ? `${state.duration || 30}s test`
    : state.mode === "words" ? `${state.words || 25}-word test`
    : state.lessonId != null ? `lesson ${state.lessonId}`
    : state.bookSlug ? "book page"
    : mode ? MODES[mode].toLowerCase()
    : "test";
  return {
    title: `${wpm} wpm on GuerillaType`,
    text: `${wpm} wpm · ${acc}% accuracy · ${label} · GuerillaType`,
    kindMode: own ? "custom" : (mode || ""),
  };
}

/* The text the /r/ page should show, when it cannot look it up.
   Returns "" whenever `src` is set -- a public piece is fetched from
   /data/ on the landing page rather than carried around. */
function fragmentText(ctx, src) {
  if (src) return "";
  const { result = {} } = ctx || {};
  const t = result.target;
  const s = Array.isArray(t) ? t.join(" ") : String(t || "");
  return s;
}

/* build({result, state, profile}) -> {shortUrl, fullUrl, imageUrl, dropped}
   plus the query, the src and the sheet's title/text, because every
   caller needs those too and computing them twice invites two answers.

   `origin` is injectable only so the gate can build a link without a
   browser; in the app it is always location.origin. */
export async function build(ctx) {
  const c = ctx || {};
  const { result = {}, state = {}, profile = null } = c;
  const origin = c.origin || (typeof location !== "undefined" ? location.origin : "");
  const query = buildQuery(c);
  const src = query.get("src") || null;

  const prefs = c.prefs
    || (profile && profile.preferences)
    || {
      stopOnError: state.freedom === false,
      spaceSkipsWords: !!state.spaceSkipsWords,
      forgiveErrors: !!state.forgiveErrors,
      ignoreCapitalization: !!state.ignoreCapitalization,
      skipPunctuation: !!state.skipPunctuation,
    };

  const frag = await buildFragment({
    keylog: Array.isArray(result.keylog) ? result.keylog : [],
    text: fragmentText(c, src),
    prefs: prefsMask(prefs),
    budget: c.budget,
  });

  const qs = query.toString();
  const shortUrl = `${origin}/r/?${qs}`;
  const fullUrl = frag.fragment ? `${shortUrl}#${frag.fragment}` : shortUrl;
  const imageUrl = origin + resultImagePath(query.get("wpm"), query.get("acc"));
  const { title, text, kindMode } = shareText(c);

  return {
    shortUrl, fullUrl, imageUrl,
    dropped: frag.dropped,
    query: qs, src,
    fragment: frag.fragment,
    quantum: frag.quantum,
    title, text, mode: kindMode,
  };
}

/* The single call the results card makes.

   Two steps on purpose. The query-only link is written to the button
   synchronously, so a Share clicked in the first frame still shares
   something correct; the fragment (which needs a compressor and
   therefore a promise) upgrades data-share-url a moment later. The
   button is never without a link, and never has a wrong one. */
/* The passage that was typed, for the picture the browser draws. Never
   for a url: buildFragment() is the only thing that puts text in one,
   and it puts it after the "#".

   Exported because /stats/ draws the same card for the same kind of
   run, and 600 is a number the card's layout chose. Two copies of it
   would drift the first time that layout changed. */
export function excerptOf(result) {
  const t = (result && result.target) || "";
  return String(Array.isArray(t) ? t.join(" ") : t).slice(0, 600);
}

export function wireResultShare(btn, ctx) {
  /* Cleared before anything can throw, so a share that fails to build
     cannot leave the PREVIOUS run's text sitting in the renderer. */
  setLocalCard(null);
  if (!btn) return Promise.resolve(null);
  const c = ctx || {};
  const origin = c.origin || (typeof location !== "undefined" ? location.origin : "");
  let shortUrl = "";
  try {
    const query = buildQuery(c);
    shortUrl = `${origin}/r/?${query.toString()}`;
    const { title, text, kindMode } = shareText(c);
    btn.setAttribute("data-share", "");
    btn.setAttribute("data-share-kind", "result");
    btn.setAttribute("data-share-surface", "result");
    btn.setAttribute("data-share-mode", kindMode);
    btn.setAttribute("data-share-title", title);
    btn.setAttribute("data-share-text", text);
    btn.setAttribute("data-share-short-url", shortUrl);
    btn.setAttribute("data-share-url", shortUrl);
    btn.setAttribute("data-share-image", origin + resultImagePath(query.get("wpm"), query.get("acc")));
    /* A text of your own, with no public id: the one kind of result
       guerillatype.com can never draw a picture of, because it has
       never seen the words. `data-share-image` above stays the
       pre-rendered grid card -- that is what a crawler is given and it
       must not show the text -- but Download PNG renders the real card
       here instead, from this same query (share/local-card.js).

       The predicate is isOwnText() AND no src: a poem typed through
       custom mode is "own text" by the first test and has a public page
       by the second, so it keeps the server's card. The excerpt is
       handed over in process, never as an attribute: everything in this
       button's dataset is one careless template away from an intent
       url. */
    const ownPrivate = isOwnText(c.state) && !srcFor(c);
    if (ownPrivate) btn.setAttribute("data-share-private", "1");
    if (ownPrivate) setLocalCard({ text: excerptOf(c.result), stats: query.toString() });
  } catch (err) {
    /* A share button that cannot be built must not take the results
       card down with it. */
    console.warn("[share] result link", err);
    return Promise.resolve(null);
  }
  return build(c).then((link) => {
    if (!document.contains(btn)) return link;
    btn.setAttribute("data-share-url", link.fullUrl);
    btn.setAttribute("data-share-short-url", link.shortUrl);
    if (link.dropped && link.dropped.length) btn.setAttribute("data-share-dropped", link.dropped.join(","));
    return link;
  }).catch((err) => {
    console.warn("[share] result fragment", err);
    return null;
  });
}

export default { build, buildQuery, srcFor, modeFor, shareText, wireResultShare, todayStamp };
