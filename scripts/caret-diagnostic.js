/* Paste into Safari's console on the practice page, then type normally.
   Safari: Develop > Show JavaScript Console  (enable Develop in
   Settings > Advanced > "Show features for web developers").
   Type until the caret looks wrong, then run:  __caretReport()      */
(() => {
  const samples = [];
  const read = () => {
    const cs = [...document.querySelectorAll(".tt-char")]
      .filter(e => !e.classList.contains("tt-char--extra"));
    const caret = document.querySelector(".tt-caret");
    const n = cs.findIndex(e => !e.classList.contains("tt-char--correct")
                             && !e.classList.contains("tt-char--incorrect"));
    if (!caret || n < 0) return null;
    const t = cs[n].getBoundingClientRect(), c = caret.getBoundingClientRect();
    return {
      i: n,
      dx: +(c.left - t.left).toFixed(2),      // caret vs its character
      dy: +(c.top - t.top).toFixed(2),
      charW: +t.width.toFixed(2),
      ch: JSON.stringify(cs[n].textContent),
      font: getComputedStyle(cs[n]).fontFamily.split(",")[0],
      scrollY: Math.round(window.scrollY),
    };
  };
  addEventListener("keydown", () => setTimeout(() => {
    const s = read(); if (s) samples.push(s);
  }, 0), true);

  window.__caretReport = () => {
    if (!samples.length) return console.log("no samples — type a few words first");
    const worst = samples.reduce((a, b) => Math.abs(b.dx) > Math.abs(a.dx) ? b : a);
    const firstBad = samples.find(s => Math.abs(s.dx) > 3);
    console.log("=== caret diagnostic ===");
    console.log("samples        :", samples.length);
    console.log("font in use    :", samples[0].font);
    console.log("char width     :", samples[0].charW, "px");
    console.log("worst offset   :", worst.dx, "px  (dy", worst.dy + ")  at char", worst.i);
    console.log("offset in chars:", (worst.dx / samples[0].charW).toFixed(2));
    console.log("first bad at   :", firstBad ? `char ${firstBad.i} (dx ${firstBad.dx})` : "never exceeded 3px");
    console.log("last 12 samples:");
    console.table(samples.slice(-12));
    return { worst, firstBad, count: samples.length };
  };
  console.log("caret diagnostic armed — type until it looks wrong, then run __caretReport()");
})();
