/* Custom-text page boot. File picker, drag-drop, paste, save, list.
   Supports .txt / .md / .epub / .pdf via the lazy-loading parser. */

import { saveText, listSaved, deleteSaved, togglePinAsLesson } from "../engine/custom-text.js";
import { parseFile } from "../engine/import-parsers.js";
import { $, toast, htmlEscape } from "../util/dom.js";
import { confirmModal } from "../util/modal.js";

const upload = $("#uploader");
const file = $("#uploader-file");
const titleEl = $("#paste-title");
const textEl = $("#paste-text");
const saveBtn = $("#paste-save");
const list = $("#saved-list");

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

async function ingestFile(f) {
  const ext = (f.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  const isHeavy = ext === ".epub" || ext === ".pdf";
  if (isHeavy) toast(`Parsing ${ext.toUpperCase().slice(1)}…`);
  try {
    const { title, text } = await parseFile(f);
    textEl.value = text;
    titleEl.value = title || f.name.replace(/\.[^.]+$/, "");
    const kb = (f.size / 1024).toFixed(1);
    toast(`Loaded ${kb} KB · ${(text.length / 1000).toFixed(1)}k chars — review and save.`);
  } catch (err) {
    toast(err.message || "Couldn't read that file.", "bad");
  }
}

saveBtn.addEventListener("click", () => {
  const title = titleEl.value.trim();
  const raw = textEl.value;
  if (!raw.trim()) { toast("Paste or upload some text first.", "bad"); return; }
  try {
    const item = saveText({ title: title || "Untitled", raw });
    toast(`Saved "${item.title}" — ${item.segments.length} segments`);
    titleEl.value = "";
    textEl.value = "";
    render();
  } catch (e) {
    toast(e.message || "Couldn't save text", "bad");
  }
});

function render() {
  const saved = listSaved();
  if (!saved.length) {
    list.innerHTML = '<div class="stats-empty">No saved texts yet.</div>';
    return;
  }
  list.innerHTML = saved.map((it) => `
    <article class="saved-item${it.forLesson ? " is-pinned" : ""}">
      <h3 class="saved-item__title">${htmlEscape(it.title)}<span class="muted">${(it.bytes / 1024).toFixed(1)} KB</span>${it.forLesson ? '<span class="saved-item__pin">★ pinned as lesson</span>' : ''}</h3>
      <span class="saved-item__meta">${it.segments.length} segments · ${new Date(it.createdAt).toLocaleDateString()}</span>
      <div class="saved-item__actions">
        <a class="btn btn--small btn--primary" href="/practice/?mode=custom&custom=${encodeURIComponent(it.id)}&seg=0">Type</a>
        <button class="btn btn--small" data-id="${it.id}" data-action="pin">${it.forLesson ? "Unpin" : "Save as lesson"}</button>
        <button class="btn btn--small" data-id="${it.id}" data-action="delete">Delete</button>
      </div>
    </article>
  `).join("");
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
}

render();
