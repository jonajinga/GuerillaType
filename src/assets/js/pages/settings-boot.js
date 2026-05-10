/* Settings page boot. Profile CRUD, preferences, danger zone. */

import { getProfiles, getActive, getActiveId, setActiveId, addProfile, renameProfile, deleteProfile, exportJson, importJson, updateActive } from "../profiles.js";
import { quotaUsed, KEY_PROFILES, KEY_ACTIVE, KEY_SETTINGS, KEY_CUSTOM, KEY_META, remove } from "../storage.js";
import { $, toast } from "../util/dom.js";
import { confirmModal, promptModal } from "../util/modal.js";
import "../theme-builder.js";

function syncProfileSelect() {
  const sel = $("#profile-select");
  const ps = getProfiles();
  const active = getActiveId();
  sel.innerHTML = ps.map((p) => `<option value="${p.id}"${p.id === active ? " selected" : ""}>${p.name}</option>`).join("");
}

$("#profile-select").addEventListener("change", (e) => { setActiveId(e.target.value); window.location.reload(); });
$("#profile-add").addEventListener("click", async () => {
  const name = await promptModal({
    title: "New profile",
    label: "Profile name",
    initial: "New profile",
    placeholder: "e.g. Workout deck",
    confirmLabel: "Create",
  });
  if (!name) return;
  addProfile(name.trim());
  window.location.reload();
});
$("#profile-rename").addEventListener("click", async () => {
  const id = getActiveId();
  const cur = getActive();
  const name = await promptModal({
    title: "Rename profile",
    label: "New name",
    initial: cur.name,
    confirmLabel: "Rename",
  });
  if (!name) return;
  renameProfile(id, name.trim());
  syncProfileSelect();
});
$("#profile-delete").addEventListener("click", async () => {
  const ok = await confirmModal({
    title: "Delete this profile?",
    message: "All sessions, achievements, and per-key data on this profile will be removed. This cannot be undone.",
    confirmLabel: "Delete profile",
    danger: true,
  });
  if (!ok) return;
  deleteProfile(getActiveId());
  window.location.reload();
});
$("#profile-export").addEventListener("click", () => exportJson());
$("#profile-import").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { await importJson(f); toast("Imported. Reloading…"); setTimeout(() => location.reload(), 800); }
  catch (err) { toast(err.message || "Import failed", "bad"); }
});

// Practice settings
const setLang = $("#set-language");
const setLayout = $("#set-layout");
const setCaret = $("#set-caret");
const setFreedom = $("#set-freedom");
const setLiveWpm = $("#set-live-wpm");
const setSmoothCaret = $("#set-smooth-caret");

function syncSettings() {
  const p = getActive();
  setLang.value = p.settings.language;
  setLayout.value = p.settings.layout;
  setCaret.value = p.settings.caret || "line";
  setFreedom.checked = p.settings.freedom !== false;
  setLiveWpm.checked = p.settings.showLiveWPM !== false;
  setSmoothCaret.checked = p.settings.smoothCaret !== false;
}
function bindSetting(el, key, parse = (v) => v) {
  el.addEventListener("change", () => updateActive((p) => { p.settings[key] = parse(el.type === "checkbox" ? el.checked : el.value); return p; }));
}
bindSetting(setLang, "language");
bindSetting(setLayout, "layout");
bindSetting(setCaret, "caret");
bindSetting(setFreedom, "freedom");
bindSetting(setLiveWpm, "showLiveWPM");
bindSetting(setSmoothCaret, "smoothCaret");

/* v2 preferences — same pattern as settings, but lives in
   profile.preferences instead of profile.settings. Mirrored to the
   #pref-<key> inputs from the new "Typing assists" / "Visual aids" /
   "Reporting cadence" / "Sound" sections. */
const PREF_BOOLS = [
  "stopOnError", "forgiveErrors", "spaceSkipsWords",
  "ignoreCapitalization", "skipPunctuation",
  "showVirtualKeyboard", "keyboardFingerColors",
  "mobileKeyboard",
  "showTicker", "hideUI", "hideToolbar", "autoScroll",
];
const PREF_SELECTS = ["whitespaceMark", "reportFrequency", "soundTheme", "typingFont"];

