// Package movecode is the Pawnshake move code: a move on the wire is one byte,
// its index in the canonical order of the legal moves of the position it is
// played in (spec/PAWNSHAKE.md, "Move code").
//
// Every port (Go, TS, Dart, Rust) must produce the same order, so it is
// defined on the UCI string alone and never on an engine's generation order:
//
//	key    = from*320 + to*5 + promo
//	square = rank*8 + file (a1 = 0, h1 = 7, a8 = 56, h8 = 63)
//	promo  = none 0, n 1, b 2, r 3, q 4
//
// Castling is the king's move (e1g1), en passant the pawn's (e5d6). No
// position has more than 218 legal moves, so a code always fits in a byte.
// The conformance vectors are in vectors/movecode.json.
package movecode

import (
	"errors"
	"regexp"
	"slices"
	"strings"

	"github.com/corentings/chess/v2"
)

// MaxCode is the highest code a legal move can have (218 moves, 0-based).
const MaxCode = 217

var (
	// ErrMalformed is a string that is not a UCI move at all.
	ErrMalformed = errors.New("movecode: malformed move")
	// ErrIllegal is a well-formed move that is not legal in the position.
	ErrIllegal = errors.New("movecode: illegal move")
	// ErrOutOfRange is a code that is not below the number of legal moves.
	ErrOutOfRange = errors.New("movecode: code out of range")
)

// uciRe is checked before anything else: some decoders only validate the
// origin square and would read "e2eT" as e2e4.
var uciRe = regexp.MustCompile(`^[a-h][1-8][a-h][1-8][qrbn]?$`)

// Key is the sort key of a well-formed UCI move.
func Key(uci string) int {
	sq := func(s string) int { return int(s[1]-'1')*8 + int(s[0]-'a') }
	promo := 0
	if len(uci) == 5 {
		promo = strings.IndexByte("nbrq", uci[4]) + 1
	}
	return sq(uci[0:2])*320 + sq(uci[2:4])*5 + promo
}

func compare(a, b string) int { return Key(a) - Key(b) }

// Legal is the canonical, sorted UCI list of the position's legal moves:
// element i is the move with code i.
func Legal(pos *chess.Position) []string {
	valid := pos.ValidMoves()
	out := make([]string, 0, len(valid))
	for _, m := range valid {
		mv := m
		out = append(out, chess.UCINotation{}.Encode(pos, &mv))
	}
	slices.SortFunc(out, compare)
	return out
}

// Encode returns the code of a move and the number of legal moves of the
// position, which a Pawnshake record signs alongside it: two engines that
// disagree about the legal moves then fail the signature instead of silently
// reading the same byte as different moves.
func Encode(pos *chess.Position, uci string) (code, legal int, err error) {
	if !uciRe.MatchString(uci) {
		return 0, 0, ErrMalformed
	}
	moves := Legal(pos)
	i, ok := slices.BinarySearchFunc(moves, uci, compare)
	if !ok {
		return 0, len(moves), ErrIllegal
	}
	return i, len(moves), nil
}

// Decode returns the UCI move with the given code in the position.
func Decode(pos *chess.Position, code int) (uci string, legal int, err error) {
	moves := Legal(pos)
	if code < 0 || code >= len(moves) {
		return "", len(moves), ErrOutOfRange
	}
	return moves[code], len(moves), nil
}
