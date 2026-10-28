// Every branch, mirroring the Go tests.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ARBITER,
  BLACK,
  COLOR,
  Chain,
  ForkError,
  KEY,
  OP,
  PawnshakeError,
  Reader,
  SERVER,
  WHITE,
  argsValid,
  commit,
  compensate,
  concat,
  decodeAccept,
  decodeCert,
  decodeChallenge,
  decodeHead,
  decodeMove,
  decodeProfile,
  decodeReceipt,
  decodeStart,
  decodeWire,
  encodeCert,
  encodeHead,
  encodeMove,
  encodeProfile,
  fromHex,
  headId,
  headOf,
  issueCert,
  moveKey,
  newGenesis,
  newLag,
  publicOf,
  readVarint,
  sha256,
  sign,
  signAccept,
  signChallenge,
  signReceipt,
  signStart,
  str,
  toHex,
  u64,
  varint,
  verify,
  verifyAccept,
  verifyCert,
  verifyHead,
  verifyReceipt,
  whitePawnProfile,
  wire,
} from "../src/index.js";

const K = JSON.parse(readFileSync(new URL("../../vectors/core.json", import.meta.url), "utf8")).keys;
const serverSeed = fromHex(K.server_seed);
const whiteSeed = fromHex(K.white_seed);
const blackSeed = fromHex(K.black_seed);
const keys = { 1: publicOf(serverSeed) };
const now = 1_800_000_000;
const cert = (user, seed) => issueCert(serverSeed, 1, user, publicOf(seed), now - 100, now + 100);
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof PawnshakeError ? e.code : String(e);
  }
  return "no error";
};
const flip = (b, i) => {
  const c = Uint8Array.from(b);
  c[i] ^= 1;
  return c;
};

function genesis(color = COLOR.random) {
  const nonceA = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
  const nonceB = Uint8Array.from({ length: 16 }, (_, i) => 16 - i);
  const c = {
    cert: cert("user:white", whiteSeed),
    initialMs: 180000,
    incrementMs: 2000,
    rated: true,
    arbiter: ARBITER.full,
    color,
    profile: whitePawnProfile(180000, 2000, true),
    commit: commit(nonceA),
  };
  const ch = signChallenge(c, whiteSeed);
  const ac = signAccept({ challengeHash: sha256(ch), cert: cert("user:black", blackSeed), nonceB }, blackSeed);
  const st = signStart({ acceptHash: sha256(ac), nonceA }, whiteSeed);
  return { ch, ac, st, g: newGenesis(ch, ac, st, keys, now) };
}

function chain() {
  const { g } = genesis(COLOR.white);
  const c = new Chain(g.hash, [g.white, g.black, publicOf(serverSeed)]);
  const recs = [
    c.signNext(whiteSeed, c.next(WHITE, 1000, 13), () => [1, 20]),
    c.signNext(blackSeed, c.next(BLACK, 74239, OP.ack)),
    c.signNext(blackSeed, c.next(BLACK, 75439, 8), () => [2, 20]),
    c.signNext(whiteSeed, c.next(WHITE, 2251, OP.ack)),
  ];
  return { c, recs, g };
}

describe("bytes", () => {
  it("hex, varint, reader", () => {
    expect(code(() => fromHex("abc"))).toBe("bad_value");
    expect(code(() => fromHex("zz"))).toBe("bad_value");
    expect(code(() => varint(-1))).toBe("bad_value");
    expect(code(() => varint(1.5))).toBe("bad_value");
    expect(readVarint(varint(2 ** 40))).toEqual([2 ** 40, 6]);
    expect(code(() => readVarint(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01])))).toBe("varint");
    expect(code(() => str("x".repeat(256)))).toBe("too_long");
    expect(toHex(u64(2 ** 40 + 5))).toBe("0000010000000005");
    const r = new Reader(new Uint8Array([1]));
    expect(code(() => r.u32())).toBe("short");
    expect(code(() => new Reader(new Uint8Array([9])).done())).toBe("trailing");
    expect(new PawnshakeError("x").message).toBe("pawnshake: x");
  });
  it("signatures", () => {
    const sig = sign(whiteSeed, new Uint8Array([1]));
    const pub = publicOf(whiteSeed);
    expect(verify(pub, new Uint8Array([1]), sig)).toBe(true);
    expect(verify(pub, new Uint8Array([2]), sig)).toBe(false);
    expect(verify(pub.subarray(0, 31), new Uint8Array([1]), sig)).toBe(false);
    expect(verify(pub, new Uint8Array([1]), sig.subarray(0, 63))).toBe(false);
    expect(verify(new Uint8Array(32).fill(0xff), new Uint8Array([1]), sig)).toBe(false);
  });
});

