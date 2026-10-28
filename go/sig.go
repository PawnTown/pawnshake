package pawnshake

import (
	"crypto/ed25519"

	"github.com/hdevalence/ed25519consensus"
)

// SigSize is the size of an Ed25519 signature.
const SigSize = ed25519.SignatureSize

// KeyFromSeed derives an Ed25519 private key from a 32-byte seed.
func KeyFromSeed(seed []byte) ed25519.PrivateKey { return ed25519.NewKeyFromSeed(seed) }

// PublicOf is the public key of a private key.
func PublicOf(priv ed25519.PrivateKey) []byte { return []byte(priv.Public().(ed25519.PublicKey)) }

// Sign signs msg (RFC 8032, deterministic).
func Sign(priv ed25519.PrivateKey, msg []byte) []byte { return ed25519.Sign(priv, msg) }

// Verify checks a signature with the ZIP-215 rules, so every implementation
// agrees on which signatures are valid.
func Verify(pub, msg, sig []byte) bool {
	if len(pub) != ed25519.PublicKeySize || len(sig) != SigSize {
		return false
	}
	return ed25519consensus.Verify(pub, msg, sig)
}
