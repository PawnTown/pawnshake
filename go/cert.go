package pawnshake

import (
	"crypto/ed25519"
	"errors"
)

// Message tags (spec "Naming"). A changed layout gets a new tag.
const (
	TagRecord    = "PSREC001"
	TagChallenge = "PSCHAL01"
	TagAccept    = "PSACPT01"
	TagStart     = "PSSTRT01"
	TagCert      = "PSCERT01"
	TagReceipt   = "PSANCH01"
)

var (
	ErrTag         = errors.New("pawnshake: wrong message tag")
	ErrTooLong     = errors.New("pawnshake: field longer than 255 bytes")
	ErrSignature   = errors.New("pawnshake: bad signature")
	ErrUnknownKey  = errors.New("pawnshake: unknown server key")
	ErrCertExpired = errors.New("pawnshake: certificate not valid at this time")
	ErrKeySize     = errors.New("pawnshake: public key must be 32 bytes")
)

// Cert binds a device key to an account, signed by the server
// (spec "Identity: device certificates").
type Cert struct {
	KeyID    uint8
	UserID   string
	DevicePK []byte
	Issued   uint32 // unix seconds
	Expires  uint32
	Sig      []byte
}

func (c Cert) signed() []byte {
	b := append([]byte(TagCert), c.KeyID)
	b = appendStr(b, c.UserID)
	b = append(b, c.DevicePK...)
	b = appendU32(b, c.Issued)
	return appendU32(b, c.Expires)
}

// Encode is the certificate as it travels: the signed part and the server
// signature.
func (c Cert) Encode() []byte { return append(c.signed(), c.Sig...) }

// IssueCert creates and signs a certificate with a server key.
func IssueCert(server ed25519.PrivateKey, keyID uint8, user string, devicePK []byte, issued, expires uint32) (Cert, error) {
	if len(user) > 255 {
		return Cert{}, ErrTooLong
	}
	if len(devicePK) != ed25519.PublicKeySize {
		return Cert{}, ErrKeySize
	}
	c := Cert{KeyID: keyID, UserID: user, DevicePK: devicePK, Issued: issued, Expires: expires}
	c.Sig = Sign(server, c.signed())
	return c, nil
}

func readCert(r *reader) Cert {
	if string(r.take(len(TagCert))) != TagCert && r.err == nil {
		r.err = ErrTag
	}
	c := Cert{KeyID: r.u8(), UserID: r.str()}
	c.DevicePK = r.take(32)
	c.Issued, c.Expires = r.u32(), r.u32()
	c.Sig = r.take(SigSize)
	return c
}

// DecodeCert decodes one certificate from the start of b and returns how many
// bytes it took (certificates are embedded in genesis messages).
func DecodeCert(b []byte) (Cert, int, error) {
	r := &reader{b: b}
	c := readCert(r)
	if r.err != nil {
		return Cert{}, 0, r.err
	}
	return c, len(b) - len(r.b), nil
}

// Verify checks the server signature with the pinned server keys and that the
// certificate is valid at `now` (unix seconds).
func (c Cert) Verify(serverKeys map[uint8][]byte, now uint32) error {
	pub, ok := serverKeys[c.KeyID]
	if !ok {
		return ErrUnknownKey
	}
	if !Verify(pub, c.signed(), c.Sig) {
		return ErrSignature
	}
	if now < c.Issued || now > c.Expires {
		return ErrCertExpired
	}
	return nil
}
