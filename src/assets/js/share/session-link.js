/* A run that finished weeks ago, turned back into a share link.

   The results card has everything in hand the moment a run ends: the
   engine's result object, the practice page's state, the keystroke
   log. A row on /stats/ has none of that. It has the stored record in
   the profile, and whatever engine/replay-store.js still holds under
   the same session id.

   So this file is an adapter and nothing else. It maps a stored
   session back into the { result, state, profile } shape that
   share/result-link.js's build() already expects, and then gets out of
   the way. Every decision about what a link may say -- which public
   ids may appear as `src`, what the query is allowed to contain, what
   goes after the "#" -- stays in result-link.js and lib/og/validate.js
   where the results card put it. A second opinion about privacy is how
   two answers to the same question get shipped.

   The rules this file DOES own, because they only exist for a past run:

     1. The text. A run with a public id (a quote, an idiom, a poem, a
        parable, a book page, a lesson, a challenge, a drill) carries
        that id and never the words -- /r/ fetches them from /data/.
        A words or time run carries the generated word stream it was
        typed against, if the replay store still has it. A text of
        your own carries its words only while that text is still saved
        in this browser (tt-custom, by id): delete the text and the
        link goes back to numbers. Its title and its id never travel
        at all, in any case, in any shape.
     2. The replay. It comes from replay-store by session id. Fifty
        runs are kept, so an older row shares without one and /r/
        offers no Play.
     3. The settings. The `o` bitmask is the one stored beside the run,
        not whatever this browser is set to today, and it is left out
        entirely when the record predates it. A replay played under
        somebody's later preferences is a different screen.
     4. Whether a row gets a Share button at all: only if
        lib/og/validate.js accepts the query we built. That is the same
        validator the landing page and the card renderer run, so "the
        site could not build a valid link for this row" means exactly
        what it says rather than being a guess.

   Records written before all this exist and are normal. They have no
   `link` key, no stored target and often no replay: they share their
   numbers and their date, which is what they have. */

import { build, buildQuery, shareText, WORD_STREAM, isOwnText, srcFor } from "./result-link.js";
import { resultImagePath } from "./share.js";
import { prefsFromMask } from "./codec.js";
import { get as getReplay } from "../engine/replay-store.js";
import { getSaved as getSavedCustom } from "../engine/custom-text.js";
import { customBookId, isCustomBookSlug } from "../engine/book-structure.js";
/* The real validator, the same file lib/og and the /r/ page use --
   lib/og is passthrough-copied to /assets/js/og/, so this is not a
   copy of it. */
import { validate } from "../og/validate.js";

const numOr = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/* The practice page's `state`, as far as a link needs one. Built from
   the stored ids only: nothing here is read from the page, and nothing
   here is a word of anybody's text. */
export function stateForSession(session) {
  const s = session || {};
  const l = s.link || {};
  const state = {
    mode: l.mode || s.mode || null,
    language: l.lang || s.lang || null,
    layout: l.lay || s.layout || null,
  };
  if (l.words != null) state.words = l.words;
  if (l.dur != null) state.duration = l.dur;
  else if (s.duration != null) state.duration = s.duration;
  if (l.bookSlug) state.bookSlug = l.bookSlug;
  if (l.bookCh != null) state.bookCh = l.bookCh;
  if (l.bookPage != null) state.bookPage = l.bookPage;
  if (l.bookParaId) state.bookParaId = l.bookParaId;
  if (l.lessonId != null) state.lessonId = l.lessonId;
  if (l.drillId) state.drillId = l.drillId;
  if (l.customId) state.customId = l.customId;
  if (l.kind || l.sourceId) state._customMeta = { kind: l.kind || null, sourceId: l.sourceId || null };
  return state;
}

/* The engine's `result`, as far as a link needs one. The unrounded
   numbers when the record has them (link.exact), the rounded ones the
   sessions list draws when it does not. */
export function resultForSession(session) {
  const s = session || {};
  const l = s.link || {};
  const e = l.exact || {};
  const result = {
    wpm: numOr(e.wpm, numOr(s.wpm, 0)),
    raw: numOr(e.raw, numOr(s.raw, 0)),
    accuracy: numOr(e.acc, numOr(s.acc, 0)),
    consistency: numOr(e.con, numOr(s.cons, 0)),
    /* Elapsed time. Older records kept only the SETTING (30 for a
       30-second test, nothing for a words run), so a run from before
       `ms` existed reports the setting when it has one and 0 when it
       does not. A missing duration is not a reason to refuse the
       link -- the numbers and the date are. */
    ms: numOr(e.ms, numOr(s.ms, s.duration ? Number(s.duration) * 1000 : 0)),
    chars: numOr(s.chars, 0),
    errors: numOr(s.errors, 0),
    mode: l.mode || s.mode || null,
    lang: l.lang || s.lang || null,
    layout: l.lay || s.layout || null,
    _meta: { newOverallBest: l.pb === 2, newModeBest: l.pb === 1 },
  };
  /* Both halves or neither. A record with a challenge id and no
     verdict would report the challenge as MISSED on a public card,
     which is a worse thing to say than nothing: without the pair, the
     run shares as an ordinary one. practice-boot writes them together,
     so this is a rule about records nobody has written yet. */
  if (l.challengeId && l.challengeOk != null) {
    result._challenge = { id: l.challengeId, passed: !!l.challengeOk };
  }
  return result;
}

