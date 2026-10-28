export default {
  title: "Offline, hybrid, online",
  nav: "Offline, hybrid, online",
  lead: "The same signed records work with no server, with a server that only watches who is there, or with a server that keeps the official clock. The genesis picks one.",
  body: ({ sequence, callout, href }) => `
<h2>At a glance</h2>
<table>
<tr><th></th><th>Offline</th><th>Hybrid</th><th>Online</th></tr>
<tr><td><code>arbiter</code></td><td><code>none</code> (0)</td><td><code>checkpoints</code> (1)</td><td><code>full</code> (2)</td></tr>
<tr><td>Link between players</td><td>Bluetooth, LAN</td><td>direct, plus a server link</td><td>direct or through the server</td></tr>
<tr><td>Who keeps time</td><td>both devices (<code>peer</code>)</td><td>both devices (<code>peer</code>)</td><td>the server (<code>anchored</code>)</td></tr>
<tr><td>Server's job</td><td>a backup, if anyone anchors</td><td>witness of who is still there</td><td>timestamps every record, decides flags</td></tr>
<tr><td>Someone goes away</td><td><span class="pill">canceled, still saved</span></td><td><span class="pill bad">the leaver loses</span></td><td><span class="pill bad">the leaver loses</span></td></tr>
<tr><td>Link outage</td><td>paused, up to a budget</td><td>paused, up to a budget</td><td>the disconnected clock runs</td></tr>
<tr><td>Rated</td><td>yes (with a valid certificate)</td><td>yes</td><td>yes</td></tr>
</table>
<p>The "someone goes away" row is WhitePawn's choice (profile <code>whitepawn/1</code>). Other apps can choose differently through the <a href="${href("profiles")}">rules profile</a>.</p>

<h2 id="offline">Offline</h2>
<p>Two phones at a café table, no internet. The game runs entirely between them. Every record carries its signer's own clock (<code>at</code>), every record is answered at once with an ACK, and both devices compute the clocks from those signed timestamps with the same function. While the game runs, each device also pings the other four times a second and checks every timestamp it receives against its own clock. A lie bigger than a few tens of milliseconds is caught on the spot.</p>
${sequence(
  [
    { id: "w", label: "White", tone: "white" },
    { id: "b", label: "Black", tone: "black" },
    { id: "s", label: "Server", tone: "server" },
  ],
  [
    { note: { span: ["w", "b"], text: "Bluetooth: records, ACKs, pings", w: 290 } },
    { arrows: [{ from: "w", to: "b", label: "MOVE · at 41 210", tone: "ok" }] },
    { arrows: [{ from: "b", to: "w", label: "ACK · at 41 236", tone: "plain" }] },
    { arrows: [{ from: "w", to: "s", label: "unreachable", tone: "muted", dashed: true, cut: true }] },
    { note: { span: ["w", "b"], text: "game over: both sign END", w: 240, tone: "ok" } },
    { arrows: [{ from: "w", to: "s", label: "back online: report", tone: "ok" }] },
  ],
  { title: "Offline: the server only hears about the game afterwards." },
)}
<p><strong>If someone hops off.</strong> Without a referee nobody can tell whether the opponent walked away or the radio failed, so the game is <code>canceled</code>: no winner, no rating change. It is still a game: either player uploads it later and it is saved with all its moves, unrated.</p>
${callout("warn", "What no offline protocol can stop", `<p>A player who is losing can always end an offline game without a result: walk away, fake a long outage, or sign a false DISPUTE. Pawnshake makes that the only way out (it never turns into a win) and counts cancellations and disputes per account, with the engine evaluation at that moment, for review. Games that must have a winner need an arbiter.</p>`)}

<h2 id="hybrid">Hybrid</h2>
<p>Same peer clocks as offline, but the devices can also reach the server. While they can, each anchors at least every 10 seconds and right after every record it signs or receives. Each such <strong>checkpoint</strong> goes over the player's own authenticated session, so it proves "this player was here at server time T".</p>
${sequence(
  [
    { id: "w", label: "White", tone: "white" },
    { id: "s", label: "Server", tone: "server" },
    { id: "b", label: "Black", tone: "black" },
  ],
  [
    { arrows: [{ from: "w", to: "s", label: "checkpoint", tone: "ok" }, { from: "b", to: "s", label: "checkpoint", tone: "ok" }] },
    { note: { at: "w", text: "White to move" } },
    { arrows: [{ from: "w", to: "s", label: "silence", tone: "muted", dashed: true, cut: true }, { from: "b", to: "s", label: "checkpoint", tone: "ok" }] },
    { arrows: [{ from: "b", to: "s", label: "checkpoint", tone: "ok" }] },
    { note: { at: "s", text: "30 s: White away", tone: "bad" } },
    { arrows: [{ from: "s", to: "b", label: "VERDICT_ABANDON White", tone: "bad" }] },
  ],
  { title: "Hybrid: the player the game waits on stops checking in. The other one keeps checking in." },
)}
<p>The server declares a player <strong>away</strong> when all three hold:</p>
<ol class="steps">
  <li><strong>The game waits on them.</strong> They are to move, or they have not acknowledged the opponent's latest record.</li>
  <li><strong>They are silent.</strong> No checkpoint of their own for <code>away_after_ms</code> (WhitePawn: 15 s bullet, 30 s blitz, 60 s rapid, 120 s classical).</li>
  <li><strong>The other player is present.</strong> It kept checking in that whole time.</li>
</ol>
<p>Then the server signs <code>VERDICT_ABANDON</code> and the absent player loses (a draw if the remaining player cannot mate). Only a player's <em>own</em> checkpoints count: the opponent holds all of that player's signed records and could submit them to fake presence, or leave them out to fake absence. If both lose the server, nobody is present and the game falls back to the offline rules.</p>

<h2 id="online">Online</h2>
<p>The server becomes the clock. Both players anchor every record they sign, right after sending it to the opponent, and every record they receive. The server times each move by when its records reached it (their <a href="${href("anchors")}">existence time</a>) and forgives network lag from a bounded quota, the same way lichess does.</p>
${sequence(
  [
    { id: "w", label: "White", tone: "white" },
    { id: "s", label: "Server", tone: "server" },
    { id: "b", label: "Black", tone: "black" },
  ],
  [
    { arrows: [{ from: "w", to: "b", label: "MOVE Nf3", tone: "ok", dx: 0 }] },
    { arrows: [{ from: "w", to: "s", label: "anchor + record", tone: "plain" }] },
    { note: { at: "s", text: "E(Nf3) = 12:00:04.210" } },
    { arrows: [{ from: "s", to: "b", label: "push Nf3 + receipt", tone: "muted", dashed: true }] },
    { arrows: [{ from: "b", to: "s", label: "anchor ACK", tone: "plain" }] },
  ],
  { title: "Online: the move goes to the opponent, the anchor goes beside it." },
)}
<p>Why neither player can move time onto the other:</p>
<ul>
  <li>You cannot make your move look earlier than it existed: anchors carry signed heads, never bare hashes.</li>
  <li>You cannot make the opponent's move look later: the opponent anchored it when sending, and the server pushed it to you then.</li>
  <li>Anchoring your own move late only costs your own clock.</li>
  <li>If you stop anchoring, your opponent anchors your moves when they arrive, and your clock keeps running, just like losing the connection today.</li>
</ul>
<p>Flags and abandonment are the server's call, signed as verdict records (<code>VERDICT_FLAG</code>, <code>VERDICT_ABANDON</code>, <code>VERDICT_RESULT</code>). Without a direct link, an online game still works through the server alone: the anchor of a record is its delivery.</p>

<h2>Choosing</h2>
<div class="grid grid-3">
  <div class="card"><span class="kicker">Use offline when</span><p>there is no internet, or both players trust the radio more than the network. Best for over-the-board play with a board connected to each phone.</p></div>
  <div class="card"><span class="kicker">Use hybrid when</span><p>the players are nearby and want the speed of a direct link, but a game must still have a winner when someone leaves.</p></div>
  <div class="card"><span class="kicker">Use online when</span><p>players are far apart, strangers, or the game is rated and the clock must be official.</p></div>
</div>
`,
};
