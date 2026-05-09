/* Quote browser + collections page boot. */

import { loadQuotes, bucket } from "../engine/quotes.js";
import {
  listCollections, createCollection, renameCollection, deleteCollection,
  addToCollection, removeFromCollection, reorderCollection,
  setActiveCollection, getActiveCollectionId, clearActive, getCollection,
} from "../engine/collections.js";
import { $, $$, htmlEscape, toast } from "../util/dom.js";
import { confirmModal } from "../util/modal.js";
import { getActive, updateActive } from "../profiles.js";

function getQuoteProgress() {
  const p = getActive();
  return ((p.corpusProgress || {}).quote) || {};
}
function isQuoteDone(id) {
  return !!getQuoteProgress()[id];
}
function resetQuote(id) {
  updateActive((p) => {
    if (p.corpusProgress && p.corpusProgress.quote && p.corpusProgress.quote[id]) {
      delete p.corpusProgress.quote[id];
    }
    return p;
  });
}
function resetAllQuotes() {
  updateActive((p) => {
    if (p.corpusProgress && p.corpusProgress.quote) p.corpusProgress.quote = {};
    return p;
  });
}

const list = $("#quotes-list");
const search = $("#quote-search");
const filterBtns = $$(".quotes-filter__btn");
const randomBtn = document.getElementById("quote-random");
const collsGrid = $("#collections-grid");
const collsBar = $("#quotes-collection-bar");
const activeCollName = $("#active-collection-name");
const activeCollCount = $("#active-collection-count");

let allQuotes = [];
let bucketFilter = "all";
let q = "";
let collectingFor = null; // collection id being edited

if (randomBtn) randomBtn.addEventListener("click", () => {
  const filtered = allQuotes.filter(quoteMatches);
  if (!filtered.length) return;
  const qt = filtered[Math.floor(Math.random() * filtered.length)];
  window.location.href = `/practice/?mode=quote&quote=id&qid=${encodeURIComponent(qt.id)}`;
});

const _i = () => document.createElement("i");

function syncCollectionBar() {
  collectingFor = null;
  // The "type this" button has different semantics when a collection is being edited:
  // when null, type goes to /practice/?mode=quote&quote=<id>; when set, click adds to coll.
  collsBar.hidden = true;
}

function setCollectingMode(collId) {
  collectingFor = collId;
  if (!collId) { collsBar.hidden = true; render(); return; }
  const c = getCollection(collId);
  if (!c) { collsBar.hidden = true; render(); return; }
  activeCollName.textContent = c.name;
  activeCollCount.textContent = `· ${c.ids.length} quote${c.ids.length === 1 ? "" : "s"} in this collection`;
  collsBar.hidden = false;
  render();
}

$("#quotes-clear-collection").addEventListener("click", () => setCollectingMode(null));

filterBtns.forEach((b) => b.addEventListener("click", () => {
  filterBtns.forEach((x) => x.setAttribute("aria-pressed", "false"));
  b.setAttribute("aria-pressed", "true");
  bucketFilter = b.dataset.bucket;
  render();
}));

search.addEventListener("input", () => { q = search.value.trim().toLowerCase(); render(); });

function quoteMatches(qt) {
  if (bucketFilter !== "all" && bucket(qt) !== bucketFilter) return false;
  if (!q) return true;
  const hay = `${qt.text} ${qt.author || ""} ${(qt.tags || []).join(" ")}`.toLowerCase();
  return hay.includes(q);
}

const expanded = new Set();

