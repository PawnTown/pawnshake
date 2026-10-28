package pawnshake

import (
	"crypto/ed25519"
	"errors"
	"fmt"
)

var (
	ErrSeqGap    = errors.New("pawnshake: record seq is not the next one")
	ErrUnseen    = errors.New("pawnshake: record sees an opponent record this chain does not have")
	ErrNoKey     = errors.New("pawnshake: no key for this signer")
	ErrMoveInfo  = errors.New("pawnshake: no ply/legal for a move")
	ErrSignedSeq = errors.New("pawnshake: this seq is already signed")
)

// ForkError is two different signed records for one (signer, seq): the
// signer forked the chain and loses (spec "The one rule").
type ForkError struct {
	Signer Signer
	Seq    uint32
	Have   Sealed
	Other  Sealed
}

func (e *ForkError) Error() string {
	return fmt.Sprintf("pawnshake: fork by signer %d at seq %d", e.Signer, e.Seq)
}

// MoveInfo returns the ply a move creates and the number of legal moves of the
// position it is played in. The chain cannot know the position; the caller's
// engine does.
type MoveInfo func(r Record) (ply uint16, legal uint8, err error)

// Chain holds the records of one game for White, Black and the server.
type Chain struct {
	Genesis [32]byte
	Keys    [3][]byte
	recs    [3][]Sealed
}

// NewChain starts an empty chain for a genesis hash and the three signers'
// public keys (the server key may be nil when there is no arbiter).
func NewChain(genesis [32]byte, white, black, server []byte) *Chain {
	return &Chain{Genesis: genesis, Keys: [3][]byte{white, black, server}}
}

// Len is how many records a signer has.
func (c *Chain) Len(s Signer) uint32 { return uint32(len(c.recs[s])) }

// Get returns a signer's record by seq (1-based).
func (c *Chain) Get(s Signer, seq uint32) (Sealed, bool) {
	if seq == 0 || seq > c.Len(s) {
		return Sealed{}, false
	}
	return c.recs[s][seq-1], true
}

// Records returns a signer's records in seq order.
func (c *Chain) Records(s Signer) []Sealed { return append([]Sealed(nil), c.recs[s]...) }

func (c *Chain) idOr(s Signer, seq uint32, zero bool) ([32]byte, error) {
	if seq == 0 {
		if zero {
			return [32]byte{}, nil
		}
		return c.Genesis, nil
	}
	r, ok := c.Get(s, seq)
	if !ok {
		return [32]byte{}, ErrUnseen
	}
	return r.ID, nil
}

// Links builds the links of a record against this chain.
func (c *Chain) Links(r Record) (Links, error) {
	var l Links
	var err error
	if l.Prev, err = c.idOr(r.Signer, r.Seq-1, false); err != nil {
		return l, ErrSeqGap
	}
	if r.Signer == Server {
		if l.SeenHash, err = c.idOr(White, r.Seen, true); err != nil {
			return l, err
		}
		l.SeenHashB, err = c.idOr(Black, r.SeenB, true)
		return l, err
	}
	l.SeenHash, err = c.idOr(r.Signer.Other(), r.Seen, true)
	return l, err
}

func (c *Chain) seal(r Record, info MoveInfo) (Sealed, error) {
	if IsMove(r.Op) && r.Signer != Server {
		if info == nil {
			return Sealed{}, ErrMoveInfo
		}
		var err error
		if r.Ply, r.Legal, err = info(r); err != nil {
			return Sealed{}, err
		}
	}
	l, err := c.Links(r)
	if err != nil {
		return Sealed{}, err
	}
	return r.Seal(c.Genesis, l), nil
}

// Add verifies a received record and appends it. A copy of a record the
// chain already holds is reported as a duplicate; a different signed record
// for a seq the chain holds is a *ForkError.
func (c *Chain) Add(r Record, info MoveInfo) (s Sealed, dup bool, err error) {
	if r.Signer > Server || len(c.Keys[r.Signer]) == 0 {
		return Sealed{}, false, ErrNoKey
	}
	have, held := c.Get(r.Signer, r.Seq)
	if !held && r.Seq != c.Len(r.Signer)+1 {
		return Sealed{}, false, ErrSeqGap
	}
	if s, err = c.seal(r, info); err != nil {
		return Sealed{}, false, err
	}
	if !s.VerifySig(c.Genesis, c.Keys[r.Signer]) {
		return Sealed{}, false, ErrSignature
	}
	if held {
		if have.ID == s.ID {
			return have, true, nil
		}
		return Sealed{}, false, &ForkError{Signer: r.Signer, Seq: r.Seq, Have: have, Other: s}
	}
	c.recs[r.Signer] = append(c.recs[r.Signer], s)
	return s, false, nil
}

// Next fills Seq and Seen of a new record of signer s against this chain.
func (c *Chain) Next(s Signer, at uint32, op uint8, args []byte) Record {
	r := Record{Signer: s, Seq: c.Len(s) + 1, At: at, Op: op, Args: args}
	if s == Server {
		r.Seen, r.SeenB = c.Len(White), c.Len(Black)
	} else {
		r.Seen = c.Len(s.Other())
	}
	return r
}

// SignNext signs and appends the signer's next record. It is the only way a
// client should sign: it can never sign two records for one seq.
func (c *Chain) SignNext(priv ed25519.PrivateKey, r Record, info MoveInfo) (Sealed, error) {
	if r.Seq != c.Len(r.Signer)+1 {
		return Sealed{}, ErrSignedSeq
	}
	s, err := c.seal(r, info)
	if err != nil {
		return Sealed{}, err
	}
	s.SignWith(c.Genesis, priv)
	c.recs[r.Signer] = append(c.recs[r.Signer], s)
	return s, nil
}
