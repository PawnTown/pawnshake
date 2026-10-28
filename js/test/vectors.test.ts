// The shared vectors: every byte here must match the Go reference.
import { describe, expect, it } from "vitest";
import {
  Chain,
  KEY,
  type PsRecord,
  type Receipt,
  type Signer,
  decodeCert,
  decodeHead,
  decodeProfile,
  decodeReceipt,
  decodeWire,
  encodeCert,
  encodeHead,
  encodeProfile,
  headOf,
  issueCert,
  newGenesis,
  publicOf,
  readVarint,
  receiptHash,
  signReceipt,
  sortMoves,
  toHex,
  varint,
  verify,
  verifyReceipt,
  whitePawnProfile,
  wire,
} from "../src/index.js";
import { hex, load } from "./helpers.js";

interface RecVector {
  signer: Signer;
  seq: number;
  ply?: number;
  legal?: number;
  body_hash: string;
  id: string;
  wire: string;
  head: string;
}

const core = load("core.json");
const K = core.keys as Record<string, string>;
const serverKeys = { 1: hex(K.server_pk!) };
const now = Number(K.now);
const keys = (): [Uint8Array, Uint8Array, Uint8Array] => [hex(K.white_pk!), hex(K.black_pk!), hex(K.server_pk!)];
const info = (rv: RecVector) => (): [number, number] => [rv.ply ?? 0, rv.legal ?? 0];

describe("core vectors", () => {
  it("derives the keys", () => {
    for (const who of ["server", "white", "black"]) expect(toHex(publicOf(hex(K[`${who}_seed`]!)))).toBe(K[`${who}_pk`]);
  });

  it("encodes varints", () => {
    for (const { value, hex: h } of core.varint.valid as { value: number; hex: string }[]) {
      expect(toHex(varint(value))).toBe(h);
      expect(readVarint(hex(h))).toEqual([value, h.length / 2]);
    }
    for (const h of core.varint.invalid as string[]) expect(() => readVarint(hex(h))).toThrow(/varint/);
  });

  it("issues the same certificate", () => {
    const v = core.cert;
    const c = issueCert(hex(K.server_seed!), v.key_id, v.user_id, hex(v.device_pk), v.issued, v.expires);
    expect(toHex(encodeCert(c))).toBe(v.hex);
    const [d, n] = decodeCert(hex(v.hex));
    expect(n).toBe(v.hex.length / 2);
    expect(d.userId).toBe("user:white");
  });

  it("encodes the whitepawn/1 profile", () => {
    const v = core.profile;
    expect(toHex(encodeProfile(whitePawnProfile(v.initial_ms, v.increment_ms, v.rated)))).toBe(v.hex);
    expect(decodeProfile(hex(v.hex))[0].params.get(KEY.takebacks)).toBe(0);
  });

  it("verifies the genesis", () => {
    const v = core.genesis;
    const g = newGenesis(hex(v.challenge), hex(v.accept), hex(v.start), serverKeys, now);
    expect(toHex(g.hash)).toBe(v.hash);
    expect(toHex(g.gameId)).toBe(v.game_id);
    expect(g.challengerIsWhite).toBe(v.challenger_is_white);
    expect(toHex(g.white)).toBe(v.white_pk);
    expect(toHex(g.black)).toBe(v.black_pk);
  });

  it("rebuilds every record of the chain", () => {
    const c = new Chain(hex(core.chain.genesis_hash), keys());
    for (const rv of core.chain.records as RecVector[]) {
      const r = decodeWire(rv.signer, hex(rv.wire));
      expect(toHex(wire(r))).toBe(rv.wire);
      const { sealed } = c.add(r, info(rv));
      expect(toHex(sealed.bodyHash)).toBe(rv.body_hash);
      expect(toHex(sealed.id)).toBe(rv.id);
      expect(toHex(encodeHead(headOf({ ...sealed, sig: r.sig })))).toBe(rv.head);
      expect(toHex(encodeHead(decodeHead(hex(rv.head))))).toBe(rv.head);
    }
  });

  it("signs the same receipt", () => {
    const v = core.receipt;
    const recs = core.chain.records as RecVector[];
    const rc: Receipt = {
      keyId: 1,
      genesis: hex(core.chain.genesis_hash),
      whiteSeq: 2,
      whiteId: hex(recs[3]!.id),
      blackSeq: 2,
      blackId: hex(recs[2]!.id),
      stateHash: new Uint8Array(32),
      stateVerified: false,
      serverMs: v.server_ms,
      anchorNo: v.anchor_no,
      prevReceipt: Uint8Array.from([7, ...new Uint8Array(31)]),
    };
    expect(toHex(signReceipt(rc, hex(K.server_seed!)))).toBe(v.hex);
    expect(toHex(receiptHash(rc))).toBe(v.hash);
    const d = decodeReceipt(hex(v.hex));
    expect(d.serverMs).toBe(v.server_ms);
    verifyReceipt(d, serverKeys);
  });

  it("puts records in the canonical order", () => {
    const c = new Chain(hex(core.chain.genesis_hash), keys());
    const pending: { rv: RecVector; r: PsRecord }[] = (core.order.records as RecVector[]).map((rv) => ({
      rv,
      r: decodeWire(rv.signer, hex(rv.wire)),
    }));
    // add in an order that respects the seen links
    while (pending.length) {
      const i = pending.findIndex(({ r }) => {
        try {
          c.links(r);
          return r.seq === c.len(r.signer) + 1;
        } catch {
          return false;
        }
      });
      const [{ rv, r }] = pending.splice(i, 1) as [{ rv: RecVector; r: PsRecord }];
      c.add(r, info(rv));
    }
    expect(c.order().map((r) => [r.signer, r.seq])).toEqual(core.order.canonical);
  });
});

describe("movecode vectors", () => {
  it("sorts every legal list like the Go reference", () => {
    for (const p of load("movecode.json").positions as { legal: string[] }[])
      expect(sortMoves([...p.legal].reverse())).toEqual(p.legal);
  });
});

describe("zip215 vectors", () => {
  it("accepts all 196 cases", () => {
    const z = load("zip215.json");
    const msg = new TextEncoder().encode(z.message);
    for (const c of z.cases as { vk: string; sig: string }[]) expect(verify(hex(c.vk), msg, hex(c.sig))).toBe(true);
  });
});
