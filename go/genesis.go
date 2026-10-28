package pawnshake

import (
	"crypto/ed25519"
	"crypto/sha256"
	"errors"
)

// Arbiter is how much of a referee the server is (spec "Goal").
type Arbiter uint8

const (
	ArbiterNone        Arbiter = 0
	ArbiterCheckpoints Arbiter = 1
	ArbiterFull        Arbiter = 2
)

// ColorChoice is the challenger's color request.
type ColorChoice uint8

const (
	ColorRandom ColorChoice = 0
	ColorWhite  ColorChoice = 1
	ColorBlack  ColorChoice = 2
)

var (
	ErrTrailing = errors.New("pawnshake: trailing bytes")
	ErrBadValue = errors.New("pawnshake: field out of range")
	ErrLink     = errors.New("pawnshake: genesis messages do not link")
	ErrCommit   = errors.New("pawnshake: nonce does not match the commitment")
)

// Challenge is the first genesis message, signed by the challenger.
type Challenge struct {
	Cert        Cert
	InitialMs   uint32
	IncrementMs uint32
	Rated       bool
	Arbiter     Arbiter
	Color       ColorChoice
	Profile     Profile
	Commit      [32]byte
	Sig         []byte
}

// Accept is the second genesis message, signed by the accepting player.
type Accept struct {
	ChallengeHash [32]byte
	Cert          Cert
	NonceB        [16]byte
	Sig           []byte
}

// Start is the third genesis message, signed by the challenger: it reveals
// the nonce it committed to.
type Start struct {
	AcceptHash [32]byte
	NonceA     [16]byte
	Sig        []byte
}

// Commit is the commitment to a nonce: SHA-256(nonce).
func Commit(nonce [16]byte) [32]byte { return sha256.Sum256(nonce[:]) }

func (c Challenge) signed() ([]byte, error) {
	prof, err := c.Profile.Encode()
	if err != nil {
		return nil, err
	}
	b := append([]byte(TagChallenge), c.Cert.Encode()...)
	b = appendU32(appendU32(b, c.InitialMs), c.IncrementMs)
	rated := byte(0)
	if c.Rated {
		rated = 1
	}
	b = append(b, rated, byte(c.Arbiter), byte(c.Color))
	b = append(b, prof...)
	return append(b, c.Commit[:]...), nil
}

// Sign signs the challenge with the challenger's device key and returns its
// encoding.
func (c *Challenge) Sign(priv ed25519.PrivateKey) ([]byte, error) {
	m, err := c.signed()
	if err != nil {
		return nil, err
	}
	c.Sig = Sign(priv, m)
	return append(m, c.Sig...), nil
}

func (a Accept) signed() []byte {
	b := append([]byte(TagAccept), a.ChallengeHash[:]...)
	b = append(b, a.Cert.Encode()...)
	return append(b, a.NonceB[:]...)
}

// Sign signs the acceptance and returns its encoding.
func (a *Accept) Sign(priv ed25519.PrivateKey) []byte {
	m := a.signed()
	a.Sig = Sign(priv, m)
	return append(m, a.Sig...)
}

func (s Start) signed() []byte {
	b := append([]byte(TagStart), s.AcceptHash[:]...)
	return append(b, s.NonceA[:]...)
}

// Sign signs the start message and returns its encoding.
func (s *Start) Sign(priv ed25519.PrivateKey) []byte {
	m := s.signed()
	s.Sig = Sign(priv, m)
	return append(m, s.Sig...)
}

func expectTag(r *reader, tag string) {
	if string(r.take(len(tag))) != tag && r.err == nil {
		r.err = ErrTag
	}
}

func finish(r *reader) error {
	if r.err == nil && len(r.b) != 0 {
		return ErrTrailing
	}
	return r.err
}

// DecodeChallenge decodes a whole CHALLENGE message.
func DecodeChallenge(b []byte) (Challenge, error) {
	r := &reader{b: b}
	expectTag(r, TagChallenge)
	c := Challenge{Cert: readCert(r), InitialMs: r.u32(), IncrementMs: r.u32()}
	rated, arb, col := r.u8(), r.u8(), r.u8()
	if r.err == nil && (rated > 1 || arb > 2 || col > 2) {
		r.err = ErrBadValue
	}
	c.Rated, c.Arbiter, c.Color = rated == 1, Arbiter(arb), ColorChoice(col)
	c.Profile = readProfile(r)
	c.Commit = r.array32()
	c.Sig = r.take(SigSize)
	return c, finish(r)
}

