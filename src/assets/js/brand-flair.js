/* Brand-flair tooltips. Footer-only now: the gorilla mark in the
   footer gets a random greeting on hover, mixed with primate jokes
   for a touch of personality. The header mark + wordmark are left
   bare since their tooltips were redundant with the brand text right
   next to them. The footer wordmark is also bare to keep that
   wordmark unambiguous. */

const TIPPY_CDN = "https://esm.sh/tippy.js@6";

const GREETINGS = [
  "Hi",
  "Hello",
  "Hey",
  "Greetings",
  "Howdy",
  "Hiya",
  "What's up",
  "Yo",
  "Morning",
  "Afternoon",
  "Evening",
  "How's it going",
  "How are you",
  "Alright",
  "Good to see you",
  "Long time no see",
  "What's happening",
  "What's new",
  "Sup",
  "Whazzup",
  "How's things",
  "How've you been",
  "Look who it is",
  "Top of the morning",
  "G'day",
  "Cheers",
  "Welcome",
  "Good day",
  "Stay safe",
  "Peace",
  "Ahoy",
  "What's the word",
  "What's the good word",
  "How's tricks",
  "Howdy-do",
  "Morning folks",
  "Right on",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

(async function init() {
  // Footer mark only. The header mark + wordmark and the footer
  // wordmark are intentionally NOT decorated; their text labels are
  // already self-evident.
  const marks = Array.from(document.querySelectorAll("[data-brand-emoji]"))
    .filter((el) => !!el.closest(".site-footer"));
  if (!marks.length) return;
  let tippy;
  try {
    const mod = await import(/* @vite-ignore */ TIPPY_CDN);
    tippy = mod.default || mod.tippy || mod;
  } catch (err) {
    console.warn("[brand-flair] Tippy load failed; skipping flair.", err);
    return;
  }
  // Mobile: place tooltip above the icon (footer mark sits at the
   // left edge of a phone column, so a right-placed tooltip overflows
   // and gets clipped). Tighter maxWidth + viewport-overflow padding
   // ensures the bubble always wraps inside the visible width. Touch:
   // true so a regular tap pops the greeting (the previous "hold 400ms"
   // setting felt broken to users who just tapped the icon).
  const isMobile =
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(max-width: 640px)").matches ||
     window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  marks.forEach((mark) => {
    tippy(mark, {
      allowHTML: true,
      arrow: true,
      theme: "guerilla",
      delay: [60, 60],
      duration: [120, 80],
      placement: isMobile ? "top" : "right",
      offset: [0, 10],
      interactive: false,
      appendTo: () => document.body,
      trigger: "mouseenter focus",
      maxWidth: isMobile ? Math.min(220, Math.floor(window.innerWidth - 24)) : 320,
      touch: true,
      hideOnClick: true,
      popperOptions: {
        modifiers: [
          { name: "preventOverflow", options: { padding: 12, boundary: "clippingParents" } },
          { name: "flip", options: { padding: 12 } },
        ],
      },
      content: pick(GREETINGS),
      onShow(instance) {
        instance.setContent(pick(GREETINGS));
      },
    });
  });
})();
