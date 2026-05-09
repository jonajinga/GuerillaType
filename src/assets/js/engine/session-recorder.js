/* Session recorder — merges a finished session into the active profile,
   updating lifetime totals, daily buckets, perKey/perBigram from the
   model, per-mode personal bests, and achievements. Returns the updated
   profile + a `meta` object with PR + achievement information so the
   results card can celebrate. */

import { updateActive } from "../profiles.js";
import { todayIso, localHourKey } from "../util/format.js";
import { evaluate as evaluateAchievements } from "./achievements.js";

const SESSIONS_CAP = 500;

export function recordSession(result, modelSerialized) {
  const id = "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const entry = {
    id,
    at: new Date().toISOString(),
    mode: result.mode,
    duration: result.duration,
    wpm: round1(result.wpm),
    raw: round1(result.raw),
    acc: round1(result.accuracy),
    cons: round1(result.consistency),
    chars: result.chars,
    correctChars: result.correctChars,
    errors: result.errors,
    lang: result.lang || null,
    layout: result.layout || null,
    suspect: !!result.suspect,
  };

  const meta = { newOverallBest: false, newModeBest: false, modeBestKey: null, achievementsEarned: [] };

  const profile = updateActive((p) => {
    p.sessions = p.sessions || [];
    p.sessions.unshift(entry);
    if (p.sessions.length > SESSIONS_CAP) p.sessions.length = SESSIONS_CAP;

    p.lifetime = p.lifetime || { sessions: 0, chars: 0, correctChars: 0, totalMs: 0, bestWpm: 0, bestAccuracy: 0, streakDays: 0, lastDay: null };
    p.lifetime.sessions += 1;
    p.lifetime.chars += entry.chars;
    p.lifetime.correctChars += entry.correctChars;
    p.lifetime.totalMs += result.ms || 0;
    if (!entry.suspect && entry.wpm > (p.lifetime.bestWpm || 0)) {
      p.lifetime.bestWpm = entry.wpm;
      meta.newOverallBest = true;
    }
    if (entry.acc > (p.lifetime.bestAccuracy || 0)) p.lifetime.bestAccuracy = entry.acc;

    // Per-mode bests: keyed by "<mode>:<key>" where key is duration|words|quoteBucket
    p.modeBests = p.modeBests || {};
    const modeBestKey = bestKey(result);
    if (modeBestKey && !entry.suspect) {
      const cur = p.modeBests[modeBestKey];
      if (!cur || entry.wpm > cur.wpm) {
        p.modeBests[modeBestKey] = { wpm: entry.wpm, acc: entry.acc, at: entry.at };
        meta.newModeBest = true;
        meta.modeBestKey = modeBestKey;
      }
    }

    // Daily bucket
    const today = todayIso();
    p.daily = p.daily || {};
    const day = p.daily[today] || { sessions: 0, timeMs: 0, chars: 0 };
    day.sessions++;
    day.timeMs += result.ms || 0;
    day.chars += entry.chars;
    p.daily[today] = day;

    // Streak
    const yest = isoOffset(today, -1);
    if (p.lifetime.lastDay === today) {
      /* already counted today */
    } else if (p.lifetime.lastDay === yest) {
      p.lifetime.streakDays = (p.lifetime.streakDays || 0) + 1;
    } else {
      p.lifetime.streakDays = 1;
    }
    p.lifetime.lastDay = today;

    if (modelSerialized) {
      p.perKey = modelSerialized.perKey;
      p.perBigram = modelSerialized.perBigram;
      if (modelSerialized.perFinger) p.perFinger = modelSerialized.perFinger;
      if (modelSerialized.perCharDetail) p.perCharDetail = modelSerialized.perCharDetail;
    }

    // Per-word miss tracking. Prefer the engine's erroredCursors set
    // (positions where ANY wrong key landed during the session, even
    // if backspaced + corrected) since it survives retypes that the
    // typed[]-vs-target diff would miss. Falls back to the diff for
    // older code paths that don't pass erroredCursors.
    if (result.target != null) {
      const missed = Array.isArray(result.erroredCursors) && result.erroredCursors.length
        ? collectMissedWordsFromCursors(result.target, result.erroredCursors)
        : (Array.isArray(result.typed)
            ? collectMissedWords(result.target, result.typed, result.endCursor || 0)
            : []);
      if (missed.length) {
        p.missedWords = p.missedWords || {};
        const now = Date.now();
        for (const word of missed) {
          const cur = p.missedWords[word] || { n: 0, last: 0 };
          cur.n += 1;
          cur.last = now;
          p.missedWords[word] = cur;
        }
        // Cap at the top 500 most-missed (by recency-weighted count) so
        // the map doesn't grow unbounded across thousands of sessions.
        const entries = Object.entries(p.missedWords);
        if (entries.length > 500) {
          entries.sort((a, b) => weightedMissScore(b[1], now) - weightedMissScore(a[1], now));
          p.missedWords = Object.fromEntries(entries.slice(0, 500));
        }
      }
    }

    // Hourly bucket — same shape as daily, keyed by local-tz
    // "YYYY-MM-DDTHH" so the contribution drill-down columns line up
    // with the user's actual clock (a 9 PM local session lands in the
    // 21:00 column, not 02:00 of the next day).
    p.hourly = p.hourly || {};
    const hourKey = localHourKey(new Date(entry.at));
    const hr = p.hourly[hourKey] || { sessions: 0, timeMs: 0, chars: 0 };
    hr.sessions++;
    hr.timeMs += result.ms || 0;
    hr.chars += entry.chars;
    p.hourly[hourKey] = hr;

    // Lesson results — append a per-lesson trend entry when this session
    // came from a lesson. Index it for fast lookup by lessonId.
    if (result.lessonId != null) {
      const passed = (entry.acc >= 90 && entry.wpm >= 18);
      const lr = {
        lessonId: result.lessonId,
        sessionId: entry.id,
        at: entry.at,
        wpm: entry.wpm, acc: entry.acc,
        durMs: result.ms || 0,
        errors: entry.errors,
        passed,
      };
      p.lessonResults = p.lessonResults || [];
      p.lessonResults.unshift(lr);
      if (p.lessonResults.length > 1000) p.lessonResults.length = 1000;
      p.sessionsByLesson = p.sessionsByLesson || {};
      const ix = p.sessionsByLesson[result.lessonId] || [];
      ix.unshift(entry.id);
      if (ix.length > 200) ix.length = 200;
      p.sessionsByLesson[result.lessonId] = ix;
    }

    // Track all-time peak missed-word count so achievements that
    // require "list grew above N then dropped" can verify historical
    // state instead of just the current snapshot.
    p.missedWordsPeak = Math.max(
      p.missedWordsPeak || 0,
      Object.keys(p.missedWords || {}).length,
    );

    // Evaluate achievements after all stats are updated. Pass the
    // current session entry so context-sensitive achievements (time
    // of day, endurance, library, easter eggs, etc.) only celebrate
    // when this session is the actual qualifier -- otherwise they'd
    // fire retroactively on unrelated sessions whenever they're newly
    // added to the catalog.
    const ach = evaluateAchievements(p, entry);
    p.achievements = ach.unlocked;
    meta.achievementsEarned = ach.earned;

    return p;
  });

  return { profile, meta };
}

