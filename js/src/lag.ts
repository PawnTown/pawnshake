// The lag quota of anchored games (spec "Lag quota").
export interface Lag {
  gain: number;
  quota: number;
  max: number;
}

export function newLag(initialMs: number, incMs: number): Lag {
  const est = Math.floor((initialMs + 40 * incMs) / 1000);
  const gain = Math.min(1000, est * 4 + 150);
  return { gain, quota: 3 * gain, max: 7 * gain };
}

/** Records the lag of one move (interval minus think, ms) and returns the refund. */
export function compensate(l: Lag, lagMs: number): number {
  const refund = Math.min(Math.max(lagMs, 0), l.quota);
  l.quota = Math.min(l.quota + l.gain - refund, l.max);
  return refund;
}
