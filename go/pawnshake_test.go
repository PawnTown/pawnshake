package pawnshake

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"strings"
	"testing"
)

func TestVarint(t *testing.T) {
	for _, v := range []uint64{0, 1, 127, 128, 300, 1 << 35} {
		b := AppendUvarint(nil, v)
		got, n, err := ReadUvarint(b)
		if err != nil || got != v || n != len(b) {
			t.Fatalf("%d: %d %d %v", v, got, n, err)
		}
	}
	for _, bad := range [][]byte{nil, {0x80}, {0x80, 0x00}, bytes.Repeat([]byte{0xff}, 11)} {
		if _, _, err := ReadUvarint(bad); err != ErrVarint {
			t.Fatalf("%x accepted", bad)
		}
	}
}

func TestReader(t *testing.T) {
	r := &reader{b: []byte{1}}
	if r.u32() != 0 || r.err != ErrShort || r.u8() != 0 || r.uvarint() != 0 || r.take(1) != nil {
		t.Fatal("sticky error")
	}
	r = &reader{b: []byte{}}
	if r.u8() != 0 || r.err != ErrShort {
		t.Fatal("u8 short")
	}
}

func TestSignVerify(t *testing.T) {
	sig := Sign(whiteKey, []byte("m"))
	pub := PublicOf(whiteKey)
	if !Verify(pub, []byte("m"), sig) || Verify(pub, []byte("x"), sig) || Verify(pub[:31], []byte("m"), sig) || Verify(pub, []byte("m"), sig[:63]) {
		t.Fatal("verify")
	}
}

func TestCert(t *testing.T) {
	c := mustCert(t, "user:a", whiteKey)
	b := c.Encode()
	d, n, err := DecodeCert(append(b, 9))
	if err != nil || n != len(b) || !bytes.Equal(d.Encode(), b) {
		t.Fatalf("roundtrip %v", err)
	}
	if err := d.Verify(keys, now); err != nil {
		t.Fatal(err)
	}
	if d.Verify(map[uint8][]byte{}, now) != ErrUnknownKey || d.Verify(keys, now+1000) != ErrCertExpired || d.Verify(keys, now-1000) != ErrCertExpired {
		t.Fatal("cert checks")
	}
	d.Sig = bytes.Clone(d.Sig)
	d.Sig[0] ^= 1
	if d.Verify(keys, now) != ErrSignature {
		t.Fatal("bad sig")
	}
	if _, err := IssueCert(serverKey, 1, strings.Repeat("x", 256), PublicOf(whiteKey), 0, 1); err != ErrTooLong {
		t.Fatal(err)
	}
	if _, err := IssueCert(serverKey, 1, "u", []byte{1}, 0, 1); err != ErrKeySize {
		t.Fatal(err)
	}
	if _, _, err := DecodeCert([]byte("XXCERT01")); err != ErrTag {
		t.Fatal(err)
	}
	if _, _, err := DecodeCert(b[:20]); err != ErrShort {
		t.Fatal(err)
	}
}

func TestProfile(t *testing.T) {
	p := WhitePawn(180000, 0, false)
	b, err := p.Encode()
	if err != nil {
		t.Fatal(err)
	}
	d, n, err := DecodeProfile(append(b, 0xEE))
	if err != nil || n != len(b) || d.Name != "whitepawn/1" {
		t.Fatal(err)
	}
	if v, ok := d.Get(KeyPauseBudgetMs); !ok || v != 5000 {
		t.Fatal(v)
	}
	if v, _ := d.Get(KeyTakebacks); v != 1 {
		t.Fatal("casual takebacks")
	}
	if v, _ := WhitePawn(180000, 0, true).Get(KeyTakebacks); v != 0 {
		t.Fatal("rated takebacks")
	}
	for i, tc := range [][2]uint32{{60000, 0}, {180000, 0}, {600000, 0}, {1800000, 0}} {
		v, _ := WhitePawn(tc[0], tc[1], false).Get(KeyAwayAfterMs)
		if v != []uint64{15000, 30000, 60000, 120000}[i] {
			t.Fatalf("speed %d: %d", i, v)
		}
	}
	if _, err := (Profile{Name: strings.Repeat("x", 256)}).Encode(); err != ErrTooLong {
		t.Fatal(err)
	}
	// keys out of order: name "", 2 params: (2,0),(1,0)
	if _, _, err := DecodeProfile([]byte{0, 2, 2, 0, 1, 0}); err != ErrProfileOrder {
		t.Fatal(err)
	}
	if _, _, err := DecodeProfile([]byte{0, 1}); err != ErrShort && err != ErrVarint {
		t.Fatal(err)
	}
}

