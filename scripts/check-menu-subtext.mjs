/* The megamenu and the hamburger panel list their pages by label alone.

   Jon: the one-line descriptions under every menu item were information
   overload. They are gone from both menus; the hamburger's search still
   matches them because each item keeps its words in data-haystack.

   What must hold:
     A. No description element is rendered in either menu, on any page.
     B. Every hamburger item still carries a haystack with more words
        than its label, and filtering by a description word still finds
        the page (search did not lose the descriptions with the text).
     C. A megamenu item is one row: no taller than its 32 px chip (or
        its line) plus padding, the label does not wrap, and the chip
        is vertically centred on the label rather than hanging above a
        missing second line.
     D. Hamburger links keep their 44 px touch height at 375 px.
     E. Nothing else in the menus changed: the same labels and hrefs as
        the navigation data, in the same order.

   Usage:
     OG_SKIP=1 npm run build
     node scripts/check-menu-subtext.mjs        # PORT=... to move it
*/
import { createServer } from "node:http";
import { readFile, stat, readdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const TASK = "menu-subtext";
const PORT = Number(process.env.PORT) || 8100 + ([...TASK].reduce((a, c) => a + c.charCodeAt(0), 0) % 600);
const ROOT = resolve("_site");

let pass = 0, fail = 0;
const chk = (ok, name, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection: ${err && err.message ? err.message : err}`);
  console.log("\nRUN ABORTED, the counts below are partial.");
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
});

// ---------------------------------------------------------------- server
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon",
};
try { await stat(join(ROOT, "index.html")); } catch {
  console.log("  FAIL  _site/index.html is missing: build first");
  console.log("\n0 passed, 1 failed"); process.exit(1);
}
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const B = `http://127.0.0.1:${PORT}`;

// --------------------------------------------------- A. static, every page
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const pages = await walk(ROOT);
let withMega = 0, withPanel = 0, megaDesc = 0, panelDesc = 0;
for (const f of pages) {
  const h = await readFile(f, "utf8");
  if (h.includes("mega__item")) withMega++;
  if (h.includes("nav-panel__item")) withPanel++;
  if (h.includes("mega__desc")) megaDesc++;
  if (h.includes("nav-panel__item-desc")) panelDesc++;
}
chk(withMega > 100 && withPanel > 100, "A. the menus are on the pages (sanity)", `${pages.length} pages, megamenu on ${withMega}, panel on ${withPanel}`);
chk(megaDesc === 0, "A. no page renders a megamenu description", `${megaDesc} pages still do`);
chk(panelDesc === 0, "A. no page renders a hamburger description", `${panelDesc} pages still do`);

// ------------------------------------------------------------ browser
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
page.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 160)));
await page.goto(`${B}/`, { waitUntil: "networkidle" });

// E. labels and hrefs match the navigation data, in order
const nav = (await import(resolve("src/_data/megamenu.js"))).default; // navigation.js is the top bar, megamenu.js the panels
const navData = typeof nav === "function" ? await nav() : nav;
const navItems = Array.isArray(navData) ? navData : (navData.megamenu || []);
const expected = [];
for (const item of navItems) for (const g of item.groups || []) for (const sub of g.items || []) expected.push([sub.label, sub.url]);
const rendered = await page.$$eval(".mega__item", (els) => els.map((a) => [a.querySelector(".mega__label").textContent.trim(), a.getAttribute("href")]));
chk(expected.length > 20 && rendered.length === expected.length, "E. the megamenu renders every item in the data", `${rendered.length} of ${expected.length}`);
chk(JSON.stringify(rendered) === JSON.stringify(expected), "E. same labels and hrefs, same order");

// B. haystacks still carry the descriptions
const hay = await page.$$eval(".nav-panel__item", (els) => els.map((li) => ({
  label: (li.querySelector(".nav-panel__item-label") || {}).textContent?.trim().toLowerCase() || "",
  hay: (li.getAttribute("data-haystack") || "").trim(),
})));
const richer = hay.filter((x) => x.hay.length > x.label.length + 2).length;
chk(hay.length > 30 && richer === hay.length, "B. every hamburger item keeps a haystack richer than its label", `${richer} of ${hay.length}`);
chk(hay.every((x) => x.hay.includes(x.label.split(" ")[0])), "B. and the haystack still contains the label's first word");