function render() {
  const filtered = allQuotes.filter(quoteMatches);
  if (!filtered.length) {
    list.innerHTML = `<p class="muted" style="padding:var(--space-5);text-align:center">No quotes match your search.</p>`;
    return;
  }
  const inColl = collectingFor ? new Set((getCollection(collectingFor)?.ids) || []) : null;
  const progress = getQuoteProgress();
  const doneInView = filtered.filter((qt) => !!progress[qt.id]).length;
  const totalDone = Object.keys(progress).length;
  list.innerHTML = `
    <div class="corpus-table__summary">
      <p class="muted corpus-table__count">${filtered.length} quote${filtered.length === 1 ? "" : "s"}${doneInView ? ` · <strong>${doneInView} completed</strong>` : ""}</p>
      ${totalDone ? `<button type="button" class="btn btn--small btn--ghost" data-action="reset-all" data-tip="Clear completion records for every quote">Reset all (${totalDone})</button>` : ""}
    </div>
    <div class="corpus-table__wrap">
      <table class="corpus-table">
        <thead>
          <tr>
            <th class="corpus-table__chevcol" aria-label="Expand"></th>
            <th>Quote</th>
            <th>Author</th>
            <th class="num">Length</th>
            <th class="corpus-table__actcol">Action</th>
          </tr>
        </thead>
        <tbody>${filtered.map((qt) => quoteRow(qt, inColl)).join("")}</tbody>
      </table>
    </div>
  `;
  list.querySelectorAll(".corpus-table__row").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]") || e.target.closest("a")) return;
      const id = tr.dataset.id;
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      render();
    });
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tr.click(); }
    });
  });
  list.querySelectorAll("[data-action]").forEach((b) => {
    b.addEventListener("click", (e) => { e.stopPropagation(); onQuoteAction(e.currentTarget); });
  });
}

function quoteRow(qt, inColl) {
  const len = qt.text.length;
  const b = bucket(qt);
  const inThis = inColl && inColl.has(qt.id);
  const isOpen = expanded.has(qt.id);
  const done = isQuoteDone(qt.id);
  // Preview shows up to ~110 chars on the row; full text in expansion.
  const preview = qt.text.length > 110 ? qt.text.slice(0, 110) + "…" : qt.text;
  const typeLabel = done ? "Type again" : "Type this";
  const actions = collectingFor
    ? (inThis
        ? `<button type="button" class="btn btn--small" data-action="coll-remove" data-id="${htmlEscape(qt.id)}">Remove</button>`
        : `<button type="button" class="btn btn--small btn--primary" data-action="coll-add" data-id="${htmlEscape(qt.id)}">Add</button>`)
    : `<a class="btn btn--small btn--primary" href="/practice/?mode=quote&quote=id&qid=${encodeURIComponent(qt.id)}">${typeLabel}</a>
       <button type="button" class="btn btn--small" data-action="add-to-coll" data-id="${htmlEscape(qt.id)}">Save to collection</button>${done ? `
       <button type="button" class="btn btn--small btn--ghost" data-action="reset" data-id="${htmlEscape(qt.id)}" data-tip="Clear completion record">Reset</button>` : ""}`;
  return `
    <tr class="corpus-table__row${isOpen ? " is-open" : ""}${done ? " is-done" : ""}" data-id="${htmlEscape(qt.id)}" tabindex="0" role="button" aria-expanded="${isOpen}">
      <td class="corpus-table__chevcol"><span class="corpus-table__chev" aria-hidden="true">${isOpen ? "▾" : "▸"}</span></td>
      <td class="corpus-table__title">${done ? `<span class="corpus-table__check" aria-label="Completed" data-tip="You typed this">✓</span> ` : ""}${htmlEscape(preview)}</td>
      <td class="corpus-table__second">${htmlEscape(qt.author || "—")}${qt.source ? `<br><span class="corpus-table__source">${htmlEscape(qt.source)}</span>` : ""}</td>
      <td class="num corpus-table__len">${len}</td>
      <td class="corpus-table__actcol">${actions}</td>
    </tr>
    ${isOpen ? `
      <tr class="corpus-table__detail" data-id="${htmlEscape(qt.id)}">
        <td colspan="5">
          <article class="corpus-detail">
            <p class="corpus-detail__text">${htmlEscape(qt.text)}</p>
            <p class="corpus-detail__meta">
              ${qt.author ? `<strong>—</strong> ${htmlEscape(qt.author)}` : ""}
              ${qt.year ? ` · ${htmlEscape(qt.year)}` : ""} · ${b} · ${len} chars
            </p>
          </article>
        </td>
      </tr>
    ` : ""}
  `;
}