// DecodeAccept decodes a whole ACCEPT message.
func DecodeAccept(b []byte) (Accept, error) {
	r := &reader{b: b}
	expectTag(r, TagAccept)
	a := Accept{ChallengeHash: r.array32(), Cert: readCert(r), NonceB: r.array16()}
	a.Sig = r.take(SigSize)
	return a, finish(r)
}

// DecodeStart decodes a whole START message.
func DecodeStart(b []byte) (Start, error) {
	r := &reader{b: b}
	expectTag(r, TagStart)
	s := Start{AcceptHash: r.array32(), NonceA: r.array16()}
	s.Sig = r.take(SigSize)
	return s, finish(r)
}

// Genesis is a verified CHALLENGE | ACCEPT | START.
type Genesis struct {
	Challenge Challenge
	Accept    Accept
	Start     Start
	Raw       [3][]byte
	Hash      [32]byte
}

func verifyMsg(pub []byte, raw []byte, sig []byte) error {
	if !Verify(pub, raw[:len(raw)-SigSize], sig) {
		return ErrSignature
	}
	return nil
}

// VerifyChallenge decodes a CHALLENGE and checks its certificate and
// signature.
func VerifyChallenge(raw []byte, serverKeys map[uint8][]byte, now uint32) (Challenge, error) {
	c, err := DecodeChallenge(raw)
	if err != nil {
		return Challenge{}, err
	}
	if err := c.Cert.Verify(serverKeys, now); err != nil {
		return Challenge{}, err
	}
	return c, verifyMsg(c.Cert.DevicePK, raw, c.Sig)
}

// VerifyAccept decodes an ACCEPT for the given CHALLENGE bytes and checks its
// certificate, signature and link.
func VerifyAccept(raw, challenge []byte, serverKeys map[uint8][]byte, now uint32) (Accept, error) {
	a, err := DecodeAccept(raw)
	if err != nil {
		return Accept{}, err
	}
	if a.ChallengeHash != sha256.Sum256(challenge) {
		return Accept{}, ErrLink
	}
	if err := a.Cert.Verify(serverKeys, now); err != nil {
		return Accept{}, err
	}
	return a, verifyMsg(a.Cert.DevicePK, raw, a.Sig)
}

// NewGenesis verifies all three messages and links them into a genesis.
func NewGenesis(challenge, accept, start []byte, serverKeys map[uint8][]byte, now uint32) (*Genesis, error) {
	c, err := VerifyChallenge(challenge, serverKeys, now)
	if err != nil {
		return nil, err
	}
	a, err := VerifyAccept(accept, challenge, serverKeys, now)
	if err != nil {
		return nil, err
	}
	s, err := DecodeStart(start)
	if err != nil {
		return nil, err
	}
	if s.AcceptHash != sha256.Sum256(accept) {
		return nil, ErrLink
	}
	if Commit(s.NonceA) != c.Commit {
		return nil, ErrCommit
	}
	if err := verifyMsg(c.Cert.DevicePK, start, s.Sig); err != nil {
		return nil, err
	}
	all := append(append(append([]byte{}, challenge...), accept...), start...)
	return &Genesis{Challenge: c, Accept: a, Start: s, Raw: [3][]byte{challenge, accept, start}, Hash: sha256.Sum256(all)}, nil
}

// GameID is the first 16 bytes of the genesis hash.
func (g *Genesis) GameID() [16]byte {
	var id [16]byte
	copy(id[:], g.Hash[:16])
	return id
}

// ChallengerIsWhite says who plays White: the requested color, or for a
// random choice White is the challenger when SHA-256(nonce_A | nonce_B)[0] is
// even.
func (g *Genesis) ChallengerIsWhite() bool {
	switch g.Challenge.Color {
	case ColorWhite:
		return true
	case ColorBlack:
		return false
	}
	h := sha256.Sum256(append(g.Start.NonceA[:], g.Accept.NonceB[:]...))
	return h[0]%2 == 0
}

// Keys returns the device public keys of White and Black.
func (g *Genesis) Keys() (white, black []byte) {
	if g.ChallengerIsWhite() {
		return g.Challenge.Cert.DevicePK, g.Accept.Cert.DevicePK
	}
	return g.Accept.Cert.DevicePK, g.Challenge.Cert.DevicePK
}
