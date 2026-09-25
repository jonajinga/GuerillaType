/* Stats page boot. Renders all viz, achievements, and per-mode bests. */

import { getActive } from "../profiles.js";
import { Analytics } from "../analytics.js";
Analytics.statsViewed({});
import { renderKeyboard } from "../stats/viz-keyboard.js";
import { renderTrend } from "../stats/viz-trend.js";
import { renderTrendD3 } from "../stats/viz-trend-d3.js";
import { renderContribution, renderDayStrip } from "../stats/viz-contribution.js";
import { renderContributionD3 } from "../stats/viz-contribution-d3.js";
import { renderPerKey } from "../stats/viz-per-key.js";
import { renderPerKeyD3 } from "../stats/viz-per-key-d3.js";
import { renderPerFinger, summarizePerFinger } from "../stats/viz-per-finger.js";
import { renderPerFingerD3 } from "../stats/viz-per-finger-d3.js";
import { renderCharacterTable } from "../stats/viz-character-table.js";
import { renderCharacterTableD3 } from "../stats/viz-character-table-d3.js";
import { renderMissedWordsD3 } from "../stats/viz-missed-words-d3.js";
import { renderSessionsD3 } from "../stats/viz-sessions-d3.js";
import { renderLessonTrends } from "../stats/viz-lesson-trends.js";
import { listLessonPinned } from "../engine/custom-text.js";
import { renderKeyStrip } from "../stats/viz-key-strip.js";
import { ACHIEVEMENTS } from "../engine/achievements.js";
import { localDayIso } from "../util/format.js";
import { $, htmlEscape } from "../util/dom.js";
/* A past run, turned back into the link the results card would have
   offered for it. Every rule about what may be in one lives there and
   in share/result-link.js; this page only draws the button. */
import { shortLinkForSession, linkForSession } from "../share/session-link.js";
/* Download PNG on a result typed from a text of your own draws the
   card in this browser, because this site has never seen the words.
   The results card does the same; these are the two halves of that
   one feature and they must not drift. */
import { setLocalCard } from "../share/share.js";
import { excerptOf } from "../share/result-link.js";
/* Read directly, and only to answer one question: is a write from a
   run that has just finished still in the air? See settleReplays(). */
import { get as getReplay, list as listReplays, idbSupported } from "../engine/replay-store.js";

const profile = getActive();
const lt = profile.lifetime || {};
const sessionCount = lt.sessions || 0;

// Print-cover personalization. Date renders in the user's locale,
// profile name escapes any HTML the user might have set on themselves.
const printDateEl = document.getElementById("stats-print-date");
if (printDateEl) {
  printDateEl.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}
const printProfileEl = document.getElementById("stats-print-profile");
if (printProfileEl && profile.name) {
  printProfileEl.textContent = `Profile: ${profile.name}`;
}

// Tiles
$('[data-tile="sessions"]').textContent = sessionCount;
$('[data-tile="bestWpm"]').textContent = Math.round(lt.bestWpm || 0);
$('[data-tile="bestAcc"]').textContent = Math.round(lt.bestAccuracy || 0) + "%";
$('[data-tile="streak"]').textContent = (lt.streakDays || 0) + "d";

const summary = $("#stats-summary");
if (sessionCount === 0) {
  summary.innerHTML = `Take your first session and your stats will start filling in. <a href="/practice/?mode=time&duration=30" class="stats-cta">Start a 30-second test →</a>`;
} else {
  const totalMin = Math.floor((lt.totalMs || 0) / 60_000);
  summary.textContent = `${sessionCount} sessions · ${(lt.chars || 0).toLocaleString()} chars typed · ${totalMin} minutes total.`;
}

// If empty profile, dim/hide the heavy viz and show a friendly empty hero.
if (sessionCount === 0) {
  document.body.classList.add("stats-empty-mode");
}

// Contribution grid — interactive: cells open a drill-down panel
// showing that day's hourly heatmap and session list.
const contribSvg = document.getElementById("contrib-svg");
const detailPanel = document.getElementById("contrib-detail");
const detailTitle = document.getElementById("contrib-detail-title");
const detailSessions = document.getElementById("contrib-detail-sessions");
const daySvg = document.getElementById("contrib-day-svg");
let contribView = "year";

