// Device certificates (spec "Identity: device certificates").
import 'dart:convert';
import 'dart:typed_data';

import 'bytes.dart';
import 'ed25519.dart';

/// Message tags (spec "Naming").
abstract final class Tag {
  static const record = 'PSREC001';
  static const challenge = 'PSCHAL01';
  static const accept = 'PSACPT01';
  static const start = 'PSSTRT01';
  static const cert = 'PSCERT01';
  static const receipt = 'PSANCH01';
}

const sigSize = 64;

/// Pinned server keys by key id.
typedef ServerKeys = Map<int, List<int>>;

class Cert {
  Cert({required this.keyId, required this.userId, required this.devicePk, required this.issued, required this.expires, required this.sig});
  final int keyId;
  final String userId;
  final Uint8List devicePk;

  /// unix seconds
  final int issued, expires;
  final Uint8List sig;

  Uint8List _signed() => concat([
        ascii.encode(Tag.cert),
        [keyId],
        str(userId),
        devicePk,
        u32(issued),
        u32(expires)
      ]);
  Uint8List encode() => concat([_signed(), sig]);

  Cert withSig(Uint8List s) => Cert(keyId: keyId, userId: userId, devicePk: devicePk, issued: issued, expires: expires, sig: s);

  /// Throws unless a pinned server key signed it and it is valid at [now] (unix s).
  void verify(ServerKeys serverKeys, int now) {
    final pub = serverKeys[keyId];
    if (pub == null) fail('unknown_key');
    if (!verifySig(pub, _signed(), sig)) fail('signature');
    if (now < issued || now > expires) fail('cert_expired');
  }
}

/// Ed25519 verification under ZIP-215 (exported name for the library).
bool verifySig(List<int> pub, List<int> msg, List<int> sig) => verify(pub, msg, sig);

Cert issueCert(List<int> serverSeed, int keyId, String userId, List<int> devicePk, int issued, int expires) {
  if (devicePk.length != 32) fail('key_size');
  final c = Cert(keyId: keyId, userId: userId, devicePk: Uint8List.fromList(devicePk), issued: issued, expires: expires, sig: Uint8List(0));
  return c.withSig(sign(serverSeed, c._signed()));
}

Cert readCert(Reader r) {
  r.tag(Tag.cert);
  final keyId = r.u8();
  final userId = r.str();
  return Cert(keyId: keyId, userId: userId, devicePk: r.take(32), issued: r.u32(), expires: r.u32(), sig: r.take(sigSize));
}

/// Decodes one certificate from the start of [b]; returns (cert, length).
(Cert, int) decodeCert(List<int> b) {
  final r = Reader(Uint8List.fromList(b));
  final c = readCert(r);
  return (c, r.i);
}
