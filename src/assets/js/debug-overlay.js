/* Debug overlay for diagnosing the three persistent live-site bugs:
   tape mode failing to scroll, mobile mode-sheet sub-menus, and the
   tap-to-type pause issue.

   Activated by ?debug=1 in the URL or `tt:debug=true` in localStorage.
   Renders a fixed corner widget showing live values: last keystroke
   delta, engine pause state + last pauseTimer caller, tape transform
   state, mobile sheet/dropdown state, current service-worker
   controller URL.

   No-op when the flag is off — does not import or run anything that
   would touch the engine. Single side effect: instruments
   engine.pauseTimer so we can capture the call site of any pause
   attempt (this is the bit we have NO visibility into without it). */

const FLAG_KEY = "tt:debug";

function isOn() {
  try {
    if (new URLSearchParams(location.search).get("debug") === "1") {
      try { localStorage.setItem(FLAG_KEY, "true"); } catch {}
      return true;
    }
    return localStorage.getItem(FLAG_KEY) === "true";
  } catch { return false; }
}

if (isOn()) {
  bootDebugOverlay();
}

function bootDebugOverlay() {
  // Build the overlay DOM.
  const css = `
    .tt-debug{
      position:fixed;bottom:.4rem;left:.4rem;z-index:99999;
      max-width:min(96vw, 380px);max-height:60vh;overflow:auto;
      background:rgba(20,22,30,.96);color:#e8e6df;
      border:1px solid rgba(255,255,255,.18);
      border-radius:8px;padding:.55rem .7rem;
      font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size:11px;line-height:1.45;
      box-shadow:0 8px 24px rgba(0,0,0,.45);
      pointer-events:auto;
    }
    .tt-debug h4{
      margin:0 0 .35rem;font-size:10px;letter-spacing:.14em;
      text-transform:uppercase;color:#9aa1ad;font-weight:600;
      display:flex;justify-content:space-between;align-items:center;gap:.5rem;
    }
    .tt-debug__close{
      background:transparent;border:0;color:#9aa1ad;
      cursor:pointer;font-size:14px;padding:0 .2rem;
    }
    .tt-debug__close:hover{color:#fff}
    .tt-debug__section{padding:.3rem 0;border-top:1px dotted rgba(255,255,255,.12)}
    .tt-debug__section:first-of-type{border-top:0}
    .tt-debug__row{display:flex;gap:.5rem;justify-content:space-between}
    .tt-debug__k{color:#9aa1ad}
    .tt-debug__v{color:#fff;font-variant-numeric:tabular-nums;text-align:right;word-break:break-all}
    .tt-debug__v--alert{color:#ff9080}
    .tt-debug__v--ok{color:#76c893}
    .tt-debug__log{
      max-height:120px;overflow:auto;font-size:10px;color:#cfd5e1;
      background:rgba(0,0,0,.25);border-radius:4px;padding:.25rem .35rem;
      margin-top:.3rem;white-space:pre-wrap;
    }
    .tt-debug__log-line{display:block}
    .tt-debug__btn-row{display:flex;gap:.3rem;margin-top:.4rem;flex-wrap:wrap}
    .tt-debug__btn{
      background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);
      color:#e8e6df;border-radius:4px;padding:.2rem .5rem;font-size:10px;
      cursor:pointer;font-family:inherit;
    }
    .tt-debug__btn:hover{background:rgba(255,255,255,.12)}
    @media (prefers-reduced-motion: no-preference){
      .tt-debug.is-flash{animation:tt-debug-flash 280ms ease-out}
    }
    @keyframes tt-debug-flash{
      from{background:rgba(193,65,60,.95)}
      to{background:rgba(20,22,30,.96)}
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const root = document.createElement("aside");
  root.className = "tt-debug";
  root.innerHTML = `
    <h4>
      <span>GT debug</span>
      <button type="button" class="tt-debug__close" aria-label="Close debug overlay">×</button>
    </h4>
    <div class="tt-debug__section" data-section="page">
      <div class="tt-debug__row"><span class="tt-debug__k">page</span><span class="tt-debug__v" data-v="page">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">sw script</span><span class="tt-debug__v" data-v="sw">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">build (cssV)</span><span class="tt-debug__v" data-v="ver">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">viewport</span><span class="tt-debug__v" data-v="vp">—</span></div>
    </div>
    <div class="tt-debug__section" data-section="engine">
      <div class="tt-debug__row"><span class="tt-debug__k">mode</span><span class="tt-debug__v" data-v="mode">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">running</span><span class="tt-debug__v" data-v="running">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">cursor</span><span class="tt-debug__v" data-v="cursor">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">last typed Δ</span><span class="tt-debug__v" data-v="lastTyped">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">_pauseAt</span><span class="tt-debug__v" data-v="pauseAt">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">_userPaused</span><span class="tt-debug__v" data-v="userPaused">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">last pause call</span><span class="tt-debug__v" data-v="pauseCaller">—</span></div>
    </div>
    <div class="tt-debug__section" data-section="tape">
      <div class="tt-debug__row"><span class="tt-debug__k">tape class</span><span class="tt-debug__v" data-v="tapeCls">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">char[0] cached x</span><span class="tt-debug__v" data-v="char0">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">_tapeShift</span><span class="tt-debug__v" data-v="shift">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">_tapeTarget</span><span class="tt-debug__v" data-v="target">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">inner.transform</span><span class="tt-debug__v" data-v="tform">—</span></div>
    </div>
    <div class="tt-debug__section" data-section="sheet">
      <div class="tt-debug__row"><span class="tt-debug__k">mode-sheet</span><span class="tt-debug__v" data-v="sheet">—</span></div>
      <div class="tt-debug__row"><span class="tt-debug__k">open dropdown</span><span class="tt-debug__v" data-v="ddOpen">—</span></div>
    </div>
    <div class="tt-debug__section">
      <div class="tt-debug__k">Event log</div>
      <div class="tt-debug__log" data-v="log"></div>
      <div class="tt-debug__btn-row">
        <button type="button" class="tt-debug__btn" data-act="copy">Copy snapshot</button>
        <button type="button" class="tt-debug__btn" data-act="clear">Clear log</button>
        <button type="button" class="tt-debug__btn" data-act="off">Turn off (?debug=0)</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const $ = (key) => root.querySelector(`[data-v="${key}"]`);
  const log = (line, kind) => {
    const el = $("log");
    if (!el) return;
    const t = new Date().toLocaleTimeString(undefined, { hour12: false });
    const span = document.createElement("span");
    span.className = "tt-debug__log-line";
    span.textContent = `[${t}] ${line}`;
    if (kind === "alert") span.style.color = "#ff9080";
    if (kind === "ok") span.style.color = "#76c893";
    el.appendChild(span);
    el.scrollTop = el.scrollHeight;
  };
  const flash = () => {
    root.classList.remove("is-flash");
    void root.offsetWidth;
    root.classList.add("is-flash");
  };

  root.querySelector(".tt-debug__close").addEventListener("click", () => {
    root.style.display = "none";
  });
  root.querySelector('[data-act="clear"]').addEventListener("click", () => {
    const el = $("log");
    if (el) el.innerHTML = "";
  });
  root.querySelector('[data-act="off"]').addEventListener("click", () => {
    try { localStorage.removeItem(FLAG_KEY); } catch {}
    location.search = location.search.replace(/[?&]debug=1/, "");
    root.style.display = "none";
  });
  root.querySelector('[data-act="copy"]').addEventListener("click", async () => {
    const snap = capture();
    try {
      await navigator.clipboard.writeText(snap);
      log("Snapshot copied to clipboard.", "ok");
    } catch {
      log("Clipboard copy failed -- snapshot logged to console.", "alert");
      console.log("[tt-debug snapshot]\n" + snap);
    }
  });

  function capture() {
    const eng = window.__tt;
    const out = {};
    out.page = document.body.dataset.page || "(none)";
    out.viewport = window.innerWidth + "x" + window.innerHeight;
    out.cssVersion = window.__cssVersion || "(none)";
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    out.sw = sw ? sw.scriptURL : "(no controller)";
    if (eng) {
      out.mode = eng.mode;
      out.running = !!eng.running;
      out.cursor = eng.cursor;
      out.pauseAt = eng._pauseAt || 0;
      out.userPaused = !!eng._userPaused;
      out.lastTypedAt = eng._lastTypedAt || 0;
      const r = eng.renderer;
      if (r) {
        out.tapeShift = r._tapeShift;
        out.tapeTarget = r._tapeTarget;
        out.tapeChar0 = r._tapeChar0X;
        out.innerTransform = r.inner && r.inner.style && r.inner.style.transform || "";
      }
    }
    out.modeSheetOpen = document.body.classList.contains("is-mode-sheet-open");
    const openDd = document.querySelector('.mode-bar__chev[aria-expanded="true"]');
    out.openDropdown = openDd ? openDd.getAttribute("data-dropdown-trigger") : null;
    return JSON.stringify(out, null, 2);
  }

  // ── Engine instrumentation ──────────────────────────────────────
  // Wait for window.__tt to be set by the engine, then wrap
  // pauseTimer so every call logs its stack frame. This is the
  // single most important diagnostic for the pause-on-type bug.
  let engInstrumented = false;
  function instrumentEngine() {
    const eng = window.__tt;
    if (!eng || engInstrumented) return;
    engInstrumented = true;
    const origPause = eng.pauseTimer.bind(eng);
    eng.pauseTimer = function() {
      // Capture the caller from the stack. Slice off the first 2
      // frames (Error + this wrapper) to show what actually invoked.
      const stack = (new Error().stack || "").split("\n").slice(2, 5)
        .map((s) => s.trim().replace(/^at\s+/, "")).join(" | ");
      const guarded = eng._lastTypedAt && (performance.now() - eng._lastTypedAt) < 450;
      const result = origPause();
      $("pauseCaller").textContent = (guarded ? "REJECTED " : "set ") + (stack.slice(0, 80));
      $("pauseCaller").classList.toggle("tt-debug__v--alert", !guarded);
      $("pauseCaller").classList.toggle("tt-debug__v--ok", guarded);
      log((guarded ? "pauseTimer REJECTED (typing guard) " : "pauseTimer FIRED ") + stack, guarded ? "ok" : "alert");
      flash();
      return result;
    };
    log("engine instrumented", "ok");
  }

  // ── Live updates via rAF ────────────────────────────────────────
  function tick() {
    instrumentEngine();
    const eng = window.__tt;
    $("page").textContent = document.body.dataset.page || "(none)";
    $("vp").textContent = window.innerWidth + "x" + window.innerHeight;
    $("ver").textContent = (window.__cssVersion || "(missing)").toString().slice(-8);
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    $("sw").textContent = sw ? sw.scriptURL.replace(location.origin, "") : "(none)";

    if (eng) {
      $("mode").textContent = eng.mode || "—";
      $("running").textContent = String(!!eng.running);
      $("running").classList.toggle("tt-debug__v--ok", !!eng.running);
      $("cursor").textContent = (eng.cursor || 0) + "/" + (eng.targetArr && eng.targetArr.length || 0);
      $("lastTyped").textContent = eng._lastTypedAt
        ? Math.round(performance.now() - eng._lastTypedAt) + "ms ago"
        : "never";
      $("pauseAt").textContent = eng._pauseAt ? String(Math.round(eng._pauseAt)) : "0";
      $("pauseAt").classList.toggle("tt-debug__v--alert", !!eng._pauseAt);
      $("userPaused").textContent = String(!!eng._userPaused);
      $("userPaused").classList.toggle("tt-debug__v--alert", !!eng._userPaused);
      const r = eng.renderer;
      if (r) {
        $("tapeCls").textContent = r.container && r.container.classList.contains("tt-text--tape") ? "yes" : "no";
        $("char0").textContent = r._tapeChar0X == null ? "(uncached)" : Math.round(r._tapeChar0X) + "px";
        $("shift").textContent = (r._tapeShift != null ? Math.round(r._tapeShift) : "—") + "px";
        $("target").textContent = (r._tapeTarget != null ? Math.round(r._tapeTarget) : "—") + "px";
        $("tform").textContent = (r.inner && r.inner.style && r.inner.style.transform) || "(none)";
      }
    } else {
      $("mode").textContent = "(no engine)";
    }

    $("sheet").textContent = document.body.classList.contains("is-mode-sheet-open") ? "OPEN" : "closed";
    $("sheet").classList.toggle("tt-debug__v--ok", document.body.classList.contains("is-mode-sheet-open"));
    const openDd = document.querySelector('.mode-bar__chev[aria-expanded="true"]');
    $("ddOpen").textContent = openDd ? openDd.getAttribute("data-dropdown-trigger") || "?" : "none";

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  log("debug overlay armed -- " + new Date().toLocaleTimeString());
}