function paintContrib() {
  // Expose sessions on window for the D3 day-panel click handler
  // to filter against without re-importing the profile.
  try { window.__profileSessions = profile.sessions || []; } catch {}
  renderContributionD3(contribSvg, profile.daily || {}, detailPanel, {
    view: contribView,
  });
}

function openDay(iso) {
  if (!detailPanel) return;
  detailPanel.hidden = false;
  detailTitle.textContent = humanDate(iso);
  renderDayStrip(daySvg, profile.hourly || {}, iso);
  // The contribution grid + hourly heatmap key off the LOCAL date
  // (see localDayIso) -- a session typed at 11 PM local on May 8 lands
  // in the May-8 column even when its `at` ISO string starts with
  // "2026-05-09". Slicing s.at to compare against `iso` would miss
  // those sessions; convert each session's timestamp to the local
  // date before filtering.
  const sessions = (profile.sessions || []).filter((s) => {
    if (!s.at) return false;
    try { return localDayIso(new Date(s.at)) === iso; }
    catch { return false; }
  });
  if (!sessions.length) {
    detailSessions.innerHTML = `<li class="muted" style="padding:.5rem 0">No sessions recorded that day.</li>`;
  } else {
    detailSessions.innerHTML = sessions.map((s) => {
      // Time-of-day in local tz, matching the day strip's 24-hour buckets.
      let hhmm = "";
      try {
        const d = new Date(s.at);
        hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      } catch { hhmm = ""; }
      return `
      <li class="contrib-detail__session">
        <span class="contrib-detail__time">${hhmm}</span>
        <span class="contrib-detail__mode">${escapeText(s.mode)}${s.duration ? ` · ${s.duration}s` : ""}</span>
        <span class="tabular">${s.wpm} wpm</span>
        <span class="tabular muted">${s.acc}% acc</span>
      </li>
    `;
    }).join("");
  }
  detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.querySelectorAll(".contrib-toggle__btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".contrib-toggle__btn").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    contribView = btn.dataset.view || "year";
    Analytics.statsTabSwitched({ tab: "contribution", view: contribView });
    paintContrib();
  });
});
const closeBtn = document.getElementById("contrib-detail-close");
if (closeBtn) closeBtn.addEventListener("click", () => { detailPanel.hidden = true; });
paintContrib();

function humanDate(iso) {
  // Parse as a LOCAL midnight, not UTC midnight, so the displayed
  // weekday matches the date the user clicked (the contribution grid's
  // dates are local). toUTCString on a local-midnight date would walk
  // back into the previous day for users east of UTC.
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
function escapeText(s) {
  return String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;"}[c]));
}

// Trend -- D3 version (richer rendering: rolling mean, area fill,
// per-point hover). Lazy-loads d3 from esm.sh on first call. The
// legacy renderTrend fallback fires inside renderTrendD3 if D3
// fails to load (offline, blocked CDN, etc.).
renderTrendD3(document.getElementById("trend-svg"), profile.sessions || []);

// Keyboard heatmap
const kbSvg = document.getElementById("kb-svg");
const kbSum = document.getElementById("kb-summary");
let kbMetric = "errorRate";
function paintKb() {
  renderKeyboard(kbSvg, profile.perKey || {}, { layout: profile.settings.layout, metric: kbMetric });
  if (kbSum) {
    const total = parseInt(kbSvg.dataset.totalSamples || "0", 10);
    const keys = parseInt(kbSvg.dataset.keysWithData || "0", 10);
    if (total === 0) {
      kbSum.textContent = "No keystrokes recorded yet — go type a session.";
    } else if (keys === 0) {
      kbSum.textContent = `${total} keystrokes recorded — type a few more so each key has enough samples to score.`;
    } else {
      kbSum.textContent = `${total.toLocaleString()} keystrokes across ${keys} keys with enough samples to score.`;
    }
  }
}
paintKb();
document.querySelectorAll(".kb-toggle__btn").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".kb-toggle__btn").forEach((x) => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true");
    kbMetric = b.dataset.metric;
    paintKb();
  });
});

// Per-key bars
renderPerKeyD3(document.getElementById("perkey-svg"), profile.perKey || {}, profile.perCharDetail || {});

