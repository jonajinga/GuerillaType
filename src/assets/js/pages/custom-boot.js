/* Custom-text page boot. File picker, drag-drop, paste, save, list, and
   the per-text segment picker.

   Supports .txt / .md / .epub / .pdf via the lazy-loading parser. Whole
   books are the expected case: the bodies go to IndexedDB, so a
   600-page PDF is imported in full instead of being cut off at the old
   512k-character localStorage ceiling. */

import {
  saveText, listSaved, deleteSaved, togglePinAsLesson,
  getSegments, segCountOf, migrateInlineToIdb,
} from "../engine/custom-text.js";
import { parseFile } from "../engine/import-parsers.js";
import { $, toast, htmlEscape } from "../util/dom.js";
import { confirmModal } from "../util/modal.js";

const upload = $("#uploader");
const file = $("#uploader-file");
const titleEl = $("#paste-title");
const textEl = $("#paste-text");
const notice = $("#paste-notice");
const saveBtn = $("#paste-save");
const list = $("#saved-list");

/* A textarea holding two million characters is a browser that stutters
   on every keypress. Show a readable head, keep the whole thing in
   memory, and save the whole thing. */
const PREVIEW_CHARS = 200000;
let pendingFull = null;
let pendingPreview = null;

const nf = new Intl.NumberFormat();

function setNotice(msg) {
  if (!notice) return;
  notice.textContent = msg || "";
  notice.hidden = !msg;
}

function clearPending() {
  pendingFull = null;
  pendingPreview = null;
  setNotice("");
}

upload.addEventListener("click", () => file.click());
upload.addEventListener("dragover", (e) => { e.preventDefault(); upload.dataset.drag = "true"; });
upload.addEventListener("dragleave", () => { upload.dataset.drag = "false"; });
upload.addEventListener("drop", async (e) => {
  e.preventDefault();
  upload.dataset.drag = "false";
  const f = e.dataTransfer.files[0];
  if (f) await ingestFile(f);
});
file.addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (f) await ingestFile(f);
});

// Editing the preview by hand means the user meant the edit, so drop
// the stashed full text and save exactly what is in the box.
textEl.addEventListener("input", () => {
  if (pendingFull && textEl.value !== pendingPreview) clearPending();
});

async function ingestFile(f) {
  const ext = (f.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  const isHeavy = ext === ".epub" || ext === ".pdf";
  clearPending();
  if (isHeavy) toast(`Parsing ${ext.toUpperCase().slice(1)}…`);
  upload.dataset.busy = "true";
  try {
    const { title, text } = await parseFile(f, (done, total, unit) => {
      toast(`Reading ${unit} ${nf.format(done)} of ${nf.format(total)}…`);
    });
    titleEl.value = title || f.name.replace(/\.[^.]+$/, "");
    if (text.length > PREVIEW_CHARS) {
      pendingFull = text;
      pendingPreview = text.slice(0, PREVIEW_CHARS);
      textEl.value = pendingPreview;
      setNotice(
        `Previewing the first ${nf.format(PREVIEW_CHARS)} characters of ${nf.format(text.length)}. ` +
        `The whole text is saved — the box just does not need to hold it all. Edit the preview and only the edited version is saved.`
      );
    } else {
      textEl.value = text;
    }
    const kb = (f.size / 1024).toFixed(1);
    toast(`Loaded ${kb} KB · ${nf.format(text.length)} characters — review and save.`);
  } catch (err) {
    toast(err.message || "Couldn't read that file.", "bad");
  } finally {
    upload.dataset.busy = "false";
  }
}

saveBtn.addEventListener("click", async () => {
  const title = titleEl.value.trim();
  const raw = (pendingFull && textEl.value === pendingPreview) ? pendingFull : textEl.value;
  if (!raw.trim()) { toast("Paste or upload some text first.", "bad"); return; }
  saveBtn.disabled = true;
  try {
    const item = await saveText({ title: title || "Untitled", raw });
    // Truncation and eviction used to happen in silence. If someone's
    // 900 KB book became 512 KB, they need to hear it now rather than
    // discover it two hours of typing later.
    if (item.truncatedFrom) {
      const kept = (item.bytes / 1024).toFixed(0);
      const orig = (item.truncatedFrom / 1024).toFixed(0);
      const why = item.fallbackReason === "refused"
        ? "this browser refused to store it in its database, usually meaning it is out of room"
        : "this browser does not give the site a database";
      toast(`Saved "${item.title}" — ${nf.format(item.segCount)} segments. Trimmed to ${kept} KB of ${orig} KB: ${why}, so the text had to fit the 512 KB fallback.`, "bad");
    } else {
      toast(`Saved "${item.title}" — ${nf.format(item.segCount)} segments`);
    }
    if (item.evicted && item.evicted.length) {
      toast(`Removed ${item.evicted.length} older saved text${item.evicted.length === 1 ? "" : "s"} to make room: ${item.evicted.join(", ")}`, "bad");
    }
    titleEl.value = "";
    textEl.value = "";
    clearPending();
    render();
  } catch (e) {
    toast(e.message || "Couldn't save text", "bad");
  } finally {
    saveBtn.disabled = false;
  }
});

/* ── Segment picker ─────────────────────────────────────────────
   A 600-page PDF becomes thousands of segments. "Start at the top and
   press next" is not a way to find chapter 14, and hand-editing ?seg=
   in the URL was the only alternative. One open picker at a time; the
   bodies are fetched from IndexedDB only when it opens. */

const PICKER_PAGE = 40;
const pickers = new Map(); // id -> { segments, page, query, host }

function segPreview(s, q) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= 140) return t;
  // A search hit deeper than 140 characters into a segment was invisible
  // in its own row -- the row matched, the preview did not show why.
  if (q) {
    const at = t.toLowerCase().indexOf(q.toLowerCase());
    if (at > 40) {
      const from = Math.max(0, at - 40);
      return "…" + t.slice(from, from + 140) + (from + 140 < t.length ? "…" : "");
    }
  }
  return t.slice(0, 140) + "…";
}

