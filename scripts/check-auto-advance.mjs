/* Auto-advance: the opt-in switch that skips the results card and loads
   the next run in place.

   What must hold, in the order a user meets it:

     A. The toolbar has an Auto button, off by default, hidden in zen.
     B. Clicking it writes preferences.autoAdvance.<mode> = true on the
        active profile, and the Settings page shows the same switch on.
     C. With it on, finishing segment 0 of a custom text does NOT show the
        results card: segment 1 is on the surface, the URL says seg=1, the
        header says "Segment 2 of 4", the last-run strip names the run that
        just ended, and the bookmark moved -- the stats were saved too.
     D. A keystroke inside the 400 ms swap window is dropped, so the
        trailing key from the old run is not the first error of the new.
     E. Esc still ends the run with the card, even with the switch on.
     F. The last segment still ends with the card ("Text finished").
     G. With the switch off, the card shows as before (#tt-next-seg).
     H. Words mode: the same switch restarts with fresh text in place.

   Section D is the one a lazy implementation fails: a swap with no
   guard would mark a wrong first character before the user even looks.

   Usage:
     npm run build          # not optional: this reads _site, not src
     node scripts/check-auto-advance.mjs
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

/* Port from the task id, not from habit. 8080 is never ours, and 8765
   is the shared default every other gate in this repo uses. */
const TASK = "auto-advance";
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

// ---------------------------------------------------------------- server
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon", ".xml": "application/xml; charset=utf-8",
};
try {
  await stat(join(ROOT, "practice", "index.html"));
} catch {
  console.log("  FAIL  _site is not built — run `npm run build` first");
  process.exit(1);
}
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    } catch {
      if (!extname(file)) file += ".html";
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});
await new Promise((ok, no) => {
  server.on("error", no);
  server.listen(PORT, "127.0.0.1", ok);
}).catch((e) => {
  console.log(`  FAIL  could not bind 127.0.0.1:${PORT} — ${e.code || e.message}`);
  console.log("\nRUN ABORTED — refusing to share a port with something else.");
  process.exit(1);
});
const B = `http://127.0.0.1:${PORT}`;

/* Prove what is answering before believing anything it says. */
const probe = await fetch(B + "/practice/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe)
  && /id=["']?tt-stage["'\s>]/.test(probe);
chk(isThisProject, `server on ${PORT} is this project's /practice/`);
if (!isThisProject) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  process.exit(1);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
/* Desktop viewport and no touch: auto-advance is deliberately off on
   touch devices, so a coarse-pointer context would pass section G and
   fail everything else for the wrong reason. Service workers blocked:
   pwa.js reloads on controllerchange, mid-run. */
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block", hasTouch: false });
page.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 160)));

const SEGS = ["Alpha one text.", "Bravo two text.", "Charlie three text.", "Delta four text."];
await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await page.evaluate((segs) => {
  localStorage.clear();
  localStorage.setItem("tt:custom-texts", JSON.stringify([{
    id: "c_auto", title: "Auto PDF", createdAt: new Date().toISOString(), bytes: 120, lastSeg: 0,
    segments: segs, meta: null,
  }]));
}, SEGS);

