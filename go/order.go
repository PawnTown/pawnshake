package pawnshake

// Order returns every record of the chain in the canonical order (spec
// "Applying records"): a record comes after its own previous record and after
// the records it had seen; of the ready ones a server record goes first, then
// moves, then END, then everything else, White before Black.
func (c *Chain) Order() []Sealed {
	var out []Sealed
	next := [3]uint32{1, 1, 1}
	placed := func(s Signer, seq uint32) bool { return seq < next[s] }
	ready := func(r Sealed) bool {
		if r.Signer == Server {
			return placed(White, r.Seen) && placed(Black, r.SeenB)
		}
		return placed(r.Signer.Other(), r.Seen)
	}
	class := func(r Sealed) int {
		switch {
		case r.Signer == Server:
			return 0
		case IsMove(r.Op):
			return 1
		case r.Op == OpEnd:
			return 2
		}
		return 3
	}
	for {
		var best *Sealed
		for _, s := range []Signer{Server, White, Black} {
			r, ok := c.Get(s, next[s])
			if !ok || !ready(r) {
				continue
			}
			if best == nil || class(r) < class(*best) {
				best = &r
			}
		}
		if best == nil {
			return out
		}
		out = append(out, *best)
		next[best.Signer]++
	}
}
