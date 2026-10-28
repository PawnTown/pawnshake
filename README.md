<p align="center">
  <img src="assets/logo.png" alt="Pawnshake" width="420">
</p>

# Pawnshake

**The Pawnshake protocol**: signed, peer-to-peer chess games with a clock.

Two players sign every move and every command (resign, draw, takeback, flag)
and send them straight to each other. A move is one byte (its index among the
legal moves), a whole record about 70 bytes. A server is optional:

| Game | Arbiter | Who keeps the time |
|---|---|---|
| offline | none | both devices, from signed timestamps they cross-check live |
| hybrid | checkpoints | the devices, plus server checkpoints that show who is still there |
| online | full | the server, from anchors (signed receipts over the game's head) |

Either player can upload a game later; anyone can verify it from the
signatures alone. Everything that is policy rather than protocol (allowances,
pause budget, how long a player may be gone, what leaving costs) is a
**rules profile** signed into each game, so every app can tune it.

Status: **draft**. The specification is still moving. Go, TypeScript and Dart
implement certificates, rules profiles, the genesis handshake, records (header,
body, wire format), chains with fork detection, anchor heads and receipts, the
canonical order, the lag quota and move codes; both are pinned to the same
vectors. Not implemented yet: the peer clock function and live checks.

## Install

| Language | Package |
|---|---|
| Go | `go get github.com/PawnTown/pawnshake/go@latest` |
| TypeScript / JavaScript | `npm install pawnshake` |
| Dart / Flutter | `dart pub add pawnshake` |

Read the docs: **[pawntown.github.io/pawnshake](https://pawntown.github.io/pawnshake/)**, how it
works, the three game modes, every payload byte by byte, and an attack gallery.

## Layout

| Path | What |
|---|---|
| [`spec/PAWNSHAKE.md`](spec/PAWNSHAKE.md) | the protocol |
| [`spec/profiles/`](spec/profiles) | rules profiles, starting with [`whitepawn/1`](spec/profiles/whitepawn-1.md) |
| [`vectors/`](vectors) | conformance test vectors every implementation must pass |
| [`go/`](go) | Go implementation (`github.com/PawnTown/pawnshake/go`), 100 % test coverage |
| [`js/`](js) | TypeScript implementation (npm `pawnshake`), 100 % test coverage |
| [`dart/`](dart) | Dart implementation (pub `pawnshake`, for Flutter), 100 % test coverage |
| [`site/`](site) | the docs site (`node site/build.mjs --serve`), published to GitHub Pages |
| [`viz/index.html`](viz/index.html) | design scratchpad: step through scenarios locally (not published) |

## Docs site

```bash
node site/build.mjs --serve     # http://localhost:4321/
```

Plain HTML from `site/pages/*.mjs`, no dependencies. The byte pictures are
drawn from `vectors/core.json`, so they always match the libraries. A push to
`main` publishes it (`.github/workflows/pages.yml`).

The visualizer in `viz/` is a single self-contained HTML file for working out
scenarios: open it in a browser. Its signatures are demo bytes.

## Go

```bash
cd go
go test -cover ./...
go test . -update && go test ./movecode -update   # regenerate the vectors
```

## TypeScript

```bash
cd js
npm install
npm run typecheck && npm run coverage
```

## Dart

```bash
cd dart
dart pub get
tool/coverage.sh
```

## Planned

- the peer clock function and live checks, in every language
- `rust/` (crate `pawnshake`)

## License

MIT, see [LICENSE](LICENSE). `vectors/zip215.json` comes from
`github.com/hdevalence/ed25519consensus` (BSD-3-Clause).
