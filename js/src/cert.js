// Device certificates (spec "Identity: device certificates").
import { Reader, concat, enc, fail, str, u32 } from "./bytes.js";
import { SIG_SIZE, sign, verify } from "./sig.js";

export const TAG = {
  record: "PSREC001",
  challenge: "PSCHAL01",
  accept: "PSACPT01",
  start: "PSSTRT01",
  cert: "PSCERT01",
  receipt: "PSANCH01",
};

const certSigned = (c) =>
  concat(enc.encode(TAG.cert), [c.keyId], str(c.userId), c.devicePk, u32(c.issued), u32(c.expires));

export const encodeCert = (c) => concat(certSigned(c), c.sig);

export function issueCert(serverSeed, keyId, userId, devicePk, issued, expires) {
  if (devicePk.length !== 32) fail("key_size");
  const c = { keyId, userId, devicePk, issued, expires };
  c.sig = sign(serverSeed, certSigned(c));
  return c;
}

export function readCert(r) {
  r.tag(TAG.cert);
  const c = { keyId: r.u8(), userId: r.str() };
  c.devicePk = r.take(32);
  c.issued = r.u32();
  c.expires = r.u32();
  c.sig = r.take(SIG_SIZE);
  return c;
}

/** Decodes one certificate from the start of b; returns [cert, length]. */
export function decodeCert(b) {
  const r = new Reader(b);
  const c = readCert(r);
  return [c, r.i];
}

/** Throws unless the certificate is signed by a pinned server key and valid at `now` (unix s). */
export function verifyCert(c, serverKeys, now) {
  const pub = serverKeys[c.keyId];
  if (!pub) fail("unknown_key");
  if (!verify(pub, certSigned(c), c.sig)) fail("signature");
  if (now < c.issued || now > c.expires) fail("cert_expired");
}
