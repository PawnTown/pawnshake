// Anchor heads and receipts (spec "Anchors").
import 'dart:convert';
import 'dart:typed_data';

import 'bytes.dart';
import 'cert.dart';
import 'ed25519.dart';
import 'record.dart';

/// What an anchor carries: a record's signed header without the body.
class Head {
  Head({required this.signer, required this.seq, required this.bodyHash, required this.sig});
  final int signer, seq;
  final Uint8List bodyHash, sig;

  Uint8List encode() => concat([
        [signer],
        varint(seq),
        bodyHash,
        sig,
      ]);
  Uint8List id(List<int> genesis) => sha256(header(genesis, signer, seq, bodyHash));
  bool verifyWith(List<int> genesis, List<int> pub) => verify(pub, header(genesis, signer, seq, bodyHash), sig);
}

Head headOf(Sealed s) => Head(signer: s.signer, seq: s.seq, bodyHash: s.bodyHash, sig: s.record.sig ?? Uint8List(0));

Head decodeHead(List<int> b) {
  final r = Reader(Uint8List.fromList(b));
  final h = Head(signer: r.u8(), seq: r.varint(), bodyHash: r.take(32), sig: r.take(sigSize));
  r.done();
  if (h.signer > server || h.seq == 0 || h.seq > 0xffffffff) fail('bad_value');
  return h;
}

const receiptSize = 254;

/// The server's signed statement that it held these heads at [serverMs].
class Receipt {
  Receipt(
      {required this.keyId,
      required this.genesis,
      required this.whiteSeq,
      required this.whiteId,
      required this.blackSeq,
      required this.blackId,
      required this.stateHash,
      required this.stateVerified,
      required this.serverMs,
      required this.anchorNo,
      required this.prevReceipt,
      this.sig});
  final int keyId;
  final Uint8List genesis;
  final int whiteSeq;
  final Uint8List whiteId;
  final int blackSeq;
  final Uint8List blackId, stateHash;
  final bool stateVerified;
  final int serverMs, anchorNo;
  final Uint8List prevReceipt;
  Uint8List? sig;

  Uint8List _signed() => concat([
        ascii.encode(Tag.receipt),
        [keyId],
        genesis,
        u32(whiteSeq),
        whiteId,
        u32(blackSeq),
        blackId,
        stateHash,
        [stateVerified ? 1 : 0],
        u64(serverMs),
        u32(anchorNo),
        prevReceipt,
      ]);

  /// Signs with the server seed; returns the receipt bytes.
  Uint8List signWith(List<int> serverSeed) {
    sig = sign(serverSeed, _signed());
    return concat([_signed(), sig!]);
  }

  Uint8List get hash => sha256(concat([_signed(), sig ?? Uint8List(0)]));

  /// Throws unless a pinned server key signed it.
  void verifyWith(ServerKeys serverKeys) {
    final pub = serverKeys[keyId];
    if (pub == null) fail('unknown_key');
    if (!verify(pub, _signed(), sig ?? Uint8List(0))) fail('signature');
  }
}

Receipt decodeReceipt(List<int> b) {
  final r = Reader(Uint8List.fromList(b));
  r.tag(Tag.receipt);
  final keyId = r.u8();
  final genesis = r.take(32);
  final whiteSeq = r.u32();
  final whiteId = r.take(32);
  final blackSeq = r.u32();
  final blackId = r.take(32);
  final stateHash = r.take(32);
  final v = r.u8();
  if (v > 1) fail('bad_value');
  final rc = Receipt(
      keyId: keyId,
      genesis: genesis,
      whiteSeq: whiteSeq,
      whiteId: whiteId,
      blackSeq: blackSeq,
      blackId: blackId,
      stateHash: stateHash,
      stateVerified: v == 1,
      serverMs: r.u64(),
      anchorNo: r.u32(),
      prevReceipt: r.take(32),
      sig: r.take(sigSize));
  r.done();
  return rc;
}
