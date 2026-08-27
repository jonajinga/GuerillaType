/* Megamenu interactions + dynamic featured-slot population.

   Hover-open with grace, click-toggle on tap, Esc closes, click-outside
   closes. Each panel can have a [data-featured] aside that we fill at
   load time with profile-aware content. */

import { getActive } from "./profiles.js";

const HOVER_DELAY = 100;
const CLOSE_DELAY = 220;

/* ── Featured-slot population ───────────────────────────────────── */
(function populateFeatured() {
  let p;
  try { p = getActive(); } catch { return; }
  populateInsights(p);
  populateLearn(p);
  populateCompete(p);
  populateContribute(p);
  preparePracticeQuote();
})();

function $body(kind) {
  return document.querySelector(`[data-featured="${kind}"] [data-featured-body]`);
}

function populateInsights(p) {
  const body = $body("stats");
  if (!body) return;
  const lt = (p && p.lifetime) || {};
  if (!lt.sessions) {
    body.innerHTML = `<p class="muted" style="margin:0;font-size:var(--fs-200)">No sessions yet — your stats will fill in here once you start typing.</p>`;
    return;
  }
  const recent = (p.sessions || []).slice(0, 7).reverse();
  // Derived fields. Lifetime tracks raw totals; we surface a few more
  // human-readable rollups so the megamenu card actually fills its space.
  const sessions = lt.sessions || 0;
  const chars = lt.chars || 0;
  const correct = lt.correctChars || 0;
  const totalMs = lt.totalMs || 0;
  const lifetimeAcc = chars ? (correct / chars) * 100 : 0;
  // Lifetime average wpm from total correct chars over total time.
  // Fallback to recent sessions if totals are missing.
  const avgWpm = totalMs > 0
    ? Math.round((correct / 5) / (totalMs / 60000))
    : (recent.length ? Math.round(recent.reduce((a, s) => a + (s.wpm || 0), 0) / recent.length) : 0);
  const todayKey = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();
  const dayBucket = (p && p.daily && p.daily[todayKey]) || null;
  const todaySessions = dayBucket ? (dayBucket.sessions || 0) : 0;
  const todayMin = dayBucket ? Math.round((dayBucket.timeMs || 0) / 60000) : 0;
  const totalMin = Math.round(totalMs / 60000);
  const totalTimeLabel = totalMin >= 60
    ? `${(totalMin / 60).toFixed(totalMin >= 600 ? 0 : 1)}<small>h</small>`
    : `${totalMin}<small>m</small>`;
  const charsLabel = chars >= 1e6
    ? `${(chars / 1e6).toFixed(1)}<small>M</small>`
    : chars >= 1e3
      ? `${(chars / 1e3).toFixed(chars >= 1e4 ? 0 : 1)}<small>k</small>`
      : `${chars}`;
  body.innerHTML = `
    <div class="mega-featured-stats">
      <div class="mega-featured-stats__cell">
        <span class="mega-featured-stats__value">${Math.round(lt.bestWpm || 0)}</span>
        <span class="mega-featured-stats__label">best wpm</span>
      </div>
      <div class="mega-featured-stats__cell">
        <span class="mega-featured-stats__value">${Math.round(lt.bestAccuracy || 0)}<small>%</small></span>
        <span class="mega-featured-stats__label">best acc</span>
      </div>
      <div class="mega-featured-stats__cell">
        <span class="mega-featured-stats__value">${avgWpm}</span>
        <span class="mega-featured-stats__label">avg wpm</span>
      </div>
      <div class="mega-featured-stats__cell">
        <span class="mega-featured-stats__value">${Math.round(lifetimeAcc)}<small>%</small></span>
        <span class="mega-featured-stats__label">avg acc</span>
      </div>
      <div class="mega-featured-stats__cell">
        <span class="mega-featured-stats__value">${sessions}</span>
        <span class="mega-featured-stats__label">sessions</span>
      </div>
      <div class="mega-featured-stats__cell">
        <span class="mega-featured-stats__value">${lt.streakDays || 0}<small>d</small></span>
        <span class="mega-featured-stats__label">streak</span>
      </div>
      <div class="mega-featured-stats__cell">
        <span class="mega-featured-stats__value">${charsLabel}</span>
        <span class="mega-featured-stats__label">chars typed</span>
      </div>
      <div class="mega-featured-stats__cell">
        <span class="mega-featured-stats__value">${totalTimeLabel}</span>
        <span class="mega-featured-stats__label">time typed</span>
      </div>
      <div class="mega-featured-stats__cell">
        <span class="mega-featured-stats__value">${todaySessions}</span>
        <span class="mega-featured-stats__label">today's sessions</span>
      </div>
      <div class="mega-featured-stats__cell">
        <span class="mega-featured-stats__value">${todayMin}<small>m</small></span>
        <span class="mega-featured-stats__label">today's time</span>
      </div>
    </div>
    ${renderSparkline(recent)}
  `;
}

