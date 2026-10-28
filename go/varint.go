package pawnshake

import (
	"encoding/binary"
	"errors"
)

// ErrVarint is a varint that is truncated, too long, or not minimally
// encoded. Pawnshake rejects non-minimal encodings so a record has exactly one
// byte form.
var ErrVarint = errors.New("pawnshake: bad varint")

// AppendUvarint appends v as an unsigned LEB128 varint.
func AppendUvarint(b []byte, v uint64) []byte { return binary.AppendUvarint(b, v) }

// ReadUvarint reads one minimally encoded unsigned varint from the start of b
// and returns it with the number of bytes it took.
func ReadUvarint(b []byte) (uint64, int, error) {
	v, n := binary.Uvarint(b)
	if n <= 0 || (n > 1 && b[n-1] == 0) {
		return 0, 0, ErrVarint
	}
	return v, n, nil
}
