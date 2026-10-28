// Diagram helpers for the docs. Everything renders to static HTML or SVG at
// build time, so the published pages need no script to show a picture.

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ------------------------------------------------------------- byte layouts

// A layout strip: one box per field, its width growing with the field's size
// (square root, so a 64-byte signature does not crush a 1-byte op).
//   fields: [{ name, size: number | "var" | string, kind, note }]
export function layout(title, fields, { total, caption } = {}) {
  const cells = fields
    .map((f) => {
      const n = typeof f.size === "number" ? f.size : 2;
      const grow = Math.max(1, Math.sqrt(n) * 1.6).toFixed(2);
      const size = typeof f.size === "number" ? `${f.size} B` : f.size;
      return `<div class="lf k-${f.kind || "int"}" style="flex-grow:${grow}" tabindex="0">
  <span class="lf-name">${f.name}</span>
  <span class="lf-size">${esc(size)}</span>
  ${f.note ? `<span class="lf-note">${f.note}</span>` : ""}
</div>`;
    })
    .join("");
  return `<figure class="layout">
  <figcaption><span class="layout-title">${title}</span>${total ? `<span class="layout-total">${esc(total)}</span>` : ""}</figcaption>
  <div class="lf-row">${cells}</div>
  ${caption ? `<p class="layout-cap">${caption}</p>` : ""}
</figure>`;
}

// A real hex dump, coloured by field. `segments` are [{ len, label, kind }];
// a segment of len "rest" takes what is left. Throws when the segments do not
// add up, so a drawing never lies about a vector.
export function hexdump(hex, segments, { title, perRow = 16 } = {}) {
  const bytes = hex.match(/../g) || [];
  let at = 0;
  const marks = [];
  for (const s of segments) {
    const len = s.len === "rest" ? bytes.length - at : s.len;
    marks.push({ ...s, from: at, to: at + len });
    at += len;
  }
  if (at !== bytes.length) throw new Error(`hexdump ${title}: segments cover ${at} of ${bytes.length} bytes`);
  const segOf = (i) => marks.find((m) => i >= m.from && i < m.to);
  let rows = "";
  for (let r = 0; r < bytes.length; r += perRow) {
    let cells = "";
    for (let i = r; i < Math.min(r + perRow, bytes.length); i++) {
      const m = segOf(i);
      const first = i === m.from ? " first" : "";
      cells += `<span class="hb k-${m.kind}${first}" title="${esc(m.label)} · byte ${i - m.from + 1} of ${m.to - m.from}">${bytes[i]}</span>`;
    }
    rows += `<div class="hx-row"><span class="hx-off">${r.toString(16).padStart(4, "0")}</span><span class="hx-bytes">${cells}</span></div>`;
  }
  const legend = marks
    .map((m) => `<span class="hx-leg k-${m.kind}"><i></i>${esc(m.label)} <b>${m.to - m.from}</b></span>`)
    .join("");
  return `<figure class="hexdump">
  ${title ? `<figcaption><span class="layout-title">${title}</span><span class="layout-total">${bytes.length} bytes</span></figcaption>` : ""}
  <div class="hx">${rows}</div>
  <div class="hx-legend">${legend}</div>
</figure>`;
}

// Bytes of an unsigned LEB128 varint at the start of `hex`.
export function varintLen(hex, offset = 0) {
  let n = 0;
  for (;;) {
    const b = parseInt(hex.slice((offset + n) * 2, (offset + n) * 2 + 2), 16);
    n++;
    if ((b & 0x80) === 0) return n;
  }
}

// ------------------------------------------------------------- sequence

