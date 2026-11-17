/**
 * One account, one server (Ages, docs/ages-progress.md part 3). With several game servers on one Postgres, an account is
 * open on one server at a time: the server that plays it (or edits it over HTTP) holds lease `acct:<lower-case name>`
 * (server/lease.ts, table `leases`), and the account rows are written through a fence (server/store.ts saveFenced) that
 * writes only where this holder's lease still runs. Taking the lease reloads the row unless this server held it already
 * (then its memory is the newest). The lease is given back only after the account's last change is committed.
 * On only with Postgres and AGE_SLOT or ACCOUNT_LEASES=1 (`accountLeasesOn`); off, server/accounts.ts never makes one.
 */
import { holderId, LEASE, Leases, type LeaseBackend } from "./lease";

/** Lease key prefix of an account (the account's key, its lower-case name, follows). */
export const ACCT = "acct:";

export const ACCOUNT_LEASE = {
  /** Tries to take a lease another server holds (it may be saving a player who just left there), ~1 s apart. */
  tries: 4,
  retryMs: 1000,
};

/** Account leases are on: a shared Postgres (DATABASE_URL) and an Age slot (AGE_SLOT) or ACCOUNT_LEASES=1. */
export const accountLeasesOn = (env = process.env) => !!env.DATABASE_URL && (!!env.AGE_SLOT || env.ACCOUNT_LEASES === "1");

/**
 * "mine": this server held the lease already (its memory is newest); "fresh": just taken, the row was reloaded;
 * "elsewhere": another server holds it; "playing": a hero of this account is already in a room here.
 */
export type Claim = "mine" | "fresh" | "elsewhere" | "playing";

/** What the guard needs from the account store (server/accounts.ts). */
export interface GuardHooks {
  /** Reads the account's row into memory (the lease was just taken: another server may have written it). */
  reload(k: string): Promise<void>;
  /** Waits until the account's changes are committed; false when a write failed (then the lease is kept). */
  settle(k: string): Promise<boolean>;
  /** The account has changes not written yet. */
  unsaved(k: string): boolean;
}

