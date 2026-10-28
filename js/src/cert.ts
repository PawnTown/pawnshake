// Device certificates (spec "Identity: device certificates").
import { type Bytes, Reader, concat, enc, fail, str, u32 } from "./bytes.js";
import { SIG_SIZE, sign, verify } from "./sig.js";

export const TAG = {
  record: "PSREC001",
  challenge: "PSCHAL01",
  accept: "PSACPT01",
  start: "PSSTRT01",
  cert: "PSCERT01",
  receipt: "PSANCH01",
} as const;

export interface Cert {
  keyId: number;
  userId: string;
  devicePk: Bytes;
  /** unix seconds */
  issued: number;
  expires: number;
  sig: Bytes;
}

/** Pinned server keys by key id. */
export type ServerKeys = Record<number, Bytes>;

const certSigned = (c: Omit<Cert, "sig">): Bytes =>
  concat(enc.encode(TAG.cert), [c.keyId], str(c.userId), c.devicePk, u32(c.issued), u32(c.expires));

export const encodeCert = (c: Cert): Bytes => concat(certSigned(c), c.sig);

export function issueCert(serverSeed: Bytes, keyId: number, userId: string, devicePk: Bytes, issued: number, expires: number): Cert {
  if (devicePk.length !== 32) fail("key_size");
  const c = { keyId, userId, devicePk, issued, expires };
  return { ...c, sig: sign(serverSeed, certSigned(c)) };
}

export function readCert(r: Reader): Cert {
  r.tag(TAG.cert);
  const keyId = r.u8();
  const userId = r.str();
  return { keyId, userId, devicePk: r.take(32), issued: r.u32(), expires: r.u32(), sig: r.take(SIG_SIZE) };
}

/** Decodes one certificate from the start of b; returns [cert, length]. */
export function decodeCert(b: Bytes): [Cert, number] {
  const r = new Reader(b);
  const c = readCert(r);
  return [c, r.i];
}

/** Throws unless the certificate is signed by a pinned server key and valid at `now` (unix s). */
export function verifyCert(c: Cert, serverKeys: ServerKeys, now: number): void {
  const pub = serverKeys[c.keyId];
  if (!pub) fail("unknown_key");
  if (!verify(pub, certSigned(c), c.sig)) fail("signature");
  if (now < c.issued || now > c.expires) fail("cert_expired");
}
