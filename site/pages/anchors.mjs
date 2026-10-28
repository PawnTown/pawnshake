export default {
  title: "Anchors and receipts",
  nav: "Anchors and receipts",
  lead: "An anchor is a head sent to the server. The receipt that comes back says: these records existed no later than server time T. One head is enough to cover the whole game.",
  body: ({ sequence, chains, layout, callout, href }) => `
<h2>What an anchor is</h2>
<p>At any moment, either player may send the server the <strong>head</strong> of its newest record (about 98 bytes: signer, seq, body hash, signature). The server checks the signature against the genesis and answers with a signed <strong>receipt</strong> carrying its own clock. Anchors never sit between the players: a move goes to the opponent first, and is anchored beside it.</p>
${layout("Head", [
  { name: "signer", size: 1, kind: "int" },
  { name: "seq", size: "varint", kind: "int" },
  { name: "body_hash", size: 32, kind: "hash" },
  { name: "signature", size: 64, kind: "sig" },
], { total: "~98 bytes" })}

<h2>One head covers both chains</h2>
<p>A head commits to its signer's whole chain through <code>prev</code>, and to the opponent's chain up to what it had seen through <code>seen_hash</code>. So a player that has just acknowledged the opponent's latest move anchors its own ACK, and that single head pins down every record of both players. The server learns sequence numbers and timing, never the moves.</p>
${chains({
  title: "Anchoring Black's ACK (magenta) commits to every record before it, in both chains (green).",
  white: [
    { label: "e4", sub: "seq 1", tone: "ok" },
    { label: "ACK", sub: "seq 2", tone: "ok" },
    { label: "Nf3", sub: "seq 3", tone: "ok" },
  ],
  black: [
    { label: "ACK", sub: "seq 1", tone: "ok" },
    { label: "e5", sub: "seq 2", tone: "ok" },
    { label: "ACK", sub: "seq 3 · anchored", tone: "hot" },
  ],
  seen: [
    ["b", 0, 0],
    ["w", 1, 1],
    ["b", 2, 2],
  ],
})}

<h2>Why a head must carry its signature</h2>
<p>An early design anchored bare hashes. That opens a neat attack, and it is the reason heads are signed headers.</p>
${sequence(
  [
    { id: "w", label: "Cheater", tone: "white" },
    { id: "s", label: "Server", tone: "server" },
    { id: "b", label: "Opponent", tone: "black" },
  ],
  [
    { note: { at: "w", text: "my turn starts at 0:00" } },
    { arrows: [{ from: "w", to: "s", label: "hashes of all 20 candidate moves", tone: "bad" }] },
    { note: { at: "w", text: "thinks for a full minute…" } },
    { arrows: [{ from: "w", to: "b", label: "plays one: 'anchored at 0:00!'", tone: "bad" }] },
  ],
  { title: "The pre-anchor attack: commit to every possible move up front, decide later, claim zero thinking time." },
)}
<p>With signed heads this fails: each head names its <code>seq</code>, so anchoring two candidates for the same number is two signed headers for one <code>seq</code>. That is a <a href="${href("security")}#the-one-punishable-act">fork</a>, and the cheater loses the game.</p>

<h2>What the server checks</h2>
<ol class="steps">
  <li><strong>Genesis and certificates.</strong> Valid, not revoked.</li>
  <li><strong>Every head.</strong> The header rebuilt from genesis, signer, seq and body hash verifies under the signer's key.</li>
  <li><strong>No second head per number.</strong> Another body hash for a (signer, seq) it already holds is a fork: kept as evidence, the signer loses.</li>
  <li><strong>Records, when sent.</strong> They hash to their heads and link through <code>prev</code>. If the server has the whole chain it also checks the state hash the client sent.</li>
</ol>
<p>Older heads are checked when the chain is revealed later (a report, or records in a later anchor): every anchored head must lie on the revealed chain. One that does not is a second signed header for its <code>seq</code>, a fork.</p>

<h2>The receipt</h2>
${layout("Receipt", [
  { name: "PSANCH01", size: 8, kind: "magic" },
  { name: "key_id", size: 1, kind: "int" },
  { name: "genesis_hash", size: 32, kind: "hash" },
  { name: "white_seq + id", size: 36, kind: "hash" },
  { name: "black_seq + id", size: 36, kind: "hash" },
  { name: "state_hash + ok", size: 33, kind: "hash" },
  { name: "server_ms", size: 8, kind: "int" },
  { name: "anchor_no", size: 4, kind: "int" },
  { name: "prev_receipt", size: 32, kind: "hash" },
  { name: "server_sig", size: 64, kind: "sig" },
], { total: "254 bytes" })}
<ul>
  <li>It covers the server's highest heads for <strong>both</strong> players, so it also tells the anchoring player what the opponent has anchored.</li>
  <li>Receipts form their own chain through <code>prev_receipt</code>, so the server cannot drop or reorder one unnoticed.</li>
  <li>Both players keep their receipts; the server keeps all of them.</li>
</ul>

<h2>Existence time</h2>
<p>The <strong>existence time</strong> <code>E(r)</code> of a record is the server time of the first receipt whose head for that signer has <code>seq ≥ r.seq</code>. It is an upper bound: the record existed no later than that. Anchoring can make your own records look later (which only hurts you), never earlier than they really existed.</p>

<h2>Delivery</h2>
<p>When anchors carry full records (online games) and a player has a live session, the server pushes every record it receives from the opponent, and its receipts, straight to that player. So withholding a move from the opponent while anchoring it gains nothing: the server delivers it.</p>

<h2>What anchors are for</h2>
<table>
<tr><th>Game</th><th>Anchors give you</th></tr>
<tr><td>offline (<code>none</code>)</td><td>a timestamped proof of the game and its state; a server-side backup if both phones are lost. Optional.</td></tr>
<tr><td>hybrid (<code>checkpoints</code>)</td><td>presence: proof of who was still there, and so who went away</td></tr>
<tr><td>online (<code>full</code>)</td><td>the clock: moves are timed by existence times</td></tr>
<tr><td>any game, in a dispute</td><td>evidence: "X was to move at T and had nothing newer anchored by then"</td></tr>
</table>
${callout("tip", "Byte by byte", `<p>A real head and receipt are dumped on <a href="${href("bytes")}#a-head">Byte layouts</a>.</p>`)}
`,
};
