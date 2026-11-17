// Ages (roadmap M5) foundation: leases (server/lease.ts), the war save's version contract (shared/war/api.ts), and the
// war's owner / follower split (server/war.ts): one server ticks and writes, the others follow the save, and their
// heroes' valor reaches the owner through a queue. A newer save is never written over.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEASE, Leases, ageRole, buildId, holderId, memLeases, type LeaseBackend } from "../server/lease";
import { readable, WAR_API, warAccess } from "../shared/war/api";
import { CLAN_KEYS } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { newWar, targetsOf, WAR } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import {
  _pulse, _resetWar, _valorOf, addValor, flushWar, onWar, startWar, step, stopWar, strikeHold, warLog, warNow, warRole, warState, type SavedWar,
} from "../server/war";
import { openKv, type Kv } from "../server/store";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const saved = (next: number): SavedWar => ({ v: 1, state: newWar(), minds: newMinds(), next, log: [] });
/** A kv in memory with every optional part (insertIfAbsent, list) and a count of writes per key. */
function memKv(leases?: LeaseBackend) {
  const m = new Map<string, string>(), writes = new Map<string, number>();
  const kv: Kv = {
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)!) : undefined),
    set: async (k, v) => { m.set(k, JSON.stringify(v)); writes.set(k, (writes.get(k) ?? 0) + 1); },
    insertIfAbsent: async (k, v) => { if (m.has(k)) return false; await kv.set(k, v); return true; },
    list: async <T>(p: string) => Object.fromEntries([...m].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, JSON.parse(v) as T])),
    leases,
  };
  return { kv, m, writes };
}
const clock = (t = 1_000_000) => { const c = { t, now: () => c.t }; return c; };

// ---- Leases -------------------------------------------------------------------------------------------------------------

test("leases: one holder at a time; the other takes over only when it ran out; release hands it on at once", async () => {
  const c = clock(), be = memLeases(c.now);
  const a = new Leases(be, "main:a", true, c.now).want("lease:war"), b = new Leases(be, "main:b", true, c.now).want("lease:war");
  await a.renew(); await b.renew();
  assert.ok(a.held("lease:war")); assert.ok(!b.held("lease:war"), "taken: the second waits");
  c.t += LEASE.ttlMs - 1; await a.renew(); await b.renew();
  assert.ok(a.held("lease:war") && !b.held("lease:war"), "renewed in time: still a's");
  c.t += LEASE.ttlMs + 1; // a stopped renewing (crashed)
  assert.ok(!a.held("lease:war"), "a stops trusting its lease before the store lets it go");
  await b.renew();
  assert.ok(b.held("lease:war"), "ran out: b takes over");
  await a.renew();
  assert.ok(!a.held("lease:war"), "a cannot take it back");
  await b.release(); await a.renew();
  assert.ok(a.held("lease:war"), "released: a takes it at its next renewal");
});

test("leases: renewal is one call for every key; a holder trusts a lease only until skew before it runs out", async () => {
  const c = clock(), be = memLeases(c.now);
  let calls = 0;
  const counted: LeaseBackend = { acquire: (k, h, t) => { calls++; return be.acquire(k, h, t); }, release: be.release };
  const l = new Leases(counted, "x", true, c.now).want("lease:war").want("lease:world");
  await l.renew();
  assert.equal(calls, 1);
  assert.ok(l.held("lease:war") && l.held("lease:world"));
  assert.ok(!l.held("lease:other"), "a key never asked for is never held");
  c.t += LEASE.ttlMs - LEASE.skewMs;
  assert.ok(!l.held("lease:war"), "not trusted in the last skewMs");
  // a failing store keeps what was held until it runs out, no longer
  const broken = new Leases({ acquire: async () => { throw new Error("down"); }, release: async () => {} }, "y", true, c.now).want("k");
  await broken.renew();
  assert.ok(!broken.held("k"));
});

