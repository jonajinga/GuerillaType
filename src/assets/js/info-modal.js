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
        <li>The card on the right is a live <strong>15-second tape sprint</strong> — common words scroll horizontally under a fixed caret. Click it and start typing; the clock starts on your first keystroke.</li>
        <li>Live stats sit at the top of the card: seconds remaining, WPM, accuracy %. When the timer runs out, a results popup shows your numbers and a row of next-action buttons (run again, longer tape, tape zen, switch to a 30s test, today's quote).</li>
        <li>The two CTAs above the card are direct deep-links: <strong>15-second tape sprint</strong> opens the same sprint full-screen, <strong>Today's quote</strong> jumps to the curated daily quote.</li>
        <li>For everything else, the megamenu and footer have direct links to every mode and variant: time tests, word counts, quotes, idioms, poems, books, lessons, drills, challenges, custom text. The hamburger panel also lists Tape Sprint / 30s test / Daily quote / Stats as one-tap shortcuts.</li>
        <li>Every finished session feeds your private profile — lifetime stats live at <a href="/stats/">/stats/</a>, aggregate community data at <a href="/community-stats/">/community-stats/</a>.</li>
      </ul>
      <p class="info-modal__shortcut-row">
        <kbd>Tab</kbd> then <kbd>Enter</kbd> restarts ·
        <kbd>Esc</kbd> ends + saves the session ·
        <kbd>Ctrl</kbd>+<kbd>K</kbd> open search ·
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
        <li>The card on this page is a live <strong>15-second tape sprint</strong>. Tap into the typing area; your soft keyboard slides up and the clock starts on the first keystroke. Words scroll horizontally under a fixed caret.</li>
        <li>Live stats sit at the top of the card: seconds remaining, WPM, accuracy %. When the timer runs out a results popup appears with your numbers and next-action buttons (run again, longer tape, tape zen, switch to a 30s test, today's quote).</li>
        <li>The two big CTAs above the card are direct links: <strong>15-second tape sprint</strong> opens the same sprint full-screen, <strong>Today's quote</strong> jumps to the curated daily quote.</li>
        <li>For every other mode use the hamburger menu — it has Tape Sprint / 30s test / Daily quote / Stats as one-tap shortcuts, plus the full megamenu underneath for everything else.</li>
        <li>Lifetime stats live at <a href="/stats/">/stats/</a>; aggregate community numbers at <a href="/community-stats/">/community-stats/</a>.</li>
      </ul>
      <p class="info-modal__shortcut-row">
        Tap the surface to focus · tap <strong>Restart</strong> to retry · the toolbar's compact action row sits on the right of the live stats.
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
