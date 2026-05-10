/* Brand-flair tooltips. Footer-only now: the gorilla mark in the
   footer gets a random greeting on hover, mixed with primate jokes
   for a touch of personality. The header mark + wordmark are left
   bare since their tooltips were redundant with the brand text right
   next to them. The footer wordmark is also bare to keep that
   wordmark unambiguous. */

const TIPPY_CDN = "https://esm.sh/tippy.js@6";

const GREETINGS = [
  "Hello, friend.",
  "Welcome back.",
  "Glad you're here.",
  "Hey there!",
  "Good to see you.",
  "Hi, neighbor.",
  "Howdy.",
  "Pleased to meet you.",
  "Hola!",
  "Bonjour.",
  "Guten Tag.",
  "Ciao!",
  "Konnichiwa.",
  "Namaste.",
  "Salaam.",
  "Aloha!",
  "G'day, mate.",
  "Greetings, traveler.",
  "Welcome, fellow typist.",
  "Make yourself at home.",
  "Glad to have you.",
  "Type something nice today.",
  "May your fingers be quick.",
  "Hope your home row is happy.",
  "Mind the colon.",
  "Watch your shift.",
  "Trust the rhythm.",
  "Easy on the backspace.",
  "Breathe between words.",
  "Slow is smooth, smooth is fast.",
  "One key at a time.",
  "Practice beats perfect.",
  "Thanks for visiting.",
  "Glad you stopped by.",
  "Stay a while.",
  "You belong here.",
  "Real human behind this site, by the way.",
  "Tea or coffee?",
  "Hope today is treating you well.",
  "Wishing you a calm session.",
  "Hi from a fellow keyboard person.",
  "Welcome to the keyboard.",
  "Right at home, I hope.",
  "Pleasure to have you.",
  "Hope the wpm is on your side today.",
  "Type freely.",

  // ── Primate jokes ──────────────────────────────────────────────
  // Slipped into the rotation so a hover occasionally surfaces a
  // groaner. Goal: a small smile, never a wall of text.
  "Why don't gorillas like fast food? They can't catch it.",
  "How does a gorilla type? With his ape-titude.",
  "What's a chimp's favorite key? The space bar (it's like a vine).",
  "Why was the orangutan good at typing? Long reach.",
  "What do you call a gorilla with a typewriter? An ape author.",
  "Two monkeys walk into a keyboard. The third one ducks.",
  "Why did the gorilla quit Twitter? Too many trolls, not enough bananas.",
  "I asked a gorilla for typing tips. He said: stop monkeying around.",
  "What do gorillas use for spell-check? A primate grammar tool.",
  "Knock knock. Who's there? Banana. Banana who? Banana hammer hits the wrong row.",
  "What's a gorilla's favorite mode? Chimp-an-zen.",
  "Why don't gorillas use shift? They prefer everything LOWERCASE.",
  "How fast does a gorilla type? About 88 wpm -- ape-roximately.",
  "Why did the chimp practice every day? He wanted to ascend the typing tree.",
  "Gorillas only break for one thing: bananas and accuracy.",
  "What's a primate's favorite drill? Home row to canopy.",
  "Why was the silverback so fast? He had a key set of fingers.",
  "Did you hear about the gorilla who set a record? He went bananas.",
  "Why don't apes use ergonomic keyboards? They've got swing.",
  "What's brown, hairy, and types 200 wpm? A typo.",
  "How do you spot a typing gorilla? Check his knuckle-down posture.",
  "Why was the chimpanzee promoted? Best touch-typist on the troop.",
  "Gorillas don't use the caps lock. They prefer raw strength.",
  "Why was the lemur a great typist? Steady tail, steady hands.",
  "What's a gorilla's least favorite key? Escape -- there's no escape.",
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
