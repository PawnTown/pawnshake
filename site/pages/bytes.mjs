// Byte layouts, drawn from vectors/core.json: the exact bytes every
// implementation must produce.
const PROFILE_KEYS = {
  1: "j_min_ms",
  2: "j_rtt_mult",
  3: "sample_window",
  4: "pause_budget_ms",
  5: "ping_interval_ms",
  6: "rate_tolerance_ppm",
  7: "checkpoint_interval_ms",
  8: "away_after_ms",
  9: "leave_with_arbiter",
  10: "leave_offline",
  11: "free_first_moves",
  12: "takebacks",
  13: "report_wait_days",
};

function readVarint(hex, off) {
  let v = 0;
  let mul = 1;
  let n = 0;
  for (;;) {
    const b = parseInt(hex.slice((off + n) * 2, (off + n) * 2 + 2), 16);
    v += (b & 0x7f) * mul;
    mul *= 128;
    n++;
    if (!(b & 0x80)) return [v, n];
  }
}

// Segments of a rules profile starting at byte `off` of `hex`.
function profileSegs(hex, off) {
  const nameLen = parseInt(hex.slice(off * 2, off * 2 + 2), 16);
  const segs = [
    { len: 1, label: "name length", kind: "int" },
    { len: nameLen, label: "name", kind: "text" },
  ];
  let at = off + 1 + nameLen;
  const [count, cn] = readVarint(hex, at);
  segs.push({ len: cn, label: `count (${count})`, kind: "int" });
  at += cn;
  for (let i = 0; i < count; i++) {
    const [k, kn] = readVarint(hex, at);
    const [v, vn] = readVarint(hex, at + kn);
    segs.push({ len: kn + vn, label: `${k} ${PROFILE_KEYS[k] || "?"} = ${v}`, kind: i % 2 ? "var" : "int" });
    at += kn + vn;
  }
  return { segs, len: at - off };
}

function certSegs(hex, off, who = "") {
  const uidLen = parseInt(hex.slice((off + 9) * 2, (off + 9) * 2 + 2), 16);
  return {
    segs: [
      { len: 8, label: `${who}PSCERT01`, kind: "magic" },
      { len: 1, label: `${who}key_id`, kind: "int" },
      { len: 1, label: `${who}user id length`, kind: "int" },
      { len: uidLen, label: `${who}user id`, kind: "text" },
      { len: 32, label: `${who}device public key`, kind: "key" },
      { len: 4, label: `${who}issued`, kind: "int" },
      { len: 4, label: `${who}expires`, kind: "int" },
      { len: 64, label: `${who}server signature`, kind: "sig" },
    ],
    len: 8 + 1 + 1 + uidLen + 32 + 4 + 4 + 64,
  };
}