function practiceUrl(id, seg) {
  return `/practice/?mode=custom&custom=${encodeURIComponent(id)}&seg=${seg}`;
}

function renderPicker(id) {
  const st = pickers.get(id);
  if (!st) return;
  const item = listSaved().find((x) => x.id === id);
  const bookmark = item ? (item.lastSeg | 0) : 0;

  const q = st.query.trim().toLowerCase();
  // Keep original indices — a filtered list that renumbers would send
  // the user to the wrong part of the book.
  const matches = [];
  for (let i = 0; i < st.segments.length; i++) {
    if (!q || st.segments[i].toLowerCase().includes(q)) matches.push(i);
  }
  const pageCount = Math.max(1, Math.ceil(matches.length / PICKER_PAGE));
  if (st.page >= pageCount) st.page = pageCount - 1;
  const start = st.page * PICKER_PAGE;
  const shown = matches.slice(start, start + PICKER_PAGE);

  const rows = shown.map((i) => `
    <li>
      <a class="seg-picker__item${i === bookmark ? " is-current" : ""}" href="${practiceUrl(id, i)}" data-seg="${i}">
        <span class="seg-picker__n">${nf.format(i + 1)}</span>
        <span class="seg-picker__preview">${htmlEscape(segPreview(st.segments[i], q))}</span>
      </a>
    </li>`).join("");

  st.host.innerHTML = `
    <div class="seg-picker__bar">
      <input type="search" class="seg-picker__filter" id="segq-${id}" placeholder="Search this text…" value="${htmlEscape(st.query)}" aria-label="Search segments">
      <label class="seg-picker__jump">Go to
        <input type="number" class="seg-picker__jumpnum" min="1" max="${st.segments.length}" placeholder="1" aria-label="Segment number">
      </label>
      <button type="button" class="btn btn--small" data-picker="jump">Go</button>
    </div>
    <p class="seg-picker__count">${
      matches.length
        ? `Showing ${nf.format(start + 1)}–${nf.format(start + shown.length)} of ${nf.format(matches.length)}${q ? " matching" : ""} segment${matches.length === 1 ? "" : "s"}`
        : "No segment contains that."
    }</p>
    <ol class="seg-picker__list">${rows}</ol>
    <div class="seg-picker__pager">
      <button type="button" class="btn btn--small" data-picker="prev"${st.page === 0 ? " disabled" : ""}>← Previous</button>
      <span class="seg-picker__page">Page ${nf.format(st.page + 1)} of ${nf.format(pageCount)}</span>
      <button type="button" class="btn btn--small" data-picker="next"${st.page >= pageCount - 1 ? " disabled" : ""}>Next →</button>
    </div>`;

  const filter = st.host.querySelector(".seg-picker__filter");
  let debounce;
  filter.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      st.query = filter.value;
      st.page = 0;
      renderPicker(id);
      const again = st.host.querySelector(".seg-picker__filter");
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    }, 180);
  });

  const jumpTo = () => {
    const numEl = st.host.querySelector(".seg-picker__jumpnum");
    const n = parseInt(numEl.value, 10);
    if (!n || n < 1 || n > st.segments.length) {
      toast(`Pick a segment between 1 and ${nf.format(st.segments.length)}.`, "bad");
      return;
    }
    window.location.href = practiceUrl(id, n - 1);
  };
  st.host.querySelector('[data-picker="jump"]').addEventListener("click", jumpTo);
  st.host.querySelector(".seg-picker__jumpnum").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); jumpTo(); }
  });
  const prev = st.host.querySelector('[data-picker="prev"]');
  const next = st.host.querySelector('[data-picker="next"]');
  prev.addEventListener("click", () => { st.page = Math.max(0, st.page - 1); renderPicker(id); });
  next.addEventListener("click", () => { st.page = Math.min(pageCount - 1, st.page + 1); renderPicker(id); });
}