const surfaceText = () => page.$$eval(".tt-char", (els) =>
  els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
const openSeg = async (seg) => {
  await page.goto(`${B}/practice/?mode=custom&custom=c_auto&seg=${seg}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tt-char", { timeout: 8000 });
  await page.click(".tt-stage").catch(() => {});
};
/* Human pace on purpose. The engine flags anything over 250 wpm as
   suspect, and auto-advance refuses a suspect result by design; a
   4 ms-per-key robot is ~3000 wpm and would get the card every time. */
const typeAll = async (delay = 70) => {
  const target = await surfaceText();
  for (const ch of target) await page.keyboard.type(ch, { delay });
  return target;
};
const autoMap = () => page.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const id = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const p = ps.find((x) => x.id === id) || ps[0];
  return (p && p.preferences && p.preferences.autoAdvance) || {};
});

// A. Button present, off, and hidden in zen.
await openSeg(0);
const btnVisible = await page.isVisible("#tt-autoadvance");
chk(btnVisible, "A. toolbar has an Auto button on a custom text");
if (!btnVisible) {
  /* Nothing below can run without the button; report the counts
     instead of dying on the first click with a Playwright stack. */
  console.log("\nRUN ABORTED — no Auto button, the rest of the gate cannot run.");
  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}
chk((await page.getAttribute("#tt-autoadvance", "aria-pressed")) === "false", "A. it starts off");
await page.goto(`${B}/practice/?mode=zen`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
chk(!(await page.isVisible("#tt-autoadvance")), "A. hidden in zen (nothing to advance to)");

// B. Clicking it persists per mode; Settings agrees.
await openSeg(0);
await page.click("#tt-autoadvance");
chk((await page.getAttribute("#tt-autoadvance", "aria-pressed")) === "true", "B. click turns it on");
let map = await autoMap();
chk(map.custom === true, "B. saved as preferences.autoAdvance.custom", JSON.stringify(map));
chk(map.time !== true, "B. other modes untouched");
await page.goto(B + "/settings/", { waitUntil: "networkidle" });
chk(await page.isChecked("#pref-autoAdvance-custom"), "B. Settings row for custom text shows on");
chk(!(await page.isChecked("#pref-autoAdvance-lesson")), "B. Settings row for lessons shows off");
/* The input sits under its styled track, so click the label the way
   a person does; settings-boot listens on the label too. */
await page.$eval("#pref-autoAdvance-words", (el) => el.closest("label").click());
await page.waitForTimeout(150);
map = await autoMap();
chk(map.words === true && map.custom === true, "B. Settings switch writes the same map", JSON.stringify(map));

// C. Finish segment 0 -> segment 1 in place, no card.
await openSeg(0);
chk((await page.getAttribute("#tt-autoadvance", "aria-pressed")) === "true", "C. switch is remembered on reload");
const t0 = await typeAll();
chk(t0.startsWith("Alpha"), "C. segment 0 rendered", JSON.stringify(t0));
// D. Trailing keystroke inside the swap window must be dropped.
await page.keyboard.type("x");
await page.waitForTimeout(900);
chk(await page.$eval("#tt-results", (el) => el.hidden), "C. results card NOT shown");
const t1 = await surfaceText();
chk(t1.startsWith("Bravo"), "C. segment 1 is on the surface", JSON.stringify(t1));
chk(/seg=1/.test(page.url()), "C. URL rewritten to seg=1", page.url());
const seg = (await page.textContent(".tt-custom-seg").catch(() => "")) || "";
chk(/Segment 2 of 4/i.test(seg), "C. header reads Segment 2 of 4", JSON.stringify(seg.trim()));
const strip = (await page.textContent("#tt-last-run").catch(() => "")) || "";
chk(await page.isVisible("#tt-last-run"), "C. last-run strip visible");
chk(/Segment 1 of 4 done/i.test(strip) && /wpm/.test(strip) && /accuracy/.test(strip), "C. strip names the run and its numbers", JSON.stringify(strip.trim()));
const saved = await page.evaluate(() => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const list = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]");
  return { sessions: (ps[0] && ps[0].sessions || []).length, lastSeg: list[0] && list[0].lastSeg };
});
chk(saved.sessions >= 1, "C. session was recorded even though no card showed", `sessions=${saved.sessions}`);
chk(saved.lastSeg === 1, "C. bookmark advanced to 1", `lastSeg=${saved.lastSeg}`);
const state1 = await page.getAttribute("#tt-stage", "data-state");
const wrong1 = await page.$$eval(".tt-char--incorrect", (els) => els.length);
chk(state1 === "ready", "D. new run is waiting, not started by the trailing key", `state=${state1}`);
chk(wrong1 === 0, "D. trailing 'x' was dropped, no error on the new run", `incorrect=${wrong1}`);
await page.keyboard.type("B");
await page.waitForTimeout(100);
chk(await page.$eval("#tt-last-run", (el) => el.hidden), "C. strip clears on the first real keystroke");
chk((await page.getAttribute("#tt-stage", "data-state")) === "running", "D. a key after the window starts the run");

// E. Esc with the switch on -> card.
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
chk(!(await page.$eval("#tt-results", (el) => el.hidden)), "E. Esc still shows the results card");
chk(/seg=1/.test(page.url()), "E. and stays on the same segment", page.url());

// F. Last segment -> card with Text finished.
await openSeg(3);
await typeAll();
await page.waitForTimeout(900);
chk(!(await page.$eval("#tt-results", (el) => el.hidden)), "F. final segment shows the card");
const endText = (await page.textContent(".results__actions").catch(() => "")) || "";
chk(/Text finished/i.test(endText), "F. final segment says the text is finished");

// G. Switch off -> old behaviour.
await openSeg(0);
await page.click("#tt-autoadvance");
chk((await page.getAttribute("#tt-autoadvance", "aria-pressed")) === "false", "G. click turns it off");
await page.click(".tt-stage").catch(() => {});
await typeAll();
await page.waitForTimeout(900);
chk(!(await page.$eval("#tt-results", (el) => el.hidden)), "G. results card shows with the switch off");
const nextHref = await page.getAttribute("#tt-next-seg", "href").catch(() => null);
chk(!!nextHref && /seg=1/.test(nextHref), "G. Next segment link is back", nextHref || "(missing)");

// H. Words mode restarts in place with fresh text.
await page.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
chk((await page.getAttribute("#tt-autoadvance", "aria-pressed")) === "true", "H. words switch (set on Settings) is on");
await page.click(".tt-stage").catch(() => {});
const w0 = await typeAll();
await page.waitForTimeout(900);
chk(await page.$eval("#tt-results", (el) => el.hidden), "H. no card after a words test");
const w1 = await surfaceText();
chk(w1.length > 0 && w1 !== w0 && (await page.getAttribute("#tt-stage", "data-state")) === "ready", "H. fresh text is waiting", JSON.stringify(w1.slice(0, 30)));
const strip2 = (await page.textContent("#tt-last-run").catch(() => "")) || "";
chk(/Last run/i.test(strip2), "H. strip reads Last run", JSON.stringify(strip2.trim()));

// I. The Stop button's own handler must end at the card. A bare
//    click() reaches only window.ttFinish -- no pointerup/touchend
//    first -- which is what assistive tech and scripts produce.
await page.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
await page.click(".tt-stage").catch(() => {});
await page.keyboard.type("a", { delay: 70 });
await page.evaluate(() => document.getElementById("tt-stop").click());
await page.waitForTimeout(700);
chk(!(await page.$eval("#tt-results", (el) => el.hidden)), "I. a bare click on Stop shows the card, no auto-advance");
chk(await page.$eval("#tt-last-run", (el) => el.hidden), "I. and no last-run strip");

// J. Lessons advance only on a pass.
const setAuto = (o) => page.evaluate((o) => {
  const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const id = JSON.parse(localStorage.getItem("tt:active-profile") || "null");
  const p = ps.find((x) => x.id === id) || ps[0];
  p.preferences = p.preferences || {};
  p.preferences.autoAdvance = Object.assign({}, p.preferences.autoAdvance, o);
  localStorage.setItem("tt:profiles", JSON.stringify(ps));
}, o);
const typeWithErrors = async (every) => {
  const target = await surfaceText();
  let i = 0;
  for (const ch of target) {
    i++;
    const wrong = every && i % every === 0 && ch !== " ";
    await page.keyboard.type(wrong ? (ch === "z" ? "q" : "z") : ch, { delay: 70 });
  }
  return target;
};
await setAuto({ lesson: true, challenge: true });
await page.goto(`${B}/practice/?lesson=1`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
await page.click(".tt-stage").catch(() => {});
await typeWithErrors(0);
await page.waitForTimeout(1200);
chk(await page.$eval("#tt-results", (el) => el.hidden) && /lesson=2/.test(page.url()), "J. lesson passed -> lesson 2 in place", page.url());
chk(/Lesson 1 passed/.test((await page.textContent("#tt-last-run").catch(() => "")) || ""), "J. strip says the lesson passed");
await page.goto(`${B}/practice/?lesson=1`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
await page.click(".tt-stage").catch(() => {});
await typeWithErrors(3);
await page.waitForTimeout(1200);
chk(await page.$eval("#tt-results", (el) => el.hidden) && /lesson=2/.test(page.url()), "J. lesson NOT passed -> still advances to lesson 2", page.url());
chk(/Lesson 1 not passed/.test((await page.textContent("#tt-last-run").catch(() => "")) || ""), "J. strip says the lesson was not passed");

// K. Challenges advance only on a clear (word-50: 65 wpm, 95 % acc).
await page.goto(`${B}/practice/?mode=words&words=50&challenge=word-50`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
await page.click(".tt-stage").catch(() => {});
await typeWithErrors(0);
await page.waitForTimeout(1500);
chk(await page.$eval("#tt-results", (el) => el.hidden) && /challenge=word-200/.test(page.url()), "K. challenge cleared -> next challenge in place", page.url());
await page.goto(`${B}/practice/?mode=words&words=50&challenge=word-50`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
await page.click(".tt-stage").catch(() => {});
await typeWithErrors(4);
await page.waitForTimeout(1500);
chk(await page.$eval("#tt-results", (el) => el.hidden) && /challenge=word-200/.test(page.url()), "K. challenge missed -> still advances to the next challenge", page.url());
chk(/50 Words missed/.test((await page.textContent("#tt-last-run").catch(() => "")) || ""), "K. strip says missed and why", JSON.stringify(((await page.textContent("#tt-last-run").catch(() => "")) || "").trim()));
// The 100-word challenge the owner reported: missed goal still advances.
await page.goto(`${B}/practice/?mode=words&words=100&challenge=word-100`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
await page.click(".tt-stage").catch(() => {});
await typeWithErrors(5);
await page.waitForTimeout(1500);
chk(await page.$eval("#tt-results", (el) => el.hidden) && /challenge=word-500/.test(page.url()), "K. 100 Words missed -> advances to 500 Words", page.url());
// Manual Next challenge on the card still exists when the switch is off.
await setAuto({ challenge: false });
await page.goto(`${B}/practice/?mode=words&words=50&challenge=word-50`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
await page.click(".tt-stage").catch(() => {});
await typeWithErrors(4);
await page.waitForTimeout(1200);
chk(!(await page.$eval("#tt-results", (el) => el.hidden)) && (await page.isVisible("#tt-next-challenge")), "K. switch off: card with Next challenge button");
// Literal-source challenges type what they declare, not a pangram.
await page.goto(`${B}/practice/?mode=words&words=5&challenge=alphabet-sprint`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 8000 });
const lit = await surfaceText();
chk(lit.startsWith("abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz"), "K. alphabet-sprint types the alphabet, not the pangram", JSON.stringify(lit.slice(0, 30)));
// Every challenge source type must produce its own text. The fallback
// pangram is what an unimplemented type renders, so it is the tell.
{
  const PANGRAM = "the quick brown fox jumps over the lazy dog";
  const all = await page.evaluate(async () => (await (await fetch("/data/challenges.json")).json()).map((c) => ({ id: c.id, type: c.source && c.source.type, mode: c.mode, dur: c.durationSec, words: c.words })));
  const seen = new Map();
  for (const c of all) if (!seen.has(c.type)) seen.set(c.type, c);
  for (const [type, c] of seen) {
    const q = new URLSearchParams({ mode: c.mode || "words" });
    if (c.dur) q.set("duration", String(c.dur));
    if (c.words) q.set("words", String(c.words));
    q.set("challenge", c.id);
    await page.goto(`${B}/practice/?${q}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".tt-char", { timeout: 8000 });
    const txt = await surfaceText();
    chk(txt.length > 20 && txt !== PANGRAM, `K. source type "${type}" (${c.id}) renders its own text`, JSON.stringify(txt.slice(0, 40)));
    if (type === "poetry") chk((await page.$$eval(".tt-paragraph", (els) => els.length)) > 1, "K. poetry-run keeps its line breaks");
    if (type === "speech") {
      const isSpeech = await page.evaluate(async (t) => (await (await fetch("/data/lessons.json")).json()).some((l) => l.text && l.text.trim() === t), txt);
      chk(isSpeech, "K. speech-run is one of the curriculum's speech excerpts");
    }
  }
}

