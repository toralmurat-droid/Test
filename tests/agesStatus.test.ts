// Ages status (server/agesStatus.ts, GET /admin/ages.json): the admin key is required; slot, role, build, roles of the
// war / world / forge, leases held, account counters and flush lag are present and sane with leases off (one server,
// JSON-like stores) and with leases on (memLeases: another server holds the war, the world and an account).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import express from "express";
import { Leases, memLeases, type LeaseBackend } from "../server/lease";
import type { Kv, Store } from "../server/store";
import { memDb } from "./helpers/fencedStore";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ages-status-"));
process.env.SAVE_FILE = path.join(dir, "saves.json"); // (before server/accounts.ts loads: never the repo's data/)
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const mods = async () => ({
  status: await import("../server/agesStatus"),
  war: await import("../server/war"),
  forge: await import("../server/forge"),
  world: await import("../server/worldStore"),
  acc: await import("../server/accounts"),
});

function memKv(leases?: LeaseBackend): Kv {
  const m = new Map<string, string>();
  const kv: Kv = {
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)!) : undefined),
    set: async (k, v) => { m.set(k, JSON.stringify(v)); },
    insertIfAbsent: async (k, v) => { if (m.has(k)) return false; await kv.set(k, v); return true; },
    list: async <T>(p: string) => Object.fromEntries([...m].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, JSON.parse(v) as T])),
    leases,
  };
  return kv;
}
function memWorld(): Store<any> {
  const rows: Record<string, any> = {};
  return { kind: "postgres", load: async () => ({ ...rows }), loadOne: async (k: string) => rows[k], save: async (c: Record<string, any>) => { Object.assign(rows, c); } } as unknown as Store<any>;
}
const online = () => ({ players: 3, accounts: 2 });

test("GET /admin/ages.json needs the admin key", async () => {
  const { status } = await mods();
  const key = "a-long-admin-key";
  const adminOk = (req: express.Request) => {
    const want = Buffer.from(key), got = Buffer.from(String(req.query.key ?? ""));
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  };
  const app = express();
  status.mountAgesStatus(app, adminOk, "build-1", online);
  const srv = http.createServer(app);
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${(srv.address() as net.AddressInfo).port}/admin/ages.json`;
  try {
    assert.equal((await fetch(url)).status, 404);
    assert.equal((await fetch(`${url}?key=wrong-admin-key`)).status, 404);
    const r = await fetch(`${url}?key=${key}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const s = await r.json() as any;
    assert.equal(s.build, "build-1");
    assert.deepEqual(s.online, { players: 3, accounts: 2 });
  } finally { srv.close(); }
});

test("leases off (one server): owner of everything, no account leases", async () => {
  const { status, war, forge, world } = await mods();
  const kv = memKv();
  await war.startWar(kv); await forge.initForge(kv);
  world._setupWorld(memWorld(), new Leases(undefined, "main:b", true), { v: 1, tide: 0, marches: 0 });
  try {
    const s = status.agesStatus("b", online, { AGE_SLOT: "" });
    assert.equal(s.slot, "main");
    assert.equal(s.role, "primary");
    assert.equal(s.api.war, 1); assert.equal(s.api.forge, 1);
    assert.deepEqual(s.roles, { war: "owner", world: "owner", forge: "owner" });
    assert.deepEqual(s.leases, ["lease:war", "lease:world", "lease:forge"]);
    assert.equal(s.accounts.shared, false);
    assert.equal(s.accounts.claims, undefined);
    assert.equal(s.accounts.leasesHeld, 0);
    assert.deepEqual(s.flush, { dirty: 0, lagMs: 0, failures: 0 });
    assert.ok(s.uptimeS >= 0);
    assert.ok(!JSON.stringify(s).includes("password"));
  } finally { war.stopWar(); forge.stopForge(); }
});

test("leases on (memLeases): follower of the war, world and forge held elsewhere; account counters and flush lag", async () => {
  const { status, war, forge, world, acc } = await mods();
  const be = memLeases(), other = new Leases(be, "green:x", true).want("lease:war").want("lease:world");
  await other.renew();
  const env = { AGE_SLOT: "blue", AGE_ROLE: "vanguard", RAILWAY_DEPLOYMENT_ID: "dep-7" };
  const kv = memKv(be);
  await war.startWar(kv, new Leases(be, "blue:dep-7", true));
  await forge.initForge(kv, new Leases(be, "blue:dep-7", true));
  world._setupWorld(memWorld(), new Leases(be, "blue:dep-7", true), { v: 1, tide: 0, marches: 0 });
  await world._claimWorld();
  // Accounts: shared, this server is holder "blue:dep-7:acc"; "taken" is held by another server
  const db = memDb<any>(be);
  await acc.initAccounts({ store: db.store, leases: be, holder: "blue:dep-7:acc", retryMs: 1 });
  assert.equal(await acc.login("Hero", "heropass1", "1.2.3.4"), "Hero");
  assert.equal(await acc.claimAccount("Hero"), "fresh");
  assert.equal(await acc.claimAccount("Hero"), "playing");
  await be.acquire(["acct:taken"], "green:x:acc", 45_000);
  assert.equal(await acc.claimAccount("Taken"), "elsewhere");
  acc.saveHero("Hero", "wizard", { color: 1, xp: 5, level: 2 } as any);
  try {
    let s = status.agesStatus("dep-7", online, env);
    assert.equal(s.slot, "blue");
    assert.equal(s.role, "vanguard");
    assert.equal(s.holder, "blue:dep-7");
    assert.deepEqual(s.holders, { war: "blue:dep-7", world: "blue:dep-7", forge: "blue:dep-7", accounts: "blue:dep-7:acc" });
    assert.deepEqual(s.roles, { war: "follower", world: "follower", forge: "follower" });
    assert.deepEqual(s.leases, []);
    assert.equal(s.accounts.shared, true);
    assert.equal(s.accounts.leasesHeld, 1);
    assert.equal(s.accounts.inUse, 1);
    assert.deepEqual(s.accounts.claims, { ok: 1, elsewhere: 1, playing: 1, retries: 3, lost: 0 });
    assert.equal(s.accounts.fencedRefused, 0);
    assert.equal(s.flush.dirty, 1);
    assert.ok(s.flush.lagMs >= 0 && s.flush.lagMs < 5_000);
    // A failed write: still unsaved, counted; the lag keeps the oldest change's age
    db.fail = true;
    await new Promise((r) => setTimeout(r, 20));
    await acc.flush();
    s = status.agesStatus("dep-7", online, env);
    assert.equal(s.flush.failures, 1);
    assert.equal(s.flush.dirty, 1);
    assert.ok(s.flush.lagMs >= 20, `lag ${s.flush.lagMs}`);
    // Written: no lag. Another server takes the account: counted as lost, its write refused by the fence
    db.fail = false;
    await acc.flush();
    s = status.agesStatus("dep-7", online, env);
    assert.deepEqual([s.flush.dirty, s.flush.lagMs], [0, 0]);
    be.rows.set("acct:hero", { holder: "green:x:acc", until: Date.now() + 45_000 });
    await acc.renewAccounts();
    acc.saveHero("Hero", "wizard", { color: 1, xp: 6, level: 2 } as any);
    await acc.flush();
    s = status.agesStatus("dep-7", online, env);
    assert.equal(s.accounts.claims!.lost, 1);
    assert.equal(s.accounts.fencedRefused, 1);
  } finally { war.stopWar(); forge.stopForge(); }
});
