import { readFileSync } from "node:fs";
import { type Bytes, PawnshakeError, fromHex } from "../src/index.js";

export const load = <T = any>(f: string): T =>
  JSON.parse(readFileSync(new URL(`../../vectors/${f}`, import.meta.url), "utf8")) as T;

export const B = (a: readonly number[]): Bytes => Uint8Array.from(a);
export const hex = fromHex;

/** The error code a call throws, "no error" when it returns. */
export function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof PawnshakeError ? e.code : String(e);
  }
  return "no error";
}

export function flip(b: Bytes, i: number): Bytes {
  const c = Uint8Array.from(b);
  c[i] = (c[i] as number) ^ 1;
  return c;
}
