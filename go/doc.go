// Package pawnshake is the Go reference implementation of the Pawnshake
// protocol (spec/PAWNSHAKE.md): signatures, device certificates, rules
// profiles, the genesis handshake, records with their header and body, the
// wire format, chains with fork detection, anchor heads and receipts, the
// canonical order and the lag quota. Move codes live in the movecode
// subpackage.
//
// Everything here is byte-for-byte pinned by the vectors in ../vectors; any
// other implementation must reproduce them.
package pawnshake
