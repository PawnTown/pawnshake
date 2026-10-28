// Move codes (spec "Move code"): engine-agnostic, the caller passes the legal
// moves of the position in UCI from its own engine.
import 'bytes.dart';

final _uci = RegExp(r'^[a-h][1-8][a-h][1-8][qrbn]?$');

/// The canonical sort key of a UCI move.
int moveKey(String uci) {
  int sq(String s) => (s.codeUnitAt(1) - 49) * 8 + (s.codeUnitAt(0) - 97);
  final promo = uci.length == 5 ? 'nbrq'.indexOf(uci[4]) + 1 : 0;
  return sq(uci.substring(0, 2)) * 320 + sq(uci.substring(2, 4)) * 5 + promo;
}

/// The legal moves in canonical order (a new list).
List<String> sortMoves(Iterable<String> moves) => moves.toList()..sort((a, b) => moveKey(a) - moveKey(b));

/// The code of a move among the legal moves: (code, legal count).
(int, int) encodeMove(Iterable<String> legalMoves, String uci) {
  if (!_uci.hasMatch(uci)) fail('malformed');
  final sorted = sortMoves(legalMoves);
  final i = sorted.indexOf(uci);
  if (i < 0) fail('illegal');
  return (i, sorted.length);
}

/// The UCI move with a code among the legal moves.
String decodeMove(Iterable<String> legalMoves, int code) {
  final sorted = sortMoves(legalMoves);
  if (code < 0 || code >= sorted.length) fail('out_of_range');
  return sorted[code];
}
