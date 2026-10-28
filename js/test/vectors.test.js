// The shared vectors: every byte here must match the Go reference.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Chain,
  KEY,
  decodeCert,
  decodeHead,
  decodeProfile,
  decodeReceipt,
  decodeWire,
  encodeCert,
  encodeHead,
  encodeProfile,
  fromHex,
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

const load = (f) => JSON.parse(readFileSync(new URL(`../../vectors/${f}`, import.meta.url), "utf8"));
const core = load("core.json");
const K = core.keys;
const serverKeys = { 1: fromHex(K.server_pk) };
const now = Number(K.now);

describe("core vectors", () => {
  it("derives the keys", () => {
    for (const who of ["server", "white", "black"])
      expect(toHex(publicOf(fromHex(K[`${who}_seed`])))).toBe(K[`${who}_pk`]);
  });

  it("encodes varints", () => {
    for (const { value, hex } of core.varint.valid) {
      expect(toHex(varint(value))).toBe(hex);
      expect(readVarint(fromHex(hex))).toEqual([value, hex.length / 2]);
    }
    for (const hex of core.varint.invalid) expect(() => readVarint(fromHex(hex))).toThrow(/varint/);
  });

  it("issues the same certificate", () => {
    const v = core.cert;
    const c = issueCert(fromHex(K.server_seed), v.key_id, v.user_id, fromHex(v.device_pk), v.issued, v.expires);
    expect(toHex(encodeCert(c))).toBe(v.hex);
    const [d, n] = decodeCert(fromHex(v.hex));
    expect(n).toBe(v.hex.length / 2);
    expect(d.userId).toBe("user:white");
  });

  it("encodes the whitepawn/1 profile", () => {
    const v = core.profile;
    expect(toHex(encodeProfile(whitePawnProfile(v.initial_ms, v.increment_ms, v.rated)))).toBe(v.hex);
    const [p] = decodeProfile(fromHex(v.hex));
    expect(p.params.get(KEY.takebacks)).toBe(0);
  });

  it("verifies the genesis", () => {
    const v = core.genesis;
    const g = newGenesis(fromHex(v.challenge), fromHex(v.accept), fromHex(v.start), serverKeys, now);
    expect(toHex(g.hash)).toBe(v.hash);
    expect(toHex(g.gameId)).toBe(v.game_id);
    expect(g.challengerIsWhite).toBe(v.challenger_is_white);
    expect(toHex(g.white)).toBe(v.white_pk);
    expect(toHex(g.black)).toBe(v.black_pk);
  });

  const moveInfo = (r) => [r.ply, r.legal];

  it("rebuilds every record of the chain", () => {
    const v = core.chain;
    const c = new Chain(fromHex(v.genesis_hash), [fromHex(K.white_pk), fromHex(K.black_pk), fromHex(K.server_pk)]);
    for (const rv of v.records) {
      const r = decodeWire(rv.signer, fromHex(rv.wire));
      expect(toHex(wire(r))).toBe(rv.wire);
      const { sealed } = c.add(r, () => [rv.ply, rv.legal]);
      expect(toHex(sealed.bodyHash)).toBe(rv.body_hash);
      expect(toHex(sealed.id)).toBe(rv.id);
      expect(toHex(encodeHead(headOf(sealed)))).toBe(rv.head);
      expect(toHex(encodeHead(decodeHead(fromHex(rv.head))))).toBe(rv.head);
    }
    expect(moveInfo({ ply: 1, legal: 2 })).toEqual([1, 2]);
  });

  it("signs the same receipt", () => {
    const v = core.receipt;
    const ch = core.chain;
    const rc = {
      keyId: 1,
      genesis: fromHex(ch.genesis_hash),
      whiteSeq: 2,
      whiteId: fromHex(ch.records[3].id),
      blackSeq: 2,
      blackId: fromHex(ch.records[2].id),
      stateHash: new Uint8Array(32),
      stateVerified: false,
      serverMs: v.server_ms,
      anchorNo: v.anchor_no,
      prevReceipt: Uint8Array.from([7, ...new Uint8Array(31)]),
    };
    expect(toHex(signReceipt(rc, fromHex(K.server_seed)))).toBe(v.hex);
    expect(toHex(receiptHash(rc))).toBe(v.hash);
    const d = decodeReceipt(fromHex(v.hex));
    expect(d.serverMs).toBe(v.server_ms);
    verifyReceipt(d, serverKeys);
  });

  it("puts records in the canonical order", () => {
    const v = core.order;
    const c = new Chain(fromHex(core.chain.genesis_hash), [fromHex(K.white_pk), fromHex(K.black_pk), fromHex(K.server_pk)]);
    const pending = v.records.map((rv) => ({ rv, r: decodeWire(rv.signer, fromHex(rv.wire)) }));
    // add in an order that respects seen links: repeat until all are in
    while (pending.length) {
      const i = pending.findIndex(({ r }) => {
        try {
          c.links(r);
          return r.seq === c.len(r.signer) + 1;
        } catch {
          return false;
        }
      });
      const [{ rv, r }] = pending.splice(i, 1);
      c.add(r, () => [rv.ply, rv.legal]);
    }
    expect(c.order().map((r) => [r.signer, r.seq])).toEqual(v.canonical);
  });
});

describe("movecode vectors", () => {
  it("sorts every legal list like the Go reference", () => {
    for (const p of load("movecode.json").positions) {
      const shuffled = [...p.legal].reverse();
      expect(sortMoves(shuffled)).toEqual(p.legal);
    }
  });
});

describe("zip215 vectors", () => {
  it("accepts all 196 cases", () => {
    const z = load("zip215.json");
    const msg = new TextEncoder().encode(z.message);
    for (const c of z.cases) expect(verify(fromHex(c.vk), msg, fromHex(c.sig))).toBe(true);
  });
});