function bestKey(result) {
  if (result.mode === "time") return `time:${result.duration}`;
  if (result.mode === "words") {
    const w = result.target ? result.target.split(/\s+/).filter(Boolean).length : 0;
    return `words:${w}`;
  }
  if (result.mode === "quote") return `quote:${bucketLength(result.target || "")}`;
  if (result.mode === "challenge") return null;
  return `${result.mode}:total`;
}

function bucketLength(s) {
  const n = s.length;
  if (n < 80) return "short";
  if (n < 200) return "medium";
  if (n < 500) return "long";
  return "epic";
}

function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
function isoOffset(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* Map each cursor position in `erroredCursors` to its containing
   word in `target`, returning the de-duplicated, lowercased,
   punctuation-stripped word list. This is the preferred path because
   it survives backspace+retype -- the engine logs the position of
   every wrong keystroke whether or not it was later corrected. */
function collectMissedWordsFromCursors(target, erroredCursors) {
  const targetStr = Array.isArray(target) ? target.join(" ") : String(target || "");
  if (!targetStr) return [];
  const words = new Set();
  for (const pos of erroredCursors) {
    if (typeof pos !== "number" || pos < 0 || pos >= targetStr.length) continue;
    // If the error was on the space char, credit the word that just
    // ended (i.e., walk left).
    let end = pos;
    while (end < targetStr.length && targetStr[end] !== " ") end++;
    let start = pos;
    if (targetStr[start] === " ") start = pos - 1;
    while (start > 0 && targetStr[start - 1] !== " ") start--;
    if (start < 0) start = 0;
    if (start >= end) continue;
    const raw = targetStr.slice(start, end).trim();
    const cleaned = raw.replace(/^[^\w'-]+|[^\w'-]+$/g, "");
    if (cleaned.length >= 2) words.add(cleaned.toLowerCase());
  }
  return Array.from(words);
}

/* Walk the target string and the parallel typed-char array. For each
   space-delimited word in the target, if the user typed at least one
   char wrong (or skipped a char), count that word as missed. Only
   considers words the user actually reached -- early Esc partial
   sessions don't get credited for words they never touched. */
function collectMissedWords(target, typed, endCursor) {
  const targetStr = Array.isArray(target) ? target.join(" ") : String(target || "");
  if (!targetStr) return [];
  const limit = endCursor > 0 ? Math.min(endCursor, targetStr.length) : targetStr.length;
  const out = [];
  let wordStart = 0;
  let wordHasError = false;
  for (let i = 0; i <= limit; i++) {
    const tch = targetStr[i];
    const yped = typed[i];
    const isBoundary = i === limit || tch === " ";
    if (isBoundary) {
      if (i > wordStart) {
        const word = targetStr.slice(wordStart, i).trim();
        // Strip trailing punctuation so "the." and "the" map together.
        const cleaned = word.replace(/^[^\w'-]+|[^\w'-]+$/g, "");
        if (cleaned.length >= 2 && wordHasError) out.push(cleaned.toLowerCase());
      }
      wordStart = i + 1;
      wordHasError = false;
    } else if (i < limit && tch !== " ") {
      // Char position the user reached. If typed entry exists and is
      // marked incorrect (or the user skipped past without typing it),
      // flag the word. We treat "no typed entry" as a miss only if
      // the cursor moved past it -- which it always has by definition
      // since i < endCursor.
      if (!yped || yped === "" || (typeof yped === "string" && yped !== tch)) {
        wordHasError = true;
      }
    }
  }
  // Dedupe within the session -- repeating the same missed word in
  // one session shouldn't bump the count by 5x.
  return Array.from(new Set(out));
}

/* Recency-weighted miss score for ranking. Each miss decays at half-
   life ~2 weeks so old struggles fade out gradually as the user
   improves. Newer misses always rank above ancient ones. */
function weightedMissScore(entry, nowMs) {
  const ageMs = Math.max(0, nowMs - (entry.last || 0));
  const halfLifeMs = 14 * 24 * 60 * 60 * 1000;
  const decay = Math.pow(0.5, ageMs / halfLifeMs);
  return (entry.n || 0) * decay;
}
