export default {
  title: "How it works",
  lead: "Five ideas carry the whole protocol: signed records, two links per record, one number per record, a server that only witnesses, and a game anyone can replay.",
  body: ({ chains, sequence, callout, href }) => `
<h2>1. Every action is a signed record</h2>
<p>A move, a resignation, a draw offer, a takeback, an abort, a flag: each is a <strong>record</strong>. A record says who signed it, its number in that player's chain (<code>seq</code>), the signer's clock (<code>at</code>), and one byte saying what it is (<code>op</code>). For a move, that byte <em>is</em> the move: its index among the legal moves (see <a href="${href("movecode")}">Move code</a>).</p>
<p>The player signs it with an Ed25519 key that lives on the device and was certified by the server. On the wire, a move is about 70 bytes, 64 of them signature.</p>

<h2>2. Two links tie every record down</h2>
<p>Each record points at two things it cannot change afterwards:</p>
<ul>
  <li><strong>prev</strong>: the signer's own previous record (the genesis, for the first one). So every record vouches for the signer's entire history.</li>
  <li><strong>seen</strong>: the newest record of the opponent the signer had applied. So every record also proves what the signer knew when it signed.</li>
</ul>
${chains({
  title: "Two chains, woven together. Solid arrows: prev. Dashed: seen.",
  white: [
    { label: "e4", sub: "seq 1" },
    { label: "ACK", sub: "seq 2 · saw e5", tone: "ack" },
    { label: "Nf3", sub: "seq 3" },
    { label: "ACK", sub: "seq 4 · saw Nc6", tone: "ack" },
  ],
  black: [
    { label: "ACK", sub: "seq 1 · saw e4", tone: "ack" },
    { label: "e5", sub: "seq 2" },
    { label: "ACK", sub: "seq 3 · saw Nf3", tone: "ack" },
    { label: "Nc6", sub: "seq 4" },
  ],
  seen: [
    ["b", 0, 0],
    ["w", 1, 1],
    ["b", 2, 2],
    ["w", 3, 3],
  ],
})}
<p>The signature covers a 77-byte <strong>header</strong> that holds the hash of everything else. Because the header commits to <code>prev</code> and <code>seen</code>, one signed header (a <strong>head</strong>) commits to the whole game up to that point: both players' records, in order. That is the trick the rest of the protocol leans on.</p>

<h2>3. One number, one record</h2>
${callout("rule", "The one rule", `<p>A client signs at most one record per <code>(game, seq)</code>. Signed bytes are stored before they are sent, and a resend sends the stored bytes, never a new signature.</p>`)}
<p>If two different signed records with the same <code>seq</code> ever meet (on the opponent's phone, at the server, in an uploaded report), that is a <strong>fork</strong>, and the signer loses the game. It is the only thing a player is ever punished for. Everything else that is wrong (a bad signature, an illegal move code, a draw acceptance with no offer) just makes that record <em>void</em>; the game goes on.</p>
${chains({
  title: "A fork: White signed two different second moves. Both carry seq 3.",
  white: [
    { label: "e4", sub: "seq 1" },
    { label: "ACK", sub: "seq 2", tone: "ack" },
    { label: "Nf3", sub: "seq 3 → Black" },
  ],
  black: [
    { label: "ACK", sub: "seq 1", tone: "ack" },
    { label: "e5", sub: "seq 2" },
  ],
  seen: [
    ["b", 0, 0],
    ["w", 1, 1],
  ],
  fork: { side: "w", idx: 2, label: "Bc4", sub: "seq 3 → server" },
})}
<p>That one rule is why "send one move to the opponent and another to the server" cannot work. The two copies cannot both be valid, and each side holds a signed copy.</p>

<h2>4. The server only witnesses</h2>
<p>A server is optional. When there is one, players <strong>anchor</strong> their head with it: they send the newest signed header, and the server signs a receipt saying "these records existed at server time T". The server never relays a move between players, so it adds no delay. Depending on the game, anchors are:</p>
<ul>
  <li>a timestamped backup (offline games),</li>
  <li>proof of who is still connected (hybrid games),</li>
  <li>the official clock (online games).</li>
</ul>
<p>Read more in <a href="${href("anchors")}">Anchors and receipts</a>.</p>

<h2>5. Anyone can replay the game</h2>
<p>Both devices, the server and any later checker run the <strong>same function</strong> over the <strong>same records</strong> in the same <a href="${href("order")}">canonical order</a>, and get the same board, the same clocks and the same result. Nothing is negotiated. After the game, either player uploads it; the server merges both uploads (a report can only add records, never remove them) and saves the result.</p>
${sequence(
  [
    { id: "w", label: "White", tone: "white" },
    { id: "s", label: "Server", tone: "server" },
    { id: "b", label: "Black", tone: "black" },
  ],
  [
    { note: { span: ["w", "b"], text: "played over Bluetooth, no internet", w: 330 } },
    { arrows: [{ from: "w", to: "s", label: "report: all records", tone: "ok" }] },
    { note: { at: "s", text: "verify, run the order, save", tone: "ok" } },
    { arrows: [{ from: "b", to: "s", label: "report later: merged (union)", tone: "muted", dashed: true }] },
  ],
  { title: "An offline game, reported later. One upload is enough." },
)}

<h2>The vocabulary</h2>
<table>
<tr><th>Word</th><th>Means</th></tr>
<tr><td><strong>record</strong></td><td>one signed action: a move, a command, an ACK, a verdict</td></tr>
<tr><td><strong>genesis</strong></td><td>the three signed messages that start a game (CHALLENGE, ACCEPT, START); its hash names the game</td></tr>
<tr><td><strong>header / head</strong></td><td>the 77 signed bytes of a record; a head is that header plus its signature, about 98 bytes</td></tr>
<tr><td><strong>ACK</strong></td><td>"I applied your record at my time t": a clock sample, no effect on the board</td></tr>
<tr><td><strong>fork</strong></td><td>two different signed headers for one (signer, seq): the signer loses</td></tr>
<tr><td><strong>anchor / receipt</strong></td><td>a head sent to the server / the server's signed answer with its time</td></tr>
<tr><td><strong>arbiter</strong></td><td>how much the server referees: none, checkpoints or full</td></tr>
<tr><td><strong>rules profile</strong></td><td>the game's policy numbers (allowances, budgets, what leaving costs), signed into the genesis</td></tr>
</table>
`,
};
