package pawnshake

import (
	"crypto/ed25519"
	"crypto/sha256"
	"errors"
)

// Signer of a record.
type Signer uint8

const (
	White  Signer = 0
	Black  Signer = 1
	Server Signer = 2
)

// Other is the opponent of a player.
func (s Signer) Other() Signer { return 1 - s }

// Ops (spec "Op byte"). 0..217 are moves: the op is the move code.
const (
	OpMaxMove         = 217
	OpResign          = 218
	OpDrawOffer       = 219
	OpDrawAccept      = 220
	OpDrawDecline     = 221
	OpTakebackOffer   = 222
	OpTakebackAccept  = 223
	OpTakebackDecline = 224
	OpAbort           = 225
	OpFlagged         = 226
	OpFlagClaim       = 227
	OpEnd             = 229
	OpAck             = 230
	OpDispute         = 231
	OpResume          = 232
	OpCancel          = 233
	OpVerdictFlag     = 240
	OpVerdictAbandon  = 241
	OpVerdictResult   = 242
)

// HeaderSize is the size of a record header.
const HeaderSize = 8 + 32 + 1 + 4 + 32

var (
	ErrOp      = errors.New("pawnshake: op not valid for this signer or arguments")
	ErrSigner  = errors.New("pawnshake: bad signer")
	ErrNoSlots = errors.New("pawnshake: record too short")
)

// IsMove says whether an op is a move.
func IsMove(op uint8) bool { return op <= OpMaxMove }

// Record is one signed record. Seen is the opponent's highest applied seq;
// a server record uses Seen for White and SeenB for Black. Ply and Legal are
// only set for moves and never travel: the verifier fills them from its
// position.
type Record struct {
	Signer Signer
	Seq    uint32
	Seen   uint32
	SeenB  uint32
	At     uint32
	Op     uint8
	Args   []byte
	Ply    uint16
	Legal  uint8
	Sig    []byte
}

// Links are the hashes a body points to: the signer's previous record and the
// opponent records it had seen (SeenHashB only for server records).
type Links struct {
	Prev      [32]byte
	SeenHash  [32]byte
	SeenHashB [32]byte
}

// argsValid checks the op against its signer and the arguments against the
// op (spec "Op byte").
func argsValid(s Signer, op uint8, args []byte) bool {
	player := s != Server
	switch {
	case IsMove(op), op >= OpResign && op <= OpFlagClaim, op == OpAck, op == OpResume:
		return player && len(args) == 0
	case op == OpEnd:
		return player && len(args) == 2
	case op == OpDispute:
		if !player || len(args) < 2 {
			return false
		}
		_, n, err := ReadUvarint(args[1:])
		return err == nil && n == len(args)-1
	case op == OpCancel:
		return player && len(args) == 1 && (args[0] == 1 || args[0] == 2)
	case op == OpVerdictFlag, op == OpVerdictAbandon:
		return !player && len(args) == 1 && (args[0] == 1 || args[0] == 2)
	case op == OpVerdictResult:
		if player || len(args) < 4 {
			return false
		}
		r := &reader{b: args[2:]}
		r.uvarint()
		r.uvarint()
		return finish(r) == nil
	}
	return false
}

// Body is the record body for the given links.
func (r Record) Body(l Links) []byte {
	b := append([]byte{}, l.Prev[:]...)
	b = appendU32(b, r.Seen)
	b = append(b, l.SeenHash[:]...)
	if r.Signer == Server {
		b = appendU32(b, r.SeenB)
		b = append(b, l.SeenHashB[:]...)
	}
	b = appendU32(b, r.At)
	b = append(b, r.Op)
	b = append(b, r.Args...)
	if IsMove(r.Op) && r.Signer != Server {
		b = append(b, byte(r.Ply>>8), byte(r.Ply), r.Legal)
	}
	return b
}

// Header is the signed part of a record.
func Header(genesis [32]byte, s Signer, seq uint32, bodyHash [32]byte) []byte {
	b := append([]byte(TagRecord), genesis[:]...)
	b = append(b, byte(s))
	b = appendU32(b, seq)
	return append(b, bodyHash[:]...)
}

// Sealed is a record with its derived hashes.
type Sealed struct {
	Record
	BodyHash [32]byte
	ID       [32]byte
}

// Seal computes the body hash and the record id (SHA-256 of the header).
func (r Record) Seal(genesis [32]byte, l Links) Sealed {
	bh := sha256.Sum256(r.Body(l))
	return Sealed{Record: r, BodyHash: bh, ID: sha256.Sum256(Header(genesis, r.Signer, r.Seq, bh))}
}

// SignWith signs a sealed record.
func (s *Sealed) SignWith(genesis [32]byte, priv ed25519.PrivateKey) {
	s.Sig = Sign(priv, Header(genesis, s.Signer, s.Seq, s.BodyHash))
}

// VerifySig checks a sealed record's signature.
func (s Sealed) VerifySig(genesis [32]byte, pub []byte) bool {
	return Verify(pub, Header(genesis, s.Signer, s.Seq, s.BodyHash), s.Sig)
}

// Wire is the record as it travels (spec "Wire format"); the signer is not
// sent.
func (r Record) Wire() []byte {
	b := AppendUvarint(nil, uint64(r.Seq))
	b = AppendUvarint(b, uint64(r.Seen))
	if r.Signer == Server {
		b = AppendUvarint(b, uint64(r.SeenB))
	}
	b = AppendUvarint(b, uint64(r.At))
	b = append(b, r.Op)
	b = append(b, r.Args...)
	return append(b, r.Sig...)
}

func u32(v uint64, r *reader) uint32 {
	if v > 0xFFFFFFFF && r.err == nil {
		r.err = ErrBadValue
	}
	return uint32(v)
}

// DecodeWire decodes a wire record of the given signer. Arguments are the
// bytes between the op and the signature; they are checked against the op.
func DecodeWire(s Signer, b []byte) (Record, error) {
	if s > Server {
		return Record{}, ErrSigner
	}
	if len(b) < SigSize+4 {
		return Record{}, ErrNoSlots
	}
	r := &reader{b: b[:len(b)-SigSize]}
	rec := Record{Signer: s, Sig: append([]byte{}, b[len(b)-SigSize:]...)}
	rec.Seq = u32(r.uvarint(), r)
	rec.Seen = u32(r.uvarint(), r)
	if s == Server {
		rec.SeenB = u32(r.uvarint(), r)
	}
	rec.At = u32(r.uvarint(), r)
	rec.Op = r.u8()
	rec.Args = append([]byte{}, r.b...)
	if r.err != nil {
		return Record{}, r.err
	}
	if rec.Seq == 0 || !argsValid(s, rec.Op, rec.Args) {
		return Record{}, ErrOp
	}
	return rec, nil
}
