# The Pawnshake protocol (draft)

Status: draft, 2026-10-27. Nothing here is implemented yet, except the move
code (`go/movecode`, test vectors in `vectors/`). Scope: games with a
clock (bullet, blitz, rapid, classical). Daily games are out of scope.

## Goal

A game is a set of records both players sign and send straight to each other:
every move and every command (resign, draw, takeback, abort, flag). No server
is needed to play. A game can run completely offline (BLE, LAN) and either
player reports it later by uploading the chain; the server verifies it from
the signatures alone and saves the result.

Optionally, a player can **anchor** the head of the chain with the game server
at any time: the server signs a receipt saying "these records existed at
server time T, and the game was in this state". Anchors never sit between the
players, a move goes to the opponent first and is anchored beside it.

The protocol is generic: every threshold and every outcome that is a matter
of taste (allowances, budgets, how long a player may be gone, what leaving
costs) is a parameter of the game's **rules profile**, signed into the
genesis. Anyone can run it with their own profile; WhitePawn's is
`whitepawn/1` (see "Rules profile" and `spec/profiles/`).

The genesis also fixes how much of a referee, the **arbiter** (the game
server), takes part:

| Game | `arbiter` | Clocks | Someone leaves (WhitePawn) |
|---|---|---|---|
| offline | `none` | `peer`: both devices' signed timestamps, cross-checked live | the game is `canceled`, and still saved when uploaded |
| hybrid | `checkpoints` | `peer`, plus server checkpoints that show who is still there | the player who goes away loses |
| online | `full` | `anchored`: server time of the anchors | the player who goes away loses |

`full` replaces a separate referee mode: a server that receives every record
and timestamps it is exactly a referee, and doing it with anchors keeps the
server off the path between the players.

## What a chain can prove

Signatures prove what a player said, never when. Anchors add "no later than".

| | `peer` clocks (offline, hybrid) | `anchored` clocks (online) |
|---|---|---|
| every move, and that it was legal | yes | yes |
| mate, stalemate, insufficient material, threefold, fifty moves | yes | yes |
| resignation, draw agreement, abort, takeback | yes | yes |
| a result both players signed (`END`) | yes | yes |
| a player forking the chain (two records with one number) | yes | yes |
| a record existed at time T | only if anchored | yes |
| a flag | yes, from both devices' timestamps | yes |
| a player going silent on its own turn | yes: its clock runs out, a flag | yes |
| how long a player really thought | within the allowance J per move (tens of ms on local links); more is caught live | bounded by the lag quota, as today |
| a link outage | paused time up to a budget, then the game is `canceled` (unless both RESUME) | the disconnected player's clock runs |
| who went away | offline: nobody can tell, the game is `canceled`. hybrid: the checkpoints show it | the server sees it |

In `peer` mode nothing can be proven to an outsider about time: both devices
agree on the clocks because they compute them from the same signed
timestamps, and each device checks the other's timestamps against its own
clock while the game runs. A lie bigger than the allowance is caught live and
ends the game `disputed` (unrated). See "Clocks". `anchored` mode is the
trusted clock; `checkpoints` add a trusted witness of who is still there.

## Signatures

One scheme signs everything (records, genesis messages, certificates,
receipts, verdicts): **Ed25519** (RFC 8032), 64 bytes, 128-bit security,
deterministic nonces.

- Every signed message starts with its own magic (`PSREC001`, `PSCHAL01`,
  `PSCERT01`, `PSANCH01` ...), so a signature for one kind of message never
  verifies as another.
- **Verification rules are pinned to ZIP-215.** Ed25519 libraries disagree on
  edge cases (non-canonical points, small-order components), so one device
  could accept a signature another rejects; here that would split the game,
  for example a fork one side can prove and the other cannot. ZIP-215 defines
  exactly which signatures are valid, and every verifier uses it:
  `github.com/hdevalence/ed25519consensus` (Go), `@noble/curves` with
  `zip215: true` (web), `ed25519-zebra` (Rust, for Flutter through the
  native bindings). WebCrypto may sign (non-extractable key) but
  never verifies. The ZIP-215 test vectors are part of the conformance suite.
- Signing is deterministic, but a dishonest signer can still make a second
  valid signature for the same payload: records are identified by their
  payload hash, never by signature bytes (see "The one rule").
- Keys live in Keychain / Keystore / IndexedDB as software keys. The phones'
  secure hardware only signs P-256 ECDSA; it would not stop a modified client
  anyway, since that client holds its own key.
