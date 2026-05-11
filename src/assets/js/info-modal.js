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
        <li><strong>Pick a mode</strong> from the site-header <strong>Practice</strong> megamenu — every mode and variant (time, words, quote, tape, tape zen, idiom, poem, custom, book, lesson, drill, challenge, adaptive) has a direct link. The hamburger panel also lists Tape Sprint / 30s test / Daily quote / Stats as one-tap shortcuts.</li>
        <li><strong>Toolbar layout</strong> — live stats sit centered (WPM, accuracy, seconds left / words typed / % complete). Action buttons sit on the right: Restart, Pause, Stop, How it works, Send feedback.</li>
        <li><strong>Pause is now strict</strong> — only the Pause button pauses. Clicking outside the typing area or losing focus no longer pauses anything; the next keystroke just refocuses.</li>
        <li><strong>Typing</strong> — correct keystrokes light up in the accent color, mistakes underline in red. Sound effects (click / typewriter / pop) play if enabled in <a href="/settings/">/settings/</a>.</li>
        <li><strong>Results card</strong> — appears when the session ends. Shows WPM, accuracy, weak keys, per-word chart, and a row of next-action buttons including Send feedback and Leave a review. Auto-advance is OFF; you choose what's next.</li>
      </ul>
      <p class="info-modal__shortcut-row">
        <kbd>Tab</kbd> then <kbd>Enter</kbd> restarts ·
        <kbd>Esc</kbd> ends + saves ·
        <kbd>Ctrl</kbd>+<kbd>K</kbd> search ·
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
        <li><strong>Pick a mode</strong> from the hamburger menu (top-right of every page). Quick links at the top: Tape Sprint, 30s test, Daily quote, Stats. The full Practice megamenu underneath lists every mode (time, words, quote, tape, tape zen, idiom, poem, custom, book, lesson, drill, challenge, adaptive).</li>
        <li><strong>Toolbar</strong> — three live stats stacked at the start (WPM, accuracy, seconds left / progress), three action buttons on the right (Restart, Pause, Stop). How it works + Send feedback are hidden on mobile to keep the row from overflowing; both are reachable from the hamburger menu.</li>
        <li><strong>Type</strong> — tap the typing area to focus and bring up your soft keyboard. Correct keystrokes light up; mistakes underline in red. Sounds (click / typewriter / pop) play if enabled in <a href="/settings/">/settings/</a>.</li>
        <li><strong>Pause is strict</strong> — only the Pause button pauses. Tapping outside the surface no longer pauses; the next tap just refocuses.</li>
        <li><strong>Results</strong> — when the session ends, a card appears with WPM, accuracy, weak keys, and a stack of next-action buttons including Send feedback and Leave a review. Auto-advance is off; you decide what's next.</li>
      </ul>
      <p class="info-modal__shortcut-row">
        Tap the surface to focus · tap <strong>Restart</strong> (circular-arrow icon) to retry · use the hamburger menu to switch modes.
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
