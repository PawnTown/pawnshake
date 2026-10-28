// Byte helpers, the varint and the reader the decoders share.
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

export class PawnshakeError extends Error {
  /** @param {string} code a stable error code, the same names as the Go errors */
  constructor(code, detail) {
    super(`pawnshake: ${code}${detail ? ` (${detail})` : ""}`);
    this.code = code;
  }
}
export const fail = (code, detail) => {
  throw new PawnshakeError(code, detail);
};

export const enc = new TextEncoder();
export const dec = new TextDecoder();
export const sha256 = (b) => nobleSha256(b);

export function concat(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

export const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export function fromHex(s) {
  if (s.length % 2 || /[^0-9a-f]/i.test(s)) fail("bad_value", "hex");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export const equal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export const u32 = (v) => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
export function u64(v) {
  const hi = Math.floor(v / 2 ** 32);
  return concat(u32(hi), u32(v >>> 0));
}
export const str = (s) => {
  const b = enc.encode(s);
  if (b.length > 255) fail("too_long");
  return concat([b.length], b);
};

// Unsigned LEB128, up to 2^53 - 1 (JS numbers).
export function varint(v) {
  if (!Number.isSafeInteger(v) || v < 0) fail("bad_value", "varint");
  const out = [];
  do {
    let b = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) b |= 128;
    out.push(b);
  } while (v > 0);
  return new Uint8Array(out);
}

// Reads one minimally encoded varint; returns [value, length].
export function readVarint(b, at = 0) {
  let v = 0;
  let mul = 1;
  for (let i = at; i < b.length && i - at < 8; i++) {
    const x = b[i];
    v += (x & 127) * mul;
    mul *= 128;
    if (x < 128) {
      const n = i - at + 1;
      if (n > 1 && x === 0) break;
      return [v, n];
    }
  }
  return fail("varint");
}

export class Reader {
  constructor(b) {
    this.b = b;
    this.i = 0;
  }
  take(n) {
    if (this.i + n > this.b.length) fail("short");
    const out = this.b.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  }
  u8() {
    return this.take(1)[0];
  }
  u32() {
    const b = this.take(4);
    return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  }
  u64() {
    return this.u32() * 2 ** 32 + this.u32();
  }
  varint() {
    const [v, n] = readVarint(this.b, this.i);
    this.i += n;
    return v;
  }
  str() {
    return dec.decode(this.take(this.u8()));
  }
  tag(t) {
    if (dec.decode(this.take(t.length)) !== t) fail("tag");
  }
  rest() {
    return this.b.length - this.i;
  }
  done() {
    if (this.rest() !== 0) fail("trailing");
  }
}
