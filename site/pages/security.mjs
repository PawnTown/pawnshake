export default {
  title: "Threat model",
  lead: "Who might cheat, what they can touch, what a chain can prove about it, and the single act that is ever punished.",
  body: ({ chains, callout, href }) => `
<h2>Who we defend against</h2>
<div class="grid grid-3">
  <div class="card"><span class="kicker">The opponent</span><p>Runs a modified client. Can sign anything with its own key, delay, reorder or drop its messages, and lie about its own clock.</p></div>
  <div class="card"><span class="kicker">The network</span><p>Can delay, drop, duplicate or replay messages. Cannot forge a signature.</p></div>
  <div class="card"><span class="kicker">The server</span><p>Could try to drop or reorder receipts, or fudge times. Its receipts form a hash chain, and it never carries the moves between players.</p></div>
</div>
<p>Out of scope: a player using an engine (that is fair-play detection, a different problem), and two accounts of one person farming rating against each other (that is collusion, the same online or off).</p>

<h2>The one punishable act</h2>
${callout("rule", "A fork loses the game", `<p>Two records with the same signer and <code>seq</code> whose headers differ, both validly signed, are a fork. The signer loses, whenever the two meet: on the opponent's device, in the anchors, or in a report. An honest client never signs twice for one number, so it can never fork.</p>`)}
<p>Every cheating strategy that involves telling different parties different stories needs two signed records for one sequence number, because every record pins down its predecessor and what it had seen. So these all reduce to a fork:</p>
<ul>
  <li>one move to the opponent, another to the server,</li>
  <li>two different moves to the opponent (to fork the board),</li>
  <li>a report that differs from what the opponent holds or the anchors saw,</li>
  <li>pre-anchoring several candidate moves.</li>
</ul>
${chains({
  title: "The opponent holds the copy you sent it. The server holds the copy you anchored. Same seq, different headers.",
  white: [
    { label: "e4", sub: "seq 1" },
    { label: "ACK", sub: "seq 2", tone: "ack" },
    { label: "Qh5", sub: "seq 3 · to Black" },
  ],
  black: [
    { label: "ACK", sub: "seq 1", tone: "ack" },
    { label: "e5", sub: "seq 2" },
  ],
  seen: [
    ["b", 0, 0],
    ["w", 1, 1],
  ],
  fork: { side: "w", idx: 2, label: "Nf3", sub: "seq 3 · anchored" },
})}

<h2>Void, not punished</h2>
<p>Everything else that is wrong only makes that one record void. It changes nothing and the game goes on after it:</p>
<ul>
  <li>a bad signature (forged or corrupted),</li>
  <li>an illegal or out-of-range move code, or a wrong <code>legal</code> count,</li>
  <li>a command at a point where it is not allowed (accepting a draw nobody offered, a move out of turn),</li>
  <li>a record that claims to have seen something the opponent never signed.</li>
</ul>
<p>This keeps bugs and bad links from turning into losses. Only the act an honest client cannot commit is punished.</p>

<h2>What a chain can prove</h2>
<table>
<tr><th></th><th>Peer clocks<br>(offline, hybrid)</th><th>Anchored clocks<br>(online)</th></tr>
<tr><td>every move, and that it was legal</td><td class="yes">yes</td><td class="yes">yes</td></tr>
<tr><td>mate, stalemate, threefold, fifty moves, insufficient material</td><td class="yes">yes</td><td class="yes">yes</td></tr>
<tr><td>resignation, draw agreement, abort, takeback</td><td class="yes">yes</td><td class="yes">yes</td></tr>
<tr><td>a player forking the chain</td><td class="yes">yes</td><td class="yes">yes</td></tr>
<tr><td>a record existed at time T</td><td>only if anchored</td><td class="yes">yes</td></tr>
<tr><td>a flag</td><td class="yes">yes, from both devices' timestamps</td><td class="yes">yes</td></tr>
<tr><td>how long a player really thought</td><td>within <code>J</code> per move; more is caught live</td><td>bounded by the lag quota</td></tr>
<tr><td>a link outage</td><td>paused up to a budget, then canceled</td><td>the disconnected clock runs</td></tr>
<tr><td>who went away</td><td>offline: nobody can tell. Hybrid: the checkpoints show it</td><td class="yes">the server sees it</td></tr>
</table>

<h2>Cryptographic choices</h2>
<ul>
  <li><strong>Ed25519</strong> (RFC 8032) for everything: records, genesis, certificates, receipts, verdicts. 64-byte signatures, 128-bit security, deterministic nonces.</li>
  <li><strong>ZIP-215 verification rules.</strong> Ed25519 libraries disagree on edge cases (non-canonical points, small-order components). Here that could split a game: a fork one device can prove and the other cannot. ZIP-215 fixes exactly which signatures are valid; every Pawnshake library uses it and passes its 196 test cases.</li>
  <li><strong>Domain separation.</strong> Every signed message starts with its own magic tag, so a signature for one kind of message never verifies as another.</li>
  <li><strong>Identity by header hash.</strong> Signature bytes are malleable for a dishonest signer, so records are identified by the hash of their header. A re-signed duplicate is not a fork.</li>
  <li><strong>Keys stay put.</strong> Device keys are created on the device and never exported. Secure enclaves only sign P-256, and would not stop a modified client anyway, since that client holds its own key.</li>
</ul>
<p>Every trick we know of, with a picture, is in the <a href="${href("attacks")}">attack gallery</a>.</p>
`,
};
