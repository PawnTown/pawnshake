# Profile `whitepawn/1`

The rules profile WhitePawn (https://whitepawn.app) uses for every Pawnshake
game. The values are written into each game's CHALLENGE; see
`spec/PAWNSHAKE.md`, "Rules profile". Speeds follow the usual estimate
`initial + 40 * increment`: bullet under 3 min, blitz under 8, rapid under 25,
classical above.

| key | Parameter | Bullet | Blitz | Rapid | Classical |
|---|---|---|---|---|---|
| 1 | `j_min_ms` | 30 | 30 | 30 | 30 |
| 2 | `j_rtt_mult` | 2 | 2 | 2 | 2 |
| 3 | `sample_window` | 16 | 16 | 16 | 16 |
| 4 | `pause_budget_ms` | 2000 | 5000 | 10000 | 20000 |
| 5 | `ping_interval_ms` | 250 | 250 | 250 | 250 |
| 6 | `rate_tolerance_ppm` | 1000 | 1000 | 1000 | 1000 |
| 7 | `checkpoint_interval_ms` | 10000 | 10000 | 10000 | 10000 |
| 8 | `away_after_ms` | 15000 | 30000 | 60000 | 120000 |
| 9 | `leave_with_arbiter` | 1 (loss) | 1 | 1 | 1 |
| 10 | `leave_offline` | 0 (cancel) | 0 | 0 | 0 |
| 11 | `free_first_moves` | 1 | 1 | 1 | 1 |
| 12 | `takebacks` | 1 casual, 0 rated | | | |
| 13 | `report_wait_days` | 7 | 7 | 7 | 7 |

## What that means for players

- **Online and hybrid games** (an arbiter is there): the player who goes away
  loses (a draw when the other cannot mate).
- **Offline games** (no arbiter): if one player hops off completely, the game
  is canceled. It is still uploaded and saved in both players' collections,
  unrated, with all its moves.
- Outages up to the pause budget are paused time; longer ones cancel an
  offline game unless both players resume.

## Decided

Ed25519 with ZIP-215 verification; `J = max(2 * rtt, 30 ms)`; pause budget
2 / 5 / 10 / 20 s by speed; pings unsigned; leaving loses with an arbiter and
cancels without one; canceled games are still uploaded and saved.

## Open

1. **Rated offline games**: never, only `final` ones between linked friends,
   or all `final` ones.
2. **Losing the server mid-game in an online (`full`) game**: the
   disconnected player's clock runs (like today), or both clocks pause for up
   to 15 s like a server handover.
3. **Anchor rate in offline games**: every record, or batched (one anchor per
   N records or per minute) to save requests.
4. **App attestation** (Play Integrity / App Attest) on rated offline games
   to make modified clients harder.

## How WhitePawn's online games use it

- A client announces `pawnshake/1` in its session Hello. Once both players'
  clients did (before the first move), the game runs on records.
- White is always the challenger: White sends CHALLENGE (color white,
  arbiter `full`, this profile) and START, Black sends ACCEPT, over the play
  session. The server checks that the genesis describes the game it created.
- Device keys are per browser, certified by the play server
  (`POST /play/v1/pawnshake/cert`, 30 days).
- The server keeps the clocks and the rules as before. It relays every
  record and sends each record's ply and legal count alongside it, so a
  client can rebuild its chain from a snapshot (the signature still covers
  both). Claims and rematches stay plain commands.

## Rollout in WhitePawn

0. Certificates, genesis and records over the existing play-server session,
   online (`full`) only, no direct link. Implemented on the whitepawn branch
   `feat/pawnshake-online-play`; anchors/receipts are not sent yet (the
   server is in the path anyway). Next: measure move-to-render on both
   clients, then let the server relay before it persists.
1. Direct link (iroh) for online games between friends, Flutter vs Flutter.
   Measure how often the direct copy wins, and by how much.
2. Offline games: local play over BLE / LAN, live checks, late anchors,
   reports. Then hybrid games (`checkpoints`).
3. Web from the numbers.
