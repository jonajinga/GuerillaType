/* Custom-text page boot. File picker, drag-drop, paste, save, list, and
   the per-text segment picker.

   Supports .txt / .md / .epub / .pdf via the lazy-loading parser. Whole
   books are the expected case: the bodies go to IndexedDB, so a
   600-page PDF is imported in full instead of being cut off at the old
   512k-character localStorage ceiling. */

import {
  saveText, listSaved, deleteSaved, togglePinAsLesson,
  getSegments, segCountOf, migrateInlineToIdb, ocrNoiseReport,
  getChapters, chapCountOf, renameSaved,
} from "../engine/custom-text.js";
import { ensureSample } from "../engine/custom-sample.js";
import { parseFile } from "../engine/import-parsers.js";
import { PARAS_PER_PAGE } from "../engine/chapter-detect.js";
import { bookStructureSig, customBookSlug } from "../engine/book-structure.js";
import { getActive } from "../profiles.js";
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
const chapterNotice = $("#chapter-notice");

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
/* The chapter divisions the parser found, held from the import until
   the save. An EPUB knows its own chapters and they are better than
   anything detection can recover from the joined text, so they travel
   with the file rather than being re-derived.

   Dropped the moment the text in the box is edited by hand: chapter
   boundaries are offsets into the text that was parsed, and the text
   that is about to be saved is no longer that text. saveText() then
   detects from what is actually saved. */
let pendingChapters = null;
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
  pendingChapters = null;
  setChapterNotice(null);
}

/* What the import found, in the user's words, before anything is
   saved. Both outcomes are worth saying: "12 chapters" tells them the
   chapter view is worth using, and finding none tells them why the
   chapter view will look like one long text instead of leaving them to
   guess. */
