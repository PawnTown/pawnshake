// Anchor heads and receipts (spec "Anchors").
import { Reader, concat, enc, fail, sha256, u32, u64, varint } from "./bytes.js";
import { TAG } from "./cert.js";
import { header, SERVER } from "./record.js";
import { SIG_SIZE, sign, verify } from "./sig.js";

export const headOf = (s) => ({ signer: s.signer, seq: s.seq, bodyHash: s.bodyHash, sig: s.sig });
export const encodeHead = (h) => concat([h.signer], varint(h.seq), h.bodyHash, h.sig);

export function decodeHead(b) {
  const r = new Reader(b);
  const h = { signer: r.u8(), seq: r.varint(), bodyHash: r.take(32), sig: r.take(SIG_SIZE) };
  r.done();
  if (h.signer > SERVER || h.seq === 0 || h.seq > 0xffffffff) fail("bad_value");
  return h;
}
export const headId = (genesis, h) => sha256(header(genesis, h.signer, h.seq, h.bodyHash));
export const verifyHead = (genesis, h, pub) => verify(pub, header(genesis, h.signer, h.seq, h.bodyHash), h.sig);

export const RECEIPT_SIZE = 254;

const receiptSigned = (r) =>
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

export function signReceipt(r, serverSeed) {
  r.sig = sign(serverSeed, receiptSigned(r));
  return concat(receiptSigned(r), r.sig);
}
export const receiptHash = (r) => sha256(concat(receiptSigned(r), r.sig));

export function decodeReceipt(b) {
  const r = new Reader(b);
  r.tag(TAG.receipt);
  const rc = { keyId: r.u8(), genesis: r.take(32), whiteSeq: r.u32(), whiteId: r.take(32) };
  Object.assign(rc, { blackSeq: r.u32(), blackId: r.take(32), stateHash: r.take(32) });
  const v = r.u8();
  if (v > 1) fail("bad_value");
  Object.assign(rc, { stateVerified: v === 1, serverMs: r.u64(), anchorNo: r.u32(), prevReceipt: r.take(32) });
  rc.sig = r.take(SIG_SIZE);
  r.done();
  return rc;
}

export function verifyReceipt(rc, serverKeys) {
  const pub = serverKeys[rc.keyId];
  if (!pub) fail("unknown_key");
  if (!verify(pub, receiptSigned(rc), rc.sig)) fail("signature");
}