async function populateLearn(p) {
  const body = $body("next-lesson");
  if (!body) return;
  let nextId = 1;
  // Load the live lesson list — count + titles stay in sync as the
  // curriculum grows.
  let lessons = [];
  try {
    const res = await fetch("/data/lessons.json", { cache: "default" });
    if (res.ok) lessons = await res.json();
  } catch {}
  if (!lessons.length) {
    body.innerHTML = `<p class="muted" style="margin:0;font-size:var(--fs-200)">Could not load lessons.</p>`;
    return;
  }
  const total = lessons.length;
  try {
    for (const l of lessons) {
      if (!localStorage.getItem(`tt:lesson-best-${l.id}`)) { nextId = l.id; break; }
      nextId = l.id + 1;
    }
  } catch {}
  if (nextId > lessons[lessons.length - 1].id) {
    body.innerHTML = `<p class="muted" style="margin:0;font-size:var(--fs-200)">Curriculum complete. ✓</p>`;
    return;
  }
  const cur = lessons.find((l) => l.id === nextId) || lessons[0];
  body.innerHTML = `
    <div class="mega-featured-lesson">
      <span class="mega-featured-lesson__num">Next · Lesson ${cur.id} of ${total}</span>
      <span class="mega-featured-lesson__title">${escapeHtml(cur.title || "")}</span>
      <p style="color:var(--fg-2);font-size:var(--fs-200);line-height:1.4;margin:.4rem 0 0">Clear at 90% accuracy and 18 wpm to unlock the next.</p>
    </div>
  `;
  const cta = body.parentElement.querySelector(".mega__featured-cta");
  if (cta) cta.href = `/practice/?lesson=${cur.id}`;
}

async function populateCompete(p) {
  const body = $body("challenge-best");
  if (!body) return;
  const bests = (p && p.challengeBests) || {};
  // Live challenge list — name map + total derived from /data/.
  let challenges = [];
  try {
    const res = await fetch("/data/challenges.json", { cache: "default" });
    if (res.ok) challenges = await res.json();
  } catch {}
  const total = challenges.length || 0;
  const nameById = Object.fromEntries(challenges.map((c) => [c.id, c.name]));
  // Show every challenge in the featured strip (the panel scrolls
   // if the list exceeds the available space).
  const order = challenges.map((c) => c.id);
  const rows = order.map((id) => {
    const b = bests[id];
    return `
      <div class="mega-featured-challenge__row">
        <span class="mega-featured-challenge__name">${escapeHtml(nameById[id] || id)}</span>
        <span class="mega-featured-challenge__best">${b ? Math.round(b.wpm) + " wpm" : "—"}</span>
      </div>`;
  }).join("");
  const beaten = Object.keys(bests).filter((id) => nameById[id]).length;
  body.innerHTML = `
    <p style="color:var(--fg-2);font-size:var(--fs-200);margin:0">${beaten} of ${total} challenges cleared.</p>
    <div class="mega-featured-challenge">${rows}</div>
  `;
}

