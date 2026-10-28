export default {
  title: "Libraries",
  lead: "Three implementations, one set of test vectors: Go for servers, TypeScript for the web, Dart for Flutter apps. All at 100 % test coverage, all byte-identical.",
  body: ({ REPO, callout }) => `
<h2>Install</h2>
<table>
<tr><th>Language</th><th>Package</th><th>Install</th></tr>
<tr><td>Go</td><td><code>github.com/PawnTown/pawnshake/go</code></td><td><code>go get github.com/PawnTown/pawnshake/go@latest</code></td></tr>
<tr><td>TypeScript / JS</td><td><a href="https://www.npmjs.com/package/pawnshake">npm <code>pawnshake</code></a></td><td><code>npm install pawnshake</code></td></tr>
<tr><td>Dart / Flutter</td><td><a href="https://pub.dev/packages/pawnshake">pub <code>pawnshake</code></a></td><td><code>dart pub add pawnshake</code></td></tr>
</table>

<h2>What is in them</h2>
<div class="grid grid-3">
  <div class="card"><span class="kicker">Identity</span><p>Device certificates, issue and verify; ZIP-215 Ed25519.</p></div>
  <div class="card"><span class="kicker">Start</span><p>Rules profiles, CHALLENGE / ACCEPT / START, colours, the genesis hash.</p></div>
  <div class="card"><span class="kicker">Records</span><p>Wire format, body, header, record ids, signing, decoding, arg checks.</p></div>
  <div class="card"><span class="kicker">Chains</span><p>Prev and seen links, duplicates, fork detection, the canonical order.</p></div>
  <div class="card"><span class="kicker">Server</span><p>Heads, anchor receipts, the lag quota.</p></div>
  <div class="card"><span class="kicker">Moves</span><p>Move codes: sort, encode, decode.</p></div>
</div>
${callout("warn", "Not in the libraries yet", `<p>The peer clock function and the live checks (pings, DISPUTE) are specified but not implemented. Online play with a full arbiter works today.</p>`)}

<h2>TypeScript: sign and check a move</h2>
<pre><code><span class="k">import</span> { Chain, WHITE, BLACK, encodeMove, newGenesis, wire, decodeWire } <span class="k">from</span> <span class="s">"pawnshake"</span>;

<span class="c">// both sides build the chain from the same three genesis messages</span>
<span class="k">const</span> gen = newGenesis(challenge, accept, start, serverKeys, nowSeconds);
<span class="k">const</span> chain = <span class="k">new</span> Chain(gen.hash, [gen.white, gen.black, <span class="k">null</span>]);

<span class="c">// White plays e4: the move code is its index among the legal moves</span>
<span class="k">const</span> [code, legal] = encodeMove(legalUcis, <span class="s">"e2e4"</span>);   <span class="c">// 13, 20</span>
<span class="k">const</span> rec = chain.signNext(deviceSeed, chain.next(WHITE, atMs, code), () =&gt; [1, legal]);
send(wire(rec));                                         <span class="c">// ~70 bytes</span>

<span class="c">// Black's side: decode, verify and add (throws on a fork)</span>
<span class="k">const</span> { dup } = chain.add(decodeWire(WHITE, bytes), () =&gt; [1, legal]);</code></pre>

<h2>Go: verify on the server</h2>
<pre><code><span class="k">import</span> ps <span class="s">"github.com/PawnTown/pawnshake/go"</span>

gen, err := ps.NewGenesis(challenge, accept, start, serverKeys, now)
white, black := gen.Keys()
chain := ps.NewChain(gen.Hash, white, black, serverPub)

rec, err := ps.DecodeWire(ps.White, wireBytes)
sealed, dup, err := chain.Add(rec, moveInfo)   <span class="c">// a *ps.ForkError means: the signer loses</span>
<span class="k">for</span> _, r := <span class="k">range</span> chain.Order() {             <span class="c">// the canonical order</span>
    apply(r)
}</code></pre>

<h2>Dart: in a Flutter app</h2>
<pre><code><span class="k">import</span> <span class="s">'package:pawnshake/pawnshake.dart'</span>;

<span class="k">final</span> (code, legal) = encodeMove(legalUcis, <span class="s">'e2e4'</span>);
<span class="k">final</span> rec = chain.signNext(seed, chain.next(white, atMs, code), (_) =&gt; (ply, legal));
socket.add(wire(rec));</code></pre>

<h2>Conformance vectors</h2>
<p>Every library reads the same files in its test suite. A new implementation is conformant when it reproduces them byte for byte.</p>
<table>
<tr><th>File</th><th>Covers</th></tr>
<tr><td><code>vectors/core.json</code></td><td>varints, certificate, profile, genesis (hash, colours, keys), records (body, header, id, signature, wire, head), receipt, canonical order</td></tr>
<tr><td><code>vectors/movecode.json</code></td><td>sorted legal moves for 13 positions</td></tr>
<tr><td><code>vectors/zip215.json</code></td><td>the 196 ZIP-215 Ed25519 edge cases; all must verify</td></tr>
</table>
<pre><code><span class="c"># Go generates core.json and movecode.json</span>
cd go &amp;&amp; go test . -update &amp;&amp; go test ./movecode -update

<span class="c"># every suite checks them, with coverage gates at 100 %</span>
cd go &amp;&amp; go test -cover ./...
cd js &amp;&amp; npm run coverage
cd dart &amp;&amp; tool/coverage.sh</code></pre>

<h2>Used in</h2>
<p><a href="https://whitepawn.app">WhitePawn</a> signs its online games with Pawnshake: the play server (Go) checks every record and the web app (TypeScript) signs and acknowledges; the Flutter app (Dart) is next. Using it somewhere else? Open an issue on <a href="${REPO}">GitHub</a>.</p>
`,
};