- Considered and dropped: short Schnorr on ristretto255 (48 bytes, same
  security) saves 16 bytes per record but needs custom signing code on every
  platform.

## Identity: device certificates

A player's records are signed with a **device key** created on the device and
never exported. While online, the server certifies it:

```
cert = "PSCERT01" | key_id u8 | user_id (u8 length + UTF-8) | device_pk [32]
       | issued u32 | expires u32 (unix seconds) | server_sig [64]
```

The server's public keys are pinned in the apps by `key_id` (rotation: ship the
next key before using it) and published at `GET /pawnshake/v1/keys`. The same keys
sign certificates, anchor receipts and verdicts.

- Validity: 30 days, renewed silently whenever the app is online. A device that
  was offline longer can still play unrated games; it cannot start rated ones.
- Revocation (lost device, sign out of all sessions) is checked when a game is
  reported or anchored: a game signed by a revoked key is not rated.
- One key per device and account. The key is not per game: offline, nobody
  could certify a fresh one.

## Genesis: starting a game

Three signed messages, sent peer to peer, give both players the same genesis:

```
CHALLENGE  (A)  "PSCHAL01" | cert_A | initial_ms u32 | increment_ms u32
                | rated u8 | arbiter u8 (0 none, 1 checkpoints, 2 full)
                | color u8 (0 random, 1 white, 2 black)
                | profile                               see "Rules profile"
                | commit [32] = SHA-256(nonce_A) | sig_A
ACCEPT     (B)  "PSACPT01" | SHA-256(CHALLENGE) | cert_B | nonce_B [16] | sig_B
START      (A)  "PSSTRT01" | SHA-256(ACCEPT) | nonce_A [16] | sig_A

genesis      = CHALLENGE | ACCEPT | START
genesis_hash = SHA-256(genesis)
game_id      = first 16 bytes of genesis_hash (base32 in URLs)
```

Random colors: white is A when `SHA-256(nonce_A | nonce_B)[0]` is even. A
committed to `nonce_A` before seeing `nonce_B`, and B picked `nonce_B` without
knowing `nonce_A`, so neither side can choose the colors. A can refuse to send
`START` after seeing the colors; that only cancels a game that never began.

The nonces make every genesis unique, so no record can be replayed into
another game. A game with an arbiter anchors its genesis before the first
move. ACCEPT signs the hash of CHALLENGE, so both players have signed the same
profile.

## Rules profile

