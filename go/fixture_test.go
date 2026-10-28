package pawnshake

import (
	"crypto/ed25519"
	"crypto/sha256"
	"testing"
)

// Deterministic keys and a full genesis, shared by the tests and the vectors.
func seed(tag string) []byte { s := sha256.Sum256([]byte(tag)); return s[:] }

var (
	serverKey = KeyFromSeed(seed("pawnshake test server"))
	whiteKey  = KeyFromSeed(seed("pawnshake test white"))
	blackKey  = KeyFromSeed(seed("pawnshake test black"))
	keys      = map[uint8][]byte{1: PublicOf(serverKey)}
)

const now = 1_800_000_000

func mustCert(t testing.TB, user string, priv ed25519.PrivateKey) Cert {
	t.Helper()
	c, err := IssueCert(serverKey, 1, user, PublicOf(priv), now-100, now+100)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

type genesisParts struct {
	ch, ac, st []byte
	g          *Genesis
}

// fixtureGenesis: White challenges with color random; nonces fixed.
func fixtureGenesis(t testing.TB, color ColorChoice) genesisParts {
	t.Helper()
	nonceA := [16]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}
	nonceB := [16]byte{16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1}
	c := Challenge{Cert: mustCert(t, "user:white", whiteKey), InitialMs: 180000, IncrementMs: 2000, Rated: true,
		Arbiter: ArbiterFull, Color: color, Profile: WhitePawn(180000, 2000, true), Commit: Commit(nonceA)}
	ch, err := c.Sign(whiteKey)
	if err != nil {
		t.Fatal(err)
	}
	a := Accept{ChallengeHash: sha256.Sum256(ch), Cert: mustCert(t, "user:black", blackKey), NonceB: nonceB}
	ac := a.Sign(blackKey)
	s := Start{AcceptHash: sha256.Sum256(ac), NonceA: nonceA}
	st := s.Sign(whiteKey)
	g, err := NewGenesis(ch, ac, st, keys, now)
	if err != nil {
		t.Fatal(err)
	}
	return genesisParts{ch, ac, st, g}
}

// fixtureChain: e4 (code 13 of 20), Black ACK, e5 (code 8 of 20), White ACK.
func fixtureChain(t testing.TB) (*Chain, []Sealed) {
	t.Helper()
	gp := fixtureGenesis(t, ColorWhite)
	w, b := gp.g.Keys()
	c := NewChain(gp.g.Hash, w, b, PublicOf(serverKey))
	info := func(ply uint16, legal uint8) MoveInfo {
		return func(Record) (uint16, uint8, error) { return ply, legal, nil }
	}
	var out []Sealed
	step := func(s Signer, priv ed25519.PrivateKey, at uint32, op uint8, mi MoveInfo) {
		r, err := c.SignNext(priv, c.Next(s, at, op, nil), mi)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	step(White, whiteKey, 1000, 13, info(1, 20))
	step(Black, blackKey, 74239, OpAck, nil)
	step(Black, blackKey, 75439, 8, info(2, 20))
	step(White, whiteKey, 2251, OpAck, nil)
	return c, out
}
