export default {
  title: "Genesis",
  lead: "Three signed messages start a game. Afterwards both players hold the same genesis, its hash names the game, and nobody could choose the colours.",
  body: ({ sequence, layout, callout, href, vectors }) => {
    const g = vectors.core.genesis;
    return `
<h2>The handshake</h2>
${sequence(
  [
    { id: "a", label: "Player A", tone: "white" },
    { id: "b", label: "Player B", tone: "black" },
  ],
  [
    { note: { at: "a", text: "pick nonce_A, keep it secret" } },
    { arrows: [{ from: "a", to: "b", label: "CHALLENGE · commit = SHA-256(nonce_A)", tone: "plain" }] },
    { note: { at: "b", text: "check cert, profile, time control" } },
    { arrows: [{ from: "b", to: "a", label: "ACCEPT · nonce_B", tone: "plain" }] },
    { arrows: [{ from: "a", to: "b", label: "START · reveals nonce_A", tone: "ok" }] },
    { note: { span: ["a", "b"], text: "colours = SHA-256(nonce_A | nonce_B)[0]", w: 330, tone: "ok" } },
  ],
  { title: "Peer to peer, no server needed. A server, when there is one, just relays these three." },
)}
<ol class="steps">
  <li><strong>CHALLENGE (A)</strong> A's certificate, the time control, rated or not, the arbiter level, the colour wish, the full rules profile, and a commitment to a secret nonce. Signed by A.</li>
  <li><strong>ACCEPT (B)</strong> The hash of the challenge (so B signs the exact same profile and terms), B's certificate, and B's own random nonce. Signed by B.</li>
  <li><strong>START (A)</strong> The hash of the accept and A's nonce, revealed. Signed by A. The game begins.</li>
</ol>
<pre><code>genesis      = CHALLENGE | ACCEPT | START
genesis_hash = SHA-256(genesis)
game_id      = first 16 bytes of genesis_hash</code></pre>
<p>The vectors' game: <code>${g.game_id}</code>.</p>

<h2>Fair colours with commit and reveal</h2>
<p>With random colours, White is A when the first byte of <code>SHA-256(nonce_A | nonce_B)</code> is even.</p>
<div class="grid grid-2">
  <div class="card"><span class="kicker">A cannot choose</span><p>A committed to <code>nonce_A</code> before seeing <code>nonce_B</code>. Changing it later breaks the commitment.</p></div>
  <div class="card"><span class="kicker">B cannot choose</span><p>B picked <code>nonce_B</code> without knowing <code>nonce_A</code>, only its hash. Any choice is a coin flip.</p></div>
</div>
<p>A can still refuse to send START after computing the colours. That only cancels a game that never began, and an app can count such refusals.</p>

<h2>What the genesis guarantees</h2>
<ul>
  <li><strong>No replay between games.</strong> Every record's header names the <code>genesis_hash</code>, and both nonces make every genesis unique. A record from one game is meaningless in another.</li>
  <li><strong>Both signed the same rules.</strong> ACCEPT signs the hash of CHALLENGE, profile included. Verifiers judge the game by the values written there, never by their own defaults.</li>
  <li><strong>Known keys.</strong> Both device keys come from certificates the server signed. Offline, a device can still play with a certificate that is valid; an expired one can only start unrated games.</li>
</ul>
${layout("CHALLENGE", [
  { name: "PSCHAL01", size: 8, kind: "magic" },
  { name: "cert_A", size: "~124", kind: "key" },
  { name: "initial_ms", size: 4, kind: "int" },
  { name: "increment_ms", size: 4, kind: "int" },
  { name: "rated", size: 1, kind: "int" },
  { name: "arbiter", size: 1, kind: "int", note: "0 none, 1 checkpoints, 2 full" },
  { name: "color", size: 1, kind: "int", note: "0 random, 1 white, 2 black" },
  { name: "profile", size: "var", kind: "text" },
  { name: "commit", size: 32, kind: "hash" },
  { name: "sig_A", size: 64, kind: "sig" },
], { total: `${g.challenge.length / 2} bytes in the vectors` })}
${callout("tip", "Byte by byte", `<p>All three messages are dumped with every field coloured on <a href="${href("bytes")}#genesis-messages">Byte layouts</a>.</p>`)}

<h2>Device certificates</h2>
<p>A player's records are signed with a <strong>device key</strong> made on the device and never exported. While online, the server certifies it: "this public key belongs to user X until date Y". The server's own public keys ship inside the apps, by <code>key_id</code>, so certificates can be checked offline.</p>
<ul>
  <li>Valid 30 days, renewed silently whenever the app is online.</li>
  <li>One key per device and account, not per game: offline, nobody could certify a fresh one.</li>
  <li>Revocation (a lost phone, "sign out everywhere") is checked when a game is anchored or reported: a game signed by a revoked key is not rated.</li>
</ul>
`;
  },
};
