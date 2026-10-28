export default {
  title: "Clocks",
  lead: "Signatures prove what a player said, never when. Pawnshake gets time from the players' own signed timestamps, cross-checked live, or from the server's anchors.",
  body: ({ sequence, callout, href }) => `
<h2>Time on every record</h2>
<p>Every record carries <code>at</code>: the signer's own monotonic clock in milliseconds, counted from the moment it handled START. Every received record (except an ACK) is answered at once with an ACK whose <code>at</code> is when it was applied. That gives every turn a start and an end on the mover's own clock:</p>
<pre><code>think(move) = at(move) − at(mover's ACK of the opponent's previous move)</code></pre>
<div class="tl">
  <div class="tl-row"><span class="tl-who">White</span><div class="tl-bar"><span class="tl-think" style="flex:3">White thinks</span><span class="tl-transit" style="flex:1">transit</span><span class="tl-wait" style="flex:4">waiting</span><span class="tl-transit" style="flex:1">transit</span><span class="tl-think" style="flex:2">White thinks</span></div></div>
  <div class="tl-row"><span class="tl-who">Black</span><div class="tl-bar"><span class="tl-wait" style="flex:3">waiting</span><span class="tl-transit" style="flex:1">transit</span><span class="tl-think b" style="flex:4">Black thinks</span><span class="tl-transit" style="flex:1">transit</span><span class="tl-wait" style="flex:2">waiting</span></div></div>
  <p class="tl-cap">A clock stops when its player signs a move and starts when that player acknowledges the opponent's move. Transit in between is charged to nobody, up to an allowance.</p>
</div>
<p>Both clock modes use <code>think</code>. <strong>Peer</strong> clocks (offline, hybrid) charge it directly. <strong>Anchored</strong> clocks (online) feed it to the lag quota as the player's claim.</p>

<h2>Peer clocks: one function, no negotiation</h2>
<p>Both devices, and the server when the game is reported, compute the clocks with the same function over the chain. Nothing is exchanged about time beyond the records, so the two screens always show the same clocks.</p>
<h3>Reading the link from ACKs</h3>
<p>Each ACK <code>k</code> of a record <code>r</code> is one transit sample, measured across two different clocks:</p>
<pre><code>u(r)   = at(k) − at(r)                 true transit + clock offset
m_wb   = smallest u, white to black    (last 16 samples)
m_bw   = smallest u, black to white
rtt    = m_wb + m_bw                   offsets cancel out
theta  = (m_wb − m_bw) / 2             black clock minus white clock
J      = max(2 × rtt, 30 ms)           allowance per message</code></pre>
<p>The offset between the two clocks is unknown and does not matter: it cancels in the round trip. A window of recent samples follows crystal drift.</p>

<h3>Excess and the pause budget</h3>
<p>A message that took longer than the fastest one in its direction plus <code>J</code> has <strong>excess</strong>: an outage, or a lie. Excess becomes paused time, taken from one budget per game shared by both players (WhitePawn: 2 s bullet, 5 s blitz, 10 s rapid, 20 s classical).</p>
<div class="tl">
  <div class="tl-row"><span class="tl-who">honest</span><div class="tl-bar"><span class="tl-think" style="flex:5">think</span><span class="tl-transit" style="flex:1">≤ J</span><span class="tl-wait" style="flex:4"></span></div></div>
  <div class="tl-row"><span class="tl-who">hiccup</span><div class="tl-bar"><span class="tl-think" style="flex:5">think</span><span class="tl-transit" style="flex:1">J</span><span class="tl-pause" style="flex:2">paused</span><span class="tl-wait" style="flex:2"></span></div></div>
  <div class="tl-row"><span class="tl-who">outage</span><div class="tl-bar"><span class="tl-think" style="flex:5">think</span><span class="tl-transit" style="flex:1">J</span><span class="tl-pause" style="flex:3">budget gone</span><span style="flex:1;background:var(--bad);color:#fff">canceled</span></div></div>
  <p class="tl-cap">When an outage is longer than the budget left, the game is <code>canceled</code> unless both players sign RESUME, which turns the whole outage into paused time.</p>
</div>
${callout("idea", "Nobody pays for transit", `<p>Without a referee, an outage cannot be blamed on either side. Charging one side would let the other fake outages to burn its clock. So transit is never charged, and outages only ever cancel or pause.</p>`)}

<h3>The clocks</h3>
<pre><code>remaining(X) = initial + increment × moves(X) − Σ think(X's moves)</code></pre>
<p>The first move of each side is free, as on every chess server. A move whose <code>think</code> takes its signer below zero counts as FLAGGED. A FLAG_CLAIM is valid when, converted to the flagged player's clock with <code>theta</code>, its time lies more than <code>remaining + J</code> after that player's turn began. An honest client signs FLAGGED itself when its own clock runs out.</p>

<h2>Peer clocks: live checks</h2>
<p>The chain alone cannot tell a slow link from a lie. The devices can, while the game runs: each knows its own clock is true. They ping each other every 250 ms on the same ordered link as the records (unsigned, never stored) and measure round trip, offset and clock rate NTP-style.</p>
<table>
<tr><th>Check</th><th>Fails when</th><th>Catches</th></tr>
<tr><td><strong>late ACK</strong></td><td>an ACK claims a receipt later than a pong that proves the record had already arrived</td><td>a receiver stealing thinking time</td></tr>
<tr><td><strong>early send</strong></td><td>a record claims an <code>at</code> earlier than a ping the sender sent after that moment</td><td>a sender stopping its clock early while still pinging</td></tr>
<tr><td><strong>future</strong></td><td>a record claims an <code>at</code> later than its arrival allows</td><td>a flag claim dated in the future</td></tr>
<tr><td><strong>clock rate</strong></td><td>the opponent's clock runs more than 0.1 % fast or slow</td><td>a slowed clock that hides think time</td></tr>
<tr><td><strong>asymmetry</strong></td><td>the chain's round trip exceeds my ping round trip by more than <code>J</code></td><td>a steady lie that the chain alone reads as a slow link</td></tr>
</table>
${sequence(
  [
    { id: "w", label: "Honest", tone: "white" },
    { id: "b", label: "Liar", tone: "black" },
  ],
  [
    { arrows: [{ from: "w", to: "b", label: "MOVE · at 10 000", tone: "plain" }] },
    { arrows: [{ from: "w", to: "b", label: "PING t = 10 040", tone: "muted", dashed: true }] },
    { arrows: [{ from: "b", to: "w", label: "PONG: got your ping", tone: "muted", dashed: true }] },
    { arrows: [{ from: "b", to: "w", label: "ACK: 'received only now'", tone: "bad" }] },
    { note: { at: "w", text: "the pong proves it arrived earlier → DISPUTE", tone: "bad" } },
  ],
  { title: "The late-ACK check: the link is ordered, so a pong echoing a later ping proves the move had already arrived." },
)}
<p>A failed check makes the device sign DISPUTE (with the reason and the offending record) and stop. The game ends <code>disputed</code>: no result, unrated. A device that simply stops pinging is an outage, nothing more.</p>

<h2>What a peer-clock cheater can still gain</h2>
<table>
<tr><th>Trick</th><th>Most it gains without a DISPUTE</th></tr>
<tr><td>date a move earlier than it was sent</td><td><code>J</code> per move (tens of ms on a local link)</td></tr>
<tr><td>acknowledge later than received</td><td><code>J</code> per move</td></tr>
<tr><td>run the clock slow</td><td>0.1 % of its thinking time</td></tr>
<tr><td>fake an outage</td><td>the pause budget, once per game</td></tr>
<tr><td>anything bigger</td><td>nothing: DISPUTE or canceled, never a win</td></tr>
</table>

<h2>Anchored clocks (online)</h2>
<p>With a full arbiter, both clients anchor every record they sign, right after sending it, and every record they receive. The server times each move from <a href="${href("anchors")}#existence-time">existence times</a>:</p>
<pre><code>interval = E(move) − E(opponent's previous move)
charge   = interval − refund(interval − think)</code></pre>
<p>The refund comes from a <strong>lag quota</strong>, a port of lichess' LagTracker. A client that lies about its think time gains at most the quota; an honest client on a bad connection is not flagged by the network.</p>
<pre><code>est   = initial + 40 × increment              seconds
gain  = min(1000 ms, est × 4 ms + 150 ms)     earned per move
quota = 3 × gain at the start, at most 7 × gain
refund = min(max(lag, 0), quota)
quota  = min(quota + gain − refund, 7 × gain)</code></pre>
<p>Flags and abandonment are the server's decisions, signed as verdicts.</p>
`,
};