// New v2 reports — per-finger errors, character table, lesson trends.
renderKeyStrip(document.getElementById("key-strip-host"), profile.perCharDetail || {}, profile.perKey || {});
renderPerFingerD3(document.getElementById("perfinger-svg"), profile.perFinger || {});
{
  const sum = summarizePerFinger(profile.perFinger || {});
  const target = document.getElementById("perfinger-summary");
  if (target && sum) target.textContent = sum.message;
}
// D3 character table -- richer than the legacy renderCharacterTable
// (inline bar viz, sort toggles). Falls back to legacy if d3 fails.
(async () => {
  const host = document.getElementById("char-table-host");
  if (!host) return;
  const ok = await renderCharacterTableD3(host, profile.perCharDetail || {}, profile.perKey || {});
  if (!ok) renderCharacterTable(host, profile.perCharDetail || {}, profile.perKey || {});
})();
{
  // Titles for any custom text pinned as a lesson, so its panel reads
  // as the book rather than as "Lesson custom:c_ab7f".
  const labels = {};
  for (const it of listLessonPinned()) labels["custom:" + it.id] = it.title;
  renderLessonTrends(document.getElementById("lesson-trends-svg"), profile.lessonResults || [], { labels });
}

// ── Missed-words ranked list ─────────────────────────────────────
// Render missed-words via the D3 viz; falls back to the legacy
// list if D3 fails. The legacy code below stays as the fallback.
function renderMissedWords() {
  const map = profile.missedWords || {};
  const summary = document.getElementById("missed-words-summary");
  const listEl = document.getElementById("missed-words-list");
  const section = document.getElementById("missed-words-section");
  if (!summary || !listEl) return;
  // Try D3 first.
  (async () => {
    const ok = await renderMissedWordsD3(listEl, map);
    if (ok) {
      const total = Object.keys(map).length;
      summary.textContent = total > 0
        ? `${total} word${total === 1 ? "" : "s"} tracked · sortable, scroll for more`
        : "";
    }
  })();
  return; // skip legacy
  const now = Date.now();
  const halfLifeMs = 14 * 24 * 60 * 60 * 1000;
  const ranked = Object.entries(map).map(([w, e]) => {
    const ageMs = Math.max(0, now - (e.last || 0));
    const decay = Math.pow(0.5, ageMs / halfLifeMs);
    return { word: w, n: e.n || 0, last: e.last || 0, score: (e.n || 0) * decay };
  }).filter((r) => r.score > 0.05).sort((a, b) => b.score - a.score);
  const total = ranked.length;
  if (!total) {
    summary.textContent = "No missed words tracked yet — finish a session and any word you flub will land here.";
    listEl.innerHTML = "";
    return;
  }
  summary.textContent = `${total} word${total === 1 ? "" : "s"} tracked · scroll to see all`;
  // Show the full list -- the list-wrapper CSS provides a fixed
  // max-height with overflow-y:auto so the user can scroll through
  // every tracked word instead of being capped at 20.
  const top = ranked.slice(0, 500);
  const maxN = top[0].n || 1;
  listEl.innerHTML = top.map((r) => {
    const pct = Math.max(8, Math.round((r.n / maxN) * 100));
    const ago = formatAgo(now - r.last);
    return `
      <li class="missed-word">
        <span class="missed-word__text">${htmlEscape(r.word)}</span>
        <span class="missed-word__bar" aria-hidden="true">
          <span class="missed-word__bar-fill" style="width:${pct}%"></span>
        </span>
        <span class="missed-word__count" data-tip="Times missed across all sessions"><strong>${r.n}</strong> miss${r.n === 1 ? "" : "es"}</span>
        <span class="missed-word__age muted">${ago}</span>
      </li>
    `;
  }).join("");
}
function formatAgo(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}
renderMissedWords();
const resetMissedBtn = document.getElementById("missed-words-reset");
if (resetMissedBtn) {
  resetMissedBtn.addEventListener("click", async () => {
    try {
      const { confirmModal } = await import("../util/modal.js?v=1");
      const ok = await confirmModal({
        title: "Reset missed words?",
        message: "Your missed-words history will be cleared. The next session you flub a word, it'll start tracking from scratch.",
        confirmLabel: "Reset",
        danger: true,
      });
      if (!ok) return;
    } catch {
      if (!window.confirm("Clear your missed-words history?")) return;
    }
    const { updateActive } = await import("../profiles.js?v=1");
    updateActive((p) => { p.missedWords = {}; return p; });
    profile.missedWords = {};
    renderMissedWords();
  });
}

