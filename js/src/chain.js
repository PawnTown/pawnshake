// A game's records with fork detection (spec "The one rule").
import { PawnshakeError, equal, fail } from "./bytes.js";
import { SERVER, WHITE, BLACK, isMove, other, seal, signSealed, verifySealed } from "./record.js";

export class ForkError extends PawnshakeError {
  constructor(signer, seq, have, otherRecord) {
    super("fork", `signer ${signer} seq ${seq}`);
    Object.assign(this, { signer, seq, have, other: otherRecord });
  }
}

export class Chain {
  /** @param genesis genesis hash; keys [white, black, server] public keys (server may be null) */
  constructor(genesis, keys) {
    this.genesis = genesis;
    this.keys = keys;
    this.recs = [[], [], []];
  }
  len(s) {
    return this.recs[s].length;
  }
  get(s, seq) {
    return seq >= 1 ? this.recs[s][seq - 1] : undefined;
  }
  records(s) {
    return [...this.recs[s]];
  }
  idOr(s, seq, zero) {
    if (seq === 0) return zero ? new Uint8Array(32) : this.genesis;
    const r = this.get(s, seq);
    if (!r) fail("unseen");
    return r.id;
  }
  links(r) {
    if (r.seq > this.len(r.signer) + 1) fail("seq_gap");
    const prev = this.idOr(r.signer, r.seq - 1, false);
    if (r.signer === SERVER)
      return { prev, seenHash: this.idOr(WHITE, r.seen, true), seenHashB: this.idOr(BLACK, r.seenB, true) };
    return { prev, seenHash: this.idOr(other(r.signer), r.seen, true) };
  }
  sealWith(r, info) {
    if (isMove(r.op) && r.signer !== SERVER) {
      if (!info) fail("move_info");
      const [ply, legal] = info(r);
      r = { ...r, ply, legal };
    }
    return seal(this.genesis, r, this.links(r));
  }
  /** Verifies and appends a received record. Returns {sealed, dup}; throws ForkError on a fork. */
  add(r, info) {
    if (!(r.signer >= 0 && r.signer <= SERVER) || !this.keys[r.signer]) fail("no_key");
    const have = this.get(r.signer, r.seq);
    if (!have && r.seq !== this.len(r.signer) + 1) fail("seq_gap");
    const s = this.sealWith(r, info);
    if (!verifySealed(this.genesis, s, this.keys[r.signer])) fail("signature");
    if (have) {
      if (equal(have.id, s.id)) return { sealed: have, dup: true };
      throw new ForkError(r.signer, r.seq, have, s);
    }
    this.recs[r.signer].push(s);
    return { sealed: s, dup: false };
  }
  /** A new record of signer s with seq and seen filled in. */
  next(s, at, op, args = new Uint8Array()) {
    const r = { signer: s, seq: this.len(s) + 1, at, op, args };
    if (s === SERVER) Object.assign(r, { seen: this.len(WHITE), seenB: this.len(BLACK) });
    else r.seen = this.len(other(s));
    return r;
  }
  /** Signs and appends the signer's next record: never two records for one seq. */
  signNext(seed, r, info) {
    if (r.seq !== this.len(r.signer) + 1) fail("signed_seq");
    const s = signSealed(this.genesis, this.sealWith(r, info), seed);
    this.recs[r.signer].push(s);
    return s;
  }
  /** Every record in the canonical order (spec "Applying records"). */
  order() {
    const out = [];
    const next = [1, 1, 1];
    const placed = (s, seq) => seq < next[s];
    const ready = (r) =>
      r.signer === SERVER ? placed(WHITE, r.seen) && placed(BLACK, r.seenB) : placed(other(r.signer), r.seen);
    const cls = (r) => (r.signer === SERVER ? 0 : isMove(r.op) ? 1 : r.op === 229 ? 2 : 3);
    for (;;) {
      let best;
      for (const s of [SERVER, WHITE, BLACK]) {
        const r = this.get(s, next[s]);
        if (r && ready(r) && (!best || cls(r) < cls(best))) best = r;
      }
      if (!best) return out;
      out.push(best);
      next[best.signer]++;
    }
  }
}