test("leases: without a shared store (JSON files) a primary always holds; a vanguard or draining Age never competes", async () => {
  const json = new Leases(undefined, "main:x", true).want("lease:war");
  await json.renew();
  assert.ok(json.held("lease:war"));
  const c = clock(), be = memLeases(c.now);
  for (const role of ["vanguard", "draining"]) {
    assert.equal(ageRole({ AGE_ROLE: role }), role);
    const v = new Leases(be, "next:x", ageRole({ AGE_ROLE: role }) === "primary", c.now).want("lease:war");
    await v.renew();
    assert.ok(!v.held("lease:war"), `${role} never holds`);
    assert.equal(be.rows.size, 0, `${role} never even asks`);
    assert.ok(!new Leases(undefined, "x", false).want("lease:war").held("lease:war"));
  }
  assert.equal(ageRole({}), "primary", "today's single server is primary");
  assert.equal(ageRole({ AGE_ROLE: "junk" }), "primary");
  assert.equal(holderId({ AGE_SLOT: "blue", RAILWAY_DEPLOYMENT_ID: "d1" }), "blue:d1");
  assert.equal(holderId({ RAILWAY_GIT_COMMIT_SHA: "abc" }), "main:abc");
});

test("json kv: insertIfAbsent writes only a new key, list reads a prefix (keys made file-safe), no leases", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ptb-ages-")), was = process.env.SAVE_FILE;
  process.env.SAVE_FILE = path.join(dir, "saves.json");
  try {
    const kv = await openKv("");
    assert.equal(kv.leases, undefined, "one process: leases always granted");
    assert.equal(await kv.insertIfAbsent!("war-pre-x", { n: 1 }), true);
    assert.equal(await kv.insertIfAbsent!("war-pre-x", { n: 2 }), false);
    assert.deepEqual(await kv.get("war-pre-x"), { n: 1 });
    await kv.set("war-valor:main:a", { holder: "main:a" }); await kv.set("war", { v: 1 });
    assert.deepEqual(Object.values(await kv.list!("war-valor:")), [{ holder: "main:a" }]);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["war-pre-x.json", "war-valor_main_a.json", "war.json"], "no temp files left");
  } finally {
    if (was === undefined) delete process.env.SAVE_FILE; else process.env.SAVE_FILE = was;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- The save's version contract --------------------------------------------------------------------------------------

test("war api: own and older versions are written, a newer one read only when minReader allows, junk is corrupt", () => {
  assert.equal(WAR_API, 1);
  assert.equal(warAccess({ v: 1 }), "write");
  assert.equal(warAccess({ v: 2 }), "hide", "a newer save that names no reader: hidden");
  assert.equal(warAccess({ v: 2, minReader: 1 }), "read");
  assert.equal(warAccess({ v: 3, minReader: 2 }), "hide");
  assert.equal(warAccess({ v: 2, minReader: "1" }), "hide", "a bad minReader counts as the save's own version");
  assert.equal(warAccess({ v: 3, minReader: 2 }, 2), "read");
  for (const junk of [undefined, null, 5, "war", {}, { v: 0 }, { v: 1.5 }, { v: "1" }, { v: -1 }]) assert.equal(warAccess(junk), "corrupt", JSON.stringify(junk));
  assert.ok(readable({ v: 1 }) && readable({ v: 2, minReader: 1 }) && !readable({ v: 2 }) && !readable({}));
});

// ---- The war: newer saves, corrupt saves ------------------------------------------------------------------------------

test("war: a save of a newer version that allows this build is shown read-only and never written over", async () => {
  const t0 = 10_000_000_000_000, { kv, m, writes } = memKv();
  const newer = { ...saved(t0), v: 2, minReader: 1, future: { x: 1 } } as unknown as SavedWar;
  newer.state.tick = 7;
  const raw = JSON.stringify(newer);
  m.set("war", raw);
  try {
    _resetWar(undefined); stopWar();
    await startWar(kv); stopWar();
    assert.equal(warRole(), "read");
    assert.equal(warNow()?.tick, 7, "the war is shown");
    await step(t0 + WAR.tickMs * 5); await _pulse(t0 + WAR.tickMs * 5);
    assert.equal(warNow()?.tick, 7, "never ticked");
    assert.equal(strikeHold(TERRITORIES.findIndex((t) => !t.capitalOf), "redfang", false), undefined, "no sacks either");
    flushWar();
    assert.equal(m.get("war"), raw, "the newer save is untouched");
    assert.equal(writes.get("war"), undefined);
    assert.ok(![...m.keys()].some((k) => k.startsWith("war-old-")), "not set aside as if it were corrupt");
  } finally { stopWar(); _resetWar(); }
});

test("war: a save of a newer version that does not allow this build hides the war, never starts a new one over it", async () => {
  const t0 = 10_000_000_000_000, { kv, m, writes } = memKv();
  const raw = JSON.stringify({ v: 2, totally: "different" });
  m.set("war", raw);
  try {
    _resetWar(undefined); stopWar();
    await startWar(kv); stopWar();
    assert.equal(warRole(), "hidden");
    assert.equal(warNow(), undefined, "hidden");
    assert.equal(addValor(0, "redfang", 5), false);
    await _pulse(t0); await step(t0);
    flushWar();
    assert.equal(m.get("war"), raw);
    assert.equal(writes.size, 0, "nothing written at all");
    // even as the holder of a shared lease: it gives the lease back so a newer primary may tick
    const c = clock(), be = memLeases(c.now), shared = memKv(be);
    shared.m.set("war", raw);
    _resetWar(undefined); stopWar();
    await startWar(shared.kv, new Leases(be, "main:old", true, c.now)); stopWar();
    assert.equal(warRole(), "hidden");
    assert.equal(be.rows.size, 0, "lease given back");
    await _pulse(c.t);
    assert.equal(be.rows.size, 0, "and not taken again");
    assert.equal(shared.m.get("war"), raw);
  } finally { stopWar(); _resetWar(); }
});

test("war: a corrupt save is still kept aside and a new war begins (as before the Ages)", async () => {
  for (const bad of [{ v: "1", state: {} }, { ...saved(1), minds: {} }]) {
    const { kv, m } = memKv();
    m.set("war", JSON.stringify(bad));
    try {
      _resetWar(undefined); stopWar();
      await startWar(kv); stopWar();
      assert.equal(warRole(), "owner");
      assert.equal(warNow()!.tick, 0, "a new war");
      const kept = [...m.keys()].filter((k) => k.startsWith("war-old-"));
      assert.equal(kept.length, 1);
      assert.deepEqual(JSON.parse(m.get(kept[0])!), bad);
    } finally { stopWar(); _resetWar(); }
  }
});

test("war: without a shared store (JSON files, today's server) this server owns the war at once", async () => {
  const { kv } = memKv(), t0 = 11_000_000_000_000;
  try {
    _resetWar(undefined); stopWar();
    await startWar(kv); stopWar();
    assert.equal(warRole(), "owner");
    _resetWar(saved(t0), kv);
    await step(t0);
    assert.equal(warNow()!.tick, 1);
  } finally { stopWar(); _resetWar(); }
});

// ---- Owner and followers -------------------------------------------------------------------------------------------------

/** Two saved rows of one war, one tick apart (written by this module as the owner). */
async function twoTicks(t0: number) {
  const { kv, m } = memKv();
  _resetWar(saved(t0), kv);
  await step(t0); const a = m.get("war")!;
  await step(t0 + WAR.tickMs); const b = m.get("war")!;
  return { a, b };
}

test("war follower: shows the owner's war, passes each tick on to its listeners, never ticks or writes the war", async () => {
  const t0 = 12_000_000_000_000, { a, b } = await twoTicks(t0);
  const c = clock(t0), be = memLeases(c.now), { kv, m, writes } = memKv(be);
  be.rows.set("lease:war", { holder: "main:owner", until: Infinity });
  m.set("war", a);
  try {
    _resetWar(undefined); stopWar();
    await startWar(kv, new Leases(be, "main:me", true, c.now)); stopWar();
    assert.equal(warRole(), "follower");
    assert.equal(warNow()!.tick, 1);
    const heard: { tick: number; n: number; events: unknown[] }[] = [];
    const off = onWar((v, events) => heard.push({ tick: v.tick, n: events.length, events }));
    c.t = t0 + WAR.tickMs * 3; // a tick is long due: a follower still does not tick
    await _pulse(c.t);
    assert.equal(heard.length, 0, "nothing new: nothing heard");
    assert.equal(warNow()!.tick, 1);
    m.set("war", b); // the owner ticked
    await _pulse(c.t);
    assert.equal(heard.length, 1);
    assert.equal(heard[0].tick, 2);
    const bl = (JSON.parse(b) as SavedWar).log, al = (JSON.parse(a) as SavedWar).log;
    assert.deepEqual(heard[0].events, bl.slice(al.length), "the tick's own events, once");
    assert.deepEqual(warLog(200), bl);
    await _pulse(c.t);
    assert.equal(heard.length, 1, "heard once");
    assert.equal(writes.get("war"), undefined, "never wrote the war");
    off();
  } finally { stopWar(); _resetWar(); }
});

test("war follower: its heroes' valor goes to its queue, and the owner counts it at its tick, once", async () => {
  const t0 = 13_000_000_000_000, c = clock(t0), be = memLeases(c.now), { kv, m } = memKv(be);
  be.rows.set("lease:war", { holder: "main:owner", until: Infinity });
  m.set("war", JSON.stringify(saved(t0)));
  const base = newWar(), k = CLAN_KEYS.find((x) => targetsOf(base, x).some((t) => !TERRITORIES[t].capitalOf))!;
  const t = targetsOf(base, k).find((x) => !TERRITORIES[x].capitalOf)!;
  try {
    _resetWar(undefined); stopWar();
    await startWar(kv, new Leases(be, "main:me", true, c.now)); stopWar();
    assert.equal(warRole(), "follower");
    for (let i = 0; i < 30; i++) assert.ok(addValor(t, k, 50, "Hero"));
    assert.equal(addValor(-1, k, 5), false, "bad input still refused");
    assert.equal(_valorOf(t, k), 0, "not counted here");
    await _pulse(c.t);
    const q = JSON.parse(m.get("war-valor:main:me")!);
    assert.equal(q.holder, "main:me"); assert.equal(q.seq, 1); assert.equal(q.batches[0].adds.length, 30);

    // the owner (this module again, as the owner of the same store) counts the queue at its tick, like valor added here
    const own = (): SavedWar => JSON.parse(JSON.stringify(saved(t0)));
    _resetWar(own()); await step(t0); const none = JSON.parse(JSON.stringify(warState()));
    _resetWar(own()); for (let i = 0; i < 30; i++) addValor(t, k, 50, "Hero");
    await step(t0); const direct = JSON.parse(JSON.stringify(warState()));
    await step(t0 + WAR.tickMs); const direct2 = JSON.parse(JSON.stringify(warState()));
    _resetWar(own(), kv);
    await step(t0);
    assert.notDeepEqual(direct, none, "(the valor matters to this tick)");
    assert.deepEqual(warState(), direct, "the queued valor counted as if earned here");
    assert.deepEqual(JSON.parse(m.get("war")!).drained, { "main:me": 1 });
    await step(t0 + WAR.tickMs);
    assert.deepEqual(warState(), direct2, "counted once, not again at the next tick");
  } finally { stopWar(); _resetWar(); }
});

test("war follower: drops the batches the owner counted; takes the war over (snapshot first) when the owner's lease runs out", async () => {
  const t0 = 14_000_000_000_000, c = clock(t0), be = memLeases(c.now), { kv, m, writes } = memKv(be);
  be.rows.set("lease:war", { holder: "main:owner", until: t0 + LEASE.ttlMs });
  const row = { ...saved(t0 + WAR.tickMs), drained: { "main:me": 1 } };
  m.set("war", JSON.stringify(row));
  m.set("war-valor:main:me", JSON.stringify({ holder: "main:me", seq: 1, batches: [{ seq: 1, adds: [[0, "redfang", 5]] }] }));
  try {
    _resetWar(undefined); stopWar();
    await startWar(kv, new Leases(be, "main:me", true, c.now)); stopWar();
    assert.equal(warRole(), "follower");
    await _pulse(c.t);
    assert.deepEqual(JSON.parse(m.get("war-valor:main:me")!).batches, [], "counted batches dropped");
    addValor(0, "redfang", 5);
    c.t = t0 + LEASE.ttlMs + 1; // the owner went away without giving the lease back
    await _pulse(c.t);
    assert.equal(warRole(), "owner");
    assert.equal(be.rows.get("lease:war")!.holder, "main:me");
    const pre = `war-pre-${buildId().replace(/[^a-z0-9_-]/gi, "_")}`;
    assert.deepEqual(JSON.parse(m.get(pre)!), row, "the war as the last owner left it, kept before this build writes");
    assert.equal(_valorOf(0, "redfang"), 5, "valor still unwritten is counted at once");
    c.t = t0 + WAR.tickMs + 1;
    await _pulse(c.t);
    assert.equal(warNow()!.tick, 1, "ticks now");
    assert.ok((writes.get("war") ?? 0) >= 1);
    // a second takeover by the same build keeps the first snapshot
    const snap = m.get(pre);
    stopWar(); _resetWar(undefined); stopWar();
    await startWar(kv, new Leases(be, "main:me", true, c.now)); stopWar();
    assert.equal(m.get(pre), snap);
  } finally { stopWar(); _resetWar(); }
});

test("war owner: losing the lease stops every write, the server follows instead; shutdown gives the lease back", async () => {
  const t0 = 15_000_000_000_000, c = clock(t0), be = memLeases(c.now), { kv, m, writes } = memKv(be);
  m.set("war", JSON.stringify(saved(t0)));
  try {
    _resetWar(undefined); stopWar();
    await startWar(kv, new Leases(be, "main:me", true, c.now)); stopWar();
    assert.equal(warRole(), "owner");
    c.t = t0 + 1; await _pulse(c.t);
    assert.equal(warNow()!.tick, 1);
    const n = writes.get("war");
    be.rows.set("lease:war", { holder: "main:other", until: Infinity }); // (another server holds it now)
    c.t = t0 + WAR.tickMs + 1; await _pulse(c.t);
    assert.equal(warRole(), "follower");
    assert.equal(writes.get("war"), n, "no more writes");
    // shutdown of an owner: the war written once more, then the lease released
    be.rows.delete("lease:war");
    await _pulse(c.t);
    assert.equal(warRole(), "owner");
    flushWar();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(be.rows.has("lease:war"), false, "lease given back");
    assert.ok(writes.get("war")! > n!, "written at shutdown");
    assert.notEqual(warRole(), "owner");
  } finally { stopWar(); _resetWar(); }
});

// ---- Shutdown during a beat; the lease back after an outage ---------------------------------------------------------------

/** A lease backend that can be cut off (a database outage). */
function flaky(be: LeaseBackend) {
  const f = { down: false, be: { acquire: (k, h, t) => (f.down ? Promise.reject(new Error("down")) : be.acquire(k, h, t)), release: (k, h) => be.release(k, h) } as LeaseBackend };
  return f;
}
/** A promise and its resolver (to hold a store call half way). */
const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };

