// One account, one server (Ages part 3: server/accountGuard.ts, server/accounts.ts in shared mode): account leases,
// fresh reads at login, the write fence, release only after a committed write, and the off switch.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { memLeases } from "../server/lease";
import { AccountGuard, accountLeasesOn, ACCT } from "../server/accountGuard";
import { memDb } from "./helpers/fencedStore";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acctguard-test-"));
process.env.SAVE_FILE = path.join(dir, "saves.json");
const IP = "127.0.0.1";

/** One game server's view of the accounts (memory, unsaved keys) with its guard, on a shared table and lease backend. */
function server(holder: string, db: ReturnType<typeof memDb<any>>, leases: ReturnType<typeof memLeases>, now: () => number) {
  const mem: Record<string, any> = {}, dirty = new Set<string>();
  const write = async () => {
    const keys = [...dirty], ch: Record<string, any> = {};
    for (const k of keys) ch[k] = mem[k];
    dirty.clear();
    try { return await db.store.saveFenced!(ch, holder, ACCT); } catch (e) { for (const k of keys) dirty.add(k); throw e; }
  };
  const guard = new AccountGuard(leases, {
    reload: async (k) => { const r = await db.store.loadOne!(k); if (r) mem[k] = r; },
    settle: async (k) => { if (!dirty.has(k)) return true; try { await write(); } catch { return false; } return !dirty.has(k); },
    unsaved: (k) => dirty.has(k),
  }, holder, { now, tries: 2, sleep: async () => {} });
  return { mem, dirty, guard, write };
}
function world() {
  let t = 10_000;
  const now = () => t, leases = memLeases(now), db = memDb<any>(leases, now);
  return { leases, db, now, tick: (ms: number) => { t += ms; } };
}
const acct = (name: string, pw: string, extra: Record<string, unknown> = {}) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return { name, salt, hash: crypto.scryptSync(pw, salt, 32).toString("hex"), created: 1, heroes: {}, ...extra };
};

test("account leases: off unless Postgres and AGE_SLOT or ACCOUNT_LEASES=1; off, accounts.ts claims nothing", async () => {
  assert.equal(accountLeasesOn({}), false);
  assert.equal(accountLeasesOn({ ACCOUNT_LEASES: "1" }), false, "no Postgres: one process, nothing to share");
  assert.equal(accountLeasesOn({ DATABASE_URL: "postgres://x" }), false, "today's single server");
  assert.equal(accountLeasesOn({ DATABASE_URL: "postgres://x", ACCOUNT_LEASES: "1" }), true);
  assert.equal(accountLeasesOn({ DATABASE_URL: "postgres://x", AGE_SLOT: "blue" }), true);
  const acc = await import("../server/accounts");
  assert.equal(acc.accountsShared(), false);
  assert.equal(await acc.login("Plainjane", "longenough", IP), "Plainjane");
  assert.equal(await acc.claimAccount("Plainjane"), "mine", "off: nothing to take");
  await acc.leaveAccount("Plainjane"); await acc.releaseAccounts();
  // An Age slot without the shared database refuses to start
  const keep = { slot: process.env.AGE_SLOT, url: process.env.DATABASE_URL };
  process.env.AGE_SLOT = "blue"; delete process.env.DATABASE_URL;
  try { await assert.rejects(acc.initAccounts(), /AGE_SLOT is set but DATABASE_URL is not/); }
  finally { if (keep.slot === undefined) delete process.env.AGE_SLOT; else process.env.AGE_SLOT = keep.slot; if (keep.url !== undefined) process.env.DATABASE_URL = keep.url; }
  assert.equal(acc.accountsShared(), false);
});