describe("certificates and profiles", () => {
  it("checks certificates", () => {
    const c = cert("user:a", whiteSeed);
    const [d] = decodeCert(encodeCert(c));
    verifyCert(d, keys, now);
    expect(code(() => verifyCert(d, {}, now))).toBe("unknown_key");
    expect(code(() => verifyCert(d, keys, now + 1000))).toBe("cert_expired");
    expect(code(() => verifyCert(d, keys, now - 1000))).toBe("cert_expired");
    expect(code(() => verifyCert({ ...d, sig: flip(d.sig, 0) }, keys, now))).toBe("signature");
    expect(code(() => issueCert(serverSeed, 1, "u", new Uint8Array(3), 0, 1))).toBe("key_size");
    expect(code(() => decodeCert(new TextEncoder().encode("XXCERT01")))).toBe("tag");
  });
  it("profiles", () => {
    const enc = encodeProfile(whitePawnProfile(60000, 0, false));
    const [p, n] = decodeProfile(concat(enc, [0xee]));
    expect(n).toBe(enc.length);
    expect(p.params.get(KEY.awayAfterMs)).toBe(15000);
    expect(p.params.get(KEY.takebacks)).toBe(1);
    for (const [ms, away] of [[600000, 60000], [1800000, 120000]])
      expect(whitePawnProfile(ms, 0, false).params.get(KEY.awayAfterMs)).toBe(away);
    expect(code(() => decodeProfile(new Uint8Array([0, 2, 2, 0, 1, 0])))).toBe("profile_order");
  });
});

describe("genesis", () => {
  it("decides colors and keys", () => {
    for (const [color, white] of [[COLOR.white, true], [COLOR.black, false]]) {
      const { g } = genesis(color);
      expect(g.challengerIsWhite).toBe(white);
      expect(toHex(g.white)).toBe(white ? K.white_pk : K.black_pk);
    }
    const { ch, ac, st } = genesis();
    expect(decodeChallenge(ch).rated).toBe(true);
    expect(decodeAccept(ac).nonceB.length).toBe(16);
    expect(decodeStart(st).nonceA.length).toBe(16);
    // an unrated challenge
    const c = decodeChallenge(ch);
    const raw = signChallenge({ ...c, rated: false }, whiteSeed);
    expect(decodeChallenge(raw).rated).toBe(false);
  });
  it("rejects every broken link", () => {
    const { ch, ac, st, g } = genesis();
    expect(code(() => decodeChallenge(concat(ch, [0])))).toBe("trailing");
    const off = 8 + encodeCert(g.challenge.cert).length + 8;
    expect(code(() => decodeChallenge(Uint8Array.from(ch, (x, i) => (i === off ? 2 : x))))).toBe("bad_value");
    expect(code(() => decodeAccept(ch))).toBe("tag");
    const cases = [
      [ch.subarray(0, 5), ac, st, keys, "short"],
      [ch, ac, st, {}, "unknown_key"],
      [flip(ch, ch.length - 1), ac, st, keys, "signature"],
      [ch, ac.subarray(0, 20), st, keys, "short"],
      [ch, flip(ac, 9), st, keys, "link"],
      [ch, flip(ac, ac.length - 1), st, keys, "signature"],
      [ch, ac, st.subarray(0, 20), keys, "short"],
      [ch, ac, flip(st, 9), keys, "link"],
      [ch, ac, flip(st, 8 + 32), keys, "commit"],
      [ch, ac, flip(st, st.length - 1), keys, "signature"],
    ];
    for (const [a, b, c, k, want] of cases) expect(code(() => newGenesis(a, b, c, k, now))).toBe(want);
    expect(code(() => verifyAccept(ac, ch, keys, now + 1000))).toBe("cert_expired");
  });
});

