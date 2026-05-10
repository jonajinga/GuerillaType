/* Info modal — context-aware popups for hint text that we don't want
   cluttering the surface. window.openInfoModal('home' | 'practice' | …) */

/* Touch-device detection. Mobile users can't press Tab / Esc / Shift,
   so the keyboard-shortcut row is meaningless. Swap it for tap-based
   guidance. Same predicate as the rest of the site -- coarse pointer
   OR <=767px viewport. */
function isTouchDevice() {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 767px)").matches ||
         window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

const TOPICS_DESKTOP = {
  home: {
    title: "How to start typing",
    body: `
      <ul class="info-modal__list">
        <li>The card on the right has <strong>today's quote</strong> ready to go — click it and start typing. The clock starts on your first keystroke.</li>
        <li>Or click <strong>Start with today's quote</strong> to open it in the full practice surface with stats, restart, and live mode toggles.</li>
        <li>Want a fast warm-up instead? <strong>Quick 30-second test</strong> drops you into the common-word list.</li>
        <li>Finish the inline quote and you'll jump to the full results card automatically — wpm, accuracy, weak keys, and your achievement progress.</li>
      </ul>
      <p class="info-modal__shortcut-row">
        <kbd>Tab</kbd> then <kbd>Enter</kbd> restarts ·
        <kbd>Esc</kbd> ends + saves the session ·
        <kbd>Shift</kbd>+<kbd>?</kbd> all shortcuts
      </p>`,
  },
  practice: {
    title: "Practice surface",
    body: `
      <ul class="info-modal__list">
        <li>Pick a mode + variant from the toolbar above.</li>
        <li>Type the words shown. Correct keystrokes light up; mistakes underline in red.</li>
        <li>Stats update live as you go — wpm, accuracy, and progress through the test.</li>
      </ul>
      <p class="info-modal__shortcut-row">
        <kbd>Tab</kbd> then <kbd>Enter</kbd> restarts ·
        <kbd>Esc</kbd> ends + saves ·
        <kbd>Shift</kbd>+<kbd>?</kbd> all shortcuts
      </p>`,
  },
};

const TOPICS_MOBILE = {
  home: {
    title: "How to start typing",
    body: `
      <ul class="info-modal__list">
        <li>The card on this page has <strong>today's quote</strong> waiting. Tap into the typing area; your keyboard slides up and the clock starts on the first keystroke.</li>
        <li>Or tap <strong>Start with today's quote</strong> to open it in the full practice surface with stats and a restart button.</li>
        <li>Want a fast warm-up instead? <strong>Quick 30-second test</strong> drops you into the common-word list.</li>
        <li>Finish the quote and you'll see the full results -- wpm, accuracy, weak keys, and achievement progress.</li>
      </ul>
      <p class="info-modal__shortcut-row">
        Tap the surface to focus · tap <strong>Restart</strong> to retry · the toolbar slides left/right.
      </p>`,
  },
  practice: {
    title: "Practice surface",
    body: `
      <ul class="info-modal__list">
        <li>Pick a mode + variant from the toolbar above. The bar slides left and right -- or use the arrows on each side.</li>
        <li>Tap the typing area to focus and bring up your keyboard. Type the words shown; correct keystrokes light up, mistakes underline in red.</li>
        <li>Stats update live -- wpm, accuracy %, and time or progress remaining. They sit at the start of the toolbar so you can glance at them.</li>
        <li>Tap <strong>Restart</strong> (the circular-arrow icon) to start over.</li>
      </ul>
      <p class="info-modal__shortcut-row">
        Tap the surface to focus · tap the <strong>arrow icon</strong> to restart · the toolbar slides horizontally.
      </p>`,
  },
};

const TOPICS = isTouchDevice() ? TOPICS_MOBILE : TOPICS_DESKTOP;

function build() {
  let el = document.getElementById("info-modal");
  if (el) return el;
  el = document.createElement("dialog");
  el.id = "info-modal";
  el.className = "info-modal";
  el.setAttribute("aria-label", "Information");
  el.innerHTML = `
    <div class="info-modal__head">
      <h2 class="info-modal__title" id="info-modal-title">Information</h2>
      <button type="button" class="info-modal__close" aria-label="Close">×</button>
    </div>
    <div class="info-modal__body" id="info-modal-body"></div>
  `;
  document.body.appendChild(el);
  el.querySelector(".info-modal__close").addEventListener("click", () => el.close());
  el.addEventListener("click", (e) => { if (e.target === el) el.close(); });
  return el;
}

window.openInfoModal = function (topic) {
  const t = TOPICS[topic] || TOPICS.home;
  const el = build();
  el.querySelector("#info-modal-title").textContent = t.title;
  el.querySelector("#info-modal-body").innerHTML = t.body;
  if (!el.open) el.showModal();
};
