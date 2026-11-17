/**
 * Follower queues (Ages, roadmap M5; docs/ages-progress.md): what a player does on a server that does not own a shared
 * row (the war, the world, the idea log) reaches the owner through a queue per following server, kv key
 * `<prefix><holder>`. Only that server writes its queue: each beat it appends what happened since as a numbered batch
 * (`seq`) and drops the batches the owner has counted. The owner lists every queue of the prefix, applies each batch it
 * has not counted yet and records the last `seq` counted per holder in its own row (`drained`), in the same write as
 * the change: a batch is applied once, whichever server owns, however often either restarts. Never two writers on a key.
 */
import { accountLeasesOn } from "./accountGuard";
import type { Kv } from "./store";

/**
 * Whether per-server state (the handoff spots, the idea log) moves to the shared store: only for a real multi-server
 * setup (Postgres and AGE_SLOT or ACCOUNT_LEASES=1, as the account leases). Today's single server, even on Postgres,
 * keeps data/handoff.json and the idea file.
 */
export const sharedStateOn = (env = process.env) => accountLeasesOn(env);

/** One batch: its number in the holder's queue and the module's own payload (which must not use `seq`). */
export type Batch<B> = B & { seq: number };
export interface QueueRow<B> { holder: string; seq: number; batches: Batch<B>[] }
/** Per holder, the last batch the owner counted (kept in the owner's row). */
export type Drained = Record<string, number>;

const int0 = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : undefined);

export class AgeQueue<B extends object> {
  private row?: QueueRow<B>;
  /**
   * `cleanBatch`: a raw batch's payload made safe (any server's row: never trusted), undefined to skip it.
   * `maxBatches`: most batches kept while the owner does not count them (the oldest go first).
   */
  constructor(readonly prefix: string, private cleanBatch: (raw: Record<string, unknown>) => B | undefined, readonly maxBatches = 240) {}

  /** A raw queue row cleaned, or undefined when it is not one. */
  clean(raw: unknown): QueueRow<B> | undefined {
    const r = raw && typeof raw === "object" ? (raw as Partial<QueueRow<unknown>>) : undefined;
    if (!r || typeof r.holder !== "string" || !r.holder || r.holder.length > 200 || int0(r.seq) === undefined || !Array.isArray(r.batches)) return undefined;
    const batches = r.batches.flatMap((b): Batch<B>[] => {
      const seq = int0((b as { seq?: unknown })?.seq), body = seq === undefined ? undefined : this.cleanBatch(b as Record<string, unknown>);
      return body ? [{ ...body, seq: seq! }] : [];
    });
    return { holder: r.holder, seq: r.seq!, batches };
  }

  /** This server's batches written but not counted yet (seq above `seen`), oldest first: what it still waits for. */
  unseen(seen: number): Batch<B>[] { return this.row?.batches.filter((b) => b.seq > seen) ?? []; }

  /**
   * A follower's beat: drops the batches the owner counted (up to `seen`, from the owner's row), appends `add` as a new
   * batch, and writes the queue when it changed (through `write`, e.g. a module's one-write-at-a-time chain). The row is
   * read once (a restart goes on numbering where it stopped).
   */
  async push(kv: Kv, holder: string, seen: number, add?: B, write: (f: () => Promise<void>) => Promise<unknown> = (f) => f()): Promise<void> {
    const key = this.prefix + holder;
    if (!this.row || this.row.holder !== holder) {
      this.row = this.clean(await kv.get(key)) ?? { holder, seq: 0, batches: [] };
      this.row.holder = holder;
    }
    const q = this.row, n = q.batches.length;
    q.batches = q.batches.filter((b) => b.seq > seen);
    q.seq = Math.max(q.seq, seen);
    let dirty = q.batches.length !== n;
    if (add) { q.batches.push({ ...add, seq: ++q.seq }); dirty = true; }
    if (q.batches.length > this.maxBatches) q.batches.splice(0, q.batches.length - this.maxBatches);
    if (dirty) await write(async () => { await kv.set(key, q).catch((e) => console.error(`Ages: could not write queue ${key}:`, e?.message ?? e)); });
  }

  /** Forget the row read (tests, a module reset). */
  reset() { this.row = undefined; }

  /**
   * The owner: hands every queue's batches not counted yet (by `drained`) to `apply`, oldest first per holder. Returns
   * the new `drained` (holders whose queue is gone are dropped: nothing left to count), or undefined when the queues
   * could not be read (nothing applied).
   */
  async drain(kv: Kv | undefined, drained: Drained | undefined, apply: (b: Batch<B>, holder: string) => void): Promise<Drained | undefined> {
    if (!kv?.list) return undefined;
    let qs: Record<string, unknown>;
    try { qs = await kv.list(this.prefix); } catch (e: any) { console.error(`Ages: could not read the queues ${this.prefix}*:`, e?.message ?? e); return undefined; }
    const out: Drained = {};
    for (const raw of Object.values(qs)) {
      const q = this.clean(raw);
      if (!q) continue;
      const seen = drained?.[q.holder] ?? 0;
      let top = seen;
      for (const b of q.batches.sort((x, y) => x.seq - y.seq)) {
        if (b.seq <= seen) continue;
        try { apply(b, q.holder); } catch (e) { console.error(`Ages: a batch of ${this.prefix}${q.holder} failed (skipped):`, e); }
        top = Math.max(top, b.seq);
      }
      if (top > 0) out[q.holder] = top;
    }
    return out;
  }
}

/** Two drained maps are the same (a row needs writing only when its marks moved). */
export const sameDrained = (a: Drained | undefined, b: Drained | undefined) => {
  const ka = Object.keys(a ?? {}), kb = Object.keys(b ?? {});
  return ka.length === kb.length && ka.every((k) => a![k] === b?.[k]);
};
