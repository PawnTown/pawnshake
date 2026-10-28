// Ed25519 (RFC 8032) with ZIP-215 verification.
import { ed25519 } from "@noble/curves/ed25519.js";

export const SIG_SIZE = 64;
export const publicOf = (seed) => ed25519.getPublicKey(seed);
export const sign = (seed, msg) => ed25519.sign(msg, seed);
export function verify(pub, msg, sig) {
  // noble returns false for every bad point or scalar; it only throws on
  // wrong lengths, which are refused here first.
  if (pub.length !== 32 || sig.length !== SIG_SIZE) return false;
  return ed25519.verify(sig, msg, pub, { zip215: true });
}
