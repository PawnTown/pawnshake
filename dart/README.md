# pawnshake (Dart)

Dart implementation of the Pawnshake protocol (`../spec/PAWNSHAKE.md`),
byte-for-byte pinned to the Go and TypeScript implementations by the vectors
in `../vectors`. Pure Dart (works in Flutter apps), depends only on
`package:crypto`.

Ed25519 is implemented here (`lib/src/ed25519.dart`, on `BigInt`): Dart has
no package that verifies under ZIP-215, the rules every Pawnshake
implementation must share. It reproduces RFC 8032 signatures exactly and
accepts all 196 ZIP-215 cases. A verification takes about 2 ms on a desktop
VM: plenty for a game, not meant for bulk work.

```bash
dart pub get
dart test
tool/coverage.sh     # fails below 100 % lines, branches, functions
```

In a Flutter app, depend on it by path or git:

```yaml
dependencies:
  pawnshake:
    path: ../../packages/pawnshake/dart
```

Move codes are engine-agnostic: pass the legal moves of the position in UCI
from your own engine (`encodeMove(legal, uci)` returns `(code, legal.length)`).
