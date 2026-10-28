export default {
  title: "Reports and storage",
  nav: "Reports and storage",
  lead: "After a game, either player uploads its records. The server merges every upload, finds forks, replays the game and saves it. A finished game shrinks to about a kilobyte.",
  body: ({ sequence, callout, layout }) => `
<h2>Reporting a game</h2>
<p>When a device is online it uploads every game it played, automatically, both players, every time:</p>
<pre><code>POST /pawnshake/v1/reports
{ genesis, records_white[], records_black[], records_server[], receipts[] }</code></pre>
<ol class="steps">
  <li><strong>Verify.</strong> The genesis, every record, every receipt.</li>
  <li><strong>Merge.</strong> With everything already held for this game: the union. A report can only add records, so leaving some out never removes what the other player or the anchors put there.</li>
  <li><strong>Look for forks.</strong> One signer, one seq, two different headers: the signer loses.</li>
  <li><strong>Replay and store.</strong> Run the canonical order and save the result with its state.</li>
</ol>
${sequence(
  [
    { id: "w", label: "Winner", tone: "white" },
    { id: "s", label: "Server", tone: "server" },
    { id: "b", label: "Loser", tone: "black" },
  ],
  [
    { arrows: [{ from: "w", to: "s", label: "report: every record it holds", tone: "ok" }] },
    { arrows: [{ from: "b", to: "s", label: "never reports", tone: "muted", dashed: true, cut: true }] },
    { note: { at: "s", text: "the winner's copy holds the loser's records too", tone: "ok" } },
  ],
  { title: "Staying silent gains nothing. The winner received every record the loser sent, so the winner's report carries them." },
)}
<p>Records a player signed but never delivered or anchored did not happen, as far as the game is concerned.</p>

<h2>Game states</h2>
<table>
<tr><th>State</th><th>When</th><th>Rated</th></tr>
<tr><td><code>final</code></td><td>ended by a provable termination, a verdict, or both ENDs</td><td class="yes">yes</td></tr>
<tr><td><code>pending</code></td><td>not ended in the chain yet; waits for the other report</td><td>not yet</td></tr>
<tr><td><code>disputed</code></td><td>a DISPUTE record: a live time check failed</td><td class="no">no</td></tr>
<tr><td><code>canceled</code></td><td>outage beyond the budget without two RESUMEs, a CANCEL, or a leave the profile cancels</td><td class="no">no</td></tr>
<tr><td><code>unfinished</code></td><td>still pending after the wait (WhitePawn: 7 days)</td><td class="no">no</td></tr>
</table>
<p>Saving is idempotent on the genesis hash. Canceled, disputed and unfinished games are saved too, without ratings: PGN result <code>*</code> and the state as termination.</p>
${callout("tip", "Canceled is not lost", `<p>An offline game where someone hopped off still lands in both players' collections with every move. It just does not count for rating.</p>`)}

<h2>The compact form</h2>
<p>Until a game is final, every record keeps its signature: any of them could become fork evidence. Once it is final, everyone keeps a compact form instead.</p>
${layout("Stored game", [
  { name: "genesis", size: "~650", kind: "magic" },
  { name: "records, no signatures", size: "~1 KB", kind: "int", note: "seq, seen, at, op, args" },
  { name: "white head sig", size: 64, kind: "sig" },
  { name: "black head sig", size: 64, kind: "sig" },
  { name: "verdicts", size: "signed", kind: "op" },
  { name: "last receipt", size: "optional", kind: "hash" },
], { caption: "A 40-move game (80 moves, 80 ACKs, 2 ENDs, a verdict) is about 1 KB of records plus 3 signatures, against about 10 KB of signatures alone if every record kept its own." })}
<p>Nothing is lost. A verifier rebuilds every body and header from the genesis forward (<code>prev</code>, <code>seen_hash</code>, <code>ply</code>, <code>legal</code>) and checks only the two head signatures. Changing, adding or dropping any earlier record changes the chain of record ids, and a head signature fails. That is the same reason one head is enough for an anchor.</p>
`,
};
