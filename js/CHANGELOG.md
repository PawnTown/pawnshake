# Changelog

## 0.1.1 (2026-10-28)

- npm only: the first upload of 0.1.0 never became public and npm does not
  reuse a version. Same code as 0.1.0.

## 0.1.0 (2026-10-28)

First public draft of the Pawnshake protocol.

- Specification (`spec/PAWNSHAKE.md`) and the rules profile `whitepawn/1`.
- Go, TypeScript and Dart implementations: certificates, rules profiles, the
  genesis handshake, records (header, body, wire format), chains with fork
  detection, anchor heads and receipts, the canonical order, the lag quota
  and move codes. Ed25519 verification follows ZIP-215 everywhere.
- Shared conformance vectors (`vectors/`), 100 % test coverage in every
  language, and an interactive visualizer (`viz/`).