function setChapterNotice(chapters) {
  if (!chapterNotice) return;
  const n = Array.isArray(chapters) ? chapters.length : 0;
  if (!n) {
    chapterNotice.textContent = "";
    chapterNotice.hidden = true;
    delete chapterNotice.dataset.chapters;
    return;
  }
  chapterNotice.textContent = n > 1
    ? `Found ${nf.format(n)} chapters. You can read this by chapter as well as by segment.`
    : "No headings found: the chapter view will read the whole text six paragraphs at a time.";
  chapterNotice.dataset.chapters = String(n);
  chapterNotice.hidden = false;
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
  // The parsed chapters described the parsed text; this is no longer it.
  if (pendingChapters) { pendingChapters = null; setChapterNotice(null); }
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
    const { title, text, chapters } = await parseFile(f, (done, total, unit) => {
      toast(`Reading ${unit} ${nf.format(done)} of ${nf.format(total)}…`);
    });
    pendingChapters = Array.isArray(chapters) && chapters.length ? chapters : null;
    setChapterNotice(pendingChapters);
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
    const item = await saveText({
      title: title || "Untitled", raw, clean: cleanChoice,
      // Only the parser's own divisions travel here. When they were
      // dropped (a hand edit, a paste), saveText detects instead.
      chapters: pendingChapters,
    });
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

/* ── Chapter picker ─────────────────────────────────────────────
   The same text, read the way the library's books are read: by
   chapter, six paragraphs to a page. The reader itself is the
   practice page's book mode -- /practice/?book=custom:<id>&ch=N&page=M
   -- so this list only has to know the titles, how many pages each
   chapter makes, and how much of each has been typed.

   Progress comes from the profile's bookProgress under the same
   "custom:<id>" key the reader writes, keyed "<chapter>:<paragraphId>"
   exactly like a library book. Marks made against a DIFFERENT chapter
   structure (the text was re-imported, or its chapters were derived
   from segments and later recomputed) point at paragraphs that have
   moved, so the structure fingerprint is checked first and stale marks
   are shown as no progress rather than as wrong progress. */

const chapterPickers = new Map(); // id -> host

function chapterUrl(id, ch, page) {
  return `/practice/?book=${encodeURIComponent(customBookSlug(id))}&ch=${ch}&page=${page}`;
}

function pagesIn(chapter) {
  return Math.max(1, Math.ceil(((chapter && chapter.paragraphs) || []).length / PARAS_PER_PAGE));
}

/* The reader's saved position for one text, or null. Never trusted
   across a structure change. */
function bookProgressFor(id, chapters) {
  const prof = getActive();
  const bp = (prof && prof.bookProgress && prof.bookProgress[customBookSlug(id)]) || null;
  if (!bp) return null;
  if (chapters && bp.sig && bp.sig !== bookStructureSig(chapters)) return null;
  return bp;
}

function renderChapterPicker(id, host, chapters) {
  const bp = bookProgressFor(id, chapters) || { typed: {}, lastChapter: 0, lastPage: 0 };
  const typed = bp.typed || {};
  const totalPages = chapters.reduce((n, c) => n + pagesIn(c), 0);
  const rows = chapters.map((c, i) => {
    const paras = (c.paragraphs || []).length;
    const done = Object.keys(typed).filter((k) => k.startsWith(`${i}:`)).length;
    const pct = paras ? Math.round((Math.min(done, paras) / paras) * 100) : 0;
    const pages = pagesIn(c);
    const isCurrent = (bp.lastChapter | 0) === i;
    return `
    <li>
      <a class="seg-picker__item${isCurrent ? " is-current" : ""}" href="${chapterUrl(id, i, 0)}" data-ch="${i}">
        <span class="seg-picker__n">${nf.format(i + 1)}</span>
        <span class="seg-picker__preview">${htmlEscape(c.title || `Chapter ${i + 1}`)}
          <span class="seg-picker__meta">· ${nf.format(pages)} page${pages === 1 ? "" : "s"} · ${pct}% typed</span>
        </span>
      </a>
    </li>`;
  }).join("");
  host.innerHTML = `
    <p class="seg-picker__count">${nf.format(chapters.length)} chapter${chapters.length === 1 ? "" : "s"} · ${nf.format(totalPages)} page${totalPages === 1 ? "" : "s"} · six paragraphs a page</p>
    <ol class="seg-picker__list">${rows}</ol>`;
}

async function toggleChapters(id, host, btn) {
  const card = document.getElementById("text-" + id);
  if (!host.hidden) {
    host.hidden = true;
    if (card) card.dataset.chapterPicking = "false";
    chapterPickers.delete(id);
    if (btn) btn.textContent = "Choose chapter";
    return;
  }
  host.hidden = false;
  if (card) card.dataset.chapterPicking = "true";
  host.innerHTML = '<p class="seg-picker__count">Loading chapters…</p>';
  if (btn) btn.textContent = "Hide chapters";
  let chapters = [];
  try { chapters = await getChapters(id); } catch { chapters = []; }
  if (!chapters.length) {
    host.innerHTML = '<p class="seg-picker__count">This text could not be read back from storage. Re-import it above.</p>';
    return;
  }
  chapterPickers.set(id, host);
  renderChapterPicker(id, host, chapters);
  /* The count on the card is written when a text is imported, but a
     text imported before chapters existed only learns it here, on the
     first open (getChapters derives and stores one). Patch the label in
     place -- calling render() would rebuild the list and close the
     picker that was just opened. */
  const label = card && card.querySelector(".saved-item__chapmeta");
  if (label) {
    label.textContent = ` · ${nf.format(chapters.length)} chapter${chapters.length === 1 ? "" : "s"}`;
    card.dataset.chapCount = String(chapters.length);
  }
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

/* When a text was saved. Month names, not 16/09/2026 or 9/16/2026 --
   those two strings are the same nine characters in a different order
   and mean different days, and the card is read by whoever is holding
   the phone, not by a parser. Still locale-aware: the order of day,
   month and year stays the reader's. */
const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
function savedOn(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : dateFmt.format(d);
}

/* One saved text, as HTML.

   Three bands, in the order someone reads them:

     1. WHO IT IS -- the title, on its own, wrapping like prose; then a
        meta line carrying the size and any badges. The size used to
        sit inside the <h3> as a flex sibling of the title, which at
        phone width gave "826.8" one line and "KB" the next: a measured
        value broken across lines by a layout that had no idea it was
        one. It is now one nowrap span of its own.
     2. HOW TO READ IT -- two rows, segments and chapters, that are the
        same shape as each other: a small fixed-width label, then the
        button that starts typing, then the rest. Both primaries are
        btn--primary and both start at the same x, so the eye reads the
        rows as a pair of equal choices rather than one offer and one
        afterthought.
     3. WHAT TO DO WITH IT -- pin, rename, delete. These act on the
        whole text, not on either way of reading it, and they used to
        be tacked onto the end of the segment row where they wrapped
        under it and looked like more segment controls. */
function savedItemHtml(it) {
  const count = segCountOf(it);
  const seg = Math.min(it.lastSeg | 0, Math.max(0, count - 1));
  const resuming = (it.lastSeg | 0) > 0 && count > 1;
  /* Where the chapter reader left off. Read straight from the
     profile, so it survives a refresh and agrees with what the
     practice page wrote. Null until the text has been read once by
     chapter, which is why "Resume" only appears then. */
  const bp = bookProgressFor(it.id, null);
  const chCount = chapCountOf(it);
  const resumeCh = bp ? (bp.lastChapter | 0) : 0;
  const resumePage = bp ? (bp.lastPage | 0) : 0;
  const title = htmlEscape(it.title);
  const at = `chapter ${nf.format(resumeCh + 1)}, page ${nf.format(resumePage + 1)}`;
  return `
    <article class="saved-item${it.forLesson ? " is-pinned" : ""}" id="text-${it.id}"${chCount ? ` data-chap-count="${chCount}"` : ""}>
      <div class="saved-item__head">
        <h3 class="saved-item__title">${title}</h3>
        <p class="saved-item__tags"><span class="saved-item__size">${(it.bytes / 1024).toFixed(1)} KB</span>${
        it.forLesson ? '<span class="saved-item__pin">Pinned as lesson</span>' : ""
      }${it.sample ? '<span class="saved-item__sample">Sample</span>' : ""}</p>
      </div>
      <div class="saved-item__rename" id="rename-${it.id}" hidden>
        <label class="visually-hidden" for="rename-field-${it.id}">New title for ${title}</label>
        <input class="saved-item__renamefield" id="rename-field-${it.id}" type="text" maxlength="80" value="${title}" data-id="${it.id}" data-action="rename-field">
        <button class="btn btn--small btn--primary" type="button" data-id="${it.id}" data-action="rename-save">Save</button>
        <button class="btn btn--small" type="button" data-id="${it.id}" data-action="rename-cancel">Cancel</button>
      </div>${
        it.sample ? '\n      <p class="saved-item__note">A sample so you can try this out — read it by chapter or pick any segment. Delete it and it stays gone.</p>' : ""
      }
      <span class="saved-item__meta">${nf.format(count)} segment${count === 1 ? "" : "s"}${
        resuming ? ` · resuming at ${nf.format(Math.min((it.lastSeg | 0) + 1, count))} of ${nf.format(count)}` : ""
      }<span class="saved-item__chapmeta">${chCount ? ` · ${nf.format(chCount)} chapter${chCount === 1 ? "" : "s"}` : ""}</span>${
        bp ? ` · reading ${at}` : ""
      } · Saved ${savedOn(it.createdAt)}</span>
      <div class="saved-item__actions saved-item__actions--segment">
        <span class="saved-item__how">Segments</span>
        <div class="saved-item__ways">
          <a class="btn btn--small btn--primary" aria-label="${resuming ? "Resume" : "Type"} by segment" href="${practiceUrl(it.id, seg)}">${resuming ? "Resume" : "Type"}</a>${
        resuming ? `\n          <a class="btn btn--small" aria-label="Start over by segment" href="${practiceUrl(it.id, 0)}">Start over</a>` : ""
      }${
        count > 1 ? `\n          <button class="btn btn--small" data-id="${it.id}" data-action="segments">Choose segment</button>` : ""
      }
        </div>
      </div>
      <div class="saved-item__actions saved-item__actions--chapter">
        <span class="saved-item__how">Chapters</span>
        <div class="saved-item__ways">${
        bp
          ? `\n          <a class="btn btn--small btn--primary" data-action="chapter-resume" aria-label="Resume at ${at}" href="${chapterUrl(it.id, resumeCh, resumePage)}">Resume</a>` +
            `\n          <a class="btn btn--small" data-action="chapter-start" aria-label="Start over by chapter" href="${chapterUrl(it.id, 0, 0)}">Start over</a>`
          : `\n          <a class="btn btn--small btn--primary" data-action="chapter-start" aria-label="Type by chapter" href="${chapterUrl(it.id, 0, 0)}">Type</a>`
      }
          <button class="btn btn--small" data-id="${it.id}" data-action="chapters">Choose chapter</button>${
        /* This browser had no database to keep the chapter structure in
           and the text was too long to carry it in the index record, so
           what the picker shows is derived from the segments: one long
           chapter, not the document's own. Say it here rather than let
           the list quietly disagree with the file. */
        it.chaptersUnavailable
          ? `\n          <span class="saved-item__hint" data-hint="chapters-unavailable">This browser has no database for the site, so a text this long could not keep its chapters — the chapter view reads it as one text.</span>`
          : ""
      }
        </div>
      </div>
      <div class="saved-item__manage">
        <button class="btn btn--small" data-id="${it.id}" data-action="pin">${it.forLesson ? "Unpin" : "Save as lesson"}</button>
        <button class="btn btn--small" data-id="${it.id}" data-action="rename">Rename</button>
        <button class="btn btn--small" data-id="${it.id}" data-action="delete">Delete</button>
      </div>
      <div class="seg-picker" id="pick-${it.id}" hidden></div>
      <div class="seg-picker" id="chapters-${it.id}" hidden></div>
    </article>
  `;
}

function render() {
  const saved = listSaved();
  if (!saved.length) {
    list.innerHTML = '<div class="stats-empty">No saved texts yet.</div>';
    return;
  }
  list.innerHTML = saved.map(savedItemHtml).join("");
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
  list.querySelectorAll('[data-action="chapters"]').forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.dataset.id;
      toggleChapters(id, document.getElementById("chapters-" + id), b);
    });
  });

  /* Rename, inline.

     window.prompt() would have been three lines. It is also modal to
     the whole browser, is blocked outright in some embedded contexts,
     cannot be styled to match either theme, and gives a screen-reader
     user a dialog with no relationship to the card it came from. An
     input that lives in the card can be reached by Tab, is labelled by
     the title it is about to replace, and takes Enter and Escape --
     which is what someone renaming a file expects of any text field.

     openRename() re-reads the stored title rather than scraping the
     <h3>: the heading is escaped HTML and the record is the truth. */
  function openRename(id) {
    const box = document.getElementById("rename-" + id);
    const field = box && box.querySelector('[data-action="rename-field"]');
    if (!box || !field) return;
    const rec = listSaved().find((x) => x.id === id);
    field.value = rec ? rec.title : field.value;
    box.hidden = false;
    field.focus();
    field.select();
  }
  function closeRename(id, focusBack) {
    const box = document.getElementById("rename-" + id);
    if (box) box.hidden = true;
    if (focusBack) {
      const btn = list.querySelector(`[data-action="rename"][data-id="${CSS.escape(id)}"]`);
      if (btn) btn.focus();
    }
  }
  function commitRename(id) {
    const box = document.getElementById("rename-" + id);
    const field = box && box.querySelector('[data-action="rename-field"]');
    if (!field) return;
    const before = (listSaved().find((x) => x.id === id) || {}).title;
    const rec = renameSaved(id, field.value);
    // Blank or whitespace-only: leave the title alone and say nothing
    // was changed, rather than silently saving "" or "Untitled".
    if (!rec) {
      toast("A title cannot be empty", "bad");
      field.focus();
      return;
    }
    closeRename(id, false);
    toast(rec.title === before ? "Title unchanged" : `Renamed to "${rec.title}"`);
    /* A full re-render is right here even though it closes an open
       picker: the title appears in the card heading, in the rename
       field's own label and in the confirm dialog, and patching three
       places by hand is how one of them goes stale. */
    render();
  }
  list.querySelectorAll('[data-action="rename"]').forEach((b) => {
    b.addEventListener("click", () => openRename(b.dataset.id));
  });
  list.querySelectorAll('[data-action="rename-save"]').forEach((b) => {
    b.addEventListener("click", () => commitRename(b.dataset.id));
  });
  list.querySelectorAll('[data-action="rename-cancel"]').forEach((b) => {
    b.addEventListener("click", () => closeRename(b.dataset.id, true));
  });
  list.querySelectorAll('[data-action="rename-field"]').forEach((f) => {
    f.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commitRename(f.dataset.id); }
      else if (e.key === "Escape") { e.preventDefault(); closeRename(f.dataset.id, true); }
    });
  });
}

/* The results screen links back here as /custom/#pick-<id> so "choose a
   segment" is one click from finishing one, and as /custom/#chapters-<id>
   from the chapter reader's "Back to chapter list". */
function openFromHash() {
  const hash = location.hash || "";
  const seg = hash.match(/^#pick-(.+)$/);
  const chap = hash.match(/^#chapters-(.+)$/);
  const m = seg || chap;
  if (!m) return;
  const id = decodeURIComponent(m[1]);
  const host = document.getElementById((seg ? "pick-" : "chapters-") + id);
  const btn = list.querySelector(`[data-action="${seg ? "segments" : "chapters"}"][data-id="${CSS.escape(id)}"]`);
  const card = document.getElementById("text-" + id);
  if (!host || !btn) return;
  if (seg) togglePicker(id, host, btn);
  else toggleChapters(id, host, btn);
  if (card) card.scrollIntoView({ block: "start" });
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