Everything below that is policy, not protocol, comes from the profile in
CHALLENGE. Verifiers (the opponent's device, the server, any later checker)
use the values written there, never their own defaults, so two games with
different profiles are each judged by their own rules.

```
profile = name (u8 length + UTF-8, e.g. "whitepawn/1")
          | varint count | count x (varint key, varint value)
```

Values are concrete numbers for this game (the challenger picks them for its
time control). A key a device does not know makes it decline the challenge.

| key | Parameter | Meaning | `whitepawn/1` |
|---|---|---|---|
| 1 | `j_min_ms` | smallest transit allowance | 30 |
| 2 | `j_rtt_mult` | allowance as a multiple of the round trip | 2 |
| 3 | `sample_window` | transit samples per direction for the link estimate | 16 |
| 4 | `pause_budget_ms` | outage time forgiven per game, shared | bullet 2000, blitz 5000, rapid 10000, classical 20000 |
| 5 | `ping_interval_ms` | live-check pings | 250 |
| 6 | `rate_tolerance_ppm` | allowed clock rate difference | 1000 |
| 7 | `checkpoint_interval_ms` | presence checkpoints while online (`checkpoints`) | 10000 |
| 8 | `away_after_ms` | how long the game may wait on an absent player | bullet 15000, blitz 30000, rapid 60000, classical 120000 |
| 9 | `leave_with_arbiter` | outcome for a player who goes away or signs CANCEL (leave) when there is an arbiter: 0 cancel, 1 loss, 2 draw | 1 loss |
| 10 | `leave_offline` | the same without an arbiter | 0 cancel |
| 11 | `free_first_moves` | the first move of each side costs no clock | 1 |
| 12 | `takebacks` | takeback offers allowed | 1 casual, 0 rated |
| 13 | `report_wait_days` | how long a `pending` game waits for the second report | 7 |

A loss for leaving is a draw when the remaining player cannot mate, as for a
flag.

## Records

Each player keeps a numbered chain of records (`seq` 1, 2, 3 ...). Every record
names the previous record of its own signer and the newest record of the
opponent the signer had applied (`seen`). Together they form a graph in which
"A had seen B's record when A signed" is part of the signature.

### Op byte

One byte says what a record is. A move is just its move code:

| op | Record | Args (on the wire) |
|---|---|---|
| 0..217 | MOVE, `op` = move code | |
| 218 | RESIGN | |
| 219 | DRAW_OFFER | |
| 220 | DRAW_ACCEPT | |
| 221 | DRAW_DECLINE | |
| 222 | TAKEBACK_OFFER | |
| 223 | TAKEBACK_ACCEPT | |
| 224 | TAKEBACK_DECLINE | |
| 225 | ABORT | |
| 226 | FLAGGED (my own clock ran out) | |
| 227 | FLAG_CLAIM (your clock ran out, as of my `at`) | |
| 228 | reserved (was ABANDON_CLAIM: a silent player to move simply flags) | |
| 229 | END (I sign this result) | u8 result, u8 termination |
| 230 | ACK (I applied your record `seen` at my time `at`) | |
| 231 | DISPUTE (a live time check failed) | u8 reason, varint subject seq |
| 232 | RESUME (continue after an outage beyond the budget) | |
| 233 | CANCEL (I leave, or my opponent is gone) | u8 reason: 1 leave, 2 opponent gone |
| 234..239 | reserved, invalid | |
| 240 | VERDICT_FLAG (server only) | u8 color |
| 241 | VERDICT_ABANDON (server only) | u8 color |
| 242 | VERDICT_RESULT (server only) | u8 result, u8 termination, varint white_ms, varint black_ms |
| 243..255 | reserved, invalid | |

Move codes: index of the move in the sorted list of legal moves (see
"Move code" below). Every record carries `at`, the signer's own clock when it
signed (see "Clocks"), so no record needs a duration. Chat, rematch and
presence are not records.

### Wire format

```
varint  seq        the signer's record number, from 1
varint  seen       the opponent's highest seq the signer had applied, 0 = none
varint  at         the signer's clock in ms since it handled START
u8      op
...     args
[64]    Ed25519 signature over the signed payload (see Signatures)
```

Varints are unsigned LEB128 and must be minimal (a longer encoding of the same
number is rejected, so a record has exactly one byte form). The signer is not
sent: it is the peer on a direct link, and the container says it everywhere
else (anchor, report).

A move is 70 bytes in the common case (seq and seen below 128, a game under
35 minutes so `at` fits 3 bytes), 64 of them signature. An ACK or a resign is
70 bytes as well.

### Signed payload

Rebuilt by every verifier from its own state, never sent between players:

```
"PSREC001"  [8]
genesis_hash [32]
signer      u8      0 white, 1 black, 2 server
seq         u32 BE
prev        [32]    SHA-256 of the signer's payload seq-1, genesis_hash for seq 1
seen        u32 BE
seen_hash   [32]    SHA-256 of the opponent's payload #seen, zeros for 0
at          u32 BE  the signer's clock, ms since it handled START
op          u8
args               exactly the wire bytes
MOVE only:  ply u16 BE, legal u8   (the ply the move creates, number of legal moves)
```

Every record therefore commits to its signer's whole history and to everything
of the opponent's it had seen. A server record has two `seen` fields (white,
black) in place of one. The record hash used everywhere (`prev`, `seen_hash`,
anchors) is SHA-256 of the payload.

`legal` is there because a move code only means something on a known position:
if two engines disagree about the legal moves, the signature fails instead of
the two boards silently playing different moves.

Signatures follow "Signatures" above (non-canonical encodings rejected). A verifier
that lacks `seq - 1` of the signer, or record `seen` of the opponent, holds the
record until it has them and asks the sender to resend from its last known
`seq`.

### Move code

A move's code is its index in the sorted list of the legal moves of the
position it is played in. In the starting position `b1a3` is 0, `e2e4` is 13,
`h2h4` is 19. The order is defined on the UCI string, never on an engine's
generation order:

```
key    = from * 320 + to * 5 + promo        ascending
square = rank * 8 + file                    a1 = 0, h1 = 7, a8 = 56, h8 = 63
promo  = none 0, n 1, b 2, r 3, q 4
```

Castling is the king's two-square move (`e1g1`), en passant the pawn's move.
No position has more than 218 legal moves, so a code is 0..217. Reference and
conformance vectors: `go/movecode` and `vectors/movecode.json`; every port
must pass the same vectors.

