// The attack gallery: every trick from the spec's attack table, one card each,
// most with a small picture of the attempt.
export default {
  title: "Attack gallery",
  lead: "Every trick a cheater could try, why it fails, and what it costs. Red: the cheater loses. Amber: the game ends without a result. Grey: the record is void. Green: the trick gains nothing.",
  body: ({ attack, sequence, chains, callout, href }) => {
    const W = { id: "w", label: "Cheater", tone: "white" };
    const B = { id: "b", label: "Opponent", tone: "black" };
    const S = { id: "s", label: "Server", tone: "server" };
    const seq3 = (lanes, rows, title) => sequence(lanes, rows, { title, width: 640 });

    const groups = [
      {
        title: "Lying about moves",
        items: [
          attack({
            id: "two-faced",
            name: "Two-faced move",
            tone: "lose",
            tries: "Send Qh5 to the opponent and Nf3 to the server, then show whichever helps.",
            caught: "Both are signed records with the same seq. The opponent holds one, the server the other: two different headers for one number.",
            outcome: "Fork. The cheater loses the game.",
            fig: seq3([W, S, B], [
              { arrows: [{ from: "w", to: "b", label: "seq 3: Qh5", tone: "bad" }] },
              { arrows: [{ from: "w", to: "s", label: "seq 3: Nf3", tone: "bad" }] },
              { note: { span: ["s", "b"], text: "two headers, one seq → fork", w: 230, tone: "bad" } },
            ], "One number, two stories."),
          }),
          attack({
            id: "double-send",
            name: "Changing your mind",
            tone: "lose",
            tries: "Send a move, then quickly send a different move with the same number, hoping the second replaces the first.",
            caught: "The opponent now holds two signed headers for one seq. Clients never re-sign: a resend is the stored bytes.",
            outcome: "Fork. The cheater loses.",
          }),
          attack({
            id: "edited-report",
            name: "Edited report",
            tone: "lose",
            tries: "After the game, upload a chain with a better move at some point.",
            caught: "The edited record has the seq of a record the opponent (or the anchors) already holds, with a different header. When the reports or anchors meet, the pair is a fork.",
            outcome: "Fork, as soon as the two versions meet.",
          }),
          attack({
            id: "partial-report",
            name: "Half a report",
            tone: "none",
            tries: "Upload only the part of the game before you started losing, or do not upload at all.",
            caught: "The server takes the union of every report and every anchor. The opponent received all your records (that is how the game went on) and uploads them.",
            outcome: "No gain. The full game is saved.",
            fig: seq3([W, S, B], [
              { arrows: [{ from: "w", to: "s", label: "moves 1-20 only", tone: "bad" }] },
              { arrows: [{ from: "b", to: "s", label: "moves 1-41", tone: "ok" }] },
              { note: { at: "s", text: "union: 1-41", tone: "ok" } },
            ], "Reports can only add."),
          }),
          attack({
            id: "forgery",
            name: "Forging the opponent's record",
            tone: "void",
            tries: "Make up a resignation from the opponent, or alter one of its moves.",
            caught: "Every record is signed with the opponent's device key, certified by the server. Without that key the signature fails.",
            outcome: "The forged record is void.",
          }),
          attack({
            id: "replay",
            name: "Replaying a record",
            tone: "void",
            tries: "Take the opponent's resignation from last week's game, or from earlier in this one, and send it again.",
            caught: "The signed header names the genesis hash (unique per game thanks to both nonces) and the seq, and the body names prev and seen. A record only fits its own spot.",
            outcome: "Void: it fails or is a duplicate.",
          }),
          attack({
            id: "fake-seen",
            name: "Claiming to have seen something",
            tone: "void",
            tries: "Accept a draw offer the opponent never made, or claim to have seen a move that was never sent.",
            caught: "seen_hash must equal the id of the opponent's real record. A verifier rebuilds the body with its own copy, so the signature fails. And DRAW_ACCEPT is only valid if a real offer is in the signer's seen.",
            outcome: "Void.",
          }),
          attack({
            id: "race",
            name: "Resign race",
            tone: "none",
            tries: "Resign at the instant the opponent mates you, hoping your resignation 'counts first', or the other way round.",
            caught: "The canonical order breaks ties the same way on every device: moves before other records, White before Black, two crossing resignations make a draw.",
            outcome: "Deterministic. Both phones show the same result.",
            fig: seq3([B, W], [
              { arrows: [{ from: "w", to: "b", label: "RESIGN", tone: "bad", dx: 40 }, { from: "b", to: "w", label: "MOVE mate", tone: "ok", dx: -40 }] },
              { note: { span: ["b", "w"], text: "canonical order: the move first", w: 260, tone: "ok" } },
            ], "Concurrent records, one answer."),
          }),
          attack({
            id: "engine-split",
            name: "Engines that disagree",
            tone: "void",
            tries: "Not an attack, a bug: two engines that list different legal moves would read the same byte as different moves.",
            caught: "Every move's signed body includes ply and the number of legal moves. A mismatch fails the signature at once.",
            outcome: "No silent divergence. The record is refused on arrival.",
          }),
        ],
      },
      {
        title: "Lying about time",
        items: [
          attack({
            id: "pre-anchor",
            name: "Pre-anchoring every candidate",
            tone: "lose",
            tries: "When your turn starts, anchor all 20 possible next moves. Think a minute, play one, and point to its 'early' anchor as proof you moved instantly.",
            caught: "Anchors carry signed heads, and a head names its seq. Twenty candidates for one seq are twenty signed headers for one number.",
            outcome: "Fork. The cheater loses.",
            fig: chains({
              title: "Candidates anchored for seq 5: only one can exist.",
              white: [
                { label: "…", sub: "" },
                { label: "Nf3?", sub: "seq 5 · anchored", tone: "bad" },
              ],
              black: [{ label: "…", sub: "" }],
              fork: { side: "w", idx: 1, label: "Bc4?", sub: "seq 5 · anchored" },
              genesis: false,
            }),
          }),
          attack({
            id: "fake-head",
            name: "Anchoring a head off the chain",
            tone: "lose",
            tries: "Anchor a head now, but later reveal a chain where that seq holds a different record.",
            caught: "Every anchored head must lie on the revealed chain. One that does not is a second signed header for its seq.",
            outcome: "Fork. The cheater loses.",
          }),
          attack({
            id: "early-date",
            name: "Dating a move early (peer clocks)",
            tone: "dispute",
            tries: "Sign a move with an at that is earlier than when you really sent it, to save clock time.",
            caught: "Small lies hide inside the transit allowance J. Bigger ones fail the early-send check: you kept pinging after the time you claim to have sent the move.",
            outcome: "At most J per move (tens of ms). More: DISPUTE, no result.",
          }),
          attack({
            id: "late-ack",
            name: "Acknowledging late (peer clocks)",
            tone: "dispute",
            tries: "Receive the opponent's move, think, and only then sign the ACK with a late time, so your thinking looks like transit.",
            caught: "The link is ordered: your pong to a ping sent after the move proves you already had the move.",
            outcome: "At most J per move. More: DISPUTE.",
            fig: seq3([B, W], [
              { arrows: [{ from: "b", to: "w", label: "MOVE", tone: "plain" }] },
              { arrows: [{ from: "b", to: "w", label: "PING", tone: "muted", dashed: true }] },
              { arrows: [{ from: "w", to: "b", label: "PONG", tone: "muted", dashed: true }] },
              { arrows: [{ from: "w", to: "b", label: "ACK 'just arrived'", tone: "bad" }] },
              { note: { at: "b", text: "pong came first → DISPUTE", tone: "bad" } },
            ], "The pong gives the lie away."),
          }),
          attack({
            id: "slow-clock",
            name: "A slow clock (peer clocks)",
            tone: "dispute",
            tries: "Run your device clock slightly slow, so every think time shrinks.",
            caught: "Pings measure the opponent's clock rate against your own.",
            outcome: "At most 0.1 % of thinking time. More: DISPUTE.",
          }),
          attack({
            id: "fake-outage",
            name: "Faking an outage (peer clocks)",
            tone: "cancel",
            tries: "Stop sending for a while to think 'off the clock', then claim the link dropped.",
            caught: "Excess transit comes out of one small pause budget per game (2 to 20 seconds). Beyond it the game is canceled.",
            outcome: "The budget once. Then canceled, never a win.",
          }),
          attack({
            id: "future-flag",
            name: "Flag claim from the future",
            tone: "dispute",
            tries: "Claim the opponent flagged, stamping the claim with a time later than now.",
            caught: "The future check: no record may claim an at later than its arrival allows.",
            outcome: "DISPUTE.",
          }),
          attack({
            id: "refuse-ack",
            name: "Refusing to acknowledge mate",
            tone: "cancel",
            tries: "Never ACK the mating move, hoping the game stays open or the mater looks late.",
            caught: "A missing ACK is an outage. The outage rules apply: paused up to the budget, then canceled.",
            outcome: "Canceled at worst. Never a win for the one refusing.",
          }),
          attack({
            id: "underreport",
            name: "Under-reporting think time (online)",
            tone: "none",
            tries: "Claim a tiny think time on every move, so the server refunds lots of 'lag'.",
            caught: "Refunds come from the lag quota: a few hundred ms per move, capped at 7 moves' worth.",
            outcome: "Bounded by the quota, exactly as on a normal server.",
          }),
          attack({
            id: "hold-back",
            name: "Anchoring but holding back (online)",
            tone: "none",
            tries: "Anchor your move with the server (so your clock stops) but delay sending it to the opponent (so theirs does not start).",
            caught: "The server pushes every anchored record to the opponent's live session at once.",
            outcome: "No gain: the anchor is the delivery.",
            fig: seq3([W, S, B], [
              { arrows: [{ from: "w", to: "s", label: "anchor + record", tone: "plain" }] },
              { arrows: [{ from: "w", to: "b", label: "withheld", tone: "bad", cut: true }] },
              { arrows: [{ from: "s", to: "b", label: "pushed anyway", tone: "ok" }] },
            ], "The server delivers what you anchor."),
          }),
          attack({
            id: "late-anchor-opp",
            name: "Anchoring the opponent's move late (online)",
            tone: "none",
            tries: "Anchor the opponent's move only after a delay, so it looks like they took longer.",
            caught: "The opponent anchored its own move when sending it. The earliest receipt counts.",
            outcome: "No effect on the opponent's clock.",
          }),
        ],
      },
      {
        title: "Leaving and presence",
        items: [
          attack({
            id: "walk-away-online",
            name: "Walking away when losing (hybrid, online)",
            tone: "lose",
            tries: "Close the app in a lost position so the game never ends.",
            caught: "The arbiter sees it: the game waits on you, your own checkpoints stop, the opponent keeps checking in.",
            outcome: "VERDICT_ABANDON. The leaver loses (a draw if the opponent cannot mate).",
          }),
          attack({
            id: "fake-presence",
            name: "Faking the opponent's absence or your presence",
            tone: "none",
            tries: "In a hybrid game, leave the opponent's records out of your anchors to make it look away, or submit its heads to make yourself look present.",
            caught: "Presence counts only a player's own checkpoints, sent over its own authenticated session.",
            outcome: "No effect.",
          }),
          attack({
            id: "walk-away-offline",
            name: "Walking away when losing (offline)",
            tone: "limit",
            tries: "In a game with no arbiter, switch the phone off when losing.",
            caught: "Nothing can tell a walk-away from a dead radio without a referee. So the game is canceled, never lost and never won.",
            outcome: "Canceled, still saved. Counted per account with the engine evaluation, for review.",
          }),
          attack({
            id: "false-dispute",
            name: "False dispute",
            tone: "limit",
            tries: "Sign DISPUTE in a lost position to end the game without a result.",
            caught: "A DISPUTE always ends the game unrated, so it can never win. Each one is recorded with the position's evaluation.",
            outcome: "No result. Counted per account, for review.",
          }),
        ],
      },
      {
        title: "The start, the server and the device",
        items: [
          attack({
            id: "colors",
            name: "Choosing your colour",
            tone: "none",
            tries: "Pick a nonce that makes you White.",
            caught: "Commit-reveal: A commits to its nonce before seeing B's; B picks without knowing A's. Neither can steer the hash.",
            outcome: "A coin flip. A may refuse to START, which only cancels a game that never began.",
          }),
          attack({
            id: "receipts",
            name: "A server dropping or reordering receipts",
            tone: "none",
            tries: "The server (or someone in front of it) quietly drops an awkward receipt.",
            caught: "Receipts of a game are chained through prev_receipt and both players keep theirs.",
            outcome: "A gap is visible to both players.",
          }),
          attack({
            id: "stolen",
            name: "Stolen device",
            tone: "none",
            tries: "Play rated games with someone else's phone.",
            caught: "Its certificate is revoked when the owner signs out everywhere; revocation is checked at anchoring and reporting.",
            outcome: "Games signed by a revoked key are not rated.",
          }),
          attack({
            id: "collusion",
            name: "Rating farming between own accounts",
            tone: "limit",
            tries: "Play yourself offline with two accounts and always let one win.",
            caught: "Signatures prove who signed, not that two people are different. This is the same problem as online collusion.",
            outcome: "Out of the protocol's reach: handled by profile and server policy.",
          }),
        ],
      },
    ];

    const chip = (html) => {
      const id = html.match(/id="([^"]+)"/)[1];
      const name = html.match(/<h3>([^<]+)<\/h3>/)[1];
      const tone = html.match(/class="attack a-([a-z]+)"/)[1];
      return `<a class="ai-${tone}" href="#${id}">${name}</a>`;
    };
    const index = groups
      .map((g) => `<div class="attack-index-group"><p>${g.title}</p><div class="attack-index">${g.items.map(chip).join("")}</div></div>`)
      .join("");

    return `
${callout("rule", "Read this first", `<p>Almost every attack on this page is one of two things: an attempt to tell two parties two different stories, which needs two signed records for one number (a <a href="${href("security")}#the-one-punishable-act" style="color:#ff8cc6">fork</a>), or a lie about time, which the clocks bound to a few milliseconds or turn into a game without a result.</p>`)}
<nav class="attack-map" aria-label="All attacks">${index}</nav>
${groups.map((g) => `<h2>${g.title}</h2>${g.items.join("")}`).join("")}

<h2>The honest limit</h2>
<p>Pawnshake does not pretend an offline game can force a result. Without a referee, a losing player can always end it without one: walk away, fake a long outage, or sign a false dispute. The protocol makes sure that is the <em>only</em> thing it achieves (no win, no rating gain, the game still saved) and records it per account. Games that must have a winner should run with an arbiter (<a href="${href("modes")}#hybrid">hybrid</a> or <a href="${href("modes")}#online">online</a>).</p>
`;
  },
};
