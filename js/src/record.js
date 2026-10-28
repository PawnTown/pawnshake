// Records: header and body, the wire format (spec "Records").
import { Reader, concat, enc, fail, readVarint, sha256, u32, varint } from "./bytes.js";
import { TAG } from "./cert.js";
import { SIG_SIZE, sign, verify } from "./sig.js";

export const WHITE = 0;
export const BLACK = 1;
export const SERVER = 2;
export const other = (s) => 1 - s;

export const OP = {
  maxMove: 217,
  resign: 218,
  drawOffer: 219,
  drawAccept: 220,
  drawDecline: 221,
  takebackOffer: 222,
  takebackAccept: 223,
  takebackDecline: 224,
  abort: 225,
  flagged: 226,
  flagClaim: 227,
  end: 229,
  ack: 230,
  dispute: 231,
  resume: 232,
  cancel: 233,
  verdictFlag: 240,
  verdictAbandon: 241,
  verdictResult: 242,
};
export const isMove = (op) => op <= OP.maxMove;
export const HEADER_SIZE = 77;

function varintsExactly(b, count) {
  let i = 0;
  for (let k = 0; k < count; k++) i += readVarint(b, i)[1];
  return i === b.length;
}

/** Whether an op is allowed for the signer with these arguments. */
export function argsValid(signer, op, args) {
  const player = signer !== SERVER;
  try {
    if (isMove(op) || (op >= OP.resign && op <= OP.flagClaim) || op === OP.ack || op === OP.resume)
      return player && args.length === 0;
    if (op === OP.end) return player && args.length === 2;
    if (op === OP.dispute) return player && args.length >= 2 && varintsExactly(args.subarray(1), 1);
    if (op === OP.cancel) return player && args.length === 1 && (args[0] === 1 || args[0] === 2);
    if (op === OP.verdictFlag || op === OP.verdictAbandon)
      return !player && args.length === 1 && (args[0] === 1 || args[0] === 2);
    if (op === OP.verdictResult) return !player && args.length >= 4 && varintsExactly(args.subarray(2), 2);
  } catch {
    return false;
  }
  return false;
}

/** The body for links {prev, seenHash, seenHashB}. */
export function body(r, l) {
  const parts = [l.prev, u32(r.seen), l.seenHash];
  if (r.signer === SERVER) parts.push(u32(r.seenB), l.seenHashB);
  parts.push(u32(r.at), [r.op], r.args);
  if (isMove(r.op) && r.signer !== SERVER) parts.push([r.ply >> 8, r.ply & 255, r.legal]);
  return concat(...parts);
}

export const header = (genesis, signer, seq, bodyHash) =>
  concat(enc.encode(TAG.record), genesis, [signer], u32(seq), bodyHash);

/** Adds bodyHash and id to a record for given links. */
export function seal(genesis, r, l) {
  const bodyHash = sha256(body(r, l));
  return { ...r, bodyHash, id: sha256(header(genesis, r.signer, r.seq, bodyHash)) };
}

export const signSealed = (genesis, s, seed) => ({
  ...s,
  sig: sign(seed, header(genesis, s.signer, s.seq, s.bodyHash)),
});
export const verifySealed = (genesis, s, pub) => verify(pub, header(genesis, s.signer, s.seq, s.bodyHash), s.sig);

/** The record as it travels; the signer is not sent. */
export function wire(r) {
  const parts = [varint(r.seq), varint(r.seen)];
  if (r.signer === SERVER) parts.push(varint(r.seenB));
  parts.push(varint(r.at), [r.op], r.args, r.sig);
  return concat(...parts);
}

const u32v = (v) => {
  if (v > 0xffffffff) fail("bad_value");
  return v;
};

export function decodeWire(signer, b) {
  if (signer < 0 || signer > SERVER) fail("signer");
  if (b.length < SIG_SIZE + 4) fail("no_slots");
  const r = new Reader(b.subarray(0, b.length - SIG_SIZE));
  const rec = { signer, seq: u32v(r.varint()), seen: u32v(r.varint()) };
  if (signer === SERVER) rec.seenB = u32v(r.varint());
  rec.at = u32v(r.varint());
  rec.op = r.u8();
  rec.args = Uint8Array.from(r.take(r.rest()));
  rec.sig = Uint8Array.from(b.subarray(b.length - SIG_SIZE));
  if (rec.seq === 0 || !argsValid(signer, rec.op, rec.args)) fail("op");
  return rec;
}
