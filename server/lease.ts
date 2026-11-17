/**
 * Leases (roadmap M5 "Ages"): who runs a singleton timer (the war's tick, the world's writes) when several servers
 * share one Postgres, two Ages side by side or the old and new server overlapping during a deploy. A lease is a row
 * of table `leases` (server/store.ts pgLeases) taken for a short time and renewed; another holder may take it only once
 * it ran out, so one holder at a time. Only an Age whose AGE_ROLE is "primary" (the default) competes; a "vanguard" or
 * "draining" Age never holds one. Without Postgres (JSON files: one process) a primary always holds every lease.
 * Account leases (server/accountGuard.ts) pass `primary = true` whatever the role: every Age competes for its players.
 */

/** Where leases live: one batched call takes or renews several keys, another gives them up. */
export interface LeaseBackend {
  /** Takes each key for `holder` for `ttlMs` when it is free, ran out, or is the holder's already. The keys held now. */
  acquire(keys: readonly string[], holder: string, ttlMs: number): Promise<string[]>;
  /** Gives up the keys `holder` holds (others' are untouched). */
  release(keys: readonly string[], holder: string): Promise<void>;
}

export const LEASE = {
  /** How long a taken lease lasts without renewal (a crashed holder is replaced after at most this). */
  ttlMs: 45_000,
  /** How often holders renew (and others try to take over). */
  renewMs: 15_000,
  /** A holder stops trusting its lease this long before the store would let it go (clock drift, slow queries). */
  skewMs: 5_000,
};

export type AgeRole = "primary" | "vanguard" | "draining";
/** This server's role among the Ages (env AGE_ROLE; anything unknown is primary, so today's single server stays primary). */
export const ageRole = (env = process.env): AgeRole => (env.AGE_ROLE === "vanguard" || env.AGE_ROLE === "draining" ? env.AGE_ROLE : "primary");
/** This build (the same id server/index.ts reports), for the holder id and per-build snapshots. */
export const buildId = (env = process.env): string => env.RAILWAY_DEPLOYMENT_ID || env.RAILWAY_GIT_COMMIT_SHA || `start-${START}`;
const START = Date.now();
/** Who holds: the Age slot (env AGE_SLOT, default "main") and the build, so an old and a new build of one slot differ. */
export const holderId = (env = process.env): string => `${env.AGE_SLOT || "main"}:${buildId(env)}`;

/**
 * One holder's leases on a backend (undefined: no shared store, always granted to a primary). `renew()` takes or
 * renews every wanted key in one call; `held(key)` trusts the last answer only until it could have run out.
 */
export class Leases {
  private wanted = new Set<string>();
  private got = new Map<string, number>(); // key -> local time until which it is trusted
  constructor(
    readonly backend: LeaseBackend | undefined,
    readonly holder = holderId(),
    readonly primary = ageRole() === "primary",
    private now: () => number = () => performance.now(), // (monotonic: a wall-clock jump must not stretch the trust window)
    readonly ttlMs = LEASE.ttlMs,
  ) {
    if (!(ttlMs > LEASE.skewMs)) throw new Error(`Lease ttlMs (${ttlMs}) must be longer than skewMs (${LEASE.skewMs})`);
  }
  /** A shared store decides (false: always granted to a primary, never to the others). */
  get shared() { return !!this.backend; }
  want(key: string) { this.wanted.add(key); return this; }
  held(key: string): boolean {
    if (!this.primary || !this.wanted.has(key)) return false;
    if (!this.backend) return true;
    return (this.got.get(key) ?? -Infinity) > this.now();
  }
  /**
   * Takes or renews every wanted key (one call). A failed call keeps what was held until it runs out. Returns the keys
   * another holder has (the call went through and did not get them), undefined when the call failed.
   */
  async renew(): Promise<string[] | undefined> {
    if (!this.primary || !this.backend || !this.wanted.size) return [];
    const at = this.now(), asked = [...this.wanted];
    try {
      const keys = new Set(await this.backend.acquire(asked, this.holder, this.ttlMs));
      const until = at + this.ttlMs - LEASE.skewMs;
      // (only the keys asked about: a take() or drop() that ran meanwhile keeps its own answer)
      for (const k of asked) if (keys.has(k) && this.wanted.has(k)) this.got.set(k, until); else this.got.delete(k);
      return asked.filter((k) => !keys.has(k));
    } catch (e: any) {
      console.error("Leases: could not renew:", e?.message ?? e);
      return undefined;
    }
  }
  /**
   * Wants one more key and tries to take it now (account leases, server/accountGuard.ts: one call per login). True when
   * held. A failed call throws (the caller decides; nothing is assumed held).
   */
  async take(key: string): Promise<boolean> {
    this.wanted.add(key);
    if (!this.primary) return false;
    if (!this.backend) return true;
    const at = this.now();
    const got = (await this.backend.acquire([key], this.holder, this.ttlMs)).includes(key);
    if (got && this.wanted.has(key)) this.got.set(key, at + this.ttlMs - LEASE.skewMs); else this.got.delete(key);
    return got;
  }
  /** No longer wants these keys and gives them up, in one call (others may take them at once). Throws when the store cannot be reached. */
  async drop(keys: string | readonly string[]): Promise<void> {
    const ks = typeof keys === "string" ? [keys] : [...keys];
    for (const k of ks) { this.wanted.delete(k); this.got.delete(k); }
    if (this.backend && ks.length) await this.backend.release(ks, this.holder);
  }
  /** Every key this holder wants (held or not). */
  keys(): string[] { return [...this.wanted]; }
  /** Gives up every lease (shutting down): another primary takes them at its next renewal. */
  async release(): Promise<void> {
    const keys = [...this.got.keys()];
    this.got.clear();
    if (!this.backend || !keys.length) return;
    await this.backend.release(keys, this.holder).catch((e: any) => console.error("Leases: could not release:", e?.message ?? e));
  }
}

/** A lease backend in memory with its own clock, with the Postgres rules (tests: several holders in one process). */
export function memLeases(now: () => number = Date.now): LeaseBackend & { rows: Map<string, { holder: string; until: number }> } {
  const rows = new Map<string, { holder: string; until: number }>();
  return {
    rows,
    async acquire(keys, holder, ttlMs) {
      const out: string[] = [], t = now();
      for (const k of keys) {
        const r = rows.get(k);
        if (!r || r.until < t || r.holder === holder) { rows.set(k, { holder, until: t + ttlMs }); out.push(k); }
      }
      return out;
    },
    async release(keys, holder) { for (const k of keys) if (rows.get(k)?.holder === holder) rows.delete(k); },
  };
}
