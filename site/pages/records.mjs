export default {
  title: "Records",
  lead: "Every move and every command is one record: a few varints and a byte on the wire, a 77-byte header under the signature, and a body the header commits to.",
  body: ({ layout, callout, href, chains }) => `
<h2>The op byte</h2>
<p>One byte says what a record is. Values 0 to 217 are moves: the byte is the <a href="${href("movecode")}">move code</a> itself. Everything above is a command.</p>
<table>
<tr><th>op</th><th>Record</th><th>Args</th><th>Valid when</th></tr>
<tr><td><code>0..217</code></td><td><strong>MOVE</strong> (the code)</td><td></td><td>signer's turn, the code is legal, the clock has not run out</td></tr>
<tr><td><code>218</code></td><td>RESIGN</td><td></td><td>game running</td></tr>
<tr><td><code>219</code> / <code>220</code> / <code>221</code></td><td>DRAW_OFFER / ACCEPT / DECLINE</td><td></td><td>accept only an offer that is standing and in the signer's <code>seen</code></td></tr>
<tr><td><code>222</code> / <code>223</code> / <code>224</code></td><td>TAKEBACK_OFFER / ACCEPT / DECLINE</td><td></td><td>unrated games, the offerer has moved</td></tr>
<tr><td><code>225</code></td><td>ABORT</td><td></td><td>fewer than two moves made</td></tr>
<tr><td><code>226</code></td><td>FLAGGED</td><td></td><td>"my own clock ran out"</td></tr>
<tr><td><code>227</code></td><td>FLAG_CLAIM</td><td></td><td>"your clock ran out, as of my <code>at</code>" (peer clocks)</td></tr>
<tr><td><code>229</code></td><td>END</td><td>result, termination</td><td>after the game ended: "I sign this result"</td></tr>
<tr><td><code>230</code></td><td>ACK</td><td></td><td>always: "I applied your record <code>seen</code> at my time <code>at</code>"</td></tr>
<tr><td><code>231</code></td><td>DISPUTE</td><td>reason, subject seq</td><td>a live time check failed</td></tr>
<tr><td><code>232</code></td><td>RESUME</td><td></td><td>continue after an outage beyond the budget (both must send it)</td></tr>
<tr><td><code>233</code></td><td>CANCEL</td><td>1 leave, 2 opponent gone</td><td>game running</td></tr>
<tr><td><code>240</code> / <code>241</code> / <code>242</code></td><td>VERDICT_FLAG / ABANDON / RESULT</td><td>color · result, clocks</td><td>server only, game has an arbiter</td></tr>
<tr><td><code>228</code>, <code>234..239</code>, <code>243..255</code></td><td>reserved</td><td></td><td>always invalid</td></tr>
</table>
<p>Chat, rematch offers and presence are not records: they never change the game.</p>

<h2>On the wire</h2>
<p>What actually travels between players is tiny. The signer is not sent (it is the peer on a direct link, and the container says it everywhere else), and neither is anything the receiver can rebuild.</p>
${layout(
  "Wire record",
  [
    { name: "seq", size: "varint", kind: "int", note: "signer's number, from 1" },
    { name: "seen", size: "varint", kind: "int", note: "opponent's newest seq applied" },
    { name: "at", size: "varint", kind: "int", note: "ms since START" },
    { name: "op", size: 1, kind: "op" },
    { name: "args", size: "0+", kind: "arg" },
    { name: "signature", size: 64, kind: "sig", note: "Ed25519 over the header" },
  ],
  { total: "~70 bytes", caption: "Varints are unsigned LEB128 and must be minimal, so a record has exactly one byte form. A server record has a second <code>seen</code> (one per player)." },
)}

<h2>Header and body</h2>
<p>The receiver rebuilds two structures from its own state and the wire bytes. They are never sent, only signed.</p>
${layout(
  "Body",
  [
    { name: "prev", size: 32, kind: "hash", note: "id of my seq-1 (genesis hash for seq 1)" },
    { name: "seen", size: 4, kind: "int" },
    { name: "seen_hash", size: 32, kind: "hash", note: "id of the opponent's record #seen" },
    { name: "at", size: 4, kind: "int" },
    { name: "op", size: 1, kind: "op" },
    { name: "args", size: "0+", kind: "arg" },
    { name: "ply", size: 2, kind: "int", note: "moves only" },
    { name: "legal", size: 1, kind: "int", note: "moves only" },
  ],
  { total: "76 bytes for a move" },
)}
${layout(
  "Header (this is what gets signed)",
  [
    { name: "PSREC001", size: 8, kind: "magic" },
    { name: "genesis_hash", size: 32, kind: "hash" },
    { name: "signer", size: 1, kind: "int", note: "0 white, 1 black, 2 server" },
    { name: "seq", size: 4, kind: "int" },
    { name: "body_hash", size: 32, kind: "hash", note: "SHA-256(body)" },
  ],
  { total: "77 bytes" },
)}
<pre><code>body_hash  = SHA-256(body)
record id  = SHA-256(header)
signature  = Ed25519(device key, header)</code></pre>

<h3>Why two layers</h3>
<p>The signature covers only the short header, and the header holds only a hash of the body. So anyone with the genesis can check a record's <strong>head</strong> (signer, seq, body_hash, signature) without seeing the moves, and that head still commits to the whole game so far, through <code>prev</code> (the signer's history) and <code>seen_hash</code> (the opponent's history up to what the signer saw). Anchors and stored games use exactly this.</p>

<h3>Why <code>ply</code> and <code>legal</code></h3>
<p>A move code only means something in a known position. If two engines disagree about which moves are legal (a bug, an old version), they would silently play different moves from the same byte. Putting the number of legal moves into the signed body turns that into a signature failure on the spot.</p>

<h2>Identity is the header, not the bytes</h2>
<p>A record is identified by its <strong>record id</strong>, the hash of its header, never by its wire bytes. A dishonest signer can produce a second valid signature for the same header. Two copies with equal headers and different signature bytes are the same record: a duplicate, not a fork.</p>
${callout("idea", "A record is checked where it falls", `<p>Each record is validated at its place in the <a href="${href("order")}">canonical order</a> against the game state there. A record that is not valid at that point is <strong>void</strong>: it changes nothing and costs nothing, and the chain continues after it. Only a fork is punished.</p>`)}

<h2>ACKs: the clock's heartbeat</h2>
<p>Every received record except an ACK is answered at once with an ACK. Its <code>seen</code> names the record it applied, its <code>at</code> the moment it applied it. ACKs never get acknowledged and do nothing on the board, but they give every turn a start and an end on the mover's own clock. See <a href="${href("clocks")}">Clocks</a>.</p>
${chains({
  title: "Each move is answered by an ACK: a timestamped receipt signed by the other player.",
  white: [
    { label: "e4", sub: "at 1 000" },
    { label: "ACK", sub: "at 2 251 · saw e5", tone: "ack" },
  ],
  black: [
    { label: "ACK", sub: "at 74 239 · saw e4", tone: "ack" },
    { label: "e5", sub: "at 75 439", tone: "hot" },
  ],
  seen: [
    ["b", 0, 0],
    ["b", 1, 0],
    ["w", 1, 1],
  ],
})}
<p>These are the records of the conformance vectors. The <code>at</code> values come from two different clocks, so they are never compared directly: Black thought from its ACK (74 239) to its move (75 439), 1.2 seconds on its own clock.</p>
`,
};
