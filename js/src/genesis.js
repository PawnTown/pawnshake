// The genesis handshake: CHALLENGE, ACCEPT, START (spec "Genesis").
import { Reader, concat, enc, equal, fail, sha256, u32 } from "./bytes.js";
import { TAG, encodeCert, readCert, verifyCert } from "./cert.js";
import { encodeProfile, readProfile } from "./profile.js";
import { SIG_SIZE, sign, verify } from "./sig.js";

export const ARBITER = { none: 0, checkpoints: 1, full: 2 };
export const COLOR = { random: 0, white: 1, black: 2 };

export const commit = (nonce) => sha256(nonce);

const challengeSigned = (c) =>
  concat(
    enc.encode(TAG.challenge),
    encodeCert(c.cert),
    u32(c.initialMs),
    u32(c.incrementMs),
    [c.rated ? 1 : 0, c.arbiter, c.color],
    encodeProfile(c.profile),
    c.commit,
  );
const acceptSigned = (a) => concat(enc.encode(TAG.accept), a.challengeHash, encodeCert(a.cert), a.nonceB);
const startSigned = (s) => concat(enc.encode(TAG.start), s.acceptHash, s.nonceA);

const signed = (m, seed) => {
  const sig = sign(seed, m);
  return [sig, concat(m, sig)];
};

/** Signs a challenge with the challenger's device seed; returns its bytes. */
export function signChallenge(c, seed) {
  const [sig, raw] = signed(challengeSigned(c), seed);
  c.sig = sig;
  return raw;
}
export function signAccept(a, seed) {
  const [sig, raw] = signed(acceptSigned(a), seed);
  a.sig = sig;
  return raw;
}
export function signStart(s, seed) {
  const [sig, raw] = signed(startSigned(s), seed);
  s.sig = sig;
  return raw;
}

export function decodeChallenge(b) {
  const r = new Reader(b);
  r.tag(TAG.challenge);
  const c = { cert: readCert(r), initialMs: r.u32(), incrementMs: r.u32() };
  const rated = r.u8();
  const arbiter = r.u8();
  const color = r.u8();
  if (rated > 1 || arbiter > 2 || color > 2) fail("bad_value");
  Object.assign(c, { rated: rated === 1, arbiter, color, profile: readProfile(r), commit: r.take(32) });
  c.sig = r.take(SIG_SIZE);
  r.done();
  return c;
}
export function decodeAccept(b) {
  const r = new Reader(b);
  r.tag(TAG.accept);
  const a = { challengeHash: r.take(32), cert: readCert(r), nonceB: r.take(16), sig: r.take(SIG_SIZE) };
  r.done();
  return a;
}
export function decodeStart(b) {
  const r = new Reader(b);
  r.tag(TAG.start);
  const s = { acceptHash: r.take(32), nonceA: r.take(16), sig: r.take(SIG_SIZE) };
  r.done();
  return s;
}

const checkSig = (pub, raw, sig) => {
  if (!verify(pub, raw.subarray(0, raw.length - SIG_SIZE), sig)) fail("signature");
};

export function verifyChallenge(raw, serverKeys, now) {
  const c = decodeChallenge(raw);
  verifyCert(c.cert, serverKeys, now);
  checkSig(c.cert.devicePk, raw, c.sig);
  return c;
}

export function verifyAccept(raw, challenge, serverKeys, now) {
  const a = decodeAccept(raw);
  if (!equal(a.challengeHash, sha256(challenge))) fail("link");
  verifyCert(a.cert, serverKeys, now);
  checkSig(a.cert.devicePk, raw, a.sig);
  return a;
}

/** Verifies all three messages and links them; returns the genesis. */
export function newGenesis(challenge, accept, start, serverKeys, now) {
  const c = verifyChallenge(challenge, serverKeys, now);
  const a = verifyAccept(accept, challenge, serverKeys, now);
  const s = decodeStart(start);
  if (!equal(s.acceptHash, sha256(accept))) fail("link");
  if (!equal(commit(s.nonceA), c.commit)) fail("commit");
  checkSig(c.cert.devicePk, start, s.sig);
  const hash = sha256(concat(challenge, accept, start));
  let challengerIsWhite = c.color === COLOR.white;
  if (c.color === COLOR.random) challengerIsWhite = sha256(concat(s.nonceA, a.nonceB))[0] % 2 === 0;
  const [white, black] = challengerIsWhite
    ? [c.cert.devicePk, a.cert.devicePk]
    : [a.cert.devicePk, c.cert.devicePk];
  return { challenge: c, accept: a, start: s, raw: [challenge, accept, start], hash, gameId: hash.slice(0, 16), challengerIsWhite, white, black };
}
