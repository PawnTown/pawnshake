// Ed25519 (RFC 8032) with ZIP-215 verification.
import { ed25519 } from "@noble/curves/ed25519.js";
import type { Bytes } from "./bytes.js";

export const SIG_SIZE = 64;

/** The public key of a 32-byte seed. */
export const publicOf = (seed: Bytes): Bytes => ed25519.getPublicKey(seed);

/** Signs (deterministic). */
export const sign = (seed: Bytes, msg: Bytes): Bytes => ed25519.sign(msg, seed);

/** ZIP-215 verification, so every implementation agrees on validity. */
export function verify(pub: Bytes, msg: Bytes, sig: Bytes): boolean {
  // noble returns false for every bad point or scalar; it only throws on
  // wrong lengths, which are refused here first.
  if (pub.length !== 32 || sig.length !== SIG_SIZE) return false;
  return ed25519.verify(sig, msg, pub, { zip215: true });
}
