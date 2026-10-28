// Records: header and body, the wire format (spec "Records").
import { type ByteSource, type Bytes, Reader, concat, enc, fail, readVarint, sha256, u32, varint } from "./bytes.js";
import { TAG } from "./cert.js";
import { SIG_SIZE, sign, verify } from "./sig.js";

export const WHITE = 0;
export const BLACK = 1;
export const SERVER = 2;
export type Signer = typeof WHITE | typeof BLACK | typeof SERVER;
export type Player = typeof WHITE | typeof BLACK;
export const other = (s: Player): Player => (1 - s) as Player;

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
} as const;

export const isMove = (op: number): boolean => op <= OP.maxMove;
export const HEADER_SIZE = 77;

/**
 * One record. `seen` is the opponent's highest applied seq; a server record
 * uses `seen` for White and `seenB` for Black. `ply` and `legal` are only for
 * moves and never travel: the verifier fills them from its position.
 */
export interface PsRecord {
  signer: Signer;
  seq: number;
  seen: number;
  seenB?: number;
  at: number;
  op: number;
  args: Bytes;
  ply?: number;
  legal?: number;
  sig?: Bytes;
}
export interface Links {
  prev: Bytes;
  seenHash: Bytes;
  seenHashB?: Bytes;
}
export interface Sealed extends PsRecord {
  bodyHash: Bytes;
  id: Bytes;
}
export interface Signed extends Sealed {
  sig: Bytes;
}

function varintsExactly(b: Bytes, count: number): boolean {
  let i = 0;
  for (let k = 0; k < count; k++) i += readVarint(b, i)[1];
  return i === b.length;
}

/** Whether an op is allowed for the signer with these arguments. */
export function argsValid(signer: Signer, op: number, args: Bytes): boolean {
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

/** The record body for the given links. */
export function body(r: PsRecord, l: Links): Bytes {
  const parts: ByteSource[] = [l.prev, u32(r.seen), l.seenHash];
  if (r.signer === SERVER) parts.push(u32(r.seenB ?? 0), l.seenHashB ?? new Uint8Array(32));
  parts.push(u32(r.at), [r.op], r.args);
  if (isMove(r.op) && r.signer !== SERVER) {
    const ply = r.ply ?? 0;
    parts.push([ply >> 8, ply & 255, r.legal ?? 0]);
  }
  return concat(...parts);
}

/** The signed part of a record. */
export const header = (genesis: Bytes, signer: Signer, seq: number, bodyHash: Bytes): Bytes =>
  concat(enc.encode(TAG.record), genesis, [signer], u32(seq), bodyHash);

/** Adds bodyHash and id (SHA-256 of the header) to a record. */
export function seal(genesis: Bytes, r: PsRecord, l: Links): Sealed {
  const bodyHash = sha256(body(r, l));
  return { ...r, bodyHash, id: sha256(header(genesis, r.signer, r.seq, bodyHash)) };
}

export const signSealed = (genesis: Bytes, s: Sealed, seed: Bytes): Signed => ({
  ...s,
  sig: sign(seed, header(genesis, s.signer, s.seq, s.bodyHash)),
});

export const verifySealed = (genesis: Bytes, s: Sealed, pub: Bytes): boolean =>
  verify(pub, header(genesis, s.signer, s.seq, s.bodyHash), s.sig ?? new Uint8Array());

/** The record as it travels; the signer is not sent. */
export function wire(r: PsRecord): Bytes {
  const parts: ByteSource[] = [varint(r.seq), varint(r.seen)];
  if (r.signer === SERVER) parts.push(varint(r.seenB ?? 0));
  parts.push(varint(r.at), [r.op], r.args, r.sig ?? new Uint8Array());
  return concat(...parts);
}

function u32v(v: number): number {
  if (v > 0xffffffff) fail("bad_value");
  return v;
}

/** Decodes a wire record of the given signer; its arguments are checked against its op. */
export function decodeWire(signer: number, b: Bytes): PsRecord & { sig: Bytes } {
  if (signer !== WHITE && signer !== BLACK && signer !== SERVER) fail("signer");
  if (b.length < SIG_SIZE + 4) fail("no_slots");
  const r = new Reader(b.subarray(0, b.length - SIG_SIZE));
  const seq = u32v(r.varint());
  const seen = u32v(r.varint());
  const seenB = signer === SERVER ? u32v(r.varint()) : undefined;
  const at = u32v(r.varint());
  const op = r.u8();
  const rec: PsRecord & { sig: Bytes } = {
    signer,
    seq,
    seen,
    at,
    op,
    args: Uint8Array.from(r.take(r.rest())),
    sig: Uint8Array.from(b.subarray(b.length - SIG_SIZE)),
  };
  if (seenB !== undefined) rec.seenB = seenB;
  if (rec.seq === 0 || !argsValid(signer, rec.op, rec.args)) fail("op");
  return rec;
}
