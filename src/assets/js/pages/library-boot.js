/* Library page boot — Public-domain texts catalog. */

import { $, htmlEscape, toast } from "../util/dom.js";
import { saveText } from "../engine/custom-text.js";

const list = $("#library-list");
const search = $("#lib-search");
let books = [];
let q = "";

search.addEventListener("input", () => { q = search.value.trim().toLowerCase(); render(); });

(async () => {
  try {
    const res = await fetch("/data/library.json", { cache: "default" });
    books = await res.json();
    render();
  } catch (err) {
    list.innerHTML = `<p class="muted">Couldn't load library — try reloading.</p>`;
  }
})();

function bookMatches(b) {
  if (!q) return true;
  const hay = `${b.title} ${b.author} ${b.year} ${(b.tags || []).join(" ")}`.toLowerCase();
  return hay.includes(q);
}

function render() {
  const filtered = books.filter(bookMatches);
  if (!filtered.length) {
    list.innerHTML = `<p class="muted" style="padding:var(--space-5);text-align:center">No texts match.</p>`;
    return;
  }
  list.innerHTML = filtered.map((b) => `
    <article class="lib-book" data-id="${b.id}">
      <header class="lib-book__head">
        <h3 class="lib-book__title">${htmlEscape(b.title)}</h3>
        <div class="lib-book__meta">
          <span>${htmlEscape(b.author)}</span>
          <span>·</span>
          <span>${b.year}</span>
          <span>·</span>
          <a href="https://www.gutenberg.org/" target="_blank" rel="noopener" class="muted">${htmlEscape(b.source)}</a>
        </div>
      </header>
      <ul class="lib-book__passages">
        ${b.passages.map((p, i) => `
          <li class="lib-passage">
            <p class="lib-passage__text">${htmlEscape(p)}</p>
            <div class="lib-passage__actions">
              <button type="button" class="btn btn--small btn--primary" data-action="type" data-passage="${i}">Type passage</button>
              <button type="button" class="btn btn--small" data-action="save" data-passage="${i}">Save to my texts</button>
              <span class="lib-passage__len">${p.length} chars</span>
            </div>
          </li>
        `).join("")}
      </ul>
    </article>
  `).join("");
  list.querySelectorAll("[data-action]").forEach((btn) => btn.addEventListener("click", onAction));
}

function onAction(e) {
  const btn = e.currentTarget;
  const book = books.find((b) => b.id === btn.closest(".lib-book").dataset.id);
  const passage = book.passages[parseInt(btn.dataset.passage, 10)];
  if (btn.dataset.action === "type") {
    // Save into custom-texts under a temporary handle, then redirect.
    const item = saveText({ title: `${book.title} — passage ${parseInt(btn.dataset.passage, 10) + 1}`, raw: passage });
    window.location.href = `/practice/?mode=custom&custom=${encodeURIComponent(item.id)}&seg=0`;
  } else if (btn.dataset.action === "save") {
    saveText({ title: `${book.title} — passage ${parseInt(btn.dataset.passage, 10) + 1}`, raw: passage });
    toast(`Saved "${book.title}" to your texts`);
  }
}