test("account guard: a second server is refused until the first saves and lets go, then reads the newest row", async () => {
  const w = world();
  w.db.rows.set("bob", { name: "Bob", gold: 1 });
  const a = server("A", w.db, w.leases, w.now), b = server("B", w.db, w.leases, w.now);
  assert.equal(await a.guard.claim("bob", true), "fresh");
  assert.equal(a.mem.bob.gold, 1);
  a.mem.bob.gold = 5; a.dirty.add("bob");
  assert.equal(await b.guard.claim("bob", true), "elsewhere");
  assert.equal(w.leases.rows.get("acct:bob")?.holder, "A");
  assert.equal(b.guard.count("bob"), 0, "a refused claim is not counted");
  await a.guard.leave("bob", true);
  assert.equal(w.db.rows.get("bob").gold, 5, "saved before the lease went back");
  assert.equal(w.leases.rows.has("acct:bob"), false, "then released");
  assert.equal(await b.guard.claim("bob", true), "fresh");
  assert.equal(b.mem.bob.gold, 5, "B reads A's last save");
  // A server already holding the account keeps its memory (newest), and a second hero here is "playing"
  assert.equal(await b.guard.claim("bob", true), "playing");
  b.mem.bob.gold = 7;
  assert.equal(await b.guard.claim("bob"), "mine", "an edit while the hero plays here: no reload");
  assert.equal(b.mem.bob.gold, 7);
  await b.guard.leave("bob");
  assert.equal(w.leases.rows.get("acct:bob")?.holder, "B", "kept while the hero plays");
});

test("account guard: a lease that ran out and was taken over fences the old holder's writes", async () => {
  const w = world();
  w.db.rows.set("eve", { name: "Eve", gold: 1 });
  const a = server("A", w.db, w.leases, w.now), b = server("B", w.db, w.leases, w.now);
  assert.equal(await a.guard.claim("eve", true), "fresh");
  w.tick(46_000); // A stalled past the lease's end
  assert.equal(a.guard.owns("eve"), false, "A no longer trusts it");
  assert.equal(await b.guard.claim("eve", true), "fresh");
  b.mem.eve.gold = 9; b.dirty.add("eve"); await b.write();
  a.mem.eve.gold = 100; a.dirty.add("eve");
  assert.deepEqual(await a.write(), ["eve"], "A's write is refused");
  assert.equal(w.db.rows.get("eve").gold, 9, "B's save stands");
  // A's renewal cannot take it back while B holds it
  await a.guard.renewAll();
  assert.equal(a.guard.owns("eve"), false);
  assert.equal(w.leases.rows.get("acct:eve")?.holder, "B");
});

test("account guard: never released after a failed write; the next renewal saves and releases", async () => {
  const w = world();
  w.db.rows.set("kim", { name: "Kim", gold: 1 });
  const a = server("A", w.db, w.leases, w.now);
  await a.guard.claim("kim", true);
  a.mem.kim.gold = 3; a.dirty.add("kim");
  w.db.fail = true;
  const err = console.error; console.error = () => {};
  try { await a.guard.leave("kim", true); } finally { console.error = err; }
  assert.equal(w.leases.rows.get("acct:kim")?.holder, "A", "the write failed: the lease is kept");
  assert.equal(w.db.rows.get("kim").gold, 1);
  w.db.fail = false;
  await a.guard.renewAll();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(w.db.rows.get("kim").gold, 3, "saved at the renewal");
  assert.equal(w.leases.rows.has("acct:kim"), false, "then released");
  // Shutdown: every lease goes back in one call, except an account left unsaved
  await a.guard.claim("kim", true);
  w.db.rows.set("lou", { name: "Lou" }); await a.guard.claim("lou", true);
  a.dirty.add("lou");
  await a.guard.releaseAll();
  assert.equal(w.leases.rows.has("acct:kim"), false);
  assert.equal(w.leases.rows.get("acct:lou")?.holder, "A", "unsaved: kept");
});

