// Every branch, mirroring the Go and TypeScript tests.
import 'dart:typed_data';

import 'package:pawnshake/pawnshake.dart';
import 'package:pawnshake/src/genesis.dart' as gen;
import 'package:test/test.dart';

import 'helpers.dart';

void main() {
  final k = (load('core.json')['keys'] as Map).cast<String, String>();
  final serverSeed = hex(k['server_seed']!);
  final whiteSeed = hex(k['white_seed']!);
  final blackSeed = hex(k['black_seed']!);
  final keys = {1: publicOf(serverSeed)};
  const now = 1800000000;
  Cert cert(String user, List<int> seed) => issueCert(serverSeed, 1, user, publicOf(seed), now - 100, now + 100);
  final none = Uint8List(0);
  MoveInfo ply(int p, int l) => (_) => (p, l);

  ({Uint8List ch, Uint8List ac, Uint8List st, Genesis g}) genesis([int color = ColorChoice.random]) {
    final nonceA = b(List.generate(16, (i) => i + 1));
    final nonceB = b(List.generate(16, (i) => 16 - i));
    final c = Challenge(
        cert: cert('user:white', whiteSeed),
        initialMs: 180000,
        incrementMs: 2000,
        rated: true,
        arbiter: Arbiter.full,
        color: color,
        profile: whitePawnProfile(180000, 2000, true),
        commit: commit(nonceA));
    final ch = c.signWith(whiteSeed);
    final ac = Accept(challengeHash: sha256(ch), cert: cert('user:black', blackSeed), nonceB: nonceB).signWith(blackSeed);
    final st = Start(acceptHash: sha256(ac), nonceA: nonceA).signWith(whiteSeed);
    return (ch: ch, ac: ac, st: st, g: newGenesis(ch, ac, st, keys, now));
  }

  ({Chain c, List<Sealed> recs, Genesis g}) chain() {
    final g = genesis(ColorChoice.white).g;
    final c = Chain(g.hash, [g.white, g.black, publicOf(serverSeed)]);
    final recs = [
      c.signNext(whiteSeed, c.next(white, 1000, 13), ply(1, 20)),
      c.signNext(blackSeed, c.next(black, 74239, Op.ack)),
      c.signNext(blackSeed, c.next(black, 75439, 8), ply(2, 20)),
      c.signNext(whiteSeed, c.next(white, 2251, Op.ack)),
    ];
    return (c: c, recs: recs, g: g);
  }

  group('bytes', () {
    test('hex, varint, reader', () {
      expect(code(() => fromHex('abc')), 'bad_value');
      expect(code(() => fromHex('zz')), 'bad_value');
      expect(code(() => varint(-1)), 'bad_value');
      expect(readVarint(varint(1 << 40)), (1 << 40, 6));
      expect(code(() => readVarint(b([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01]))), 'varint');
      expect(code(() => str('x' * 256)), 'too_long');
      expect(toHex(u64((1 << 40) + 5)), '0000010000000005');
      expect(code(() => Reader(b([1])).u32()), 'short');
      expect(code(() => Reader(b([9])).done()), 'trailing');
      expect(PawnshakeError('tag').toString(), 'pawnshake: tag');
      expect(PawnshakeError('tag', 'x').toString(), 'pawnshake: tag (x)');
      expect(equal([1, 2], [1, 3]), isFalse);
      expect(equal([1], [1, 2]), isFalse);
    });
    test('signatures', () {
      final sig = sign(whiteSeed, [1]);
      final pub = publicOf(whiteSeed);
      expect(verify(pub, [1], sig), isTrue);
      expect(verify(pub, [2], sig), isFalse);
      expect(verify(pub.sublist(0, 31), [1], sig), isFalse);
      expect(verify(pub, [1], sig.sublist(0, 63)), isFalse);
      // S >= L, a public key that is not a point, R that is not a point
      expect(verify(pub, [1], Uint8List.fromList([...sig.sublist(0, 32), ...List.filled(32, 0xff)])), isFalse);
      final notPoint = b([2, ...List.filled(31, 0)]);
      expect(verify(notPoint, [1], sig), isFalse);
      expect(verify(pub, [1], Uint8List.fromList([...notPoint, ...sig.sublist(32)])), isFalse);
    });
  });

  group('certificates and profiles', () {
    test('checks certificates', () {
      final (d, _) = decodeCert(cert('user:a', whiteSeed).encode());
      d.verify(keys, now);
      expect(code(() => d.verify({}, now)), 'unknown_key');
      expect(code(() => d.verify(keys, now + 1000)), 'cert_expired');
      expect(code(() => d.verify(keys, now - 1000)), 'cert_expired');
      expect(code(() => d.withSig(flip(d.sig, 0)).verify(keys, now)), 'signature');
      expect(code(() => issueCert(serverSeed, 1, 'u', Uint8List(3), 0, 1)), 'key_size');
      expect(code(() => decodeCert('XXCERT01'.codeUnits)), 'tag');
    });
    test('profiles', () {
      final enc = whitePawnProfile(60000, 0, false).encode();
      final (p, n) = decodeProfile([...enc, 0xee]);
      expect(n, enc.length);
      expect(p.params[ProfileKey.awayAfterMs], 15000);
      expect(p.params[ProfileKey.takebacks], 1);
      expect(whitePawnProfile(600000, 0, false).params[ProfileKey.awayAfterMs], 60000);
      expect(whitePawnProfile(1800000, 0, false).params[ProfileKey.awayAfterMs], 120000);
      expect(code(() => decodeProfile([0, 2, 2, 0, 1, 0])), 'profile_order');
    });
  });

  group('genesis', () {
    test('decides colors and keys', () {
      for (final (color, isWhite) in [(ColorChoice.white, true), (ColorChoice.black, false)]) {
        final g = genesis(color).g;
        expect(g.challengerIsWhite, isWhite);
        expect(toHex(g.white), isWhite ? k['white_pk'] : k['black_pk']);
        expect(toHex(g.black), isWhite ? k['black_pk'] : k['white_pk']);
      }
      final x = genesis();
      expect(decodeChallenge(x.ch).rated, isTrue);
      expect(decodeAccept(x.ac).nonceB, hasLength(16));
      expect(decodeStart(x.st).nonceA, hasLength(16));
      final c = decodeChallenge(x.ch);
      final unrated = gen.Challenge(
          cert: c.cert,
          initialMs: c.initialMs,
          incrementMs: c.incrementMs,
          rated: false,
          arbiter: c.arbiter,
          color: c.color,
          profile: c.profile,
          commit: c.commit);
      expect(decodeChallenge(unrated.signWith(whiteSeed)).rated, isFalse);
      expect(x.g.raw, hasLength(3));
      expect(x.g.challenge.initialMs, 180000);
      expect(x.g.accept.cert.userId, 'user:black');
      expect(x.g.start.nonceA, hasLength(16));
    });
    test('rejects every broken link', () {
      final x = genesis();
      expect(code(() => decodeChallenge([...x.ch, 0])), 'trailing');
      final off = 8 + x.g.challenge.cert.encode().length + 8;
      expect(code(() => decodeChallenge(Uint8List.fromList(x.ch)..[off] = 2)), 'bad_value');
      expect(code(() => decodeAccept(x.ch)), 'tag');
      final cases = <(List<int>, List<int>, List<int>, ServerKeys, String)>[
        (x.ch.sublist(0, 5), x.ac, x.st, keys, 'short'),
        (x.ch, x.ac, x.st, {}, 'unknown_key'),
        (flip(x.ch, x.ch.length - 1), x.ac, x.st, keys, 'signature'),
        (x.ch, x.ac.sublist(0, 20), x.st, keys, 'short'),
        (x.ch, flip(x.ac, 9), x.st, keys, 'link'),
        (x.ch, flip(x.ac, x.ac.length - 1), x.st, keys, 'signature'),
        (x.ch, x.ac, x.st.sublist(0, 20), keys, 'short'),
        (x.ch, x.ac, flip(x.st, 9), keys, 'link'),
        (x.ch, x.ac, flip(x.st, 8 + 32), keys, 'commit'),
        (x.ch, x.ac, flip(x.st, x.st.length - 1), keys, 'signature'),
      ];
      for (final (a, bb, c, kk, want) in cases) {
        expect(code(() => newGenesis(a, bb, c, kk, now)), want);
      }
      expect(code(() => verifyAccept(x.ac, x.ch, keys, now + 1000)), 'cert_expired');
    });
  });

  group('records', () {
    test('validates ops and arguments', () {
      final ok = [
        (white, 13, <int>[]),
        (white, Op.resign, <int>[]),
        (black, Op.ack, <int>[]),
        (white, Op.resume, <int>[]),
        (white, Op.end, [1, 1]),
        (white, Op.dispute, [1, 5]),
        (white, Op.cancel, [2]),
        (white, Op.cancel, [1]),
        (server, Op.verdictFlag, [1]),
        (server, Op.verdictAbandon, [2]),
        (server, Op.verdictResult, [1, 1, 0, 0]),
      ];
      for (final (s, op, a) in ok) {
        expect(argsValid(s, op, a), isTrue, reason: '$s $op $a');
      }
      final bad = [
        (server, 13, <int>[]),
        (white, 13, [1]),
        (white, Op.end, <int>[]),
        (server, Op.end, [1, 1]),
        (white, Op.dispute, [1]),
        (server, Op.dispute, [1, 5]),
        (white, Op.dispute, [1, 0x80, 0]),
        (white, Op.dispute, [1, 5, 5]),
        (white, Op.cancel, [3]),
        (server, Op.cancel, [1]),
        (white, Op.cancel, <int>[]),
        (white, Op.verdictFlag, [1]),
        (server, Op.verdictFlag, [3]),
        (server, Op.verdictFlag, <int>[]),
        (white, Op.verdictResult, [1, 1, 0, 0]),
        (server, Op.verdictResult, [1, 1, 0]),
        (server, Op.verdictResult, [1, 1, 0, 0, 0]),
        (white, 228, <int>[]),
        (server, 255, <int>[]),
      ];
      for (final (s, op, a) in bad) {
        expect(argsValid(s, op, a), isFalse, reason: '$s $op $a');
      }
    });
    test('decodes wire records', () {
      final recs = chain().recs;
      for (final r in recs) {
        expect(toHex(wire(decodeWire(r.signer, wire(r.record)))), toHex(wire(r.record)));
      }
      final srv = PsRecord(signer: server, seq: 1, seen: 2, seenB: 3, at: 9, op: Op.verdictFlag, args: b([2]), sig: Uint8List(64));
      expect(decodeWire(server, wire(srv)).seenB, 3);
      final sig = Uint8List(64);
      expect(code(() => decodeWire(3, wire(srv))), 'signer');
      expect(code(() => decodeWire(-1, wire(srv))), 'signer');
      expect(code(() => decodeWire(white, Uint8List(67))), 'no_slots');
      expect(code(() => decodeWire(white, [0x80, 0, 1, 13, ...sig])), 'varint');
      expect(code(() => decodeWire(white, [0, 0, 1, 13, ...sig])), 'op');
      expect(code(() => decodeWire(white, [...varint(1 << 33), 0, 1, 13, ...sig])), 'bad_value');
      expect(code(() => decodeWire(white, [1, 0, 1, 0, 0, ...sig])), 'op');
      final bare = PsRecord(signer: server, seq: 1, seen: 0, at: 1, op: Op.verdictFlag, args: b([1]));
      expect(wire(bare), hasLength(6));
      expect(isMove(Op.resign), isFalse);
      expect(headerSize, 77);
    });
  });

  group('chain', () {
    test('adds, deduplicates and finds forks', () {
      final x = chain();
      final c = x.c, recs = x.recs, g = x.g;
      expect(c.len(white), 2);
      expect(c.get(white, 0), isNull);
      expect(c.records(black), hasLength(2));
      (int, int) info(PsRecord r) => r.signer == white ? (1, 20) : (2, 20);
      final d = Chain(g.hash, [g.white, g.black, publicOf(serverSeed)]);
      for (final r in recs) {
        expect(toHex(d.add(decodeWire(r.signer, wire(r.record)), info).$1.id), toHex(r.id));
      }
      expect(d.add(decodeWire(white, wire(recs[0].record)), info).$2, isTrue);
      final e = Chain(g.hash, [g.white, g.black, null]);
      final fork = e.signNext(whiteSeed, e.next(white, 1000, 12), ply(1, 20));
      expect(
          () => d.add(decodeWire(white, wire(fork.record)), info),
          throwsA(isA<ForkError>()
              .having((f) => f.seq, 'seq', 1)
              .having((f) => f.otherRecord.seq, 'other', 1)
              .having((f) => f.have.seq, 'have', 1)
              .having((f) => f.signer, 'signer', white)));
      PsRecord rec({int signer = white, int seq = 3, int seen = 2, int op = Op.ack, Uint8List? sig}) =>
          PsRecord(signer: signer, seq: seq, seen: seen, at: 0, op: op, args: none, sig: sig);
      expect(code(() => d.add(rec(signer: 3), info)), 'no_key');
      expect(code(() => e.add(rec(signer: server, seq: 1))), 'no_key');
      expect(code(() => d.add(rec(seq: 5, seen: 0))), 'seq_gap');
      expect(code(() => d.add(rec(seen: 9))), 'unseen');
      expect(code(() => d.add(rec(op: 5))), 'move_info');
      expect(code(() => d.add(rec(sig: Uint8List(64)))), 'signature');
      expect(code(() => d.add(rec())), 'signature');
      expect(code(() => d.signNext(whiteSeed, rec(seq: 1, seen: 0))), 'signed_seq');
      expect(code(() => d.links(rec(seq: 9))), 'seq_gap');
      final sr = d.signNext(serverSeed, d.next(server, 5, Op.verdictResult, b([1, 1, 0, 0])));
      expect([sr.record.seen, sr.record.seenB], [2, 2]);
      PsRecord srvRec(int seen, int seenB) => PsRecord(signer: server, seq: 2, seen: seen, seenB: seenB, at: 0, op: 240, args: none);
      expect(code(() => d.links(srvRec(9, 0))), 'unseen');
      expect(code(() => d.links(srvRec(1, 9))), 'unseen');
      final f = Chain(g.hash, [g.white, g.black, publicOf(serverSeed)]);
      for (final r in recs) {
        f.add(decodeWire(r.signer, wire(r.record)), info);
      }
      expect(f.add(decodeWire(server, wire(sr.record))).$2, isFalse);
    });
    test('orders concurrent records', () {
      final c = chain().c;
      c.signNext(whiteSeed, c.next(white, 3000, Op.drawOffer));
      c.signNext(blackSeed, PsRecord(signer: black, seq: 3, seen: 2, at: 76000, op: 15), ply(4, 29));
      c.signNext(whiteSeed, PsRecord(signer: white, seq: 4, seen: 2, at: 3100, op: Op.end, args: b([3, 11])));
      c.signNext(serverSeed, c.next(server, 1, Op.verdictResult, b([3, 11, 0, 0])));
      expect([for (final r in c.order().sublist(4)) r.op], [15, Op.drawOffer, Op.end, Op.verdictResult]);
      final c2 = chain().c;
      c2.signNext(serverSeed, c2.next(server, 1, Op.verdictFlag, b([1])));
      c2.signNext(whiteSeed, c2.next(white, 3000, Op.resign));
      expect(c2.order()[4].signer, server);
      final c3 = chain().c;
      c3.signNext(whiteSeed, c3.next(white, 3000, Op.resign));
      c3.signNext(blackSeed, PsRecord(signer: black, seq: 3, seen: 2, at: 1, op: Op.end, args: b([1, 2])));
      expect(c3.order()[4].op, Op.end);
    });
  });

  group('anchors', () {
    test('heads and receipts', () {
      final x = chain();
      final c = x.c, r3 = x.recs[3];
      final h = decodeHead(headOf(r3).encode());
      expect(toHex(h.id(c.genesis)), toHex(r3.id));
      expect(h.verifyWith(c.genesis, c.keys[white]!), isTrue);
      expect(h.verifyWith(c.genesis, c.keys[black]!), isFalse);
      expect(code(() => decodeHead([...h.encode(), 0])), 'trailing');
      expect(code(() => decodeHead(Uint8List.fromList(h.encode())..[0] = 3)), 'bad_value');
      Head withSeq(int seq) => Head(signer: h.signer, seq: seq, bodyHash: h.bodyHash, sig: h.sig);
      expect(code(() => decodeHead(withSeq(0).encode())), 'bad_value');
      expect(code(() => decodeHead(withSeq(1 << 33).encode())), 'bad_value');
      expect(headOf(Sealed(r3.record.copyWith(), r3.bodyHash, r3.id)).sig, hasLength(64));
      final unsignedSealed = Sealed(PsRecord(signer: white, seq: 1, seen: 0, at: 0, op: Op.ack), r3.bodyHash, r3.id);
      expect(headOf(unsignedSealed).sig, isEmpty);
      Receipt receipt({bool verified = true}) => Receipt(
          keyId: 1,
          genesis: c.genesis,
          whiteSeq: 2,
          whiteId: r3.id,
          blackSeq: 2,
          blackId: x.recs[2].id,
          stateHash: Uint8List(32),
          stateVerified: verified,
          serverMs: 1 << 40,
          anchorNo: 1,
          prevReceipt: Uint8List(32));
      final rc = receipt();
      final bytes = rc.signWith(serverSeed);
      expect(bytes, hasLength(receiptSize));
      final d = decodeReceipt(bytes);
      expect(d.stateVerified, isTrue);
      d.verifyWith(keys);
      expect(code(() => d.verifyWith({})), 'unknown_key');
      final unsigned = receipt();
      expect(code(() => unsigned.verifyWith(keys)), 'signature');
      expect(unsigned.hash, hasLength(32));
      final tampered = receipt()..sig = d.sig;
      expect(code(() => receipt(verified: false).verifyWith(keys)), 'signature');
      tampered.verifyWith(keys);
      final bad = Uint8List.fromList(bytes)..[8 + 1 + 32 + 4 + 32 + 4 + 32 + 32] = 2;
      expect(code(() => decodeReceipt(bad)), 'bad_value');
      expect(code(() => decodeReceipt(bytes.sublist(0, 30))), 'short');
    });
  });

  group('move codes and lag', () {
    test('encodes and decodes', () {
      final legal = ['h2h4', 'e2e4', 'b1a3', 'b7b8q', 'b7b8n'];
      expect(encodeMove(legal, 'e2e4'), (1, 5));
      expect(decodeMove(legal, 0), 'b1a3');
      expect(moveKey('b7b8n') < moveKey('b7b8q'), isTrue);
      expect(code(() => encodeMove(legal, 'zz')), 'malformed');
      expect(code(() => encodeMove(legal, 'a2a3')), 'illegal');
      expect(code(() => decodeMove(legal, 5)), 'out_of_range');
      expect(code(() => decodeMove(legal, -1)), 'out_of_range');
    });
    test('compensates lag from a bounded quota', () {
      final l = Lag.forTimeControl(60000, 0);
      expect([l.gain, l.quota, l.max], [390, 1170, 2730]);
      var total = 0;
      for (var i = 0; i < 20; i++) {
        total += l.compensate(10000);
      }
      expect(total, 1170 + 19 * 390);
      expect(l.compensate(-5), 0);
      expect(Lag.forTimeControl(600000, 0).gain, 1000);
    });
  });
}
