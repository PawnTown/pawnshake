// Byte helpers, the varint and the reader the decoders share.
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

/** Stable error codes, the same names as the Go errors. */
export type ErrorCode =
  | "varint" | "short" | "tag" | "too_long" | "signature" | "unknown_key" | "cert_expired" | "key_size"
  | "trailing" | "bad_value" | "link" | "commit" | "op" | "signer" | "no_slots" | "seq_gap" | "unseen"
  | "no_key" | "move_info" | "signed_seq" | "fork" | "profile_order" | "malformed" | "illegal" | "out_of_range";

export class PawnshakeError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, detail?: string) {
    super(`pawnshake: ${code}${detail ? ` (${detail})` : ""}`);
    this.code = code;
  }
}

export function fail(code: ErrorCode, detail?: string): never {
  throw new PawnshakeError(code, detail);
}

export type Bytes = Uint8Array;
export type ByteSource = Uint8Array | readonly number[];

export const enc = new TextEncoder();
export const dec = new TextDecoder();
export const sha256 = (b: Bytes): Bytes => nobleSha256(b);

export function concat(...parts: ByteSource[]): Bytes {
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

export const toHex = (b: Bytes): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function fromHex(s: string): Bytes {
  if (s.length % 2 || /[^0-9a-f]/i.test(s)) fail("bad_value", "hex");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export const equal = (a: Bytes, b: Bytes): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

export const u32 = (v: number): Bytes =>
  new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);

export const u64 = (v: number): Bytes => concat(u32(Math.floor(v / 2 ** 32)), u32(v >>> 0));

export function str(s: string): Bytes {
  const b = enc.encode(s);
  if (b.length > 255) fail("too_long");
  return concat([b.length], b);
}

/** Unsigned LEB128, up to 2^53 - 1 (JS numbers). */
export function varint(v: number): Bytes {
  if (!Number.isSafeInteger(v) || v < 0) fail("bad_value", "varint");
  const out: number[] = [];
  do {
    let b = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) b |= 128;
    out.push(b);
  } while (v > 0);
  return new Uint8Array(out);
}

/** Reads one minimally encoded varint at `at`; returns [value, length]. */
export function readVarint(b: Bytes, at = 0): [number, number] {
  let v = 0;
  let mul = 1;
  for (let i = at; i < b.length && i - at < 8; i++) {
    const x = b[i] as number;
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
  i = 0;
  constructor(readonly b: Bytes) {}
  take(n: number): Bytes {
    if (this.i + n > this.b.length) fail("short");
    const out = this.b.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  }
  u8(): number {
    return this.take(1)[0] as number;
  }
  u32(): number {
    const b = this.take(4) as unknown as number[];
    return ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0;
  }
  u64(): number {
    return this.u32() * 2 ** 32 + this.u32();
  }
  varint(): number {
    const [v, n] = readVarint(this.b, this.i);
    this.i += n;
    return v;
  }
  str(): string {
    return dec.decode(this.take(this.u8()));
  }
  tag(t: string): void {
    if (dec.decode(this.take(t.length)) !== t) fail("tag");
  }
  rest(): number {
    return this.b.length - this.i;
  }
  done(): void {
    if (this.rest() !== 0) fail("trailing");
  }
}