// ── Achievements grid ────────────────────────────────────────────
const grid = $("#achievements-grid");
const earnedSet = new Set(profile.achievements || []);
$("#achievements-count").textContent = `${earnedSet.size} of ${ACHIEVEMENTS.length} unlocked`;
grid.innerHTML = ACHIEVEMENTS.map((a) => {
  const earned = earnedSet.has(a.id);
  return `
    <div class="ach ${earned ? "ach--earned" : "ach--locked"}" data-id="${a.id}" title="${htmlEscape(a.desc)}">
      <span class="ach__icon" aria-hidden="true">${earned ? "★" : "·"}</span>
      <div class="ach__body">
        <div class="ach__name">${htmlEscape(a.name)}</div>
        <div class="ach__desc">${htmlEscape(a.desc)}</div>
        <div class="ach__group">${htmlEscape(a.group)}</div>
      </div>
    </div>
  `;
}).join("");

// ── Mode bests ──────────────────────────────────────────────────
const mb = $("#mode-bests");
const bests = profile.modeBests || {};
const keys = Object.keys(bests).sort();
if (!keys.length) {
  mb.classList.add("stats-empty");
  mb.innerHTML = "Personal bests appear here after you complete a session in any mode.";
} else {
  mb.innerHTML = keys.map((k) => {
    const b = bests[k];
    const [mode, key] = k.split(":");
    const label = formatModeKey(mode, key);
    return `
      <div class="mode-best">
        <div class="mode-best__label">${htmlEscape(label)}</div>
        <div class="mode-best__values">
          <span class="mode-best__wpm">${Math.round(b.wpm)}<small>wpm</small></span>
          <span class="mode-best__acc">${Math.round(b.acc)}<small>%</small></span>
        </div>
        <div class="mode-best__date">${new Date(b.at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</div>
      </div>
    `;
  }).join("");
}

function formatModeKey(mode, key) {
  if (mode === "time") return `Time · ${key}s`;
  if (mode === "words") return `Words · ${key}`;
  if (mode === "quote") return `Quote · ${key}`;
  if (mode === "zen") return "Zen";
  if (mode === "adaptive") return "Adaptive";
  if (mode === "lesson") return "Lesson";
  if (mode === "drill") return "Drill";
  if (mode === "custom") return "Custom text";
  return `${mode} · ${key}`;
}

// ── Recent sessions (D3 with sparklines) ─────────────────────────
const sl = $("#sessions-list");
const sessions = profile.sessions || [];

/* ── Share a past run ─────────────────────────────────────────────
   The same button the results card carries, on every row that the
   site can still build a valid link for: a button[data-share] with
   data-share-* attributes, opening the same sheet through the
   delegated listener share.js installed once in main.js. Nothing
   here knows what a link may contain -- share/session-link.js
   answers that, and answers null for a row with no link, which is
   the only reason a row has no button.

   Two passes, for the reason wireResultShare() takes two: the
   query-only link is written as the row is drawn, so a Share clicked
   in the first second still shares something correct, and the
   fragment (the text and the keystroke replay, which need a database
   read and a compressor) upgrades data-share-url a moment later.
   data-share-ready marks a button whose upgrade has been through. */
const SHARE_TIP = "Share this run. The numbers travel in the link; the text and replay, if kept, sit after the #.";
const SHARE_ICON = `<svg class="session-row__share-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>`;
const sessionsById = new Map();
for (const s of sessions) if (s && s.id) sessionsById.set(String(s.id), s);

/* The excerpt for the card the browser draws, one entry per button.

   share.js holds ONE local card at a time -- it was written for the
   results page, where there is one result on screen. A list has sixty
   rows, so the row that was wired last would otherwise own the slot
   and row 3's Download PNG would draw row 7's words. The slot is
   therefore filled at click time, from this map, by a listener in the
   CAPTURE phase: share.js's own listener is a bubbling one on the
   document, so capture always runs first.

   A WeakMap and not an attribute, for the reason result-link gives:
   everything in a button's dataset is one careless template away from
   an intent url. */
