// Move codes (spec "Move code"): engine-agnostic, the caller passes the legal
// moves of the position in UCI from its own engine.
import { fail } from "./bytes.js";

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** The canonical sort key of a UCI move. */
export function moveKey(uci) {
  const sq = (s) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
  const promo = uci.length === 5 ? "nbrq".indexOf(uci[4]) + 1 : 0;
  return sq(uci.slice(0, 2)) * 320 + sq(uci.slice(2, 4)) * 5 + promo;
}

/** Sorts UCI moves into the canonical order (a new array). */
export const sortMoves = (moves) => [...moves].sort((a, b) => moveKey(a) - moveKey(b));

/** The code of a move among the legal moves; returns [code, legal]. */
export function encodeMove(legalMoves, uci) {
  if (!UCI.test(uci)) fail("malformed");
  const sorted = sortMoves(legalMoves);
  const i = sorted.indexOf(uci);
  if (i < 0) fail("illegal");
  return [i, sorted.length];
}

/** The UCI move with a code among the legal moves. */
export function decodeMove(legalMoves, code) {
  const sorted = sortMoves(legalMoves);
  if (!Number.isInteger(code) || code < 0 || code >= sorted.length) fail("out_of_range");
  return sorted[code];
}