async function togglePicker(id, host, btn) {
  const card = document.getElementById("text-" + id);
  if (!host.hidden) {
    host.hidden = true;
    if (card) card.dataset.picking = "false";
    pickers.delete(id);
    if (btn) btn.textContent = "Choose segment";
    return;
  }
  host.hidden = false;
  if (card) card.dataset.picking = "true";
  host.innerHTML = '<p class="seg-picker__count">Loading segments…</p>';
  if (btn) btn.textContent = "Hide segments";
  const segments = await getSegments(id);
  if (!segments.length) {
    host.innerHTML = '<p class="seg-picker__count">This text could not be read back from storage. Re-import it above.</p>';
    return;
  }
  const item = listSaved().find((x) => x.id === id);
  const bookmark = item ? Math.min(item.lastSeg | 0, segments.length - 1) : 0;
  pickers.set(id, {
    segments,
    // Open on the page holding the bookmark, not on page 1 — resuming
    // a book at segment 3,900 should not mean 98 clicks of "next".
    page: Math.floor(Math.max(0, bookmark) / PICKER_PAGE),
    query: "",
    host,
  });
  renderPicker(id);
}

function render() {
  const saved = listSaved();
  if (!saved.length) {
    list.innerHTML = '<div class="stats-empty">No saved texts yet.</div>';
    return;
  }
  list.innerHTML = saved.map((it) => {
    const count = segCountOf(it);
    const seg = Math.min(it.lastSeg | 0, Math.max(0, count - 1));
    const resuming = (it.lastSeg | 0) > 0 && count > 1;
    return `
    <article class="saved-item${it.forLesson ? " is-pinned" : ""}" id="text-${it.id}">
      <h3 class="saved-item__title">${htmlEscape(it.title)}<span class="muted">${(it.bytes / 1024).toFixed(1)} KB</span>${it.forLesson ? '<span class="saved-item__pin">★ pinned as lesson</span>' : ''}</h3>
      <span class="saved-item__meta">${nf.format(count)} segment${count === 1 ? "" : "s"}${
        resuming ? ` · resuming at ${nf.format(Math.min((it.lastSeg | 0) + 1, count))} of ${nf.format(count)}` : ""
      } · ${new Date(it.createdAt).toLocaleDateString()}</span>
      <div class="saved-item__actions">
        <a class="btn btn--small btn--primary" href="${practiceUrl(it.id, seg)}">${resuming ? "Resume" : "Type"}</a>${
        resuming ? `\n        <a class="btn btn--small" href="${practiceUrl(it.id, 0)}">Start over</a>` : ""
      }${
        count > 1 ? `\n        <button class="btn btn--small" data-id="${it.id}" data-action="segments">Choose segment</button>` : ""
      }
        <button class="btn btn--small" data-id="${it.id}" data-action="pin">${it.forLesson ? "Unpin" : "Save as lesson"}</button>
        <button class="btn btn--small" data-id="${it.id}" data-action="delete">Delete</button>
      </div>
      <div class="seg-picker" id="pick-${it.id}" hidden></div>
    </article>
  `;
  }).join("");
  list.querySelectorAll('[data-action="delete"]').forEach((b) => {
    b.addEventListener("click", async () => {
      const ok = await confirmModal({
        title: "Delete this text?",
        message: "The saved text will be removed from this device.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      deleteSaved(b.dataset.id);
      pickers.delete(b.dataset.id);
      render();
    });
  });
  list.querySelectorAll('[data-action="pin"]').forEach((b) => {
    b.addEventListener("click", () => {
      const it = togglePinAsLesson(b.dataset.id);
      toast(it && it.forLesson ? `Pinned "${it.title}" as a lesson` : "Unpinned");
      render();
    });
  });
  list.querySelectorAll('[data-action="segments"]').forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.dataset.id;
      togglePicker(id, document.getElementById("pick-" + id), b);
    });
  });
}

/* The results screen links back here as /custom/#pick-<id> so "choose a
   segment" is one click from finishing one. */
function openFromHash() {
  const m = (location.hash || "").match(/^#pick-(.+)$/);
  if (!m) return;
  const id = m[1];
  const host = document.getElementById("pick-" + id);
  const btn = list.querySelector(`[data-action="segments"][data-id="${CSS.escape(id)}"]`);
  if (!host || !btn) return;
  togglePicker(id, host, btn);
  document.getElementById("text-" + id).scrollIntoView({ block: "start" });
}

(async () => {
  // Pull any pre-IndexedDB texts out of localStorage first, so the list
  // below reports segment counts from one place and the quota comes back.
  try { await migrateInlineToIdb(); } catch {}
  render();
  openFromHash();
})();
