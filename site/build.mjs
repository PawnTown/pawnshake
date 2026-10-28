#!/usr/bin/env node
// Builds the Pawnshake docs site into site/out: plain HTML, one CSS file, a
// few lines of script. Byte pictures come from vectors/core.json, so they show
// the exact bytes every implementation produces.
//
//   node site/build.mjs            build
//   node site/build.mjs --serve    build, then serve site/out on :4321
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as d from "./lib/diagrams.mjs";

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SITE, "..");
const OUT = join(SITE, "out");
const REPO = "https://github.com/PawnTown/pawnshake";

const vectors = {
  core: JSON.parse(readFileSync(join(ROOT, "vectors/core.json"), "utf8")),
  movecode: JSON.parse(readFileSync(join(ROOT, "vectors/movecode.json"), "utf8")),
};
const version = (() => {
  const log = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
  return (log.match(/^## \[?v?(\d+\.\d+\.\d+)/m) || [])[1] || "draft";
})();

// The navigation, in reading order. Each slug is a module in site/pages.
const NAV = [
  { group: "Start", pages: ["index", "concepts", "modes"] },
  { group: "Protocol", pages: ["records", "bytes", "movecode", "genesis", "order", "anchors", "clocks", "reporting"] },
  { group: "Security", pages: ["security", "attacks"] },
  { group: "Reference", pages: ["profiles", "libraries"] },
];

const pages = {};
for (const g of NAV)
  for (const slug of g.pages) {
    const mod = await import(`./pages/${slug}.mjs`);
    pages[slug] = { slug, group: g.group, ...mod.default };
  }
const order = NAV.flatMap((g) => g.pages);
const href = (slug) => (slug === "index" ? "./" : `${slug}.html`);

const ctx = { ...d, vectors, version, REPO, href };

// Headings get ids; h2s make the "On this page" list.
function withAnchors(html) {
  const toc = [];
  const slug = (t) =>
    t
      .replace(/<[^>]+>/g, "")
      .toLowerCase()
      .replace(/&[a-z]+;/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const out = html.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g, (_, lvl, rawAttrs, inner) => {
    const given = rawAttrs.match(/\bid="([^"]+)"/);
    const id = given ? given[1] : slug(inner);
    const attrs = rawAttrs.replace(/\s*\bid="[^"]+"/, "");
    if (lvl === "2") toc.push({ id, text: inner.replace(/<[^>]+>/g, "") });
    return `<h${lvl} id="${id}"${attrs}><a class="anchor" href="#${id}" aria-hidden="true">#</a>${inner}</h${lvl}>`;
  });
  return { html: out, toc };
}

function sidebar(current) {
  return NAV.map(
    (g) => `<div class="nav-group">
  <p class="nav-head">${g.group}</p>
  <ul>${g.pages
    .map((s) => `<li><a href="${href(s)}"${s === current ? ' aria-current="page"' : ""}><span class="nav-dot"></span>${pages[s].nav || pages[s].title}</a></li>`)
    .join("")}</ul>
</div>`,
  ).join("");
}

function pager(slug) {
  const i = order.indexOf(slug);
  const prev = order[i - 1];
  const next = order[i + 1];
  return `<nav class="pager">${prev ? `<a class="pg prev" href="${href(prev)}"><span>Previous</span>${pages[prev].nav || pages[prev].title}</a>` : "<span></span>"}${
    next ? `<a class="pg next" href="${href(next)}"><span>Next</span>${pages[next].nav || pages[next].title}</a>` : ""
  }</nav>`;
}

function render(p) {
  const raw = p.body(ctx);
  const { html: anchored, toc } = withAnchors(raw);
  // Tables scroll sideways on narrow screens; wide ones keep a readable width.
  const html = anchored.replace(/<table>([\s\S]*?)<\/table>/g, (_, inner) => {
    const firstRow = (inner.match(/<tr>([\s\S]*?)<\/tr>/) || ["", ""])[1];
    const cols = (firstRow.match(/<t[hd][\s>]/g) || []).length;
    return `<div class="table-wrap"><table class="cols-${Math.min(cols, 5)}">${inner}</table></div>`;
  });
  const isHome = p.slug === "index";
  const title = isHome ? "Pawnshake: signed chess, peer to peer" : `${p.title} · Pawnshake`;
  const tocHtml =
    toc.length > 1
      ? `<aside class="toc"><p class="toc-head">On this page</p><ul>${toc.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join("")}</ul></aside>`
      : `<aside class="toc"></aside>`;
  const hero = isHome ? p.hero(ctx) : `<header class="page-head"><p class="eyebrow">${p.group}</p><h1>${p.title}</h1>${p.lead ? `<p class="lead">${p.lead}</p>` : ""}</header>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#fdf6e9">
<title>${title}</title>
<meta name="description" content="${d.esc(p.description || p.lead || "The Pawnshake protocol: signed, peer-to-peer chess games with a clock.").replace(/<[^>]+>/g, "")}">
<meta property="og:title" content="${title}">
<meta property="og:image" content="assets/logo.png">
<link rel="icon" href="assets/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shrikhand&family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,600;0,800;1,400&family=Martian+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/site.css">
</head>
<body class="${isHome ? "home" : "doc"}">
<header class="topbar">
  <button class="nav-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="drawer"><span></span><span></span><span></span></button>
  <a class="brand" href="./"><img src="assets/icon.png" alt="" width="34" height="34"><span>Pawnshake</span></a>
  <span class="ver">v${version} · draft</span>
  <nav class="top-links"><a href="${href("concepts")}">Docs</a><a href="${href("attacks")}">Attacks</a><a href="${href("libraries")}">Libraries</a><a class="gh" href="${REPO}">GitHub</a></nav>
</header>
<div class="drawer" id="drawer" aria-label="Documentation">
  <div class="drawer-scrim" data-close></div>
  <nav class="drawer-panel">${sidebar(p.slug)}<a class="drawer-gh" href="${REPO}">Pawnshake on GitHub</a></nav>
</div>
${isHome ? hero : ""}
<div class="shell">
  <nav class="sidebar" aria-label="Documentation">${sidebar(p.slug)}</nav>
  <main class="content">
    ${isHome ? "" : hero}
    <article class="prose">${html}</article>
    ${pager(p.slug)}
    <footer class="foot"><p>Pawnshake is MIT licensed. Spec: <a href="${REPO}/blob/main/spec/PAWNSHAKE.md">spec/PAWNSHAKE.md</a>. <a href="${REPO}/edit/main/site/pages/${p.slug}.mjs">Edit this page</a>.</p></footer>
  </main>
  ${tocHtml}
</div>
<script src="assets/site.js" defer></script>
</body>
</html>
`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets"), { recursive: true });
for (const slug of order) writeFileSync(join(OUT, slug === "index" ? "index.html" : `${slug}.html`), render(pages[slug]));
cpSync(join(SITE, "assets"), join(OUT, "assets"), { recursive: true });
cpSync(join(ROOT, "assets/logo.png"), join(OUT, "assets/logo.png"));
writeFileSync(join(OUT, ".nojekyll"), "");
// The old visualizer URL lands on the docs.
mkdirSync(join(OUT, "viz"), { recursive: true });
writeFileSync(join(OUT, "viz/index.html"), `<!doctype html><meta http-equiv="refresh" content="0; url=../concepts.html"><link rel="canonical" href="../concepts.html">`);
console.log(`built ${order.length} pages into ${OUT}`);

if (process.argv.includes("--serve")) {
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" };
  createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    try {
      const body = readFileSync(join(OUT, p));
      res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }).listen(4321, () => console.log("http://localhost:4321/"));
}
