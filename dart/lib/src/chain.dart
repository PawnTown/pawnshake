// A game's records with fork detection (spec "The one rule").
import 'dart:typed_data';

import 'bytes.dart';
import 'record.dart';

/// Returns (ply, legal) for a move record: the caller's engine knows the position.
typedef MoveInfo = (int, int) Function(PsRecord r);

class ForkError extends PawnshakeError {
  ForkError(this.signer, this.seq, this.have, this.otherRecord) : super('fork', 'signer $signer seq $seq');
  final int signer, seq;
  final Sealed have, otherRecord;
}

class Chain {
  /// [keys]: white, black, server public keys (the server's may be null).
  Chain(this.genesis, this.keys);
  final Uint8List genesis;
  final List<Uint8List?> keys;
  final List<List<Sealed>> _recs = [[], [], []];

  int len(int s) => _recs[s].length;
  Sealed? get(int s, int seq) => seq >= 1 && seq <= _recs[s].length ? _recs[s][seq - 1] : null;
  List<Sealed> records(int s) => List.of(_recs[s]);

  Uint8List _idOr(int s, int seq, bool zero) {
    if (seq == 0) return zero ? Uint8List(32) : genesis;
    final r = get(s, seq);
    if (r == null) fail('unseen');
    return r.id;
  }

  /// The links of a record against this chain.
  Links links(PsRecord r) {
    if (r.seq > len(r.signer) + 1) fail('seq_gap');
    final prev = _idOr(r.signer, r.seq - 1, false);
    if (r.signer == server) return Links(prev, _idOr(white, r.seen, true), _idOr(black, r.seenB, true));
    return Links(prev, _idOr(other(r.signer), r.seen, true));
  }

  Sealed _seal(PsRecord r, MoveInfo? info) {
    if (isMove(r.op) && r.signer != server) {
      if (info == null) fail('move_info');
      final (ply, legal) = info(r);
      r = r.copyWith(ply: ply, legal: legal);
    }
    return seal(genesis, r, links(r));
  }

  /// Verifies and appends a received record: (sealed, dup). A different
  /// record for a held seq throws [ForkError].
  (Sealed, bool) add(PsRecord r, [MoveInfo? info]) {
    final key = r.signer >= 0 && r.signer <= server ? keys[r.signer] : null;
    if (key == null) fail('no_key');
    final have = get(r.signer, r.seq);
    if (have == null && r.seq != len(r.signer) + 1) fail('seq_gap');
    final s = _seal(r, info);
    if (!verifySealed(genesis, s, key)) fail('signature');
    if (have != null) {
      if (equal(have.id, s.id)) return (have, true);
      throw ForkError(r.signer, r.seq, have, s);
    }
    _recs[r.signer].add(s);
    return (s, false);
  }

  /// A new record of signer [s] with seq and seen filled in.
  PsRecord next(int s, int at, int op, [Uint8List? args]) => s == server
      ? PsRecord(signer: s, seq: len(s) + 1, seen: len(white), seenB: len(black), at: at, op: op, args: args)
      : PsRecord(signer: s, seq: len(s) + 1, seen: len(other(s)), at: at, op: op, args: args);

  /// Signs and appends the signer's next record: never two records for one seq.
  Sealed signNext(List<int> seed, PsRecord r, [MoveInfo? info]) {
    if (r.seq != len(r.signer) + 1) fail('signed_seq');
    final s = signSealed(genesis, _seal(r, info), seed);
    _recs[r.signer].add(s);
    return s;
  }

  /// Every record in the canonical order (spec "Applying records").
  List<Sealed> order() {
    final out = <Sealed>[];
    final next = [1, 1, 1];
    bool placed(int s, int seq) => seq < next[s];
    bool ready(Sealed r) => r.signer == server ? placed(white, r.record.seen) && placed(black, r.record.seenB) : placed(other(r.signer), r.record.seen);
    int cls(Sealed r) => r.signer == server ? 0 : (isMove(r.op) ? 1 : (r.op == Op.end ? 2 : 3));
    for (;;) {
      Sealed? best;
      for (final s in const [server, white, black]) {
        final r = get(s, next[s]);
        if (r != null && ready(r) && (best == null || cls(r) < cls(best))) best = r;
      }
      if (best == null) return out;
      out.add(best);
      next[best.signer]++;
    }
  }
}
