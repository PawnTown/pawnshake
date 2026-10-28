// The genesis handshake: CHALLENGE, ACCEPT, START (spec "Genesis").
import { type Bytes, Reader, concat, enc, equal, fail, sha256, u32 } from "./bytes.js";
import { type Cert, type ServerKeys, TAG, encodeCert, readCert, verifyCert } from "./cert.js";
import { type Profile, encodeProfile, readProfile } from "./profile.js";
import { SIG_SIZE, sign, verify } from "./sig.js";

export const ARBITER = { none: 0, checkpoints: 1, full: 2 } as const;
export const COLOR = { random: 0, white: 1, black: 2 } as const;
export type Arbiter = (typeof ARBITER)[keyof typeof ARBITER];
export type ColorChoice = (typeof COLOR)[keyof typeof COLOR];

export interface Challenge {
  cert: Cert;
  initialMs: number;
  incrementMs: number;
  rated: boolean;
  arbiter: Arbiter;
  color: ColorChoice;
  profile: Profile;
  commit: Bytes;
  sig?: Bytes;
}
export interface Accept {
  challengeHash: Bytes;
  cert: Cert;
  nonceB: Bytes;
  sig?: Bytes;
}
export interface Start {
  acceptHash: Bytes;
  nonceA: Bytes;
  sig?: Bytes;
}
export interface Genesis {
  challenge: Challenge;
  accept: Accept;
  start: Start;
  raw: [Bytes, Bytes, Bytes];
  hash: Bytes;
  gameId: Bytes;
  challengerIsWhite: boolean;
  white: Bytes;
  black: Bytes;
}

/** The commitment to a 16-byte nonce. */
export const commit = (nonce: Bytes): Bytes => sha256(nonce);

const challengeSigned = (c: Challenge): Bytes =>
  concat(
    enc.encode(TAG.challenge),
    encodeCert(c.cert),
    u32(c.initialMs),
    u32(c.incrementMs),
    [c.rated ? 1 : 0, c.arbiter, c.color],
    encodeProfile(c.profile),
    c.commit,
  );
const acceptSigned = (a: Accept): Bytes => concat(enc.encode(TAG.accept), a.challengeHash, encodeCert(a.cert), a.nonceB);
const startSigned = (s: Start): Bytes => concat(enc.encode(TAG.start), s.acceptHash, s.nonceA);

function signed(m: Bytes, seed: Bytes): [Bytes, Bytes] {
  const sig = sign(seed, m);
  return [sig, concat(m, sig)];
}

/** Signs a challenge with the challenger's device seed (sets c.sig); returns its bytes. */
export function signChallenge(c: Challenge, seed: Bytes): Bytes {
  const [sig, raw] = signed(challengeSigned(c), seed);
  c.sig = sig;
  return raw;
}
export function signAccept(a: Accept, seed: Bytes): Bytes {
  const [sig, raw] = signed(acceptSigned(a), seed);
  a.sig = sig;
  return raw;
}
export function signStart(s: Start, seed: Bytes): Bytes {
  const [sig, raw] = signed(startSigned(s), seed);
  s.sig = sig;
  return raw;
}

export function decodeChallenge(b: Bytes): Required<Challenge> {
  const r = new Reader(b);
  r.tag(TAG.challenge);
  const cert = readCert(r);
  const initialMs = r.u32();
  const incrementMs = r.u32();
  const rated = r.u8();
  const arbiter = r.u8();
  const color = r.u8();
  if (rated > 1 || arbiter > 2 || color > 2) fail("bad_value");
  const c = {
    cert,
    initialMs,
    incrementMs,
    rated: rated === 1,
    arbiter: arbiter as Arbiter,
    color: color as ColorChoice,
    profile: readProfile(r),
    commit: r.take(32),
    sig: r.take(SIG_SIZE),
  };
  r.done();
  return c;
}
export function decodeAccept(b: Bytes): Required<Accept> {
  const r = new Reader(b);
  r.tag(TAG.accept);
  const a = { challengeHash: r.take(32), cert: readCert(r), nonceB: r.take(16), sig: r.take(SIG_SIZE) };
  r.done();
  return a;
}
export function decodeStart(b: Bytes): Required<Start> {
  const r = new Reader(b);
  r.tag(TAG.start);
  const s = { acceptHash: r.take(32), nonceA: r.take(16), sig: r.take(SIG_SIZE) };
  r.done();
  return s;
}

function checkSig(pub: Bytes, raw: Bytes, sig: Bytes): void {
  if (!verify(pub, raw.subarray(0, raw.length - SIG_SIZE), sig)) fail("signature");
}

/** Decodes a CHALLENGE and checks its certificate and signature. */
export function verifyChallenge(raw: Bytes, serverKeys: ServerKeys, now: number): Required<Challenge> {
  const c = decodeChallenge(raw);
  verifyCert(c.cert, serverKeys, now);
  checkSig(c.cert.devicePk, raw, c.sig);
  return c;
}

/** Decodes an ACCEPT for the given CHALLENGE bytes and checks it. */
export function verifyAccept(raw: Bytes, challenge: Bytes, serverKeys: ServerKeys, now: number): Required<Accept> {
  const a = decodeAccept(raw);
  if (!equal(a.challengeHash, sha256(challenge))) fail("link");
  verifyCert(a.cert, serverKeys, now);
  checkSig(a.cert.devicePk, raw, a.sig);
  return a;
}

/** Verifies all three messages and links them. */
export function newGenesis(challenge: Bytes, accept: Bytes, start: Bytes, serverKeys: ServerKeys, now: number): Genesis {
  const c = verifyChallenge(challenge, serverKeys, now);
  const a = verifyAccept(accept, challenge, serverKeys, now);
  const s = decodeStart(start);
  if (!equal(s.acceptHash, sha256(accept))) fail("link");
  if (!equal(commit(s.nonceA), c.commit)) fail("commit");
  checkSig(c.cert.devicePk, start, s.sig);
  const hash = sha256(concat(challenge, accept, start));
  let challengerIsWhite = c.color === COLOR.white;
  if (c.color === COLOR.random) challengerIsWhite = (sha256(concat(s.nonceA, a.nonceB))[0] as number) % 2 === 0;
  const [white, black] = challengerIsWhite ? [c.cert.devicePk, a.cert.devicePk] : [a.cert.devicePk, c.cert.devicePk];
  return { challenge: c, accept: a, start: s, raw: [challenge, accept, start], hash, gameId: hash.slice(0, 16), challengerIsWhite, white, black };
}