export class AccountGuard {
  readonly leases: Leases;
  private uses = new Map<string, number>(); // sessions and HTTP edits per account, across every room of this process
  private plays = new Map<string, number>(); // of those, heroes in a room
  private open = new Map<string, number>(); // of those, the ones whose claim went through (their player sees this memory)
  private locks = new Map<string, Promise<unknown>>(); // per account: claim and release one after another
  private io: Promise<unknown> = Promise.resolve(); // lease calls one after another (a renewal must not re-take a key just released)
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    readonly backend: LeaseBackend,
    readonly hooks: GuardHooks,
    readonly holder = holderId(),
    private opts: { now?: () => number; ttlMs?: number; tries?: number; retryMs?: number; sleep?: (ms: number) => Promise<unknown> } = {},
  ) {
    // (primary = true: account leases ignore AGE_ROLE, every Age competes for its own players)
    this.leases = new Leases(backend, holder, true, opts.now, opts.ttlMs);
  }

  /** Sessions and edits of this account here. */
  count(k: string) { return this.uses.get(k) ?? 0; }
  /** Heroes of this account in a room here. */
  playing(k: string) { return this.plays.get(k) ?? 0; }
  /** This server holds the account's lease (and may trust it a while longer). */
  owns(k: string) { return this.leases.held(ACCT + k); }
  /** Memory is this server's to keep: the account is in use here or its lease is held. */
  inUse(k: string) { return this.count(k) > 0 || this.owns(k); }

  /**
   * Takes the account for a session (`play`: a hero joining a room) or an HTTP edit. Counted at once (before any wait),
   * so a second hero of one account in any room here gets "playing". Retries a lease held elsewhere a few times. Every
   * answer but "elsewhere" / "playing" (and a throw) must be matched by one `leave(k, play)`.
   */
  async claim(k: string, play = false): Promise<Claim> {
    if (play && this.playing(k) > 0) return "playing";
    this.add(k, play, 1);
    try {
      const r = await this.locked(k, async (): Promise<Claim> => {
        // (in use here by another session or edit: memory is what that player sees, never reloaded under them)
        const lk = ACCT + k, was = this.leases.held(lk) || (this.open.get(k) ?? 0) > 0, tries = this.opts.tries ?? ACCOUNT_LEASE.tries;
        for (let i = 0; ; i++) {
          if (await this.call(() => this.leases.take(lk))) {
            if (!was) await this.hooks.reload(k);
            this.open.set(k, (this.open.get(k) ?? 0) + 1); // (counted inside the lock: the next claim sees it)
            return was ? "mine" : "fresh";
          }
          if (i + 1 >= tries) return "elsewhere";
          await (this.opts.sleep ?? wait)(this.opts.retryMs ?? ACCOUNT_LEASE.retryMs);
        }
      });
      if (r === "elsewhere") { this.add(k, play, -1); await this.releaseIdle(k); }
      return r;
    } catch (e) {
      this.add(k, play, -1); await this.releaseIdle(k);
      throw e;
    }
  }

  /** A session or edit ends. The last one here saves (waits for the commit) and then gives the lease back. */
  leave(k: string, play = false): Promise<void> {
    this.add(k, play, -1);
    const o = (this.open.get(k) ?? 0) - 1;
    if (o > 0) this.open.set(k, o); else this.open.delete(k);
    return this.releaseIdle(k);
  }

  /** Renews every account lease in one call (every LEASE.renewMs); retries giving back the ones no longer in use. */
  async renewAll(): Promise<void> {
    await this.call(() => this.leases.renew());
    for (const lk of this.leases.keys()) {
      const k = lk.slice(ACCT.length);
      if (this.count(k) > 0 && !this.leases.held(lk)) console.error(`Accounts: lost the lease of ${k} (its saves are refused until it is back)`);
      if (this.count(k) === 0) void this.releaseIdle(k);
    }
  }

  /** Starts renewing (server/accounts.ts initAccounts). */
  start() {
    this.timer ??= setInterval(() => void this.renewAll(), LEASE.renewMs);
    this.timer.unref?.();
  }

  /** Shutting down, after the last write: gives back every lease in one call, except those of accounts not saved. */
  async releaseAll(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const keys = this.leases.keys().filter((lk) => !this.hooks.unsaved(lk.slice(ACCT.length)));
    if (!keys.length) return;
    await this.call(() => this.leases.drop(keys)).catch((e: any) => console.error("Accounts: could not give the leases back:", e?.message ?? e));
  }

  private add(k: string, play: boolean, d: number) {
    const n = this.count(k) + d;
    if (n > 0) this.uses.set(k, n); else this.uses.delete(k);
    if (!play) return;
    const p = this.playing(k) + d;
    if (p > 0) this.plays.set(k, p); else this.plays.delete(k);
  }

  private releaseIdle(k: string): Promise<void> {
    return this.locked(k, async () => {
      const lk = ACCT + k;
      if (this.count(k) > 0 || !this.leases.keys().includes(lk)) return;
      if (!(await this.hooks.settle(k))) { console.error(`Accounts: ${k} is not saved yet: its lease is kept (tried again at the next renewal)`); return; }
      if (this.count(k) > 0) return; // (back while it saved: keep it)
      await this.call(() => this.leases.drop(lk)).catch((e: any) => console.error(`Accounts: could not give back the lease of ${k}:`, e?.message ?? e));
    });
  }

  private call<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.io.then(fn, fn);
    this.io = run.catch(() => {});
    return run;
  }

  private locked<T>(k: string, fn: () => Promise<T>): Promise<T> {
    const run = (this.locks.get(k) ?? Promise.resolve()).then(fn, fn);
    const tail = run.catch(() => {});
    this.locks.set(k, tail);
    void tail.then(() => { if (this.locks.get(k) === tail) this.locks.delete(k); });
    return run;
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
