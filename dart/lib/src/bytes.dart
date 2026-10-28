// Byte helpers, the varint and the reader the decoders share.
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

/// A Pawnshake error with a stable code, the same names as the Go errors.
class PawnshakeError implements Exception {
  PawnshakeError(this.code, [this.detail]);
  final String code;
  final String? detail;
  @override
  String toString() => 'pawnshake: $code${detail == null ? '' : ' ($detail)'}';
}

Never fail(String code, [String? detail]) => throw PawnshakeError(code, detail);

Uint8List sha256(List<int> b) => Uint8List.fromList(crypto.sha256.convert(b).bytes);
Uint8List sha512(List<int> b) => Uint8List.fromList(crypto.sha512.convert(b).bytes);

Uint8List concat(List<List<int>> parts) {
  final out = BytesBuilder(copy: false);
  for (final p in parts) {
    out.add(p);
  }
  return out.toBytes();
}

String toHex(List<int> b) => b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

Uint8List fromHex(String s) {
  if (s.length.isOdd || RegExp('[^0-9a-fA-F]').hasMatch(s)) fail('bad_value', 'hex');
  return Uint8List.fromList([for (var i = 0; i < s.length; i += 2) int.parse(s.substring(i, i + 2), radix: 16)]);
}

bool equal(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

Uint8List u32(int v) => Uint8List(4)..buffer.asByteData().setUint32(0, v);
Uint8List u64(int v) => Uint8List(8)..buffer.asByteData().setUint64(0, v);

Uint8List str(String s) {
  final b = utf8.encode(s);
  if (b.length > 255) fail('too_long');
  return concat([
    [b.length],
    b,
  ]);
}

/// Unsigned LEB128.
Uint8List varint(int v) {
  if (v < 0) fail('bad_value', 'varint');
  final out = <int>[];
  do {
    var b = v & 127;
    v >>>= 7;
    if (v > 0) b |= 128;
    out.add(b);
  } while (v > 0);
  return Uint8List.fromList(out);
}

/// Reads one minimally encoded varint at [at]; returns (value, length).
(int, int) readVarint(List<int> b, [int at = 0]) {
  var v = 0;
  for (var i = at; i < b.length && i - at < 9; i++) {
    final x = b[i];
    v |= (x & 127) << (7 * (i - at));
    if (x < 128) {
      final n = i - at + 1;
      if (n > 1 && x == 0) break;
      return (v, n);
    }
  }
  fail('varint');
}

class Reader {
  Reader(this.b);
  final Uint8List b;
  int i = 0;

  Uint8List take(int n) {
    if (i + n > b.length) fail('short');
    final out = Uint8List.sublistView(b, i, i + n);
    i += n;
    return out;
  }

  int u8() => take(1)[0];
  int u32() => take(4).buffer.asByteData(b.offsetInBytes + i - 4, 4).getUint32(0);
  int u64() => take(8).buffer.asByteData(b.offsetInBytes + i - 8, 8).getUint64(0);
  int varint() {
    final (v, n) = readVarint(b, i);
    i += n;
    return v;
  }

  String str() => utf8.decode(take(u8()));
  void tag(String t) {
    if (ascii.decode(take(t.length), allowInvalid: true) != t) fail('tag');
  }

  int get rest => b.length - i;
  void done() {
    if (rest != 0) fail('trailing');
  }
}
