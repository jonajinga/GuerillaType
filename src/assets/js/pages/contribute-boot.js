/* Contribute-form bootstrap. Three jobs:
     1. Live char counters on every textarea[data-counter].
     2. Draft autosave per-kind (key tt:contribute-draft-<kind>) so a
        half-filled form survives an accidental refresh. Cleared on
        submit (the thank-you page also clears it as a belt + braces).
     3. URL-param prefill: every form reads ?title= ?author= ?text=
        ?source= ?meaning= and pre-populates matching fields, so
        per-corpus "Suggest similar" CTAs can deep-link with context.
   The form still works without JS -- this is progressive enhancement. */

const form = document.querySelector(".contribute-form[data-contribute-kind]");
if (form) {
  const kind = form.dataset.contributeKind;
  const draftKey = `tt:contribute-draft-${kind}`;
  const params = new URLSearchParams(location.search);

  /* ── URL-param prefill (run BEFORE draft restore so explicit deep
     links override stale drafts when both are present). ────────── */
  const PREFILL_MAP = {
    "title": ["title", "quote_title", "poem_title", "drill_title", "book_title", "parable_title"],
    "author": ["author", "quote_author", "poem_author", "book_author"],
    "year": ["year", "quote_year", "poem_year", "book_year"],
    "source": ["source", "source_url"],
    "text": ["text", "quote_text", "poem_text", "parable_text", "idiom_text"],
    "meaning": ["meaning", "idiom_meaning"],
  };
  let didPrefill = false;
  for (const [param, candidates] of Object.entries(PREFILL_MAP)) {
    const v = params.get(param);
    if (!v) continue;
    for (const name of candidates) {
      const el = form.querySelector(`[name="${name}"]`);
      if (el && !el.value) { el.value = v; didPrefill = true; break; }
    }
  }

  /* ── Draft restore. Skip when we just URL-prefilled to avoid
     stomping over an explicit deep link. ─────────────────────── */
  if (!didPrefill) {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const data = JSON.parse(raw);
        for (const [name, value] of Object.entries(data || {})) {
          const el = form.querySelector(`[name="${name}"]`);
          if (!el) continue;
          if (el.type === "checkbox") el.checked = !!value;
          else if (el.type === "radio") {
            const match = form.querySelector(`[name="${name}"][value="${value}"]`);
            if (match) match.checked = true;
          }
          else el.value = value;
        }
      }
    } catch {}
  }

  /* ── Draft autosave. Persist on every input so a refresh restores. ── */
  function snapshot() {
    const data = {};
    form.querySelectorAll("[name]").forEach((el) => {
      if (!el.name || el.name === "access_key" || el.name === "redirect"
          || el.name === "subject" || el.name === "from_name"
          || el.name === "contribution_kind" || el.name === "botcheck") return;
      if (el.type === "checkbox") data[el.name] = el.checked;
      else if (el.type === "radio") { if (el.checked) data[el.name] = el.value; }
      else data[el.name] = el.value;
    });
    try { localStorage.setItem(draftKey, JSON.stringify(data)); } catch {}
  }
  let saveTimer = null;
  form.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(snapshot, 400);
  });

  /* ── Live char counters for textarea[data-counter]. ──────────── */
  form.querySelectorAll("textarea[data-counter]").forEach((ta) => {
    const wrap = ta.parentElement;
    const cur = wrap.querySelector("[data-counter-current]");
    const display = wrap.querySelector("[data-counter-display]");
    const max = parseInt(ta.getAttribute("maxlength"), 10) || 0;
    const update = () => {
      const n = ta.value.length;
      if (cur) cur.textContent = String(n);
      if (display && max) {
        const warn = max && n > max * 0.9;
        display.dataset.warn = warn ? "true" : "false";
      }
    };
    ta.addEventListener("input", update);
    update();
  });

  /* ── On submit, clear the draft so the thank-you page (or a manual
     return to the form) starts clean. ──────────────────────────── */
  form.addEventListener("submit", () => {
    try { localStorage.removeItem(draftKey); } catch {}
    const btn = form.querySelector("[data-submit-btn]");
    if (btn) {
      btn.disabled = true;
      btn.dataset.originalLabel = btn.textContent;
      btn.textContent = "Sending…";
    }
  });
}
