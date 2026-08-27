/* Generic corpus browser — used by /idioms/, /parables/, /poetry/.
   Renders an expandable-table view: each entry is a compact row
   (Title | Author | Length | Action), click the row to expand and
   reveal the full text + Type/Save buttons. Search + Random retain
   their behavior. */

import { $, htmlEscape, toast } from "../util/dom.js";
import { confirmModal } from "../util/modal.js";
import { saveText } from "../engine/custom-text.js";
import { getActive, updateActive } from "../profiles.js";

function getCorpusProgress(kind) {
  const p = getActive();
  return ((p.corpusProgress || {})[kind]) || {};
}
function isItemDone(kind, id) {
  return !!getCorpusProgress(kind)[id];
}
function resetItem(kind, id) {
  updateActive((p) => {
    if (p.corpusProgress && p.corpusProgress[kind] && p.corpusProgress[kind][id]) {
      delete p.corpusProgress[kind][id];
    }
    return p;
  });
}
function resetAll(kind) {
  updateActive((p) => {
    if (p.corpusProgress && p.corpusProgress[kind]) {
      p.corpusProgress[kind] = {};
    }
    return p;
  });
}

const root = document.querySelector("[data-corpus-url]");
if (root) {
  const url = root.dataset.corpusUrl;
  const list = $("#corpus-list", root);
  const search = $("#corpus-search", root);
  const randomBtn = document.getElementById("corpus-random");
  // The table mode is opt-out: pages that want the legacy card grid
  // can set data-corpus-view="cards" on the corpus root.
  const view = root.dataset.corpusView || "table";
  // Item kind drives the column labels. Inferred from the URL when
  // not explicitly set.
  const kind = root.dataset.corpusKind || (
    /idiom/i.test(url) ? "idiom" : /parable/i.test(url) ? "parable" :
    /poetry/i.test(url) ? "poem" : /quote/i.test(url) ? "quote" : "item"
  );
  let items = [];
  let q = "";
  const expanded = new Set();

  if (search) search.addEventListener("input", () => { q = search.value.trim().toLowerCase(); render(); });
  if (randomBtn) randomBtn.addEventListener("click", () => {
    const filtered = items.filter(matches);
    if (!filtered.length) return;
    const it = filtered[Math.floor(Math.random() * filtered.length)];
    typeItem(it);
  });

  // Bust cache aggressively so newly added items / fields (e.g. a
   // freshly added `moral` on a parable) reach the browser without
   // a hard refresh. Corpus JSON files are small enough that fresh
   // fetches per page load are cheap.
  fetch(url + "?t=" + Date.now(), { cache: "no-store" }).then((r) => r.json()).then((data) => {
    items = data;
    render();
  }).catch(() => {
    list.innerHTML = `<p class="muted">Couldn't load — try reloading.</p>`;
  });

  function matches(it) {
    if (!q) return true;
    const hay = JSON.stringify(it).toLowerCase();
    return hay.includes(q);
  }

  /* ── Title resolution ─────────────────────────────────────────
     Idioms have no `title` field — they are themselves a phrase, so
     use `text` as the row label. Parables/poems/quotes have titles. */
  function rowTitle(it) {
    if (it.title) return it.title;
    if (kind === "idiom" && it.text) return it.text;
    return (it.text || "").slice(0, 60) + ((it.text || "").length > 60 ? "…" : "");
  }

  function render() {
    const filtered = items.filter(matches);
    if (!filtered.length) {
      list.innerHTML = `<p class="muted" style="padding:var(--space-5);text-align:center">No matches.</p>`;
      return;
    }
    if (view === "cards") return renderCards(filtered);
    return renderTable(filtered);
  }

  /* "Book page" view -- full text rendered in flowing serif columns
     like a printed page. Each entry is a passage; type/save buttons
     sit at the end of the passage in a small unobtrusive row. */
  function renderBook(rows) {
    const progress = getCorpusProgress(kind);
    const doneCount = rows.filter((it, ix) => !!progress[it.id || `r${ix}`]).length;
    const totalDone = Object.keys(progress).length;
    list.innerHTML = `
      <div class="corpus-book__summary">
        <p class="muted corpus-book__count">${rows.length} ${kind}${rows.length === 1 ? "" : "s"}${q ? ` matching "${htmlEscape(q)}"` : ""}${doneCount ? ` &middot; <strong>${doneCount} completed</strong>` : ""}</p>
        ${totalDone ? `<button type="button" class="btn btn--small btn--ghost" data-action="reset-all" data-tip="Clear completion records for every ${kind}">Reset all (${totalDone})</button>` : ""}
      </div>
      <div class="corpus-book">
        ${rows.map((it, ix) => bookEntryMarkup(it, ix)).join("")}
      </div>
    `;
    list.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); onAction(btn); });
    });
  }

  function bookEntryMarkup(it, ix) {
    const id = it.id || `r${ix}`;
    const done = isItemDone(kind, id);
    const cite = [it.author, it.year, it.source].filter(Boolean).map(htmlEscape).join(" &middot; ");

    if (kind === "idiom") {
      // Glossary-style: phrase in bold + meaning below + optional
      // origin and example. Inline, dense, scannable.
      return `
        <article class="corpus-book__entry corpus-book__entry--idiom${done ? " is-done" : ""}" data-id="${htmlEscape(id)}">
          ${done ? `<span class="corpus-book__check" aria-label="Completed" data-tip="You typed this">✓</span>` : ""}
          <h3 class="corpus-book__phrase">${htmlEscape(it.text || "")}</h3>
          ${it.meaning ? `<p class="corpus-book__meaning">${htmlEscape(it.meaning)}</p>` : ""}
          ${it.origin ? `<p class="corpus-book__origin"><em>Origin.</em> ${htmlEscape(it.origin)}</p>` : ""}
          ${it.example ? `<p class="corpus-book__example"><em>Example.</em> ${htmlEscape(it.example)}</p>` : ""}
          <div class="corpus-book__actions">
            <button type="button" class="btn btn--small btn--primary" data-action="type" data-id="${htmlEscape(id)}">${done ? "Type again" : "Type"}</button>
            <button type="button" class="btn btn--small" data-action="save" data-id="${htmlEscape(id)}">Save</button>
            ${done ? `<button type="button" class="btn btn--small btn--ghost" data-action="reset" data-id="${htmlEscape(id)}" data-tip="Clear completion record">Reset</button>` : ""}
          </div>
        </article>`;
    }

    if (kind === "quote") {
      // Pull-quote style: drop quotation, attribution beneath in
      // small caps. Centered to feel like a printed page.
      return `
        <article class="corpus-book__entry corpus-book__entry--quote${done ? " is-done" : ""}" data-id="${htmlEscape(id)}">
          ${done ? `<span class="corpus-book__check" aria-label="Completed" data-tip="You typed this">✓</span>` : ""}
          <blockquote class="corpus-book__quote">${htmlEscape(it.text || "")}</blockquote>
          ${cite ? `<p class="corpus-book__cite">-- ${cite}</p>` : ""}
          <div class="corpus-book__actions">
            <button type="button" class="btn btn--small btn--primary" data-action="type" data-id="${htmlEscape(id)}">${done ? "Type again" : "Type this quote"}</button>
            <button type="button" class="btn btn--small" data-action="save" data-id="${htmlEscape(id)}">Save</button>
            ${done ? `<button type="button" class="btn btn--small btn--ghost" data-action="reset" data-id="${htmlEscape(id)}" data-tip="Clear completion record">Reset</button>` : ""}
          </div>
        </article>`;
    }

    // Parable / poem / generic -- title + flowing body + tags + attribution.
    const title = rowTitle(it);
    return `
      <article class="corpus-book__entry corpus-book__entry--${kind}${done ? " is-done" : ""}" data-id="${htmlEscape(id)}">
        ${done ? `<span class="corpus-book__check" aria-label="Completed" data-tip="You typed this">✓</span>` : ""}
        ${title ? `<h3 class="corpus-book__title">${htmlEscape(title)}</h3>` : ""}
        ${cite ? `<p class="corpus-book__cite">${cite}</p>` : ""}
        <div class="corpus-book__body">${htmlEscape(it.text || "").replace(/\n\n+/g, "</p><p>").replace(/^/, "<p>") + "</p>"}</div>
        ${it.meaning ? `<p class="corpus-book__moral"><em>Moral.</em> ${htmlEscape(it.meaning)}</p>` : ""}
        <div class="corpus-book__actions">
          <button type="button" class="btn btn--small btn--primary" data-action="type" data-id="${htmlEscape(id)}">${done ? "Type again" : "Type this"}</button>
          <button type="button" class="btn btn--small" data-action="save" data-id="${htmlEscape(id)}">Save</button>
          ${done ? `<button type="button" class="btn btn--small btn--ghost" data-action="reset" data-id="${htmlEscape(id)}" data-tip="Clear completion record">Reset</button>` : ""}
        </div>
      </article>`;
  }

  function renderTable(rows) {
    const labelCol2 = kind === "idiom" ? "Meaning" : "Author";
    const progress = getCorpusProgress(kind);
    const doneCount = rows.filter((it, ix) => !!progress[it.id || `r${ix}`]).length;
    const totalDone = Object.keys(progress).length;
    list.innerHTML = `
      <div class="corpus-table__summary">
        <p class="muted corpus-table__count">${rows.length} ${kind}${rows.length === 1 ? "" : "s"}${q ? ` matching "${htmlEscape(q)}"` : ""}${doneCount ? ` · <strong>${doneCount} completed</strong>` : ""}</p>
        ${totalDone ? `<button type="button" class="btn btn--small btn--ghost" data-action="reset-all" data-tip="Clear completion records for every ${kind}">Reset all (${totalDone})</button>` : ""}
      </div>
      <div class="corpus-table__wrap">
        <table class="corpus-table">
          <thead>
            <tr>
              <th class="corpus-table__chevcol" aria-label="Expand"></th>
              <th>${kind === "idiom" ? "Idiom" : "Title"}</th>
              <th>${labelCol2}</th>
              <th class="num">Length</th>
              <th class="corpus-table__actcol">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((it, ix) => rowMarkup(it, ix)).join("")}
          </tbody>
        </table>
      </div>
    `;
    list.querySelectorAll(".corpus-table__row").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        // Don't toggle when clicking inside an action button.
        if (e.target.closest("[data-action]") || e.target.closest("a")) return;
        const id = tr.dataset.id;
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        render();
      });
    });
    list.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); onAction(btn); });
    });
  }

  function rowMarkup(it, ix) {
    const title = rowTitle(it);
    const second = kind === "idiom" ? (it.meaning || "—") : ([it.author, it.year].filter(Boolean).join(" · ") || "—");
    const len = (it.text || "").length;
    const id = it.id || `r${ix}`;
    const isOpen = expanded.has(id);
    const done = isItemDone(kind, id);
    return `
      <tr class="corpus-table__row${isOpen ? " is-open" : ""}${done ? " is-done" : ""}" data-id="${htmlEscape(id)}" tabindex="0" role="button" aria-expanded="${isOpen}">
        <td class="corpus-table__chevcol"><span class="corpus-table__chev" aria-hidden="true">${isOpen ? "▾" : "▸"}</span></td>
        <td class="corpus-table__title">${done ? `<span class="corpus-table__check" aria-label="Completed" data-tip="You typed this">✓</span> ` : ""}${htmlEscape(title)}</td>
        <td class="corpus-table__second">${htmlEscape(second)}</td>
        <td class="num corpus-table__len">${len}</td>
        <td class="corpus-table__actcol">
          <button type="button" class="btn btn--small btn--primary" data-action="type" data-id="${htmlEscape(id)}">${done ? "Type again" : "Type"}</button>
          <button type="button" class="btn btn--small" data-action="save" data-id="${htmlEscape(id)}">Save</button>
          ${done ? `<button type="button" class="btn btn--small btn--ghost" data-action="reset" data-id="${htmlEscape(id)}" data-tip="Clear completion record">Reset</button>` : ""}
        </td>
      </tr>
      ${isOpen ? `
        <tr class="corpus-table__detail" data-id="${htmlEscape(id)}">
          <td colspan="5">
            <article class="corpus-detail">
              <p class="corpus-detail__text">${htmlEscape(it.text || "")}</p>
              ${it.meaning ? `<p class="corpus-detail__meta"><strong>Meaning:</strong> ${htmlEscape(it.meaning)}</p>` : ""}
              ${(it.author || it.year || it.source) ? `<p class="corpus-detail__meta">${[it.author, it.year, it.source].filter(Boolean).map(htmlEscape).join(" · ")}</p>` : ""}
            </article>
          </td>
        </tr>
      ` : ""}
    `;
  }

  function renderCards(rows) {
    list.innerHTML = rows.map((it) => {
      const cite = [it.author, it.year].filter(Boolean).join(" · ");
      const subtitle = it.title ? `<span class="quote-card__title">${htmlEscape(it.title)}</span>` : "";
      const meaning = it.meaning ? `<span class="quote-card__meaning"><em>Meaning:</em> ${htmlEscape(it.meaning)}</span>` : "";
      const done = isItemDone(kind, it.id);
      return `
        <article class="quote-card${done ? " is-done" : ""}" data-id="${it.id}">
          ${done ? `<span class="quote-card__check" aria-label="Completed" data-tip="You typed this">✓</span>` : ""}
          ${subtitle}
          <p class="quote-card__text">${htmlEscape(it.text)}</p>
          <div class="quote-card__meta">
            <span class="quote-card__author">${htmlEscape(cite)}</span>
            <span class="quote-card__bucket">${it.text.length} chars</span>
          </div>
          ${meaning ? `<div class="quote-card__extra">${meaning}</div>` : ""}
          <div class="quote-card__actions">
            <button type="button" class="btn btn--small btn--primary" data-action="type" data-id="${it.id}">${done ? "Type again" : "Type this"}</button>
            <button type="button" class="btn btn--small" data-action="save" data-id="${it.id}">Save</button>
            ${done ? `<button type="button" class="btn btn--small btn--ghost" data-action="reset" data-id="${it.id}" data-tip="Clear completion record">Reset</button>` : ""}
          </div>
        </article>`;
    }).join("");
    list.querySelectorAll("[data-action]").forEach((btn) => btn.addEventListener("click", () => onAction(btn)));
  }

  async function typeItem(it) {
    const title = rowTitle(it);
    // Carry source metadata so the practice page can render an
    // attribution header (author, year, work, meaning) AND so the
    // engine can record completion against the original corpus item
    // (sourceId) when the session finishes cleanly.
    const meta = {
      kind,
      sourceId: it.id || null,
      title: it.title || null,
      author: it.author || null,
      year: it.year || null,
      source: it.source || null,
      meaning: it.meaning || null,
      // Parables carry an explicit moral; the practice surface
      // renders it on its own centered line at the end of the body.
      moral: it.moral || null,
    };
    const item = await saveText({ title, raw: it.text, meta });
    const from = kind && kind !== "item" ? `&from=${encodeURIComponent(kind)}` : "";
    window.location.href = `/practice/?mode=custom&custom=${encodeURIComponent(item.id)}&seg=0${from}`;
  }

  async function onAction(btn) {
    const action = btn.dataset.action;
    if (action === "reset-all") {
      const totalDone = Object.keys(getCorpusProgress(kind)).length;
      if (!totalDone) return;
      const ok = await confirmModal({
        title: `Reset all ${kind} progress?`,
        message: `Clear all ${totalDone} completion record${totalDone === 1 ? "" : "s"} for ${kind}s? This cannot be undone.`,
        confirmLabel: "Reset all",
        danger: true,
      });
      if (!ok) return;
      resetAll(kind);
      toast(`Cleared ${totalDone} ${kind} completion record${totalDone === 1 ? "" : "s"}`);
      render();
      return;
    }
    const id = btn.dataset.id;
    if (action === "reset") {
      resetItem(kind, id);
      render();
      return;
    }
    const it = items.find((x) => (x.id || "") === id);
    if (!it) return;
    if (action === "type") { await typeItem(it); }
    else {
      try {
        await saveText({ title: rowTitle(it), raw: it.text });
        toast(`Saved "${rowTitle(it)}" to your texts`);
      } catch (e) {
        toast(e.message || "Couldn't save that.", "bad");
      }
    }
  }
}
