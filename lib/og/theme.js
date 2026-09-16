/* Palette and type for the Open Graph cards.
 *
 * Plain ESM with no imports: this file is loaded by Node at build time
 * (scripts/gen-og-images.mjs) and is meant to load unchanged inside a
 * Cloudflare Worker later, so it must not touch `fs`, `process` or any
 * Node built-in. Same rule for every other file in lib/og/.
 *
 * The colours are copied from the DARK theme block of
 * src/assets/css/partials/tokens.css. They are copied rather than
 * parsed because a Worker cannot read the CSS file, and a share card
 * is not a place where a missing token should fall back to black.
 * If tokens.css changes, change these -- scripts/check-og-render.mjs
 * does not (and cannot) catch drift here.
 */

export const COLORS = {
  bg: "#14161e",        // --bg-0, deep ocean ink
  bg1: "#1c1f29",       // --bg-1, excerpt panel
  bg2: "#252836",       // --bg-2
  fg: "#ece6d6",        // --fg-0, warm fog
  fg1: "#c9c2b1",       // --fg-1
  muted: "#8d887d",     // --fg-3, eyebrow + footer
  rule: "#353848",      // --rule, hairlines
  accent: "#e58060",    // --accent, warm coral
  secondary: "#6ba9b3", // --secondary, lifted teal
  good: "#8fbf90",      // --good, used for the PB badge
};

/* Card geometry. 1200x630 is the Open Graph 1.91:1 that X, Facebook,
   LinkedIn and Slack all crop to. */
export const CARD = {
  width: 1200,
  height: 630,
  pad: 64,
};

export const FONTS = {
  serif: "Lora",
  sans: "Inter",
  mono: "JetBrains Mono",
};

/* The six faces in src/assets/fonts/og/. `file` is the basename; the
   host (Node glue or Worker) decides where to read it from and hands
   satori the bytes. Weight/style here must match what card.js asks for:
   satori does NOT synthesise a missing weight or slant, it silently
   picks the nearest face it was given, which is how a card ends up
   entirely in italic. */
export const FONT_FILES = [
  { file: "lora-400.ttf", name: FONTS.serif, weight: 400, style: "normal" },
  { file: "lora-600.ttf", name: FONTS.serif, weight: 600, style: "normal" },
  { file: "lora-500-italic.ttf", name: FONTS.serif, weight: 500, style: "italic" },
  { file: "inter-400.ttf", name: FONTS.sans, weight: 400, style: "normal" },
  { file: "inter-600.ttf", name: FONTS.sans, weight: 600, style: "normal" },
  { file: "jetbrains-mono-400.ttf", name: FONTS.mono, weight: 400, style: "normal" },
  { file: "jetbrains-mono-500.ttf", name: FONTS.mono, weight: 500, style: "normal" },
];

export const SITE = {
  domain: "guerillatype.com",
  resultFooter: "guerillatype.com · free, open-source typing tutor",
  contentFooter: "Type this on guerillatype.com",
  resultEyebrow: "GUERILLATYPE · SESSION RESULT",
};