test("war shutdown: a tick under way when flushWar runs neither ticks nor saves; the last write and the release are awaited", async () => {
  const t0 = 16_000_000_000_000, c = clock(t0), be = memLeases(c.now), { kv, m, writes } = memKv(be);
  m.set("war", JSON.stringify(saved(t0)));
  try {
    _resetWar(undefined); stopWar();
    await startWar(kv, new Leases(be, "main:me", true, c.now)); stopWar();
    assert.equal(warRole(), "owner");
    const g = gate(), list = kv.list!;
    kv.list = async (p) => { await g.p; return list(p); }; // (the tick waits on the valor queues)
    const beat = _pulse(t0 + 1);
    await new Promise((r) => setTimeout(r, 5));
    const n = writes.get("war") ?? 0;
    const done = flushWar();
    assert.ok(done instanceof Promise);
    g.open();
    await beat; await done;
    assert.equal(warNow()!.tick, 0, "the tick under way stopped");
    assert.equal(JSON.parse(m.get("war")!).state.tick, 0);
    assert.equal(writes.get("war"), n + 1, "only the shutdown's own write");
    assert.equal(be.rows.has("lease:war"), false, "released once the write landed");
    await _pulse(t0 + 2);
    assert.equal(warNow()!.tick, 0, "no beat after the shutdown");
  } finally { stopWar(); _resetWar(); }
});

