/* Custom-text page boot. File picker, drag-drop, paste, save, list, and
   the per-text segment picker.

   Supports .txt / .md / .epub / .pdf via the lazy-loading parser. Whole
   books are the expected case: the bodies go to IndexedDB, so a
   600-page PDF is imported in full instead of being cut off at the old
   512k-character localStorage ceiling. */

import {
  saveText, listSaved, deleteSaved, togglePinAsLesson,
  getSegments, segCountOf, migrateInlineToIdb, ocrNoiseReport,
} from "../engine/custom-text.js";
import { ensureSample } from "../engine/custom-sample.js";
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
const ocrPanel = $("#ocr-panel");
const ocrSummary = $("#ocr-summary");
const ocrChanges = $("#ocr-changes");
const ocrClean = $("#ocr-clean");
const ocrHint = $(".ocr-panel__hint");

/* A textarea holding two million characters is a browser that stutters
   on every keypress. Show a readable head, keep the whole thing in
   memory, and save the whole thing. */
const PREVIEW_CHARS = 200000;
let pendingFull = null;
let pendingPreview = null;

/* Both readings of the imported file, each held in full: the cleaned
   one and the one that came out of the parser. The checkbox swaps
   which is on screen, and swapping has to move pendingFull and
   pendingPreview with it -- they are what the save button actually
   reads. Leaving them pointing at the other variant is how a 600-page
   book would silently save as its first 200,000 characters.

   Set on the FILE path only. A pasted text has no second reading --
   the box holds the original and stays holding it -- so `variants`
   staying null is how the checkbox handler below knows not to rewrite
   what someone is typing into. */
let variants = null;
let cleanChoice = true;
/* The last value this file put into the textarea. The input listener
   below treats any other value as a deliberate edit by the user, so
   every programmatic write has to update this.

   null, not "", and it goes back to null after a save. "" is a value a
   user can produce -- select all, delete -- and while this held "" the
   listener read that edit as its own write and returned early, so
   emptying the box left the preview panel on screen describing text
   that was no longer there. A sentinel no user input can equal cannot
   collide with one. */
let shownValue = null;

/* A paste is an import too. The file path above shows what the cleanup
   would do before anything is saved; text pasted or typed into the box
   used to get the same cleanup with no panel and no way to refuse it.

   The textarea's "input" event is the only signal there is -- there is
   no event for "text was dropped into the box", and someone can type
   the same characters a scanner produced -- so it drives the scan.
   Debounced, because the cleaner walks the whole string and a paste of
   a whole book arrives as one input event followed by however many
   keystrokes the user adds next. */
const PASTE_SCAN_MS = 400;
let pasteTimer = null;

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

/* Put one variant of the text on screen, long or short, and record
   what we wrote so the edit detector does not mistake it for typing. */
function showText(text) {
  if (text.length > PREVIEW_CHARS) {
    pendingFull = text;
    pendingPreview = text.slice(0, PREVIEW_CHARS);
    textEl.value = pendingPreview;
    setNotice(
      `Previewing the first ${nf.format(PREVIEW_CHARS)} characters of ${nf.format(text.length)}. ` +
      `The whole text is saved — the box just does not need to hold it all. Edit the preview and only the edited version is saved.`
    );
  } else {
    pendingFull = null;
    pendingPreview = null;
    textEl.value = text;
    setNotice("");
  }
  shownValue = textEl.value;
}

function hideOcrPanel() {
  if (!ocrPanel) return;
  ocrPanel.hidden = true;
  // Which import the panel described goes with it, so nothing can read
  // a stale source off a panel that is not on screen.
  delete ocrPanel.dataset.source;
}

/* A fresh file, or a save that finished: forget both variants and go
   back to cleaning by default.

   Cancelling the pending paste scan is load-bearing, not tidiness.
   ingestFile() calls this and then writes the parsed file into the
   textarea; a scan scheduled by the user's last keystroke that fired
   after that would have re-read the box, found the FILE's text in it,
   and replaced the file's report with a paste report -- two code paths
   describing the same panel, with only one of them holding `variants`.
   One timer, cancelled wherever the panel is torn down. */
function resetOcr() {
  clearTimeout(pasteTimer);
  pasteTimer = null;
  variants = null;
  cleanChoice = true;
  if (ocrClean) ocrClean.checked = true;
  hideOcrPanel();
}