func TestGenesis(t *testing.T) {
	gp := fixtureGenesis(t, ColorRandom)
	g := gp.g
	if g.Hash != sha256.Sum256(append(append(append([]byte{}, gp.ch...), gp.ac...), gp.st...)) {
		t.Fatal("hash")
	}
	id := g.GameID()
	if !bytes.Equal(id[:], g.Hash[:16]) {
		t.Fatal("game id")
	}
	w, b := g.Keys()
	if g.ChallengerIsWhite() != bytes.Equal(w, PublicOf(whiteKey)) || bytes.Equal(w, b) {
		t.Fatal("keys")
	}
	for _, c := range []ColorChoice{ColorWhite, ColorBlack} {
		g2 := fixtureGenesis(t, c).g
		w, _ := g2.Keys()
		if g2.ChallengerIsWhite() != (c == ColorWhite) || bytes.Equal(w, PublicOf(whiteKey)) != (c == ColorWhite) {
			t.Fatal(c)
		}
	}
	// random colors fall both ways depending on the nonces
	seen := map[bool]bool{}
	for i := 0; i < 16; i++ {
		g3 := *g
		g3.Accept.NonceB[0] = byte(i)
		seen[g3.ChallengerIsWhite()] = true
	}
	if len(seen) != 2 {
		t.Fatal("random colors never vary")
	}
	// decode round trips
	if c, err := DecodeChallenge(gp.ch); err != nil || c.InitialMs != 180000 || !c.Rated || c.Arbiter != ArbiterFull {
		t.Fatal(err)
	}
	if _, err := DecodeChallenge(append(bytes.Clone(gp.ch), 0)); err != ErrTrailing {
		t.Fatal(err)
	}
	bad := bytes.Clone(gp.ch)
	off := len(TagChallenge) + len(g.Challenge.Cert.Encode()) + 8
	bad[off] = 2
	if _, err := DecodeChallenge(bad); err != ErrBadValue {
		t.Fatal(err)
	}
	if _, err := DecodeChallenge([]byte("PSACPT01")); err != ErrTag {
		t.Fatal(err)
	}
	if _, err := DecodeAccept(gp.ch); err != ErrTag {
		t.Fatal(err)
	}
	if _, err := DecodeStart(gp.ch[:10]); err != ErrTag {
		t.Fatal(err)
	}
}

func TestGenesisErrors(t *testing.T) {
	gp := fixtureGenesis(t, ColorRandom)
	flip := func(b []byte, i int) []byte { c := bytes.Clone(b); c[i] ^= 1; return c }
	cases := []struct {
		name       string
		ch, ac, st []byte
		keys       map[uint8][]byte
		want       error
	}{
		{"challenge short", gp.ch[:5], gp.ac, gp.st, keys, ErrShort},
		{"challenge cert", gp.ch, gp.ac, gp.st, map[uint8][]byte{}, ErrUnknownKey},
		{"challenge sig", flip(gp.ch, len(gp.ch)-1), gp.ac, gp.st, keys, ErrSignature},
		{"accept decode", gp.ch, gp.ac[:20], gp.st, keys, ErrShort},
		{"accept link", gp.ch, flip(gp.ac, 9), gp.st, keys, ErrLink},
		{"accept sig", gp.ch, flip(gp.ac, len(gp.ac)-1), gp.st, keys, ErrSignature},
		{"start decode", gp.ch, gp.ac, gp.st[:20], keys, ErrShort},
		{"start link", gp.ch, gp.ac, flip(gp.st, 9), keys, ErrLink},
		{"start commit", gp.ch, gp.ac, flip(gp.st, 8+32), keys, ErrCommit},
		{"start sig", gp.ch, gp.ac, flip(gp.st, len(gp.st)-1), keys, ErrSignature},
	}
	for _, c := range cases {
		if _, err := NewGenesis(c.ch, c.ac, c.st, c.keys, now); err != c.want {
			t.Errorf("%s: %v, want %v", c.name, err, c.want)
		}
	}
	// an accept whose certificate is not valid
	if _, err := VerifyAccept(gp.ac, gp.ch, keys, now+1000); err != ErrCertExpired {
		t.Fatal(err)
	}
	// a challenge with an unencodable profile cannot be signed
	c := Challenge{Profile: Profile{Name: strings.Repeat("x", 256)}}
	if _, err := c.Sign(whiteKey); err != ErrTooLong {
		t.Fatal(err)
	}
}

