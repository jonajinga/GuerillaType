/* Practice-page feedback modal. Two fields (topic + message) plus an
   optional email, posts directly to Web3Forms. The whole point is to
   never make the user leave their session -- the form submits via
   fetch() in the background and shows an inline success state, then
   auto-closes. Drafts autosave to localStorage so an accidental
   close or Esc doesn't lose anything. */

const ACCESS_KEY = "99e924f9-d456-4c02-9b8d-cca354b3f5f4";
const ENDPOINT = "https://api.web3forms.com/submit";
const DRAFT_KEY = "tt:feedback-draft";

let _dlg = null;

function build() {
  if (_dlg) return _dlg;
  const el = document.createElement("dialog");
  el.id = "feedback-modal";
  el.className = "info-modal info-modal--feedback";
  el.setAttribute("aria-label", "Send feedback");
  el.innerHTML = `
    <div class="info-modal__head">
      <h2 class="info-modal__title">Send feedback</h2>
      <button type="button" class="info-modal__close" aria-label="Close" data-close>×</button>
    </div>
    <div class="info-modal__body">
      <div class="feedback-modal__byline">
        <img class="feedback-modal__photo" src="/assets/img/jon-ajinga.webp" alt="Jon Ajinga" width="56" height="56" loading="lazy" decoding="async">
        <p class="feedback-modal__byline-text">Your message comes straight to me -- Jon, the developer. I appreciate every note and I read them all. Be candid; bug reports, typos, ideas, complaints all welcome.</p>
      </div>
      <form data-form>
        <input type="hidden" name="access_key" value="${ACCESS_KEY}">
        <input type="hidden" name="subject" value="GT feedback (practice)">
        <input type="hidden" name="from_name" value="guerillatype.com">
        <input type="hidden" name="contribution_kind" value="feedback">
        <input type="checkbox" name="botcheck" class="visually-hidden" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="field">
          <label class="info-modal__label" for="fb-topic">Topic</label>
          <select id="fb-topic" name="topic" class="info-modal__input" data-input>
            <option value="bug">Bug</option>
            <option value="typo">Typo</option>
            <option value="suggestion">Suggestion</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="field">
          <label class="info-modal__label" for="fb-message">Message</label>
          <textarea id="fb-message" name="message" class="info-modal__input" rows="5" minlength="4" maxlength="2000" required data-input data-counter></textarea>
          <div class="field__row">
            <span class="field__hint">What's on your mind?</span>
            <span class="field__counter" data-counter-display><span data-counter-current>0</span> / 2000</span>
          </div>
        </div>
        <div class="field">
          <label class="info-modal__label" for="fb-email">Email <span class="info-modal__optional">(optional)</span></label>
          <input id="fb-email" name="email" type="email" class="info-modal__input" maxlength="200" placeholder="you@example.com" autocomplete="email" data-input>
          <span class="field__hint">Only if you want a reply.</span>
        </div>
        <p class="feedback-modal__status" data-status aria-live="polite"></p>
        <div class="info-modal__actions">
          <button type="button" class="btn" data-cancel>Cancel</button>
          <button type="submit" class="btn btn--primary" data-submit>Send</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(el);

  const form = el.querySelector("[data-form]");
  const status = el.querySelector("[data-status]");
  const submit = el.querySelector("[data-submit]");
  const ta = el.querySelector("textarea");
  const counterCur = el.querySelector("[data-counter-current]");
  const counterDisplay = el.querySelector("[data-counter-display]");

  function snapshot() {
    const data = {};
    el.querySelectorAll("[data-input]").forEach((i) => { data[i.name] = i.value; });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {}
  }
  function restore() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      el.querySelectorAll("[data-input]").forEach((i) => { if (data[i.name]) i.value = data[i.name]; });
      updateCounter();
    } catch {}
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }
  function updateCounter() {
    if (!counterCur) return;
    const n = ta.value.length;
    counterCur.textContent = String(n);
    if (counterDisplay) counterDisplay.dataset.warn = n > 1800 ? "true" : "false";
  }

  let saveTimer = null;
  form.addEventListener("input", () => {
    updateCounter();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(snapshot, 400);
  });

  el.querySelector("[data-close]").addEventListener("click", () => el.close());
  el.querySelector("[data-cancel]").addEventListener("click", () => el.close());
  el.addEventListener("click", (e) => { if (e.target === el) el.close(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.botcheck && form.botcheck.checked) return; // honeypot
    submit.disabled = true;
    submit.dataset.originalLabel = submit.textContent;
    submit.textContent = "Sending...";
    status.textContent = "";
    status.dataset.tone = "";
    try {
      const fd = new FormData(form);
      const res = await fetch(ENDPOINT, {
        method: "POST",
        body: fd,
        headers: { "Accept": "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || (json && json.success === false)) throw new Error(json.message || "Network error");
      // Success.
      clearDraft();
      status.textContent = "Sent. Thank you.";
      status.dataset.tone = "good";
      form.reset();
      updateCounter();
      setTimeout(() => {
        if (el.open) el.close();
        status.textContent = "";
        submit.disabled = false;
        submit.textContent = submit.dataset.originalLabel || "Send";
      }, 1400);
    } catch (err) {
      status.textContent = "Could not send. Check your connection or try the contact page.";
      status.dataset.tone = "bad";
      submit.disabled = false;
      submit.textContent = submit.dataset.originalLabel || "Send";
    }
  });

  // Restore any existing draft on first build.
  restore();

  _dlg = el;
  return el;
}

window.openFeedbackModal = function () {
  const el = build();
  if (!el.open) el.showModal();
  // Focus the textarea so the user can type immediately.
  setTimeout(() => {
    const ta = el.querySelector("textarea");
    if (ta) ta.focus();
  }, 30);
};
