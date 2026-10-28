// The lag quota of anchored games (spec "Lag quota").
import 'dart:math' as math;

class Lag {
  Lag._(this.gain, this.quota, this.max);

  /// Sizes the quota for a time control.
  factory Lag.forTimeControl(int initialMs, int incMs) {
    final est = (initialMs + 40 * incMs) ~/ 1000;
    final gain = math.min(1000, est * 4 + 150);
    return Lag._(gain, 3 * gain, 7 * gain);
  }

  final int gain, max;
  int quota;

  /// Records the lag of one move (interval minus think, ms) and returns the refund.
  int compensate(int lagMs) {
    final refund = math.min(math.max(lagMs, 0), quota);
    quota = math.min(quota + gain - refund, max);
    return refund;
  }
}
