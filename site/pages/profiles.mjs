export default {
  title: "Rules profiles",
  lead: "Everything that is taste rather than protocol lives in a numbered profile signed into each game. WhitePawn's is whitepawn/1; your app can ship its own.",
  body: ({ layout, callout, href }) => `
<h2>Protocol versus policy</h2>
<p>How big a transit allowance is fair, how long to wait for a player who vanished, what leaving costs: reasonable apps disagree. So Pawnshake does not decide. The challenger writes concrete numbers for this game into CHALLENGE, the opponent signs them by accepting, and every verifier (the opponent's phone, the server, a checker years later) judges the game by those numbers, never by its own defaults. A device that sees a key it does not know declines the challenge.</p>
${layout("Profile", [
  { name: "name length", size: 1, kind: "int" },
  { name: "name", size: "UTF-8", kind: "text", note: "e.g. whitepawn/1" },
  { name: "count", size: "varint", kind: "int" },
  { name: "key, value", size: "varints", kind: "var", note: "repeated count times" },
], { total: "45 bytes for whitepawn/1" })}

<h2>The keys</h2>
<table>
<tr><th>Key</th><th>Parameter</th><th>Meaning</th></tr>
<tr><td>1</td><td><code>j_min_ms</code></td><td>smallest transit allowance</td></tr>
<tr><td>2</td><td><code>j_rtt_mult</code></td><td>allowance as a multiple of the round trip</td></tr>
<tr><td>3</td><td><code>sample_window</code></td><td>transit samples per direction for the link estimate</td></tr>
<tr><td>4</td><td><code>pause_budget_ms</code></td><td>outage time forgiven per game, shared by both players</td></tr>
<tr><td>5</td><td><code>ping_interval_ms</code></td><td>live-check ping interval</td></tr>
<tr><td>6</td><td><code>rate_tolerance_ppm</code></td><td>allowed clock rate difference</td></tr>
<tr><td>7</td><td><code>checkpoint_interval_ms</code></td><td>presence checkpoints while online (hybrid)</td></tr>
<tr><td>8</td><td><code>away_after_ms</code></td><td>how long the game waits on an absent player</td></tr>
<tr><td>9</td><td><code>leave_with_arbiter</code></td><td>outcome for leaving when there is an arbiter: 0 cancel, 1 loss, 2 draw</td></tr>
<tr><td>10</td><td><code>leave_offline</code></td><td>the same without an arbiter</td></tr>
<tr><td>11</td><td><code>free_first_moves</code></td><td>the first move of each side costs no clock</td></tr>
<tr><td>12</td><td><code>takebacks</code></td><td>takeback offers allowed</td></tr>
<tr><td>13</td><td><code>report_wait_days</code></td><td>how long a pending game waits for the second report</td></tr>
</table>
<p>A loss for leaving becomes a draw when the remaining player cannot mate, as for a flag.</p>

<h2 id="whitepawn-1">whitepawn/1</h2>
<p>The values WhitePawn writes into every game. Speeds follow the usual estimate <code>initial + 40 × increment</code>: bullet under 3 minutes, blitz under 8, rapid under 25, classical above.</p>
<table>
<tr><th>Key</th><th>Bullet</th><th>Blitz</th><th>Rapid</th><th>Classical</th></tr>
<tr><td><code>j_min_ms</code></td><td colspan="4">30</td></tr>
<tr><td><code>j_rtt_mult</code></td><td colspan="4">2</td></tr>
<tr><td><code>sample_window</code></td><td colspan="4">16</td></tr>
<tr><td><code>pause_budget_ms</code></td><td>2 000</td><td>5 000</td><td>10 000</td><td>20 000</td></tr>
<tr><td><code>ping_interval_ms</code></td><td colspan="4">250</td></tr>
<tr><td><code>rate_tolerance_ppm</code></td><td colspan="4">1 000 (0.1 %)</td></tr>
<tr><td><code>checkpoint_interval_ms</code></td><td colspan="4">10 000</td></tr>
<tr><td><code>away_after_ms</code></td><td>15 000</td><td>30 000</td><td>60 000</td><td>120 000</td></tr>
<tr><td><code>leave_with_arbiter</code></td><td colspan="4">1: the leaver loses</td></tr>
<tr><td><code>leave_offline</code></td><td colspan="4">0: canceled</td></tr>
<tr><td><code>free_first_moves</code></td><td colspan="4">1</td></tr>
<tr><td><code>takebacks</code></td><td colspan="4">1 in casual games, 0 in rated games</td></tr>
<tr><td><code>report_wait_days</code></td><td colspan="4">7</td></tr>
</table>

<h2>What that means for players</h2>
<div class="grid grid-2">
  <div class="card"><span class="kicker">With an arbiter</span><p>Online and hybrid games: the player who goes away loses, or draws if the other cannot mate.</p></div>
  <div class="card"><span class="kicker">Without one</span><p>Offline games: if one player hops off, the game is canceled. It is still uploaded and saved in both collections, unrated, with all its moves.</p></div>
</div>
<p>Outages up to the pause budget are paused time; longer ones cancel an offline game unless both players resume.</p>
${callout("idea", "Write your own", `<p>Pick a name with a version (<code>myapp/1</code>), choose values per time control, and publish them. Changing a value later means a new name, so old games keep being judged by their own rules. The byte dump of <code>whitepawn/1</code> is on <a href="${href("bytes")}#rules-profile">Byte layouts</a>.</p>`)}
`,
};
