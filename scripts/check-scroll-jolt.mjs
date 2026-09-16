/* The reader surface must follow the caret without lurching.

   The bug this pins: a paragraph break is a display:none character, and
   its cached rect was 0x0 at the viewport origin. When the cursor
   rested on it the caret jumped to the top-left of the document and the
   page-follow scrolled UP toward it; the next real key snapped the page
   back down. Users saw "a jolt at the end of a sentence, fixed on the
   next key". The second complaint was the follow itself: nothing for
   eight lines, then a ~250 px teleport.

   What must hold while typing a three-paragraph custom text at 1100x700:
     A. window.scrollY never decreases while typing forward.
     B. no single keystroke moves the page by more than two line heights.
     C. the caret is inside the viewport at every sample.
     D. on each paragraph break the caret sits at the trailing edge of
        the previous paragraph's last character.
     E. with the Auto-scroll setting off, the page never moves at all.

   Usage:
     npm run build          # not optional: this reads _site, not src
     node scripts/check-scroll-jolt.mjs
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const TASK = "scroll-jolt";
const PORT = Number(process.env.PORT)
  || 8100 + ([...TASK].reduce((a, c) => a + c.charCodeAt(0), 0) % 600);
const ROOT = resolve("_site");

let pass = 0, fail = 0;
const chk = (ok, name, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err && err.message ? err.message : err}`);
  console.log("\nRUN ABORTED — the counts below are partial.");
  process.exit(1);
});

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};
try { await stat(join(ROOT, "practice", "index.html")); }
catch { console.log("  FAIL  _site is not built — run `npm run build` first"); process.exit(1); }
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); }
    catch { if (!extname(file)) file += ".html"; }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); }
});
await new Promise((ok, no) => { server.on("error", no); server.listen(PORT, "127.0.0.1", ok); })
  .catch((e) => { console.log(`  FAIL  could not bind 127.0.0.1:${PORT} — ${e.code || e.message}`); process.exit(1); });
const B = `http://127.0.0.1:${PORT}`;
const probe = await fetch(B + "/practice/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe) && /id=["']?tt-stage["'\s>]/.test(probe);
chk(isThisProject, `server on ${PORT} is this project's /practice/`);
if (!isThisProject) { server.close(); process.exit(1); }

/* Three paragraphs, long enough that the caret has to leave the
   comfortable band several times at 700 px tall. Blank lines are what
   textToParagraphs() turns into paragraph blocks. */
const PARA = (seed) => Array.from({ length: 5 }, (_, i) =>
  `${seed} sentence ${i + 1} walks the reader down the page with plain words that wrap onto new lines as they go.`).join(" ");
const TEXT = [PARA("Alpha"), PARA("Bravo"), PARA("Charlie")].join("\n\n");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, serviceWorkers: "block", hasTouch: false });
page.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 160)));

async function seed(autoScroll) {
  await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  // main.js creates the default profile on load; reload so it exists
  // before the preference is written onto it.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(({ text, autoScroll }) => {
    localStorage.setItem("tt:custom-texts", JSON.stringify([{
      id: "c_jolt", title: "Jolt", createdAt: new Date().toISOString(), bytes: text.length, lastSeg: 0,
      segments: [text], meta: null, clean: false,
    }]));
    if (autoScroll === false) {
      const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
      if (ps[0]) { ps[0].preferences = ps[0].preferences || {}; ps[0].preferences.autoScroll = false; localStorage.setItem("tt:profiles", JSON.stringify(ps)); }
    }
  }, { text: TEXT, autoScroll });
  const stored = await page.evaluate(() => { const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]"); return ps[0] && ps[0].preferences && ps[0].preferences.autoScroll; });
  if (autoScroll === false) chk(stored === false, "E. setup: autoScroll preference stored as false", String(stored));
}

