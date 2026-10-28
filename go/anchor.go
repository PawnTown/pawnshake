package pawnshake

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/binary"
)

// Head is what an anchor carries: a record's signed header, without the body
// (spec "Anchors").
type Head struct {
	Signer   Signer
	Seq      uint32
	BodyHash [32]byte
	Sig      []byte
}

// HeadOf is the head of a sealed record.
func HeadOf(s Sealed) Head {
	return Head{Signer: s.Signer, Seq: s.Seq, BodyHash: s.BodyHash, Sig: s.Sig}
}

// Encode writes a head: signer, varint seq, body hash, signature.
func (h Head) Encode() []byte {
	b := AppendUvarint([]byte{byte(h.Signer)}, uint64(h.Seq))
	b = append(b, h.BodyHash[:]...)
	return append(b, h.Sig...)
}

// DecodeHead decodes a whole head.
func DecodeHead(b []byte) (Head, error) {
	r := &reader{b: b}
	h := Head{Signer: Signer(r.u8())}
	h.Seq = u32(r.uvarint(), r)
	h.BodyHash = r.array32()
	h.Sig = r.take(SigSize)
	if err := finish(r); err != nil {
		return Head{}, err
	}
	if h.Signer > Server || h.Seq == 0 {
		return Head{}, ErrBadValue
	}
	return h, nil
}

// ID is the record id the head names.
func (h Head) ID(genesis [32]byte) [32]byte {
	return sha256.Sum256(Header(genesis, h.Signer, h.Seq, h.BodyHash))
}

// Verify checks the head's signature against its signer's key.
func (h Head) Verify(genesis [32]byte, pub []byte) bool {
	return Verify(pub, Header(genesis, h.Signer, h.Seq, h.BodyHash), h.Sig)
}

// Receipt is the server's signed statement that it held these heads at
// server time ServerMs (spec "Receipt").
type Receipt struct {
	KeyID         uint8
	Genesis       [32]byte
	WhiteSeq      uint32
	WhiteID       [32]byte
	BlackSeq      uint32
	BlackID       [32]byte
	StateHash     [32]byte
	StateVerified bool
	ServerMs      uint64
	AnchorNo      uint32
	PrevReceipt   [32]byte
	Sig           []byte
}

// ReceiptSize is the encoded size of a receipt.
const ReceiptSize = 8 + 1 + 32 + 4 + 32 + 4 + 32 + 32 + 1 + 8 + 4 + 32 + SigSize

func (r Receipt) signed() []byte {
	b := append([]byte(TagReceipt), r.KeyID)
	b = append(b, r.Genesis[:]...)
	b = append(appendU32(b, r.WhiteSeq), r.WhiteID[:]...)
	b = append(appendU32(b, r.BlackSeq), r.BlackID[:]...)
	b = append(b, r.StateHash[:]...)
	v := byte(0)
	if r.StateVerified {
		v = 1
	}
	b = append(b, v)
	b = binary.BigEndian.AppendUint64(b, r.ServerMs)
	b = appendU32(b, r.AnchorNo)
	return append(b, r.PrevReceipt[:]...)
}

// Sign signs the receipt with the server key and returns its encoding.
func (r *Receipt) Sign(priv ed25519.PrivateKey) []byte {
	m := r.signed()
	r.Sig = Sign(priv, m)
	return append(m, r.Sig...)
}

// Hash is SHA-256 of the encoded receipt, what the next receipt links to.
func (r Receipt) Hash() [32]byte { return sha256.Sum256(append(r.signed(), r.Sig...)) }

// DecodeReceipt decodes a whole receipt.
func DecodeReceipt(b []byte) (Receipt, error) {
	r := &reader{b: b}
	expectTag(r, TagReceipt)
	rc := Receipt{KeyID: r.u8(), Genesis: r.array32()}
	rc.WhiteSeq, rc.WhiteID = r.u32(), r.array32()
	rc.BlackSeq, rc.BlackID = r.u32(), r.array32()
	rc.StateHash = r.array32()
	v := r.u8()
	if r.err == nil && v > 1 {
		r.err = ErrBadValue
	}
	rc.StateVerified = v == 1
	if ms := r.take(8); ms != nil {
		rc.ServerMs = binary.BigEndian.Uint64(ms)
	}
	rc.AnchorNo = r.u32()
	rc.PrevReceipt = r.array32()
	rc.Sig = r.take(SigSize)
	return rc, finish(r)
}

// Verify checks the receipt's signature with the pinned server keys.
func (r Receipt) Verify(serverKeys map[uint8][]byte) error {
	pub, ok := serverKeys[r.KeyID]
	if !ok {
		return ErrUnknownKey
	}
	if !Verify(pub, r.signed(), r.Sig) {
		return ErrSignature
	}
	return nil
}