// N. A quote saved through the custom pipeline (meta.kind quote) advances
//    to another quote instead of retyping itself.
{
  const q = await page.evaluate(async () => { const all = await (await fetch("/data/quotes.json")).json(); return all.slice(0, 2).map((x) => ({ id: x.id, text: x.text, author: x.author })); });
  await page.evaluate(({ q }) => {
    const list = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]");
    list.unshift({ id: "c_quote", title: q[0].author || "Quote", createdAt: new Date().toISOString(), bytes: q[0].text.length, lastSeg: 0, segments: [q[0].text], meta: { kind: "quote", sourceId: q[0].id, author: q[0].author } });
    localStorage.setItem("tt:custom-texts", JSON.stringify(list));
    const ps = JSON.parse(localStorage.getItem("tt:profiles")); ps[0].preferences.autoAdvance = { quote: true }; localStorage.setItem("tt:profiles", JSON.stringify(ps));
  }, { q });
  await page.goto(`${B}/practice/?mode=custom&custom=c_quote&seg=0&from=quote`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tt-char", { timeout: 8000 });
  chk((await page.getAttribute("#tt-autoadvance", "aria-pressed")) === "true", "N. quote switch is on for a custom-pipeline quote");
  await page.click(".tt-stage").catch(() => {});
  const before = await typeWithErrors(0);
  await page.waitForTimeout(1500);
  const after = await surfaceText();
  chk(await page.$eval("#tt-results", (el) => el.hidden) && after !== before && !/custom=c_quote/.test(page.url()), "N. custom-pipeline quote advances to a different quote", page.url());
  chk(/Quote done/.test((await page.textContent("#tt-last-run").catch(() => "")) || ""), "N. strip reads Quote done");
}