function populateContribute(p) {
  const body = $body("contribute");
  if (!body) return;
  const sessions = (p && p.lifetime && p.lifetime.sessions) || 0;
  // Personal thank-you note from the maker, paired with a small photo
  // and a link to jonajinga.com so visitors know who they're talking
  // to. Featured panel body scrolls if needed.
  body.innerHTML = `
    <div class="mega-featured-note">
      <div class="mega-featured-note__head">
        <a href="https://jonajinga.com" target="_blank" rel="noopener" class="mega-featured-note__photo" aria-label="Jon Ajinga's site">
          <picture>
            <source type="image/avif" srcset="/assets/img/_gen/jon-ajinga-120.avif 1x, /assets/img/_gen/jon-ajinga-240.avif 2x, /assets/img/_gen/jon-ajinga-360.avif 3x">
            <source type="image/webp" srcset="/assets/img/_gen/jon-ajinga-120.webp 1x, /assets/img/_gen/jon-ajinga-240.webp 2x, /assets/img/_gen/jon-ajinga-360.webp 3x">
            <img src="/assets/img/_gen/jon-ajinga-120.jpeg"
                 srcset="/assets/img/_gen/jon-ajinga-120.jpeg 1x, /assets/img/_gen/jon-ajinga-240.jpeg 2x, /assets/img/_gen/jon-ajinga-360.jpeg 3x"
                 alt="Jon Ajinga" width="120" height="120" loading="lazy" decoding="async"></picture>
        </a>
        <p class="mega-featured-note__greeting">A note from <a href="https://jonajinga.com" target="_blank" rel="noopener">Jon</a></p>
      </div>
      <p class="mega-featured-note__body">GuerillaType exists because you use it. Free, no accounts, no cookies -- it stays that way only as long as people care enough to send a quote, leave a review, or just say hi.</p>
      <p class="mega-featured-note__body">If the site has helped you type even a little better, the Contribute hub is the easiest way to give back. Thank you for being here.${sessions >= 10 ? ` <strong>${sessions} sessions</strong> in -- you're not a tourist anymore.` : ""}</p>
      <p class="mega-featured-note__sig">-- Jon</p>
    </div>
  `;
}

function preparePracticeQuote() {
  const body = $body("today-quote");
  if (!body) return;
  body.dataset.pending = "true";
  body.innerHTML = `<p class="muted" style="margin:0;font-size:var(--fs-200)">Loading today's quote…</p>`;
}

let _todayQuoteLoaded = false;
async function ensureTodayQuote() {
  if (_todayQuoteLoaded) return;
  _todayQuoteLoaded = true;
  const body = $body("today-quote");
  if (!body) return;
  try {
    const { loadQuotes, dailyQuote } = await import("./engine/quotes.js");
    const all = await loadQuotes();
    const q = dailyQuote(all);
    if (!q) return;
    body.innerHTML = `
      <p class="mega-featured-quote">“${escapeHtml(q.text.slice(0, 240))}${q.text.length > 240 ? "…" : ""}”</p>
      <p class="mega-featured-quote-cite">${escapeHtml(q.author || "")}</p>
    `;
  } catch (err) {
    body.innerHTML = `<p class="muted" style="margin:0">Couldn't load today's quote.</p>`;
  }
}

let _todayIdiomLoaded = false;
async function ensureTodayIdiom() {
  if (_todayIdiomLoaded) return;
  _todayIdiomLoaded = true;
  const body = $body("today-idiom");
  if (!body) return;
  try {
    const res = await fetch("/data/idioms.json", { cache: "default" });
    const all = await res.json();
    if (!Array.isArray(all) || !all.length) {
      body.innerHTML = `<p class="muted" style="margin:0">No idioms loaded.</p>`;
      return;
    }
    // Date-stable selection so every visitor sees the same idiom today.
    const day = Math.floor(Date.now() / 86400000);
    const it = all[day % all.length];
    body.innerHTML = `
      <p class="mega-featured-quote">${escapeHtml(it.text || "")}</p>
      ${it.meaning ? `<p class="mega-featured-quote-cite">${escapeHtml(it.meaning)}</p>` : ""}
    `;
  } catch (err) {
    body.innerHTML = `<p class="muted" style="margin:0">Couldn't load today's idiom.</p>`;
  }
}