## The one rule a client must never break

A client signs at most one record per `(genesis_hash, seq)`.

- `ChainStore.sign()` is the only code that can sign. It refuses when that
  `seq` exists and returns the stored record instead.
- Signed bytes are written durably BEFORE they are sent or anchored.
- A resend sends the stored bytes, never a re-signed record.

Two records with one `seq` whose signed **payloads** differ, both validly
signed, are a **fork**: the signer loses the game (`TERMINATION_FORK`), whenever both records come together
(on the opponent's device, in anchors, or in a report). That is the only thing
a player is ever punished for. An honest client following the rule above can
never produce it. Everything else that is wrong (bad signature, illegal or
out-of-range code, an op not allowed at its point) makes that record void,
without penalty, and the chain goes on after it.

Records are identified by the hash of their signed payload, never by their wire
bytes. A signer can produce more than one valid signature for the same payload
(a different nonce), so two copies with equal payloads and different signature
bytes are the same record: a duplicate, not a fork.

## Applying records: one deterministic order

Both clients, the server and the report checker run the same function over the
same set of records and get the same game. Records are applied one at a time
in the **canonical order**:

1. A record comes after its own `prev` and after the opponent record it `seen`.
2. When a white and a black record are both ready (concurrent: neither had
   seen the other), the one of the earlier class goes first: MOVE, then
   END, then everything else (ACKs included). Same class: white first, except two concurrent
   RESIGNs, which make a draw.
3. A server verdict comes right after the player records it `seen`, and
   before anything it had not seen.

Two moves are never concurrent: a move is only valid on the signer's turn, and
the turn only passes by the opponent's move, which the signer must have seen.

At its point in the order each record is checked against the game state there:

| Record | Valid when | Effect |
|---|---|---|
| MOVE | signer's turn, game running, code legal, clock not run out (else it counts as FLAGGED) | plays the move, cancels standing takeback offers, cancels the opponent's draw offer |
| RESIGN | game running | signer loses |
| DRAW_OFFER | game running, no offer standing | offer stands until the opponent moves, accepts or declines |
| DRAW_ACCEPT | opponent's offer stands and is in the signer's `seen` | draw |
| TAKEBACK_OFFER | game running, signer has moved, unrated | stands until anyone moves, accepts or declines |
| TAKEBACK_ACCEPT | offer stands and is in the signer's `seen` | back to the position before the offerer's last move |
| *_DECLINE | matching offer stands | offer removed |
| ABORT | game running, fewer than 2 moves made | aborted, never rated |
| FLAGGED | game running | signer loses on time (draw if the opponent cannot mate) |
| FLAG_CLAIM | game running, opponent to move | `peer`: the opponent flagged if its clock, converted to the claim's `at`, is out (see Clocks); else void. `anchored`: ignored, the server decides |
| ACK | always | a clock sample, see Clocks; no effect on the board |
| DISPUTE | signer has not signed END | the game ends `disputed`, no result, unrated |
| RESUME | game `canceled` by an outage | when both players sent it, the outage counts as paused time and the game goes on |
| END | after the game ended, result and termination equal the computed ones | sign-off; when both players sent it the game is closed |
| CANCEL | game running | reason 1 (I leave): `leave_with_arbiter` or `leave_offline` applies to the signer. Reason 2 (opponent gone): the game is `canceled` |
| VERDICT_* | signed by the server, game has an arbiter | flag, abandonment (`leave_with_arbiter` for the absent player), final result |

A record that is not valid at its point is void and changes nothing. Because
the order puts moves first in a concurrent pair, a move a player made without
knowing of a resignation, a draw acceptance or a takeback acceptance stands
over it: the client that signed the move used exactly the position the
canonical order gives it.

Clients apply records optimistically as they arrive and re-run the order when
a concurrent record shows up later; the board then corrects itself the same
way on both sides.

## Anchors

An anchor is a server-signed receipt over the heads of a game: "the server had
these records at server time T, and the game was in this state". Either player
may anchor at any time, as often as it likes, online during the game or
whenever it gets a connection. It is never on the path between the players.

### Request

Over the live session with the server, or `POST /pawnshake/v1/anchors`, same body:

```
Anchor {
  genesis      bytes     required the first time the server sees the game
  records      bytes[]   signed payloads + signatures, ascending per signer;
                         at least the head of one player, usually both heads
  state_hash   bytes     optional, SHA-256 of the canonical state at these heads
}
```

Records travel as **full signed payloads**, not as hashes, for one reason: a
bare hash can be computed before it is signed. A player could anchor the
hashes of all 20..218 possible next moves the moment its turn starts, think
for a minute, then play one whose hash was anchored early and claim it was
made in no time. With signed payloads, anchoring two candidates for one `seq`
is a fork and loses the game.

The server checks, per request:

1. Genesis valid, certificates valid and not revoked.
2. Every record: payload belongs to this genesis, signature valid for its
   signer, its `prev` matches the server's copy of `seq - 1` when it has one.
3. A second payload for a `(signer, seq)` it already holds: fork, kept as
   evidence, the signer loses.
4. When it holds the full chain up to the heads, it runs the canonical order
   and checks `state_hash`. A mismatch is answered with the server's own state
   (the submitting client's engine diverged); the receipt is still issued,
   with `state_verified = 0`.

### Receipt

```
"PSANCH01" | key_id u8 | genesis_hash [32]
| white_seq u32 | white_hash [32]          highest white record the server holds
| black_seq u32 | black_hash [32]          highest black record the server holds
| state_hash [32] | state_verified u8      zeros / 0 when none was sent
| server_ms u64 | anchor_no u32            per game, from 1
| prev_receipt [32]                         SHA-256 of the previous receipt of this game
| server_sig [64]
```

254 bytes. The receipt covers the server's highest heads for both players, not
only what this request sent, so one receipt also tells the anchoring player
what the opponent has anchored. Receipts of a game form their own chain
(`prev_receipt`), so the server cannot drop or reorder one unnoticed. Both
players keep their receipts; the server keeps all of them.

### Existence time

The **existence time** `E(r)` of a record is the `server_ms` of the first
receipt whose head for `r`'s signer has `seq >= r.seq` (the head commits to
`r` through `prev`). It is an upper bound: `r` existed no later than `E(r)`.
Anchoring can only ever make a player's own records look *earlier* than when a
later anchor would place them, never earlier than they really existed.

### Delivery

When a player has a live session, the server pushes every record it receives
for that game from the opponent, and its receipts, to it. So a record anchored
at `T` reached the opponent no later than `T` plus that session's latency,
even when the direct link held it back. Withholding a move from the opponent
while anchoring it gains nothing.

### What anchors are for

- offline games (`none`): a timestamped proof of the game and its state at some point
  (when it was played, how far it got, a server-side backup of a game whose
  devices are lost). Optional, no clock meaning.
- hybrid games (`checkpoints`): presence, who went away (see Clocks).
- online games (`full`, `anchored` clocks): the clock (below).
- Disputes in any game: an anchor showing a player to move at `T`, with no
  later record of that player existing before `T`, is evidence the report
  checker uses.

## Clocks

### Time on the records

Every record carries `at`: the signer's monotonic clock in ms, counted from
the moment it handled `START`. Every received record except an ACK is answered
at once with an **ACK**, a record whose `seen` names the record it applied and
whose `at` is the moment it applied it. ACKs are never acknowledged, never
anchored, and do nothing on the board.

That gives every turn a start and an end on the mover's own clock:

```
think(move) = at(move) - at(mover's ACK of the opponent's previous move)
```

The mover's clock stops when it signs, the opponent's starts when it
acknowledges. The time in between is **transit**, charged to nobody up to an
allowance. Both modes use `think`: `peer` charges it directly, `anchored`
feeds it to the lag quota.

### `peer`: the clock function

Both devices, and the server when the game is reported, compute the clocks
with the same function over the chain, walking the canonical order. Nothing
is negotiated, so the two devices always show the same clocks.

**Samples.** Each ACK `k` of a record `r` gives one transit sample in the
direction `r.who -> k.who`, on two different clocks:

```
u(r) = at(k) - at(r)          = true transit + clock offset
```

**Link estimate.** Over the last `sample_window` samples of each direction (in canonical
order, up to the current one):

```
m_wb, m_bw = smallest u in each direction
rtt        = m_wb + m_bw                    round trip, offsets cancel
theta      = (m_wb - m_bw) / 2              black clock minus white clock
J          = max(j_rtt_mult * rtt, j_min_ms)  allowance per message
```

The window follows clock drift (crystals drift up to about 100 ppm). Until
both directions have a sample, `J` is `j_min_ms` and `theta` is unknown.

**Excess.** A message that took longer than the fastest one in its direction
plus `J` has excess:

```
excess(r) = max(0, u(r) - m_dir - J)
```

Honest links stay inside `J`. Excess means an outage, or a lie by the sender
(an `at` earlier than the real send) or by the receiver (an ACK later than the
real receipt); the chain cannot tell which, the live checks below can.

**Pause budget.** Excess is paused time, taken from one budget per game
shared by both players (`pause_budget_ms`). When a message's excess is more
than what is left, the game is `canceled`: it stops with no result, unless
both players then sign
**RESUME**, which turns the whole outage into paused time and goes on. Nobody
is ever charged for transit: an outage cannot be blamed on either side
without a referee, and charging one side would let the other fake outages to
burn its clock.

**Clocks.** From ply 3 on (the first move of each side is free, as today):

```
remaining(X) = initial + increment * moves(X) - sum(think of X's moves)
```

A move whose `think` takes its signer's clock below zero counts as FLAGGED. A
`FLAG_CLAIM` by Y is valid when, converted to X's clock with `theta`, its `at`
lies more than `remaining(X) + J` after X's turn started (X's ACK of Y's last
move), with X still to move. A claim stamped in the future is caught live (see
below). An honest client signs FLAGGED itself when its own clock runs out, and
FLAG_CLAIM when the opponent's has, by its own view.

