// A game's records with fork detection (spec "The one rule").
import { type Bytes, PawnshakeError, equal, fail } from "./bytes.js";
import {
  BLACK,
  type Links,
  OP,
  type PsRecord,
  SERVER,
  type Sealed,
  type Signed,
  type Signer,
  WHITE,
  isMove,
  other,
  seal,
  signSealed,
  verifySealed,
} from "./record.js";

/** Returns [ply, legal] for a move record: the caller's engine knows the position. */
export type MoveInfo = (r: PsRecord) => [number, number];

export class ForkError extends PawnshakeError {
  constructor(
    readonly signer: Signer,
    readonly seq: number,
    readonly have: Sealed,
    readonly other: Sealed,
  ) {
    super("fork", `signer ${signer} seq ${seq}`);
  }
}

export class Chain {
  private readonly recs: [Sealed[], Sealed[], Sealed[]] = [[], [], []];

  /** @param keys [white, black, server] public keys (server may be null) */
  constructor(
    readonly genesis: Bytes,
    readonly keys: [Bytes | null, Bytes | null, Bytes | null],
  ) {}

  len(s: Signer): number {
    return this.recs[s].length;
  }
  get(s: Signer, seq: number): Sealed | undefined {
    return seq >= 1 ? this.recs[s][seq - 1] : undefined;
  }
  records(s: Signer): Sealed[] {
    return [...this.recs[s]];
  }
  private idOr(s: Signer, seq: number, zero: boolean): Bytes {
    if (seq === 0) return zero ? new Uint8Array(32) : this.genesis;
    const r = this.get(s, seq);
    if (!r) fail("unseen");
    return r.id;
  }
  /** The links of a record against this chain. */
  links(r: PsRecord): Links {
    if (r.seq > this.len(r.signer) + 1) fail("seq_gap");
    const prev = this.idOr(r.signer, r.seq - 1, false);
    if (r.signer === SERVER)
      return { prev, seenHash: this.idOr(WHITE, r.seen, true), seenHashB: this.idOr(BLACK, r.seenB ?? 0, true) };
    return { prev, seenHash: this.idOr(other(r.signer), r.seen, true) };
  }
  private sealWith(r: PsRecord, info?: MoveInfo): Sealed {
    if (isMove(r.op) && r.signer !== SERVER) {
      if (!info) fail("move_info");
      const [ply, legal] = info(r);
      r = { ...r, ply, legal };
    }
    return seal(this.genesis, r, this.links(r));
  }
  /** Verifies and appends a received record; a copy is a dup, a different record for a held seq a ForkError. */
  add(r: PsRecord, info?: MoveInfo): { sealed: Sealed; dup: boolean } {
    const key = r.signer >= 0 && r.signer <= SERVER ? this.keys[r.signer] : null;
    if (!key) fail("no_key");
    const have = this.get(r.signer, r.seq);
    if (!have && r.seq !== this.len(r.signer) + 1) fail("seq_gap");
    const s = this.sealWith(r, info);
    if (!verifySealed(this.genesis, s, key)) fail("signature");
    if (have) {
      if (equal(have.id, s.id)) return { sealed: have, dup: true };
      throw new ForkError(r.signer, r.seq, have, s);
    }
    this.recs[r.signer].push(s);
    return { sealed: s, dup: false };
  }
  /** A new record of signer s with seq and seen filled in. */
  next(s: Signer, at: number, op: number, args: Bytes = new Uint8Array()): PsRecord {
    if (s === SERVER) return { signer: s, seq: this.len(s) + 1, seen: this.len(WHITE), seenB: this.len(BLACK), at, op, args };
    return { signer: s, seq: this.len(s) + 1, seen: this.len(other(s)), at, op, args };
  }
  /** Signs and appends the signer's next record: never two records for one seq. */
  signNext(seed: Bytes, r: PsRecord, info?: MoveInfo): Signed {
    if (r.seq !== this.len(r.signer) + 1) fail("signed_seq");
    const s = signSealed(this.genesis, this.sealWith(r, info), seed);
    this.recs[r.signer].push(s);
    return s;
  }
  /** Every record in the canonical order (spec "Applying records"). */
  order(): Sealed[] {
    const out: Sealed[] = [];
    const next = [1, 1, 1];
    const placed = (s: Signer, seq: number) => seq < (next[s] as number);
    const ready = (r: Sealed) =>
      r.signer === SERVER ? placed(WHITE, r.seen) && placed(BLACK, r.seenB ?? 0) : placed(other(r.signer), r.seen);
    const cls = (r: Sealed) => (r.signer === SERVER ? 0 : isMove(r.op) ? 1 : r.op === OP.end ? 2 : 3);
    for (;;) {
      let best: Sealed | undefined;
      for (const s of [SERVER, WHITE, BLACK] as const) {
        const r = this.get(s, next[s] as number);
        if (r && ready(r) && (!best || cls(r) < cls(best))) best = r;
      }
      if (!best) return out;
      out.push(best);
      (next[best.signer] as number)++;
    }
  }
}