// A message sequence between lanes (players, server).
//   lanes: [{ id, label, tone: "white" | "black" | "server" }]
//   rows:  [{ arrows: [{ from, to, label, tone, dashed, cut }], note: { at, text, tone, span } , gap }]
// tone: "ok" | "bad" | "warn" | "muted" | undefined
export function sequence(lanes, rows, { width = 720, title } = {}) {
  const pad = 70;
  const step = (width - 2 * pad) / Math.max(1, lanes.length - 1);
  const x = Object.fromEntries(lanes.map((l, i) => [l.id, pad + i * step]));
  let y = 74;
  let body = "";
  for (const row of rows) {
    const h = row.gap || 52;
    for (const a of row.arrows || []) {
      const x1 = x[a.from];
      const x2 = x[a.to];
      const dir = x2 > x1 ? 1 : -1;
      const tone = a.tone || "plain";
      const end = a.cut ? (x1 + x2) / 2 : x2 - dir * 8;
      body += `<line class="sq-line t-${tone}${a.dashed ? " dashed" : ""}" x1="${x1 + dir * 8}" y1="${y + 14}" x2="${end}" y2="${y + 14}" ${a.cut ? "" : `marker-end="url(#ah-${tone})"`}/>`;
      if (a.cut) {
        const cx = end;
        body += `<g class="sq-cut"><line x1="${cx - 7}" y1="${y + 7}" x2="${cx + 7}" y2="${y + 21}"/><line x1="${cx - 7}" y1="${y + 21}" x2="${cx + 7}" y2="${y + 7}"/></g>`;
      }
      const lx = a.cut ? (x1 + end) / 2 : (x1 + x2) / 2;
      body += `<text class="sq-label t-${tone}" x="${lx + (a.dx || 0)}" y="${y + 6}" text-anchor="middle">${esc(a.label || "")}</text>`;
    }
    if (row.note) {
      const n = row.note;
      const cx = n.span ? (x[n.span[0]] + x[n.span[1]]) / 2 : x[n.at];
      const w = n.w || Math.min(width - 20, Math.max(120, n.text.length * 7.2 + 26));
      // keep the pill inside the picture when it sits on an outer lane
      const left = Math.min(Math.max(cx - w / 2, 6), width - 6 - w);
      body += `<g class="sq-note t-${n.tone || "plain"}"><rect x="${left}" y="${y}" width="${w}" height="28" rx="14"/><text x="${left + w / 2}" y="${y + 18.5}" text-anchor="middle">${esc(n.text)}</text></g>`;
    }
    y += h;
  }
  const height = y + 10;
  const lifelines = lanes
    .map(
      (l) => `<line class="sq-life" x1="${x[l.id]}" y1="52" x2="${x[l.id]}" y2="${height - 8}"/>
<g class="sq-head l-${l.tone || "server"}"><rect x="${x[l.id] - 52}" y="14" width="104" height="32" rx="16"/><text x="${x[l.id]}" y="35" text-anchor="middle">${esc(l.label)}</text></g>`,
    )
    .join("");
  const markers = ["plain", "ok", "bad", "warn", "muted"]
    .map(
      (t) => `<marker id="ah-${t}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ah t-${t}" d="M0,0 L10,5 L0,10 z"/></marker>`,
    )
    .join("");
  return `<figure class="diagram">${title ? `<figcaption>${title}</figcaption>` : ""}<div class="scroll-x"><svg class="min-draw" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title || "sequence diagram")}"><defs>${markers}</defs>${lifelines}${body}</svg></div></figure>`;
}

// ------------------------------------------------------------- chains

