package pawnshake

import (
	"encoding/binary"
	"errors"
)

// ErrShort is input that ends before a field it must contain.
var ErrShort = errors.New("pawnshake: input too short")

// reader walks a byte slice; the first failure sticks and every later read
// returns zero values.
type reader struct {
	b   []byte
	err error
}

func (r *reader) take(n int) []byte {
	if r.err != nil {
		return nil
	}
	if n > len(r.b) {
		r.err = ErrShort
		return nil
	}
	out := r.b[:n]
	r.b = r.b[n:]
	return out
}

func (r *reader) u8() uint8 {
	b := r.take(1)
	if b == nil {
		return 0
	}
	return b[0]
}

func (r *reader) u32() uint32 {
	b := r.take(4)
	if b == nil {
		return 0
	}
	return binary.BigEndian.Uint32(b)
}

func (r *reader) array32() (a [32]byte) {
	copy(a[:], r.take(32))
	return a
}

func (r *reader) array16() (a [16]byte) {
	copy(a[:], r.take(16))
	return a
}

func (r *reader) uvarint() uint64 {
	if r.err != nil {
		return 0
	}
	v, n, err := ReadUvarint(r.b)
	if err != nil {
		r.err = err
		return 0
	}
	r.b = r.b[n:]
	return v
}

func (r *reader) str() string {
	return string(r.take(int(r.u8())))
}

func appendU32(b []byte, v uint32) []byte { return binary.BigEndian.AppendUint32(b, v) }

func appendStr(b []byte, s string) []byte {
	return append(append(b, byte(len(s))), s...)
}