/* What the cleanup did (a file: the box already holds the cleaned
   text) or what it is about to do (a paste: the box still holds the
   user's own text and is not touched), in the user's words, with an
   off-switch.

   Nothing is shown when nothing was changed -- a panel saying "0
   changes" is just noise on a clean .txt file, and the same reasoning
   applies letter for letter to a pasted chapter with no scanner marks
   in it. Both paths go through here so they cannot drift apart. */
const PANEL_COPY = {
  file: {
    lead: (n) =>
      `${nf.format(n)} ${n === 1 ? "mark" : "marks"} in this file looked like ` +
      `scanning noise rather than the book, and ${n === 1 ? "was" : "were"} cleaned up:`,
    hint: "Untick to keep the file exactly as it came — here, and every time you type it.",
  },
  paste: {
    lead: (n) =>
      `${nf.format(n)} ${n === 1 ? "mark" : "marks"} in this text ${n === 1 ? "looks" : "look"} like ` +
      `scanning noise rather than writing, and will be cleaned up when you save:`,
    hint: "Untick to save the text exactly as you pasted it — here, and every time you type it.",
  },
};

function renderOcrPanel(report, source) {
  if (!ocrPanel || !ocrSummary || !ocrChanges) return;
  if (!report.total) { hideOcrPanel(); return; }
  const copy = PANEL_COPY[source] || PANEL_COPY.file;
  ocrSummary.textContent = copy.lead(report.total);
  ocrChanges.innerHTML = report.changes
    .map((c) => `<li>${htmlEscape(c.label)} <span class="ocr-panel__n">· ${nf.format(c.count)}</span></li>`)
    .join("");
  // "keep the file as it came" is the wrong sentence about a paste.
  if (ocrHint) ocrHint.textContent = copy.hint;
  // Which import the panel is describing. Read by scripts/check-ocr-cleanup.mjs.
  ocrPanel.dataset.source = source === "paste" ? "paste" : "file";
  ocrPanel.hidden = false;
}

function schedulePasteScan() {
  clearTimeout(pasteTimer);
  pasteTimer = setTimeout(runPasteScan, PASTE_SCAN_MS);
}

/* What the cleanup would do to whatever is in the box right now.

   This path never writes to the textarea, and that is deliberate. The
   box holds text the user is editing: swapping it for a cleaned copy
   would move their caret to the end mid-sentence, and for a paste
   longer than PREVIEW_CHARS showText() would stash it as
   pendingFull/pendingPreview -- so the very next keystroke would drop
   the stash and save a 200,000-character fragment of what they pasted.
   The upload path can swap safely because the text there came from a
   file and nobody is typing into it.

   So the panel says what will happen at save time, and the save
   honours cleanChoice. What is in the box IS the original. */