// Two chains side by side: White on top, Black below. Each record is a small
// card; `prev` links run along a row, `seen` links cross between rows.
//   white / black: [{ label, sub, tone }]   (index 0 = seq 1)
//   seen: [[fromSide "w"|"b", fromIdx, toIdx]]  record fromIdx of side saw toIdx of the other side
//   fork: { side, idx, label, sub } a second card stacked on one seq
export function chains({ white = [], black = [], seen = [], fork, title, width = 720, genesis = true } = {}) {
  const cw = 92;
  const ch = 46;
  const gx = 30;
  const left = genesis ? 118 : 20;
  const yW = 34;
  const yB = 168 + (fork ? 26 : 0);
  const xs = (i) => left + i * (cw + gx);
  const cols = Math.max(white.length, black.length);
  const w = Math.max(width, left + cols * (cw + gx) + 10);
  const height = yB + ch + 34;
  let s = "";
  if (genesis) {
    const gy = (yW + yB + ch) / 2 - 24;
    s += `<g class="ch-gen"><rect x="10" y="${gy}" width="84" height="48" rx="12"/><text x="52" y="${gy + 21}" text-anchor="middle">genesis</text><text class="sub" x="52" y="${gy + 37}" text-anchor="middle">hash</text></g>`;
    if (white.length) s += `<path class="ch-prev" d="M94,${gy + 18} C106,${gy + 18} 100,${yW + ch / 2} ${left - 8},${yW + ch / 2}" marker-end="url(#ch-a)"/>`;
    if (black.length) s += `<path class="ch-prev" d="M94,${gy + 30} C106,${gy + 30} 100,${yB + ch / 2} ${left - 8},${yB + ch / 2}" marker-end="url(#ch-a)"/>`;
  }
  const card = (side, i, r, y, extra = "") =>
    `<g class="ch-card s-${side} ct-${r.tone || "plain"}${extra}"><rect x="${xs(i)}" y="${y}" width="${cw}" height="${ch}" rx="10"/><text x="${xs(i) + cw / 2}" y="${y + 20}" text-anchor="middle">${esc(r.label)}</text><text class="sub" x="${xs(i) + cw / 2}" y="${y + 36}" text-anchor="middle">${esc(r.sub || "")}</text></g>`;
  const row = (side, list, y) => {
    let out = "";
    list.forEach((r, i) => {
      if (i > 0) out += `<line class="ch-prev" x1="${xs(i - 1) + cw}" y1="${y + ch / 2}" x2="${xs(i) - 6}" y2="${y + ch / 2}" marker-end="url(#ch-a)"/>`;
      out += card(side, i, r, y);
    });
    return out;
  };
  // seen links: drawn first so cards sit on top
  for (const [side, from, to] of seen) {
    const fromY = side === "w" ? yW + ch : yB;
    const toY = side === "w" ? yB : yW + ch;
    s += `<path class="ch-seen" d="M${xs(from) + cw / 2 - 10},${fromY} C${xs(from) + cw / 2 - 10},${(fromY + toY) / 2} ${xs(to) + cw / 2 + 10},${(fromY + toY) / 2} ${xs(to) + cw / 2 + 10},${toY + (side === "w" ? -4 : 4)}" marker-end="url(#ch-s)"/>`;
  }
  s += row("w", white, yW) + row("b", black, yB);
  if (fork) {
    const y = (fork.side === "w" ? yW : yB) + 26;
    s += card(fork.side, fork.idx, { label: fork.label, sub: fork.sub, tone: "bad" }, y, " fork");
  }
  s += `<text class="ch-lane" x="${left}" y="${yW - 10}">White</text><text class="ch-lane" x="${left}" y="${yB + ch + 22}">Black</text>`;
  const defs = `<defs><marker id="ch-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="ch-ah" d="M0,0 L10,5 L0,10 z"/></marker><marker id="ch-s" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="ch-sh" d="M0,0 L10,5 L0,10 z"/></marker></defs>`;
  return `<figure class="diagram chains">${title ? `<figcaption>${title}</figcaption>` : ""}<div class="scroll-x"><svg class="min-draw" viewBox="0 0 ${w} ${height}" role="img" aria-label="${esc(title || "chain")}">${defs}${s}</svg></div></figure>`;
}

// ------------------------------------------------------------- small blocks

export const callout = (kind, title, html) =>
  `<aside class="callout c-${kind}"><p class="callout-title">${title}</p>${html}</aside>`;

export const kbdTag = (s) => `<code class="tag">${esc(s)}</code>`;

