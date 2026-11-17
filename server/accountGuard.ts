/**
 * One account, one server (Ages, docs/ages-progress.md part 3). With several game servers on one Postgres, an account is
 * open on one server at a time: the server that plays it (or edits it over HTTP) holds lease `acct:<lower-case name>`
 * (server/lease.ts, table `leases`), and the account rows are written through a fence (server/store.ts saveFenced) that
 * writes only where this holder's lease still runs. Taking the lease reloads the row unless this server held it already
 * (then its memory is the newest). The lease is given back only after the account's last change is committed.
 * On only with Postgres and AGE_SLOT or ACCOUNT_LEASES=1 (`accountLeasesOn`); off, server/accounts.ts never makes one.
 */
import crypto from "node:crypto";
import { holderId, LEASE, Leases, type LeaseBackend } from "./lease";

/** Lease key prefix of an account (the account's key, its lower-case name, follows). */
export const ACCT = "acct:";

export const ACCOUNT_LEASE = {
  /** Tries to take a lease another server holds (it may be saving a player who just left there), ~1 s apart. */
  tries: 4,
  retryMs: 1000,
  /** A seat whose client left before onJoin (Colyseus then skips onLeave) gives its account back after this (TownRoom). */
  orphanMs: 10_000,
};

/**
 * The account-lease holder: the Age slot and build (server/lease.ts holderId) and a random part per process, so two
 * processes of one build never share a holder (each would think the other's lease its own). A restarted process gets a
 * new one: its old leases simply run out (45 s) or were given back at shutdown.
 */
export const accountHolder = (env = process.env) => `${holderId(env)}:${crypto.randomUUID().slice(0, 8)}`;

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
  /** Another server took the lease of an account in use here (server/TownRoom.ts sends its players away). */
  lost?(k: string): void;
}

/** Counters since boot (server/agesStatus.ts, /admin/ages.json): how often logins were let in, refused or retried. */
export interface GuardStats {
  /** Claims that went through ("mine" or "fresh"). */
  ok: number;
  /** Refused: another server holds the account. */
  elsewhere: number;
  /** Refused: a hero of the account is already in a room here. */
  playing: number;
  /** Waits for a lease held elsewhere (each try after the first). */
  retries: number;
  /** Accounts a renewal showed another server took (their players here sent away when in use). */
  lost: number;
}

export class AccountGuard {
  readonly leases: Leases;
  readonly stats: GuardStats = { ok: 0, elsewhere: 0, playing: 0, retries: 0, lost: 0 };
  private uses = new Map<string, number>(); // sessions and HTTP edits per account, across every room of this process
  private plays = new Map<string, number>(); // of those, heroes in a room
  private open = new Map<string, number>(); // of those, the ones whose claim went through (their player sees this memory)
  private locks = new Map<string, Promise<unknown>>(); // per account: claim and release one after another
  private io: Promise<unknown> = Promise.resolve(); // lease calls one after another (a renewal must not re-take a key just released)
  private taken = new Set<string>(); // accounts a renewal showed another server holds: never written from here again
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    readonly backend: LeaseBackend,
    readonly hooks: GuardHooks,
    readonly holder = accountHolder(),
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
   * A refused write of this account is kept to try again (server/accounts.ts flush): the lease is still wanted here and
   * no renewal has shown another holder (it only lapsed, e.g. a database outage). False: give the changes up.
   */
  retryWrite(k: string) { return this.leases.keys().includes(ACCT + k) && !this.taken.has(k); }
  /** A renewal showed another server holds this account: this server's memory of it is stale. */
  takenElsewhere(k: string) { return this.taken.has(k); }

  /**
   * Takes the account for a session (`play`: a hero joining a room) or an HTTP edit. Counted at once (before any wait),
   * so a second hero of one account in any room here gets "playing". Retries a lease held elsewhere a few times. Every
   * answer but "elsewhere" / "playing" (and a throw) must be matched by one `leave(k, play)`.
   */
  async claim(k: string, play = false): Promise<Claim> {
    if (play && this.playing(k) > 0) { this.stats.playing++; return "playing"; }
    if (this.taken.has(k) && this.count(k) > 0) { this.stats.elsewhere++; return "elsewhere"; } // (its stale session here is being sent away)
    this.add(k, play, 1);
    try {
      const r = await this.locked(k, async (): Promise<Claim> => {
        // (in use here by another session or edit: memory is what that player sees, never reloaded under them)
        const lk = ACCT + k, was = !this.taken.has(k) && (this.leases.held(lk) || (this.open.get(k) ?? 0) > 0), tries = this.opts.tries ?? ACCOUNT_LEASE.tries;
        for (let i = 0; ; i++) {
          if (await this.call(() => this.leases.take(lk))) {
            if (!was) { await this.hooks.reload(k); this.taken.delete(k); }
            this.open.set(k, (this.open.get(k) ?? 0) + 1); // (counted inside the lock: the next claim sees it)
            return was ? "mine" : "fresh";
          }
          if (i + 1 >= tries) return "elsewhere";
          this.stats.retries++;
          await (this.opts.sleep ?? wait)(this.opts.retryMs ?? ACCOUNT_LEASE.retryMs);
        }
      });
      if (r === "elsewhere") { this.stats.elsewhere++; this.add(k, play, -1); await this.releaseIdle(k); }
      else this.stats.ok++;
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
    const others = await this.call(() => this.leases.renew());
    for (const lk of others ?? []) {
      const k = lk.slice(ACCT.length);
      if (this.taken.has(k)) continue;
      this.taken.add(k); this.stats.lost++;
      console.error(`Accounts: another server took the lease of ${k}: its changes here are not saved${this.count(k) > 0 ? ", its players here are sent away" : ""}`);
      if (this.count(k) > 0) this.hooks.lost?.(k);
    }
    for (const lk of this.leases.keys()) {
      const k = lk.slice(ACCT.length);
      if (this.count(k) === 0) void this.releaseIdle(k);
    }
  }

  /** Account leases held now (trusted), and how many accounts are in use here (sessions or edits). */
  held() { return this.leases.keys().filter((lk) => this.leases.held(lk)).length; }
  inUseCount() { return this.uses.size; }

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
      this.taken.delete(k);
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