describe("records", () => {
  it("validates ops and arguments", () => {
    const ok = [
      [WHITE, 13, []], [WHITE, OP.resign, []], [BLACK, OP.ack, []], [WHITE, OP.resume, []],
      [WHITE, OP.end, [1, 1]], [WHITE, OP.dispute, [1, 5]], [WHITE, OP.cancel, [2]], [WHITE, OP.cancel, [1]],
      [SERVER, OP.verdictFlag, [1]], [SERVER, OP.verdictAbandon, [2]], [SERVER, OP.verdictResult, [1, 1, 0, 0]],
    ];
    for (const [s, op, a] of ok) expect(argsValid(s, op, Uint8Array.from(a))).toBe(true);
    const bad = [
      [SERVER, 13, []], [WHITE, 13, [1]], [WHITE, OP.end, []], [SERVER, OP.end, [1, 1]], [WHITE, OP.dispute, [1]],
      [SERVER, OP.dispute, [1, 5]], [WHITE, OP.dispute, [1, 0x80, 0]], [WHITE, OP.dispute, [1, 5, 5]], [WHITE, OP.cancel, [3]],
      [SERVER, OP.cancel, [1]], [WHITE, OP.cancel, []], [WHITE, OP.verdictFlag, [1]], [SERVER, OP.verdictFlag, [3]],
      [SERVER, OP.verdictFlag, []], [WHITE, OP.verdictResult, [1, 1, 0, 0]], [SERVER, OP.verdictResult, [1, 1, 0]],
      [SERVER, OP.verdictResult, [1, 1, 0, 0, 0]], [WHITE, 228, []], [SERVER, 255, []],
    ];
    for (const [s, op, a] of bad) expect(argsValid(s, op, Uint8Array.from(a))).toBe(false);
  });
  it("decodes wire records", () => {
    const { recs } = chain();
    for (const r of recs) expect(toHex(wire(decodeWire(r.signer, wire(r))))).toBe(toHex(wire(r)));
    const srv = { signer: SERVER, seq: 1, seen: 2, seenB: 3, at: 9, op: OP.verdictFlag, args: Uint8Array.from([2]), sig: new Uint8Array(64) };
    expect(decodeWire(SERVER, wire(srv)).seenB).toBe(3);
    const sig = new Uint8Array(64);
    expect(code(() => decodeWire(3, wire(srv)))).toBe("signer");
    expect(code(() => decodeWire(-1, wire(srv)))).toBe("signer");
    expect(code(() => decodeWire(WHITE, new Uint8Array(67)))).toBe("no_slots");
    expect(code(() => decodeWire(WHITE, concat([0x80, 0, 1, 13], sig)))).toBe("varint");
    expect(code(() => decodeWire(WHITE, concat([0, 0, 1, 13], sig)))).toBe("op");
    expect(code(() => decodeWire(WHITE, concat(varint(2 ** 33), [0, 1, 13], sig)))).toBe("bad_value");
    expect(code(() => decodeWire(WHITE, concat([1, 0, 1, 0, 0], sig)))).toBe("op");
  });
});

describe("chain", () => {
  it("adds, deduplicates and finds forks", () => {
    const { c, recs, g } = chain();
    expect(c.len(WHITE)).toBe(2);
    expect(c.get(WHITE, 0)).toBeUndefined();
    expect(c.records(BLACK)).toHaveLength(2);
    const info = (r) => (r.signer === WHITE ? [1, 20] : [2, 20]);
    const d = new Chain(g.hash, [g.white, g.black, publicOf(serverSeed)]);
    for (const r of recs) expect(toHex(d.add(decodeWire(r.signer, wire(r)), info).sealed.id)).toBe(toHex(r.id));
    expect(d.add(decodeWire(WHITE, wire(recs[0])), info).dup).toBe(true);
    // a fork: another signed record 1 for White
    const e = new Chain(g.hash, [g.white, g.black, null]);
    const fork = e.signNext(whiteSeed, e.next(WHITE, 1000, 12), () => [1, 20]);
    let err;
    try {
      d.add(decodeWire(WHITE, wire(fork)), info);
    } catch (x) {
      err = x;
    }
    expect(err).toBeInstanceOf(ForkError);
    expect(err.seq).toBe(1);
    expect(code(() => d.add({ signer: 3 }, info))).toBe("no_key");
    expect(code(() => e.add({ signer: SERVER, seq: 1 }))).toBe("no_key");
    expect(code(() => d.add({ signer: WHITE, seq: 5, op: OP.ack, args: new Uint8Array() }))).toBe("seq_gap");
    expect(code(() => d.add({ signer: WHITE, seq: 3, seen: 9, op: OP.ack, args: new Uint8Array() }))).toBe("unseen");
    expect(code(() => d.add({ signer: WHITE, seq: 3, seen: 2, op: 5, args: new Uint8Array() }))).toBe("move_info");
    expect(code(() => d.add({ signer: WHITE, seq: 3, seen: 2, op: OP.ack, args: new Uint8Array(), sig: new Uint8Array(64) }))).toBe("signature");
    expect(code(() => d.signNext(whiteSeed, { signer: WHITE, seq: 1, op: OP.ack }))).toBe("signed_seq");
    expect(code(() => d.links({ signer: WHITE, seq: 9 }))).toBe("seq_gap");
    // server records link both chains
    const sr = d.signNext(serverSeed, d.next(SERVER, 5, OP.verdictResult, Uint8Array.from([1, 1, 0, 0])));
    expect([sr.seen, sr.seenB]).toEqual([2, 2]);
    expect(code(() => d.links({ signer: SERVER, seq: 2, seen: 9, seenB: 0 }))).toBe("unseen");
    expect(code(() => d.links({ signer: SERVER, seq: 2, seen: 1, seenB: 9 }))).toBe("unseen");
    const f = new Chain(g.hash, [g.white, g.black, publicOf(serverSeed)]);
    for (const r of recs) f.add(decodeWire(r.signer, wire(r)), info);
    expect(f.add(decodeWire(SERVER, wire(sr))).dup).toBe(false);
  });
  it("orders concurrent records", () => {
    const { c } = chain();
    c.signNext(whiteSeed, c.next(WHITE, 3000, OP.drawOffer));
    c.signNext(blackSeed, { signer: BLACK, seq: 3, seen: 2, at: 76000, op: 15, args: new Uint8Array() }, () => [4, 29]);
    c.signNext(whiteSeed, { signer: WHITE, seq: 4, seen: 2, at: 3100, op: OP.end, args: Uint8Array.from([3, 11]) });
    c.signNext(serverSeed, c.next(SERVER, 1, OP.verdictResult, Uint8Array.from([3, 11, 0, 0])));
    expect(c.order().slice(4).map((r) => r.op)).toEqual([15, OP.drawOffer, OP.end, OP.verdictResult]);
    const c2 = chain().c;
    c2.signNext(serverSeed, c2.next(SERVER, 1, OP.verdictFlag, Uint8Array.from([1])));
    c2.signNext(whiteSeed, c2.next(WHITE, 3000, OP.resign));
    expect(c2.order()[4].signer).toBe(SERVER);
    const c3 = chain().c;
    c3.signNext(whiteSeed, c3.next(WHITE, 3000, OP.resign));
    c3.signNext(blackSeed, { signer: BLACK, seq: 3, seen: 2, at: 1, op: OP.end, args: Uint8Array.from([1, 2]) });
    expect(c3.order()[4].op).toBe(OP.end);
  });
});

