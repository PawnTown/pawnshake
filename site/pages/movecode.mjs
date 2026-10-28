export default {
  title: "Move code",
  lead: "A move is one byte: its position in the sorted list of legal moves. In the starting position, 1. e4 is 13.",
  body: ({ board, vectors, callout }) => {
    const start = vectors.movecode.positions[0];
    const arrows = start.legal.map((uci, i) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), n: i, hot: uci === "e2e4" }));
    const rows = start.legal
      .map((uci, i) => {
        const sq = (s) => (Number(s[1]) - 1) * 8 + (s.charCodeAt(0) - 97);
        const key = sq(uci.slice(0, 2)) * 320 + sq(uci.slice(2, 4)) * 5;
        return `<tr${uci === "e2e4" ? ' style="background:#fdeaf4"' : ""}><td><code>${i}</code></td><td><code>${uci}</code></td><td>${sq(uci.slice(0, 2))} × 320 + ${sq(uci.slice(2, 4))} × 5 = <strong>${key}</strong></td></tr>`;
      })
      .join("");
    const others = vectors.movecode.positions.length;
    return `
<h2>The idea</h2>
<p>Both players know the position. So instead of sending "e2 to e4", a player sends <em>which</em> of the legal moves it played. List every legal move, sort the list the same way on every device, and the move is its index. No position in chess has more than 218 legal moves, so the code always fits a byte (0 to 217), and the bytes above 217 are free for commands.</p>
<div class="grid grid-2" style="align-items:start">
${board(start.fen, { arrows, title: "Start position: all 20 legal moves, numbered" })}
<div>
<p>Read the numbers on the board: the knights come first (b1 is square 1, g1 is square 6), then the pawns from a2 to h2, each with its one-step move before its two-step move.</p>
<p>White's 1. e4 is <strong>13</strong>, so its record's op byte is <code>0d</code>. That one byte and the signature are the whole move.</p>
${callout("idea", "Nothing to agree on", `<p>The order is defined on the move itself, never on how an engine happens to generate moves. Two different chess engines produce the same codes.</p>`)}
</div>
</div>

<h2>The sort key</h2>
<pre><code>key    = from * 320 + to * 5 + promo        sorted ascending
square = rank * 8 + file                    a1 = 0, h1 = 7, a8 = 56, h8 = 63
promo  = none 0, n 1, b 2, r 3, q 4</code></pre>
<p>Castling is the king's two-square move (<code>e1g1</code>, <code>e1c1</code>), en passant is the pawn's diagonal move. Promotions are separate moves with separate codes: <code>e7e8n</code>, <code>e7e8b</code>, <code>e7e8r</code>, <code>e7e8q</code>.</p>

<h2>Worked out</h2>
<table>
<tr><th>Code</th><th>Move</th><th>Key</th></tr>
${rows}
</table>

<h2>Guarding against engine bugs</h2>
<p>If two engines ever disagreed about the legal moves in a position, the same byte would mean different moves on the two boards and the game would silently split. Pawnshake prevents that: every move record's signed body includes <code>legal</code>, the number of legal moves in the position, and <code>ply</code>. A disagreement shows up as a signature failure the moment the record arrives, not ten moves later.</p>

<h2>Conformance</h2>
<p><code>vectors/movecode.json</code> lists ${others} positions (the start, castling on both sides, en passant, promotion order, a capture promotion, a check with one reply, the famous 218-move position and six positions from random games) with the full sorted legal list for each. Every port must reproduce them exactly.</p>
`;
  },
};