const localCards = new WeakMap();
document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest("button[data-share]");
  if (!btn) return;
  /* Cleared for every share, so a public row cannot download the
     previous private row's picture. */
  setLocalCard(localCards.get(btn) || null);
}, true);

function shareButtonFor(session) {
  const short = shortLinkForSession(session);
  /* No valid link, no button. That is a record with no numbers a
     card could be drawn from, or one the validator in lib/og refuses
     for any other reason -- not a judgement made here. */
  if (!short) return null;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--small session-row__share";
  btn.setAttribute("data-share", "");
  btn.setAttribute("data-share-kind", "result");
  btn.setAttribute("data-share-surface", "stats");
  btn.setAttribute("data-share-mode", short.mode || "");
  btn.setAttribute("data-share-title", short.title);
  btn.setAttribute("data-share-text", short.text);
  btn.setAttribute("data-share-short-url", short.shortUrl);
  btn.setAttribute("data-share-url", short.shortUrl);
  btn.setAttribute("data-share-image", short.imageUrl);
  btn.setAttribute("data-tip", SHARE_TIP);
  /* A real <button>, so Enter and Space work with no key handling of
     our own. The label is visible text AND the accessible name; the
     icon is decorative. */
  btn.setAttribute("aria-label", "Share");
  btn.innerHTML = `${SHARE_ICON}<span class="session-row__share-label">Share</span>`;
  return btn;
}

/* ── the write that may still be in the air ───────────────────────
   practice-boot awaits the replay write before it draws the results
   card, so by the time anybody can click "View stats" the record is
   normally already filed. Normally. That await has a ceiling, a user
   can open /stats/ in a second tab while the first one is still
   finishing, and an IndexedDB write on a cold profile is not always
   instant. In all three cases the symptom is the same and it is
   silent: the newest row builds its link from a store that does not
   have the run yet, so it shares numbers only, and looks permanent
   until the page is loaded again.

   What can be observed from here is cheap: the profile's newest
   session, and the newest record the store holds. If the session is
   newer than the record, a write is either in flight or was never
   going to happen, and the two are indistinguishable from here. So
   the wait is small and hard-capped, and it only starts when the
   newest session is FRESH -- a run from yesterday is not a write in
   flight, and a run with no keystrokes to file (Esc before typing a
   single character) never writes at all. Without the freshness test a
   browser with IndexedDB turned off would pay the full cap on every
   single load, forever. */
const REPLAY_SETTLE_MS = 1000;   // the cap the whole wait lives under
const REPLAY_POLL_MS = 60;       // how often to look while waiting
const RUN_IS_FRESH_MS = 20000;   // older than this is not a pending write

async function settleReplays() {
  if (!idbSupported()) return "no store";
  /* The latest run by its stamp, not by its position. recordSession
     unshifts, so index 0 is normally the newest -- but a record
     imported or repaired by hand is not obliged to be, and a
     freshness test that reads the wrong row either waits for nothing
     or skips a wait it needed. */
  let newest = null;
  for (const s of sessions || []) {
    if (!s || !s.id || !s.at) continue;
    if (!newest || String(s.at) > String(newest.at)) newest = s;
  }
  if (!newest) return "no sessions";
  /* Read before the freshness test, not after it. list() is also
     where engine/replay-store.js catches up with records written
     before its text cap existed, and a /stats/ visit is the one
     moment a profile that has finished no run since then passes
     through the store at all. */
  let rows = [];
  try { rows = await listReplays(); } catch { return "store unreadable"; }
  const age = Date.now() - Date.parse(newest.at);
  if (!(age >= 0 && age < RUN_IS_FRESH_MS)) return "newest run is not fresh";
  /* list() is newest first. String compare is right for the ISO
     stamps both sides write, and a record whose stamp is not older
     than the run is either this run's or newer than it; either way
     nothing is pending. */
  if (rows.length && String(rows[0].at) >= String(newest.at)) return "already landed";
  const until = Date.now() + REPLAY_SETTLE_MS;
  for (;;) {
    let rec = null;
    try { rec = await getReplay(newest.id); } catch { rec = null; }
    if (rec) return "waited for the write";
    if (Date.now() >= until) return "gave up waiting";
    await new Promise((go) => setTimeout(go, REPLAY_POLL_MS));
  }
}

