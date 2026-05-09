/* Site-styled replacements for window.confirm() and window.prompt().
   Uses native <dialog> for built-in focus trap, ESC handling, and
   backdrop, with the existing .info-modal chrome for visual parity.
   Both helpers return a Promise so call sites read like the natives:
     if (!(await confirmModal({...}))) return;
     const name = await promptModal({...});
*/

import { htmlEscape } from "./dom.js";

let _confirmEl = null;
let _promptEl = null;

function ensureConfirmEl() {
  if (_confirmEl) return _confirmEl;
  const el = document.createElement("dialog");
  el.id = "confirm-modal";
  el.className = "info-modal info-modal--confirm";
  el.setAttribute("aria-label", "Confirm");
  el.innerHTML = `
    <div class="info-modal__head">
      <h2 class="info-modal__title" data-title>Confirm</h2>
      <button type="button" class="info-modal__close" aria-label="Close" data-close>×</button>
    </div>
    <div class="info-modal__body">
      <p class="info-modal__message" data-message></p>
      <div class="info-modal__actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="button" class="btn btn--primary" data-ok>OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  _confirmEl = el;
  return el;
}

function ensurePromptEl() {
  if (_promptEl) return _promptEl;
  const el = document.createElement("dialog");
  el.id = "prompt-modal";
  el.className = "info-modal info-modal--prompt";
  el.setAttribute("aria-label", "Prompt");
  el.innerHTML = `
    <div class="info-modal__head">
      <h2 class="info-modal__title" data-title>Enter a value</h2>
      <button type="button" class="info-modal__close" aria-label="Close" data-close>×</button>
    </div>
    <div class="info-modal__body">
      <form data-form>
        <p class="info-modal__message" data-message hidden></p>
        <div class="field">
          <label class="info-modal__label" for="prompt-modal-input" data-label>Value</label>
          <input type="text" id="prompt-modal-input" class="info-modal__input" data-input maxlength="120" autocomplete="off">
        </div>
        <div class="info-modal__actions">
          <button type="button" class="btn" data-cancel>Cancel</button>
          <button type="submit" class="btn btn--primary" data-ok>Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(el);
  _promptEl = el;
  return el;
}

/* Resolve once on close. Native <dialog> dispatches a "close" event
   when the dialog is dismissed by any means (ESC, backdrop click,
   form submit, programmatic close), so we hang the resolution off
   that single event and clear it afterward. */
function awaitClose(el, getResult) {
  return new Promise((resolve) => {
    const onClose = () => {
      el.removeEventListener("close", onClose);
      resolve(getResult());
    };
    el.addEventListener("close", onClose);
  });
}

export function confirmModal({
  title = "Are you sure?",
  message = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
} = {}) {
  const el = ensureConfirmEl();
  el.querySelector("[data-title]").textContent = title;
  el.querySelector("[data-message]").textContent = message;
  const okBtn = el.querySelector("[data-ok]");
  const cancelBtn = el.querySelector("[data-cancel]");
  okBtn.textContent = confirmLabel;
  cancelBtn.textContent = cancelLabel;
  okBtn.classList.toggle("btn--danger", !!danger);
  okBtn.classList.toggle("btn--primary", !danger);

  let result = false;

  // Re-bind handlers per open so closures capture the right resolver.
  const onOk = () => { result = true; el.close(); };
  const onCancel = () => { result = false; el.close(); };
  const onBackdrop = (e) => { if (e.target === el) { result = false; el.close(); } };

  okBtn.addEventListener("click", onOk, { once: true });
  cancelBtn.addEventListener("click", onCancel, { once: true });
  el.querySelector("[data-close]").addEventListener("click", onCancel, { once: true });
  el.addEventListener("click", onBackdrop, { once: true });

  if (!el.open) el.showModal();
  // Focus the cancel button by default so an accidental Enter doesn't
  // confirm a destructive action. The user must move focus to OK.
  setTimeout(() => cancelBtn.focus(), 30);

  return awaitClose(el, () => result).finally(() => {
    // Clean up any handlers that didn't fire (e.g. ESC bypassed clicks).
    okBtn.removeEventListener("click", onOk);
    cancelBtn.removeEventListener("click", onCancel);
    el.removeEventListener("click", onBackdrop);
  });
}

export function promptModal({
  title = "Enter a value",
  label = "Value",
  message = "",
  initial = "",
  placeholder = "",
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  maxLength = 120,
} = {}) {
  const el = ensurePromptEl();
  el.querySelector("[data-title]").textContent = title;
  el.querySelector("[data-label]").textContent = label;
  const msgEl = el.querySelector("[data-message]");
  if (message) { msgEl.textContent = message; msgEl.hidden = false; }
  else { msgEl.textContent = ""; msgEl.hidden = true; }
  const input = el.querySelector("[data-input]");
  input.value = initial || "";
  input.placeholder = placeholder || "";
  input.maxLength = maxLength;
  el.querySelector("[data-ok]").textContent = confirmLabel;
  el.querySelector("[data-cancel]").textContent = cancelLabel;

  let result = null;

  const form = el.querySelector("[data-form]");
  const onSubmit = (e) => {
    e.preventDefault();
    const v = (input.value || "").trim();
    if (!v) { input.focus(); return; }
    result = v;
    el.close();
  };
  const onCancel = () => { result = null; el.close(); };
  const onBackdrop = (e) => { if (e.target === el) { result = null; el.close(); } };

  form.addEventListener("submit", onSubmit, { once: true });
  el.querySelector("[data-cancel]").addEventListener("click", onCancel, { once: true });
  el.querySelector("[data-close]").addEventListener("click", onCancel, { once: true });
  el.addEventListener("click", onBackdrop, { once: true });

  if (!el.open) el.showModal();
  setTimeout(() => { input.focus(); input.select(); }, 30);

  return awaitClose(el, () => result).finally(() => {
    form.removeEventListener("submit", onSubmit);
    el.removeEventListener("click", onBackdrop);
  });
}