async function onQuoteAction(btn) {
  // Buttons live inside table rows now; the data-id attribute on the
  // button itself is the source of truth.
  const id = btn.dataset.id || (btn.closest("[data-id]") && btn.closest("[data-id]").dataset.id);
  const action = btn.dataset.action;
  if (action === "reset-all") {
    const totalDone = Object.keys(getQuoteProgress()).length;
    if (!totalDone) return;
    const ok = await confirmModal({
      title: "Reset all quote progress?",
      message: `Clear all ${totalDone} quote completion record${totalDone === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Reset all",
      danger: true,
    });
    if (!ok) return;
    resetAllQuotes();
    toast(`Cleared ${totalDone} quote completion record${totalDone === 1 ? "" : "s"}`);
    render();
    return;
  }
  if (action === "reset") {
    resetQuote(id);
    render();
    return;
  }
  if (action === "coll-add") {
    addToCollection(collectingFor, id);
    toast("Added to collection");
    render();
    renderCollections();
  } else if (action === "coll-remove") {
    removeFromCollection(collectingFor, id);
    toast("Removed");
    render();
    renderCollections();
  } else if (action === "add-to-coll") {
    promptAddToCollection(id);
  }
}

/* Inline modal — picks an existing collection or creates a new one. */
let _addModal = null;
function buildAddModal() {
  if (_addModal) return _addModal;
  const el = document.createElement("dialog");
  el.id = "add-coll-modal";
  el.className = "info-modal";
  el.setAttribute("aria-label", "Add to a collection");
  el.innerHTML = `
    <div class="info-modal__head">
      <h2 class="info-modal__title">Add to a collection</h2>
      <button type="button" class="info-modal__close" aria-label="Close">×</button>
    </div>
    <div class="info-modal__body">
      <p style="margin-bottom:var(--space-3);color:var(--fg-2);font-size:var(--fs-200)">Pick a collection or create a new one. Collections live in your browser only.</p>
      <div class="add-coll-list" data-list></div>
      <form class="add-coll-new" data-new>
        <label for="add-coll-name">New collection</label>
        <div class="row" style="gap:.4rem;margin-top:.4rem">
          <input type="text" id="add-coll-name" maxlength="80" placeholder="My favorites" autocomplete="off">
          <button type="submit" class="btn btn--primary btn--small">Create &amp; add</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector(".info-modal__close").addEventListener("click", () => el.close());
  el.addEventListener("click", (e) => { if (e.target === el) el.close(); });
  _addModal = el;
  return el;
}

function promptAddToCollection(quoteId) {
  const el = buildAddModal();
  const list = el.querySelector("[data-list]");
  const form = el.querySelector("[data-new]");
  const colls = listCollections();
  list.innerHTML = colls.length
    ? colls.map((c) => `
        <button type="button" class="add-coll-row" data-coll-id="${c.id}">
          <span class="add-coll-row__name">${htmlEscape(c.name)}</span>
          <span class="add-coll-row__count">${c.ids.length} ${c.ids.length === 1 ? "item" : "items"}</span>
        </button>`).join("")
    : `<p class="muted" style="padding:var(--space-3) 0">No collections yet — create your first one below.</p>`;
  list.querySelectorAll("[data-coll-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.collId;
      addToCollection(id, quoteId);
      const c = colls.find((x) => x.id === id);
      toast(`Added to "${c.name}"`);
      el.close();
      renderCollections();
      render();
    });
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const input = form.querySelector("input");
    const name = (input.value || "").trim();
    if (!name) { input.focus(); return; }
    const c = createCollection(name);
    addToCollection(c.id, quoteId);
    toast(`Added to "${c.name}"`);
    input.value = "";
    el.close();
    renderCollections();
    render();
  };
  if (!el.open) el.showModal();
  setTimeout(() => form.querySelector("input").focus(), 50);
}

function renderCollections() {
  const colls = listCollections();
  if (!colls.length) {
    collsGrid.innerHTML = `<p class="muted" style="padding:var(--space-3) 0">No collections yet. Click "New collection" above to start one.</p>`;
    return;
  }
  const activeId = getActiveCollectionId();
  collsGrid.innerHTML = colls.map((c) => {
    const items = c.ids.map((qid) => allQuotes.find((q) => q.id === qid)).filter(Boolean);
    return `
      <article class="collection" data-id="${c.id}">
        <header class="collection__head">
          <h3 class="collection__name">${htmlEscape(c.name)}</h3>
          <span class="collection__count">${items.length}</span>
        </header>
        <ul class="collection__list">
          ${items.map((it, i) => `
            <li data-qid="${it.id}" data-idx="${i}">
              <span class="collection__rank">${i + 1}</span>
              <span class="collection__text">${htmlEscape(it.text.slice(0, 80))}${it.text.length > 80 ? "…" : ""}</span>
              <span class="collection__row-actions">
                <button type="button" data-action="up" aria-label="Move up">↑</button>
                <button type="button" data-action="down" aria-label="Move down">↓</button>
                <button type="button" data-action="remove" aria-label="Remove">×</button>
              </span>
            </li>
          `).join("") || `<li class="collection__empty">Empty — go pick some quotes above.</li>`}
        </ul>
        <div class="collection__actions">
          <a class="btn btn--small btn--primary ${items.length ? "" : "btn--disabled"}" ${items.length ? `href="/practice/?mode=quote&collection=${encodeURIComponent(c.id)}"` : 'aria-disabled="true"'}>Type collection</a>
          <button type="button" class="btn btn--small" data-action="edit">${collectingFor === c.id ? "Done editing" : "Add quotes"}</button>
          <button type="button" class="btn btn--small" data-action="rename">Rename</button>
          <button type="button" class="btn btn--small" data-action="delete">Delete</button>
        </div>
      </article>`;
  }).join("");
  collsGrid.querySelectorAll(".collection").forEach((el) => bindCollection(el));
}

function bindCollection(el) {
  const id = el.dataset.id;
  el.querySelectorAll(".collection__list li[data-qid]").forEach((li) => {
    const qid = li.dataset.qid;
    const idx = parseInt(li.dataset.idx, 10);
    li.querySelector('[data-action="up"]').addEventListener("click", () => { reorderCollection(id, idx, idx - 1); renderCollections(); });
    li.querySelector('[data-action="down"]').addEventListener("click", () => { reorderCollection(id, idx, idx + 1); renderCollections(); });
    li.querySelector('[data-action="remove"]').addEventListener("click", () => { removeFromCollection(id, qid); renderCollections(); });
  });
  el.querySelector('[data-action="edit"]').addEventListener("click", () => {
    setCollectingMode(collectingFor === id ? null : id);
  });
  el.querySelector('[data-action="rename"]').addEventListener("click", () => {
    const cur = getCollection(id);
    promptName({ title: "Rename collection", initial: cur ? cur.name : "", onSave: (name) => {
      renameCollection(id, name);
      renderCollections();
      if (collectingFor === id) setCollectingMode(id);
    }});
  });
  el.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Delete this collection?",
      message: "The collection will be removed. The quotes themselves are unaffected.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    deleteCollection(id);
    if (collectingFor === id) setCollectingMode(null);
    renderCollections();
  });
}

