# pawnshake (TypeScript)

TypeScript implementation of the Pawnshake protocol (`../spec/PAWNSHAKE.md`),
byte-for-byte pinned to the Go implementation by the vectors in `../vectors`.
Strict TypeScript, ES modules, compiled to `dist/` with type declarations.
Depends on `@noble/curves` (Ed25519, ZIP-215 verification) and
`@noble/hashes`.

```bash
npm install          # also builds dist/ (prepare)
npm run typecheck    # sources and tests
npm test             # vectors + unit tests
npm run coverage     # fails below 100 % lines, branches, functions, statements
```

Move codes are engine-agnostic: pass the legal moves of the position in UCI
from your own engine (`encodeMove(legal, uci)` returns `[code, legal.length]`).
