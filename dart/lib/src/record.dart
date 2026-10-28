// Records: header and body, the wire format (spec "Records").
import 'dart:convert';
import 'dart:typed_data';

import 'bytes.dart';
import 'cert.dart';
import 'ed25519.dart';

const white = 0;
const black = 1;
const server = 2;
int other(int s) => 1 - s;

abstract final class Op {
  static const maxMove = 217;
  static const resign = 218;
  static const drawOffer = 219;
  static const drawAccept = 220;
  static const drawDecline = 221;
  static const takebackOffer = 222;
  static const takebackAccept = 223;
  static const takebackDecline = 224;
  static const abort = 225;
  static const flagged = 226;
  static const flagClaim = 227;
  static const end = 229;
  static const ack = 230;
  static const dispute = 231;
  static const resume = 232;
  static const cancel = 233;
  static const verdictFlag = 240;
  static const verdictAbandon = 241;
  static const verdictResult = 242;
}

bool isMove(int op) => op <= Op.maxMove;
const headerSize = 77;

/// One record. [seen] is the opponent's highest applied seq; a server record
/// uses [seen] for White and [seenB] for Black. [ply] and [legal] are only for
/// moves and never travel: the verifier fills them from its position.
class PsRecord {
  PsRecord(
      {required this.signer,
      required this.seq,
      required this.seen,
      this.seenB = 0,
      required this.at,
      required this.op,
      Uint8List? args,
      this.ply = 0,
      this.legal = 0,
      this.sig})
      : args = args ?? Uint8List(0);
  final int signer, seq, seen, seenB, at, op;
  final Uint8List args;
  final int ply, legal;
  final Uint8List? sig;

  PsRecord copyWith({int? ply, int? legal, Uint8List? sig}) => PsRecord(
      signer: signer, seq: seq, seen: seen, seenB: seenB, at: at, op: op, args: args, ply: ply ?? this.ply, legal: legal ?? this.legal, sig: sig ?? this.sig);
}

class Links {
  Links(this.prev, this.seenHash, [Uint8List? seenHashB]) : seenHashB = seenHashB ?? Uint8List(32);
  final Uint8List prev, seenHash, seenHashB;
}

/// A record with its body hash and id (SHA-256 of the header).
class Sealed {
  Sealed(this.record, this.bodyHash, this.id);
  final PsRecord record;
  final Uint8List bodyHash, id;
  int get signer => record.signer;
  int get seq => record.seq;
  int get op => record.op;
}

bool _varintsExactly(List<int> b, int count) {
  var i = 0;
  for (var k = 0; k < count; k++) {
    i += readVarint(b, i).$2;
  }
  return i == b.length;
}

/// Whether an op is allowed for the signer with these arguments.
bool argsValid(int signer, int op, List<int> args) {
  final player = signer != server;
  try {
    if (isMove(op) || (op >= Op.resign && op <= Op.flagClaim) || op == Op.ack || op == Op.resume) return player && args.isEmpty;
    if (op == Op.end) return player && args.length == 2;
    if (op == Op.dispute) return player && args.length >= 2 && _varintsExactly(args.sublist(1), 1);
    if (op == Op.cancel) return player && args.length == 1 && (args[0] == 1 || args[0] == 2);
    if (op == Op.verdictFlag || op == Op.verdictAbandon) return !player && args.length == 1 && (args[0] == 1 || args[0] == 2);
    if (op == Op.verdictResult) return !player && args.length >= 4 && _varintsExactly(args.sublist(2), 2);
  } on PawnshakeError {
    return false;
  }
  return false;
}

/// The record body for the given links.
Uint8List body(PsRecord r, Links l) => concat([
      l.prev,
      u32(r.seen),
      l.seenHash,
      if (r.signer == server) ...[u32(r.seenB), l.seenHashB],
      u32(r.at),
      [r.op],
      r.args,
      if (isMove(r.op) && r.signer != server) [r.ply >> 8, r.ply & 255, r.legal],
    ]);

/// The signed part of a record.
Uint8List header(List<int> genesis, int signer, int seq, List<int> bodyHash) => concat([
      ascii.encode(Tag.record),
      genesis,
      [signer],
      u32(seq),
      bodyHash
    ]);

Sealed seal(List<int> genesis, PsRecord r, Links l) {
  final bh = sha256(body(r, l));
  return Sealed(r, bh, sha256(header(genesis, r.signer, r.seq, bh)));
}

Sealed signSealed(List<int> genesis, Sealed s, List<int> seed) =>
    Sealed(s.record.copyWith(sig: sign(seed, header(genesis, s.signer, s.seq, s.bodyHash))), s.bodyHash, s.id);

bool verifySealed(List<int> genesis, Sealed s, List<int> pub) => verify(pub, header(genesis, s.signer, s.seq, s.bodyHash), s.record.sig ?? Uint8List(0));

/// The record as it travels; the signer is not sent.
Uint8List wire(PsRecord r) => concat([
      varint(r.seq),
      varint(r.seen),
      if (r.signer == server) varint(r.seenB),
      varint(r.at),
      [r.op],
      r.args,
      r.sig ?? Uint8List(0),
    ]);

int _u32v(int v) => v > 0xffffffff ? fail('bad_value') : v;

/// Decodes a wire record of the given signer; its arguments are checked against its op.
PsRecord decodeWire(int signer, List<int> b) {
  if (signer < 0 || signer > server) fail('signer');
  if (b.length < sigSize + 4) fail('no_slots');
  final r = Reader(Uint8List.fromList(b.sublist(0, b.length - sigSize)));
  final seq = _u32v(r.varint());
  final seen = _u32v(r.varint());
  final seenB = signer == server ? _u32v(r.varint()) : 0;
  final at = _u32v(r.varint());
  final op = r.u8();
  final rec = PsRecord(
      signer: signer,
      seq: seq,
      seen: seen,
      seenB: seenB,
      at: at,
      op: op,
      args: Uint8List.fromList(r.take(r.rest)),
      sig: Uint8List.fromList(b.sublist(b.length - sigSize)));
  if (rec.seq == 0 || !argsValid(signer, rec.op, rec.args)) fail('op');
  return rec;
}