// C. one line, chip centred
const openBtn = await page.$(".site-nav__item [aria-haspopup], .site-nav__item > button, .site-nav__item > a");
await openBtn.hover();
await page.waitForTimeout(400);
const geom = await page.evaluate(() => {
  const items = [...document.querySelectorAll(".site-nav__item[data-open='true'] .mega__item")].slice(0, 12);
  if (!items.length) return null;
  return items.map((a) => {
    const r = a.getBoundingClientRect();
    const label = a.querySelector(".mega__label").getBoundingClientRect();
    const chip = a.querySelector(".mega__chip");
    const cs = getComputedStyle(a);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const lh = parseFloat(getComputedStyle(a.querySelector(".mega__label")).lineHeight) || 20;
    const chipH = chip ? chip.getBoundingClientRect().height : 0;
    const chipMid = chip ? chip.getBoundingClientRect().top + chipH / 2 : null;
    const labelMid = label.top + label.height / 2;
    return { h: r.height, labelH: label.height, lh, chipH, padY, chipOff: chipMid == null ? 0 : Math.abs(chipMid - labelMid) };
  });
});
chk(!!geom && geom.length > 0, "C. the first megamenu opens on hover", geom ? `${geom.length} items measured` : "no open menu");
if (geom) {
  /* The row is as tall as its tallest child plus padding: the 32 px chip
     when there is one, else the label's line. A second line of text
     would push it past that. */
  const overs = geom.filter((g) => g.h > Math.max(g.chipH, g.lh) + g.padY + 2);
  chk(overs.length === 0, "C. an item is one row: no taller than its chip or its line plus padding", `${overs.length} taller; sample ${JSON.stringify(geom[0])}`);
  const twoLine = geom.filter((g) => g.labelH > g.lh * 1.3);
  chk(twoLine.length === 0, "C. the label itself is a single line", `${twoLine.length} wrapped`);
  const worst = Math.max(...geom.map((g) => g.chipOff));
  chk(worst <= 3, "C. the chip is vertically centred on the label", `worst offset ${worst.toFixed(1)} px`);
}
await page.close();

// B (behaviour). the hamburger search finds a page by a description word
const phone = await browser.newPage({ viewport: { width: 375, height: 800 }, serviceWorkers: "block", hasTouch: true, isMobile: true });
phone.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 160)));
await phone.goto(`${B}/`, { waitUntil: "networkidle" });
const opener = await phone.$("[aria-controls='nav-panel'], .nav-toggle, button[aria-label*='menu' i]");
chk(!!opener, "B. the hamburger opener exists on a phone");
if (opener) {
  await opener.click();
  await phone.waitForTimeout(400);
  const search = await phone.$("#nav-panel-search");
  chk(!!search, "B. the panel has its search box");
  if (search) {
    await search.fill("hosting");
    await phone.waitForTimeout(250);
    const visible = await phone.$$eval(".nav-panel__item", (els) => els.filter((li) => li.offsetParent !== null && !li.hidden).map((li) => li.querySelector(".nav-panel__item-label").textContent.trim()));
    chk(visible.includes("Cost to run") && visible.length <= 3, "B. typing a description word (hosting) still finds the page by its label", JSON.stringify(visible));
    await search.fill("");
    await phone.waitForTimeout(250);
  }
  // D. touch height: a fresh panel (the cleared filter leaves the
  //    sections collapsed), open the first section the way a thumb does
  await phone.goto(`${B}/`, { waitUntil: "networkidle" });
  await (await phone.$("[aria-controls='nav-panel'], .nav-toggle, button[aria-label*='menu' i]")).click();
  await phone.waitForTimeout(400);
  const summary = await phone.$(".nav-panel__group summary");
  if (summary) { await summary.scrollIntoViewIfNeeded(); await summary.click(); }
  await phone.waitForTimeout(350);
  const state = await phone.evaluate(() => {
    const d = document.querySelector(".nav-panel__group");
    const links = [...d.querySelectorAll(".nav-panel__list a")].slice(0, 8);
    return { open: d.open, heights: links.map((a) => a.getBoundingClientRect().height), visible: links.filter((a) => a.offsetParent !== null).length };
  });
  chk(state.open && state.heights.length > 0 && state.heights.every((h) => h >= 44), "D. hamburger links keep a 44 px touch height at 375 px", `open=${state.open} visible=${state.visible} ${JSON.stringify(state.heights.map((h) => Math.round(h)))}`);
  const desc = await phone.$$eval(".nav-panel__group .nav-panel__item a", (els) => els.filter((a) => a.children.length > 1).length);
  chk(desc === 0, "D. each open link has the label alone inside it", `${desc} links with a second child`);
}
await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