function runPasteScan() {
  // Also called straight from the save button, so cancel the pending
  // timer rather than only forgetting the handle -- a stray timer that
  // fires after a save would scan a box that has already been emptied.
  clearTimeout(pasteTimer);
  pasteTimer = null;
  const text = textEl.value;
  const report = text.trim()
    ? ocrNoiseReport(text)
    : { text: "", total: 0, changes: [] };

  if (!report.total) {
    /* Nothing to clean means there is nothing to decide, so there is
       nothing to remember: put the off-switch back to its default.
       Carrying a stale "no" here would write clean:false onto a record
       with no scanner noise in it, and that flag is permanent -- it
       turns the display-side repair off for that text for good.

       While a panel IS on screen the tick is the user's answer and is
       never touched: they can type on with cleanup switched off. */
    cleanChoice = true;
    if (ocrClean) ocrClean.checked = true;
    hideOcrPanel();
    return;
  }
  renderOcrPanel(report, "paste");
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
//
// Setting textarea.value from script does not fire "input", but the
// checkbox below rewrites the box and the comparison must survive it
// anyway: shownValue is updated by every programmatic write, so a
// swapped-in variant is never mistaken for typing. Getting that wrong
// drops pendingFull and saves a whole book as its 200,000-character
// preview.
textEl.addEventListener("input", () => {
  if (textEl.value === shownValue) return;
  if (pendingFull) clearPending();
  // The file's report described the file, not this edit, and its two
  // full readings are about text that is no longer in the box. Drop
  // both, and take the panel down with them so the upload's counts
  // cannot be read as describing what was just typed. The tick itself
  // survives: it is the user's answer about their own text, and the
  // save below still honours it.
  //
  // A PASTE panel is left up on purpose. It is refreshed by the scan
  // below within PASTE_SCAN_MS, and hiding it on every keystroke would
  // make it strobe while someone types.
  if (variants) { variants = null; hideOcrPanel(); }
  schedulePasteScan();
});

if (ocrClean) {
  ocrClean.addEventListener("change", () => {
    cleanChoice = ocrClean.checked;
    /* Only an uploaded file has a second reading to swap in, and
       `variants` is set on that path alone. showText() moves
       pendingFull/pendingPreview with the swap, which is what keeps a
       600-page upload saving in full after the box is toggled.

       A pasted text deliberately has no variants: the box already
       holds the original, and rewriting it here would move the caret
       and, past PREVIEW_CHARS, stash a preview in place of the whole
       paste. Toggling a paste changes cleanChoice and nothing else. */
    if (!variants) return;
    showText(cleanChoice ? variants.cleaned : variants.original);
  });
}

async function ingestFile(f) {
  const ext = (f.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  const isHeavy = ext === ".epub" || ext === ".pdf";
  clearPending();
  resetOcr();
  if (isHeavy) toast(`Parsing ${ext.toUpperCase().slice(1)}…`);
  upload.dataset.busy = "true";
  try {
    const { title, text } = await parseFile(f, (done, total, unit) => {
      toast(`Reading ${unit} ${nf.format(done)} of ${nf.format(total)}…`);
    });
    titleEl.value = title || f.name.replace(/\.[^.]+$/, "");
    /* Scanned books arrive full of characters the book never had. Show
       what the cleanup would do before it is saved, and let the user
       turn it off -- their file, their call. */
    const report = ocrNoiseReport(text);
    variants = { cleaned: report.text, original: text };
    cleanChoice = true;
    if (ocrClean) ocrClean.checked = true;
    showText(report.text);
    renderOcrPanel(report, "file");
    const kb = (f.size / 1024).toFixed(1);
    toast(`Loaded ${kb} KB · ${nf.format(text.length)} characters — review and save.`);
  } catch (err) {
    toast(err.message || "Couldn't read that file.", "bad");
  } finally {
    upload.dataset.busy = "false";
  }
}

saveBtn.addEventListener("click", async () => {
  /* Saving within PASTE_SCAN_MS of the last keystroke would otherwise
     save against a choice the panel had not caught up with. Run the
     pending scan now so what is saved is what the panel says. */
  if (pasteTimer) runPasteScan();
  const title = titleEl.value.trim();
  const raw = (pendingFull && textEl.value === pendingPreview) ? pendingFull : textEl.value;
  if (!raw.trim()) { toast("Paste or upload some text first.", "bad"); return; }
  saveBtn.disabled = true;
  try {
    /* clean travels with the text. saveText writes clean:false onto the
       index record, and the practice page reads it back -- without
       that, cleanup on the display path would quietly undo the answer
       the user just gave here. */
    const item = await saveText({ title: title || "Untitled", raw, clean: cleanChoice });
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
    shownValue = null;
    clearPending();
    resetOcr();
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
      <h3 class="saved-item__title">${htmlEscape(it.title)}<span class="muted">${(it.bytes / 1024).toFixed(1)} KB</span>${it.forLesson ? '<span class="saved-item__pin">★ pinned as lesson</span>' : ''}${it.sample ? '<span class="saved-item__sample">sample</span>' : ''}</h3>${
        it.sample ? '\n      <p class="saved-item__note">A sample so you can try this out — pick any segment, or delete it and it stays gone.</p>' : ""
      }
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
      const isSample = (listSaved().find((x) => x.id === b.dataset.id) || {}).sample;
      const ok = await confirmModal({
        title: isSample ? "Delete the sample text?" : "Delete this text?",
        message: isSample
          ? "It will not come back. You can always upload or paste your own."
          : "The saved text will be removed from this device.",
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
  // Seeds only into an empty list, and only until the user deletes it.
  try { await ensureSample(); } catch {}
  render();
  openFromHash();
})();
