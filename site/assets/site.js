// Mobile navigation, copy buttons on code, and the "On this page" highlight.
(() => {
  const toggle = document.querySelector(".nav-toggle");
  toggle?.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  for (const pre of document.querySelectorAll(".prose pre")) {
    const b = document.createElement("button");
    b.className = "copy";
    b.type = "button";
    b.textContent = "copy";
    b.addEventListener("click", async () => {
      await navigator.clipboard.writeText(pre.innerText.replace(/\ncopy$/, ""));
      b.textContent = "copied";
      setTimeout(() => (b.textContent = "copy"), 1400);
    });
    pre.appendChild(b);
  }

  const links = [...document.querySelectorAll(".toc a")];
  if (!links.length) return;
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const seen = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id);
      const first = [...byId.keys()].find((id) => seen.has(id));
      if (!first) return;
      links.forEach((a) => a.classList.toggle("on", a === byId.get(first)));
    },
    { rootMargin: "-70px 0px -65% 0px" },
  );
  for (const id of byId.keys()) {
    const h = document.getElementById(id);
    if (h) io.observe(h);
  }
})();