export default {
  title: "Byte layouts",
  nav: "Byte layouts",
  lead: "Every payload, field by field. The coloured dumps are the real bytes from the conformance vectors that the Go, TypeScript and Dart libraries all reproduce. Hover or tap a byte to see which field it belongs to.",
  body: ({ hexdump, layout, varintLen, vectors, callout, href }) => {
    const c = vectors.core;
    const [move, ackB, , , verdict] = c.chain.records;
    const wireSegs = (r, server = false) => {
      let o = 0;
      const segs = [];
      const v = (label) => {
        const n = varintLen(r.wire, o);
        segs.push({ len: n, label, kind: "int" });
        o += n;
      };
      v("seq");
      v(server ? "seen (white)" : "seen");
      if (server) v("seen (black)");
      v("at");
      segs.push({ len: 1, label: "op", kind: "op" });
      o += 1;
      const argLen = r.wire.length / 2 - o - 64;
      if (argLen > 0) segs.push({ len: argLen, label: "args", kind: "arg" });
      segs.push({ len: 64, label: "signature", kind: "sig" });
      return segs;
    };
    const prof = profileSegs(c.profile.hex, 0);
    const chalCert = certSegs(c.genesis.challenge, 8, "cert: ");
    const chalProf = profileSegs(c.genesis.challenge, 8 + chalCert.len + 11);
    const accCert = certSegs(c.genesis.accept, 40, "cert: ");
    return `
<div class="swatches">
  <span class="hx-leg k-magic"><i></i>magic tag</span>
  <span class="hx-leg k-hash"><i></i>hash</span>
  <span class="hx-leg k-int"><i></i>number</span>
  <span class="hx-leg k-op"><i></i>op</span>
  <span class="hx-leg k-arg"><i></i>args</span>
  <span class="hx-leg k-key"><i></i>key / nonce</span>
  <span class="hx-leg k-text"><i></i>text</span>
  <span class="hx-leg k-sig"><i></i>signature</span>
</div>

<h2>Conventions</h2>
<ul>
  <li><strong>Fixed integers</strong> are big-endian (<code>u16</code>, <code>u32</code>, <code>u64</code>).</li>
  <li><strong>Varints</strong> are unsigned LEB128 and must be minimal: <code>00</code> is 0, <code>e8 07</code> is 1000. A longer encoding of the same number is rejected, so every message has exactly one byte form.</li>
  <li><strong>Magic tags</strong> open every signed message (<code>PSREC001</code>, <code>PSCHAL01</code>, <code>PSCERT01</code> ...). A signature for one kind of message can never verify as another, and a new layout gets a new tag.</li>
  <li><strong>Hashes</strong> are SHA-256, <strong>signatures</strong> Ed25519 (64 bytes), verified under ZIP-215 rules.</li>
</ul>

<h2>A move on the wire</h2>
<p>White's first move, 1. e4, exactly as it travels from White's phone to Black's: sequence 1, nothing seen yet, signed 1000 ms after START, move code 13.</p>
${hexdump(move.wire, wireSegs(move), { title: "Wire record: 1. e4" })}
<p>Black's acknowledgement is the same shape with op <code>230</code> (ACK) and <code>seen = 1</code>:</p>
${hexdump(ackB.wire, wireSegs(ackB), { title: "Wire record: Black's ACK of e4" })}

<h2>What gets signed</h2>
<p>The receiver rebuilds the body from its own chain and the wire bytes, hashes it, and checks the signature over the header.</p>
${hexdump(
  move.body,
  [
    { len: 32, label: "prev (genesis hash, seq 1)", kind: "hash" },
    { len: 4, label: "seen u32", kind: "int" },
    { len: 32, label: "seen_hash (zeros: nothing seen)", kind: "hash" },
    { len: 4, label: "at u32", kind: "int" },
    { len: 1, label: "op", kind: "op" },
    { len: 2, label: "ply u16", kind: "int" },
    { len: 1, label: "legal (20 moves)", kind: "int" },
  ],
  { title: "Body of 1. e4" },
)}
${hexdump(
  move.header,
  [
    { len: 8, label: "PSREC001", kind: "magic" },
    { len: 32, label: "genesis_hash", kind: "hash" },
    { len: 1, label: "signer (0 white)", kind: "int" },
    { len: 4, label: "seq u32", kind: "int" },
    { len: 32, label: "body_hash", kind: "hash" },
  ],
  { title: "Header of 1. e4 (signed)" },
)}

<h2>A head</h2>
<p>The header's variable parts plus its signature. The genesis is known to everyone involved, so this is all an <a href="${href("anchors")}">anchor</a> needs, and it still commits to the whole game.</p>
${hexdump(
  move.head,
  [
    { len: 1, label: "signer", kind: "int" },
    { len: varintLen(move.head, 1), label: "seq varint", kind: "int" },
    { len: 32, label: "body_hash", kind: "hash" },
    { len: 64, label: "signature", kind: "sig" },
  ],
  { title: "Head of 1. e4" },
)}

<h2>A server verdict</h2>
<p>Server records carry two <code>seen</code> values, one per player. This one is <code>VERDICT_RESULT</code> (op 242) with the result, the termination and both final clocks as varints.</p>
${hexdump(verdict.wire, wireSegs(verdict, true), { title: "Wire record: VERDICT_RESULT" })}

<h2>Device certificate</h2>
<p>The server certifies each device key while the device is online. Valid 30 days, renewed silently.</p>
${layout("Certificate", [
  { name: "PSCERT01", size: 8, kind: "magic" },
  { name: "key_id", size: 1, kind: "int", note: "which server key" },
  { name: "user_id", size: "1 + n", kind: "text" },
  { name: "device_pk", size: 32, kind: "key" },
  { name: "issued", size: 4, kind: "int" },
  { name: "expires", size: 4, kind: "int" },
  { name: "server_sig", size: 64, kind: "sig" },
])}
${hexdump(c.cert.hex, certSegs(c.cert.hex, 0).segs, { title: "Certificate for user:white" })}

<h2>Rules profile</h2>
<p>A name and numbered key/value pairs, both varints. This is <code>whitepawn/1</code> for a 3+2 rated blitz game.</p>
${hexdump(c.profile.hex, prof.segs, { title: "Profile whitepawn/1, blitz 3+2" })}

<h2>Genesis messages</h2>
<p>Three messages start a game; see <a href="${href("genesis")}">Genesis</a> for the handshake. CHALLENGE carries the challenger's certificate and the rules profile in full.</p>
${hexdump(
  c.genesis.challenge,
  [
    { len: 8, label: "PSCHAL01", kind: "magic" },
    ...chalCert.segs,
    { len: 4, label: "initial_ms", kind: "int" },
    { len: 4, label: "increment_ms", kind: "int" },
    { len: 1, label: "rated", kind: "int" },
    { len: 1, label: "arbiter", kind: "int" },
    { len: 1, label: "color", kind: "int" },
    { len: chalProf.len, label: "rules profile", kind: "text" },
    { len: 32, label: "commit = SHA-256(nonce_A)", kind: "hash" },
    { len: 64, label: "signature A", kind: "sig" },
  ],
  { title: "CHALLENGE" },
)}
${hexdump(
  c.genesis.accept,
  [
    { len: 8, label: "PSACPT01", kind: "magic" },
    { len: 32, label: "SHA-256(CHALLENGE)", kind: "hash" },
    ...accCert.segs,
    { len: 16, label: "nonce_B", kind: "key" },
    { len: 64, label: "signature B", kind: "sig" },
  ],
  { title: "ACCEPT" },
)}
${hexdump(
  c.genesis.start,
  [
    { len: 8, label: "PSSTRT01", kind: "magic" },
    { len: 32, label: "SHA-256(ACCEPT)", kind: "hash" },
    { len: 16, label: "nonce_A (revealed)", kind: "key" },
    { len: 64, label: "signature A", kind: "sig" },
  ],
  { title: "START" },
)}

<h2>Anchor receipt</h2>
<p>The server's signed answer to an anchor: the highest heads it holds for both players, its clock, and the hash of its previous receipt for this game.</p>
${hexdump(
  c.receipt.hex,
  [
    { len: 8, label: "PSANCH01", kind: "magic" },
    { len: 1, label: "key_id", kind: "int" },
    { len: 32, label: "genesis_hash", kind: "hash" },
    { len: 4, label: "white_seq", kind: "int" },
    { len: 32, label: "white record id", kind: "hash" },
    { len: 4, label: "black_seq", kind: "int" },
    { len: 32, label: "black record id", kind: "hash" },
    { len: 32, label: "state_hash", kind: "hash" },
    { len: 1, label: "state_verified", kind: "int" },
    { len: 8, label: "server_ms u64", kind: "int" },
    { len: 4, label: "anchor_no", kind: "int" },
    { len: 32, label: "prev_receipt", kind: "hash" },
    { len: 64, label: "server signature", kind: "sig" },
  ],
  { title: "Receipt" },
)}

<h2>Ping and pong</h2>
<p>Peer games exchange pings four times a second on the same ordered link as the records. They are unsigned and never stored: they only feed the live checks.</p>
${layout("PING", [
  { name: "id", size: 2, kind: "int" },
  { name: "t", size: 4, kind: "int", note: "sender's clock" },
])}
${layout("PONG", [
  { name: "id", size: 2, kind: "int" },
  { name: "t_echo", size: 4, kind: "int" },
  { name: "t_rx", size: 4, kind: "int" },
  { name: "t_tx", size: 4, kind: "int" },
])}

<h2>Sizes at a glance</h2>
<table>
<tr><th>Payload</th><th>Bytes</th></tr>
<tr><td>move, ACK or resign on the wire</td><td>about 70</td></tr>
<tr><td>header (signed)</td><td>77</td></tr>
<tr><td>head (anchor unit)</td><td>about 98</td></tr>
<tr><td>certificate</td><td>${c.cert.hex.length / 2} (with a 10-character user id)</td></tr>
<tr><td>CHALLENGE / ACCEPT / START</td><td>${c.genesis.challenge.length / 2} / ${c.genesis.accept.length / 2} / ${c.genesis.start.length / 2}</td></tr>
<tr><td>receipt</td><td>${c.receipt.hex.length / 2}</td></tr>
<tr><td>a stored 40-move game (compact form)</td><td>about 1 KB of records plus 3 signatures</td></tr>
</table>
${callout("tip", "Check your own implementation", `<p>These dumps are <code>vectors/core.json</code>. Every library in the repo reads that file in its tests; a new implementation should too. See <a href="${href("libraries")}">Libraries</a>.</p>`)}
`;
  },
};