/* Which words, if any, this run may put after the "#".

   `stored` is what the replay store kept of the target. Everything
   here is a reason to say no to it; the only ways to a yes are a
   generated word stream, and a text of your own that is still saved
   in this browser. */
function textFor({ state, result, stored }) {
  if (!stored) return "";
  /* A public piece names itself with `src` and the landing page looks
     the words up. Carrying them as well would be bytes for nothing --
     and build() would drop them anyway; this is the same rule said out
     loud, where the reason for it can be read. */
  if (srcFor({ result, state })) return "";
  if (isOwnText(state)) {
    const id = state.customId || (isCustomBookSlug(state.bookSlug) ? customBookId(state.bookSlug) : "");
    /* Still in this browser's own store, by id. A text that has been
       deleted is not this link's to hand on. */
    if (!id) return "";
    let saved = null;
    try { saved = getSavedCustom(id); } catch { saved = null; }
    return saved ? stored : "";
  }
  if (WORD_STREAM.has(state.mode)) return stored;
  return "";
}

/* The query alone, with no store lookups and no compressor: safe to
   call while painting a list. Returns null when lib/og/validate.js
   refuses what we built, which is the signal to show no button. */
export function queryForSession(session) {
  const s = session || {};
  if (!s || typeof s !== "object") return null;
  const state = stateForSession(s);
  const result = resultForSession(s);
  if (!Number.isFinite(result.wpm)) return null;
  let qs = "";
  try {
    qs = buildQuery({ result, state, at: s.at }).toString();
  } catch {
    return null;
  }
  if (!validate(qs)) return null;
  return { query: qs, state, result };
}

/* Everything a Share button needs before anything has been read out of
   a database: the query-only link, the card the build pre-rendered for
   these numbers, and the one-line summary the sheet shows. Numbers and
   a mode name, never a word of the run.

   This is what lets a list of rows paint a working button in one pass
   and upgrade each one with its fragment afterwards, the same two
   steps wireResultShare() takes on the results card. A button is never
   without a link and never has a wrong one. */
export function shortLinkForSession(session, opts = {}) {
  const base = queryForSession(session);
  if (!base) return null;
  const origin = opts.origin || (typeof location !== "undefined" ? location.origin : "");
  const { title, text, kindMode } = shareText(base);
  const p = new URLSearchParams(base.query);
  return {
    query: base.query,
    shortUrl: `${origin}/r/?${base.query}`,
    imageUrl: origin + resultImagePath(p.get("wpm"), p.get("acc")),
    title, text, mode: kindMode,
  };
}

/* The whole link: query, fragment, image, and the sheet's title and
   text. Async because the replay lives in IndexedDB and the fragment
   goes through a compressor.

   Returns null for a record no valid link can be built from -- the
   same answer queryForSession gives, for the same reason. */
export async function linkForSession(session, opts = {}) {
  const base = queryForSession(session);
  if (!base) return null;
  const s = session || {};
  const l = s.link || {};
  const { state, result } = base;

  let replay = null;
  if (s.id && opts.replay !== false) {
    try { replay = await getReplay(s.id); } catch { replay = null; }
  }
  /* The store answers by session id, so a record under this id IS this
     run -- unless its fingerprint of the target disagrees with the one
     the profile kept, which means one of the two was rewritten. In
     that case the keystrokes are still this run's, but the words
     beside them cannot be vouched for. */
  const textTrusted = !(replay && l.th && replay.textHash && replay.textHash !== l.th);
  const stored = replay && textTrusted && typeof replay.text === "string" ? replay.text : "";

  result.keylog = replay && Array.isArray(replay.keylog) ? replay.keylog : [];
  result.target = textFor({ state, result, stored });

  /* The settings this run was typed under, or nothing at all. Never
     today's preferences: an empty object is what leaves `o` out, and
     that is the honest answer for a record that predates the field.
     `profile` is deliberately not passed for the same reason. */
  const prefs = l.prefs == null ? {} : prefsFromMask(l.prefs);

  const link = await build({
    result, state, profile: null, prefs,
    at: s.at,
    origin: opts.origin,
    budget: opts.budget,
  });
  return {
    ...link,
    sessionId: s.id || null,
    hasReplay: !!(result.keylog && result.keylog.length),
    hasText: !!result.target,
  };
}

/* Which target a finishing run should leave in the replay store, or
   null. Called by practice-boot; it is here rather than there because
   it is the same question textFor() asks, read from the other end.

   A public piece is not kept: /r/ resolves it from its id, so the
   words would be a copy of something already published. What is kept
   is what nothing else can name -- the word stream a words or time run
   generated, and a text of this browser's own. */
export function replayTextFor(state, result) {
  const st = state || {};
  const res = result || {};
  const t = res.target;
  const text = Array.isArray(t) ? t.join(" ") : String(t == null ? "" : t);
  if (!text) return null;
  if (isOwnText(st)) return text;
  if (srcFor({ result: res, state: st })) return null;
  return WORD_STREAM.has(st.mode) ? text : null;
}

export default {
  linkForSession, shortLinkForSession, queryForSession,
  stateForSession, resultForSession, replayTextFor,
};