// An attack card: what the cheater tries, why it fails, what it costs.
export function attack({ id, name, who, tries, caught, outcome, tone = "lose", fig = "" }) {
  const toneLabel = { lose: "signer loses", void: "record void", none: "no gain", cancel: "canceled", dispute: "disputed", limit: "residual" }[tone];
  return `<article class="attack a-${tone}" id="${id}">
  <header><h3>${name}</h3><span class="attack-badge">${toneLabel}</span></header>
  ${who ? `<p class="attack-who">${who}</p>` : ""}
  <div class="attack-cols">
    <div><p class="attack-k">The trick</p><p>${tries}</p></div>
    <div><p class="attack-k">Why it fails</p><p>${caught}</p></div>
  </div>
  ${fig}
  <p class="attack-out"><span>Outcome</span> ${outcome}</p>
</article>`;
}

// A chess board (start position or a FEN placement) with optional numbered
// arrows. Squares like "e2". Pieces are drawn as unicode glyphs.
export function board(fen, { arrows = [], size = 360, highlight = [], title } = {}) {
  const glyph = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟", K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" };
  const sq = size / 8;
  const pos = (s) => {
    const f = s.charCodeAt(0) - 97;
    const r = Number(s[1]) - 1;
    return [f * sq + sq / 2, (7 - r) * sq + sq / 2];
  };
  let out = "";
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const name = String.fromCharCode(97 + f) + (8 - r);
      const hl = highlight.includes(name) ? " hl" : "";
      out += `<rect class="sqr ${(r + f) % 2 ? "dk" : "lt"}${hl}" x="${f * sq}" y="${r * sq}" width="${sq}" height="${sq}"/>`;
    }
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row, r) => {
    let f = 0;
    for (const c of row) {
      if (/\d/.test(c)) f += Number(c);
      else {
        const white = c === c.toUpperCase();
        out += `<text class="pc ${white ? "pw" : "pb"}" x="${f * sq + sq / 2}" y="${r * sq + sq * 0.76}" text-anchor="middle" font-size="${sq * 0.78}">${glyph[c.toLowerCase()]}</text>`;
        f++;
      }
    }
  });
  // Moves that land on the same square get their number badges side by side.
  const byTo = {};
  for (const a of arrows) (byTo[a.to] ||= []).push(a);
  const badgeAt = (a) => {
    const [x2, y2] = pos(a.to);
    const list = byTo[a.to];
    if (list.length === 1) return [x2, y2];
    const i = list.indexOf(a);
    return [x2 + (i - (list.length - 1) / 2) * sq * 0.46, y2];
  };
  let badges = "";
  for (const a of [...arrows].sort((p, q) => (p.hot ? 1 : 0) - (q.hot ? 1 : 0))) {
    const [x1, y1] = pos(a.from);
    const [bx, by] = badgeAt(a);
    const dx = bx - x1;
    const dy = by - y1;
    const len = Math.hypot(dx, dy);
    const r = sq * 0.21;
    out += `<line class="arw${a.hot ? " hot" : ""}" x1="${x1 + (dx / len) * sq * 0.18}" y1="${y1 + (dy / len) * sq * 0.18}" x2="${bx - (dx / len) * r}" y2="${by - (dy / len) * r}"/>`;
    if (a.n !== undefined) badges += `<g class="arw-n${a.hot ? " hot" : ""}"><circle cx="${bx}" cy="${by}" r="${r}"/><text x="${bx}" y="${by + sq * 0.075}" text-anchor="middle" font-size="${sq * 0.2}">${a.n}</text></g>`;
  }
  out += badges;
  const files = "abcdefgh"
    .split("")
    .map((c, i) => `<text class="coord" x="${i * sq + sq - 4}" y="${size - 4}" text-anchor="end">${c}</text>`)
    .join("");
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1].map((n, i) => `<text class="coord" x="3" y="${i * sq + 12}">${n}</text>`).join("");
  const defs = `<defs><marker id="bd-a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="arw-h" d="M0,0 L10,5 L0,10 z"/></marker><marker id="bd-h" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="arw-h hot" d="M0,0 L10,5 L0,10 z"/></marker></defs>`;
  return `<figure class="board">${title ? `<figcaption>${title}</figcaption>` : ""}<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(title || "board")}">${defs}${out}${files}${ranks}</svg></figure>`;
}