func TestArgsValid(t *testing.T) {
	ok := []struct {
		s    Signer
		op   uint8
		args []byte
	}{
		{White, 13, nil}, {White, OpResign, nil}, {Black, OpAck, nil}, {White, OpResume, nil},
		{White, OpEnd, []byte{1, 1}}, {White, OpDispute, []byte{1, 5}}, {White, OpCancel, []byte{2}},
		{Server, OpVerdictFlag, []byte{1}}, {Server, OpVerdictAbandon, []byte{2}}, {Server, OpVerdictResult, []byte{1, 1, 0, 0}},
	}
	for _, c := range ok {
		if !argsValid(c.s, c.op, c.args) {
			t.Errorf("%d %d %x rejected", c.s, c.op, c.args)
		}
	}
	bad := []struct {
		s    Signer
		op   uint8
		args []byte
	}{
		{Server, 13, nil}, {White, 13, []byte{1}}, {White, OpEnd, nil}, {White, OpDispute, []byte{1}},
		{White, OpDispute, []byte{1, 0x80, 0}}, {White, OpDispute, []byte{1, 5, 5}}, {White, OpCancel, []byte{3}},
		{White, OpVerdictFlag, []byte{1}}, {Server, OpVerdictFlag, []byte{3}}, {White, OpVerdictResult, []byte{1, 1, 0, 0}},
		{Server, OpVerdictResult, []byte{1, 1, 0}}, {Server, OpVerdictResult, []byte{1, 1, 0, 0, 0}}, {White, 228, nil}, {Server, 255, nil},
	}
	for _, c := range bad {
		if argsValid(c.s, c.op, c.args) {
			t.Errorf("%d %d %x accepted", c.s, c.op, c.args)
		}
	}
}

func TestWire(t *testing.T) {
	_, recs := fixtureChain(t)
	for _, r := range recs {
		d, err := DecodeWire(r.Signer, r.Wire())
		if err != nil || !bytes.Equal(d.Wire(), r.Wire()) {
			t.Fatalf("roundtrip %v", err)
		}
	}
	srv := Record{Signer: Server, Seq: 1, Seen: 2, SeenB: 3, At: 9, Op: OpVerdictFlag, Args: []byte{2}, Sig: make([]byte, 64)}
	if d, err := DecodeWire(Server, srv.Wire()); err != nil || d.SeenB != 3 {
		t.Fatal(err)
	}
	if _, err := DecodeWire(3, srv.Wire()); err != ErrSigner {
		t.Fatal(err)
	}
	if _, err := DecodeWire(White, make([]byte, 67)); err != ErrNoSlots {
		t.Fatal(err)
	}
	if _, err := DecodeWire(White, append([]byte{0x80, 0, 1, 13}, make([]byte, 64)...)); err != ErrVarint {
		t.Fatal(err)
	}
	if _, err := DecodeWire(White, append([]byte{0, 0, 1, 13}, make([]byte, 64)...)); err != ErrOp {
		t.Fatal(err)
	}
	big := AppendUvarint(nil, 1<<33)
	if _, err := DecodeWire(White, append(append(big, 0, 1, 13), make([]byte, 64)...)); err != ErrBadValue {
		t.Fatal(err)
	}
	if _, err := DecodeWire(White, append([]byte{1, 0, 1, 0, 0}, make([]byte, 64)...)); err != ErrOp {
		t.Fatal(err) // op 0 with one byte of args
	}
	if _, err := DecodeWire(White, append([]byte{1, 0, 0x80, 0x80, 0x80}, make([]byte, 64)...)); err == nil {
		t.Fatal("truncated at")
	}
}