test("accounts (shared): an account made on another server is found at login (no second account, no takeover)", async () => {
  const acc = await import("../server/accounts");
  const leases = memLeases(), db = memDb<any>(leases);
  await acc.initAccounts({ store: db.store, leases, holder: "B", retryMs: 1 });
  assert.equal(acc.accountsShared(), true);
  assert.deepEqual(await acc.peek("Alice", "whatever1", IP), { exists: false, heroes: {} });
  db.rows.set("alice", acct("Alice", "alicepass1")); // server A made her after B looked
  await assert.rejects(acc.login("alice", "takeover99", IP), /Wrong password/);
  assert.equal(db.rows.get("alice").name, "Alice", "not replaced");
  assert.equal(await acc.login("alice", "alicepass1", IP), "Alice");
  // A changed her password meanwhile: B checks the saved row, not its memory
  db.rows.set("alice", acct("Alice", "newpass123"));
  await assert.rejects(acc.login("Alice", "alicepass1", IP), /Wrong password/);
  assert.equal(await acc.login("Alice", "newpass123", IP), "Alice");
  assert.equal(leases.rows.size, 0, "logins and peeks take no lease");
});

test("accounts (shared): a name made at the same time is one account, the other try a normal login", async () => {
  const acc = await import("../server/accounts");
  const leases = memLeases(), db = memDb<any>(leases);
  await acc.initAccounts({ store: db.store, leases, holder: "B", retryMs: 1 });
  const r = await Promise.allSettled([acc.login("Twin", "firstpass1", IP), acc.login("twin", "otherpass2", IP)]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.match(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason), /Wrong password/);
  assert.equal(db.rows.size, 1);
  // Another server makes the name between this server's look and its write: same password logs in to theirs
  db.beforeInsert = (k) => { if (k === "racer") db.rows.set(k, acct("RACER", "racerpass1")); };
  assert.equal(await acc.login("racer", "racerpass1", IP), "RACER");
  db.rows.delete("racer");
  await assert.rejects(acc.login("racer", "mineminemine", IP), /Wrong password/);
  assert.equal(db.rows.get("racer").name, "RACER");
});

test("accounts (shared): saves only under the lease; an account taken over is not written; edits wait for the player to leave", async () => {
  const acc = await import("../server/accounts");
  const leases = memLeases(), db = memDb<any>(leases);
  await acc.initAccounts({ store: db.store, leases, holder: "B", retryMs: 1 });
  assert.equal(await acc.login("Hero", "heropass1", IP), "Hero");
  assert.equal(await acc.claimAccount("Hero"), "fresh");
  assert.equal(await acc.claimAccount("hero"), "playing", "a second hero of this account, any room");
  const hero = { color: 1, xp: 5, level: 2 } as any;
  acc.saveHero("Hero", "wizard", hero);
  await acc.flush();
  assert.equal(db.rows.get("hero").heroes.wizard.level, 2);
  // The lease is lost (this server stalled) and another server took it: the renewal sees it (the room is told, to send
  // the hero away), and nothing is written or retried
  const lost: string[] = []; acc.onAccountLost((k) => lost.push(k));
  leases.rows.set("acct:hero", { holder: "A", until: Date.now() + 60_000 });
  acc.saveHero("Hero", "wizard", { ...hero, level: 50 });
  const err = console.error; let said = ""; console.error = (...a: unknown[]) => { said += a.join(" "); };
  try { await acc.renewAccounts(); await acc.flush(); } finally { console.error = err; }
  assert.deepEqual(lost, ["hero"]);
  assert.match(said, /not saved, another server has them/);
  assert.equal(db.rows.get("hero").heroes.wizard.level, 2);
  const n = db.writes; await acc.flush(); assert.equal(db.writes, n, "dropped, not retried");
  // An email change while the hero plays on server A: refused; after A let go: saved, lease given back
  await assert.rejects(acc.setEmail("Hero", "heropass1", "h@example.com", IP), /Leave the game first/);
  leases.rows.delete("acct:hero");
  await acc.leaveAccount("Hero");
  assert.equal(await acc.setEmail("Hero", "heropass1", "h@example.com", IP), "h@example.com");
  assert.equal(db.rows.get("hero").email, "h@example.com", "written before the answer");
  assert.equal(leases.rows.has("acct:hero"), false);
  // The reset by email finds the row through the store (not this server's memory)
  db.rows.set("other", acct("Other", "otherpass1", { email: "o@example.com" }));
  const { outbox } = await import("../server/mailer");
  assert.deepEqual(await acc.requestReset("o@example.com", IP), { sent: true });
  const code = /Code: (\d{6})/.exec(outbox.at(-1)!.text)![1];
  assert.ok(db.rows.get("other").reset, "the code is saved in the row");
  assert.equal(leases.rows.has("acct:other"), false, "and the lease given back");
  // A guessed name without a pending code takes no lease; the right code changes the password under the lease
  await assert.rejects(acc.resetPassword("Hero", "123456", "brandnew99", IP), /wrong or too old/);
  assert.equal(leases.rows.has("acct:hero"), false);
  assert.equal(await acc.resetPassword("Other", code, "brandnew99", IP), "Other");
  assert.equal(await acc.login("Other", "brandnew99", IP), "Other");
  assert.equal(leases.rows.size, 0);
});