test("war shutdown: a takeover under way when flushWar runs never makes this server the owner", async () => {
  const t0 = 17_000_000_000_000, c = clock(t0), be = memLeases(c.now), { kv, m, writes } = memKv(be);
  be.rows.set("lease:war", { holder: "main:owner", until: t0 + LEASE.ttlMs });
  m.set("war", JSON.stringify(saved(t0 + WAR.tickMs)));
  try {
    _resetWar(undefined); stopWar();
    await startWar(kv, new Leases(be, "main:me", true, c.now)); stopWar();
    assert.equal(warRole(), "follower");
    addValor(0, "redfang", 5);
    c.t = t0 + LEASE.ttlMs + 1; // the owner is gone: the next beat takes over...
    const g = gate(), get = kv.get;
    kv.get = (async (k: string) => { if (k === "war") await g.p; return get(k); }) as Kv["get"];
    const beat = _pulse(c.t);
    await new Promise((r) => setTimeout(r, 5));
    const done = flushWar(); // ...but the server shuts down meanwhile
    g.open();
    await beat; await done;
    assert.notEqual(warRole(), "owner");
    assert.equal(writes.get("war"), undefined, "never wrote the war");
    assert.ok(![...m.keys()].some((k) => k.startsWith("war-pre-")), "no snapshot either");
    assert.equal(be.rows.has("lease:war"), false, "the lease it had just taken is given back");
    assert.equal(JSON.parse(m.get("war-valor:main:me")!).batches[0].adds.length, 1, "its last valor written for the next owner");
  } finally { stopWar(); _resetWar(); }
});

