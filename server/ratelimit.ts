// Anti-abuse limits: token buckets per client (messages, chat) and per key (logins by address or account).
// A bucket holds `burst` tokens and refills `perSec` tokens a second; each action takes one.
import type { IncomingMessage } from "node:http";

export class Bucket {
  private tokens: number;
  private at: number;
  constructor(private perSec: number, private burst: number, now = Date.now()) {
    this.tokens = burst;
    this.at = now;
  }
  /** Takes one token if there is one. */
  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.perSec);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** One bucket per key (an address, an account name), forgotten after a quiet while so the map stays small. */
export class KeyedLimiter {
  private buckets = new Map<string, { b: Bucket; seen: number }>();
  constructor(private perSec: number, private burst: number, private forgetMs = 10 * 60_000) {}
  take(key: string, now = Date.now()): boolean {
    let e = this.buckets.get(key);
    if (!e) {
      if (this.buckets.size > 50_000) this.sweep(now);
      e = { b: new Bucket(this.perSec, this.burst, now), seen: now };
      this.buckets.set(key, e);
    }
    e.seen = now;
    return e.b.take(now);
  }
  private sweep(now: number) {
    for (const [k, e] of this.buckets) if (now - e.seen > this.forgetMs) this.buckets.delete(k);
  }
}

/** Failed password tries per account: after `free` misses each further try waits longer (1 s, 2 s, 4 s ... max 15 min). */
export class FailDelay {
  private fails = new Map<string, { n: number; until: number }>();
  constructor(private free = 5, private maxMs = 15 * 60_000) {}
  /** Milliseconds left before this key may try again (0 = may try now). */
  wait(key: string, now = Date.now()): number {
    const f = this.fails.get(key);
    return f ? Math.max(0, f.until - now) : 0;
  }
  fail(key: string, now = Date.now()) {
    const f = this.fails.get(key) ?? { n: 0, until: 0 };
    f.n++;
    f.until = f.n > this.free ? now + Math.min(this.maxMs, 1000 * 2 ** (f.n - this.free - 1)) : 0;
    this.fails.set(key, f);
  }
  ok(key: string) { this.fails.delete(key); }
}

/** The player's address: the first X-Forwarded-For hop behind a trusted proxy (TRUST_PROXY, e.g. Railway), else the socket. */
export function clientIp(req?: Pick<IncomingMessage, "headers"> & { socket?: { remoteAddress?: string } }): string {
  const fwd = process.env.TRUST_PROXY ? String(req?.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "";
  return fwd || req?.socket?.remoteAddress || "";
}

export const isLocalIp = (ip: string) => !ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127.");

// ---- Limits (tuned to stay far above what a real player sends) ------------------------------------------------
/** Every game message from one client. The client sends input when it changes (up to every frame on 144 Hz screens). */
export const MSG_PER_SEC = 200, MSG_BURST = 400;
/** A client with this many messages dropped (over the limit) within the window is disconnected. */
export const MSG_KICK_AFTER = 2000, MSG_KICK_WINDOW_MS = 10_000;
/** Chat lines (and chat commands) per client. */
export const CHAT_PER_SEC = 1, CHAT_BURST = 5;
/** Trade and group invites per client (each one pops up on someone else's screen). */
export const ASK_PER_SEC = 0.5, ASK_BURST = 4;
/** Crafting at a trader (Wren's "break" and "lutefit"): each one rewrites the bag or the lute and saves materials. */
export const CRAFT_PER_SEC = 3, CRAFT_BURST = 6;
/** Login and account checks per address: 60 at once (a whole school or LAN reconnecting after an update), then 1/s. Wrong passwords are slowed per account too. */
export const LOGIN_PER_SEC = 1, LOGIN_BURST = 60;
/** New accounts per address: 10 at once, then one every 2 minutes. */
export const SIGNUP_PER_SEC = 1 / 120, SIGNUP_BURST = 10;