func TestChain(t *testing.T) {
	c, recs := fixtureChain(t)
	if c.Len(White) != 2 || c.Len(Black) != 2 || len(c.Records(White)) != 2 {
		t.Fatal("lens")
	}
	if _, ok := c.Get(White, 0); ok {
		t.Fatal("seq 0")
	}
	if _, ok := c.Get(White, 3); ok {
		t.Fatal("seq 3")
	}
	// a second chain receives everything and agrees on every id
	w, b := c.Keys[White], c.Keys[Black]
	d := NewChain(c.Genesis, w, b, c.Keys[Server])
	info := func(r Record) (uint16, uint8, error) {
		if r.Signer == White {
			return 1, 20, nil
		}
		return 2, 20, nil
	}
	order := []int{0, 1, 2, 3}
	for _, i := range order {
		dec, _ := DecodeWire(recs[i].Signer, recs[i].Wire())
		s, dup, err := d.Add(dec, info)
		if err != nil || dup || s.ID != recs[i].ID {
			t.Fatalf("add %d: %v", i, err)
		}
	}
	// duplicate
	dec, _ := DecodeWire(White, recs[0].Wire())
	if _, dup, err := d.Add(dec, info); err != nil || !dup {
		t.Fatal("dup", err)
	}
	// fork: another signed e4 slot with a different move
	fork := Record{Signer: White, Seq: 1, At: 1000, Op: 12, Ply: 1, Legal: 20}
	l, _ := d.Links(fork)
	fs := fork.Seal(d.Genesis, l)
	fs.SignWith(d.Genesis, whiteKey)
	_, _, err := d.Add(fs.Record, info)
	var fe *ForkError
	if !errors.As(err, &fe) || fe.Seq != 1 || fe.Error() == "" {
		t.Fatalf("fork: %v", err)
	}
	// errors
	if _, _, err := d.Add(Record{Signer: 3}, info); err != ErrNoKey {
		t.Fatal(err)
	}
	if _, _, err := NewChain(c.Genesis, w, b, nil).Add(Record{Signer: Server, Seq: 1}, nil); err != ErrNoKey {
		t.Fatal(err)
	}
	if _, _, err := d.Add(Record{Signer: White, Seq: 5, Op: OpAck}, nil); err != ErrSeqGap {
		t.Fatal(err)
	}
	if _, _, err := d.Add(Record{Signer: White, Seq: 3, Seen: 9, Op: OpAck}, nil); err != ErrUnseen {
		t.Fatal(err)
	}
	if _, _, err := d.Add(Record{Signer: White, Seq: 3, Seen: 2, Op: 5}, nil); err != ErrMoveInfo {
		t.Fatal(err)
	}
	boom := errors.New("boom")
	if _, _, err := d.Add(Record{Signer: White, Seq: 3, Seen: 2, Op: 5}, func(Record) (uint16, uint8, error) { return 0, 0, boom }); err != boom {
		t.Fatal(err)
	}
	if _, _, err := d.Add(Record{Signer: White, Seq: 3, Seen: 2, Op: OpAck, Sig: make([]byte, 64)}, nil); err != ErrSignature {
		t.Fatal(err)
	}
	if _, err := d.SignNext(whiteKey, Record{Signer: White, Seq: 1, Op: OpAck}, nil); err != ErrSignedSeq {
		t.Fatal(err)
	}
	if _, err := d.SignNext(whiteKey, Record{Signer: White, Seq: 3, Seen: 7, Op: OpAck}, nil); err != ErrUnseen {
		t.Fatal(err)
	}
	if _, err := (&Chain{}).Links(Record{Signer: White, Seq: 3}); err != ErrSeqGap {
		t.Fatal(err)
	}
	// server records link both chains
	sr, err := d.SignNext(serverKey, d.Next(Server, 5, OpVerdictResult, []byte{1, 1, 0, 0}), nil)
	if err != nil || sr.Seen != 2 || sr.SeenB != 2 {
		t.Fatal(err)
	}
	if _, err := d.Links(Record{Signer: Server, Seq: 2, Seen: 9}); err != ErrUnseen {
		t.Fatal(err)
	}
	if _, err := d.Links(Record{Signer: Server, Seq: 2, Seen: 1, SeenB: 9}); err != ErrUnseen {
		t.Fatal(err)
	}
	dec, _ = DecodeWire(Server, sr.Wire())
	e := NewChain(c.Genesis, w, b, c.Keys[Server])
	for _, r := range recs {
		x, _ := DecodeWire(r.Signer, r.Wire())
		e.Add(x, info)
	}
	if _, _, err := e.Add(dec, nil); err != nil {
		t.Fatal(err)
	}
}

