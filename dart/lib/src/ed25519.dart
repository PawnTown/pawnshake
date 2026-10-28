// Ed25519 (RFC 8032) signing and ZIP-215 verification on BigInt. ZIP-215
// fixes exactly which signatures are valid (non-canonical point encodings
// accepted, S < L required, the cofactored equation), so every Pawnshake
// implementation agrees; no Dart package implements those rules.
import 'dart:typed_data';

import 'bytes.dart';

final BigInt _p = (BigInt.one << 255) - BigInt.from(19);
final BigInt _l = (BigInt.one << 252) + BigInt.parse('27742317777372353535851937790883648493');
final BigInt _d = (-BigInt.from(121665) * _inv(BigInt.from(121666))) % _p;
final BigInt _sqrtM1 = BigInt.two.modPow((_p - BigInt.one) >> 2, _p);
final _Point _base = _decode(fromHex('5866666666666666666666666666666666666666666666666666666666666666'))!;

BigInt _inv(BigInt x) => x.modPow(_p - BigInt.two, _p);

class _Point {
  _Point(this.x, this.y, this.z, this.t);
  final BigInt x, y, z, t;

  static final identity = _Point(BigInt.zero, BigInt.one, BigInt.one, BigInt.zero);

  _Point operator +(_Point o) {
    final a = ((y - x) * (o.y - o.x)) % _p;
    final b = ((y + x) * (o.y + o.x)) % _p;
    final c = (t * BigInt.two * _d * o.t) % _p;
    final dd = (z * BigInt.two * o.z) % _p;
    final e = b - a, f = dd - c, g = dd + c, h = b + a;
    return _Point((e * f) % _p, (g * h) % _p, (f * g) % _p, (e * h) % _p);
  }

  _Point neg() => _Point((-x) % _p, y, z, (-t) % _p);

  _Point mul(BigInt k) {
    var r = identity;
    var q = this;
    while (k > BigInt.zero) {
      if (k.isOdd) r = r + q;
      q = q + q;
      k >>= 1;
    }
    return r;
  }

  bool get isIdentity => x % _p == BigInt.zero && (y - z) % _p == BigInt.zero;

  Uint8List encode() {
    final zi = _inv(z);
    final ax = (x * zi) % _p, ay = (y * zi) % _p;
    final out = _le(ay, 32);
    if (ax.isOdd) out[31] |= 0x80;
    return out;
  }
}

Uint8List _le(BigInt v, int n) {
  final out = Uint8List(n);
  for (var i = 0; i < n; i++) {
    out[i] = (v & BigInt.from(0xff)).toInt();
    v >>= 8;
  }
  return out;
}

BigInt _fromLe(List<int> b) {
  var v = BigInt.zero;
  for (var i = b.length - 1; i >= 0; i--) {
    v = (v << 8) | BigInt.from(b[i]);
  }
  return v;
}

// ZIP-215 decoding: y may be non-canonical (>= p, reduced), the sign of x = 0
// is ignored; null when the point is not on the curve.
_Point? _decode(List<int> b) {
  final sign = b[31] >> 7;
  final yb = Uint8List.fromList(b)..[31] &= 0x7f;
  final y = _fromLe(yb) % _p;
  final y2 = (y * y) % _p;
  final u = (y2 - BigInt.one) % _p;
  final v = (_d * y2 + BigInt.one) % _p;
  final v3 = (v * v % _p) * v % _p;
  final v7 = (v3 * v3 % _p) * v % _p;
  var x = (u * v3 % _p) * (u * v7 % _p).modPow((_p - BigInt.from(5)) >> 3, _p) % _p;
  final vx2 = (v * x % _p) * x % _p;
  if (vx2 != u) {
    if (vx2 != (-u) % _p) return null;
    x = x * _sqrtM1 % _p;
  }
  if ((x.isOdd ? 1 : 0) != sign) x = (-x) % _p;
  return _Point(x, y, BigInt.one, x * y % _p);
}

BigInt _clamp(List<int> h) {
  final a = Uint8List.fromList(h.sublist(0, 32));
  a[0] &= 248;
  a[31] &= 127;
  a[31] |= 64;
  return _fromLe(a);
}

/// The public key of a 32-byte seed.
Uint8List publicOf(List<int> seed) => _base.mul(_clamp(sha512(seed))).encode();

/// Signs [msg] (deterministic, RFC 8032).
Uint8List sign(List<int> seed, List<int> msg) {
  final h = sha512(seed);
  final a = _clamp(h);
  final pub = _base.mul(a).encode();
  final r = _fromLe(sha512(concat([h.sublist(32), msg]))) % _l;
  final rEnc = _base.mul(r).encode();
  final k = _fromLe(sha512(concat([rEnc, pub, msg]))) % _l;
  final s = (r + k * a) % _l;
  return concat([rEnc, _le(s, 32)]);
}

/// ZIP-215 verification.
bool verify(List<int> pub, List<int> msg, List<int> sig) {
  if (pub.length != 32 || sig.length != 64) return false;
  final s = _fromLe(sig.sublist(32));
  if (s >= _l) return false;
  final a = _decode(pub);
  final r = _decode(sig.sublist(0, 32));
  if (a == null || r == null) return false;
  final k = _fromLe(sha512(concat([sig.sublist(0, 32), pub, msg]))) % _l;
  final check = _base.mul(s) + r.neg() + a.mul(k).neg();
  return check.mul(BigInt.from(8)).isIdentity;
}
