// Rules profiles (spec "Rules profile").
import { Reader, concat, fail, str, varint } from "./bytes.js";

export const KEY = {
  jMinMs: 1,
  jRttMult: 2,
  sampleWindow: 3,
  pauseBudgetMs: 4,
  pingIntervalMs: 5,
  rateTolerancePpm: 6,
  checkpointIntervalMs: 7,
  awayAfterMs: 8,
  leaveWithArbiter: 9,
  leaveOffline: 10,
  freeFirstMoves: 11,
  takebacks: 12,
  reportWaitDays: 13,
};
export const LEAVE = { cancel: 0, loss: 1, draw: 2 };

/** @param {{name: string, params: Map<number, number>}} p */
export function encodeProfile(p) {
  const keys = [...p.params.keys()].sort((a, b) => a - b);
  const parts = [str(p.name), varint(keys.length)];
  for (const k of keys) parts.push(varint(k), varint(p.params.get(k)));
  return concat(...parts);
}

export function readProfile(r) {
  const p = { name: r.str(), params: new Map() };
  const n = r.varint();
  let last = 0;
  for (let i = 0; i < n; i++) {
    const k = r.varint();
    const v = r.varint();
    if (i > 0 && k <= last) fail("profile_order");
    p.params.set(k, v);
    last = k;
  }
  return p;
}

export function decodeProfile(b) {
  const r = new Reader(b);
  return [readProfile(r), r.i];
}

function speedIndex(initialMs, incMs) {
  const est = initialMs + 40 * incMs;
  if (est < 180_000) return 0;
  if (est < 480_000) return 1;
  if (est < 1_500_000) return 2;
  return 3;
}

/** The profile "whitepawn/1" for one time control. */
export function whitePawnProfile(initialMs, incMs, rated) {
  const k = speedIndex(initialMs, incMs);
  return {
    name: "whitepawn/1",
    params: new Map([
      [KEY.jMinMs, 30],
      [KEY.jRttMult, 2],
      [KEY.sampleWindow, 16],
      [KEY.pauseBudgetMs, [2000, 5000, 10000, 20000][k]],
      [KEY.pingIntervalMs, 250],
      [KEY.rateTolerancePpm, 1000],
      [KEY.checkpointIntervalMs, 10000],
      [KEY.awayAfterMs, [15000, 30000, 60000, 120000][k]],
      [KEY.leaveWithArbiter, LEAVE.loss],
      [KEY.leaveOffline, LEAVE.cancel],
      [KEY.freeFirstMoves, 1],
      [KEY.takebacks, rated ? 0 : 1],
      [KEY.reportWaitDays, 7],
    ]),
  };
}