describe("anchors", () => {
  it("heads and receipts", () => {
    const { c, recs } = chain();
    const h = decodeHead(encodeHead(headOf(recs[3])));
    expect(toHex(headId(c.genesis, h))).toBe(toHex(recs[3].id));
    expect(verifyHead(c.genesis, h, c.keys[WHITE])).toBe(true);
    expect(verifyHead(c.genesis, h, c.keys[BLACK])).toBe(false);
    expect(code(() => decodeHead(concat(encodeHead(h), [0])))).toBe("trailing");
    expect(code(() => decodeHead(Uint8Array.from(encodeHead(h), (x, i) => (i === 0 ? 3 : x))))).toBe("bad_value");
    expect(code(() => decodeHead(encodeHead({ ...h, seq: 0 })))).toBe("bad_value");
    expect(code(() => decodeHead(encodeHead({ ...h, seq: 2 ** 33 })))).toBe("bad_value");
    const rc = {
      keyId: 1, genesis: c.genesis, whiteSeq: 2, whiteId: recs[3].id, blackSeq: 2, blackId: recs[2].id,
      stateHash: new Uint8Array(32), stateVerified: true, serverMs: 2 ** 40, anchorNo: 1, prevReceipt: new Uint8Array(32),
    };
    const b = signReceipt(rc, serverSeed);
    expect(b.length).toBe(254);
    const d = decodeReceipt(b);
    expect(d.stateVerified).toBe(true);
    verifyReceipt(d, keys);
    expect(code(() => verifyReceipt(d, {}))).toBe("unknown_key");
    expect(code(() => verifyReceipt({ ...d, anchorNo: 2 }, keys))).toBe("signature");
    const bad = Uint8Array.from(b);
    bad[8 + 1 + 32 + 4 + 32 + 4 + 32 + 32] = 2;
    expect(code(() => decodeReceipt(bad))).toBe("bad_value");
    expect(code(() => decodeReceipt(b.subarray(0, 30)))).toBe("short");
  });
});

describe("move codes and lag", () => {
  it("encodes and decodes", () => {
    const legal = ["h2h4", "e2e4", "b1a3", "b7b8q", "b7b8n"];
    expect(encodeMove(legal, "e2e4")).toEqual([1, 5]);
    expect(decodeMove(legal, 0)).toBe("b1a3");
    expect(moveKey("b7b8n") < moveKey("b7b8q")).toBe(true);
    expect(code(() => encodeMove(legal, "zz"))).toBe("malformed");
    expect(code(() => encodeMove(legal, "a2a3"))).toBe("illegal");
    expect(code(() => decodeMove(legal, 5))).toBe("out_of_range");
    expect(code(() => decodeMove(legal, -1))).toBe("out_of_range");
    expect(code(() => decodeMove(legal, 0.5))).toBe("out_of_range");
  });
  it("compensates lag from a bounded quota", () => {
    const l = newLag(60000, 0);
    expect([l.gain, l.quota]).toEqual([390, 1170]);
    let total = 0;
    for (let i = 0; i < 20; i++) total += compensate(l, 10000);
    expect(total).toBe(1170 + 19 * 390);
    expect(compensate(l, -5)).toBe(0);
    expect(newLag(600000, 0).gain).toBe(1000);
  });
});
