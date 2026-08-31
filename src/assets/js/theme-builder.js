/* Theme builder. Eight color inputs map to the highest-impact CSS
   custom properties; tokens are applied live to <html> via inline
   style so the user sees changes everywhere immediately. Saved
   themes live in profile.preferences.customThemes[]. The current
   selection (custom or preset) lives in profile.preferences.theme.

   Contrast warning fires when --fg-0 against --bg-0 falls below 4.5:1
   (WCAG AA for normal text). The warning is informational; users can
   still save a low-contrast theme if they want it. */

import { getActive, updateActive } from "./profiles.js";
import { toast } from "./util/dom.js";

const TOKENS = ["--bg-0", "--bg-1", "--bg-2", "--fg-0", "--fg-2", "--accent", "--good", "--bad"];
const ROOT = document.documentElement;

const builder = document.getElementById("theme-builder");
if (builder) {
  const inputs = Array.from(builder.querySelectorAll("input[data-token]"));
  const warn = document.getElementById("theme-builder-warn");
  const nameEl = document.getElementById("theme-builder-name");
  const saveBtn = document.getElementById("theme-builder-save");
  const resetBtn = document.getElementById("theme-builder-reset");
  const exportBtn = document.getElementById("theme-builder-export");
  const pasteEl = document.getElementById("theme-builder-paste");
  const importBtn = document.getElementById("theme-builder-import");
  const savedHost = document.getElementById("theme-builder-saved");
  const savedList = document.getElementById("theme-builder-saved-list");

  // Pull initial values from the live computed style so the inputs
  // start synced with whatever theme is currently active.
  function syncInputsFromComputed() {
    const cs = getComputedStyle(ROOT);
    inputs.forEach((input) => {
      const v = (cs.getPropertyValue(input.dataset.token) || "").trim();
      if (v && v.startsWith("#")) input.value = normalizeHex(v);
    });
  }
  function normalizeHex(v) {
    if (v.length === 4) return "#" + v.slice(1).split("").map((c) => c + c).join("");
    if (v.length === 7) return v;
    return v;
  }

  /* ── Apply tokens live to <html> ─────────────────────────────── */
  function apply() {
    inputs.forEach((input) => {
      ROOT.style.setProperty(input.dataset.token, input.value);
    });
    checkContrast();
  }

  /* ── WCAG 2.0 contrast ratio (sRGB relative luminance). ──────── */
  function ratio(hexA, hexB) {
    const L = (hex) => {
      const c = hex.replace("#", "");
      const n = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
      const [r, g, b] = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)].map((p) => parseInt(p, 16) / 255);
      const lin = (v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const la = L(hexA), lb = L(hexB);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function checkContrast() {
    const fg = inputs.find((i) => i.dataset.token === "--fg-0").value;
    const bg = inputs.find((i) => i.dataset.token === "--bg-0").value;
    const r = ratio(fg, bg);
    if (r < 4.5) {
      warn.hidden = false;
      warn.textContent = `Contrast ${r.toFixed(1)}:1 -- fails WCAG AA for body text (needs ≥ 4.5:1). The text might be hard to read.`;
    } else {
      warn.hidden = true;
    }
  }

  /* ── Save / load custom themes ──────────────────────────────── */
  function getCustomThemes() {
    const p = getActive();
    return (p.preferences && p.preferences.customThemes) || [];
  }
  function renderSavedList() {
    const themes = getCustomThemes();
    if (!themes.length) { savedHost.hidden = true; return; }
    savedHost.hidden = false;
    savedList.innerHTML = themes.map((t) => `
      <li class="theme-builder__saved-row">
        <span class="theme-builder__saved-swatches">
          ${TOKENS.slice(0, 6).map((tok) => `<span style="background:${t.tokens[tok] || "transparent"}"></span>`).join("")}
        </span>
        <span class="theme-builder__saved-name">${escapeHtml(t.name)}</span>
        <button type="button" class="btn btn--small" data-apply="${escapeAttr(t.id)}">Apply</button>
        <button type="button" class="btn btn--small btn--ghost" data-delete="${escapeAttr(t.id)}">Delete</button>
      </li>
    `).join("");
    savedList.querySelectorAll("[data-apply]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.apply)));
    savedList.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteTheme(b.dataset.delete)));
  }
  function applyTheme(id) {
    const themes = getCustomThemes();
    const t = themes.find((x) => x.id === id);
    if (!t) return;
    inputs.forEach((input) => {
      const v = t.tokens[input.dataset.token];
      if (v) input.value = v;
    });
    apply();
    updateActive((p) => {
      p.preferences = p.preferences || {};
      p.preferences.theme = "custom:" + id;
      return p;
    });
    toast(`Applied "${t.name}"`);
  }
  function deleteTheme(id) {
    if (!confirm("Delete this saved theme?")) return;
    updateActive((p) => {
      if (p.preferences && Array.isArray(p.preferences.customThemes)) {
        p.preferences.customThemes = p.preferences.customThemes.filter((t) => t.id !== id);
      }
      // Deleting the theme that is currently selected has to clear the
      // selection too, or preferences.theme points at a theme that no
      // longer exists and every page load looks it up and finds nothing.
      if (p.preferences && p.preferences.theme === "custom:" + id) p.preferences.theme = null;
      return p;
    });
    TOKENS.forEach((tok) => ROOT.style.removeProperty(tok));
    syncInputsFromComputed();
    renderSavedList();
  }

  saveBtn.addEventListener("click", () => {
    const name = (nameEl.value || "").trim() || "Untitled theme";
    const tokens = Object.fromEntries(inputs.map((i) => [i.dataset.token, i.value]));
    const id = "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
    updateActive((p) => {
      p.preferences = p.preferences || {};
      p.preferences.customThemes = p.preferences.customThemes || [];
      p.preferences.customThemes.push({ id, name, tokens });
      p.preferences.theme = "custom:" + id;
      return p;
    });
    toast(`Saved "${name}"`);
    nameEl.value = "";
    renderSavedList();
  });

  resetBtn.addEventListener("click", () => {
    // Clear inline overrides so the active preset (or default) shows again.
    TOKENS.forEach((tok) => ROOT.style.removeProperty(tok));
    // …and clear the stored selection, or main.js paints the custom
    // theme straight back on the next page load and Reset looks broken.
    updateActive((p) => {
      if (p.preferences && typeof p.preferences.theme === "string"
          && p.preferences.theme.indexOf("custom:") === 0) {
        p.preferences.theme = null;
      }
      return p;
    });
    syncInputsFromComputed();
    warn.hidden = true;
  });

  exportBtn.addEventListener("click", async () => {
    const tokens = Object.fromEntries(inputs.map((i) => [i.dataset.token, i.value]));
    const json = JSON.stringify({ name: nameEl.value || "Untitled", tokens }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      toast("Theme JSON copied to clipboard");
    } catch {
      toast("Couldn't copy to clipboard", "bad");
    }
  });

  importBtn.addEventListener("click", () => {
    const raw = (pasteEl.value || "").trim();
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (!data.tokens) throw new Error("Missing tokens object");
      inputs.forEach((input) => {
        const v = data.tokens[input.dataset.token];
        if (v) input.value = v;
      });
      if (data.name) nameEl.value = data.name;
      apply();
      pasteEl.value = "";
      toast("Theme loaded into preview. Save to keep.");
    } catch (err) {
      toast("Invalid theme JSON", "bad");
    }
  });

  inputs.forEach((input) => input.addEventListener("input", apply));

  syncInputsFromComputed();
  renderSavedList();
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;"}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
