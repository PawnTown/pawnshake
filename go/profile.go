package pawnshake

import (
	"errors"
	"slices"
)

// Rules profile keys (spec "Rules profile").
const (
	KeyJMinMs               = 1
	KeyJRttMult             = 2
	KeySampleWindow         = 3
	KeyPauseBudgetMs        = 4
	KeyPingIntervalMs       = 5
	KeyRateTolerancePpm     = 6
	KeyCheckpointIntervalMs = 7
	KeyAwayAfterMs          = 8
	KeyLeaveWithArbiter     = 9
	KeyLeaveOffline         = 10
	KeyFreeFirstMoves       = 11
	KeyTakebacks            = 12
	KeyReportWaitDays       = 13
)

// Outcomes for the leave keys.
const (
	LeaveCancel = 0
	LeaveLoss   = 1
	LeaveDraw   = 2
)

// ErrProfileOrder is a profile whose keys are not strictly ascending: a
// profile has exactly one encoding.
var ErrProfileOrder = errors.New("pawnshake: profile keys must be strictly ascending")

// Profile is a rules profile: a name and numbered parameters, all concrete for
// one game.
type Profile struct {
	Name   string
	Params map[uint64]uint64
}

// Get returns a parameter and whether it is set.
func (p Profile) Get(key uint64) (uint64, bool) {
	v, ok := p.Params[key]
	return v, ok
}

// Encode writes the profile with its keys in ascending order.
func (p Profile) Encode() ([]byte, error) {
	if len(p.Name) > 255 {
		return nil, ErrTooLong
	}
	keys := make([]uint64, 0, len(p.Params))
	for k := range p.Params {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	b := appendStr(nil, p.Name)
	b = AppendUvarint(b, uint64(len(keys)))
	for _, k := range keys {
		b = AppendUvarint(AppendUvarint(b, k), p.Params[k])
	}
	return b, nil
}

func readProfile(r *reader) Profile {
	p := Profile{Name: r.str(), Params: map[uint64]uint64{}}
	n := r.uvarint()
	var last uint64
	for i := uint64(0); i < n && r.err == nil; i++ {
		k, v := r.uvarint(), r.uvarint()
		if r.err == nil && i > 0 && k <= last {
			r.err = ErrProfileOrder
		}
		p.Params[k], last = v, k
	}
	return p
}

// DecodeProfile decodes one profile from the start of b and returns how many
// bytes it took.
func DecodeProfile(b []byte) (Profile, int, error) {
	r := &reader{b: b}
	p := readProfile(r)
	if r.err != nil {
		return Profile{}, 0, r.err
	}
	return p, len(b) - len(r.b), nil
}

// Speed buckets by initial + 40 * increment, like lichess.
func speedIndex(initialMs, incMs uint32) int {
	est := uint64(initialMs) + 40*uint64(incMs)
	switch {
	case est < 180_000:
		return 0
	case est < 480_000:
		return 1
	case est < 1_500_000:
		return 2
	}
	return 3
}

// WhitePawn is the profile "whitepawn/1" for one time control
// (spec/profiles/whitepawn-1.md).
func WhitePawn(initialMs, incMs uint32, rated bool) Profile {
	k := speedIndex(initialMs, incMs)
	takebacks := uint64(1)
	if rated {
		takebacks = 0
	}
	return Profile{Name: "whitepawn/1", Params: map[uint64]uint64{
		KeyJMinMs: 30, KeyJRttMult: 2, KeySampleWindow: 16,
		KeyPauseBudgetMs:        []uint64{2000, 5000, 10000, 20000}[k],
		KeyPingIntervalMs:       250,
		KeyRateTolerancePpm:     1000,
		KeyCheckpointIntervalMs: 10000,
		KeyAwayAfterMs:          []uint64{15000, 30000, 60000, 120000}[k],
		KeyLeaveWithArbiter:     LeaveLoss,
		KeyLeaveOffline:         LeaveCancel,
		KeyFreeFirstMoves:       1,
		KeyTakebacks:            takebacks,
		KeyReportWaitDays:       7,
	}}
}
