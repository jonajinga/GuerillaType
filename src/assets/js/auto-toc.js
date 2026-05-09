/* Auto TOC — generates a sticky table of contents from .article-body
   h2/h3 headings. JS-driven smooth scroll with explicit header offset
   for reliable section landing. IntersectionObserver tracks the
   currently-visible section and highlights its TOC link. */

const HEADER_OFFSET = 100; // sticky header (~58) + breathing room

const tocEl = document.querySelector(".article-toc__list");
const body = document.querySelector(".article-body, [data-toc-root]");

if (tocEl && body) {
  const heads = Array.from(body.querySelectorAll("h2, h3"));
  if (heads.length === 0) {
    const wrap = document.querySelector(".article-toc");
    if (wrap) wrap.style.display = "none";
  } else {
    const links = new Map();
    heads.forEach((h, i) => {
      if (!h.id) h.id = slugify(h.textContent) || `s-${i}`;
      const a = document.createElement("a");
      a.href = `#${h.id}`;
      a.textContent = h.textContent;
      a.dataset.level = h.tagName === "H3" ? "3" : "2";
      a.dataset.target = h.id;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        scrollToHeading(h);
        history.replaceState(null, "", `#${h.id}`);
      });
      tocEl.appendChild(a);
      links.set(h.id, a);
    });

    // Active-section highlight via IntersectionObserver. Trigger when a heading
    // crosses the upper third of the viewport (just below the sticky header).
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      links.forEach((l) => l.classList.remove("is-active"));
      const a = links.get(visible[0].target.id);
      if (a) a.classList.add("is-active");
    }, { rootMargin: `-${HEADER_OFFSET}px 0px -65% 0px`, threshold: 0 });
    heads.forEach((h) => obs.observe(h));

    // If the URL already has a hash, jump to it after layout settles.
    if (location.hash) {
      const target = body.querySelector(decodeURI(location.hash));
      if (target) setTimeout(() => scrollToHeading(target), 80);
    }
  }

  // Click "On this page" title to collapse/expand the TOC list.
  // State persists per pathname so the same article reopens collapsed.
  const wrap = document.querySelector(".article-toc");
  const title = wrap && wrap.querySelector(".article-toc__title");
  if (wrap && title) {
    const STATE_KEY = `tt:toc-collapsed:${location.pathname}`;
    try {
      if (localStorage.getItem(STATE_KEY) === "true") wrap.dataset.collapsed = "true";
    } catch {}
    title.setAttribute("role", "button");
    title.setAttribute("tabindex", "0");
    title.setAttribute("aria-expanded", wrap.dataset.collapsed === "true" ? "false" : "true");
    function toggle() {
      const next = wrap.dataset.collapsed === "true" ? "false" : "true";
      wrap.dataset.collapsed = next;
      title.setAttribute("aria-expanded", next === "true" ? "false" : "true");
      try { localStorage.setItem(STATE_KEY, next); } catch {}
    }
    title.addEventListener("click", toggle);
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  }
}

function scrollToHeading(el) {
  const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
  window.scrollTo({ top: y, behavior: "smooth" });
}

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}
