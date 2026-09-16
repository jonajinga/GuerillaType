#!/usr/bin/env node
/* Render the default Open Graph card to a PNG.

   Why this exists: the site's og:image was src/assets/img/og-default.svg,
   and X, Facebook, LinkedIn, Slack and iMessage all refuse SVG for
   og:image -- so every share preview of guerillatype.com was blank. The
   design is fine; the format was not. This script re-draws that same
   design in HTML, rasterises it with Playwright at exactly 1200x630, and
   writes src/assets/img/og-default.png, which IS committed (a share card
   has to exist as a static file at a stable URL; regenerating it at build
   time would put a browser download in the deploy path).

   The layout numbers below are lifted straight from og-default.svg, which
   is kept as the design source. SVG places text on its BASELINE; CSS
   places a box by its TOP edge and where the baseline lands inside that
   box depends on the font's own metrics. Rather than hard-code an offset
   per font (which silently drifts the day a font changes), each text node
   carries a zero-size inline-block strut: the bottom edge of an
   inline-block with no in-flow line boxes sits exactly on the text
   baseline, so we measure it after the webfonts load and nudge the box by
   the difference. That makes the PNG match the SVG to the pixel without
   knowing anything about Lora's ascent.

   Fonts come from Bunny Fonts over the network (the same source the site
   uses), so this needs an internet connection. It is a one-off generator,
   not part of `npm run build`.

   Run: npm run og-default   (node scripts/gen-og-default.mjs) */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "src", "assets", "img", "og-default.png");

const W = 1200, H = 630;
const BG = "#14161e";        // --bg, and the SVG's <rect fill>
const ACCENT = "#e58060";    // brand orange
const FG = "#ece6d6";        // headline cream
const SECONDARY = "#c9c2b1"; // sub-headline
const MUTED = "#8a8678";     // eyebrow + footer

/* Bunny Fonts: Lora for the serif, JetBrains Mono for the two small mono
   lines. Both are already loaded site-wide by base.njk, so the card is
   drawn in the site's own type rather than whatever serif the renderer
   happens to have (the SVG asked for Iowan Old Style, which exists on
   this Mac and on almost no server). */
const FONT_CSS =
  "https://fonts.bunny.net/css?family=lora:400,500,500i,600,700|jetbrains-mono:400,500&display=swap";

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.bunny.net" crossorigin>
<link rel="stylesheet" href="${FONT_CSS}">
<style>
  html, body { margin: 0; padding: 0; background: ${BG}; }
  #stage {
    position: relative; width: ${W}px; height: ${H}px; overflow: hidden;
    background: ${BG};
    -webkit-font-smoothing: antialiased;
  }
  /* Every text node is positioned by its SVG baseline; data-baseline is
     the y from og-default.svg and JS corrects for the font metrics. */
  .t { position: absolute; white-space: nowrap; line-height: 1; }
  .strut { display: inline-block; width: 0; height: 0; vertical-align: baseline; }

  /* Brand mark: 80x80 accent square at (80,150) with a 52x52 hole inset
     14px, and an italic serif G centred in the hole. */
  #tile { position: absolute; left: 80px; top: 150px; width: 80px; height: 80px; background: ${ACCENT}; }
  #tile-inner { position: absolute; left: 14px; top: 14px; width: 52px; height: 52px; background: ${BG}; }
  #g { left: 80px; width: 80px; text-align: center;
       font-family: Lora, Georgia, serif; font-size: 62px; font-weight: 700;
       font-style: italic; color: ${ACCENT}; }

  #eyebrow { left: 180px; font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
             font-size: 22px; font-weight: 400; letter-spacing: 3px; color: ${MUTED}; }
  #headline { left: 80px; font-family: Lora, Georgia, serif; font-size: 108px;
              font-weight: 500; font-style: italic; color: ${FG}; }
  #headline .accent { color: ${ACCENT}; }
  #sub { left: 80px; font-family: Lora, Georgia, serif; font-size: 58px;
         font-weight: 400; color: ${SECONDARY}; }
  #footer { left: 80px; font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
            font-size: 22px; font-weight: 400; letter-spacing: 2px; color: ${MUTED}; }
</style></head>
<body>
<div id="stage">
  <div id="tile"><div id="tile-inner"></div></div>
  <div class="t" id="g" data-baseline="214"><span class="strut"></span>G</div>
  <div class="t" id="eyebrow" data-baseline="210"><span class="strut"></span>ISSUE NO. 01 &middot; OPEN SOURCE</div>
  <div class="t" id="headline" data-baseline="370"><span class="strut"></span>Guerilla <span class="accent">Type</span>.</div>
  <div class="t" id="sub" data-baseline="470"><span class="strut"></span>A free typing tutor for everyone.</div>
  <div class="t" id="footer" data-baseline="560"><span class="strut"></span>guerillatype.com &middot; localStorage only &middot; No accounts</div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: "load" });

/* document.fonts.ready alone resolves before a font that nothing has
   asked for yet is fetched, so ask for each face explicitly first. */
const fontsOk = await page.evaluate(async () => {
  const faces = [
    'italic 700 62px Lora',
    '400 22px "JetBrains Mono"',
    'italic 500 108px Lora',
    '400 58px Lora',
  ];
  const loaded = await Promise.all(faces.map((f) => document.fonts.load(f).then((l) => l.length > 0)));
  await document.fonts.ready;
  return faces.every((f) => document.fonts.check(f)) && loaded.every(Boolean);
});
if (!fontsOk) {
  await browser.close();
  console.error("FAILED: Bunny webfonts did not load — the card would render in a fallback face.");
  process.exit(1);
}

/* Baseline correction, after the real fonts are in place. */
const moved = await page.evaluate(() => {
  const stage = document.getElementById("stage").getBoundingClientRect();
  const out = [];
  for (const el of document.querySelectorAll(".t")) {
    const want = Number(el.dataset.baseline);
    el.style.top = "0px";
    const strut = el.querySelector(".strut").getBoundingClientRect();
    const have = strut.bottom - stage.top;
    el.style.top = (want - have) + "px";
    out.push({ id: el.id, top: want - have });
  }
  return out;
});
for (const m of moved) console.log(`  baseline ${m.id}: top ${m.top.toFixed(1)}px`);

await page.screenshot({ path: OUT, type: "png", clip: { x: 0, y: 0, width: W, height: H }, animations: "disabled" });
await browser.close();

const bytes = statSync(OUT).size;
console.log(`\n  wrote ${OUT}`);
console.log(`  ${W}x${H}, ${(bytes / 1024).toFixed(1)} KB`);
if (bytes > 150 * 1024) {
  console.error(`FAILED: ${(bytes / 1024).toFixed(1)} KB is over the 150 KB budget for a share card.`);
  process.exit(1);
}
