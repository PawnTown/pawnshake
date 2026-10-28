export default {
  title: "Overview",
  nav: "Overview",
  description: "Pawnshake: signed, peer-to-peer chess games with a clock. One hop per move, provable cheating, offline play that still counts.",
  hero: ({ vectors, href, esc }) => {
    const rec = vectors.core.chain.records[0];
    const b = rec.wire.match(/../g);
    const cell = (k, list) => list.map((x) => `<span class="hb k-${k}">${x}</span>`).join("");
    return `<section class="hero">
  <div class="hero-in">
    <div>
      <p class="eyebrow">The Pawnshake protocol</p>
      <h1>Chess you can sign.</h1>
      <p class="lead">Two players sign every move and send it straight to each other. One network hop per move, a game that can run with no server at all, and a cheater who always leaves proof behind.</p>
      <div class="hero-cta"><a class="btn primary" href="${href("concepts")}">How it works</a><a class="btn ghost" href="${href("attacks")}">See the attacks it stops</a></div>
      <p class="hero-wire"><b>1. e4</b>, as it travels: ${cell("int", b.slice(0, 1))}${cell("int", b.slice(1, 2))}${cell("int", b.slice(2, 4))}${cell("op", b.slice(4, 5))}${cell("sig", b.slice(5, 9))}<span style="color:#a983ad"> + 60 more signature bytes</span><br>seq · seen · time · <b>move code 13</b> · Ed25519 signature</p>
    </div>
    <div class="hero-art"><img src="assets/logo.png" alt="Pawnshake: a pink milkshake with a pawn on the cup"></div>
  </div>
  <div class="hero-stats">
    <div><b>1 byte</b><span>per move: its index among the legal moves</span></div>
    <div><b>~70 B</b><span>per signed record on the wire</span></div>
    <div><b>1 hop</b><span>player to player, the server listens beside</span></div>
    <div><b>0</b><span>servers needed to play a valid game</span></div>
  </div>
  <svg class="drip" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true"><path fill="#fdf6e9" d="M0,60 L0,24 C80,24 90,46 150,46 C210,46 200,18 290,18 C360,18 360,52 430,52 C490,52 480,26 560,26 C640,26 650,44 720,44 C800,44 790,14 880,14 C960,14 950,50 1030,50 C1100,50 1100,28 1180,28 C1260,28 1260,42 1330,42 C1390,42 1400,30 1440,30 L1440,60 Z"/></svg>
</section>`;
  },
  body: ({ sequence, href, callout }) => `
<h2>What it is</h2>
<p>Pawnshake is a small protocol for chess games with a clock (bullet, blitz, rapid, classical). Every move and every command (resign, offer a draw, take back, abort, flag) is a <strong>record</strong> the player signs with a device key and sends directly to the opponent. The records of both players form one chain. Anyone holding that chain can replay and check the whole game from the signatures alone.</p>

${sequence(
  [
    { id: "w", label: "White", tone: "white" },
    { id: "b", label: "Black", tone: "black" },
    { id: "s", label: "Server", tone: "server" },
  ],
  [
    { note: { at: "w", text: "signs 1. e4 (seq 1)" } },
    { arrows: [{ from: "w", to: "b", label: "MOVE e4 · 70 B", tone: "ok" }] },
    { arrows: [{ from: "w", to: "s", label: "anchor the head (optional)", tone: "muted", dashed: true }] },
    { arrows: [{ from: "b", to: "w", label: "ACK · seen 1", tone: "plain" }] },
    { note: { at: "b", text: "thinks, signs 1... e5" } },
    { arrows: [{ from: "b", to: "w", label: "MOVE e5 · seen 1", tone: "ok" }] },
  ],
  { title: "One move, one hop. The server stays off the path between the players." },
)}

<h2>Why bother</h2>
<div class="grid grid-3">
  <div class="card"><span class="kicker">Speed</span><h3>One hop per move</h3><p>A move goes player to player. A server, when there is one, is told beside the move, never in front of it.</p></div>
  <div class="card"><span class="kicker">Proof</span><h3>Cheating leaves evidence</h3><p>Sending two different moves for one turn means two signatures for one number. That pair is a fork, and the signer loses.</p></div>
  <div class="card"><span class="kicker">Offline</span><h3>Games without internet</h3><p>Play over Bluetooth or a LAN. Upload later: the chain proves every move, and the server saves it like any game.</p></div>
</div>

<h2>Three ways to play</h2>
<p>The game's genesis fixes how much of a referee (the <strong>arbiter</strong>) takes part. The records are the same in all three.</p>
<div class="grid grid-3">
  <a class="card mode-card" href="${href("modes")}#offline"><span class="glyph">0</span><span class="kicker">arbiter none</span><h3>Offline</h3><p>Both devices keep the clock from signed timestamps and check each other live. Someone hops off: canceled, still saved.</p><span class="pill">peer clocks</span></a>
  <a class="card mode-card" href="${href("modes")}#hybrid"><span class="glyph">1</span><span class="kicker">arbiter checkpoints</span><h3>Hybrid</h3><p>Peer clocks, plus server checkpoints that prove who is still there. The player who goes away loses.</p><span class="pill">peer clocks</span><span class="pill hot">presence</span></a>
  <a class="card mode-card" href="${href("modes")}#online"><span class="glyph">2</span><span class="kicker">arbiter full</span><h3>Online</h3><p>The server timestamps every record through anchors and keeps the official clock. Lag is forgiven from a bounded quota.</p><span class="pill hot">anchored clocks</span></a>
</div>

${callout("rule", "The one rule", `<p>A client signs at most one record per sequence number. Everything else that goes wrong only voids a record. Breaking this rule is the only thing a player is ever punished for, and an honest client can never break it.</p>`)}

<h2>Where to go next</h2>
<div class="grid grid-2">
  <a class="card" href="${href("concepts")}"><span class="kicker">5 minutes</span><h3>How it works</h3><p>Records, chains, forks and anchors, with pictures.</p></a>
  <a class="card" href="${href("bytes")}"><span class="kicker">Byte by byte</span><h3>Byte layouts</h3><p>Every payload drawn from the real test vectors.</p></a>
  <a class="card" href="${href("attacks")}"><span class="kicker">Security</span><h3>Attack gallery</h3><p>Twenty-odd tricks a cheater could try, and why each one fails.</p></a>
  <a class="card" href="${href("libraries")}"><span class="kicker">Build</span><h3>Libraries</h3><p>Go, TypeScript and Dart, byte-identical on the same vectors.</p></a>
</div>
`,
};