function renderSparkline(sessions) {
  if (!sessions || sessions.length < 2) return "";
  const w = 200, h = 36, pad = 1;
  const wpms = sessions.map((s) => s.wpm);
  const min = Math.min(...wpms), max = Math.max(...wpms);
  const span = max - min || 1;
  const x = (i) => pad + (i / Math.max(1, sessions.length - 1)) * (w - pad * 2);
  const y = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
  let path = "";
  sessions.forEach((s, i) => { path += (i === 0 ? "M" : "L") + x(i) + "," + y(s.wpm); });
  return `<svg viewBox="0 0 ${w} ${h}" class="mega-featured-spark" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
}

function escapeHtml(s){return String(s == null ? "" : s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}

/* ── Open / close interactions ──────────────────────────────────── */

const items = Array.from(document.querySelectorAll(".site-nav__item[data-mega]"));
let openItem = null;
let closeTimer = null;

/* ── Scroll cues ─────────────────────────────────────────────────
   The panel is capped to the viewport height and scrolls when a menu
   is taller than the room available -- on a 1440x768 laptop that is
   every menu. A scrollbar alone is easy to miss on a panel that looks
   deliberately sized, so fade the top and bottom edges to show there
   is more, and only when there actually is: these attributes drive the
   ::before / ::after cues in nav.css and are the difference between an
   affordance and decoration. */
function syncScrollCues(panel) {
  if (!panel) return;
  const max = panel.scrollHeight - panel.clientHeight;
  panel.dataset.overflowing = max > 1 ? "true" : "false";
  panel.dataset.atTop = panel.scrollTop <= 1 ? "true" : "false";
  panel.dataset.atEnd = panel.scrollTop >= max - 1 ? "true" : "false";
}

const cuesBound = new WeakSet();
function bindScrollCues(panel) {
  if (!panel || cuesBound.has(panel)) return;
  cuesBound.add(panel);
  panel.addEventListener("scroll", () => syncScrollCues(panel), { passive: true });
}

window.addEventListener("resize", () => {
  if (!openItem) return;
  syncScrollCues(openItem.querySelector(".mega"));
}, { passive: true });

function openMega(item) {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (openItem && openItem !== item) closeMega(openItem, true);
  item.dataset.open = "true";
  const panel = item.querySelector(".mega");
  if (panel) {
    bindScrollCues(panel);
    // Reopening a menu should start at the top, not wherever it was
    // left. "instant" because nav.css turns on smooth scrolling and a
    // menu animating its own scroll position as it appears reads as a
    // glitch.
    try { panel.scrollTo({ top: 0, behavior: "instant" }); }
    catch { panel.scrollTop = 0; }
    // After the open animation has laid the panel out.
    requestAnimationFrame(() => syncScrollCues(panel));
  }
  const trigger = item.querySelector("[data-mega-trigger]");
  if (trigger) trigger.setAttribute("aria-expanded", "true");
  openItem = item;
  if (item.dataset.mega === "practice") ensureTodayQuote();
  if (item.dataset.mega === "library") ensureTodayIdiom();
}
function closeMega(item, immediate = false) {
  if (!item) return;
  const doClose = () => {
    item.dataset.open = "false";
    const trigger = item.querySelector("[data-mega-trigger]");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (openItem === item) openItem = null;
  };
  if (immediate) doClose();
  else { closeTimer = setTimeout(doClose, CLOSE_DELAY); }
}
function closeAll() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  items.forEach((it) => {
    it.dataset.open = "false";
    const t = it.querySelector("[data-mega-trigger]");
    if (t) t.setAttribute("aria-expanded", "false");
  });
  openItem = null;
}

items.forEach((item) => {
  const trigger = item.querySelector("[data-mega-trigger]");
  if (!trigger) return;
  let hoverTimer = null;
  item.addEventListener("mouseenter", () => {
    if (window.matchMedia("(hover: none)").matches) return;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    hoverTimer = setTimeout(() => openMega(item), HOVER_DELAY);
  });
  item.addEventListener("mouseleave", () => {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    closeMega(item);
  });
  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    if (item.dataset.open === "true") closeMega(item, true);
    else openMega(item);
  });
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMega(item);
      const first = item.querySelector(".mega__item");
      if (first) first.focus();
    }
    if (e.key === "Escape") closeMega(item, true);
  });
  item.addEventListener("focusout", (e) => {
    if (!e.relatedTarget) return;
    if (item.contains(e.relatedTarget)) return;
    if (e.relatedTarget.id === "tt-input") return;
    closeMega(item);
  });
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
document.addEventListener("click", (e) => {
  if (!openItem) return;
  if (!openItem.contains(e.target)) closeAll();
});
