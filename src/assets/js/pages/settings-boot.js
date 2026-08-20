/* Settings page boot. Profile CRUD, preferences, danger zone. */

import { getProfiles, getActive, getActiveId, setActiveId, addProfile, renameProfile, deleteProfile, exportJson, importJson, updateActive } from "../profiles.js";
import { quotaUsed, clearAllAppData } from "../storage.js";
import { beginLogin, getMe, logout as apiLogout, logoutAll as apiLogoutAll } from "../net/api.js";
import { readSession, writeSession, clearSession, isWithinGrace } from "../auth/session.js";
import { $, toast } from "../util/dom.js";
import { confirmModal, promptModal } from "../util/modal.js";
import { Analytics } from "../analytics.js";
import "../theme-builder.js";

Analytics.settingsViewed({});

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
$("#profile-export").addEventListener("click", () => { Analytics.statsExported({ source: "settings" }); exportJson(); });
$("#profile-import").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { await importJson(f); Analytics.statsImported({ source: "settings" }); toast("Imported. Reloading…"); setTimeout(() => location.reload(), 800); }
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
  el.addEventListener("change", () => {
    const val = parse(el.type === "checkbox" ? el.checked : el.value);
    updateActive((p) => { p.settings[key] = val; return p; });
    if (key === "layout") Analytics.layoutChanged({ layout: val });
    else if (key === "caret") Analytics.caretStyleChanged({ caret: val });
    else Analytics.prefToggled({ key, value: val });
  });
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
  // Preferences that default to ON instead of OFF when undefined.
  // Each is true unless explicitly set to false in the profile.
  const DEFAULT_ON = new Set(["mobileKeyboard", "autoScroll"]);
  PREF_BOOLS.forEach((k) => {
    const el = document.getElementById(`pref-${k}`);
    if (!el) return;
    if (DEFAULT_ON.has(k)) {
      el.checked = prefs[k] !== false;
    } else {
      el.checked = !!prefs[k];
    }
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
  // Mobile Safari/Chrome sometimes skip "change" on toggle-styled
  // checkboxes (the label wraps the box; tap registers on the
  // label, not the input). Listen on change + input + click so
  // every reasonable interaction path saves the preference.
  const save = () => {
    const val = parse(el.type === "checkbox" ? el.checked : el.value);
    updateActive((p) => {
      p.preferences = p.preferences || {};
      p.preferences[key] = val;
      return p;
    });
    if (key === "typingFont") Analytics.fontChanged({ font: val });
    else Analytics.prefToggled({ key, value: val });
  };
  el.addEventListener("change", save);
  el.addEventListener("input", save);
  // For checkboxes, also catch the click on the wrapping label so
  // we save even if the synthetic change/input is suppressed.
  if (el.type === "checkbox") {
    const wrap = el.closest("label");
    if (wrap) {
      wrap.addEventListener("click", () => {
        // Defer one tick so the checkbox's checked state has
        // updated before we read it.
        setTimeout(save, 0);
      });
    }
  }
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
    Analytics.themeChanged({ theme: v || "system" });
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
  // Removing five named keys left tt:theme, ~500 tt:lesson-best-*,
  // collections, drafts and flags behind -- so a "wiped" browser still
  // showed mastered lessons and could re-unlock lesson achievements.
  clearAllAppData();
  location.reload();
});

syncProfileSelect();
syncSettings();

/* ---------------------------------------------------------------
   Account panel.

   Sign-in is OPTIONAL here and always will be -- anonymous typing is the
   full product, not a trial. So this panel never blocks anything; it just
   reflects state and offers the upgrade.
   --------------------------------------------------------------- */
{
  const card = $("#account-card");
  if (card) {
    const signedOut = $("#account-signed-out");
    const signedIn = $("#account-signed-in");
    const errBox = $("#account-error");

    const paint = (session) => {
      const on = !!(session && session.user);
      signedIn.hidden = !on;
      signedOut.hidden = on;
      if (on) {
        $("#account-handle").textContent = session.user.handle || "";
        $("#account-email").textContent = session.user.email || "";
        // Be honest when we're running on a cached session rather than a
        // freshly confirmed one.
        const offline = $("#account-offline");
        if (!isWithinGrace(session)) {
          offline.hidden = false;
          offline.textContent = "Couldn't reach the server to confirm your session.";
        } else {
          offline.hidden = true;
        }
      }
    };

    /* The Worker bounces failures back as ?auth_error=<reason> rather than
       rendering its own error page, so the message lands in the app's
       voice and on the page the user was already on. */
    const params = new URLSearchParams(location.search);
    const authError = params.get("auth_error");
    if (authError) {
      errBox.hidden = false;
      errBox.textContent = ({
        email_unverified: "That account's email address isn't verified. Verify it with your provider, then try again.",
        expired_state: "That sign-in link timed out. Please try again.",
        state_mismatch: "Something went wrong with that sign-in. Please try again.",
        missing_code: "The provider didn't complete sign-in. Please try again.",
      })[authError] || "Sign-in didn't complete. Please try again.";
      // Strip it so a refresh doesn't replay the error.
      params.delete("auth_error");
      history.replaceState({}, "", location.pathname + (params.toString() ? "?" + params : ""));
    }

    paint(readSession());

    $("#signin-google").addEventListener("click", () => beginLogin("google", "/settings/"));
    $("#signin-github").addEventListener("click", () => beginLogin("github", "/settings/"));

    $("#signout").addEventListener("click", async () => {
      try { await apiLogout(); } catch { /* revoke best-effort; clear locally regardless */ }
      clearSession();
      paint(null);
      toast("Signed out. Your progress stays on this device.");
    });

    $("#signout-all").addEventListener("click", async () => {
      const ok = await confirmModal({
        title: "Sign out everywhere?",
        message: "Ends your session on every device you've signed in from. Your progress is not affected.",
        confirmLabel: "Sign out everywhere",
        danger: true,
      });
      if (!ok) return;
      try { await apiLogoutAll(); } catch { /* as above */ }
      clearSession();
      paint(null);
      toast("Signed out on all devices.");
    });

    /* Confirm the cached session against the server when we can. Runs
       after paint so it never delays the page, and a network failure is
       ignored on purpose -- that is exactly what the grace window is for. */
    (async () => {
      const cached = readSession();
      if (!cached) return;
      try {
        const me = await getMe({ quiet: true });
        writeSession(me.user, me.expiresAt);
        paint(readSession());
      } catch (e) {
        /* Only a 401 actually means "this session is no longer valid".
           A dead network, a 404 from a misconfigured API base, or a 5xx
           all mean we COULDN'T ASK -- and signing someone out because
           their server hiccuped is the worst available response. Fall
           back to the grace window, which exists for exactly this. */
        if (!e || e.status !== 401) return;
        clearSession();
        paint(null);
      }
    })();
  }
}