$("#collection-new").addEventListener("click", () => {
  promptName({ title: "New collection", initial: "", placeholder: "My favorites", onSave: (name) => {
    const c = createCollection(name);
    toast(`Created "${c.name}"`);
    renderCollections();
    setCollectingMode(c.id);
  }});
});

/* Reusable name-input modal — used for rename and new-collection. */
let _nameModal = null;
function promptName({ title, initial, placeholder, onSave }) {
  if (!_nameModal) {
    const el = document.createElement("dialog");
    el.id = "name-modal";
    el.className = "info-modal";
    el.innerHTML = `
      <div class="info-modal__head">
        <h2 class="info-modal__title" data-title>Name</h2>
        <button type="button" class="info-modal__close" aria-label="Close">×</button>
      </div>
      <div class="info-modal__body">
        <form data-form>
          <div class="field">
            <label for="name-modal-input" data-label>Name</label>
            <input id="name-modal-input" type="text" maxlength="80" autocomplete="off">
          </div>
          <div class="row" style="gap:.4rem">
            <button type="submit" class="btn btn--primary">Save</button>
            <button type="button" class="btn" data-cancel>Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector(".info-modal__close").addEventListener("click", () => el.close());
    el.querySelector("[data-cancel]").addEventListener("click", () => el.close());
    el.addEventListener("click", (e) => { if (e.target === el) el.close(); });
    _nameModal = el;
  }
  const el = _nameModal;
  el.querySelector("[data-title]").textContent = title;
  const input = el.querySelector("#name-modal-input");
  input.value = initial || "";
  input.placeholder = placeholder || "";
  const form = el.querySelector("[data-form]");
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = (input.value || "").trim();
    if (!v) { input.focus(); return; }
    el.close();
    onSave(v);
  };
  if (!el.open) el.showModal();
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

(async () => {
  try {
    allQuotes = await loadQuotes();
    render();
    renderCollections();
  } catch (err) {
    list.innerHTML = `<p class="muted">Couldn't load quotes — try reloading.</p>`;
  }
})();
