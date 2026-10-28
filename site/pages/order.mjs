export default {
  title: "Order and endings",
  nav: "Order and endings",
  lead: "Records can cross on the network. One deterministic order decides what happened, so every device computes the same game from the same records.",
  body: ({ sequence, chains, callout, href }) => `
<h2>Why an order is needed</h2>
<p>Records from two players can be in flight at the same time. White resigns while Black's move is on its way. Black accepts a draw at the instant White moves. Without a rule, the two phones could end up with different results. Pawnshake applies records one at a time in a <strong>canonical order</strong> that every device, the server and any later checker compute the same way.</p>

<h2>The three rules</h2>
<ol class="steps">
  <li><strong>Causality first.</strong> A record comes after its own <code>prev</code> and after the opponent record it <code>seen</code>.</li>
  <li><strong>Ties by class, then colour.</strong> When a white and a black record are both ready (neither had seen the other), the earlier class goes first: MOVE, then END, then everything else. Same class: White first. Two crossing RESIGNs make a draw.</li>
  <li><strong>Verdicts where they belong.</strong> A server verdict comes right after the player records it had seen, and before anything it had not.</li>
</ol>
<p>Two moves are never concurrent: a move is only valid on its signer's turn, and the turn only passes through the opponent's move, which the signer must have seen.</p>

<h2>Example: the resignation race</h2>
${sequence(
  [
    { id: "w", label: "White", tone: "white" },
    { id: "b", label: "Black", tone: "black" },
  ],
  [
    { note: { at: "b", text: "Black to move" } },
    { arrows: [{ from: "w", to: "b", label: "RESIGN", tone: "bad", dx: -60 }, { from: "b", to: "w", label: "MOVE Qh4#", tone: "ok", dx: 60 }] },
    { note: { span: ["w", "b"], text: "neither had seen the other: concurrent", w: 320, tone: "warn" } },
    { note: { span: ["w", "b"], text: "order: MOVE before RESIGN → Black mates", w: 330, tone: "ok" } },
  ],
  { title: "The move class goes first, so the move a player made without knowing of the resignation stands." },
)}
<p>Putting moves first in a concurrent pair means a player's move always counts in the position that player actually saw. The same holds for a move against a draw acceptance or a takeback acceptance: the client that signed the move used exactly the position the canonical order gives it.</p>

<h2>Checked where it lands</h2>
<p>At its place in the order, each record is checked against the game state there. Not valid there? It is <strong>void</strong> and changes nothing.</p>
<table>
<tr><th>Record</th><th>Valid when</th><th>Effect</th></tr>
<tr><td>MOVE</td><td>signer's turn, game running, code legal, clock not out</td><td>plays the move; cancels standing takeback offers and the opponent's draw offer</td></tr>
<tr><td>RESIGN</td><td>game running</td><td>signer loses</td></tr>
<tr><td>DRAW_ACCEPT</td><td>the opponent's offer stands and is in the signer's <code>seen</code></td><td>draw</td></tr>
<tr><td>TAKEBACK_ACCEPT</td><td>offer stands and is in <code>seen</code></td><td>back to the position before the offerer's last move</td></tr>
<tr><td>ABORT</td><td>fewer than 2 moves</td><td>aborted, never rated</td></tr>
<tr><td>FLAGGED</td><td>game running</td><td>signer loses on time (draw if the opponent cannot mate)</td></tr>
<tr><td>FLAG_CLAIM</td><td>opponent to move</td><td>peer clocks: valid if the opponent's clock was out at the claim's time; anchored: the server decides</td></tr>
<tr><td>DISPUTE</td><td>signer has not signed END</td><td>game ends <code>disputed</code>, unrated</td></tr>
<tr><td>CANCEL</td><td>game running</td><td>leave (profile decides) or opponent gone (canceled)</td></tr>
<tr><td>END</td><td>after the end, with the computed result</td><td>sign-off; both ENDs close the game for good</td></tr>
</table>

<h2>Optimistic, then corrected</h2>
<p>Clients apply records as they arrive and re-run the order when a concurrent record shows up later. The board then corrects itself, identically on both sides. In practice that only happens in races like the one above.</p>

<h2>How a game ends</h2>
<p>The game ends at the first terminating record in the order: a mating or drawing move, RESIGN, DRAW_ACCEPT, ABORT, FLAGGED, a valid FLAG_CLAIM, a verdict or CANCEL; or when it turns <code>disputed</code> or <code>canceled</code>. Then both clients sign <strong>END</strong> with the result they computed.</p>
${chains({
  title: "Both END records: the game is closed. Nothing reported later changes it.",
  white: [
    { label: "…", sub: "" },
    { label: "Qxf7#", sub: "mate", tone: "hot" },
    { label: "END", sub: "1-0 · mate", tone: "ok" },
  ],
  black: [
    { label: "…", sub: "" },
    { label: "ACK", sub: "saw Qxf7#", tone: "ack" },
    { label: "END", sub: "1-0 · mate", tone: "ok" },
  ],
  seen: [
    ["b", 1, 1],
    ["w", 2, 1],
  ],
})}
${callout("idea", "END adds agreement, not truth", `<p>A game without both ENDs is still decided by its chain. END only records that both sides saw the same ending, which closes the door on later clock disputes.</p>`)}
<p>Next: how the result reaches the server, on <a href="${href("reporting")}">Reports and storage</a>.</p>
`,
};