/* Once per page load, however many times the rows are redrawn. The
   verdict is left on window in the same spirit as /r/'s
   window.__ttReplay: a wait nobody can see is a wait nobody can hold
   to its cap. */
let settling = null;
const replaysSettled = () => (settling || (settling = settleReplays()
  .catch(() => "failed")
  .then((why) => { try { window.__ttReplaySettle = why; } catch {} return why; })));

async function wireRowShare(root) {
  if (!root) return;
  const pending = [];
  root.querySelectorAll("[data-session-id]").forEach((row) => {
    const id = row.getAttribute("data-session-id");
    if (!id || row.querySelector("button[data-share]")) return;
    const session = sessionsById.get(id);
    if (!session) return;
    const btn = shareButtonFor(session);
    if (!btn) return;
    const host = row.querySelector(".session-row__head") || row.querySelector("[data-share-slot]") || row;
    host.appendChild(btn);
    pending.push([btn, session]);
  });
  if (!pending.length) return;
  /* Before any link is built: let a write that is still in the air
     land, or give up on it. Only the second pass waits -- every
     button already carries its query-only link from the first. */
  await replaysSettled();
  /* One row at a time. Sixty rows is sixty reads out of IndexedDB and
     sixty trips through the compressor; doing them in a queue keeps
     the page responsive while they land. */
  for (const [btn, session] of pending) {
    let link = null;
    try { link = await linkForSession(session); } catch (err) { console.warn("[stats] share link", err); }
    if (!document.contains(btn)) continue;
    if (link) {
      btn.setAttribute("data-share-url", link.fullUrl);
      btn.setAttribute("data-share-short-url", link.shortUrl);
      if (link.dropped && link.dropped.length) btn.setAttribute("data-share-dropped", link.dropped.join(","));
      /* A text of your own, with no public id: the one kind of result
         this site can never draw a picture of. data-share-image stays
         the pre-rendered grid card, which is what a crawler is given
         and must not show the words; Download PNG renders the real
         card from the same query instead. The predicate and the
         excerpt are the ones wireResultShare() uses on the results
         card -- same rule, same 600 characters, one definition.

         Only when the words are actually in hand: a run whose text
         this browser no longer has (deleted, or evicted with its
         replay) keeps the grid card, because there is nothing to draw
         with. */
      if (link.private && link.target) {
        localCards.set(btn, { text: excerptOf({ target: link.target }), stats: link.query });
        btn.setAttribute("data-share-private", "1");
      } else {
        localCards.delete(btn);
        btn.removeAttribute("data-share-private");
      }
    }
    btn.setAttribute("data-share-ready", "1");
  }
}

if (sessions.length) {
  sl.classList.remove("stats-empty");
  (async () => {
    const ok = await renderSessionsD3(sl, sessions, { onRows: (rows) => { wireRowShare(rows); } });
    if (!ok) {
      /* Legacy fallback if D3 fails to load. The same sixty rows the
         D3 list draws, and the same number the roadmap and the
         changelog tell people: a claim that is only true when a CDN
         answers is not a claim worth publishing. */
      sl.innerHTML = `
        <table class="sessions-table">
          <thead><tr><th>When</th><th>Mode</th><th class="r">wpm</th><th class="r">acc</th><th class="r">cons</th><th></th></tr></thead>
          <tbody>
          ${sessions.slice(0, 60).map((s) => `<tr data-session-id="${htmlEscape(s.id || "")}"><td>${new Date(s.at).toLocaleString()}</td><td>${htmlEscape(s.mode)} ${s.duration ? `· ${s.duration}s` : ""}</td><td class="r" style="color:var(--accent)">${Math.round(s.wpm)}</td><td class="r">${Math.round(s.acc)}%</td><td class="r">${Math.round(s.cons)}%</td><td class="r" data-share-slot></td></tr>`).join("")}
          </tbody></table>`;
      await wireRowShare(sl);
    }
  })();
}
