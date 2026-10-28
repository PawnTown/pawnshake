// Anchor heads and receipts (spec "Anchors").
import { type Bytes, Reader, concat, enc, fail, sha256, u32, u64, varint } from "./bytes.js";
import { type ServerKeys, TAG } from "./cert.js";
import { SERVER, type Sealed, type Signer, header } from "./record.js";
import { SIG_SIZE, sign, verify } from "./sig.js";

/** What an anchor carries: a record's signed header without the body. */
export interface Head {
  signer: Signer;
  seq: number;
  bodyHash: Bytes;
  sig: Bytes;
}

export const headOf = (s: Sealed & { sig: Bytes }): Head => ({ signer: s.signer, seq: s.seq, bodyHash: s.bodyHash, sig: s.sig });
export const encodeHead = (h: Head): Bytes => concat([h.signer], varint(h.seq), h.bodyHash, h.sig);

export function decodeHead(b: Bytes): Head {
  const r = new Reader(b);
  const signer = r.u8();
  const h = { signer: signer as Signer, seq: r.varint(), bodyHash: r.take(32), sig: r.take(SIG_SIZE) };
  r.done();
  if (signer > SERVER || h.seq === 0 || h.seq > 0xffffffff) fail("bad_value");
  return h;
}
export const headId = (genesis: Bytes, h: Head): Bytes => sha256(header(genesis, h.signer, h.seq, h.bodyHash));
export const verifyHead = (genesis: Bytes, h: Head, pub: Bytes): boolean =>
  verify(pub, header(genesis, h.signer, h.seq, h.bodyHash), h.sig);

export const RECEIPT_SIZE = 254;

/** The server's signed statement that it held these heads at serverMs. */
export interface Receipt {
  keyId: number;
  genesis: Bytes;
  whiteSeq: number;
  whiteId: Bytes;
  blackSeq: number;
  blackId: Bytes;
  stateHash: Bytes;
  stateVerified: boolean;
  serverMs: number;
  anchorNo: number;
  prevReceipt: Bytes;
  sig?: Bytes;
}

const receiptSigned = (r: Receipt): Bytes =>
  concat(
    enc.encode(TAG.receipt),
    [r.keyId],
    r.genesis,
    u32(r.whiteSeq),
    r.whiteId,
    u32(r.blackSeq),
    r.blackId,
    r.stateHash,
    [r.stateVerified ? 1 : 0],
    u64(r.serverMs),
    u32(r.anchorNo),
    r.prevReceipt,
  );

/** Signs a receipt (sets r.sig); returns its bytes. */
export function signReceipt(r: Receipt, serverSeed: Bytes): Bytes {
  r.sig = sign(serverSeed, receiptSigned(r));
  return concat(receiptSigned(r), r.sig);
}
export const receiptHash = (r: Receipt): Bytes => sha256(concat(receiptSigned(r), r.sig ?? new Uint8Array()));

export function decodeReceipt(b: Bytes): Receipt & { sig: Bytes } {
  const r = new Reader(b);
  r.tag(TAG.receipt);
  const keyId = r.u8();
  const genesis = r.take(32);
  const whiteSeq = r.u32();
  const whiteId = r.take(32);
  const blackSeq = r.u32();
  const blackId = r.take(32);
  const stateHash = r.take(32);
  const v = r.u8();
  if (v > 1) fail("bad_value");
  const rc = { keyId, genesis, whiteSeq, whiteId, blackSeq, blackId, stateHash, stateVerified: v === 1, serverMs: r.u64(), anchorNo: r.u32(), prevReceipt: r.take(32), sig: r.take(SIG_SIZE) };
  r.done();
  return rc;
}

/** Throws unless a pinned server key signed the receipt. */
export function verifyReceipt(rc: Receipt, serverKeys: ServerKeys): void {
  const pub = serverKeys[rc.keyId];
  if (!pub) fail("unknown_key");
  if (!verify(pub, receiptSigned(rc), rc.sig ?? new Uint8Array())) fail("signature");
}