function syncPreferences() {
  const p = getActive();
  const prefs = p.preferences || {};
  PREF_BOOLS.forEach((k) => {
    const el = document.getElementById(`pref-${k}`);
    if (el) el.checked = !!prefs[k];
  });
  PREF_SELECTS.forEach((k) => {
    const el = document.getElementById(`pref-${k}`);
    if (el && prefs[k]) el.value = prefs[k];
  });
  const vol = document.getElementById("pref-soundVolume");
  if (vol) vol.value = Math.round((prefs.soundVolume || 0.5) * 100);
}
function bindPreference(el, key, parse = (v) => v) {
  if (!el) return;
  el.addEventListener("change", () => updateActive((p) => {
    p.preferences = p.preferences || {};
    p.preferences[key] = parse(el.type === "checkbox" ? el.checked : el.value);
    return p;
  }));
}
PREF_BOOLS.forEach((k) => bindPreference(document.getElementById(`pref-${k}`), k));
PREF_SELECTS.forEach((k) => bindPreference(document.getElementById(`pref-${k}`), k));
bindPreference(document.getElementById("pref-soundVolume"), "soundVolume", (v) => parseInt(v, 10) / 100);
syncPreferences();

// Theme preset — persists separately from the light/dark toggle and
// applies live so the user can preview changes.
const themePreset = document.getElementById("pref-themePreset");
const themePresetCurrent = (getActive().preferences || {}).themePreset || "";
if (themePreset) {
  themePreset.value = themePresetCurrent;
  if (themePresetCurrent) document.documentElement.setAttribute("data-theme", themePresetCurrent);
  themePreset.addEventListener("change", () => {
    const v = themePreset.value;
    updateActive((p) => {
      p.preferences = p.preferences || {};
      p.preferences.themePreset = v;
      return p;
    });
    if (v) {
      document.documentElement.setAttribute("data-theme", v);
      try { localStorage.setItem("tt:theme", v); } catch {}
    } else {
      // Revert to the saved light/dark toggle.
      const sys = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", sys);
      try { localStorage.removeItem("tt:theme"); } catch {}
    }
  });
}

// Typing-font preview: apply immediately so the user sees the change
// in the typing surface (visible on /practice/). When this page is
// loaded inside the settings modal iframe, also postMessage the new
// value up to the parent so the surrounding page's <html> attribute
// is updated too -- otherwise the font change only applies inside
// the iframe and the user sees nothing change behind the modal.
const isEmbedded = location.search.indexOf("embed=1") !== -1;
function broadcastPref(name, value) {
  if (!isEmbedded) return;
  try { window.parent.postMessage({ type: "tt:pref", name, value }, location.origin); } catch {}
}
const fontPicker = document.getElementById("pref-typingFont");
if (fontPicker) {
  fontPicker.addEventListener("change", () => {
    const v = fontPicker.value || "jetbrains-mono";
    if (v === "jetbrains-mono") document.documentElement.removeAttribute("data-typing-font");
    else document.documentElement.setAttribute("data-typing-font", v);
    broadcastPref("typingFont", v);
  });
}
// Theme preset: same pattern. When the user picks a preset inside
// the modal iframe, both iframe and parent update.
const themePicker = document.getElementById("pref-themePreset");
if (themePicker) {
  themePicker.addEventListener("change", () => {
    const v = themePicker.value || "";
    if (v) document.documentElement.setAttribute("data-theme", v);
    else document.documentElement.removeAttribute("data-theme");
    broadcastPref("themePreset", v);
  });
}

// Quota hint + visual bar (5 MB cap is the typical localStorage origin floor).
const hint = $("#quota-hint");
const fill = $("#quota-fill");
const used = quotaUsed();
const cap = 5 * 1024 * 1024;
const pct = Math.min(100, (used / cap) * 100);
const usedKb = (used / 1024).toFixed(1);
hint.textContent = `${usedKb} KB used · ${pct.toFixed(2)}% of ~5 MB cap`;
if (fill) fill.style.width = Math.max(1.5, pct) + "%";

// Danger zone
$("#reset-model").addEventListener("click", async () => {
  const ok = await confirmModal({
    title: "Reset adaptive model?",
    message: "Clears the per-key, bigram, finger, and character data. Your sessions, achievements, and bests stay.",
    confirmLabel: "Reset model",
    danger: true,
  });
  if (!ok) return;
  updateActive((p) => {
    p.perKey = {}; p.perBigram = {};
    p.perFinger = {}; p.perCharDetail = {};
    return p;
  });
  toast("Model reset.");
});
$("#reset-all").addEventListener("click", async () => {
  const ok = await confirmModal({
    title: "Wipe all data on this device?",
    message: "Every profile, session, achievement, and saved text will be erased. This cannot be undone.",
    confirmLabel: "Wipe everything",
    danger: true,
  });
  if (!ok) return;
  remove(KEY_PROFILES); remove(KEY_ACTIVE); remove(KEY_SETTINGS); remove(KEY_CUSTOM); remove(KEY_META);
  location.reload();
});

syncProfileSelect();
syncSettings();
