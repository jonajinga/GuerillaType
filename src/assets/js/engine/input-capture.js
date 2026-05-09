/* Input capture — wraps a single hidden <input> element and emits clean
   keystroke events via callbacks. Handles IME composition, blocks paste,
   ignores ctrl/meta combos, normalizes ' ' for space. */

export function attachInput(inputEl, host, handlers) {
  let imeActive = false;
  let lastValue = "";
  // Tab+Enter restart. When the user presses
  // Tab on the typing surface, we arm a flag and show a "Press Enter
  // to restart" hint via handlers.onRestartArmed; if Enter follows
  // within 2 seconds, the test restarts. Any other keystroke disarms.
  let restartArmed = false;
  let restartTimer = null;
  function armRestart() {
    restartArmed = true;
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartArmed = false;
      handlers.onRestartDisarmed && handlers.onRestartDisarmed();
    }, 2000);
    handlers.onRestartArmed && handlers.onRestartArmed();
  }
  function disarmRestart() {
    if (!restartArmed) return;
    restartArmed = false;
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    handlers.onRestartDisarmed && handlers.onRestartDisarmed();
  }

  function focus() {
    if (document.activeElement !== inputEl) inputEl.focus({ preventScroll: true });
  }
  // Force focus when host is clicked or any non-modifier key is pressed.
  host.addEventListener("mousedown", (e) => {
    if (e.button === 0) { e.preventDefault(); focus(); }
  });
  // Mobile: mousedown synthetic events don't reliably trigger the soft
  // keyboard. iOS / Chrome Android only raise the on-screen keyboard
  // from a focus() call that happens INSIDE a user-gesture handler,
  // and "user gesture" on touch means touchend or click. Without this
  // listener, the user has to tap out of the surface and tap back in
  // before the soft keyboard appears -- the original bug. Bind both
  // to handle Safari quirks where one event sometimes does not fire.
  const focusFromTouch = (e) => {
    // Only steal focus when the tap target is the host itself or a
    // non-interactive descendant. If the user tapped a button (toolbar,
    // toggle, etc.), let that button receive its own click.
    const t = e.target;
    if (t && t.closest("button, a, input, select, textarea, [role=button]")) return;
    focus();
  };
  host.addEventListener("touchend", focusFromTouch, { passive: true });
  host.addEventListener("click", focusFromTouch);
  document.addEventListener("keydown", (e) => {
    if (e.target === inputEl) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Tab" || e.key === "Escape") return;
    // Don't yank focus away from any other form control the user is
    // currently editing -- custom duration / word-count inputs in the
    // mode bar, search boxes, the settings modal, etc. Without this
    // check, the very first keystroke into a number input gets stolen
    // by the typing surface.
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
              t.tagName === "SELECT" || t.isContentEditable)) return;
    focus();
  });

  inputEl.addEventListener("focus", () => {
    host.dataset.focused = "true";
    handlers.onFocus && handlers.onFocus();
  });
  inputEl.addEventListener("blur", () => {
    host.dataset.focused = "false";
    handlers.onBlur && handlers.onBlur();
  });

  inputEl.addEventListener("compositionstart", () => { imeActive = true; handlers.onImeStart && handlers.onImeStart(); });
  inputEl.addEventListener("compositionend", (e) => {
    imeActive = false;
    handlers.onImeEnd && handlers.onImeEnd(e.data || "");
    inputEl.value = "";
    lastValue = "";
  });

  inputEl.addEventListener("paste", (e) => {
    e.preventDefault();
    handlers.onPaste && handlers.onPaste();
  });

  // Primary keystroke channel.
  inputEl.addEventListener("keydown", (e) => {
    if (imeActive) return;
    // "?" is now scoped to non-input contexts in shortcuts.js, so it
    // passes through here as a normal printable character.
    // Backspace handled BEFORE the modifier early-return so Ctrl/Alt
    // backspace (rewind whole word) is captured properly.
    if (e.key === "Backspace") {
      e.preventDefault();
      handlers.onBackspace && handlers.onBackspace(e.ctrlKey || e.altKey || e.metaKey);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Tab arms the restart prompt; Enter while armed triggers restart.
    // Tab on its own is consumed (no native focus navigation while
    // armed) — the user can still Esc out of the typing surface for
    // keyboard-only nav, and Tab outside the input retains its normal
    // role. Two-key combo prevents accidental restart.
    if (e.key === "Tab") {
      e.preventDefault();
      armRestart();
      return;
    }
    if (e.key === "Escape") { disarmRestart(); handlers.onEscape && handlers.onEscape(); return; }
    if (e.key === "Enter") {
      if (restartArmed) {
        e.preventDefault();
        // Disarm BEFORE firing the restart so the "press Enter to
        // restart" banner clears as part of the same frame -- the
        // host's data-restart-armed attribute would otherwise carry
        // over into the fresh session.
        disarmRestart();
        handlers.onRestart && handlers.onRestart();
        return;
      }
      // Treat Enter as a logical "next" — only meaningful in some modes.
      handlers.onEnter && handlers.onEnter();
      return;
    }
    // Any other keystroke disarms the restart prompt so a stray Tab
    // doesn't linger across normal typing.
    if (restartArmed) disarmRestart();
    // Printable characters: e.key length 1 = single character; ' ' = space.
    if (e.key.length === 1) {
      e.preventDefault();
      handlers.onChar && handlers.onChar(e.key, e.timeStamp || performance.now());
    }
  });

  // Reject any insertFromPaste that escaped the paste handler.
  inputEl.addEventListener("input", (e) => {
    if (e.inputType === "insertFromPaste") {
      inputEl.value = "";
      lastValue = "";
      handlers.onPaste && handlers.onPaste();
    } else {
      // Keep the input cleared so it never accumulates content.
      lastValue = inputEl.value;
      inputEl.value = "";
    }
  });

  return { focus, isImeActive: () => imeActive };
}
