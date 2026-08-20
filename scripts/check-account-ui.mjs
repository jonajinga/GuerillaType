import { chromium } from "playwright";
const B = "http://localhost:8765";
const b = await chromium.launch();
let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

// 1. Signed out (the default), no console errors.
{
  const p = await b.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(String(e)));
  p.on("console", m => { if (m.type() === "error" && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + "/settings/", { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  chk(errs.length === 0, "settings: no console errors", errs.join(" | ").slice(0, 160));
  chk(await p.isVisible("#account-signed-out"), "signed-out state shown by default");
  chk(!(await p.isVisible("#account-signed-in")), "signed-in state hidden");
  chk(await p.isVisible("#signin-google") && await p.isVisible("#signin-github"), "both providers offered");
  await p.close();
}

// 2. auth_error is surfaced in the app's voice and stripped from the URL.
{
  const p = await b.newPage();
  await p.goto(B + "/settings/?auth_error=email_unverified", { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  const shown = await p.isVisible("#account-error");
  const text = await p.textContent("#account-error");
  chk(shown && /isn't verified/.test(text), "auth_error rendered", JSON.stringify((text||"").slice(0,60)));
  chk(!p.url().includes("auth_error"), "auth_error stripped so refresh can't replay it", p.url());
  await p.close();
}

// 3. A cached session paints immediately, without waiting on the network.
{
  const p = await b.newPage();
  await p.goto(B + "/settings/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.setItem("tt:session.v1", JSON.stringify({
    user: { id: "u1", email: "a@example.com", handle: "BrassKestrel482" },
    expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
    lastVerifiedAt: new Date().toISOString(),
  })));
  await p.goto(B + "/settings/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#account-signed-in:not([hidden])", { timeout: 3000 }).catch(()=>{});
  chk(await p.isVisible("#account-signed-in"), "cached session paints signed-in");
  chk((await p.textContent("#account-handle")) === "BrassKestrel482", "handle rendered");
  // No API server is running, so revalidation fails as a network error --
  // the grace window must keep the user signed in.
  await p.waitForTimeout(1200);
  chk(await p.isVisible("#account-signed-in"), "network failure does NOT sign the user out (grace)");
  await p.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