test("account guard: claims at the same moment reload once; a lease re-taken under a live player keeps that player's memory", async () => {
  const w = world();
  w.db.rows.set("ada", { name: "Ada", gold: 1 });
  const a = server("A", w.db, w.leases, w.now);
  a.mem.ada = { name: "Ada", gold: -1 }; // stale memory from an earlier visit
  const [edit, play] = await Promise.all([a.guard.claim("ada"), a.guard.claim("ada", true)]);
  assert.deepEqual([edit, play], ["fresh", "mine"]);
  assert.equal(a.mem.ada.gold, 1, "the first claim read the row");
  await a.guard.leave("ada");
  a.mem.ada.gold = 50; // the player earns gold here
  w.tick(41_000); // a renewal failed: the lease is no longer trusted here, but nobody took it
  assert.equal(a.guard.owns("ada"), false);
  assert.equal(await a.guard.claim("ada"), "mine", "re-taken while the hero plays: not reloaded under them");
  assert.equal(a.mem.ada.gold, 50);
  await a.guard.leave("ada"); await a.guard.leave("ada", true);
  assert.equal(w.leases.rows.has("acct:ada"), false);
});

test("accounts (shared): a lease that only lapsed (database outage, nobody took it) keeps the save and the lease until renewed", async () => {
  const acc = await import("../server/accounts");
  const leases = memLeases(), db = memDb<any>(leases);
  await acc.initAccounts({ store: db.store, leases, holder: "B", retryMs: 1 });
  await acc.login("Lapse", "lapsepass1", IP);
  assert.equal(await acc.claimAccount("Lapse"), "fresh");
  acc.saveHero("Lapse", "wizard", { level: 2 } as any);
  await acc.flush();
  assert.equal(db.rows.get("lapse").heroes.wizard.level, 2);
  leases.rows.get("acct:lapse")!.until = Date.now() - 1; // ran out while the database could not be reached
  acc.saveHero("Lapse", "wizard", { level: 9 } as any);
  const err = console.error; console.error = () => {};
  try {
    await acc.flush(); // refused by the fence, kept
    await acc.leaveAccount("Lapse"); // the hero leaves: not saved yet, so the lease is not given back
    assert.equal(db.rows.get("lapse").heroes.wizard.level, 2);
    assert.equal(leases.rows.get("acct:lapse")?.holder, "B", "kept");
    await acc.renewAccounts(); // taken again (nobody else had it), then saved and released
    for (let i = 0; i < 20 && leases.rows.has("acct:lapse"); i++) await new Promise((r) => setTimeout(r, 5));
  } finally { console.error = err; }
  assert.equal(db.rows.get("lapse").heroes.wizard.level, 9, "the last save reached the row");
  assert.equal(leases.rows.has("acct:lapse"), false, "released after it");
  // A login now reads the newest row
  assert.equal(await acc.claimAccount("Lapse"), "fresh");
  assert.equal(acc.loadHero("Lapse", "wizard")!.level, 9);
  await acc.leaveAccount("Lapse");
});
