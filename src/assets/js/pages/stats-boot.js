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
import { renderKeyStrip } from "../stats/viz-key-strip.js";
import { ACHIEVEMENTS } from "../engine/achievements.js";
import { localDayIso } from "../util/format.js";
import { $, htmlEscape } from "../util/dom.js";

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
renderLessonTrends(document.getElementById("lesson-trends-svg"), profile.lessonResults || []);

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
if (sessions.length) {
  sl.classList.remove("stats-empty");
  (async () => {
    const ok = await renderSessionsD3(sl, sessions);
    if (!ok) {
      // Legacy fallback if D3 fails to load.
      sl.innerHTML = `
        <table class="sessions-table">
          <thead><tr><th>When</th><th>Mode</th><th class="r">wpm</th><th class="r">acc</th><th class="r">cons</th></tr></thead>
          <tbody>
          ${sessions.slice(0, 12).map((s) => `<tr><td>${new Date(s.at).toLocaleString()}</td><td>${htmlEscape(s.mode)} ${s.duration ? `· ${s.duration}s` : ""}</td><td class="r" style="color:var(--accent)">${Math.round(s.wpm)}</td><td class="r">${Math.round(s.acc)}%</td><td class="r">${Math.round(s.cons)}%</td></tr>`).join("")}
          </tbody></table>`;
    }
  })();
}
