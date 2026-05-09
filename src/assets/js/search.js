/* Site search — powers two surfaces:
   1. A modal palette (Cmd/Ctrl+K from anywhere) with up to 12 quick hits.
   2. The dedicated /search/ page with full-page card results, grouped
      by kind, no truncation. Activated when #search-page-input exists. */

const PAGES = [
  { title: "Practice surface", url: "/practice/", section: "Practice" },
  { title: "Today's quote", url: "/practice/?mode=quote&quote=daily", section: "Practice" },
  { title: "30-second test", url: "/practice/?mode=time&duration=30", section: "Practice" },
  { title: "60-second test", url: "/practice/?mode=time&duration=60", section: "Practice" },
  { title: "Words mode", url: "/practice/?mode=words&words=25", section: "Practice" },
  { title: "Quote mode", url: "/practice/?mode=quote", section: "Practice" },
  { title: "Zen mode", url: "/practice/?mode=zen", section: "Practice" },
  { title: "Adaptive mode", url: "/practice/?mode=adaptive", section: "Practice" },
  { title: "Custom text", url: "/custom/", section: "Practice" },
  { title: "Lessons", url: "/lessons/", section: "Learn" },
  { title: "Drills", url: "/drills/", section: "Learn" },
  { title: "User guide", url: "/guide/", section: "Learn" },
  { title: "FAQ", url: "/faq/", section: "Learn" },
  { title: "Quotes browser", url: "/quotes/", section: "Library" },
  { title: "Books library", url: "/library/", section: "Library" },
  { title: "Idioms", url: "/idioms/", section: "Library" },
  { title: "Poetry", url: "/poetry/", section: "Library" },
  { title: "Fables & parables", url: "/parables/", section: "Library" },
  { title: "Word lists", url: "/wordlists/", section: "Library" },
  { title: "English 1k", url: "/wordlists/en-1k/", section: "Library" },
  { title: "English 5k", url: "/wordlists/en-5k/", section: "Library" },
  { title: "English 10k", url: "/wordlists/en-10k/", section: "Library" },
  { title: "English advanced vocabulary", url: "/wordlists/en-advanced/", section: "Library" },
  { title: "My missed words", url: "/wordlists/missed/", section: "Library" },
  { title: "Code: JavaScript", url: "/wordlists/code-js/", section: "Library" },
  { title: "Code: Python", url: "/wordlists/code-py/", section: "Library" },
  { title: "Code: HTML", url: "/wordlists/code-html/", section: "Library" },
  { title: "Code: TypeScript", url: "/wordlists/code-ts/", section: "Library" },
  { title: "Code: Rust", url: "/wordlists/code-rust/", section: "Library" },
  { title: "Code: SQL", url: "/wordlists/code-sql/", section: "Library" },
  { title: "Code: Bash", url: "/wordlists/code-bash/", section: "Library" },
  { title: "Code: CSS", url: "/wordlists/code-css/", section: "Library" },
  { title: "Pangrams", url: "/wordlists/pangrams/", section: "Library" },
  { title: "Commonly misspelled", url: "/wordlists/misspellings/", section: "Library" },
  { title: "Latin phrases", url: "/wordlists/latin-phrases/", section: "Library" },
  { title: "Countries of the world", url: "/wordlists/countries/", section: "Library" },
  { title: "Capitals of the world", url: "/wordlists/capitals/", section: "Library" },
  { title: "Scrabble trainer", url: "/wordlists/scrabble/", section: "Library" },
  { title: "Punctuation drill", url: "/wordlists/punctuation/", section: "Library" },
  { title: "Numbers drill", url: "/wordlists/numbers/", section: "Library" },
  { title: "Numpad row drills", url: "/practice/?drill=numpad-rows", section: "Library" },
  { title: "Numpad mixed digits", url: "/practice/?drill=numpad-mixed", section: "Library" },
  { title: "Numpad decimals", url: "/practice/?drill=numpad-decimals", section: "Library" },
  { title: "Numpad phone numbers", url: "/practice/?drill=numpad-phone", section: "Library" },
  { title: "Numpad math operators", url: "/practice/?drill=numpad-math", section: "Library" },
  { title: "All challenges", url: "/challenges/", section: "Compete" },
  { title: "Sprint challenge", url: "/practice/?mode=time&duration=60&challenge=sprint", section: "Compete" },
  { title: "Marathon challenge", url: "/practice/?mode=time&duration=300&challenge=marathon", section: "Compete" },
  { title: "Pangram run", url: "/practice/?mode=quote&challenge=pangram", section: "Compete" },
  { title: "Mountain climb", url: "/practice/?mode=words&words=80&challenge=mountain-climb", section: "Compete" },
  { title: "Code mode", url: "/practice/?mode=words&words=40&challenge=code-mode", section: "Compete" },
  { title: "Stats dashboard", url: "/stats/", section: "Insights" },
  { title: "Achievements", url: "/stats/#achievements-grid", section: "Insights" },
  { title: "Per-finger errors", url: "/stats/#perfinger-svg", section: "Insights" },
  { title: "Character report", url: "/stats/#char-table-host", section: "Insights" },
  { title: "Lesson trends", url: "/stats/#lesson-trends-svg", section: "Insights" },
  { title: "Missed words ranking", url: "/stats/#missed-words-section", section: "Insights" },
  { title: "Daily activity", url: "/stats/#contribution", section: "Insights" },
  { title: "WPM trend", url: "/stats/#trend", section: "Insights" },
  { title: "Personal bests by mode", url: "/stats/#mode-bests", section: "Insights" },
  { title: "Settings", url: "/settings/", section: "Insights" },
  { title: "About", url: "/about/", section: "Project" },
  { title: "Features", url: "/features/", section: "Project" },
  { title: "Tech stack", url: "/tech-stack/", section: "Project" },
  { title: "Style guide", url: "/style-guide/", section: "Project" },
  { title: "Cost", url: "/cost/", section: "Project" },
  { title: "Analytics", url: "/analytics/", section: "Project" },
  { title: "Privacy", url: "/privacy/", section: "Project" },
  { title: "Terms", url: "/terms/", section: "Project" },
  { title: "License", url: "/license/", section: "Project" },
  { title: "Changelog", url: "/changelog/", section: "Project" },
  { title: "Sitemap", url: "/sitemap/", section: "Project" },
  { title: "Contact", url: "/contact/", section: "Project" },
];

