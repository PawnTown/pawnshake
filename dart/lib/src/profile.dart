// Rules profiles (spec "Rules profile").
import 'dart:typed_data';

import 'bytes.dart';

abstract final class ProfileKey {
  static const jMinMs = 1;
  static const jRttMult = 2;
  static const sampleWindow = 3;
  static const pauseBudgetMs = 4;
  static const pingIntervalMs = 5;
  static const rateTolerancePpm = 6;
  static const checkpointIntervalMs = 7;
  static const awayAfterMs = 8;
  static const leaveWithArbiter = 9;
  static const leaveOffline = 10;
  static const freeFirstMoves = 11;
  static const takebacks = 12;
  static const reportWaitDays = 13;
}

abstract final class Leave {
  static const cancel = 0;
  static const loss = 1;
  static const draw = 2;
}

class Profile {
  Profile(this.name, this.params);
  final String name;
  final Map<int, int> params;

  /// The encoding, keys ascending.
  Uint8List encode() {
    final keys = params.keys.toList()..sort();
    return concat([
      str(name),
      varint(keys.length),
      for (final k in keys) ...[varint(k), varint(params[k]!)],
    ]);
  }
}

Profile readProfile(Reader r) {
  final p = Profile(r.str(), {});
  final n = r.varint();
  var last = 0;
  for (var i = 0; i < n; i++) {
    final k = r.varint();
    final v = r.varint();
    if (i > 0 && k <= last) fail('profile_order');
    p.params[k] = v;
    last = k;
  }
  return p;
}

/// Decodes one profile from the start of [b]; returns (profile, length).
(Profile, int) decodeProfile(List<int> b) {
  final r = Reader(Uint8List.fromList(b));
  return (readProfile(r), r.i);
}

int _speedIndex(int initialMs, int incMs) {
  final est = initialMs + 40 * incMs;
  if (est < 180000) return 0;
  if (est < 480000) return 1;
  if (est < 1500000) return 2;
  return 3;
}

/// The profile "whitepawn/1" for one time control.
Profile whitePawnProfile(int initialMs, int incMs, bool rated) {
  final k = _speedIndex(initialMs, incMs);
  return Profile('whitepawn/1', {
    ProfileKey.jMinMs: 30,
    ProfileKey.jRttMult: 2,
    ProfileKey.sampleWindow: 16,
    ProfileKey.pauseBudgetMs: const [2000, 5000, 10000, 20000][k],
    ProfileKey.pingIntervalMs: 250,
    ProfileKey.rateTolerancePpm: 1000,
    ProfileKey.checkpointIntervalMs: 10000,
    ProfileKey.awayAfterMs: const [15000, 30000, 60000, 120000][k],
    ProfileKey.leaveWithArbiter: Leave.loss,
    ProfileKey.leaveOffline: Leave.cancel,
    ProfileKey.freeFirstMoves: 1,
    ProfileKey.takebacks: rated ? 0 : 1,
    ProfileKey.reportWaitDays: 7,
  });
}
