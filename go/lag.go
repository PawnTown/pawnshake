package pawnshake

// Lag is the lag quota of one player in anchored games, a port of lichess'
// LagTracker (spec "Lag quota").
type Lag struct {
	Gain, Quota, Max int64
}

// NewLag sizes the quota for a time control.
func NewLag(initialMs, incMs int64) Lag {
	est := (initialMs + 40*incMs) / 1000
	gain := min(int64(1000), est*4+150)
	return Lag{Gain: gain, Quota: 3 * gain, Max: 7 * gain}
}

// Compensate records the lag of one move (interval minus think, in ms) and
// returns the refund.
func (l *Lag) Compensate(lagMs int64) int64 {
	refund := min(max(lagMs, 0), l.Quota)
	l.Quota = min(l.Quota+l.Gain-refund, l.Max)
	return refund
}