func TestHeadAndReceipt(t *testing.T) {
	c, recs := fixtureChain(t)
	h := HeadOf(recs[3])
	d, err := DecodeHead(h.Encode())
	if err != nil || d.ID(c.Genesis) != recs[3].ID || !d.Verify(c.Genesis, c.Keys[White]) || d.Verify(c.Genesis, c.Keys[Black]) {
		t.Fatal("head", err)
	}
	if _, err := DecodeHead(append(h.Encode(), 0)); err != ErrTrailing {
		t.Fatal(err)
	}
	bad := h.Encode()
	bad[0] = 3
	if _, err := DecodeHead(bad); err != ErrBadValue {
		t.Fatal(err)
	}
	rc := Receipt{KeyID: 1, Genesis: c.Genesis, WhiteSeq: 2, WhiteID: recs[3].ID, BlackSeq: 2, BlackID: recs[2].ID, StateVerified: true, ServerMs: 1 << 40, AnchorNo: 1}
	b := rc.Sign(serverKey)
	if len(b) != ReceiptSize {
		t.Fatal(len(b))
	}
	dr, err := DecodeReceipt(b)
	if err != nil || dr.Verify(keys) != nil || dr.ServerMs != 1<<40 || !dr.StateVerified || dr.Hash() != rc.Hash() {
		t.Fatal("receipt", err)
	}
	if dr.Verify(map[uint8][]byte{}) != ErrUnknownKey {
		t.Fatal("key")
	}
	dr.AnchorNo = 2
	if dr.Verify(keys) != ErrSignature {
		t.Fatal("sig")
	}
	rc.StateVerified = false
	b2 := rc.Sign(serverKey)
	if d2, _ := DecodeReceipt(b2); d2.StateVerified {
		t.Fatal("flag")
	}
	b2[8+1+32+4+32+4+32+32] = 2
	if _, err := DecodeReceipt(b2); err != ErrBadValue {
		t.Fatal(err)
	}
	if _, err := DecodeReceipt(b2[:30]); err != ErrShort {
		t.Fatal(err)
	}
	if _, err := DecodeReceipt(b[:8+1+32+4+32+4+32+32+1+3]); err != ErrShort {
		t.Fatal(err)
	}
}

func TestOrder(t *testing.T) {
	c, recs := fixtureChain(t)
	got := c.Order()
	if len(got) != 4 || got[0].ID != recs[0].ID || got[1].ID != recs[1].ID || got[2].ID != recs[2].ID {
		t.Fatal("linear")
	}
	// concurrent: White resigns and Black moves Nf6-ish without seeing it; the
	// move goes first. Then a server verdict that saw both, then END.
	c.SignNext(whiteKey, c.Next(White, 3000, OpDrawOffer, nil), nil)
	c.SignNext(blackKey, Record{Signer: Black, Seq: 3, Seen: 2, At: 76000, Op: 15}, func(Record) (uint16, uint8, error) { return 4, 29, nil })
	c.SignNext(whiteKey, Record{Signer: White, Seq: 4, Seen: 2, At: 3100, Op: OpEnd, Args: []byte{3, 11}}, nil)
	c.SignNext(serverKey, c.Next(Server, 1, OpVerdictResult, []byte{3, 11, 0, 0}), nil)
	got = c.Order()
	var ops []uint8
	for _, r := range got[4:] {
		ops = append(ops, r.Op)
	}
	// ready after the four: W offer (class 3) and B move (class 1): move first;
	// then W offer and the END (W chain order); the server last (it saw all).
	want := []uint8{15, OpDrawOffer, OpEnd, OpVerdictResult}
	if !bytes.Equal(ops, want) {
		t.Fatalf("order %v want %v", ops, want)
	}
	// server first when ready
	c2, _ := fixtureChain(t)
	c2.SignNext(serverKey, c2.Next(Server, 1, OpVerdictFlag, []byte{1}), nil)
	c2.SignNext(whiteKey, c2.Next(White, 3000, OpResign, nil), nil)
	o2 := c2.Order()
	if o2[4].Signer != Server {
		t.Fatal("server first")
	}
	// END before other commands
	c3, _ := fixtureChain(t)
	c3.SignNext(whiteKey, c3.Next(White, 3000, OpResign, nil), nil)
	c3.SignNext(blackKey, Record{Signer: Black, Seq: 3, Seen: 2, At: 1, Op: OpEnd, Args: []byte{1, 2}}, nil)
	if o3 := c3.Order(); o3[4].Op != OpEnd {
		t.Fatal("end first")
	}
}

func TestLag(t *testing.T) {
	l := NewLag(60000, 0)
	if l.Gain != 390 || l.Quota != 1170 {
		t.Fatal(l)
	}
	var total int64
	for range 20 {
		total += l.Compensate(10000)
	}
	if total != 1170+19*390 || l.Compensate(-5) != 0 {
		t.Fatal(total)
	}
	if NewLag(600000, 0).Gain != 1000 {
		t.Fatal("cap")
	}
}
