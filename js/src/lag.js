// The lag quota of anchored games (spec "Lag quota").
export function newLag(initialMs, incMs) {
  const est = Math.floor((initialMs + 40 * incMs) / 1000);
  const gain = Math.min(1000, est * 4 + 150);
  return { gain, quota: 3 * gain, max: 7 * gain };
}
export function compensate(l, lagMs) {
  const refund = Math.min(Math.max(lagMs, 0), l.quota);
  l.quota = Math.min(l.quota + l.gain - refund, l.max);
  return refund;
}