let modal = null;
let input = null;
let resultsEl = null;
let allResults = [];
let activeIdx = 0;
let corpus = null;

function build() {
  if (modal) return modal;
  const el = document.createElement("dialog");
  el.id = "site-search";
  el.className = "site-search";
  el.setAttribute("aria-label", "Site search");
  el.innerHTML = `
    <div class="site-search__head">
      <span class="site-search__icon" aria-hidden="true">⌕</span>
      <input type="search" class="site-search__input" aria-label="Search the site" placeholder="Search pages, quotes, books, idioms, poetry…" autocomplete="off" autocapitalize="off" spellcheck="false">
      <kbd class="site-search__esc">Esc</kbd>
    </div>
    <div class="site-search__results" role="listbox" aria-label="Search results"></div>
    <div class="site-search__foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
      <span><kbd>Enter</kbd> open</span>
      <a class="site-search__see-all" href="/search/">See all results →</a>
    </div>
  `;
  document.body.appendChild(el);
  input = el.querySelector(".site-search__input");
  resultsEl = el.querySelector(".site-search__results");
  const seeAll = el.querySelector(".site-search__see-all");
  input.addEventListener("input", () => render());
  input.addEventListener("keydown", onInputKey);
  el.addEventListener("click", (e) => { if (e.target === el) el.close(); });
  el.addEventListener("close", () => { input.value = ""; });
  seeAll.addEventListener("click", (e) => {
    const q = (input.value || "").trim();
    if (q) { e.preventDefault(); window.location.href = `/search/?q=${encodeURIComponent(q)}`; }
  });
  modal = el;
  return el;
}