// M. Library paragraph mode (the reader's click-one-paragraph link)
//    advances paragraph by paragraph and rolls into the next chapter.
{
  await setAuto({ book: true });
  const book = await page.evaluate(async () => {
    const b = await (await fetch("/data/books/the-good-soldier.json")).json();
    const chs = b.chapters.map((c) => c.paragraphs.map((p) => ({ id: p.id, len: p.text.length })));
    // A chapter whose last paragraph is short and that has a successor,
    // so the chapter roll-over can be typed at human pace.
    let roll = null;
    for (let i = 0; i + 1 < chs.length; i++) {
      const last = chs[i][chs[i].length - 1];
      if (last && last.len < 220 && chs[i + 1].length) { roll = { ch: i, para: last.id, nextPara: chs[i + 1][0].id }; break; }
    }
    return { slug: b.slug || "the-good-soldier", first: chs[0][0].id, second: chs[0][1] && chs[0][1].id, total: chs[0].length, roll };
  });
  await page.goto(`${B}/practice/?book=${book.slug}&ch=0&p=${encodeURIComponent(book.first)}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tt-char", { timeout: 8000 });
  chk(await page.isVisible("#tt-autoadvance") && (await page.getAttribute("#tt-autoadvance", "aria-disabled")) === null, "M. Auto button available in paragraph mode");
  const hdr0 = (await page.textContent(".tt-book-page").catch(() => "")) || "";
  chk(new RegExp(`Paragraph 1 of ${book.total}`).test(hdr0), "M. header counts paragraphs, not pages", JSON.stringify(hdr0.trim()));
  await page.click(".tt-stage").catch(() => {});
  await typeWithErrors(0);
  await page.waitForTimeout(1200);
  chk(await page.$eval("#tt-results", (el) => el.hidden), "M. no card after a paragraph");
  chk(page.url().includes(`p=${encodeURIComponent(book.second)}`), "M. URL moved to the second paragraph", page.url());
  const hdr1 = (await page.textContent(".tt-book-page").catch(() => "")) || "";
  chk(/Paragraph 2 of/.test(hdr1), "M. header reads Paragraph 2", JSON.stringify(hdr1.trim()));
  chk(/Paragraph 1 of \d+ done/.test((await page.textContent("#tt-last-run").catch(() => "")) || ""), "M. strip names the paragraph");
  if (book.roll) {
    await page.goto(`${B}/practice/?book=${book.slug}&ch=${book.roll.ch}&p=${encodeURIComponent(book.roll.para)}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".tt-char", { timeout: 8000 });
    await page.click(".tt-stage").catch(() => {});
    await typeWithErrors(0);
    await page.waitForTimeout(1200);
    chk(page.url().includes(`ch=${book.roll.ch + 1}&p=${encodeURIComponent(book.roll.nextPara)}`), "M. last paragraph rolls into the next chapter", page.url());
  } else {
    chk(false, "M. no short chapter-ending paragraph found to test the roll-over");
  }
  // Switch off: the card offers Next paragraph.
  await setAuto({ book: false });
  await page.goto(`${B}/practice/?book=${book.slug}&ch=0&p=${encodeURIComponent(book.first)}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".tt-char", { timeout: 8000 });
  await page.click(".tt-stage").catch(() => {});
  await typeWithErrors(0);
  await page.waitForTimeout(1200);
  const nextHref = await page.getAttribute("#tt-next-page", "href").catch(() => null);
  chk(!!nextHref && nextHref.includes(`p=${encodeURIComponent(book.second)}`), "M. card's next link points at the next paragraph", nextHref || "(missing)");
}

// L. Touch devices always get the card: the next run cannot take
//    focus without a tap, so there is nothing smooth to swap to.
{
  const mobile = await browser.newPage({ viewport: { width: 375, height: 700 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await mobile.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "networkidle" });
  await mobile.evaluate((segs) => {
    const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
    ps[0].preferences.autoAdvance = { words: true };
    localStorage.setItem("tt:profiles", JSON.stringify(ps));
  });
  await mobile.reload({ waitUntil: "networkidle" });
  await mobile.waitForSelector(".tt-char", { timeout: 8000 });
  await mobile.tap(".tt-stage").catch(() => {});
  await mobile.focus("#tt-input").catch(() => {});
  const mt = await mobile.$$eval(".tt-char", (els) => els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
  for (const ch of mt) await mobile.keyboard.type(ch, { delay: 60 });
  await mobile.waitForTimeout(1500);
  chk(!(await mobile.$eval("#tt-results", (el) => el.hidden)), "L. touch device still shows the card with the switch on");
  chk((await mobile.getAttribute("#tt-autoadvance", "aria-disabled")) === "true", "L. and the Auto button reads as unavailable there");
  // A tap on the unavailable button must not flip the stored switch.
  await mobile.evaluate(() => {
    const ps = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
    ps[0].preferences.autoAdvance = {};
    localStorage.setItem("tt:profiles", JSON.stringify(ps));
  });
  await mobile.reload({ waitUntil: "networkidle" });
  await mobile.waitForSelector("#tt-autoadvance", { timeout: 8000 });
  // force: Playwright refuses to tap an aria-disabled element; a real
  // finger does not, since aria-disabled is not the disabled property.
  await mobile.tap("#tt-autoadvance", { force: true });
  await mobile.waitForTimeout(300);
  const tapped = await mobile.evaluate(() => JSON.parse(localStorage.getItem("tt:profiles"))[0].preferences.autoAdvance);
  chk(!tapped || tapped.words !== true, "L. a tap on it writes nothing", JSON.stringify(tapped));
  chk((await mobile.getAttribute("#tt-autoadvance", "aria-pressed")) === "false", "L. and does not light it");
  await mobile.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
