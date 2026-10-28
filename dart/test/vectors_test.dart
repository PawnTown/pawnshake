// The shared vectors: every byte here must match the Go reference.
import 'dart:convert';
import 'dart:typed_data';

import 'package:pawnshake/pawnshake.dart';
import 'package:test/test.dart';

import 'helpers.dart';

void main() {
  final core = load('core.json') as Map<String, dynamic>;
  final k = (core['keys'] as Map).cast<String, String>();
  final serverKeys = {1: hex(k['server_pk']!)};
  final now = int.parse(k['now']!);
  List<Uint8List?> keys() => [hex(k['white_pk']!), hex(k['black_pk']!), hex(k['server_pk']!)];
  MoveInfo info(Map rv) => (_) => ((rv['ply'] ?? 0) as int, (rv['legal'] ?? 0) as int);

  test('derives the keys', () {
    for (final who in ['server', 'white', 'black']) {
      expect(toHex(publicOf(hex(k['${who}_seed']!))), k['${who}_pk']);
    }
  });

  test('encodes varints', () {
    for (final v in core['varint']['valid'] as List) {
      expect(toHex(varint(v['value'] as int)), v['hex']);
      expect(readVarint(hex(v['hex'] as String)), (v['value'], (v['hex'] as String).length ~/ 2));
    }
    for (final h in core['varint']['invalid'] as List) {
      expect(code(() => readVarint(hex(h as String))), 'varint');
    }
  });

  test('issues the same certificate', () {
    final v = core['cert'];
    final c = issueCert(hex(k['server_seed']!), v['key_id'], v['user_id'], hex(v['device_pk']), v['issued'], v['expires']);
    expect(toHex(c.encode()), v['hex']);
    final (d, n) = decodeCert(hex(v['hex']));
    expect(n, (v['hex'] as String).length ~/ 2);
    expect(d.userId, 'user:white');
  });

  test('encodes the whitepawn/1 profile', () {
    final v = core['profile'];
    expect(toHex(whitePawnProfile(v['initial_ms'], v['increment_ms'], v['rated']).encode()), v['hex']);
    expect(decodeProfile(hex(v['hex'])).$1.params[ProfileKey.takebacks], 0);
  });

  test('verifies the genesis', () {
    final v = core['genesis'];
    final g = newGenesis(hex(v['challenge']), hex(v['accept']), hex(v['start']), serverKeys, now);
    expect(toHex(g.hash), v['hash']);
    expect(toHex(g.gameId), v['game_id']);
    expect(g.challengerIsWhite, v['challenger_is_white']);
    expect(toHex(g.white), v['white_pk']);
    expect(toHex(g.black), v['black_pk']);
  });

  test('rebuilds every record of the chain', () {
    final ch = core['chain'];
    final c = Chain(hex(ch['genesis_hash']), keys());
    for (final rv in ch['records'] as List) {
      final r = decodeWire(rv['signer'], hex(rv['wire']));
      expect(toHex(wire(r)), rv['wire']);
      final (sealed, _) = c.add(r, info(rv));
      expect(toHex(sealed.bodyHash), rv['body_hash']);
      expect(toHex(sealed.id), rv['id']);
      expect(toHex(headOf(sealed).encode()), rv['head']);
      expect(toHex(decodeHead(hex(rv['head'])).encode()), rv['head']);
    }
  });

  test('signs the same receipt', () {
    final v = core['receipt'];
    final recs = core['chain']['records'] as List;
    final rc = Receipt(
        keyId: 1,
        genesis: hex(core['chain']['genesis_hash']),
        whiteSeq: 2,
        whiteId: hex(recs[3]['id']),
        blackSeq: 2,
        blackId: hex(recs[2]['id']),
        stateHash: Uint8List(32),
        stateVerified: false,
        serverMs: v['server_ms'],
        anchorNo: v['anchor_no'],
        prevReceipt: Uint8List(32)..[0] = 7);
    expect(toHex(rc.signWith(hex(k['server_seed']!))), v['hex']);
    expect(toHex(rc.hash), v['hash']);
    final d = decodeReceipt(hex(v['hex']));
    expect(d.serverMs, v['server_ms']);
    d.verifyWith(serverKeys);
  });

  test('puts records in the canonical order', () {
    final c = Chain(hex(core['chain']['genesis_hash']), keys());
    final pending = [for (final rv in core['order']['records'] as List) (rv as Map, decodeWire(rv['signer'], hex(rv['wire'])))];
    while (pending.isNotEmpty) {
      final i = pending.indexWhere((p) {
        try {
          c.links(p.$2);
          return p.$2.seq == c.len(p.$2.signer) + 1;
        } on PawnshakeError {
          return false;
        }
      });
      final (rv, r) = pending.removeAt(i);
      c.add(r, info(rv));
    }
    expect([
      for (final r in c.order()) [r.signer, r.seq]
    ], core['order']['canonical']);
  });

  test('sorts every movecode.json list like the Go reference', () {
    for (final p in load('movecode.json')['positions'] as List) {
      final legal = (p['legal'] as List).cast<String>();
      expect(sortMoves(legal.reversed), legal);
    }
  });

  test('accepts all 196 ZIP-215 cases', () {
    final z = load('zip215.json');
    final msg = utf8.encode(z['message'] as String);
    final cases = z['cases'] as List;
    expect(cases, hasLength(196));
    for (final c in cases) {
      expect(verify(hex(c['vk']), msg, hex(c['sig'])), isTrue, reason: '${c['vk']}');
    }
  });
}