test("war: losing the lease to a database outage and getting it back keeps unsaved progress; another writer's war is reloaded", async () => {
  const t0 = 18_000_000_000_000, c = clock(t0), f = flaky(memLeases(c.now)), { kv, m } = memKv(f.be);
  m.set("war", JSON.stringify(saved(t0)));
  try {
    _resetWar(undefined); stopWar();
    await startWar(kv, new Leases(f.be, "main:me", true, c.now)); stopWar();
    c.t = t0 + 1; await _pulse(c.t);
    assert.equal(warNow()!.tick, 1);
    warState()!.army.redfang = 12345; // progress not written yet
    f.down = true; c.t += LEASE.ttlMs; await _pulse(c.t);
    assert.equal(warRole(), "follower", "lost while the database was out");
    assert.equal(warState()!.army.redfang, 12345, "following its own last write keeps its own war");
    f.down = false; await _pulse(c.t);
    assert.equal(warRole(), "owner");
    assert.equal(warState()!.army.redfang, 12345, "nobody wrote meanwhile: unsaved progress kept");
    // now another server writes while this one is out: its war is taken on regaining the lease
    f.down = true; c.t += LEASE.ttlMs; await _pulse(c.t);
    const theirs = JSON.parse(m.get("war")!) as SavedWar;
    theirs.state.army.redfang = 777; theirs.wrote = "someone-else";
    m.set("war", JSON.stringify(theirs));
    f.down = false; await _pulse(c.t);
    assert.equal(warRole(), "owner");
    assert.equal(warState()!.army.redfang, 777, "another writer's war reloaded");
  } finally { stopWar(); _resetWar(); }
});

