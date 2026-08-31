#!/usr/bin/env node
/* A theme built on /settings/ must still be there on the next page.

   The builder saved the theme correctly -- preferences.customThemes[]
   plus preferences.theme = "custom:<id>" -- and then nothing ever read
   it back. The only thing that made a custom theme visible was
   theme-builder.js setting inline styles on the <html> of the settings
   page itself, so the theme applied, looked saved, and vanished the
   moment you navigated anywhere.

   The trap in testing this: assert only "the token is set on another
   page" and a build that sets that token for everyone passes. So this
   also asserts the token is ABSENT with no theme saved, and absent
   again after Delete and after Reset.

   Usage: node scripts/check-theme-persistence.mjs   (needs _site served on 8765) */
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:8765";
const PROBE = "--bg-0";
const COLOR = "#123456";

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
  ok ? pass++ : fail++;
};
process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err?.message ?? err}`);
  console.log("\nRUN ABORTED — counts below are partial.");
  process.exit(1);
});

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
p.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 200)));

/* Read the inline override main.js is supposed to have painted. Not the
   computed value -- every theme sets --bg-0, so computed style would be
   non-empty whether or not the custom theme was applied, and the test
   would pass on a completely broken build. */
const inlineToken = () => p.evaluate((t) => document.documentElement.style.getPropertyValue(t).trim(), PROBE);

async function freshSettings() {
  await p.goto(B + "/settings/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForSelector("#theme-builder input[data-token]", { timeout: 30000 });
}

await freshSettings();

console.log("\n## Baseline — with nothing saved, no page carries the override");
await p.goto(B + "/practice/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(400);
chk((await inlineToken()) === "", `${PROBE} is not set inline when no custom theme exists`,
  JSON.stringify(await inlineToken()));

console.log("\n## Save a custom theme on /settings/");
await freshSettings();
await p.evaluate((args) => {
  const [tok, val] = args;
  const input = document.querySelector(`#theme-builder input[data-token="${tok}"]`);
  input.value = val;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("theme-builder-name").value = "Gate theme";
}, [PROBE, COLOR]);
await p.click("#theme-builder-save");
await p.waitForTimeout(300);

const stored = await p.evaluate(() => {
  const profiles = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
  const active = localStorage.getItem("tt:active-profile");
  const prof = profiles.find((x) => x.id === JSON.parse(active || '""')) || profiles[0];
  const prefs = (prof && prof.preferences) || {};
  return { theme: prefs.theme || null, count: (prefs.customThemes || []).length };
});
chk(stored.count === 1, "the theme was written to preferences.customThemes[]", JSON.stringify(stored));
chk(typeof stored.theme === "string" && stored.theme.indexOf("custom:") === 0,
  "…and selected via preferences.theme", JSON.stringify(stored.theme));

console.log("\n## It survives navigation — this is the bug");
for (const path of ["/practice/", "/lessons/", "/stats/"]) {
  await p.goto(B + path, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(400);
  const got = await inlineToken();
  chk(got.toLowerCase() === COLOR, `${PROBE} is still ${COLOR} on ${path}`, JSON.stringify(got));
}

console.log("\n## Only the saved tokens are applied — no blanket override");
await p.goto(B + "/practice/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(300);
const bogus = await p.evaluate(() => document.documentElement.style.getPropertyValue("--not-a-real-token").trim());
chk(bogus === "", "a token that was never saved is not invented");

console.log("\n## A theme cannot smuggle in a network request");
/* main.js restricts applied values to hex. The builder's own inputs are
   <input type="color"> and cannot produce anything else, but a theme
   also arrives through Import from pasted JSON, and a CSS value may
   contain url(), which fetches. Nothing tested that guard. */
{
  const EVIL = "https://evil.example.invalid/pixel.png";
  const requested = [];
  const listener = (req) => { if (req.url().includes("evil.example.invalid")) requested.push(req.url()); };
  p.on("request", listener);

  await freshSettings();
  // Written straight to the profile, bypassing the colour inputs — this
  // is the shape a hand-edited or imported theme could take.
  await p.evaluate(async (evil) => {
    const prof = await import("/assets/js/profiles.js");
    prof.updateActive((x) => {
      x.preferences = x.preferences || {};
      x.preferences.customThemes = [{
        id: "t_evil", name: "Evil",
        tokens: { "--bg-0": `url("${evil}")`, "--bg-2": "#abcdef" },
      }];
      x.preferences.theme = "custom:t_evil";
      return x;
    });
  }, EVIL);

  await p.goto(B + "/practice/", { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  const bg0 = await p.evaluate(() => document.documentElement.style.getPropertyValue("--bg-0").trim());
  const bg2 = await p.evaluate(() => document.documentElement.style.getPropertyValue("--bg-2").trim());

  chk(bg0 === "", "a url() value is refused", JSON.stringify(bg0));
  chk(requested.length === 0, "…and no request is made to it", requested.join(","));
  // Selective, not a blanket refusal: the hex token beside it still applies.
  chk(bg2.toLowerCase() === "#abcdef", "…while the valid hex token in the same theme still applies",
    JSON.stringify(bg2));
  p.off("request", listener);
}

console.log("\n## Reset clears the selection, and it stays cleared");
await p.goto(B + "/settings/", { waitUntil: "domcontentloaded" });
await p.waitForSelector("#theme-builder-reset", { timeout: 30000 });
await p.click("#theme-builder-reset");
await p.waitForTimeout(300);
await p.goto(B + "/practice/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(400);
chk((await inlineToken()) === "", "after Reset, the override is gone on the next page",
  JSON.stringify(await inlineToken()));

console.log("\n## Deleting the active theme clears the selection too");
// Start from a clean profile so exactly one theme exists and there is
// no ambiguity about which row the Delete button belongs to.
await freshSettings();
await p.evaluate((args) => {
  const [tok, val] = args;
  const input = document.querySelector(`#theme-builder input[data-token="${tok}"]`);
  input.value = val;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("theme-builder-name").value = "Doomed theme";
}, [PROBE, COLOR]);
await p.click("#theme-builder-save");
await p.waitForTimeout(300);

// deleteTheme() guards on window.confirm.
p.on("dialog", (d) => d.accept());
const delBtn = await p.$("#theme-builder-saved-list [data-delete]");
chk(!!delBtn, "the saved theme has a Delete button");
if (delBtn) {
  await delBtn.click();
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem("tt:profiles") || "[]");
    const active = localStorage.getItem("tt:active-profile");
    const prof = profiles.find((x) => x.id === JSON.parse(active || '""')) || profiles[0];
    const prefs = (prof && prof.preferences) || {};
    return { theme: prefs.theme || null, count: (prefs.customThemes || []).length };
  });
  chk(after.count === 0, "the theme is gone from customThemes[]", JSON.stringify(after));
  chk(!after.theme || after.theme.indexOf("custom:") !== 0,
    "preferences.theme no longer points at a theme that does not exist", JSON.stringify(after.theme));
  await p.goto(B + "/practice/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(400);
  chk((await inlineToken()) === "", "and the override is gone on the next page",
    JSON.stringify(await inlineToken()));
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
