/* Reproduces the reported bug: a multi-segment import must be navigable
   past the first segment, and must remember where you stopped.
   Usage: node scripts/check-custom-segments.mjs  (needs _site served on 8765) */
import { chromium } from "playwright";
const B = process.env.BASE_URL || "http://localhost:8765";
let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

const b = await chromium.launch();
/* Service worker blocked: pwa.js reloads the page on controllerchange,
   and a reload landing mid-test rebuilds the DOM under whatever is being
   driven. This gate survives it today only because its navigations wait
   on networkidle, which happens to outlast the reload — that is luck,
   not design, and the other three custom gates block it explicitly. */
const p = await b.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
p.on("pageerror", e => console.log("  PAGEERROR:", String(e).slice(0, 140)));

// Seed a 4-segment text, as a PDF import would produce.
await p.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await p.evaluate(() => localStorage.setItem("tt:custom-texts", JSON.stringify([{
  id: "c_big", title: "Big PDF", createdAt: new Date().toISOString(), bytes: 120, lastSeg: 0,
  segments: ["Alpha one text.", "Bravo two text.", "Charlie three text.", "Delta four text."], meta: null,
}])));

const typeThrough = async (seg) => {
  await p.goto(`${B}/practice/?mode=custom&custom=c_big&seg=${seg}`, { waitUntil: "networkidle" });
  await p.waitForSelector(".tt-char", { timeout: 8000 });
  await p.click(".tt-stage").catch(() => {});
  const target = await p.$$eval(".tt-char", els =>
    els.map(e => e.classList.contains("tt-char--space") ? " " : e.textContent).join(""));
  for (const ch of target) await p.keyboard.type(ch, { delay: 4 });
  await p.waitForTimeout(1000);
  return target;
};

const t0 = await typeThrough(0);
chk(t0.startsWith("Alpha"), "segment 0 renders", JSON.stringify(t0.slice(0, 18)));

const nextHref = await p.getAttribute("#tt-next-seg", "href").catch(() => null);
chk(!!nextHref && /seg=1/.test(nextHref || ""), "‘Next segment →’ button exists after finishing", nextHref || "(missing)");

const progress = (await p.textContent(".results__progress").catch(() => "")) || "";
chk(/1\s+of\s+4/i.test(progress), "shows position in the text", JSON.stringify(progress.trim()));

// Follow it — the user's actual journey.
await p.click("#tt-next-seg");
await p.waitForSelector(".tt-char", { timeout: 8000 });
const seg1 = await p.$$eval(".tt-char", els => els.slice(0, 12).map(e => e.textContent).join(""));
chk(seg1.startsWith("Bravo"), "clicking it actually advances", JSON.stringify(seg1));

// Bookmark: /custom/ should now resume, not restart.
await p.goto(B + "/custom/", { waitUntil: "networkidle" });
await p.waitForTimeout(700);
const btn = await p.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find(x => /mode=custom/.test(x.getAttribute("href") || ""));
  return a ? { text: a.textContent.trim(), href: a.getAttribute("href") } : null;
});
chk(!!btn && /seg=1/.test(btn.href), "saved list resumes where you stopped", btn ? btn.href : "(none)");
chk(!!btn && /Resume/i.test(btn.text), "button reads ‘Resume’", btn ? btn.text : "");
const meta = await p.textContent(".saved-item__meta").catch(() => "");
chk(/resuming at 2 of 4/i.test(meta || ""), "list shows progress", JSON.stringify((meta || "").trim()));

// End of text: no next button, a clear finish instead.
await typeThrough(3);
const endNext = await p.$("#tt-next-seg");
const endText = (await p.textContent(".results__actions").catch(() => "")) || (await p.content());
chk(!endNext, "no ‘next’ on the final segment");
chk(/Text finished/i.test(endText), "final segment says the text is finished");

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
