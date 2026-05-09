/* In-page search for the user guide — filters h2 sections and highlights
   matches. Clearing the input restores the original layout. */

const input = document.getElementById("guide-search-input");
const count = document.getElementById("guide-search-count");
const body = document.querySelector(".article-body");
const tocLinks = Array.from(document.querySelectorAll(".article-toc__list a"));

if (input && body) {
  // A "section" = an h2 plus everything until the next h2.
  const sections = [];
  const heads = Array.from(body.querySelectorAll("h2"));
  heads.forEach((h, i) => {
    const block = [];
    let n = h.nextElementSibling;
    while (n && n.tagName !== "H2") { block.push(n); n = n.nextElementSibling; }
    sections.push({ heading: h, blocks: block, text: (h.textContent + " " + block.map((b) => b.textContent).join(" ")).toLowerCase() });
  });

  const setVisible = (sec, visible) => {
    sec.heading.style.display = visible ? "" : "none";
    sec.blocks.forEach((b) => { b.style.display = visible ? "" : "none"; });
  };

  const restore = () => {
    sections.forEach((s) => setVisible(s, true));
    tocLinks.forEach((l) => l.classList.remove("is-dimmed"));
    body.querySelectorAll("mark.guide-hit").forEach((m) => {
      const t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    });
    count.textContent = "";
  };

  const highlightInNode = (node, q) => {
    if (node.nodeType === 3) {
      const idx = node.nodeValue.toLowerCase().indexOf(q);
      if (idx === -1) return 0;
      const before = node.nodeValue.slice(0, idx);
      const match = node.nodeValue.slice(idx, idx + q.length);
      const after = node.nodeValue.slice(idx + q.length);
      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      const mark = document.createElement("mark");
      mark.className = "guide-hit";
      mark.textContent = match;
      frag.appendChild(mark);
      const afterTextNode = after ? document.createTextNode(after) : null;
      if (afterTextNode) frag.appendChild(afterTextNode);
      node.parentNode.replaceChild(frag, node);
      return 1 + (afterTextNode ? highlightInNode(afterTextNode, q) : 0);
    }
    if (node.nodeType !== 1 || /^(SCRIPT|STYLE|MARK)$/.test(node.tagName)) return 0;
    let total = 0;
    Array.from(node.childNodes).forEach((c) => { total += highlightInNode(c, q); });
    return total;
  };

  let timer = null;
  const apply = () => {
    const q = input.value.trim().toLowerCase();
    body.querySelectorAll("mark.guide-hit").forEach((m) => {
      const t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    });
    if (!q) { restore(); return; }
    let visible = 0, hits = 0;
    sections.forEach((s) => {
      const has = s.text.includes(q);
      setVisible(s, has);
      if (has) {
        visible++;
        hits += highlightInNode(s.heading, q);
        s.blocks.forEach((b) => { hits += highlightInNode(b, q); });
      }
    });
    tocLinks.forEach((l) => {
      const target = l.dataset.target;
      const sec = sections.find((s) => s.heading.id === target);
      l.classList.toggle("is-dimmed", !!sec && !sec.text.includes(q));
    });
    count.textContent = visible
      ? `${visible} section${visible === 1 ? "" : "s"} · ${hits} match${hits === 1 ? "" : "es"}`
      : "No matches";
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 80);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; restore(); }
  });
}