async function loadCorpus() {
  if (corpus) return corpus;
  try {
    const [quotes, library, idioms, parables, poetry] = await Promise.all([
      fetch("/data/quotes.json").then((r) => r.json()).catch(() => []),
      fetch("/data/library.json").then((r) => r.json()).catch(() => []),
      fetch("/data/idioms.json").then((r) => r.json()).catch(() => []),
      fetch("/data/parables.json").then((r) => r.json()).catch(() => []),
      fetch("/data/poetry.json").then((r) => r.json()).catch(() => []),
    ]);
    corpus = { quotes, library, idioms, parables, poetry };
  } catch { corpus = { quotes: [], library: [], idioms: [], parables: [], poetry: [] }; }
  return corpus;
}

function score(needle, hay) {
  if (!needle) return 1;
  const h = String(hay || "").toLowerCase();
  const n = needle.toLowerCase();
  if (h.includes(n)) {
    if (h.startsWith(n)) return 100;
    return 50 + Math.max(0, 30 - h.indexOf(n));
  }
  let i = 0;
  for (const c of h) { if (c === n[i]) i++; if (i === n.length) return 10; }
  return 0;
}

function search(q) {
  const out = [];
  for (const p of PAGES) {
    const s = score(q, p.title) + 0.5 * score(q, p.section);
    if (s > 0) out.push({ kind: "Page", title: p.title, sub: p.section, body: "", url: p.url, score: s });
  }
  if (corpus) {
    for (const it of corpus.quotes) {
      const s = score(q, it.text) + score(q, it.author || "");
      if (s > 0) out.push({ kind: "Quote", title: it.author || "Quote", sub: "", body: it.text, url: `/practice/?mode=quote&qid=${encodeURIComponent(it.id)}`, score: s * 0.7 });
    }
    for (const it of corpus.library) {
      const s = score(q, it.title) + score(q, it.author || "");
      if (s > 0) out.push({ kind: "Book", title: it.title, sub: it.author + (it.year ? " · " + it.year : ""), body: it.summary || "", url: "/library/", score: s });
    }
    for (const it of corpus.idioms) {
      const s = score(q, it.text) + score(q, it.meaning || "");
      if (s > 0) out.push({ kind: "Idiom", title: it.text, sub: "", body: it.meaning || "", url: "/idioms/", score: s });
    }
    for (const it of corpus.parables) {
      const s = score(q, it.title) + score(q, it.text);
      if (s > 0) out.push({ kind: "Fable", title: it.title, sub: it.source || "Aesop", body: shortText(it.text, 220), url: "/parables/", score: s });
    }
    for (const it of corpus.poetry) {
      const s = score(q, it.title) + score(q, it.author || "") + 0.3 * score(q, it.text);
      if (s > 0) out.push({ kind: "Poem", title: it.title, sub: it.author + (it.year ? " · " + it.year : ""), body: shortText(it.text, 220), url: "/poetry/", score: s });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function shortText(t, n = 80) {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function render() {
  const q = input.value.trim();
  const allHits = q ? search(q) : PAGES.slice(0, 12).map((p) => ({ kind: "Page", title: p.title, sub: p.section, body: "", url: p.url, score: 1 }));
  allResults = allHits.slice(0, 12);
  activeIdx = 0;
  if (!allResults.length) {
    resultsEl.innerHTML = `<p class="site-search__empty">No matches.</p>`;
    return;
  }
  resultsEl.innerHTML = allResults.map((r, i) => `
    <a class="site-search__row${i === 0 ? " is-active" : ""}" href="${r.url}" data-idx="${i}" role="option">
      <span class="site-search__kind">${escapeHtml(r.kind)}</span>
      <span class="site-search__body">
        <span class="site-search__title">${escapeHtml(r.title)}</span>
        ${r.sub ? `<span class="site-search__sub">${escapeHtml(r.sub)}</span>` : ""}
        ${r.body ? `<span class="site-search__excerpt">${escapeHtml(r.body)}</span>` : ""}
      </span>
    </a>
  `).join("");
  resultsEl.querySelectorAll(".site-search__row").forEach((row, i) => {
    row.addEventListener("mouseenter", () => setActive(i));
  });
}

function setActive(i) {
  if (i < 0 || i >= allResults.length) return;
  activeIdx = i;
  resultsEl.querySelectorAll(".site-search__row").forEach((r, idx) => r.classList.toggle("is-active", idx === i));
  const active = resultsEl.querySelector(".site-search__row.is-active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function onInputKey(e) {
  if (e.key === "ArrowDown") { e.preventDefault(); setActive((activeIdx + 1) % allResults.length); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((activeIdx - 1 + allResults.length) % allResults.length); }
  else if (e.key === "Enter") {
    e.preventDefault();
    if (e.shiftKey) {
      const q = (input.value || "").trim();
      if (q) { window.location.href = `/search/?q=${encodeURIComponent(q)}`; return; }
    }
    const r = allResults[activeIdx];
    if (r) window.location.href = r.url;
  } else if (e.key === "Escape") {
    e.preventDefault();
    modal && modal.close();
  }
}

function escapeHtml(s){return String(s == null ? "" : s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}

window.openSearch = async function () {
  const el = build();
  if (!el.open) el.showModal();
  loadCorpus().then(() => render());
  render();
  setTimeout(() => input.focus(), 30);
};

/* ────────────────────────────────────────────────────────────────────
   Dedicated /search/ page — full-page interface with grouped cards.
   ─────────────────────────────────────────────────────────────────── */

const pageInput = document.getElementById("search-page-input");
const pageOut = document.getElementById("search-page-results");
const pageSummary = document.getElementById("search-page-summary");

if (pageInput && pageOut) {
  const KINDS = ["Page", "Quote", "Book", "Poem", "Fable", "Idiom"];
  const params = new URLSearchParams(location.search);
  const initial = params.get("q") || "";
  pageInput.value = initial;

  const renderPage = () => {
    const q = pageInput.value.trim();
    const hits = q ? search(q) : PAGES.map((p) => ({ kind: "Page", title: p.title, sub: p.section, body: "", url: p.url, score: 1 }));
    if (pageSummary) {
      pageSummary.textContent = q
        ? `${hits.length} match${hits.length === 1 ? "" : "es"} for "${q}"`
        : `Showing all ${hits.length} pages. Type to filter across pages, quotes, books, idioms, poetry, and fables.`;
    }
    if (!hits.length) {
      pageOut.innerHTML = `<p class="search-page__empty">No matches found. Try a different word, or browse from the <a href="/sitemap/">sitemap</a>.</p>`;
      return;
    }
    const grouped = {};
    KINDS.forEach((k) => { grouped[k] = []; });
    hits.forEach((h) => { (grouped[h.kind] || (grouped[h.kind] = [])).push(h); });

    pageOut.innerHTML = KINDS.filter((k) => grouped[k] && grouped[k].length).map((k) => `
      <section class="search-group">
        <h2 class="search-group__title">${escapeHtml(k)}s <span class="search-group__count">${grouped[k].length}</span></h2>
        <div class="search-group__list">
          ${grouped[k].map((r) => `
            <a class="search-result" href="${r.url}">
              <span class="search-result__kind">${escapeHtml(r.kind)}</span>
              <span class="search-result__title">${escapeHtml(r.title)}</span>
              ${r.sub ? `<span class="search-result__sub">${escapeHtml(r.sub)}</span>` : ""}
              ${r.body ? `<p class="search-result__excerpt">${escapeHtml(r.body)}</p>` : ""}
              <span class="search-result__cta">Open →</span>
            </a>
          `).join("")}
        </div>
      </section>
    `).join("");
  };

  pageInput.addEventListener("input", () => {
    renderPage();
    const q = pageInput.value.trim();
    const url = q ? `?q=${encodeURIComponent(q)}` : location.pathname;
    history.replaceState(null, "", url);
  });
  pageInput.focus();

  loadCorpus().then(() => renderPage());
  renderPage();
}