async function typeAndSample() {
  await page.goto(`${B}/practice/?mode=custom&custom=c_jolt&seg=0`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tt-char", { timeout: 8000 });
  await page.click(".tt-stage").catch(() => {});
  await page.waitForTimeout(900); // let any boot-time smooth scroll settle
  const info = await page.evaluate(() => {
    const chars = [...document.querySelectorAll(".tt-char")];
    const breaks = [];
    chars.forEach((el, i) => { if (el.classList.contains("tt-char--paraspace")) breaks.push(i); });
    const text = chars.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join("");
    const lineH = chars.find((e) => !e.classList.contains("tt-char--space")).getBoundingClientRect().height;
    return { text, breaks, lineH, paragraphs: document.querySelectorAll(".tt-paragraph").length };
  });
  const samples = [];
  for (let i = 0; i < info.text.length; i++) {
    await page.keyboard.type(info.text[i], { delay: 0 });
    await page.waitForTimeout(58);
    samples.push(await page.evaluate((idx) => {
      const caret = document.querySelector(".tt-caret").getBoundingClientRect();
      const chars = document.querySelectorAll(".tt-char");
      const prev = chars[idx] ? chars[idx].getBoundingClientRect() : null;
      return { i: idx + 1, scrollY: window.scrollY, caretTop: caret.top, caretLeft: caret.left,
               prevRight: prev ? prev.right : null, prevTop: prev ? prev.top : null, vh: window.innerHeight };
    }, i));
  }
  return { info, samples };
}

// ── Auto-scroll on ───────────────────────────────────────────────
await seed(true);
let { info, samples } = await typeAndSample();
chk(info.paragraphs === 3, "three paragraph blocks rendered", `paragraphs=${info.paragraphs}`);
chk(info.breaks.length === 2, "two paragraph breaks in the passage", `breaks=${JSON.stringify(info.breaks)}`);
chk(samples[samples.length - 1].scrollY > samples[0].scrollY + info.lineH * 2, "A. the page did follow the caret down", `scrollY ${Math.round(samples[0].scrollY)} -> ${Math.round(samples[samples.length - 1].scrollY)}`);
let drops = 0, worstDrop = 0, biggest = 0, biggestAt = -1;
for (let k = 1; k < samples.length; k++) {
  const d = samples[k].scrollY - samples[k - 1].scrollY;
  if (d < -0.5) { drops++; worstDrop = Math.min(worstDrop, d); }
  if (d > biggest) { biggest = d; biggestAt = samples[k].i; }
}
chk(drops === 0, "A. scrollY never decreases while typing forward", drops ? `${drops} drops, worst ${Math.round(worstDrop)}px` : "");
chk(biggest <= info.lineH * 2.5, "B. no keystroke moves the page more than two lines", `max ${Math.round(biggest)}px (line ${Math.round(info.lineH)}px) at char ${biggestAt}`);
const off = samples.filter((s) => s.caretTop < 0 || s.caretTop > s.vh - 40);
chk(off.length === 0, "C. caret stayed inside the viewport at every sample", off.length ? `${off.length} outside, first at char ${off[0].i} top=${Math.round(off[0].caretTop)}` : "");
for (const b of info.breaks) {
  // After typing char b-1 the cursor rests ON the break (index b).
  const s = samples[b - 1];
  const dx = Math.abs(s.caretLeft - s.prevRight), dy = Math.abs(s.caretTop - s.prevTop);
  chk(dx <= 8 && dy <= 4, `D. caret sits at the end of the paragraph before break ${b}`, `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
}

// ── Auto-scroll off ──────────────────────────────────────────────
await seed(false);
({ info, samples } = await typeAndSample());
/* The last keystroke ends the run and the results card scrolls itself
   into view; that is the card's scroll, not the follow's. Judge the
   typing samples only. */
const typing = samples.slice(0, -1);
const moved = Math.max(...typing.map((s) => s.scrollY)) - Math.min(...typing.map((s) => s.scrollY));
chk(moved < 1, "E. with Auto-scroll off the page never moves", `range ${Math.round(moved)}px`);
const drops2 = typing.filter((s, k) => k && s.scrollY < typing[k - 1].scrollY - 0.5).length;
chk(drops2 === 0, "E. and still no upward jolt at the breaks");

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