A game-ending move (mate, stalemate, a draw by rule) ends the game at the
move, unless its ACK then shows excess beyond the budget: the game is then
`canceled` (or resumed), so an early-dated mate delivered late wins nothing.

**Someone hops off (offline).** When the opponent is gone (no records, no
pings) for `away_after_ms` while the game waits on it, a device signs CANCEL
with reason 2 and the game is `canceled`. A player who leaves on purpose signs
CANCEL with reason 1, and `leave_offline` applies (WhitePawn: canceled too).
Without an arbiter nobody can tell who left, so leaving never wins or loses
an offline game. A canceled game is still a game: either player uploads it
and it is saved, unrated (see Reporting).

### `peer`: live checks

Each device knows its own clock is true, so it checks the opponent's claims
against what it saw itself, while the game runs. Both devices exchange pings
every `ping_interval_ms` on the same ordered link as the records (unsigned,
never stored):

```
PING  id u16, t u32                    sender's clock
PONG  id u16, t_echo u32, t_rx u32, t_tx u32
```

Pings give each device its own round trip and the opponent's clock offset and
rate (NTP style, smallest round trips win), independently of the chain.
`delta` is that measurement's uncertainty, half the smallest ping round trip
plus 5 ms.

| Check | Fails when | Catches |
|---|---|---|
| late ACK | the opponent's ACK of my record claims a receipt later than the arrival of its PONG echoing a ping I sent after that record (the link is ordered, so that echo proves receipt), beyond `delta` | a receiver stealing thinking time and transit |
| early send | an opponent record claims an `at` earlier than a PING it sent after that moment and that arrived before the record, beyond `delta` | a sender stopping its clock early while still pinging |
| future | an opponent record (a FLAG_CLAIM, say) claims an `at` later than its arrival allows, beyond `delta` | a claim dated in the future |
| clock rate | the opponent's clock runs more than `rate_tolerance_ppm` fast or slow against mine | a slowed clock that hides think time |
| asymmetry | the chain's `rtt` exceeds my ping round trip by more than `J` | a consistent early-send or late-ACK lie, which the chain alone reads as a slow link |