test("world: regaining the lease after an outage keeps unsaved progress; after another server wrote, its world is reloaded", async () => {
  const { _setupWorld, _claimWorld, flushWorld, world, worldChanged } = await import("../server/worldStore");
  const rows = new Map<string, any>();
  const store = { kind: "postgres" as const, load: async () => Object.fromEntries(rows), loadOne: async (k: string) => rows.get(k), save: async (ch: Record<string, any>) => { for (const [k, v] of Object.entries(ch)) rows.set(k, structuredClone(v)); } };
  const c = clock(), f = flaky(memLeases(c.now)), l = new Leases(f.be, "main:me", true, c.now);
  await l.want("lease:world").renew();
  _setupWorld(store, l, { v: 1, tide: 5, marches: 0 });
  worldChanged(); await flushWorld();
  assert.equal(rows.get("world").tide, 5);
  assert.equal(typeof rows.get("world").wrote, "string", "each write is stamped");
  world().tide = 9; worldChanged(); // not written yet
  f.down = true; c.t += LEASE.ttlMs; await _claimWorld();
  await flushWorld();
  assert.equal(rows.get("world").tide, 5, "no writes without the lease");
  f.down = false; await _claimWorld();
  assert.equal(world().tide, 9, "nobody wrote meanwhile: unsaved progress kept");
  await flushWorld();
  assert.equal(rows.get("world").tide, 9, "and written once the lease is back");
  f.down = true; c.t += LEASE.ttlMs; await _claimWorld();
  rows.set("world", { v: 1, tide: 40, marches: 2, wrote: "someone-else" });
  world().tide = 11; worldChanged();
  f.down = false; await _claimWorld();
  assert.equal(world().tide, 40, "another server wrote: its world is reloaded");
  assert.equal(world().marches, 2);
  await flushWorld();
  assert.equal(rows.get("world").tide, 40, "the dropped progress is not written over it");
});

test("leases: a ttl not longer than the skew is refused (it could never be trusted)", () => {
  assert.throws(() => new Leases(undefined, "x", true, Date.now, LEASE.skewMs), /longer than skewMs/);
  assert.doesNotThrow(() => new Leases(undefined, "x", true, Date.now, LEASE.skewMs + 1));
});
