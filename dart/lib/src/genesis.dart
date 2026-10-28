// The genesis handshake: CHALLENGE, ACCEPT, START (spec "Genesis").
import 'dart:convert';
import 'dart:typed_data';

import 'bytes.dart';
import 'cert.dart';
import 'ed25519.dart';
import 'profile.dart';

abstract final class Arbiter {
  static const none = 0;
  static const checkpoints = 1;
  static const full = 2;
}

abstract final class ColorChoice {
  static const random = 0;
  static const white = 1;
  static const black = 2;
}

/// The commitment to a 16-byte nonce.
Uint8List commit(List<int> nonce) => sha256(nonce);

class Challenge {
  Challenge(
      {required this.cert,
      required this.initialMs,
      required this.incrementMs,
      required this.rated,
      required this.arbiter,
      required this.color,
      required this.profile,
      required this.commit,
      this.sig});
  final Cert cert;
  final int initialMs, incrementMs;
  final bool rated;
  final int arbiter, color;
  final Profile profile;
  final Uint8List commit;
  Uint8List? sig;

  Uint8List _signed() => concat([
        ascii.encode(Tag.challenge),
        cert.encode(),
        u32(initialMs),
        u32(incrementMs),
        [rated ? 1 : 0, arbiter, color],
        profile.encode(),
        commit,
      ]);

  /// Signs with the challenger's device seed; returns the message bytes.
  Uint8List signWith(List<int> seed) {
    final m = _signed();
    sig = sign(seed, m);
    return concat([m, sig!]);
  }
}

class Accept {
  Accept({required this.challengeHash, required this.cert, required this.nonceB, this.sig});
  final Uint8List challengeHash;
  final Cert cert;
  final Uint8List nonceB;
  Uint8List? sig;

  Uint8List signWith(List<int> seed) {
    final m = concat([ascii.encode(Tag.accept), challengeHash, cert.encode(), nonceB]);
    sig = sign(seed, m);
    return concat([m, sig!]);
  }
}

class Start {
  Start({required this.acceptHash, required this.nonceA, this.sig});
  final Uint8List acceptHash;
  final Uint8List nonceA;
  Uint8List? sig;

  Uint8List signWith(List<int> seed) {
    final m = concat([ascii.encode(Tag.start), acceptHash, nonceA]);
    sig = sign(seed, m);
    return concat([m, sig!]);
  }
}

Challenge decodeChallenge(List<int> b) {
  final r = Reader(Uint8List.fromList(b));
  r.tag(Tag.challenge);
  final cert = readCert(r);
  final initialMs = r.u32();
  final incrementMs = r.u32();
  final rated = r.u8(), arbiter = r.u8(), color = r.u8();
  if (rated > 1 || arbiter > 2 || color > 2) fail('bad_value');
  final c = Challenge(
      cert: cert,
      initialMs: initialMs,
      incrementMs: incrementMs,
      rated: rated == 1,
      arbiter: arbiter,
      color: color,
      profile: readProfile(r),
      commit: r.take(32),
      sig: r.take(sigSize));
  r.done();
  return c;
}

Accept decodeAccept(List<int> b) {
  final r = Reader(Uint8List.fromList(b));
  r.tag(Tag.accept);
  final a = Accept(challengeHash: r.take(32), cert: readCert(r), nonceB: r.take(16), sig: r.take(sigSize));
  r.done();
  return a;
}

Start decodeStart(List<int> b) {
  final r = Reader(Uint8List.fromList(b));
  r.tag(Tag.start);
  final s = Start(acceptHash: r.take(32), nonceA: r.take(16), sig: r.take(sigSize));
  r.done();
  return s;
}

void _checkSig(List<int> pub, List<int> raw, List<int> sig) {
  if (!verify(pub, raw.sublist(0, raw.length - sigSize), sig)) fail('signature');
}

/// Decodes a CHALLENGE and checks its certificate and signature.
Challenge verifyChallenge(List<int> raw, ServerKeys serverKeys, int now) {
  final c = decodeChallenge(raw);
  c.cert.verify(serverKeys, now);
  _checkSig(c.cert.devicePk, raw, c.sig!);
  return c;
}

/// Decodes an ACCEPT for the given CHALLENGE bytes and checks it.
Accept verifyAccept(List<int> raw, List<int> challenge, ServerKeys serverKeys, int now) {
  final a = decodeAccept(raw);
  if (!equal(a.challengeHash, sha256(challenge))) fail('link');
  a.cert.verify(serverKeys, now);
  _checkSig(a.cert.devicePk, raw, a.sig!);
  return a;
}

class Genesis {
  Genesis._(this.challenge, this.accept, this.start, this.raw, this.hash, this.challengerIsWhite);
  final Challenge challenge;
  final Accept accept;
  final Start start;
  final List<Uint8List> raw;
  final Uint8List hash;
  final bool challengerIsWhite;

  Uint8List get gameId => Uint8List.sublistView(hash, 0, 16);
  Uint8List get white => challengerIsWhite ? challenge.cert.devicePk : accept.cert.devicePk;
  Uint8List get black => challengerIsWhite ? accept.cert.devicePk : challenge.cert.devicePk;
}

/// Verifies all three messages and links them.
Genesis newGenesis(List<int> challenge, List<int> accept, List<int> start, ServerKeys serverKeys, int now) {
  final c = verifyChallenge(challenge, serverKeys, now);
  final a = verifyAccept(accept, challenge, serverKeys, now);
  final s = decodeStart(start);
  if (!equal(s.acceptHash, sha256(accept))) fail('link');
  if (!equal(commit(s.nonceA), c.commit)) fail('commit');
  _checkSig(c.cert.devicePk, start, s.sig!);
  var challengerIsWhite = c.color == ColorChoice.white;
  if (c.color == ColorChoice.random) challengerIsWhite = sha256(concat([s.nonceA, a.nonceB]))[0] % 2 == 0;
  final raws = [Uint8List.fromList(challenge), Uint8List.fromList(accept), Uint8List.fromList(start)];
  return Genesis._(c, a, s, raws, sha256(concat(raws)), challengerIsWhite);
}