A failed check makes the device sign DISPUTE (reason: 1 late ACK, 2 early
send, 3 future, 4 clock rate, 5 asymmetry; subject: the opponent record) and
stop. A device that stops pinging is an outage, nothing more: its next
messages fall under the pause budget.

### `peer`: what a cheater can still gain

| Trick | Most it gains without a DISPUTE |
|---|---|
| date a move earlier than it was sent | `J` per move |
| acknowledge later than received | `J` per move |
| run the clock slow | `rate_tolerance_ppm` of its thinking time (0.1 % on WhitePawn) |
| fake an outage | the pause budget, once per game |
| anything bigger | nothing: a DISPUTE or `canceled`, no result |

**What no offline protocol can stop:** a player can always end an offline game
it is losing without a result, by walking away, faking a long outage or
signing a false DISPUTE. Without an arbiter that cannot be turned into a loss
with certainty, so the profile decides (`leave_offline`; WhitePawn: canceled).
Disputes and cancellations are counted per account, with the engine
evaluation at that moment, for review. Games that must have a winner when
someone leaves need an arbiter: see the next section.

### `checkpoints`: who went away (hybrid)

With `arbiter = checkpoints` the clocks stay `peer` and the server is only a
witness of presence. While a device reaches the server it anchors at least
every `checkpoint_interval_ms` and right after every record it signs or
receives. A checkpoint is a signed anchor request even when it carries no new
record, so each one proves "this player was there at server time T". The
server pushes every record it receives to the other player, as in Delivery.

**Presence** counts only a player's own checkpoints. Records of a player that
the opponent anchors prove those records existed, but not that their signer
could reach the arbiter: an opponent could simply leave them out.

**Away.** At server time T, player X is away when all of these hold:

1. the game waits on X: X is to move, or a record of the opponent Y is not yet
   acknowledged by X;
2. X has no checkpoint of its own in the last `away_after_ms`;
3. Y has checkpoints through that whole time.

The server then signs `VERDICT_ABANDON` for X, with `seen` set to the last
records it holds, and `leave_with_arbiter` applies (WhitePawn: X loses, a
draw when Y cannot mate). Records of X that appear later are void. If both
players lose the arbiter, nobody is present and nothing is decided: the game
falls back to the offline rules, and a hop-off there is `canceled`.

A player without its own server connection can keep playing over the direct
link, but then it depends on the opponent to carry its records to the arbiter
and has `away_after_ms` to get back. The app shows that state ("no connection
to the arbiter: reconnect within 30 s").

### `anchored`

Both clients anchor every record they sign (not their ACKs), right after
sending it to the opponent, and every record they receive. The server times
each move from existence times, with the lag quota (see "Lag quota" below):

```
interval = E(move) - E(opponent's previous move)
charge   = interval - refund(interval - think)       Lag.Compensate
```

Why neither player can shift time onto the other:

- A player cannot make its own move look earlier than it existed (signed
  payloads, see Request), so it cannot shorten its own interval.
- A player cannot make the opponent's previous move look later: the opponent
  anchored it when sending it, and the server pushed it to this player then.
- A player can make its own move look later by anchoring it late: that only
  costs its own clock.
- A player that stops anchoring (no server link) has its moves timed when the
  opponent anchors them on receipt: its clock keeps running, the same as
  losing the connection today.

Flags and abandonment are decided by the server from these times, as today:
when a player's clock, run from the existence time of the opponent's last move,
passes zero plus grace with no record of that player existing in time, the
server signs `VERDICT_FLAG` (or `VERDICT_ABANDON` after the abandonment timer)
with `seen` set to the last records that made it; later records are void. At
the end it signs `VERDICT_RESULT` with the final clocks.

## Ending a game

A game ends at the first terminating record in the canonical order (a mating
or drawing move, RESIGN, DRAW_ACCEPT, ABORT, FLAGGED, a valid FLAG_CLAIM, a
verdict, CANCEL), or when it turns `disputed` or `canceled`. After that,
both clients sign `END` with the result they computed. `END` from both players
closes the game for good: nothing reported later changes it, including clock
disputes. A game without both `END` records is still decided by its chain;
`END` only adds that both sides saw the same ending.

## Reporting

Either player uploads the game when online:

```
POST /pawnshake/v1/reports   { genesis, records_white[], records_black[], records_server[], receipts[] }
```

Clients upload automatically on reconnect, both players, every game. In an
`anchored` game the server already holds everything and the report only fills
gaps. The server:

1. Verifies the genesis, every record and every receipt.
2. Merges with what it already holds for that `genesis_hash`: the union. A
   report can only add records, so withholding never removes what the other
   player or the anchors put there.
3. Looks for forks (one signer, one `seq`, two different payloads): the signer
   loses.
4. Runs the canonical order and stores the result with its state:

| State | When |
|---|---|
| `final` | ended by a provable termination, a verdict, or both `END`s |
| `pending` | not ended yet in the chain; waits for the other player's report |
| `disputed` | a DISPUTE record: no result, unrated |
| `canceled` | an outage beyond the pause budget without two RESUMEs, a CANCEL, or a leave that `leave_*` cancels: no result, unrated, saved |
| `unfinished` | still `pending` after `report_wait_days`: saved, never rated |

A losing player who never reports gains nothing: the winner's report carries
every record the loser sent (the winner received them, that is how the game
went on). Records a player signed but never delivered or anchored did not
happen for the game.

Saving a `final` game is up to the server (WhitePawn: both players'
collections, PGN, ratings), idempotent on `genesis_hash`. A `canceled`, `disputed` or
`unfinished` game is saved the same way without ratings: PGN result `*`, the
state as termination. One player's upload is enough; a later upload from the
other player merges into it.

## Stored games

Until a game is `final`, every record keeps its signature: any of them can
become fork evidence, and reports of unfinished games carry them all. Once it
is `final`, the server and both clients keep only the **compact form**:

```
genesis
records without signatures, per signer in seq order (seq, seen, at, op, args)
head signatures      the last record of White and of Black, 64 bytes each
server records       verdicts, with their signatures
fork evidence        only in a game that ended in a fork: both records, signed
last receipt         optional: server-attested time of the game
```

This loses nothing. Every payload contains `prev`, the hash of the signer's
previous payload, so one signature on a player's last record commits to every
record that player made before it. A verifier rebuilds every payload from the
genesis forward (`prev`, `seen_hash`, `ply`, `legal`) and checks only the
heads; changing, adding or dropping any earlier record changes the hash chain
and the head signature fails.

A 40-move game (80 moves, 80 ACKs, 2 ENDs, 1 verdict) is about 1 KB of
records plus 3 signatures, against about 10 KB of signatures alone when every
record keeps its own.

## Transport

| Where | Link |
|---|---|
| same room, no internet | for example Bluetooth LE, or LAN (iroh with local discovery) |
| internet | for example iroh direct (hole-punched), with a relay fallback |
| server | a live session (WebTransport / WebSocket) for anchors and delivery, HTTP for late anchors and reports |

All player links carry the same wire records. A direct link shows each player
the other's IP address: fine between linked friends, relay-only or off for
strangers. A link that sends invalid records repeatedly is closed. Without a
direct link, an `anchored` game still works over the server alone: the
anchor of a record is its delivery.

## Attacks

| Attack | Outcome |
|---|---|
| Different records to the opponent and the server, or twice to the opponent | fork: signer loses |
| Report a chain different from what the opponent or the anchors hold | fork as soon as they meet |
| Report only the part of the game you did not lose | union with the opponent's report and the anchors |
| Forge or alter an opponent's record | signature fails |
| Replay a record into another game or another point of this game | genesis hash, seq, prev and seen are signed |
| Claim to have seen something you had not | `seen_hash` must match the opponent's real record |
| Resign/accept races | canonical order, identical on every device |
| Engines disagree on legal moves | `legal` in the payload: signature fails, no silent divergence |
| Pre-anchor every candidate move to stop your clock early | anchors carry signed payloads: two candidates are a fork |
| Anchor a move but hold it back from the opponent | the server pushes it on anchoring |
| Anchor the opponent's move late to burn its clock | the opponent anchored it on sending |
| Server drops or reorders a receipt | `prev_receipt` chain |
| Under-report think time, `anchored` | bounded by the lag quota |
| Date a move early or acknowledge late, `peer` | `J` per move at most; more fails a live check: DISPUTE |
| Fake an outage, `peer` | the pause budget once, then `canceled` |
| Refuse to acknowledge a mating move | outage rules: `canceled` at worst, never a win for the refuser |
| Claim a flag with a future timestamp | the "future" live check: DISPUTE |
| Walk away when losing, offline | `canceled` (profile `leave_offline`), counted per account |
| Walk away when losing, hybrid or online | the arbiter sees it: `VERDICT_ABANDON`, the leaver loses |
| Leave out the opponent's records from your checkpoints to make it look away | presence counts only the opponent's own checkpoints |
| False DISPUTE when losing | no result; counted per account with the engine evaluation |
| Choose the colors | commit-reveal in the genesis |
| Stolen device | certificate revoked, checked at anchoring and reporting |
| Two own accounts farming rating offline | same as online collusion; a profile and server policy matter |

## Lag quota

`anchored` clocks forgive network lag out of a bounded quota, a port of
lichess' LagTracker. Per player:

```
est   = initial + 40 * increment            seconds
gain  = min(1000 ms, est * 4 ms + 150 ms)   earned per move
quota = 3 * gain at the start, never above 7 * gain
compensate(lag):
  refund = min(max(lag, 0), quota)
  quota  = min(quota + gain - refund, 7 * gain)
```

A client that lies about its think time gains at most the quota; an honest
client on a bad connection is not flagged by the network.

## Naming

The record and message tags (`PSREC001`, `PSCHAL01`, `PSACPT01`, `PSSTRT01`,
`PSCERT01`, `PSANCH01`) are versioned: a change to a layout gets a new tag, so
old and new records can never be confused.
